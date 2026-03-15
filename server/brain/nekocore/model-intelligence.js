// ── NekoCore Model Intelligence ──────────────────────────────────────────────
// NekoCore's memory-backed knowledge of brain loop roles and model capabilities.
//
// Instead of baking model data into her prompt, NekoCore stores it as structured
// memory files she can reference and rewrite over time (REM System MA approach).
//
// Memory files in NekoCore's memories/ directory:
//   role-knowledge.json    — brain loop role definitions and requirements
//   model-registry.json    — known model catalog with cost/speed/capabilities
//   model-performance.json — per-entity/role/model performance tracking
// ────────────────────────────────────────────────────────────────────────────

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Brain loop role definitions ───────────────────────────────────────────────
// Describes what each cognitive aspect does, what capability profile it needs,
// and which optimisation priorities to apply when selecting a model.

const ROLE_DEFINITIONS = {
  subconscious: {
    displayName: 'Subconscious',
    purpose: 'Memory retrieval, emotional signal detection, context assembly. Runs first, in parallel with Dream. Feeds Conscious with activated memories and emotional context.',
    requirements: { reasoning: 0.4, creativity: 0.3, instruction: 0.8, speed: 1.0 },
    priorities: ['speed', 'cost'],
    taskTypes: ['retrieval', 'context', 'reflection', 'emotion-tagging']
  },
  conscious: {
    displayName: 'Conscious',
    purpose: 'Reasoning engine — interprets memory + dream context and produces structured INTENT / MEMORY / EMOTION / ANGLE notes for the Orchestrator. Primary reasoning spine.',
    requirements: { reasoning: 0.85, creativity: 0.5, instruction: 0.9, speed: 0.7 },
    priorities: ['reasoning', 'instruction'],
    taskTypes: ['reasoning', 'planning', 'structured-output', 'code', 'analysis']
  },
  dream: {
    displayName: 'Dream',
    purpose: 'Creative and lateral associations. Generates abstract connections, imagery texture, and intuition. Runs in parallel with Subconscious.',
    requirements: { reasoning: 0.4, creativity: 0.9, instruction: 0.5, speed: 0.7 },
    priorities: ['creativity', 'cost'],
    taskTypes: ['creative', 'associative', 'imagination', 'poetry', 'narrative']
  },
  orchestrator: {
    displayName: 'Orchestrator',
    purpose: "Final synthesis — voices the entity's reply from Conscious reasoning notes. Persona fidelity, warmth, and output quality are critical. Reviews and speaks as the entity.",
    requirements: { reasoning: 0.8, creativity: 0.75, instruction: 0.95, speed: 0.6 },
    priorities: ['reasoning', 'creativity', 'instruction'],
    taskTypes: ['synthesis', 'persona', 'response-generation', 'creative', 'code', 'narrative']
  }
};

// ── Seeded model catalog ──────────────────────────────────────────────────────
// Common OpenRouter models with representative 2025-2026 pricing.
// NekoCore reads this at runtime — she can add or update entries via memory writes.

