const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'Config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ma-config.json');
const LEGACY_CONFIG_FILE = path.join(__dirname, '..', '..', 'ma-config.json');

// Current config schema version. Increment when a breaking structural change is made.
const CURRENT_CONFIG_VERSION = 1;

// Migration functions keyed by the version they produce.
// Each function receives the previous config and returns the updated config.
// The configVersion field is stamped automatically by _runMigrations after each step.
const CONFIG_MIGRATIONS = {
  1: (cfg) => {
    // v0 → v1: first versioned schema.
    // No structural changes needed — existing configs are already valid v1 shape.
    // configVersion field will be stamped by the migration runner.
    return cfg;
  },
};

const TOKEN_LIMIT_DEFAULTS = {
  // ── SUBCONSCIOUS ──────────────────────────────────────────────────────────
  subconsciousReflect:    { value: 1200, label: '(Subconscious) Reflection',        desc: 'Tokens for the Subconscious reflecting on activated memories and emotional context per message. Low values truncate memory detail and hurt response quality.' },

  // ── CONSCIOUS ─────────────────────────────────────────────────────────────
  consciousResponse:      { value: 600,  label: '(Conscious) Reasoning Notes',      desc: 'Tokens for the Conscious mind producing structured reasoning notes (INTENT/MEMORY/EMOTION/ANGLE) for the Orchestrator. Tool/skill turns may use more.' },

  // ── DREAM ─────────────────────────────────────────────────────────────────
  orchestratorDream:      { value: 800,  label: '(Dream) Intuition',                desc: 'Tokens for the Dream/creative aspect generating lateral associations and intuition during orchestration.' },
  dreamEngine:            { value: 2200, label: '(Dream) Engine (Sleep)',            desc: 'Tokens for the dream engine generating dream sequences during sleep cycles.' },
  dreamAgentLoop:         { value: 1400, label: '(Dream) Agent Loop (Sleep)',        desc: 'Tokens for the dream agent running inside the brain-loop sleep phase.' },

  // ── ORCHESTRATOR ──────────────────────────────────────────────────────────
  orchestratorRefinement: { value: 800,  label: '(Orchestrator) Refinement (2B)',   desc: 'Tokens for the 2B refinement pass — distilling constraints, emotional cues, and conflicts from all three aspects before final synthesis.' },
  orchestratorFinal:      { value: 1200, label: '(Orchestrator) Final Synthesis',   desc: 'Tokens for the final Orchestrator synthesis pass — this IS the response the user sees. Low values cut off replies mid-thought.' },
  orchestratorSummary:    { value: 1000, label: '(Orchestrator) Chatlog Decode',    desc: 'Tokens for reconstructing V4-compressed chatlogs inside the Orchestrator memory context pass.' },

  // ── BACKGROUND (Brain Loop / Post-Response) ───────────────────────────────
  memoryEncoding:         { value: 1200, label: '(Background) Memory Encoding',     desc: 'Tokens for encoding each conversation into episodic/semantic memory after a response. Too low causes truncated JSON.' },
  beliefExtraction:       { value: 600,  label: '(Background) Belief Extraction',   desc: 'Tokens for extracting beliefs from memories during brain-loop cycles.' },
  relationshipUpdate:     { value: 1200, label: '(Background) Relationship Update', desc: 'Tokens for updating the entity\'s feelings, trust, and beliefs about the active user after each turn.' },
  boredomAction:          { value: 1500, label: '(Background) Boredom Action',      desc: 'Tokens for the boredom-engine creative action when the entity has been idle too long.' },
  bootstrapAwakening:     { value: 2000, label: '(Background) Awakening',           desc: 'Tokens for the entity awakening narrative generated at startup.' },
  chatlogReconstruct:     { value: 2000, label: '(Background) Chatlog Reconstruct', desc: 'Tokens for reconstructing compressed chatlogs via the memory route.' },

  // ── ENTITY CREATION ───────────────────────────────────────────────────────
  entityLifeStory:        { value: 2000, label: '(Creation) Life Story',            desc: 'Tokens for generating an entity life story during guided creation.' },
  entityMemoryExtract:    { value: 3000, label: '(Creation) Memory Extraction',     desc: 'Tokens for extracting core memories from a life story.' },
  entityIntro:            { value: 300,  label: '(Creation) Introduction',          desc: 'Tokens for generating an entity\'s in-character introduction.' },
  sourceBlueprint:        { value: 3500, label: '(Creation) Source Blueprint',      desc: 'Tokens for the source-entity character blueprint extraction.' },
  sourceMemories:         { value: 5000, label: '(Creation) Source Memories',       desc: 'Tokens for generating source-entity memories from the blueprint.' },
  sourceVoice:            { value: 2000, label: '(Creation) Source Voice',          desc: 'Tokens for generating the source-entity voice and personality profile.' },
};

