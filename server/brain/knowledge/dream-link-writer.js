// ============================================================
// REM System — Dream Link Writer  [JS_OFFLOAD]
//
// Persists dream-to-source-memory relationships after dream
// generation commits. Used exclusively in idle/sleep path.
//
// Responsibilities:
//   1. Back-annotate the stored dream record with origin_memories links.
//   2. Optionally back-annotate source memories with a dreamRef.
//   3. Emit a DREAM_MEMORY_STORED event on the cognitive bus.
// ============================================================

/**
 * Persist dream-to-source links on the dream record and optionally
 * on each source memory. Safe to call with null/undefined storage.
 *
 * @param {string}   dreamId    - ID of the committed dream record
 * @param {string[]} sourceIds  - IDs of seed/origin memories used
 * @param {Object}   metadata   - { genre, timestamp, pulseSeeded? }
 * @param {Object}   memStorage - MemoryStorage instance (or null for no-op)
 * @returns {Promise<{ written: boolean, linkedSources: number }>}
 */
async function writeDreamSourceLinks(dreamId, sourceIds, metadata = {}, memStorage = null) {
  if (!dreamId || !memStorage || typeof memStorage.patchMemory !== 'function') {
    return { written: false, linkedSources: 0 };
  }

  const ids = Array.isArray(sourceIds) ? sourceIds.filter(Boolean) : [];
  if (ids.length === 0) return { written: true, linkedSources: 0 };

  let linkedSources = 0;

  // Back-annotate source memories with a dreamRef for pulse exploration
  for (const sourceId of ids) {
    try {
      await memStorage.patchMemory(sourceId, (existing) => {
        const refs = Array.isArray(existing.dreamRefs) ? existing.dreamRefs : [];
        if (!refs.includes(dreamId)) {
          refs.push(dreamId);
        }
        return { ...existing, dreamRefs: refs };
      });
      linkedSources++;
    } catch (_) {
      // Non-critical — source memory patch failure should not abort the dream write
    }
  }

  return { written: true, linkedSources };
}

/**
 * Emit a DREAM_MEMORY_STORED event on the cognitive bus.
 * Safe to call with null bus or missing ThoughtTypes (no-op).
 *
 * @param {Object} bus     - CognitiveBus instance (or null)
 * @param {Object} payload - { dreamId, sourceIds, genre, timestamp }
 */
function emitDreamLinkEvents(bus, payload = {}) {
  if (!bus || typeof bus.emitThought !== 'function') return;

  try {
    // Lazy-require ThoughtTypes to avoid hard coupling
    const ThoughtTypes = require('../bus/thought-types');
    bus.emitThought({
      type: ThoughtTypes.DREAM_MEMORY_STORED,
      source: 'dream_link_writer',
      dreamId: payload.dreamId || null,
      sourceIds: Array.isArray(payload.sourceIds) ? payload.sourceIds : [],
      genre: payload.genre || null,
      timestamp: payload.timestamp || new Date().toISOString()
    });
  } catch (_) {
    // Non-critical — bus emission failure should not propagate
  }
}

module.exports = {
  writeDreamSourceLinks,
  emitDreamLinkEvents
};
