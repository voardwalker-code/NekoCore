const path = require('path');

const MemoryService = require('./memory-service');
const TraceGraph = require('../brain/trace-graph');
const GoalsManager = require('../brain/goals-manager');
const DreamEngine = require('../brain/dream-engine');
const DreamVisualizer = require('../brain/dream-visualizer');
const BeliefGraph = require('../beliefs/beliefGraph');
const MemoryGraph = require('../brain/memory-graph');
const MemoryGraphBuilder = require('../brain/memory-graph-builder');
const Neurochemistry = require('../brain/neurochemistry');
const SomaticAwareness = require('../brain/somatic-awareness');
const SkillManager = require('../brain/skill-manager');
const CuriosityEngine = require('../brain/curiosity-engine');
const BoredomEngine = require('../brain/boredom-engine');
const CognitivePulse = require('../brain/cognition/cognitive-pulse');
const DreamSeedPool = require('../brain/cognition/dream-seed-pool');
const DreamMemory = require('../brain/memory/dream-memory');

class EntityRuntime {
  /**
   * @param {Object} globals - Shared singletons from server startup
   * @param {Object} globals.cognitiveBus
   * @param {Object} globals.modelRouter
   * @param {Object} globals.attentionSystem
   * @param {Object} globals.identityManager
   * @param {Object} globals.consciousEngine
   * @param {Object} globals.archiveManager
   * @param {Object} globals.hatchEntity
   * @param {Function} globals.loadConfig
   * @param {Function} globals.broadcastSSE
   */
  constructor(globals = {}) {
    this.globals = globals;

    this.entityId = null;
    this.entityPath = null;

    this.memoryService = null;
    this.memoryStorage = null;
    this.traceGraph = null;
    this.goalsManager = null;
    this.dreamEngine = null;
    this.dreamVisualizer = null;
    this.beliefGraph = null;
    this.neurochemistry = null;
    this.somaticAwareness = null;
    this.skillManager = null;
    this.memoryGraph = null;
    this.memoryGraphBuilder = null;
    this.curiosityEngine = null;
    this.boredomEngine = null;
    this.cognitivePulse = null;
    this.dreamSeedPool = null;
    this.dreamMemory = null;
  }

  get isActive() {
    return !!this.entityId;
  }

  getMemoryRoot() {
    if (!this.entityId) return null;
    try {
      const entityPaths = require('../entities/entityPaths');
      return entityPaths.getMemoryRoot(this.entityId);
    } catch {
      return null;
    }
  }

