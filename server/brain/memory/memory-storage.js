// ============================================================
// REM System — Persistent Memory Storage Module
// Manages permanent episodic and semantic memory with folder structure.
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const entityPaths = require('../../entityPaths');
const MemoryIndexCache = require('./memory-index-cache');
const { normalizeMemoryRecord } = require('../../contracts/memory-schema');

class MemoryStorage {
  constructor(options = {}) {
    this.entityId = options.entityId || null;
    this.indexCache = null;
    this.semanticDir = null;

    if (this.entityId) {
      // Entity-scoped paths — no global dir creation
      this.memDir = entityPaths.getEpisodicMemoryPath(this.entityId);
      this.dreamsDir = entityPaths.getDreamMemoryPath(this.entityId);
      this.semanticDir = entityPaths.getSemanticMemoryPath(this.entityId);
      this.baseDir = entityPaths.getMemoryRoot(this.entityId);
      this.indexCache = new MemoryIndexCache(this.entityId);
    } else {
      // Legacy/global fallback
      const baseDir = options.baseDir || options.memDir || path.join(__dirname, '../../../memories');
      this.memDir = path.join(baseDir, 'Memory2');
      this.dreamsDir = path.join(baseDir, 'dreams');
      this.baseDir = baseDir;
      if (!fs.existsSync(this.memDir)) {
        fs.mkdirSync(this.memDir, { recursive: true });
      }
      if (!fs.existsSync(this.dreamsDir)) {
        fs.mkdirSync(this.dreamsDir, { recursive: true });
      }
    }
  }

  _atomicWrite(filePath, data, encoding = null) {
    const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
    if (encoding) {
      fs.writeFileSync(tmpPath, data, encoding);
    } else {
      fs.writeFileSync(tmpPath, data);
    }
    fs.renameSync(tmpPath, filePath);
  }

  _atomicWriteJson(filePath, value) {
    this._atomicWrite(filePath, JSON.stringify(value, null, 2), 'utf8');
  }

  /**
   * Store a memory permanently with folder structure:
   * Memory2/mem_<id>/
   *   semantic.txt
   *   memory.zip
   *   log.json
   */
  async storeMemory(memory) {
    try {
      const memId = memory.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; 
      const memPath = path.join(this.memDir, memId); 
      
      // Create memory folder
      if (!fs.existsSync(memPath)) {
        fs.mkdirSync(memPath, { recursive: true });
      }
      
      // Store semantic summary
      const semanticPath = path.join(memPath, 'semantic.txt');
      const semantic = memory.semantic || memory.summary || '';
      this._atomicWrite(semanticPath, semantic, 'utf8');
      
      // Compress and store memory content
      if (memory.content) {
        const memoryPath = path.join(memPath, 'memory.zip');
        const compressed = zlib.gzipSync(JSON.stringify(memory.content));
        this._atomicWrite(memoryPath, compressed);
      }
      
      // Store metadata log
      const logPath = path.join(memPath, 'log.json');
      const log = normalizeMemoryRecord(memory, {
        defaultId: memId,
        defaultType: memory.type || 'episodic'
      });
      this._atomicWriteJson(logPath, log);

      // Update index cache
      if (this.indexCache) {
        this.indexCache.addMemory(memId, log);
        this.indexCache.save();
      }

      console.log(`  ✓ Stored memory: ${memId}`);
      return memId;
    } catch (err) {
      console.error('  ⚠ Memory storage failed:', err.message);
      throw err;
    }
  }

  /**
   * Resolve the on-disk directory for a memory ID.
   * sem_ memories live in the semantic directory, everything else in episodic.
   */
  _resolveMemPath(memId) {
    if (this.semanticDir && memId.startsWith('sem_')) {
      return path.join(this.semanticDir, memId);
    }
    return path.join(this.memDir, memId);
  }

  /**
   * Retrieve a memory by ID
   */
  async retrieveMemory(memId) {
    try {
      const memPath = this._resolveMemPath(memId);
      
      if (!fs.existsSync(memPath)) {
        console.warn(`  ⚠ Memory not found: ${memId}`);
        return null;
      }
      
      // Load metadata
      const logPath = path.join(memPath, 'log.json');
      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      
      // Load semantic summary
      const semanticPath = path.join(memPath, 'semantic.txt');
      const semantic = fs.readFileSync(semanticPath, 'utf8');
      
      // Decompress memory content if exists
      let content = null;
      const memoryPath = path.join(memPath, 'memory.zip');
      if (fs.existsSync(memoryPath)) {
        const compressed = fs.readFileSync(memoryPath);
        const decompressed = zlib.gunzipSync(compressed);
        content = JSON.parse(decompressed.toString());
      }
      
      return {
        id: memId,
        ...log,
        semantic,
        content
      };
    } catch (err) {
      console.error(`  ⚠ Memory retrieval failed for ${memId}:`, err.message);
      return null;
    }
  }

