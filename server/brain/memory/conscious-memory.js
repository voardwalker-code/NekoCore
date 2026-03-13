// ============================================================
// REM System — Conscious Memory
// Parallel memory pipeline indexed by topic/subject rather than
// emotion/neurochemistry (which drives the subconscious).
//
// Two tiers:
//   STM (Short-Term Memory) — held in RAM, backed to stm.json.
//       Entries decay each brain-loop cycle. Gets reinforced when
//       the subconscious retrieves memories with overlapping topics.
//   LTM (Long-Term Memory) — promoted entries written to disk in
//       ltm/<id>.json format, with cross-links to related subconscious
//       memories (wired during deep-sleep phase).
// ============================================================

const fs   = require('fs');
const path = require('path');
const entityPaths = require('../../entities/entityPaths');
const { MEMORY_SCHEMA_VERSION } = require('../../contracts/memory-schema');

const LTM_THRESHOLD    = 3;    // recall_weight needed to trigger LTM promotion
const STM_DECAY_AMOUNT = 0.15; // subtracted from recall_weight each cycle
const STM_MAX_AGE      = 20;   // hard eviction after this many cycles without reinforcement

// Score how well an entry's topics overlap with a query topic array.
// Returns a value in [0, 1].
function topicOverlap(entryTopics, queryTopics) {
  if (!entryTopics?.length || !queryTopics?.length) return 0;
  const setQ = new Set(queryTopics.map(t => t.toLowerCase()));
  const matches = entryTopics.filter(t => setQ.has(t.toLowerCase())).length;
  return matches / Math.max(entryTopics.length, queryTopics.length);
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class ConsciousMemory {
  /**
   * @param {Object} options
   * @param {string} [options.entityId] - If provided, all disk paths are entity-scoped.
   */
  constructor(options = {}) {
    this.entityId = options.entityId || null;

    // In-memory STM store: id → STMEntry
    this._stm = new Map();

    // Entries whose recall_weight has reached LTM_THRESHOLD
    this._promotionQueue = [];

    this._stmFile = null;
    this._ltmDir  = null;

    if (this.entityId) {
      const base = entityPaths.getConsciousMemoryPath(this.entityId);
      this._stmFile = path.join(base, 'stm.json');
      this._ltmDir  = path.join(base, 'ltm');
      fs.mkdirSync(this._ltmDir, { recursive: true });
      this._loadStm();
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // STM API
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Add a new observation to STM.
   * @param {Object} entry - { summary, topics, source }
   * @returns {Object} The stored STM entry.
   */
  addToStm(entry) {
    const now = new Date().toISOString();
    const id  = makeId('cstm');
    const stored = {
      id,
      memorySchemaVersion: MEMORY_SCHEMA_VERSION,
      summary:          String(entry.summary || '').slice(0, 500),
      topics:           Array.isArray(entry.topics) ? entry.topics.slice(0, 20) : [],
      recall_weight:    0,
      age_cycles:       0,
      created:          now,
      last_reinforced:  now,
      source:           entry.source || 'conscious_observation'
    };
    this._stm.set(id, stored);
    this._saveStm();
    return stored;
  }

  /**
   * Increment recall_weight for STM entries whose topics overlap with the given
   * topic array. Moves entries that reach LTM_THRESHOLD into the promotion queue.
   * @param {string[]} topics
   */
  reinforce(topics) {
    if (!topics?.length) return;
    let changed = false;
    for (const [id, entry] of this._stm.entries()) {
      const overlap = topicOverlap(entry.topics, topics);
      if (overlap <= 0) continue;

      entry.recall_weight += overlap;   // partial-overlap gives partial credit
      entry.last_reinforced = new Date().toISOString();
      changed = true;

      if (entry.recall_weight >= LTM_THRESHOLD && !this._promotionQueue.find(e => e.id === id)) {
        this._promotionQueue.push(entry);
      }
    }
    if (changed) this._saveStm();
  }

  /**
   * Decay all STM entries by STM_DECAY_AMOUNT and evict those that have
   * aged out. Called once per brain-loop cycle by phase-conscious-stm.
   */
  decayStm() {
    let changed = false;
    for (const [id, entry] of this._stm.entries()) {
      entry.age_cycles += 1;
      entry.recall_weight = Math.max(0, entry.recall_weight - STM_DECAY_AMOUNT);

      if (entry.age_cycles > STM_MAX_AGE) {
        this._stm.delete(id);
        // Also remove from promotion queue if it decayed out before being promoted
        this._promotionQueue = this._promotionQueue.filter(e => e.id !== id);
        changed = true;
        continue;
      }
      changed = true;
    }
    if (changed) this._saveStm();
  }

  /**
   * Return the top-N STM entries most relevant to the given topics.
   * @param {string[]} topics
   * @param {number}   [limit=3]
   * @returns {Object[]}
   */
  getStmContext(topics, limit = 3) {
    const candidates = [];
    for (const entry of this._stm.values()) {
      const score = topicOverlap(entry.topics, topics) + (entry.recall_weight / LTM_THRESHOLD) * 0.3;
      if (score > 0) candidates.push({ ...entry, _score: score });
    }
    candidates.sort((a, b) => b._score - a._score);
    return candidates.slice(0, limit).map(({ _score, ...e }) => e);
  }

  // ──────────────────────────────────────────────────────────────────────
  // LTM API
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Return the top-N LTM entries most relevant to the given topics.
   * Reads from disk, scores by topic overlap.
   * @param {string[]} topics
   * @param {number}   [limit=5]
   * @returns {Object[]}
   */
  getLtmContext(topics, limit = 5) {
    if (!this._ltmDir) return [];
    let files;
    try { files = fs.readdirSync(this._ltmDir).filter(f => f.endsWith('.json')); }
    catch { return []; }

    const candidates = [];
    for (const f of files) {
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(this._ltmDir, f), 'utf8'));
        const score = topicOverlap(entry.topics, topics);
        if (score > 0) candidates.push({ ...entry, _score: score });
      } catch { /* skip corrupt files */ }
    }
    candidates.sort((a, b) => b._score - a._score);
    return candidates.slice(0, limit).map(({ _score, ...e }) => e);
  }

  /**
   * Directly insert an entry into LTM.
   * Used by document-ingestion style flows that should bypass STM.
   * @param {Object} entry - { id?, summary, topics, source?, created?, ...extraFields }
   * @returns {Object} Stored LTM entry.
   */
  addToLtm(entry) {
    const now = new Date().toISOString();
    const id = entry?.id || makeId('cltm');

    const ltmEntry = {
      id,
      memorySchemaVersion: Number(entry?.memorySchemaVersion || MEMORY_SCHEMA_VERSION),
      summary: String(entry?.summary || '').slice(0, 500),
      topics: Array.isArray(entry?.topics) ? entry.topics.slice(0, 20) : [],
      source: entry?.source || 'conscious_direct_ingest',
      created: entry?.created || now,
      promoted_at: now,
      subcon_links: Array.isArray(entry?.subcon_links) ? entry.subcon_links.slice(0, 200) : [],
      ltm_links: Array.isArray(entry?.ltm_links) ? entry.ltm_links.slice(0, 200) : []
    };

    // Preserve additional metadata such as document content/chunk fields.
    for (const [key, value] of Object.entries(entry || {})) {
      if (!(key in ltmEntry)) ltmEntry[key] = value;
    }

    if (this._ltmDir) {
      fs.writeFileSync(
        path.join(this._ltmDir, `${id}.json`),
        JSON.stringify(ltmEntry, null, 2),
        'utf8'
      );
    }

    return ltmEntry;
  }

  /**
   * Merge STM + LTM context for the orchestrator, deduplicating by id.
   * @param {string[]} topics
   * @param {number}   [limit=5]
   * @returns {Object[]}
   */
  getContext(topics, limit = 5) {
    const stm = this.getStmContext(topics, limit);
    const ltm = this.getLtmContext(topics, limit);
    const seen = new Set(stm.map(e => e.id));
    const merged = [...stm, ...ltm.filter(e => !seen.has(e.id))];
    return merged.slice(0, limit);
  }

  /**
   * Promote an STM entry to LTM.
   * Writes a .json file to ltmDir, removes the entry from STM and the queue.
   * Cross-links (subcon_links, ltm_links) are added by the deep-sleep phase.
   * @param {Object} entry - STM entry (or promotion-queue entry)
   * @param {Object} [links] - { subcon_links: string[], ltm_links: string[] }
   */
  promoteToLtm(entry, links = {}) {
    const now = new Date().toISOString();
    const ltmEntry = {
      id:          entry.id,
      memorySchemaVersion: Number(entry.memorySchemaVersion || MEMORY_SCHEMA_VERSION),
      summary:     entry.summary,
      topics:      entry.topics,
      source:      entry.source,
      created:     entry.created,
      promoted_at: now,
      subcon_links: links.subcon_links || [],
      ltm_links:    links.ltm_links    || []
    };

    if (this._ltmDir) {
      fs.writeFileSync(
        path.join(this._ltmDir, `${entry.id}.json`),
        JSON.stringify(ltmEntry, null, 2),
        'utf8'
      );
    }

    this._stm.delete(entry.id);
    this._promotionQueue = this._promotionQueue.filter(e => e.id !== entry.id);
    this._saveStm();
    return ltmEntry;
  }

  /**
   * Return entries waiting to be promoted to LTM.
   * The deep-sleep phase consumes this queue.
   * @returns {Object[]}
   */
  getPromotionQueue() {
    return [...this._promotionQueue];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Persistence
  // ──────────────────────────────────────────────────────────────────────

  _saveStm() {
    if (!this._stmFile) return;
    try {
      const data = { entries: [...this._stm.values()], saved_at: new Date().toISOString() };
      fs.writeFileSync(this._stmFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('  ⚠ ConsciousMemory: could not save STM:', err.message);
    }
  }

  _loadStm() {
    if (!this._stmFile || !fs.existsSync(this._stmFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this._stmFile, 'utf8'));
      if (Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (entry?.id) this._stm.set(entry.id, entry);
        }
      }
    } catch (err) {
      console.warn('  ⚠ ConsciousMemory: could not load STM:', err.message);
    }
  }
}

module.exports = ConsciousMemory;
