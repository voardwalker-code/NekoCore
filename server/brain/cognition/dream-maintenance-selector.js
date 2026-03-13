// ============================================================
// REM System — Dream Maintenance Selector  [JS_OFFLOAD]
//
// Scores and ranks memory candidates for dream-maintenance runs.
// Runs in idle/sleep path only — never called per chat turn.
//
// Scoring dimensions:
//   1. Emotional / neurochemical intensity
//   2. learn / learnFrom tags
//   3. mistake / error markers
//   4. Stale / unaccessed age
//   5. Weak graph degree (orphan / lightly connected)
// ============================================================

const DEFAULT_POLICY = {
  minScore: 0.3,
  maxCandidates: 20,
  bucketSize: 4,
  // Weight for each scoring dimension (0-1 each, sum not required to be 1)
  weights: {
    emotion: 0.30,
    learnTag: 0.25,
    errorTag: 0.20,
    staleness: 0.15,
    weakGraph: 0.10
  },
  // Age thresholds in days for staleness scoring
  staleThresholdDays: 7,
  maxStaleDays: 60
};

/**
 * Score a single memory candidate for dream-maintenance eligibility.
 *
 * @param {Object} memoryMeta - Memory record (importance, emotionalTag, topics, tags, created, lastAccessed)
 * @param {Object} graphMeta  - Graph metadata for this memory ({ degree: number }) — may be null
 * @param {Object} policy     - Override policy (defaults merged with DEFAULT_POLICY)
 * @returns {number} Score 0..1
 */
function scoreDreamCandidate(memoryMeta = {}, graphMeta = null, policy = {}) {
  if (!memoryMeta || typeof memoryMeta !== 'object') return 0;
  const p = _mergePolicy(policy);
  const w = p.weights;
  let score = 0;

  // 1. Emotional / neurochemical intensity
  const emotionScore = _scoreEmotion(memoryMeta);
  score += emotionScore * w.emotion;

  // 2. Learn / learnFrom tags
  const learnScore = _scoreLearnTags(memoryMeta);
  score += learnScore * w.learnTag;

  // 3. Mistake / error markers
  const errorScore = _scoreErrorTags(memoryMeta);
  score += errorScore * w.errorTag;

  // 4. Staleness (old and not recently accessed = higher dream priority)
  const stalenessScore = _scoreStaleness(memoryMeta, p);
  score += stalenessScore * w.staleness;

  // 5. Weak graph connectivity (orphans and low-degree nodes benefit from dream reintegration)
  const weakScore = _scoreWeakGraph(graphMeta);
  score += weakScore * w.weakGraph;

  return Math.min(1, Math.max(0, score));
}

/**
 * Select and rank dream-maintenance candidates from a memory index.
 *
 * @param {Array}  memoryIndex - Array of memory record objects
 * @param {Object} [accessLog] - Map of memoryId -> last access timestamp ms (optional)
 * @param {Object} [graph]     - Graph object with getDegree(memoryId) method (optional)
 * @param {Object} [policy]    - Override policy
 * @returns {Array} Ranked array of { memory, score } objects, descending by score
 */
