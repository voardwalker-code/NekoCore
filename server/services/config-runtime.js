'use strict';
/**
 * server/services/config-runtime.js
 * Phase A Re-evaluation — A-Re2
 *
 * Runtime configuration helpers for aspect-based LLM profile resolution.
 *
 * Pure helpers (no external deps):
 *   normalizeSubconsciousRuntimeConfig, normalizeAspectRuntimeConfig, mapAspectKey,
 *   resolveProfileAspectConfigs
 *
 * Config-dependent helpers (need loadConfig injected via factory):
 *   loadAspectRuntimeConfig
 *
 * Usage:
 *   const {
 *     normalizeSubconsciousRuntimeConfig, normalizeAspectRuntimeConfig,
 *     mapAspectKey, loadAspectRuntimeConfig, resolveProfileAspectConfigs
 *   } = createConfigRuntime({ getConfig: loadConfig });
 */

// ── Pure helpers ──────────────────────────────────────────────────────────────

function normalizeSubconsciousRuntimeConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') return null;

  if (rawConfig.endpoint && rawConfig.key && rawConfig.model) {
    return {
      type: 'openrouter',
      endpoint: rawConfig.endpoint,
      apiKey: rawConfig.key,
      model: rawConfig.model
    };
  }

  if (rawConfig.ollamaUrl && rawConfig.ollamaModel) {
    return {
      type: 'ollama',
      endpoint: rawConfig.ollamaUrl,
      model: rawConfig.ollamaModel
    };
  }

  return null;
}

function normalizeAspectRuntimeConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') return null;

  const type = String(rawConfig.type || '').toLowerCase().trim();

  // Explicit type field
  if (type === 'openrouter') {
    const endpoint = String(rawConfig.endpoint || rawConfig.ep || '').trim()
      || 'https://openrouter.ai/api/v1/chat/completions';
    const apiKey = String(rawConfig.apiKey || rawConfig.key || '').trim();
    const model = String(rawConfig.model || rawConfig.modelId || '').trim();
    if (!endpoint || !apiKey || !model) return null;
    return { type: 'openrouter', endpoint, apiKey, model };
  }

  if (type === 'ollama') {
    const endpoint = String(rawConfig.endpoint || rawConfig.ollamaUrl || '').trim() || 'http://localhost:11434';
    const model = String(rawConfig.model || rawConfig.ollamaModel || '').trim();
    if (!endpoint || !model) return null;
    return { type: 'ollama', endpoint, model };
  }

  // Inferred type — entity configs saved from UI may lack a `type` field
  if (!type && rawConfig.endpoint && (rawConfig.key || rawConfig.apiKey) && rawConfig.model) {
    return {
      type: 'openrouter',
      endpoint: String(rawConfig.endpoint).trim(),
      apiKey: String(rawConfig.key || rawConfig.apiKey).trim(),
      model: String(rawConfig.model).trim()
    };
  }

  if (!type && rawConfig.ollamaUrl && rawConfig.ollamaModel) {
    return {
      type: 'ollama',
      endpoint: String(rawConfig.ollamaUrl).trim(),
      model: String(rawConfig.ollamaModel).trim()
    };
  }

  return null;
}

function mapAspectKey(aspectOrRole) {
  const raw = String(aspectOrRole || '').toLowerCase().trim();
  if (!raw) return 'main';
  if (raw.includes('sub')) return 'subconscious';
  if (raw.includes('dream')) return 'dream';
  if (raw.includes('orchestr')) return 'orchestrator';
  if (raw === 'nekocore') return 'nekocore';
  if (raw.includes('main') || raw.includes('conscious')) return 'main';
  return raw;
}

/**
 * Resolve aspect configs from a profile, handling both multi-aspect and legacy single-provider formats.
 * Returns { main, subconscious, dream, orchestrator } with normalised runtime configs.
 */
