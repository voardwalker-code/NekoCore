// ============================================================
// REM System — Memory Index Cache
// Maintains three index files per entity for fast memory lookups
// without scanning thousands of folders.
//
// Index files:
//   memoryIndex.json  — memId → { importance, decay, topics, created, emotion, type }
//   topicIndex.json   — topic → [memId, memId, ...]
//   recencyIndex.json — sorted array of { memId, lastAccessed, created }
// ============================================================

const fs = require('fs');
const path = require('path');
const { getIndexPath } = require('../../entities/entityPaths');
const { normalizeTopics, expandQueryTopic } = require('../utils/topic-utils');

class MemoryIndexCache {
  constructor(entityId) {
    this.entityId = entityId;
    this.indexDir = getIndexPath(entityId);

    this.memoryIndexPath = path.join(this.indexDir, 'memoryIndex.json');
    this.topicIndexPath = path.join(this.indexDir, 'topicIndex.json');
    this.recencyIndexPath = path.join(this.indexDir, 'recencyIndex.json');

    // In-memory caches
    this.memoryIndex = {};    // memId → metadata
    this.topicIndex = {};     // topic → [memId, ...]
    this.recencyIndex = [];   // sorted by lastAccessed desc

    this._loaded = false;
  }

  _atomicWriteJson(filePath, data) {
    try {
      const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
      fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      console.error(`  ⚠ Failed to write index ${filePath}: ${e.message}`);
    }
  }

  // ── Load / Save ──────────────────────────────────────────

  load() {
    if (this._loaded) return;
    this.memoryIndex = this._readJson(this.memoryIndexPath, {});
    this.topicIndex = this._readJson(this.topicIndexPath, {});
    this.recencyIndex = this._readJson(this.recencyIndexPath, []);
    this._loaded = true;
  }

  save() {
    this._atomicWriteJson(this.memoryIndexPath, this.memoryIndex);
    this._atomicWriteJson(this.topicIndexPath, this.topicIndex);
    this._atomicWriteJson(this.recencyIndexPath, this.recencyIndex);
  }

