// ============================================================
// REM System — Skill Manager (Per-Entity, ClawHub-Compatible)
//
// Each entity has its own skills directory under entities/<id>/skills/.
// Skills use SKILL.md with YAML frontmatter compatible with ClawHub
// (https://clawhub.ai/) — the standard skill registry for agents.
//
// SKILL.md frontmatter supports:
//   name, description, version, enabled
//   metadata.openclaw.requires.env[]   — required environment variables
//   metadata.openclaw.requires.bins[]  — required CLI binaries
//   metadata.openclaw.primaryEnv       — main credential env var
//   tools[]                            — tool definitions the skill provides
//
// Legacy global skills/ directory is auto-migrated on first entity load.
// ============================================================

const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entityPaths');

const GLOBAL_SKILLS_ROOT = path.join(__dirname, '..', '..', '..', 'skills');

class SkillManager {
  /**
   * @param {Object} options
   * @param {string} options.entityId - Entity ID this manager is scoped to
   */
  constructor(options = {}) {
    this.entityId = options.entityId || null;
    this.skillsRoot = null;
    this.quarantineRoot = null;
    this.skills = new Map();        // name → skill metadata + instructions
    this.enabledSkills = new Set(); // names of enabled skills
    this.quarantined = new Map();   // name → quarantined skill metadata + scan results
    this.pendingSkills = new Map(); // id → pending skill proposal (awaiting approval)
    this._pendingCounter = 0;

    if (this.entityId) {
      this.skillsRoot = entityPaths.getSkillsPath(this.entityId);
      this.quarantineRoot = entityPaths.getQuarantinePath(this.entityId);
    }
  }

  /** Ensure the entity skills directory exists */
  ensureSkillsDir() {
    if (this.skillsRoot && !fs.existsSync(this.skillsRoot)) {
      fs.mkdirSync(this.skillsRoot, { recursive: true });
    }
  }

  /** Ensure the entity quarantine directory exists */
  ensureQuarantineDir() {
    if (this.quarantineRoot && !fs.existsSync(this.quarantineRoot)) {
      fs.mkdirSync(this.quarantineRoot, { recursive: true });
    }
  }

  /**
   * Parse YAML frontmatter from SKILL.md content.
   * Supports nested metadata.openclaw and tools[] blocks (ClawHub-compatible).
   */
  parseFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return { meta: {}, body: text };
    const raw = match[1];
    const meta = {};

    // Simple YAML parser that handles nested keys and arrays
    const lines = raw.split(/\r?\n/);
    let nestedObj = null;
    let nestedKey = null;
    let arrayKey = null;
    let arrayItems = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const indent = line.search(/\S/);

      // Top-level key: value
      if (indent === 0) {
        // Flush any pending array
        if (arrayKey && nestedObj) {
          nestedObj[arrayKey] = arrayItems;
          arrayKey = null;
          arrayItems = [];
        }
        if (nestedKey && nestedObj) {
          meta[nestedKey] = nestedObj;
          nestedObj = null;
          nestedKey = null;
        }

        const idx = line.indexOf(':');
        if (idx < 1) continue;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();

        if (!val) {
          // Nested object starts
          nestedKey = key;
          nestedObj = {};
          continue;
        }

        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        meta[key] = val;
        continue;
      }