const KNOWN_MODELS = {
  'google/gemini-flash-1.5': {
    displayName: 'Gemini Flash 1.5', provider: 'openrouter',
    contextWindow: 1000000, costPer1kIn: 0.000075, costPer1kOut: 0.0003, speedScore: 0.98,
    capabilities: { reasoning: 0.72, creativity: 0.65, instruction: 0.88, code: 0.70, creative: 0.65 },
    notes: 'Extremely fast and cheap. Excellent for Subconscious context tasks.'
  },
  'google/gemini-flash-2.0': {
    displayName: 'Gemini Flash 2.0', provider: 'openrouter',
    contextWindow: 1000000, costPer1kIn: 0.0001, costPer1kOut: 0.0004, speedScore: 0.95,
    capabilities: { reasoning: 0.78, creativity: 0.70, instruction: 0.90, code: 0.75, creative: 0.70 },
    notes: 'Fast and cheap with improved reasoning. Solid default for Subconscious.'
  },
  'anthropic/claude-haiku-3.5': {
    displayName: 'Claude Haiku 3.5', provider: 'openrouter',
    contextWindow: 200000, costPer1kIn: 0.0008, costPer1kOut: 0.004, speedScore: 0.90,
    capabilities: { reasoning: 0.78, creativity: 0.75, instruction: 0.90, code: 0.80, creative: 0.75 },
    notes: 'Fast, affordable, capable. Budget-conscious choice for Conscious and Orchestrator.'
  },
  'anthropic/claude-sonnet-4.6': {
    displayName: 'Claude Sonnet 4.6', provider: 'openrouter',
    contextWindow: 200000, costPer1kIn: 0.003, costPer1kOut: 0.015, speedScore: 0.75,
    capabilities: { reasoning: 0.93, creativity: 0.90, instruction: 0.96, code: 0.92, creative: 0.90 },
    notes: 'Proven Orchestrator model — strong reasoning, high persona fidelity, reliable skill invocation. Preferred choice for Orchestrator and Conscious. Balances cost and quality well for synthesis tasks.'
  },
  'anthropic/claude-opus-4.6': {
    displayName: 'Claude Opus 4.6', provider: 'openrouter',
    contextWindow: 200000, costPer1kIn: 0.005, costPer1kOut: 0.025, speedScore: 0.55,
    capabilities: { reasoning: 0.98, creativity: 0.96, instruction: 0.98, code: 0.97, creative: 0.96 },
    notes: 'Best capability in the Anthropic lineup. Better than Opus 4 and more affordable. Top candidate for NekoCore OS reasoning tasks.'
  },
  'openai/gpt-4o-mini': {
    displayName: 'GPT-4o Mini', provider: 'openrouter',
    contextWindow: 128000, costPer1kIn: 0.00015, costPer1kOut: 0.0006, speedScore: 0.88,
    capabilities: { reasoning: 0.75, creativity: 0.72, instruction: 0.88, code: 0.80, creative: 0.72 },
    notes: 'Cost-effective and fast. Good general-purpose alternative.'
  },
  'openai/gpt-4o': {
    displayName: 'GPT-4o', provider: 'openrouter',
    contextWindow: 128000, costPer1kIn: 0.005, costPer1kOut: 0.015, speedScore: 0.72,
    capabilities: { reasoning: 0.90, creativity: 0.85, instruction: 0.93, code: 0.90, creative: 0.85 },
    notes: 'Balanced high-capability. Reliable Conscious and Orchestrator option.'
  },
  'meta-llama/llama-3.3-70b-instruct': {
    displayName: 'Llama 3.3 70B', provider: 'openrouter',
    contextWindow: 32768, costPer1kIn: 0.0006, costPer1kOut: 0.0006, speedScore: 0.80,
    capabilities: { reasoning: 0.83, creativity: 0.78, instruction: 0.86, code: 0.82, creative: 0.78 },
    notes: 'Strong open-weight model at a fraction of proprietary cost.'
  },
  'meta-llama/llama-3.1-8b-instruct': {
    displayName: 'Llama 3.1 8B', provider: 'openrouter',
    contextWindow: 131072, costPer1kIn: 0.000060, costPer1kOut: 0.000060, speedScore: 0.96,
    capabilities: { reasoning: 0.62, creativity: 0.58, instruction: 0.75, code: 0.65, creative: 0.58 },
    notes: 'Very cheap and fast. High-volume Subconscious tasks where quality is secondary.'
  },
  'x-ai/grok-3-mini-beta': {
    displayName: 'Grok 3 Mini', provider: 'openrouter',
    contextWindow: 131072, costPer1kIn: 0.0003, costPer1kOut: 0.0005, speedScore: 0.88,
    capabilities: { reasoning: 0.80, creativity: 0.72, instruction: 0.85, code: 0.80, creative: 0.72 },
    notes: 'Fast and cost-effective with strong reasoning for the price.'
  },
  'inception/mercury-2': {
    displayName: 'Mercury 2', provider: 'openrouter',
    contextWindow: 32768, costPer1kIn: 0.00025, costPer1kOut: 0.00075, speedScore: 0.97,
    diffusionModel: true,
    capabilities: { reasoning: 0.70, creativity: 0.80, instruction: 0.82, code: 0.55, creative: 0.82 },
    notes: 'Diffusion LLM — extremely fast and cheap, follows direction well, good for creative/associative tasks. Character reformation artifacts make it unreliable for skills invocation, precise structured output, and code. Avoid for task types requiring exact token sequences.'
  },
  'openai/o3-mini': {
    displayName: 'o3 Mini', provider: 'openrouter',
    contextWindow: 200000, costPer1kIn: 0.0011, costPer1kOut: 0.0044, speedScore: 0.62,
    capabilities: { reasoning: 0.97, creativity: 0.60, instruction: 0.92, code: 0.96, creative: 0.55 },
    notes: 'Pure reasoning model — exceptional at analysis, planning, and chain-of-thought tasks. Slower due to internal thinking. Top candidate for NekoCore OS orchestration where reasoning depth outweighs speed.'
  }
};

// ── File constants ────────────────────────────────────────────────────────────

const ROLE_FILE        = 'role-knowledge.json';
const REGISTRY_FILE    = 'model-registry.json';
const PERFORMANCE_FILE = 'model-performance.json';

// ── Low-level I/O helpers ─────────────────────────────────────────────────────

function _atomicWriteJson(filePath, value) {
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function _readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) { return fallback; }
}