const IMAGE_GENERATION_DEFAULTS = {
  enabled: false,
  backend: 'custom',
  endpoint: '',
  apiKey: '',
  model: '',
  size: '1024x1024'
};

const DEFAULT_GLOBAL_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  lastActive: 'default-multi-llm',
  profiles: {
    'default-multi-llm': {}
  },
  imageGeneration: IMAGE_GENERATION_DEFAULTS
};

class ConfigService {
  constructor() {
    this._defaultMaxTokens = 16000;
    this._tokenLimits = {};
    this._ensureConfigDir();
    this._migrateLegacyIfNeeded();
    this.refreshMaxTokensCache();
    this.refreshTokenLimitsCache();
  }

  _makeDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_GLOBAL_CONFIG));
  }

  _ensureConfigDir() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        console.log(`  \u2713 Created config directory: ${CONFIG_DIR}`);
      }
    } catch (e) {
      console.error('  \u26A0 Could not create config directory:', e.message);
    }
  }

  _migrateLegacyIfNeeded() {
    try {
      if (fs.existsSync(CONFIG_FILE)) return;
      if (!fs.existsSync(LEGACY_CONFIG_FILE)) return;
      this._ensureConfigDir();
      fs.copyFileSync(LEGACY_CONFIG_FILE, CONFIG_FILE);
      console.log(`  \u2713 Migrated legacy config to ${CONFIG_FILE}`);
    } catch (e) {
      console.error('  \u26A0 Could not migrate legacy global config:', e.message);
    }
  }

  load() {
    try {
      this._ensureConfigDir();
      this._migrateLegacyIfNeeded();
      if (!fs.existsSync(CONFIG_FILE)) {
        const defaults = this._makeDefaultConfig();
        this.save(defaults);
      }

      let data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Config root must be a JSON object');
      }
      console.log(`  \u2713 Config loaded from ${CONFIG_FILE}`);
      const preMigrateVersion = data.configVersion || 0;
      data = this._runMigrations(data);
      if (data.configVersion !== preMigrateVersion) {
        // Auto-save after migration so the stamped version persists
        this.save(data);
      }
      const beforeDefaultsJson = JSON.stringify(data);
      this._applyDefaults(data);
      if (JSON.stringify(data) !== beforeDefaultsJson) {
        this.save(data);
      }
      this.validateGlobalConfig(data);
      return data;
    } catch (e) {
      console.error('  \u26A0 Could not read config:', e.message);
      try {
        const backupPath = `${CONFIG_FILE}.corrupt-${Date.now()}`;
        if (fs.existsSync(CONFIG_FILE)) {
          fs.copyFileSync(CONFIG_FILE, backupPath);
          console.error(`  \u26A0 Backed up unreadable config to ${backupPath}`);
        }
        const defaults = this._makeDefaultConfig();
        this.save(defaults);
        return defaults;
      } catch (repairErr) {
        console.error('  \u26A0 Could not repair config:', repairErr.message);
        return this._makeDefaultConfig();
      }
    }
  }

  _applyDefaults(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    if (!cfg.profiles || typeof cfg.profiles !== 'object' || Array.isArray(cfg.profiles)) {
      cfg.profiles = {};
    }
    if (!cfg.lastActive || typeof cfg.lastActive !== 'string') {
      cfg.lastActive = 'default-multi-llm';
    }
    if (!cfg.profiles[cfg.lastActive]) {
      cfg.profiles[cfg.lastActive] = {};
    }
    if (!cfg.imageGeneration || typeof cfg.imageGeneration !== 'object') {
      cfg.imageGeneration = Object.assign({}, IMAGE_GENERATION_DEFAULTS);
    } else {
      cfg.imageGeneration = Object.assign({}, IMAGE_GENERATION_DEFAULTS, cfg.imageGeneration);
    }
    return cfg;
  }

  /**
   * Run incremental config migrations from the current version to CURRENT_CONFIG_VERSION.
   * Returns the (possibly updated) config object with configVersion stamped.
   */
  _runMigrations(cfg) {
    const fromVersion = cfg.configVersion || 0;
    if (fromVersion >= CURRENT_CONFIG_VERSION) return cfg;
    let current = Object.assign({}, cfg);
    for (let v = fromVersion + 1; v <= CURRENT_CONFIG_VERSION; v++) {
      if (CONFIG_MIGRATIONS[v]) {
        try {
          current = CONFIG_MIGRATIONS[v](current);
          console.log(`  \u2713 Config migrated to version ${v}`);
        } catch (e) {
          console.error(`  \u26A0 Config migration to v${v} failed:`, e.message);
        }
      }
      current.configVersion = v;
    }
    return current;
  }

  /**
   * Validate the global config object. Logs warnings for any structural problems.
   * Does not throw — always returns an array of warning strings.
   */
  validateGlobalConfig(cfg) {
    const warnings = [];
    if (!cfg || typeof cfg !== 'object') {
      warnings.push('Config is not an object');
      return this._emitWarnings(warnings);
    }
    if (!cfg.profiles || typeof cfg.profiles !== 'object' || Object.keys(cfg.profiles).length === 0) {
      warnings.push('Config has no profiles defined');
    }
    if (cfg.lastActive && cfg.profiles && !cfg.profiles[cfg.lastActive]) {
      warnings.push(`lastActive "${cfg.lastActive}" does not match any profile`);
    }
    if (cfg.imageGeneration && typeof cfg.imageGeneration === 'object') {
      if (typeof cfg.imageGeneration.enabled !== 'boolean') {
        warnings.push('imageGeneration.enabled should be a boolean');
      }
      if (cfg.imageGeneration.enabled && !cfg.imageGeneration.endpoint) {
        warnings.push('imageGeneration is enabled but imageGeneration.endpoint is empty');
      }
    }
    if (cfg.profiles && typeof cfg.profiles === 'object') {
      for (const [name, profile] of Object.entries(cfg.profiles)) {
        const profileWarnings = this.validateProfileConfig(profile, name);
        warnings.push(...profileWarnings);
      }
    }
    return this._emitWarnings(warnings);
  }

  /**
   * Validate a single profile config object. Logs warnings for missing required fields.
   * Does not throw — always returns an array of warning strings.
   */
  validateProfileConfig(profile, profileName = 'unknown') {
    const warnings = [];
    const prefix = `Profile "${profileName}"`;
    if (!profile || typeof profile !== 'object') {
      warnings.push(`${prefix}: is not an object`);
      return warnings;
    }
    const hasApiKey = profile.apikey && typeof profile.apikey === 'object';
    const hasOllama = profile.ollama && typeof profile.ollama === 'object';
    const aspects = ['main', 'subconscious', 'dream', 'orchestrator'];
    const hasAnyAspect = aspects.some(a => profile[a] && typeof profile[a] === 'object');
    if (!hasApiKey && !hasOllama && !hasAnyAspect) {
      warnings.push(`${prefix}: has no recognizable provider config (apikey, ollama, or aspect configs)`);
    }
    if (hasApiKey) {
      if (!profile.apikey.endpoint) warnings.push(`${prefix}: apikey.endpoint is missing`);
      if (!profile.apikey.model)    warnings.push(`${prefix}: apikey.model is missing`);
    }
    if (hasOllama) {
      if (!profile.ollama.url)   warnings.push(`${prefix}: ollama.url is missing`);
      if (!profile.ollama.model) warnings.push(`${prefix}: ollama.model is missing`);
    }
    return warnings;
  }

  _emitWarnings(warnings) {
    for (const w of warnings) {
      console.warn(`  \u26A0 Config validation: ${w}`);
    }
    return warnings;
  }

  save(data) {
    try {
      this._ensureConfigDir();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
      console.log(`  \u2713 Config saved to ${CONFIG_FILE} (profiles: ${Object.keys(data.profiles || {}).length})`);
    } catch (e) {
      console.error('  \u26A0 Could not save config:', e.message);
    }
  }

  refreshMaxTokensCache() {
    try {
      const cfg = this.load();
      if (Number.isFinite(cfg.maxTokens) && cfg.maxTokens > 0) {
        this._defaultMaxTokens = cfg.maxTokens;
      }
    } catch (_) {}
  }

  get defaultMaxTokens() {
    return this._defaultMaxTokens;
  }

  refreshTokenLimitsCache() {
    const limits = {};
    for (const [k, v] of Object.entries(TOKEN_LIMIT_DEFAULTS)) {
      limits[k] = v.value;
    }
    try {
      const cfg = this.load();
      if (cfg.tokenLimits && typeof cfg.tokenLimits === 'object') {
        for (const [k, v] of Object.entries(cfg.tokenLimits)) {
          if (TOKEN_LIMIT_DEFAULTS[k] && Number.isFinite(v) && v >= 64 && v <= 128000) {
            limits[k] = v;
          }
        }
      }
    } catch (_) {}
    this._tokenLimits = limits;
  }

  getTokenLimit(key) {
    return this._tokenLimits[key] || (TOKEN_LIMIT_DEFAULTS[key] && TOKEN_LIMIT_DEFAULTS[key].value) || 1000;
  }

  getTokenLimitDefaults() {
    return TOKEN_LIMIT_DEFAULTS;
  }
}

const configService = new ConfigService();
module.exports = configService;
module.exports.ConfigService = ConfigService;
module.exports.TOKEN_LIMIT_DEFAULTS = TOKEN_LIMIT_DEFAULTS;