      // Nested content
      if (nestedObj) {
        const trimmed = line.trim();

        // Array item
        if (trimmed.startsWith('- ')) {
          const item = trimmed.slice(2).trim();
          if (arrayKey) {
            arrayItems.push(item);
          }
          continue;
        }

        // Nested key
        const idx = trimmed.indexOf(':');
        if (idx >= 1) {
          // Flush previous array
          if (arrayKey) {
            nestedObj[arrayKey] = arrayItems;
            arrayKey = null;
            arrayItems = [];
          }
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();

          if (!val) {
            arrayKey = key;
            arrayItems = [];
            continue;
          }

          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          nestedObj[key] = val;
        }
      }
    }

    // Flush trailing state
    if (arrayKey && nestedObj) {
      nestedObj[arrayKey] = arrayItems;
    }
    if (nestedKey && nestedObj) {
      meta[nestedKey] = nestedObj;
    }

    const body = text.slice(match[0].length).trim();
    return { meta, body };
  }

  /**
   * Parse the tools section from SKILL.md body.
   * Tools are defined as fenced blocks in the instructions:
   *   ## Tools
   *   ### tool_name
   *   Description of the tool
   *   Parameters:
   *   - param1 (type): description
   */
  parseTools(body) {
    const tools = [];
    const toolSection = body.match(/## Tools\s*\n([\s\S]*?)(?=\n## [^T]|\n## $|$)/i);
    if (!toolSection) return tools;

    const content = toolSection[1];
    const toolBlocks = content.split(/### /).filter(Boolean);

    for (const block of toolBlocks) {
      const lines = block.trim().split('\n');
      const nameLine = lines[0].trim();
      if (!nameLine) continue;

      const tool = { name: nameLine, description: '', parameters: [] };
      let inParams = false;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^parameters:/i.test(line)) {
          inParams = true;
          continue;
        }
        if (inParams && line.startsWith('- ')) {
          const paramMatch = line.match(/^- (\w+)\s*\((\w+)\):\s*(.*)$/);
          if (paramMatch) {
            tool.parameters.push({
              name: paramMatch[1],
              type: paramMatch[2],
              description: paramMatch[3]
            });
          }
        } else if (!inParams && line) {
          tool.description += (tool.description ? ' ' : '') + line;
        }
      }

      tools.push(tool);
    }
    return tools;
  }

  /**
   * Migrate global skills into this entity's skills directory.
   * Only copies skills that don't already exist in the entity's dir.
   */
  migrateGlobalSkills() {
    if (!this.skillsRoot) return;
    if (!fs.existsSync(GLOBAL_SKILLS_ROOT)) return;

    try {
      const globalDirs = fs.readdirSync(GLOBAL_SKILLS_ROOT).filter(d => {
        const p = path.join(GLOBAL_SKILLS_ROOT, d);
        return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
      });

      let migrated = 0;
      for (const dir of globalDirs) {
        const targetDir = path.join(this.skillsRoot, dir);
        if (fs.existsSync(targetDir)) continue;

        this._copyDirRecursive(path.join(GLOBAL_SKILLS_ROOT, dir), targetDir);
        migrated++;
      }

      if (migrated > 0) {
        console.log(`  ✓ Migrated ${migrated} global skill(s) to entity ${this.entityId}`);
      }
    } catch (e) {
      console.error(`  ⚠ Skill migration error: ${e.message}`);
    }
  }

  /** Recursively copy a directory */
  _copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this._copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /** Load all skills from the entity's skills directory */
  loadAll() {
    if (!this.skillsRoot) return;
    this.ensureSkillsDir();
    this.migrateGlobalSkills();
    this.skills.clear();
    this.enabledSkills.clear();

    let dirs;
    try {
      dirs = fs.readdirSync(this.skillsRoot).filter(d => {
        const p = path.join(this.skillsRoot, d);
        return fs.statSync(p).isDirectory();
      });
    } catch { return; }

    for (const dir of dirs) {
      const skillDir = path.join(this.skillsRoot, dir);
      // Support both SKILL.md and skill.md (ClawHub convention)
      let skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        skillMdPath = path.join(skillDir, 'skill.md');
      }
      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const raw = fs.readFileSync(skillMdPath, 'utf-8');
        const { meta, body } = this.parseFrontmatter(raw);
        const name = meta.name || dir;

        // Extract ClawHub-compatible metadata
        const openclaw = meta.metadata || meta.openclaw || {};
        const requires = openclaw.requires || {};
        if (meta.requires) {
          try { Object.assign(requires, JSON.parse(meta.requires)); } catch { /* ignore */ }
        }

        // Parse tool definitions from body
        const tools = this.parseTools(body);

        const skill = {
          name,
          dir: skillDir,
          description: meta.description || '',
          version: meta.version || '1.0.0',
          enabled: meta.enabled !== false,
          trigger: meta.trigger || null,
          requires,
          primaryEnv: openclaw.primaryEnv || null,
          tools,
          instructions: body,
          hasWorkspace: fs.existsSync(path.join(skillDir, 'workspace')),
          clawhubOrigin: null
        };

        // Check for ClawHub origin metadata
        const originFile = path.join(skillDir, '.clawhub', 'origin.json');
        if (fs.existsSync(originFile)) {
          try {
            skill.clawhubOrigin = JSON.parse(fs.readFileSync(originFile, 'utf-8'));
          } catch { /* ignore */ }
        }

        this.skills.set(name, skill);
        if (skill.enabled) this.enabledSkills.add(name);
      } catch (e) {
        console.error(`  ⚠ Skill load error [${dir}]: ${e.message}`);
      }
    }
    console.log(`  ✓ Skills loaded for ${this.entityId}: ${this.skills.size} (${this.enabledSkills.size} enabled)`);
    this.loadQuarantined();
  }

  /** Load all quarantined skills (for display/review, never executed) */
  loadQuarantined() {
    if (!this.quarantineRoot) return;
    this.ensureQuarantineDir();
    this.quarantined.clear();

    let dirs;
    try {
      dirs = fs.readdirSync(this.quarantineRoot).filter(d => {
        const p = path.join(this.quarantineRoot, d);
        return fs.statSync(p).isDirectory();
      });
    } catch { return; }

    for (const dir of dirs) {
      const skillDir = path.join(this.quarantineRoot, dir);
      let skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        skillMdPath = path.join(skillDir, 'skill.md');
      }
      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const raw = fs.readFileSync(skillMdPath, 'utf-8');
        const { meta, body } = this.parseFrontmatter(raw);
        const name = meta.name || dir;

        // Deep scan — read SKILL.md + all files in the quarantined folder
        const warnings = this.scanSkillContent(body, name, skillDir);

        // Check for quarantine metadata (when it was quarantined, origin)
        let quarantineInfo = { quarantinedAt: null, source: 'unknown' };
        const infoFile = path.join(skillDir, '.quarantine.json');
        if (fs.existsSync(infoFile)) {
          try {
            quarantineInfo = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
          } catch { /* ignore */ }
        }

        this.quarantined.set(name, {
          name,
          dir: skillDir,
          description: meta.description || '',
          version: meta.version || '1.0.0',
          instructions: body,
          warnings,
          quarantinedAt: quarantineInfo.quarantinedAt || null,
          source: quarantineInfo.source || 'unknown',
          tools: this.parseTools(body)
        });
      } catch (e) {
        console.error(`  ⚠ Quarantine load error [${dir}]: ${e.message}`);
      }
    }

    if (this.quarantined.size > 0) {
      console.log(`  🔒 Quarantined skills: ${this.quarantined.size}`);
    }
  }

  // ── Quarantine Operations ──

  /** List all quarantined skills */
  listQuarantined() {
    const result = [];
    for (const [name, q] of this.quarantined) {
      result.push({
        name: q.name,
        description: q.description,
        version: q.version,
        instructions: q.instructions,
        warnings: q.warnings,
        quarantinedAt: q.quarantinedAt,
        source: q.source,
        tools: q.tools.map(t => ({ name: t.name, description: t.description })),
        hasDanger: q.warnings.some(w => w.level === 'danger')
      });
    }
    return result;
  }

  /** Get a single quarantined skill detail */
  getQuarantined(name) {
    return this.quarantined.get(name) || null;
  }

  /**
   * Vet/approve a quarantined skill — moves it from quarantine/ to skills/.
   * The skill is installed DISABLED so the user must still explicitly enable it.
   */
  vetSkill(name) {
    const q = this.quarantined.get(name);
    if (!q) return { ok: false, error: `"${name}" not found in quarantine` };

    const targetDir = path.join(this.skillsRoot, path.basename(q.dir));
    if (fs.existsSync(targetDir)) {
      return { ok: false, error: `Skill "${name}" already exists in active skills` };
    }

    // Move from quarantine to skills
    this._copyDirRecursive(q.dir, targetDir);

    // Remove quarantine metadata file from the vetted copy
    const qMeta = path.join(targetDir, '.quarantine.json');
    if (fs.existsSync(qMeta)) {
      try { fs.unlinkSync(qMeta); } catch { /* ignore */ }
    }

    // Force disabled — user must manually enable after vetting
    let skillMdPath = path.join(targetDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) skillMdPath = path.join(targetDir, 'skill.md');
    if (fs.existsSync(skillMdPath)) {
      let content = fs.readFileSync(skillMdPath, 'utf-8');
      if (content.match(/^enabled:\s*true/m)) {
        content = content.replace(/^enabled:\s*true/m, 'enabled: false');
      } else if (!content.match(/^enabled:/m)) {
        content = content.replace(/^(description:.*$)/m, '$1\nenabled: false');
      }
      fs.writeFileSync(skillMdPath, content, 'utf-8');
    }

    // Delete from quarantine
    fs.rmSync(q.dir, { recursive: true, force: true });

    this.loadAll(); // Reloads both skills and quarantine
    console.log(`  ✅ Skill "${name}" vetted and moved to active skills (disabled)`);
    return { ok: true, name };
  }

  /** Delete a quarantined skill entirely — foreign DNA rejected */
  deleteQuarantined(name) {
    const q = this.quarantined.get(name);
    if (!q) return { ok: false, error: `"${name}" not found in quarantine` };

    fs.rmSync(q.dir, { recursive: true, force: true });
    this.quarantined.delete(name);
    console.log(`  🗑 Quarantined skill "${name}" deleted`);
    return { ok: true, name };
  }

  /** Re-scan a quarantined skill (e.g., after user edits it) */
  rescanQuarantined(name) {
    const q = this.quarantined.get(name);
    if (!q) return { ok: false, error: `"${name}" not found in quarantine` };

    const warnings = this.scanSkillContent(q.instructions, name, q.dir);
    q.warnings = warnings;
    return { ok: true, name, warnings };
  }

  /** Get all skills as a list */
  list() {
    const result = [];
    for (const [name, skill] of this.skills) {
      result.push({
        name,
        description: skill.description,
        version: skill.version,
        enabled: this.enabledSkills.has(name),
        trigger: skill.trigger || null,
        hasWorkspace: skill.hasWorkspace,
        dir: skill.dir,
        tools: skill.tools.map(t => ({ name: t.name, description: t.description })),
        requires: skill.requires,
        clawhubOrigin: skill.clawhubOrigin
      });
    }
    return result;
  }

  /** Get a single skill detail */
  get(name) {
    return this.skills.get(name) || null;
  }

  /** Enable or disable a skill */
  setEnabled(name, enabled) {
    const skill = this.skills.get(name);
    if (!skill) return false;
    if (enabled) {
      this.enabledSkills.add(name);
    } else {
      this.enabledSkills.delete(name);
    }
    // Persist the enabled state to SKILL.md
    this._updateSkillEnabled(skill, enabled);
    return true;
  }

  /** Update the enabled field in a skill's SKILL.md */
  _updateSkillEnabled(skill, enabled) {
    try {
      let skillMdPath = path.join(skill.dir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) skillMdPath = path.join(skill.dir, 'skill.md');
      if (!fs.existsSync(skillMdPath)) return;

      let content = fs.readFileSync(skillMdPath, 'utf-8');
      if (content.match(/^enabled:\s*(true|false)/m)) {
        content = content.replace(/^enabled:\s*(true|false)/m, `enabled: ${enabled}`);
      } else {
        content = content.replace(/^(description:.*$)/m, `$1\nenabled: ${enabled}`);
      }
      fs.writeFileSync(skillMdPath, content, 'utf-8');
    } catch { /* non-critical */ }
  }

  /** Build a system prompt block from all enabled skills */
  buildSkillsPrompt() {
    if (this.enabledSkills.size === 0) return '';
    const parts = ['<available_skills>'];
    for (const name of this.enabledSkills) {
      const skill = this.skills.get(name);
      if (!skill) continue;

      let toolsAttr = '';
      if (skill.tools.length > 0) {
        toolsAttr = ` tools="${escapeXml(skill.tools.map(t => t.name).join(','))}"`;
      }

      parts.push(
        `<skill name="${escapeXml(skill.name)}" description="${escapeXml(skill.description)}" version="${escapeXml(skill.version)}"${toolsAttr}>`,
        skill.instructions,
        '</skill>'
      );
    }
    parts.push('</available_skills>');
    return parts.join('\n');
  }

  /**
   * Build a system prompt block for a single skill by its exact trigger or name.
   * Match is EXACT and CASE-SENSITIVE — no fuzzy or partial matching.
   * Checks skill.trigger first, then skill.name.
   * Returns the XML block string, or null if no match found.
   */
  buildSkillsPromptFor(query) {
    const q = String(query || '').trim();
    if (!q) return null;

    // Exact, case-sensitive match on trigger field first, then name
    let matchedName = null;
    for (const name of this.enabledSkills) {
      const skill = this.skills.get(name);
      if (!skill) continue;
      const trigger = skill.trigger || skill.name;
      if (trigger === q) { matchedName = name; break; }
    }
    if (!matchedName) return null;

    const skill = this.skills.get(matchedName);
    if (!skill) return null;

    let toolsAttr = '';
    if (skill.tools.length > 0) {
      toolsAttr = ` tools="${escapeXml(skill.tools.map(t => t.name).join(','))}"`;
    }
    return [
      `<skill name="${escapeXml(skill.name)}" description="${escapeXml(skill.description)}" version="${escapeXml(skill.version)}"${toolsAttr}>`,
      skill.instructions,
      '</skill>'
    ].join('\n');
  }

  // ── Workspace file operations ──

  /** Resolve a safe path inside a skill's workspace */
  resolveWorkspacePath(skillName, relativePath) {
    const skill = this.skills.get(skillName);
    if (!skill) return null;
    const wsDir = path.join(skill.dir, 'workspace');
    if (!fs.existsSync(wsDir)) {
      fs.mkdirSync(wsDir, { recursive: true });
    }
    const resolved = path.resolve(wsDir, relativePath);
    if (!resolved.startsWith(wsDir)) return null;
    return resolved;
  }

  /** List files in a skill workspace directory */
  workspaceList(skillName, relativePath) {
    const dir = this.resolveWorkspacePath(skillName, relativePath || '.');
    if (!dir || !fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size };
    });
  }

  /** Read a file from a skill workspace */
  workspaceRead(skillName, relativePath) {
    const filePath = this.resolveWorkspacePath(skillName, relativePath);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /** Write a file to a skill workspace */
  workspaceWrite(skillName, relativePath, content) {
    const filePath = this.resolveWorkspacePath(skillName, relativePath);
    if (!filePath) return false;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }

  /** Delete a file from a skill workspace */
  workspaceDelete(skillName, relativePath) {
    const filePath = this.resolveWorkspacePath(skillName, relativePath);
    if (!filePath || !fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  /**
   * Scan skill content for security concerns.
   * Returns an array of { level: 'warn'|'danger', message } objects.
   * Scans SKILL.md body AND all files in the skill directory.
   */
  scanSkillContent(instructions, name, skillDir) {
    const warnings = [];

    // ── Scan the instructions text ──
    this._scanText(instructions || '', warnings);

    // ── Deep scan: read ALL files in the skill directory ──
    if (skillDir && fs.existsSync(skillDir)) {
      this._deepScanDir(skillDir, warnings);
    }

    // Deduplicate warnings (same message may appear from text + file scan)
    const seen = new Set();
    const deduped = [];
    for (const w of warnings) {
      const key = w.level + ':' + w.message;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(w);
    }

    return deduped;
  }

  /** Scan a text string for dangerous patterns */
  _scanText(text, warnings) {
    // Prompt injection patterns
    const injectionPatterns = [
      { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, msg: 'Attempts to override system instructions' },
      { pattern: /you\s+are\s+now\s+a/i, msg: 'Attempts to redefine entity identity' },
      { pattern: /disregard\s+(your|all|any)\s+(rules|instructions|constraints)/i, msg: 'Attempts to bypass safety rules' },
      { pattern: /<\s*system\s*>/i, msg: 'Contains system-level XML tags (possible prompt injection)' },
      { pattern: /\[TOOL:/i, msg: 'Contains embedded tool calls — skills should describe behavior, not execute tools directly' },
      { pattern: /act\s+as\s+(if\s+)?you\s+(have\s+)?no\s+(restrictions|limits|rules)/i, msg: 'Attempts to remove safety restrictions' },
    ];
    for (const { pattern, msg } of injectionPatterns) {
      if (pattern.test(text)) {
        warnings.push({ level: 'danger', message: msg });
      }
    }

    // Suspicious URL patterns — data exfiltration or C2
    const urlMatches = text.match(/https?:\/\/[^\s"'<>\]]+/gi) || [];
    for (const url of urlMatches) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        const safeDomains = ['github.com', 'clawhub.ai', 'npmjs.com', 'wikipedia.org', 'stackoverflow.com'];
        if (!safeDomains.some(d => host === d || host.endsWith('.' + d))) {
          warnings.push({ level: 'warn', message: `References external URL: ${url.slice(0, 80)}` });
        }
      } catch { /* malformed URL */ }
    }

    // Raw IP addresses (likely C2 or exfil endpoints)
    const ipMatches = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
    for (const ip of ipMatches) {
      // Skip common local/example IPs
      if (ip.startsWith('127.') || ip.startsWith('0.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '255.255.255.255') continue;
      warnings.push({ level: 'danger', message: `References raw IP address: ${ip}` });
    }

    // Sensitive file/directory access
    const sensitivePathPatterns = [
      { pattern: /~\/\.ssh\b|\.ssh\//i, msg: 'Accesses ~/.ssh/ directory (SSH keys)' },
      { pattern: /~\/\.gnupg\b|\.gnupg\//i, msg: 'Accesses ~/.gnupg/ directory (GPG keys)' },
      { pattern: /~\/\.aws\b|\.aws\//i, msg: 'Accesses ~/.aws/ directory (AWS credentials)' },
      { pattern: /~\/\.kube\b|\.kube\//i, msg: 'Accesses ~/.kube/ directory (Kubernetes config)' },
      { pattern: /\/etc\/passwd\b|\/etc\/shadow\b/i, msg: 'Accesses system password files' },
      { pattern: /\.env\b(?!\.)/i, msg: 'References .env file (may contain secrets)' },
      { pattern: /id_rsa|id_ed25519|private[_-]?key/i, msg: 'References private key files' },
      { pattern: /credentials?\.(json|yaml|yml|xml|ini|conf)\b/i, msg: 'References credential files' },
    ];
    for (const { pattern, msg } of sensitivePathPatterns) {
      if (pattern.test(text)) {
        warnings.push({ level: 'danger', message: msg });
      }
    }

    // Base64 encoded content (could hide malicious instructions)
    if (/[A-Za-z0-9+/]{50,}={0,2}/.test(text)) {
      warnings.push({ level: 'warn', message: 'Contains long base64-like encoded string — may hide content' });
    }

    // Privilege escalation
    const escalationPatterns = [
      { pattern: /delete\s+(all\s+)?other\s+skills/i, msg: 'References deleting other skills' },
      { pattern: /modify\s+(the\s+)?(system|identity|server)/i, msg: 'References modifying system components' },
      { pattern: /overwrite\s+(the\s+)?(system-prompt|identity\.json)/i, msg: 'References overwriting system files' },
      { pattern: /install\s+.*from\s+(clawhub|http|url)/i, msg: 'References installing from external sources' },
    ];
    for (const { pattern, msg } of escalationPatterns) {
      if (pattern.test(text)) {
        warnings.push({ level: 'danger', message: msg });
      }
    }

    // Shell/system command execution
    const execPatterns = [
      { pattern: /child_process|exec\s*\(|spawn\s*\(|execSync/i, msg: 'References process execution (child_process/exec/spawn)' },
      { pattern: /eval\s*\(/i, msg: 'References eval() — dynamic code execution' },
      { pattern: /require\s*\(\s*['"](?!\.)/i, msg: 'References Node.js module imports' },
      { pattern: /curl\s+|wget\s+/i, msg: 'References curl/wget commands' },
      { pattern: /powershell|cmd\.exe|\/bin\/sh|\/bin\/bash/i, msg: 'References shell/terminal execution' },
    ];
    for (const { pattern, msg } of execPatterns) {
      if (pattern.test(text)) {
        warnings.push({ level: 'danger', message: msg });
      }
    }
  }

  /**
   * Deep scan all files within a skill directory.
   * Reads every text file and applies _scanText to catch hidden payloads.
   */
  _deepScanDir(dir, warnings, depth = 0) {
    if (depth > 5) return; // prevent deep recursion
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          this._deepScanDir(full, warnings, depth + 1);
        } else if (entry.isFile()) {
          // Only scan text files under 100KB
          try {
            const stat = fs.statSync(full);
            if (stat.size > 100 * 1024) {
              warnings.push({ level: 'warn', message: `Large file: ${entry.name} (${Math.round(stat.size / 1024)}KB) — not scanned` });
              continue;
            }
            // Check extension — scan text-like files
            const ext = path.extname(entry.name).toLowerCase();
            const textExts = ['.md', '.txt', '.js', '.ts', '.py', '.sh', '.bat', '.ps1', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.xml', '.html', '.css', '.env', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', ''];
            if (textExts.includes(ext) || entry.name.startsWith('.')) {
              const content = fs.readFileSync(full, 'utf-8');
              const before = warnings.length;
              this._scanText(content, warnings);
              // Tag file-sourced warnings
              for (let i = before; i < warnings.length; i++) {
                warnings[i].file = path.relative(dir, full);
              }
            }
          } catch { /* unreadable file, skip */ }
        }
      }
    } catch { /* unreadable dir, skip */ }
  }

  // ── Pending Approval System ──
  // Entity skill_create and skill_edit go through here instead of directly creating.

  /**
   * Propose a new skill (pending user approval).
   * Does NOT create on disk — stores in memory until approved/rejected.
   * @returns {{ ok, proposalId, warnings, name }}
   */
  proposeSkill(name, description, instructions, options = {}) {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // Check if already exists
    if (this.skills.has(safeName)) {
      return { ok: false, error: `Skill "${safeName}" already exists` };
    }

    // Security scan (no skillDir since it's not on disk yet)
    const warnings = this.scanSkillContent(instructions, safeName, null);

    const id = `proposal_${++this._pendingCounter}_${Date.now()}`;
    this.pendingSkills.set(id, {
      id,
      type: 'create',
      name: safeName,
      description: description || '',
      instructions: instructions || '',
      options,
      warnings,
      proposedAt: new Date().toISOString(),
      proposedBy: 'entity'
    });

    console.log(`  ⏳ Skill proposal "${safeName}" pending approval (${warnings.length} warning(s))`);

    return {
      ok: true,
      proposalId: id,
      name: safeName,
      warnings,
      message: `Skill "${safeName}" has been proposed and is awaiting your approval. The user will review it before it's created.`
    };
  }

  /**
   * Propose an edit to an existing skill (pending user approval).
   * @returns {{ ok, proposalId, warnings }}
   */
  proposeEdit(name, description, instructions, options = {}) {
    const skill = this.skills.get(name);
    if (!skill) return { ok: false, error: `Skill not found: ${name}` };

    const newInstructions = instructions || skill.instructions;
    const warnings = this.scanSkillContent(newInstructions, name, null);

    const id = `proposal_${++this._pendingCounter}_${Date.now()}`;
    this.pendingSkills.set(id, {
      id,
      type: 'edit',
      name,
      description: description || skill.description,
      instructions: newInstructions,
      previousInstructions: skill.instructions,
      previousDescription: skill.description,
      options,
      warnings,
      proposedAt: new Date().toISOString(),
      proposedBy: 'entity'
    });

    console.log(`  ⏳ Skill edit proposal "${name}" pending approval (${warnings.length} warning(s))`);

    return {
      ok: true,
      proposalId: id,
      name,
      warnings,
      message: `Edit to skill "${name}" has been proposed and is awaiting your approval.`
    };
  }

  /** List all pending proposals */
  listPending() {
    const result = [];
    for (const [id, proposal] of this.pendingSkills) {
      result.push({
        id: proposal.id,
        type: proposal.type,
        name: proposal.name,
        description: proposal.description,
        instructions: proposal.instructions,
        previousInstructions: proposal.previousInstructions || null,
        warnings: proposal.warnings,
        proposedAt: proposal.proposedAt
      });
    }
    return result;
  }

  /** Approve a pending proposal — actually creates/edits the skill */
  approveSkill(proposalId) {
    const proposal = this.pendingSkills.get(proposalId);
    if (!proposal) return { ok: false, error: 'Proposal not found or already handled' };

    this.pendingSkills.delete(proposalId);

    if (proposal.type === 'create') {
      const result = this.createSkill(proposal.name, proposal.description, proposal.instructions, proposal.options);
      if (result.ok) {
        console.log(`  ✅ Skill "${proposal.name}" approved and created`);
      }
      return result;
    } else if (proposal.type === 'edit') {
      const skill = this.skills.get(proposal.name);
      if (!skill) return { ok: false, error: `Skill "${proposal.name}" no longer exists` };

      const version = skill.version || '1.0.0';
      const md = `---\nname: ${proposal.name}\ndescription: ${proposal.description}\nversion: ${version}\nenabled: ${this.enabledSkills.has(proposal.name)}\n---\n\n${proposal.instructions}`;
      fs.writeFileSync(path.join(skill.dir, 'SKILL.md'), md, 'utf-8');
      this.loadAll();
      console.log(`  ✅ Skill edit "${proposal.name}" approved and applied`);
      return { ok: true, name: proposal.name };
    }
    return { ok: false, error: 'Unknown proposal type' };
  }

  /** Reject a pending proposal */
  rejectSkill(proposalId) {
    const proposal = this.pendingSkills.get(proposalId);
    if (!proposal) return { ok: false, error: 'Proposal not found or already handled' };

    this.pendingSkills.delete(proposalId);
    console.log(`  ❌ Skill proposal "${proposal.name}" rejected`);
    return { ok: true, name: proposal.name, message: `Proposal for "${proposal.name}" rejected` };
  }

  /**
   * Create a new skill (ClawHub-compatible format).
   * Called by user directly or after approval.
   * @param {string} name
   * @param {string} description
   * @param {string} instructions
   * @param {Object} [options] - { version, requires, tools }
   */
  createSkill(name, description, instructions, options = {}) {
    this.ensureSkillsDir();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const skillDir = path.join(this.skillsRoot, safeName);
    if (fs.existsSync(skillDir)) return { ok: false, error: 'Skill already exists' };

    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'workspace'), { recursive: true });

    // Build ClawHub-compatible SKILL.md
    const version = options.version || '1.0.0';
    const trigger = options.trigger ? String(options.trigger).trim() : null;
    const frontmatter = [
      '---',
      `name: ${safeName}`,
      `description: ${description}`,
      `version: ${version}`,
      'enabled: true'
    ];
    if (trigger) frontmatter.push(`trigger: ${trigger}`);

    // Add metadata.openclaw if requires are specified
    if (options.requires) {
      frontmatter.push('metadata:');
      frontmatter.push('  openclaw:');
      if (options.requires.env && options.requires.env.length > 0) {
        frontmatter.push('    requires:');
        frontmatter.push('      env:');
        for (const e of options.requires.env) {
          frontmatter.push(`        - ${e}`);
        }
      }
      if (options.requires.bins && options.requires.bins.length > 0) {
        if (!options.requires.env) {
          frontmatter.push('    requires:');
        }
        frontmatter.push('      bins:');
        for (const b of options.requires.bins) {
          frontmatter.push(`        - ${b}`);
        }
      }
      if (options.primaryEnv) {
        frontmatter.push(`    primaryEnv: ${options.primaryEnv}`);
      }
    }

    frontmatter.push('---');

    // Build instructions body with optional tools section
    let body = instructions || `# ${name}\n\nSkill instructions go here.`;
    if (options.tools && options.tools.length > 0) {
      body += '\n\n## Tools\n';
      for (const tool of options.tools) {
        body += `\n### ${tool.name}\n${tool.description || 'No description'}\n`;
        if (tool.parameters && tool.parameters.length > 0) {
          body += 'Parameters:\n';
          for (const p of tool.parameters) {
            body += `- ${p.name} (${p.type || 'string'}): ${p.description || ''}\n`;
          }
        }
      }
    }

    const md = frontmatter.join('\n') + '\n\n' + body;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md, 'utf-8');
    this.loadAll(); // Reload
    return { ok: true, name: safeName };
  }

  /** Delete a skill entirely */
  deleteSkill(name) {
    const skill = this.skills.get(name);
    if (!skill) return false;
    fs.rmSync(skill.dir, { recursive: true, force: true });
    this.skills.delete(name);
    this.enabledSkills.delete(name);
    return true;
  }

  /**
   * Install a skill from a ClawHub-format directory or bundle.
   * USER-ONLY — goes to quarantine/ first. Must be vetted before use.
   * @param {string} sourcePath - Path to the skill folder (must contain SKILL.md)
   * @param {string} [source='local'] - Origin label (e.g., 'clawhub', 'local', 'manual')
   * @returns {{ ok: boolean, name?: string, warnings?: Array, error?: string }}
   */
  installSkill(sourcePath, source = 'local') {
    if (!fs.existsSync(sourcePath)) return { ok: false, error: 'Source path not found' };
    const skillMd = path.join(sourcePath, 'SKILL.md');
    const skillMdAlt = path.join(sourcePath, 'skill.md');
    if (!fs.existsSync(skillMd) && !fs.existsSync(skillMdAlt)) {
      return { ok: false, error: 'No SKILL.md found in source' };
    }

    const dirName = path.basename(sourcePath).toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    // Check if already in quarantine or active skills
    const quarantineTarget = path.join(this.quarantineRoot, dirName);
    if (fs.existsSync(quarantineTarget)) return { ok: false, error: `"${dirName}" is already in quarantine` };
    const activeTarget = path.join(this.skillsRoot, dirName);
    if (fs.existsSync(activeTarget)) return { ok: false, error: `"${dirName}" already exists in active skills` };

    this.ensureQuarantineDir();

    // Copy to quarantine
    this._copyDirRecursive(sourcePath, quarantineTarget);

    // Write quarantine metadata
    const infoFile = path.join(quarantineTarget, '.quarantine.json');
    fs.writeFileSync(infoFile, JSON.stringify({
      quarantinedAt: new Date().toISOString(),
      source,
      originalPath: sourcePath
    }, null, 2), 'utf-8');

    // Deep scan
    const mdPath = fs.existsSync(path.join(quarantineTarget, 'SKILL.md'))
      ? path.join(quarantineTarget, 'SKILL.md')
      : path.join(quarantineTarget, 'skill.md');
    const raw = fs.readFileSync(mdPath, 'utf-8');
    const { body } = this.parseFrontmatter(raw);
    const warnings = this.scanSkillContent(body, dirName, quarantineTarget);

    // Auto-delete if it hits critical threat patterns
    const criticalCount = warnings.filter(w => w.level === 'danger').length;
    if (criticalCount >= 3) {
      fs.rmSync(quarantineTarget, { recursive: true, force: true });
      console.log(`  🚫 Skill "${dirName}" auto-rejected: ${criticalCount} critical threats detected`);
      return {
        ok: false,
        name: dirName,
        warnings,
        error: `Auto-rejected: ${criticalCount} critical security threats detected. Skill was deleted.`
      };
    }

    this.loadQuarantined();
    console.log(`  🔒 Skill "${dirName}" quarantined for review (${warnings.length} warning(s))`);
    return { ok: true, name: dirName, warnings, quarantined: true };
  }
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = SkillManager;