// ── Seeding ───────────────────────────────────────────────────────────────────

/**
 * Write role-knowledge.json into NekoCore's memories dir (idempotent — skips if exists).
 * @param {string} memDir - NekoCore's memories/ directory path
 * @returns {boolean} true = created, false = already existed
 */
function seedRoleKnowledge(memDir) {
  const dest = path.join(memDir, ROLE_FILE);
  if (fs.existsSync(dest)) return false;
  _atomicWriteJson(dest, { lastUpdated: new Date().toISOString(), roles: ROLE_DEFINITIONS });
  return true;
}

/**
 * Write model-registry.json into NekoCore's memories dir (always overwrites — registry evolves).
 * Merges KNOWN_MODELS with any extra models provided by the caller.
 * @param {string} memDir
 * @param {object} [extraModels] - Additional model entries to merge
 * @returns {boolean} always true
 */
function seedModelRegistry(memDir, extraModels = {}) {
  const dest = path.join(memDir, REGISTRY_FILE);
  _atomicWriteJson(dest, {
    lastUpdated: new Date().toISOString(),
    models: { ...KNOWN_MODELS, ...extraModels }
  });
  return true;
}

// ── Model selection ───────────────────────────────────────────────────────────

/**
 * Select the best model for a given cognitive role.
 *
 * Scoring factors (in order of contribution):
 *   1. Capability match vs role requirements
 *   2. Value density: capability per dollar of inference cost
 *   3. Speed bonus (amplified for speed-priority roles)
 *   4. Task-type affinity (code / creative / general)
 *   5. Entity-specific performance multiplier (from experience data)
 *
 * @param {string} role - 'subconscious' | 'conscious' | 'dream' | 'orchestrator'
 * @param {object} [options]
 * @param {object} [options.registry]    - Loaded model-registry.json (falls back to KNOWN_MODELS)
 * @param {object} [options.performance] - Loaded model-performance.json
 * @param {string} [options.entityId]    - Entity context for performance lookup
 * @param {string} [options.taskType]    - 'code' | 'creative' | 'general' | ...
 * @returns {{ modelId: string, score: number, reason: string } | null}
 */
function selectModel(role, { registry = null, performance = null, entityId = null, taskType = null } = {}) {
  const roleDef = ROLE_DEFINITIONS[role];
  if (!roleDef) return null;

  const models        = (registry && registry.models) ? registry.models : KNOWN_MODELS;
  const reqs          = roleDef.requirements;
  const prioritySpeed = roleDef.priorities.includes('speed');
  const priorityCost  = roleDef.priorities.includes('cost');
  const reqSum        = reqs.reasoning + reqs.creativity + reqs.instruction;

  let bestId = null, bestScore = -Infinity, bestReason = '';

  for (const [modelId, model] of Object.entries(models)) {
    const caps = model.capabilities || {};

    // Minimum capability floor for quality-priority roles (conscious, orchestrator).
    // Prevents very cheap but mediocre models from winning purely on value density
    // when the role demands genuine reasoning or instruction-following ability.
    if (!prioritySpeed && !priorityCost) {
      const floorFactor = 0.85; // must meet at least 85% of each high requirement
      let qualifies = true;
      for (const [cap, level] of Object.entries(reqs)) {
        if (cap === 'speed') continue;
        if (level > 0.6 && (caps[cap] || 0) < level * floorFactor) {
          qualifies = false;
          break;
        }
      }
      if (!qualifies) continue;
    }

    // Weighted capability match against role's stated requirements
    const capScore = (
      (caps.reasoning  || 0) * reqs.reasoning  +
      (caps.creativity || 0) * reqs.creativity  +
      (caps.instruction || 0) * reqs.instruction
    ) / (reqSum || 1);

    // Value density: capability earned per dollar of inference
    const costWeight  = Math.max((model.costPer1kOut || 0.001) + (model.costPer1kIn || 0.0001), 0.0001);
    const valueScore  = capScore / costWeight;

    // Speed bonus — stronger for speed/cost priority roles
    const speedBonus = prioritySpeed
      ? (model.speedScore || 0.5) * 2.0
      : (model.speedScore || 0.5) * 0.5;

    // Task-type affinity: boost/penalise relative to 0.70 baseline
    let taskBonus = 1.0;
    if (taskType && caps[taskType] !== undefined) {
      taskBonus = 1.0 + (caps[taskType] - 0.7) * 0.5;
    }

    // Diffusion model penalty — character reformation artifacts make diffusion models
    // unreliable for tasks that require exact token sequences: skill invocations,
    // structured JSON output, code, and final persona synthesis.
    const DIFFUSION_SENSITIVE = new Set(['code', 'structured-output', 'synthesis', 'skills']);
    const diffusionPenalty = (model.diffusionModel && taskType && DIFFUSION_SENSITIVE.has(taskType))
      ? 0.35
      : 1.0;

    // Entity-specific performance multiplier — applied once ≥ 3 samples exist.
    // Wider range (0.25–2.0) so accumulated experience meaningfully shifts rankings.
    let perfMultiplier = 1.0;
    if (performance && entityId) {
      const rec = (performance.records || {})[`${role}|${entityId}|${modelId}`];
      if (rec && rec.sampleCount >= 3) {
        perfMultiplier = 0.25 + rec.qualityScore * 1.75; // 0.25–2.00
      }
    }

    const costFactor  = priorityCost ? 1.5 : 1.0;
    const finalScore  = valueScore * costFactor * speedBonus * taskBonus * perfMultiplier * diffusionPenalty;

    if (finalScore > bestScore) {
      bestScore  = finalScore;
      bestId     = modelId;
      bestReason = `cap=${capScore.toFixed(2)} value=${valueScore.toFixed(0)} speed=${model.speedScore} task=${taskType || 'general'} perf=${perfMultiplier.toFixed(2)}${diffusionPenalty < 1 ? ' diffusion-penalised' : ''}`;
    }
  }

  return bestId ? { modelId: bestId, score: bestScore, reason: bestReason } : null;
}

