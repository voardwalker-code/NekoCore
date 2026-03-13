// ============================================================
// MemoryService — Unified Memory Facade
//
// Single entry point for all memory operations.  Consumers
// (routes, brain modules) import this instead of reaching into
// the individual memory backends directly.
//
// Backed by:
//   MemoryStorage   — episodic/semantic/dream file storage
//   MemoryIndex     — in-memory topical search index
//   MemoryGraph     — spreading-activation connection graph
//   ArchiveManager  — chatlog archiving pipeline
// ============================================================

const MemoryStorage    = require('../brain/memory/memory-storage');
const MemoryIndex      = require('../brain/memory/memory-index');
const MemoryGraph      = require('../brain/memory/memory-graph');
const ArchiveManager   = require('../brain/memory/archive-manager');
const ConsciousMemory  = require('../brain/memory/conscious-memory');
const MemoryImages     = require('../brain/memory/memory-images');
const ImageGenerator   = require('../brain/generation/image-generator');
const entityPaths      = require('../entities/entityPaths');
const configService    = require('./config-service');
const { normalizeMemoryRecord } = require('../contracts/memory-schema');

class MemoryService {
  /**
   * @param {string} entityId
   * @param {Object} [options]
   * @param {Object} [options.cognitiveBus]  — CognitiveBus instance for graph events
   */
  constructor(entityId, options = {}) {
    this.entityId = entityId;
    const memDir = entityPaths.getMemoryRoot(entityId);

    this._storage   = new MemoryStorage({ entityId });
    this._graph     = new MemoryGraph({ cognitiveBus: options.cognitiveBus || null });
    this._index     = new MemoryIndex();
    this._archive   = new ArchiveManager({ memDir });
    this._conscious = new ConsciousMemory({ entityId });
    this._images    = new MemoryImages({ entityId });
  }

  // ── Storage ─────────────────────────────────────────────

  /** Store a new memory entry and index it. Returns the memId string. */
  async store(memory) {
    const normalized = normalizeMemoryRecord(memory, {
      defaultType: (memory && memory.type) || 'episodic'
    });
    const memoryToStore = Object.assign({}, memory, normalized);
    const memId = await this._storage.storeMemory(memoryToStore);
    const memWithId = Object.assign({}, memoryToStore, { id: memId, memory_id: memId });
    if (memoryToStore.type === 'semantic') {
      this._index.addSemanticMemory(memoryToStore);
    } else {
      this._index.addEpisodicMemory(memoryToStore);
    }

    // Phase 11: optional image generation per memory.
    try {
      const cfg = (configService.load && configService.load()) || {};
      const imageCfg = cfg.imageGeneration || cfg?.sleep?.imageGeneration || {};
      const imageGen = new ImageGenerator({ entityId: this.entityId, config: imageCfg });
      const generated = await imageGen.generateForMemory(memWithId);
      if (generated && generated.imagePath) {
        this._images.setImagePath(memId, generated.imagePath, {
          prompt: generated.prompt,
          backend: generated.backend
        });
      }
    } catch (_) {
      // Non-blocking: memory persistence must succeed even if image generation fails.
    }

    return memId;
  }

  /** Retrieve a memory by ID */
  async retrieve(memId) {
    const memory = await this._storage.retrieveMemory(memId);
    if (!memory) return null;
    return Object.assign({}, memory, normalizeMemoryRecord(memory, {
      defaultId: memId,
      defaultType: memory.type || 'episodic'
    }));
  }

  /** List recent memories */
  async list(limit = 50, offset = 0) {
    return this._storage.listMemories(limit, offset);
  }

  // ── Search ───────────────────────────────────────────────

  /** Topic-based search via the in-memory index */
  search(topics, limit = 5) {
    return this._index.searchMemories(topics, limit);
  }

  /** Spreading activation across the memory graph */
  activate(seedMemoryIds, hops = 2) {
    return this._graph.spreadActivation(seedMemoryIds, hops);
  }

  // ── Maintenance ──────────────────────────────────────────

  /** Apply decay to all stored memories */
  async applyDecay(rate = 0.02) {
    return this._storage.decayMemories(rate);
  }

  // ── Dreams ───────────────────────────────────────────────

  async storeDream(dream)           { return this._storage.storeDream(dream); }
  async retrieveDream(dreamId)      { return this._storage.retrieveDream(dreamId); }
  async listDreams(limit = 20, offset = 0) { return this._storage.listDreams(limit, offset); }

  // ── Conscious Memory ─────────────────────────────────────────────────

  /** Add a new observation to conscious STM. */
  storeConsciousObservation(entry) {
    return this._conscious.addToStm(entry);
  }

  /**
   * Retrieve topic-matched context from conscious STM + LTM.
   * @param {string[]} topics
   * @param {number}   [limit=5]
   * @returns {Object[]}
   */
  retrieveConsciousContext(topics, limit = 5) {
    return this._conscious.getContext(topics, limit);
  }

  // ── Accessors (for brain modules that need the raw backends) ───────

  get storage()   { return this._storage; }
  get graph()     { return this._graph; }
  get index()     { return this._index; }
  get archive()   { return this._archive; }
  get conscious() { return this._conscious; }
  get images()    { return this._images; }
}

module.exports = MemoryService;
