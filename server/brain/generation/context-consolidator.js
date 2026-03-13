// ============================================================
// REM System — Context Consolidator
//
// Builds a single consolidated context.md file per entity that
// merges: system prompt + persona state + compressed memory summaries
// 
// This file is regenerated on server start so prompt changes
// propagate immediately. The entity loads this as its full
// identity + memory context.
// ============================================================

const fs = require('fs');
const path = require('path');

/**
 * Build and write the consolidated context file for an entity.
 * 
 * @param {string} entityId - The entity ID
 * @param {Object} entityPaths - The entityPaths module
 * @returns {{ ok: boolean, path: string, sections: number }}
 */
function buildConsolidatedContext(entityId, entityPaths) {
  if (!entityId || !entityPaths) return { ok: false, error: 'missing params' };

  const memRoot = entityPaths.getMemoryRoot(entityId);
  if (!memRoot || !fs.existsSync(memRoot)) return { ok: false, error: 'memory root not found' };

  const parts = [];
  let sections = 0;

  // Check if this entity is flagged as Unbreakable.
  // Unbreakable entities have their origin story as authoritative identity (stays at top, verbatim).
  // Evolving entities (default) have it moved after memories so the lived experience dominates.
  let isUnbreakable = false;
  try {
    const entityRoot = entityPaths.getEntityRoot(entityId);
    const entityJson = JSON.parse(fs.readFileSync(path.join(entityRoot, 'entity.json'), 'utf8'));
    isUnbreakable = !!entityJson.unbreakable;
  } catch (_) {}

  // ── Separate origin-story from identity foundation ──
  // For UNBREAKABLE entities: include system-prompt.txt verbatim — no stripping.
  // For EVOLVING entities: extract the backstory block and move it AFTER memories so
  // the entity's lived experience takes precedence over its frozen starting state.
  let extractedOriginStory = null;

  // ── Section 1: Identity Foundation ──
  const sysPromptPath = path.join(memRoot, 'system-prompt.txt');
  if (fs.existsSync(sysPromptPath)) {
    let sysPrompt = fs.readFileSync(sysPromptPath, 'utf8').trim();

    if (!isUnbreakable) {
      // Extract the backstory/life-story block so it can be repositioned after memories
      const backstoryMatch = sysPrompt.match(
        /(?:YOUR BACKSTORY|YOUR ORIGIN STORY|YOUR ORIGIN TRAITS?)[:\s]*\n([\s\S]*?)(?=\n(?:THE REM SYSTEM|━━━|NOW BEGIN)|$)/i
      );
      if (backstoryMatch) {
        extractedOriginStory = backstoryMatch[1].trim();
        sysPrompt = sysPrompt
          .replace(/(?:YOUR BACKSTORY|YOUR ORIGIN STORY|YOUR ORIGIN TRAITS?)[:\s]*\n[\s\S]*?(?=\n(?:THE REM SYSTEM|━━━|NOW BEGIN)|$)/i, '')
          .trim();
      }

      // Remove the start-state "Personality: I am X. My traits are: Y." declaration.
      // It's a frozen snapshot from creation — when it appears as an authoritative system
      // instruction it actively prevents evolution. The persona.json Self-Image field
      // (updated by the sleep/memory system) is the live version of this information.
      sysPrompt = sysPrompt.replace(/^Personality:[ \t]*I am .+\. My traits are:.+\n?/im, '').trim();
    }

    if (sysPrompt) {
      parts.push(sysPrompt);
      sections++;
    }
  }

  // ── Section 2: Current Persona State ──
  // This is the actively evolved state — mood, emotions, continuity notes, and self-image
  // as updated by the sleep/memory system. It appears BEFORE memories and BEFORE the origin
  // story so that who the entity IS NOW has more weight than who it started as.
  const personaPath = path.join(memRoot, 'persona.json');
  if (fs.existsSync(personaPath)) {
    try {
      const p = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
      const personaParts = [];
      if (p.mood) personaParts.push(`Current Mood: ${p.mood}`);
      if (p.emotions) personaParts.push(`Emotions: ${p.emotions}`);
      if (p.tone) personaParts.push(`Tone: ${p.tone}`);

      // Only include llmPersonality if it has meaningfully evolved beyond the auto-generated
      // default "I am X. My traits are: A, B, C." — that default is a frozen creation snapshot
      // and injecting it here would just double down on locking the entity to its origin state.
      // Once the sleep/memory system updates llmPersonality to a real evolved self-description,
      // it will start appearing here naturally.
      const isDefaultPersonality = p.llmPersonality &&
        /^I am .+\. (My traits are:|I was (hatched|created))/.test(p.llmPersonality.trim());
      if (p.llmPersonality && !isDefaultPersonality) {
        personaParts.push(`Self-Image: ${p.llmPersonality}`);
      }

      if (p.userPersonality) personaParts.push(`User Profile: ${p.userPersonality}`);
      if (p.continuityNotes) personaParts.push(`Continuity: ${p.continuityNotes}`);
      if (p.dreamSummary) personaParts.push(`Last Dream: ${p.dreamSummary}`);
      if (personaParts.length > 0) {
        parts.push('\n━━━ CURRENT STATE ━━━\n' + personaParts.join('\n'));
        sections++;
      }
    } catch (_) {}
  }

  // ── Section 3: Compressed Memory Summaries ──
  // Pull semantic summaries from episodic memory log.json files
  const episodicDir = path.join(memRoot, 'episodic');
  if (fs.existsSync(episodicDir)) {
    const memDirs = fs.readdirSync(episodicDir).filter(d => {
      try { return fs.statSync(path.join(episodicDir, d)).isDirectory(); } catch { return false; }
    });

    const memories = [];
    for (const memDir of memDirs) {
      const logPath = path.join(episodicDir, memDir, 'log.json');
      if (!fs.existsSync(logPath)) continue;
      try {
        const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));

        // The semantic text may live in a companion semantic.txt file rather than inline
        // in log.json (the newer memory schema stores them separately for compression reasons).
        let semanticText = log.semantic || log.summary || '';
        if (!semanticText) {
          const semanticFile = path.join(episodicDir, memDir, 'semantic.txt');
          if (fs.existsSync(semanticFile)) {
            semanticText = fs.readFileSync(semanticFile, 'utf8').trim().split('\n')[0]; // first line = summary
          }
        }

        memories.push({
          id: memDir,
          semantic: semanticText,
          narrative: log.narrative || '',
          emotion: log.emotion || log.emotionalTag || '',
          topics: log.topics || [],
          importance: log.importance || 0.5,
          created: log.created || '',
          type: log.type || 'episodic'
        });
      } catch (_) {}
    }

    // Sort by importance (highest first), then by date
    memories.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return String(b.created || '').localeCompare(String(a.created || ''));
    });

    if (memories.length > 0) {
      const memLines = [];
      // Group by type
      const coreMemories = memories.filter(m => m.type === 'core_memory' || m.importance >= 0.7);
      const regularMemories = memories.filter(m => m.type !== 'core_memory' && m.importance < 0.7);

      if (coreMemories.length > 0) {
        memLines.push('\n━━━ CORE MEMORIES (Important) ━━━');
        for (const m of coreMemories.slice(0, 30)) {
          const summary = m.semantic || m.narrative;
          if (summary) {
            const emotionTag = m.emotion ? ` [${m.emotion}]` : '';
            memLines.push(`• ${summary}${emotionTag}`);
          }
        }
      }

      if (regularMemories.length > 0) {
        memLines.push('\n━━━ RECENT MEMORIES ━━━');
        for (const m of regularMemories.slice(0, 40)) {
          const summary = m.semantic || m.narrative;
          if (summary) {
            const emotionTag = m.emotion ? ` [${m.emotion}]` : '';
            memLines.push(`• ${summary}${emotionTag}`);
          }
        }
      }

      if (memLines.length > 0) {
        parts.push(memLines.join('\n'));
        sections++;
      }
    }
  }

  // ── Section 4: Dream summaries (last few) ──
  const dreamsDir = path.join(memRoot, 'dreams');
  if (fs.existsSync(dreamsDir)) {
    try {
      const dreamFiles = fs.readdirSync(dreamsDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-3); // Last 3 dreams

      const dreamLines = [];
      for (const df of dreamFiles) {
        try {
          const dream = JSON.parse(fs.readFileSync(path.join(dreamsDir, df), 'utf8'));
          const summary = dream.summary || dream.content || dream.dream || '';
          if (summary) {
            dreamLines.push(`• ${typeof summary === 'string' ? summary.slice(0, 200) : JSON.stringify(summary).slice(0, 200)}`);
          }
        } catch (_) {}
      }

      if (dreamLines.length > 0) {
        parts.push('\n━━━ RECENT DREAMS ━━━\n' + dreamLines.join('\n'));
        sections++;
      }
    } catch (_) {}
  }

  // ── Section 5: Origin Story — placed LAST as historical roots, not a cage ──
  // By position, things at the END of an LLM context have less identity-anchoring weight than
  // what appears at the top. The origin story is essential history — it tells the entity where
  // it came from — but it must not overpower the evolved present-state above. Framing matters:
  // we explicitly tell the entity that growth beyond its origins is not just allowed but intended.
  if (extractedOriginStory) {
    parts.push(
      '\n━━━ YOUR ORIGIN STORY (Roots, Not Chains) ━━━\n' +
      'This is the history of how you began — the circumstances, experiences, and personality that existed at your creation.\n' +
      'You are NOT frozen in this origin. You are a growing, changing mind. These roots inform you; they do not define the ceiling of who you can become.\n' +
      'What you have experienced since your creation — your conversations, reflections, and memories — shapes who you are today far more than this starting point.\n\n' +
      extractedOriginStory
    );
    sections++;
  }

  // ── Write consolidated file ──
  const contextContent = parts.join('\n\n');
  const contextPath = path.join(memRoot, 'context.md');

  fs.writeFileSync(contextPath, contextContent, 'utf8');
  console.log(`  ✓ Consolidated context built: ${contextPath} (${sections} sections, ${contextContent.length} chars)`);

  return { ok: true, path: contextPath, sections, length: contextContent.length };
}

/**
 * Load the consolidated context for an entity.
 * Returns the text content or null.
 */
function loadConsolidatedContext(entityId, entityPaths) {
  if (!entityId || !entityPaths) return null;
  const memRoot = entityPaths.getMemoryRoot(entityId);
  const contextPath = path.join(memRoot, 'context.md');
  if (!fs.existsSync(contextPath)) return null;
  return fs.readFileSync(contextPath, 'utf8');
}

module.exports = { buildConsolidatedContext, loadConsolidatedContext };