  _readJson(filePath, fallback) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {
      console.warn(`  ⚠ Failed to read index ${filePath}: ${e.message}`);
    }
    return fallback;
  }

  _writeJson(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (e) {
      console.error(`  ⚠ Failed to write index ${filePath}: ${e.message}`);
    }
  }

  // ── Index Operations ─────────────────────────────────────

  /**
   * Add or update a memory in all three indices.
   * Called after storeMemory() or during bulk hatch index build.
   */
  addMemory(memId, meta) {
    this.load();

    // Normalize topics through stemming + synonym canonicalization
    const topics = normalizeTopics(meta.topics || []);

    // 1. memoryIndex
    this.memoryIndex[memId] = {
      importance: meta.importance ?? 0.5,
      decay: meta.decay ?? 1.0,
      topics,
      created: meta.created || new Date().toISOString(),
      emotion: meta.emotion || '',
      emotionalTag: meta.emotionalTag || null,
      type: meta.type || 'episodic',
      userId: meta.userId || null,
      userName: meta.userName || null
    };

    // 2. topicIndex
    for (const topic of topics) {
      if (!this.topicIndex[topic]) this.topicIndex[topic] = [];
      if (!this.topicIndex[topic].includes(memId)) {
        this.topicIndex[topic].push(memId);
      }
    }

    // 3. recencyIndex — insert in sorted position (newest first)
    const lastAccessed = meta.last_accessed || meta.created || new Date().toISOString();
    // Remove existing entry if present
    this.recencyIndex = this.recencyIndex.filter(e => e.memId !== memId);
    // Insert at correct position
    const entry = { memId, lastAccessed, created: meta.created || new Date().toISOString() };
    let inserted = false;
    for (let i = 0; i < this.recencyIndex.length; i++) {
      if (lastAccessed >= this.recencyIndex[i].lastAccessed) {
        this.recencyIndex.splice(i, 0, entry);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.recencyIndex.push(entry);
  }

  /**
   * Update decay value for a memory (called during decay cycle).
   */
  updateDecay(memId, newDecay) {
    this.load();
    if (this.memoryIndex[memId]) {
      this.memoryIndex[memId].decay = newDecay;
    }
  }

  /**
   * Update last accessed time (called on memory access).
   */
  touchMemory(memId) {
    this.load();
    const now = new Date().toISOString();

    // Update recency
    this.recencyIndex = this.recencyIndex.filter(e => e.memId !== memId);
    const created = this.memoryIndex[memId]?.created || now;
    this.recencyIndex.unshift({ memId, lastAccessed: now, created });
  }

  /**
   * Remove a memory from all indices.
   */
  removeMemory(memId) {
    this.load();

    // Remove from topic index
    const meta = this.memoryIndex[memId];
    if (meta) {
      for (const topic of (meta.topics || [])) {
        if (this.topicIndex[topic]) {
          this.topicIndex[topic] = this.topicIndex[topic].filter(id => id !== memId);
          if (this.topicIndex[topic].length === 0) delete this.topicIndex[topic];
        }
      }
    }

    // Remove from memory index
    delete this.memoryIndex[memId];

    // Remove from recency index
    this.recencyIndex = this.recencyIndex.filter(e => e.memId !== memId);
  }

  // ── Query Methods ────────────────────────────────────────

  /**
   * Get metadata for a specific memory (O(1) lookup).
   */
  getMemoryMeta(memId) {
    this.load();
    return this.memoryIndex[memId] || null;
  }

  /**
   * Find memories by topic (O(1) lookup).
   */
  getMemoriesByTopic(topic) {
    this.load();

    // Expand query topic into all normalized/stemmed/synonym variants
    const queryKeys = expandQueryTopic(topic);
    const matchSet = new Set();

    for (const key of queryKeys) {
      // Exact index hit
      if (this.topicIndex[key]) {
        for (const id of this.topicIndex[key]) matchSet.add(id);
      }
      // Substring match against stored topics (both directions)
      if (key.length >= 4) {
        for (const [storedTopic, memIds] of Object.entries(this.topicIndex)) {
          if (storedTopic.includes(key) || key.includes(storedTopic)) {
            for (const id of memIds) matchSet.add(id);
          }
        }
      }
    }

    return [...matchSet];
  }

  /**
   * Get most recently accessed memories.
   */
  getRecentMemories(limit = 50) {
    this.load();
    return this.recencyIndex.slice(0, limit);
  }

  /**
   * Get all memory IDs (no folder scan needed).
   */
  getAllMemoryIds() {
    this.load();
    return Object.keys(this.memoryIndex);
  }

  /**
   * Get total memory count (O(1)).
   */
  getCount() {
    this.load();
    return Object.keys(this.memoryIndex).length;
  }

  /**
   * Get all topics and their memory counts.
   */
  getTopicSummary() {
    this.load();
    const summary = {};
    for (const [topic, memIds] of Object.entries(this.topicIndex)) {
      summary[topic] = memIds.length;
    }
    return summary;
  }

  /**
   * Get stats from index without scanning folders.
   */
  getStats() {
    this.load();
    const memIds = Object.keys(this.memoryIndex);
    let totalDecay = 0;
    let totalAccess = 0;
    const typeDistribution = {};

    for (const meta of Object.values(this.memoryIndex)) {
      totalDecay += meta.decay ?? 1.0;
      typeDistribution[meta.type] = (typeDistribution[meta.type] || 0) + 1;
    }

    return {
      total_memories: memIds.length,
      avg_decay: memIds.length > 0 ? totalDecay / memIds.length : 1.0,
      memory_types: typeDistribution,
      total_topics: Object.keys(this.topicIndex).length
    };
  }

  // ── Bulk Operations ──────────────────────────────────────

  /**
   * Build index from scratch by scanning memory folders.
   * Used during hatch or when index files are missing/corrupt.
   */
  buildFromDisk(episodicMemDir, semanticMemDir, ltmMemDir = null) {
    this.memoryIndex = {};
    this.topicIndex = {};
    this.recencyIndex = [];
    this._loaded = true;

    const scanDir = (dir) => {
      if (!dir || !fs.existsSync(dir)) return 0;
      const memDirs = fs.readdirSync(dir);
      let count = 0;
      for (const memId of memDirs) {
        const memPath = path.join(dir, memId);
        if (!fs.existsSync(memPath) || !fs.statSync(memPath).isDirectory()) continue;
        const logPath = path.join(dir, memId, 'log.json');
        if (!fs.existsSync(logPath)) continue;
        try {
          const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
          this.addMemory(memId, {
            importance: log.importance,
            decay: log.decay,
            topics: log.topics || [],
            created: log.created,
            emotion: log.emotion || '',
            type: log.type || 'episodic',
            last_accessed: log.last_accessed
          });
          count++;
        } catch (e) {
          // Skip corrupt logs
        }
      }
      return count;
    };

    const indexed = scanDir(episodicMemDir) + scanDir(semanticMemDir) + scanDir(ltmMemDir);

    this.save();
    console.log(`  ✓ Built memory index: ${indexed} memories indexed`);
    return indexed;
  }

  /**
   * Compare index contents against on-disk memory folders.
   */
  auditAgainstDisk(dirs = []) {
    this.load();

    const diskSet = new Set();
    for (const dir of dirs) {
      if (!dir || !fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, name);
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) continue;
        const logPath = path.join(fullPath, 'log.json');
        if (fs.existsSync(logPath)) {
          diskSet.add(name);
        }
      }
    }

    const indexSet = new Set(Object.keys(this.memoryIndex || {}));
    const missingInIndex = [...diskSet].filter((id) => !indexSet.has(id));
    const staleInIndex = [...indexSet].filter((id) => !diskSet.has(id));

    return {
      diskCount: diskSet.size,
      indexCount: indexSet.size,
      missingInIndex,
      staleInIndex,
      diverged: missingInIndex.length > 0 || staleInIndex.length > 0
    };
  }

  /**
   * Bulk add memories (used during hatch to avoid repeated disk writes).
   * Call save() once after all adds.
   */
  bulkAdd(memoriesMetaArray) {
    this.load();
    for (const { memId, meta } of memoriesMetaArray) {
      this.addMemory(memId, meta);
    }
  }
}

module.exports = MemoryIndexCache;