  /**
   * Log an access event for a memory
   */
  async logAccess(memId, traceId, triggerType, triggerId = null) {
    try {
      const memPath = this._resolveMemPath(memId);
      const logPath = path.join(memPath, 'log.json');
      
      if (!fs.existsSync(logPath)) {
        console.warn(`  ⚠ Memory log not found: ${memId}`);
        return false;
      }
      
      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      
      log.last_accessed = new Date().toISOString();
      log.access_count = (log.access_count || 0) + 1;
      if (!Array.isArray(log.access_events)) log.access_events = [];
      
      // Add access event
      log.access_events.push({
        trace_id: traceId,
        trigger_type: triggerType, // user_prompt | memory_to_memory | dream_simulation
        trigger_id: triggerId,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 100 access events
      if (log.access_events.length > 100) {
        log.access_events = log.access_events.slice(-100);
      }
      
      this._atomicWriteJson(logPath, log);

      // Update index recency
      if (this.indexCache) {
        this.indexCache.touchMemory(memId);
        this.indexCache.save();
      }

      return true;
    } catch (err) {
      console.error(`  ⚠ Access logging failed for ${memId}:`, err.message);
      return false;
    }
  }

  /**
   * Apply decay to episodic memories with self-healing
   */
  async decayMemories(decayRate = 0.02) {
    try {
      // Use index cache if available for fast iteration
      const memIds = this.indexCache
        ? this.indexCache.getAllMemoryIds()
        : fs.readdirSync(this.memDir);
      let decayedCount = 0;
      let healedCount = 0;
      let totalDecayDelta = 0;
      const sampleChanges = [];

      for (const memId of memIds) {
        const logPath = path.join(this.memDir, memId, 'log.json');

        if (!fs.existsSync(logPath)) continue;

        let log;
        try {
          log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        } catch (parseErr) {
          // Self-healing: repair corrupted log
          log = this.repairCorruptedLog(logPath, memId);
          if (log) {
            healedCount++;
            this._atomicWriteJson(logPath, log);
            console.warn(`  ✓ Repaired corrupted memory log: ${memId}`);
          } else {
            console.warn(`  ⚠ Failed to repair corrupted memory log: ${memId}`);
            continue;
          }
        }

        // Only decay episodic memories (not semantic knowledge or core memories with very low decay)
        if (log.type !== 'episodic' && log.type !== 'core_memory') continue;
        if (log.type === 'semantic_knowledge') continue;

        // Time-based decay: calculate days since creation, apply gentle daily decay
        // Higher importance memories decay much slower
        const createdAt = log.created ? new Date(log.created).getTime() : Date.now();
        const ageDays = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
        const importanceShield = 1 - (log.importance || 0.5) * 0.7; // High importance → slower decay
        const decayFactor = decayRate * importanceShield;
        // Floor at 0.1 so memories never fully vanish
        const beforeDecay = Number(log.decay || 1.0);
        log.decay = Math.max(0.1, beforeDecay * (1 - decayFactor));
        const decayDelta = Math.max(0, beforeDecay - log.decay);
        totalDecayDelta += decayDelta;

        if (sampleChanges.length < 60) {
          sampleChanges.push({
            id: memId,
            type: log.type || 'episodic',
            importance: Number(log.importance || 0.5),
            ageDays: Number(ageDays.toFixed(3)),
            beforeDecay: Number(beforeDecay.toFixed(6)),
            afterDecay: Number(log.decay.toFixed(6)),
            decayDelta: Number(decayDelta.toFixed(6)),
            topics: Array.isArray(log.topics) ? log.topics.slice(0, 6) : []
          });
        }

        this._atomicWriteJson(logPath, log);

        // Update index cache with new decay
        if (this.indexCache) {
          this.indexCache.updateDecay(memId, log.decay);
        }

        decayedCount++;
      }

      // Persist index changes once after batch
      if (this.indexCache && decayedCount > 0) {
        this.indexCache.save();
      }

      if (decayedCount > 0) {
        console.log(`  ✓ Decayed ${decayedCount} episodic memories`);
      }
      if (healedCount > 0) {
        console.log(`  ✓ Healed ${healedCount} corrupted memory logs`);
      }
      sampleChanges.sort((a, b) => b.decayDelta - a.decayDelta);

      return {
        decayed: decayedCount,
        healed: healedCount,
        totalDecayDelta: Number(totalDecayDelta.toFixed(6)),
        avgDecayDelta: Number((decayedCount > 0 ? (totalDecayDelta / decayedCount) : 0).toFixed(8)),
        samples: sampleChanges.slice(0, 20)
      };
    } catch (err) {
      console.error('  ⚠ Memory decay failed:', err.message);
      return { decayed: 0, healed: 0, totalDecayDelta: 0, avgDecayDelta: 0, samples: [] };
    }
  }

  /**
   * Repair corrupted memory log file by recreating with defaults
   */
  repairCorruptedLog(logPath, memoryId) {
    try {
      const memPath = path.dirname(logPath);
      
      // Check if we can determine memory folder name
      const folderName = path.basename(memPath);
      
      // Create new valid log structure
      const newLog = {
        memory_id: memoryId || folderName,
        created: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        access_count: 0,
        access_events: [],
        type: 'episodic',
        decay: 0.5,
        importance: 0.5,
        topics: []
      };
      
      return newLog;
    } catch (err) {
      console.error(`  ⚠ Failed to repair log: ${err.message}`);
      return null;
    }
  }

  /**
   * Scan and repair all corrupted logs in the memory directory
   */
  async healCorruptedMemories() {
    try {
      const memIds = fs.readdirSync(this.memDir);
      let healedCount = 0;
      
      for (const memId of memIds) {
        const logPath = path.join(this.memDir, memId, 'log.json');
        
        if (!fs.existsSync(logPath)) continue;
        
        try {
          JSON.parse(fs.readFileSync(logPath, 'utf8'));
        } catch (parseErr) {
          // Try to repair
          const newLog = this.repairCorruptedLog(logPath, memId);
          if (newLog) {
            this._atomicWriteJson(logPath, newLog);
            healedCount++;
            console.warn(`  ✓ Healed corrupted memory: ${memId}`);
          }
        }
      }
      
      if (healedCount > 0) {
        console.log(`  ✓ Completed self-healing: ${healedCount} memories repaired`);
      }
      return healedCount;
    } catch (err) {
      console.error('  ⚠ Self-healing failed:', err.message);
      return 0;
    }
  }

  /**
   * List all memories with metadata
   */
  async listMemories(limit = 50, offset = 0) {
    try {
      // Fast path: use index cache
      if (this.indexCache) {
        const recent = this.indexCache.getRecentMemories(offset + limit);
        return recent.slice(offset, offset + limit).map(entry => {
          const meta = this.indexCache.getMemoryMeta(entry.memId);
          return {
            id: entry.memId,
            type: meta?.type || 'episodic',
            created: meta?.created || entry.created,
            last_accessed: entry.lastAccessed,
            decay: meta?.decay ?? 1.0,
            importance: meta?.importance ?? 0.5,
            topics: meta?.topics || []
          };
        });
      }

      // Fallback: scan folders
      const memIds = fs.readdirSync(this.memDir)
        .sort()
        .reverse()
        .slice(offset, offset + limit);

      const memories = [];
      for (const memId of memIds) {
        const logPath = path.join(this.memDir, memId, 'log.json');
        if (!fs.existsSync(logPath)) continue;

        const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        memories.push({
          id: memId,
          type: log.type,
          created: log.created,
          last_accessed: log.last_accessed,
          access_count: log.access_count,
          decay: log.decay,
          importance: log.importance,
          topics: log.topics
        });
      }
      return memories;
    } catch (err) {
      console.error('  ⚠ Failed to list memories:', err.message);
      return [];
    }
  }

  /**
   * Store a dream memory (separate from episodic)
   */
  async storeDream(dream) {
    try {
      const dreamId = dream.id || `dream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; 
      const dreamPath = path.join(this.dreamsDir, dreamId); 
      
      // Create dream folder
      if (!fs.existsSync(dreamPath)) {
        fs.mkdirSync(dreamPath, { recursive: true });
      }
      
      // Store semantic summary
      const semanticPath = path.join(dreamPath, 'semantic.txt');
      const semantic = dream.semantic || dream.summary || '';
      this._atomicWrite(semanticPath, semantic, 'utf8');
      
      // Compress and store dream content
      if (dream.content) {
        const dreamContentPath = path.join(dreamPath, 'dream.zip');
        const compressed = zlib.gzipSync(JSON.stringify(dream.content));
        this._atomicWrite(dreamContentPath, compressed);
      }
      
      // Store metadata log
      const logPath = path.join(dreamPath, 'log.json');
      const log = {
        dream_id: dreamId,
        memory_id: dreamId,
        created: dream.created || new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        access_count: 0,
        access_events: [],
        type: 'dream',
        importance: dream.importance || 0.35,
        decay: dream.decay || 0.85,
        topics: dream.topics || ['dream', 'imagination', dream.genre || 'unknown'],
        emotionalTag: dream.emotion || null,
        origin_memories: dream.origin_memories || (dream.origin_memory ? [dream.origin_memory] : []),
        genre: dream.genre || null,
        genre_label: dream.genre_label || null,
        simulation_confidence: dream.simulation_confidence || 0.0,
        emotion: dream.emotion || null,
        is_dream: true
      };
      this._atomicWriteJson(logPath, log);
      
      console.log(`  ✓ Stored dream: ${dreamId}`);
      return dreamId;
    } catch (err) {
      console.error('  ⚠ Dream storage failed:', err.message);
      throw err;
    }
  }

  /**
   * Retrieve a dream by ID
   */
  async retrieveDream(dreamId) {
    try {
      const dreamPath = path.join(this.dreamsDir, dreamId);
      
      if (!fs.existsSync(dreamPath)) {
        console.warn(`  ⚠ Dream not found: ${dreamId}`);
        return null;
      }
      
      // Load metadata
      const logPath = path.join(dreamPath, 'log.json');
      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      
      // Load semantic summary
      const semanticPath = path.join(dreamPath, 'semantic.txt');
      const semantic = fs.readFileSync(semanticPath, 'utf8');
      
      // Decompress dream content if exists
      let content = null;
      const dreamContentPath = path.join(dreamPath, 'dream.zip');
      if (fs.existsSync(dreamContentPath)) {
        const compressed = fs.readFileSync(dreamContentPath);
        const decompressed = zlib.gunzipSync(compressed);
        content = JSON.parse(decompressed.toString());
      }
      
      return {
        id: dreamId,
        ...log,
        semantic,
        content
      };
    } catch (err) {
      console.error(`  ⚠ Dream retrieval failed for ${dreamId}:`, err.message);
      return null;
    }
  }

  /**
   * List all dreams
   */
  async listDreams(limit = 20, offset = 0) {
    try {
      if (!fs.existsSync(this.dreamsDir)) {
        return [];
      }
      
      const dreamIds = fs.readdirSync(this.dreamsDir)
        .sort()
        .reverse()
        .slice(offset, offset + limit);
      
      const dreams = [];
      for (const dreamId of dreamIds) {
        const logPath = path.join(this.dreamsDir, dreamId, 'log.json');
        if (!fs.existsSync(logPath)) continue;
        
        const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        dreams.push({
          id: dreamId,
          origin_memory: log.origin_memory,
          scenario_type: log.scenario_type,
          created: log.created,
          simulation_confidence: log.simulation_confidence
        });
      }
      return dreams;
    } catch (err) {
      console.error('  ⚠ Failed to list dreams:', err.message);
      return [];
    }
  }

  /**
   * Get memory statistics
   */
  async getStats() {
    try {
      // Fast path: use index cache
      if (this.indexCache) {
        const indexStats = this.indexCache.getStats();
        let dreamCount = 0;
        try { dreamCount = fs.readdirSync(this.dreamsDir).length; } catch (e) {}
        return {
          total_memories: indexStats.total_memories,
          total_dreams: dreamCount,
          avg_decay: indexStats.avg_decay,
          memory_types: indexStats.memory_types,
          total_topics: indexStats.total_topics
        };
      }

      // Fallback: scan folders
      const memIds = fs.readdirSync(this.memDir);
      const dreamIds = fs.readdirSync(this.dreamsDir);

      let totalAccessCount = 0;
      let totalDecay = 0;
      let typeDistribution = { episodic: 0, semantic: 0 };

      for (const memId of memIds) {
        const logPath = path.join(this.memDir, memId, 'log.json');
        if (!fs.existsSync(logPath)) continue;

        const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        totalAccessCount += log.access_count || 0;
        totalDecay += log.decay || 1.0;
        typeDistribution[log.type] = (typeDistribution[log.type] || 0) + 1;
      }

      return {
        total_memories: memIds.length,
        total_dreams: dreamIds.length,
        total_accesses: totalAccessCount,
        avg_decay: memIds.length > 0 ? totalDecay / memIds.length : 1.0,
        memory_types: typeDistribution
      };
    } catch (err) {
      console.error('  ⚠ Failed to get stats:', err.message);
      return {};
    }
  }
}

module.exports = MemoryStorage;