// ── Performance tracking ──────────────────────────────────────────────────────

/**
 * Record model performance data into NekoCore's model-performance.json.
 * Uses a rolling average so quality estimates improve over time.
 * Non-fatal — write errors are silently swallowed (recording is advisory).
 *
 * @param {string} memDir - NekoCore's memories/ directory path
 * @param {object} data
 *   @param {string} data.role          - cognitive aspect name
 *   @param {string} data.modelId       - model identifier
 *   @param {string} data.entityId      - entity being served
 *   @param {number} [data.quality]     - 0–1 quality signal (default 0.75)
 *   @param {string} [data.taskType]    - task category for per-type tracking
 *   @param {number} [data.latencyMs]   - response latency in ms
 *   @param {number} [data.tokensTotal] - total tokens consumed
 */
function recordPerformance(memDir, {
  role, modelId, entityId,
  quality = 0.75, taskType = null, latencyMs = null, tokensTotal = null
}) {
  if (!role || !modelId || !entityId) return;
  const perfPath = path.join(memDir, PERFORMANCE_FILE);
  const data = _readJson(perfPath, { lastUpdated: null, records: {} });
  const key  = `${role}|${entityId}|${modelId}`;
  const now  = new Date().toISOString();

  if (!data.records[key]) {
    data.records[key] = {
      role, modelId, entityId,
      sampleCount:   1,
      qualityScore:  quality,
      taskScores:    taskType ? { [taskType]: quality } : {},
      avgLatencyMs:  latencyMs,
      avgTokens:     tokensTotal,
      lastUsed:      now,
      lastUpdated:   now
    };
  } else {
    const r = data.records[key];
    const n = r.sampleCount;
    r.sampleCount   = n + 1;
    r.qualityScore  = (r.qualityScore * n + quality) / (n + 1);
    if (taskType !== null) {
      const prev = r.taskScores[taskType] !== undefined ? r.taskScores[taskType] : quality;
      r.taskScores[taskType] = (prev * Math.min(n, 10) + quality) / (Math.min(n, 10) + 1);
    }
    if (latencyMs !== null) {
      const p = r.avgLatencyMs !== null ? r.avgLatencyMs : latencyMs;
      r.avgLatencyMs = (p * n + latencyMs) / (n + 1);
    }
    if (tokensTotal !== null) {
      const p = r.avgTokens !== null ? r.avgTokens : tokensTotal;
      r.avgTokens = (p * n + tokensTotal) / (n + 1);
    }
    r.lastUsed    = now;
    r.lastUpdated = now;
  }

  data.lastUpdated = now;
  try { _atomicWriteJson(perfPath, data); } catch (_) { /* non-fatal */ }
}

// ── Registry + performance readers ───────────────────────────────────────────

/** Read model-registry.json from NekoCore's memory dir (falls back to KNOWN_MODELS). */
function getRegistry(memDir) {
  return _readJson(path.join(memDir, REGISTRY_FILE), { models: { ...KNOWN_MODELS } });
}

/** Read model-performance.json from NekoCore's memory dir (empty if absent). */
function getPerformance(memDir) {
  return _readJson(path.join(memDir, PERFORMANCE_FILE), { records: {} });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  ROLE_DEFINITIONS,
  KNOWN_MODELS,
  ROLE_FILE,
  REGISTRY_FILE,
  PERFORMANCE_FILE,
  seedRoleKnowledge,
  seedModelRegistry,
  selectModel,
  recordPerformance,
  getRegistry,
  getPerformance
};