function selectDreamCandidates(memoryIndex = [], accessLog = null, graph = null, policy = {}) {
  const p = _mergePolicy(policy);

  if (!Array.isArray(memoryIndex) || memoryIndex.length === 0) return [];

  const scored = [];
  for (const memory of memoryIndex) {
    if (!memory || !memory.id) continue;

    // Skip ephemeral/system types
    const type = String(memory.type || '');
    if (type === 'system' || type === 'chat_log') continue;

    // Merge access log timestamp into memoryMeta for staleness scoring
    const lastAccessed = accessLog && accessLog[memory.id]
      ? accessLog[memory.id]
      : _parseDate(memory.lastAccessed || memory.created);

    const memWithAccess = { ...memory, _lastAccessedMs: lastAccessed };

    const graphMeta = graph && typeof graph.getDegree === 'function'
      ? { degree: graph.getDegree(memory.id) }
      : null;

    const score = scoreDreamCandidate(memWithAccess, graphMeta, p);
    if (score >= p.minScore) {
      scored.push({ memory, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, p.maxCandidates);
}

/**
 * Split a ranked candidate array into buckets for multi-dream cycles.
 * Each bucket feeds one dream generation pass.
 *
 * @param {Array}  candidates - Output of selectDreamCandidates
 * @param {number} [bucketSize] - Override bucket size (defaults to policy default)
 * @returns {Array<Array>} Array of memory-only arrays (without score wrapper)
 */
function bucketDreamCandidates(candidates = [], bucketSize = DEFAULT_POLICY.bucketSize) {
  const size = Math.max(1, Number(bucketSize) || DEFAULT_POLICY.bucketSize);
  const buckets = [];
  for (let i = 0; i < candidates.length; i += size) {
    buckets.push(candidates.slice(i, i + size).map(c => c.memory));
  }
  return buckets;
}

// ── Private helpers ────────────────────────────────────────────────────────

function _mergePolicy(override = {}) {
  const p = { ...DEFAULT_POLICY, ...override };
  p.weights = { ...DEFAULT_POLICY.weights, ...(override.weights || {}) };
  return p;
}

function _scoreEmotion(mem) {
  // Use importance or emotionalIntensity if available; fall back to emotionalTag presence
  const intensity = Number(mem.emotionalIntensity || mem.emotional_intensity || 0);
  if (intensity > 0) return Math.min(1, intensity);

  const importance = Number(mem.importance || 0);
  if (importance >= 0.7) return 1;
  if (importance >= 0.5) return 0.6;
  if (importance >= 0.35) return 0.3;

  const tag = String(mem.emotionalTag || mem.emotional_tag || '').toLowerCase();
  if (tag && tag !== 'neutral' && tag !== 'none' && tag !== '') return 0.4;

  return 0;
}

function _scoreLearnTags(mem) {
  const topics = _asTags(mem.topics);
  const tags = _asTags(mem.tags);
  const combined = [...topics, ...tags].map(t => String(t).toLowerCase());

  if (combined.some(t => t === 'learnfrom' || t === 'learn_from')) return 1;
  if (combined.some(t => t === 'learn')) return 0.7;
  if (combined.some(t => t.includes('lesson') || t.includes('insight'))) return 0.4;
  return 0;
}

function _scoreErrorTags(mem) {
  const topics = _asTags(mem.topics);
  const tags = _asTags(mem.tags);
  const combined = [...topics, ...tags].map(t => String(t).toLowerCase());

  if (combined.some(t => t === 'mistake' || t === 'error' || t === 'failure')) return 1;
  if (combined.some(t => t.includes('wrong') || t.includes('regret'))) return 0.6;
  if (combined.some(t => t.includes('problem') || t.includes('difficult'))) return 0.3;
  return 0;
}

function _scoreStaleness(mem, policy) {
  const nowMs = Date.now();
  const lastMs = Number(mem._lastAccessedMs || 0) || _parseDate(mem.created);
  if (!lastMs) return 0;

  const ageMs = nowMs - lastMs;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays < policy.staleThresholdDays) return 0;

  const range = Math.max(1, policy.maxStaleDays - policy.staleThresholdDays);
  const overThreshold = ageDays - policy.staleThresholdDays;
  return Math.min(1, overThreshold / range);
}

function _scoreWeakGraph(graphMeta) {
  if (!graphMeta || graphMeta.degree == null) return 0;
  const degree = Number(graphMeta.degree);
  if (degree <= 0) return 1;   // fully orphaned
  if (degree === 1) return 0.7;
  if (degree === 2) return 0.4;
  if (degree <= 4) return 0.1;
  return 0;
}

function _asTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

function _parseDate(val) {
  if (!val) return 0;
  const ms = typeof val === 'number' ? val : new Date(val).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

module.exports = {
  scoreDreamCandidate,
  selectDreamCandidates,
  bucketDreamCandidates
};