  activate(entityId) {
    const entityPaths = require('../entities/entityPaths');
    const { cognitiveBus, modelRouter, attentionSystem, identityManager, consciousEngine, archiveManager, hatchEntity, loadConfig, broadcastSSE } = this.globals;

    const entityDir = entityPaths.getEntityRoot(entityId);
    const entityMemDir = entityPaths.getMemoryRoot(entityId);

    this.entityId = entityId;
    this.entityPath = entityDir;

    this.memoryService = new MemoryService(entityId, { cognitiveBus });
    this.memoryStorage = this.memoryService.storage;
    this.traceGraph = new TraceGraph({ memDir: path.join(entityMemDir, 'episodic') });
    this.goalsManager = new GoalsManager({ memDir: entityMemDir });
    this.dreamEngine = new DreamEngine({ memDir: path.join(entityMemDir, 'dreams'), memStorage: this.memoryStorage });

    const _sleepCfg = (loadConfig ? loadConfig().sleep : {}) || {};
    this.dreamVisualizer = new DreamVisualizer({
      modelRouter,
      imageGenMode: _sleepCfg.imageGenMode || 'off',
      imageApiEndpoint: _sleepCfg.imageApiEndpoint || '',
      imageApiKey: _sleepCfg.imageApiKey || '',
      imageApiModel: _sleepCfg.imageApiModel || ''
    });

    this.beliefGraph = new BeliefGraph({ entityId, cognitiveBus });

    if (identityManager) identityManager.setMemDir(entityMemDir);
    if (consciousEngine) {
      consciousEngine.setMemDir(entityMemDir);
      consciousEngine.setEntityId(entityId);
    }
    if (archiveManager) archiveManager.setMemDir(entityMemDir);

    if (hatchEntity) {
      hatchEntity.entityId = entityId;
      hatchEntity.entityDir = entityDir;
      hatchEntity.entityFile = path.join(entityDir, 'entity.json');
    }

    try {
      this.memoryGraphBuilder = new MemoryGraphBuilder({
        memDir: entityPaths.getEpisodicMemoryPath(entityId),
        semanticDir: entityPaths.getSemanticMemoryPath(entityId),
        ltmDir: entityPaths.getLtmPath(entityId),
        dreamsDir: entityPaths.getDreamMemoryPath(entityId),
        cognitiveBus
      });
      this.memoryGraph = this.memoryGraphBuilder.buildGraph();
      console.log(`  \u2713 Memory graph loaded for entity ${entityId}`);
    } catch (err) {
      console.warn(`  \u26A0 Could not build memory graph: ${err.message}`);
      this.memoryGraph = new MemoryGraph({ cognitiveBus });
    }
    this.memoryService._graph = this.memoryGraph;

    this.neurochemistry = new Neurochemistry({ cognitiveBus, memoryGraph: this.memoryGraph, beliefGraph: this.beliefGraph, entityId });

    this.somaticAwareness = new SomaticAwareness({ cognitiveBus, neurochemistry: this.neurochemistry, memoryStorage: this.memoryStorage });
    this.somaticAwareness.startPolling(15000);

    this.skillManager = new SkillManager({ entityId });
    this.skillManager.loadAll();

    if (attentionSystem) attentionSystem.neurochemistry = this.neurochemistry;

    this.curiosityEngine = new CuriosityEngine({ cognitiveBus, memoryGraph: this.memoryGraph, identityManager });
    this.curiosityEngine.start();

    this.boredomEngine = new BoredomEngine({ cognitiveBus, neurochemistry: this.neurochemistry, goalsManager: this.goalsManager, identityManager, memoryStorage: this.memoryStorage });
    if (broadcastSSE) {
      this.boredomEngine.setActionCallback((action) => broadcastSSE('brain_boredom_action', action));
    }
    this.boredomEngine.start();

    // Cognitive pulse — low-cost 200ms memory graph walker
    this.dreamSeedPool = new DreamSeedPool(20);
    this.cognitivePulse = new CognitivePulse({
      memoryGraph: this.memoryGraph,
      dreamSeedPool: this.dreamSeedPool
    });
    this.cognitivePulse.start();

    // Dream Memory — multi-tier dream storage (Phase 9)
    this.dreamMemory = new DreamMemory({ entityId });

    console.log(`  \u2713 Switched to entity: ${entityId}`);
  }

  deactivate() {
    this.entityId = null;
    this.entityPath = null;
    this.memoryService = null;
    this.memoryStorage = null;
    this.traceGraph = null;
    this.goalsManager = null;
    this.dreamEngine = null;
    this.beliefGraph = null;
    this.neurochemistry = null;
    try { this.globals?.consciousEngine?.setEntityId(null); } catch (_) {}
    if (this.somaticAwareness) { this.somaticAwareness.destroy(); this.somaticAwareness = null; }
    if (this.curiosityEngine) { try { this.curiosityEngine.stop?.(); } catch (_) {} this.curiosityEngine = null; }
    if (this.boredomEngine) { try { this.boredomEngine.stop?.(); } catch (_) {} this.boredomEngine = null; }
    if (this.cognitivePulse) { try { this.cognitivePulse.stop(); } catch (_) {} this.cognitivePulse = null; }
    this.dreamSeedPool = null;
    this.dreamMemory = null;
    this.skillManager = null;
    this.memoryGraph = null;
    this.memoryGraphBuilder = null;
    console.log('  \u2713 Cleared active entity context');
  }
}

module.exports = EntityRuntime;