function resolveProfileAspectConfigs(profile) {
  if (!profile) return {};
  const configs = {};

  // Multi-aspect format (profile.main / .subconscious / .dream / .orchestrator / .background)
  if (profile.main) {
    configs.main = normalizeAspectRuntimeConfig(profile.main);
    configs.subconscious = normalizeAspectRuntimeConfig(profile.subconscious) || configs.main;
    configs.dream = normalizeAspectRuntimeConfig(profile.dream) || normalizeAspectRuntimeConfig(profile.dreams) || configs.main;
    configs.orchestrator = normalizeAspectRuntimeConfig(profile.orchestrator) || configs.main;
    configs.background = normalizeAspectRuntimeConfig(profile.background) || configs.main;
    // nekocore is a dedicated system slot — does NOT fall back to main if unconfigured
    configs.nekocore = normalizeAspectRuntimeConfig(profile.nekocore) || null;
    return configs;
  }

  // Legacy single-provider format (profile.apikey / profile.ollama + profile._activeType)
  const activeType = String(profile._activeType || '').toLowerCase();
  if ((activeType === 'openrouter' || activeType === 'apikey') && profile.apikey) {
    const legacyMain = normalizeAspectRuntimeConfig({
      type: 'openrouter',
      endpoint: profile.apikey.endpoint,
      apiKey: profile.apikey.key,
      model: profile.apikey.model
    });
    if (legacyMain) {
      configs.main = legacyMain;
      configs.subconscious = legacyMain;
      configs.dream = legacyMain;
      configs.orchestrator = legacyMain;
      configs.background = legacyMain;
    }
  } else if (activeType === 'ollama' && profile.ollama) {
    const legacyMain = normalizeAspectRuntimeConfig({
      type: 'ollama',
      endpoint: profile.ollama.url,
      model: profile.ollama.model
    });
    if (legacyMain) {
      configs.main = legacyMain;
      configs.subconscious = legacyMain;
      configs.dream = legacyMain;
      configs.orchestrator = legacyMain;
      configs.background = legacyMain;
    }
  }

  return configs;
}

// ── Factory (injects loadConfig dependency) ───────────────────────────────────

/**
 * @param {{ getConfig: Function }} deps
 */
function createConfigRuntime({ getConfig } = {}) {
  if (typeof getConfig !== 'function') throw new Error('createConfigRuntime: getConfig must be a function');

  function loadAspectRuntimeConfig(aspectOrRole, inlineAspectConfigs = null) {
    const aspect = mapAspectKey(aspectOrRole);

    // 1) Request-scoped configs (e.g., setup wizard hatch payload).
    if (inlineAspectConfigs && typeof inlineAspectConfigs === 'object') {
      const inlineConfig = normalizeAspectRuntimeConfig(inlineAspectConfigs[aspect]);
      if (inlineConfig) return inlineConfig;
      if (aspect === 'dream') {
        const dreamAlt = normalizeAspectRuntimeConfig(inlineAspectConfigs.dreams);
        if (dreamAlt) return dreamAlt;
      }
    }

    // 2) Global saved profile fallback.
    const globalConfig = getConfig();
    const preferredProfileName = globalConfig?.lastActive;
    const profile = globalConfig?.profiles?.[preferredProfileName];
    if (profile) {
      const profileMain = normalizeAspectRuntimeConfig(profile.main);
      if (profileMain) {
        if (aspect === 'main') return profileMain;
        if (aspect === 'dream') {
          return normalizeAspectRuntimeConfig(profile.dream)
            || normalizeAspectRuntimeConfig(profile.dreams)
            || profileMain;
        }
        return normalizeAspectRuntimeConfig(profile[aspect]) || profileMain;
      }

      // Multi-aspect format
      const profileAspect = normalizeAspectRuntimeConfig(profile[aspect]);
      if (profileAspect) return profileAspect;
      if (aspect === 'dream') {
        const profileDreamAlt = normalizeAspectRuntimeConfig(profile.dreams);
        if (profileDreamAlt) return profileDreamAlt;
      }

      // Legacy single-provider format (main only, reused for all aspects)
      const activeType = String(profile._activeType || '').toLowerCase();
      if ((activeType === 'openrouter' || activeType === 'apikey') && profile.apikey) {
        const legacyMain = normalizeAspectRuntimeConfig({
          type: 'openrouter',
          endpoint: profile.apikey.endpoint,
          apiKey: profile.apikey.key,
          model: profile.apikey.model
        });
        if (legacyMain) return legacyMain;
      }
      if (activeType === 'ollama' && profile.ollama) {
        const legacyMain = normalizeAspectRuntimeConfig({
          type: 'ollama',
          endpoint: profile.ollama.url,
          model: profile.ollama.model
        });
        if (legacyMain) return legacyMain;
      }
    }

    return null;
  }

  return {
    normalizeSubconsciousRuntimeConfig,
    normalizeAspectRuntimeConfig,
    mapAspectKey,
    loadAspectRuntimeConfig,
    resolveProfileAspectConfigs
  };
}

module.exports = { createConfigRuntime };
