// ============================================================
// Memory Schema Contract
// Shared canonical record shape for persisted memory metadata.
// ============================================================

const MEMORY_SCHEMA_VERSION = 1;

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter(v => typeof v === 'string')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeMemoryRecord(input, options = {}) {
  const record = (input && typeof input === 'object') ? input : {};
  const now = new Date().toISOString();

  return {
    memorySchemaVersion: toFiniteNumber(record.memorySchemaVersion, MEMORY_SCHEMA_VERSION),
    memory_id: String(record.memory_id || record.id || options.defaultId || ''),
    type: String(record.type || options.defaultType || 'episodic'),
    created: String(record.created || now),
    last_accessed: String(record.last_accessed || record.created || now),
    access_count: Math.max(0, Math.floor(toFiniteNumber(record.access_count, 0))),
    access_events: Array.isArray(record.access_events) ? record.access_events : [],
    decay: toFiniteNumber(record.decay, 1.0),
    importance: toFiniteNumber(record.importance, 0.5),
    topics: toStringArray(record.topics),
    emotionalTag: typeof record.emotionalTag === 'string' ? record.emotionalTag : null
  };
}

module.exports = {
  MEMORY_SCHEMA_VERSION,
  normalizeMemoryRecord
};
