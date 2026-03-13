// ============================================================
// REM System â€” Brain Loop Module
// Thin scheduler that drives 14 cognitive phases every 30 seconds.
// Phase logic lives in ./phases/ â€” each file exports async fn(loop).
// ============================================================

const fs = require('fs');
const path = require('path');
const ThoughtTypes = require('../bus/thought-types');
const PHASES = require('./phases');

class BrainLoop {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories');
    this.interval = options.interval || 30000; // Check every 30s
    this._baseInterval = this.interval;        // Original interval (for throttle recovery)
    this.running = false;
    this.loopHandle = null;
    this.cycleCount = 0;
    this.lastDecayTime = 0; // Track last decay to ensure daily-only
    this._stateFile = null; // Set when entity memDir is known
    this._lastDirectives = null; // Most recent homeostatic directives

    // New subsystems (optional, can be injected)
    this.memoryStorage = options.memoryStorage || null;
    this.traceGraph = options.traceGraph || null;
    this.dreamEngine = options.dreamEngine || null;
    this.goalsManager = options.goalsManager || null;
    this.modelRouter = options.modelRouter || null;
    this.beliefGraph = options.beliefGraph || null;
    this.neurochemistry = options.neurochemistry || null;
    this.somaticAwareness = options.somaticAwareness || null;
    this.boredomEngine = options.boredomEngine || null;
    this.dreamVisualizer = options.dreamVisualizer || null;
    this.consciousMemory = options.consciousMemory || null;
    this.cognitivePulse = options.cognitivePulse || null;
    this.dreamSeedPool = options.dreamSeedPool || null;
    this.dreamMemory = options.dreamMemory || null;
    this.dreamInterval = options.dreamInterval || 5; // Phase 9: dreams fire every N cycles
    this.deepSleepInterval = options.deepSleepInterval || 150; // DeepSleep cadence (cycles)

    // Optional event callback for real-time streaming (SSE)
    this._onEvent = options.onEvent || null;

    // Token limit resolver (injected from server)
    this._getTokenLimit = options.getTokenLimit || ((key) => null);

    // Phase 15 Track 3: runtime health counters + circuit-breaker diagnostics
    this._health = {
      totalTicks: 0,
      successfulTicks: 0,
      failedTicks: 0,
      consecutiveTickFailures: 0,
      totalPhaseRuns: 0,
      totalPhaseErrors: 0,
      perPhase: {},
      circuitBreakerOpen: false,
      circuitBreakerReason: null,
      circuitOpenedAt: null,
      circuitCooldownUntil: null,
      lastTickStartedAt: null,
      lastTickCompletedAt: null,
      lastError: null,
      lastTickDurationMs: 0,
      avgTickDurationMs: 0
    };
    this._maxConsecutiveTickFailures = Number.isFinite(options.maxConsecutiveTickFailures)
      ? options.maxConsecutiveTickFailures
      : 3;
    this._maxPhaseErrorsPerTick = Number.isFinite(options.maxPhaseErrorsPerTick)
      ? options.maxPhaseErrorsPerTick
      : 5;
    this._circuitBreakerCooldownMs = Number.isFinite(options.circuitBreakerCooldownMs)
      ? options.circuitBreakerCooldownMs
      : 120000;
  }

  _ensurePhaseHealth(name) {
    if (!this._health.perPhase[name]) {
      this._health.perPhase[name] = {
        runs: 0,
        errors: 0,
        consecutiveErrors: 0,
        lastError: null,
        lastRunAt: null
      };
    }
    return this._health.perPhase[name];
  }

  _openCircuitBreaker(reason) {
    this._health.circuitBreakerOpen = true;
    this._health.circuitBreakerReason = reason;
    this._health.circuitOpenedAt = Date.now();
    this._health.circuitCooldownUntil = Date.now() + this._circuitBreakerCooldownMs;
    this._emit('health', {
      status: 'circuit_open',
      reason,
      cooldownUntil: this._health.circuitCooldownUntil
    });
  }

  _tryCloseCircuitBreaker() {
    if (!this._health.circuitBreakerOpen) return;
    if (Date.now() < (this._health.circuitCooldownUntil || 0)) return;
    this._health.circuitBreakerOpen = false;
    this._health.circuitBreakerReason = null;
    this._health.circuitOpenedAt = null;
    this._health.circuitCooldownUntil = null;
    this._health.consecutiveTickFailures = 0;
    this._emit('health', { status: 'circuit_closed' });
  }

  /**
   * Load persisted brain loop state (cycleCount) from disk.
   */
  _loadState() {
    try {
      if (fs.existsSync(this._stateFile)) {
        const data = JSON.parse(fs.readFileSync(this._stateFile, 'utf8'));
        if (typeof data.cycleCount === 'number' && data.cycleCount > 0) {
          this.cycleCount = data.cycleCount;
          console.log(`  âœ“ Brain loop state restored: cycle ${this.cycleCount}`);
        }
      }
    } catch (err) {
      console.warn('  âš  Could not restore brain loop state:', err.message);
    }
  }

  /**
   * Persist brain loop state (cycleCount) to disk.
   */
  _saveState() {
    if (!this._stateFile) return;
    try {
      fs.writeFileSync(this._stateFile, JSON.stringify({ cycleCount: this.cycleCount, savedAt: new Date().toISOString() }), 'utf8');
    } catch (_) {}
  }

  /**
   * Set the event callback for real-time brain loop status streaming.
   */
  setOnEvent(fn) {
    if (typeof fn === 'function') this._onEvent = fn;
  }

  /**
   * Emit a brain loop event through the callback.
   */
  _emit(event, data = {}) {
    if (this._onEvent) {
      try { this._onEvent(event, { ...data, cycle: this.cycleCount, timestamp: Date.now() }); } catch (_) {}
    }
  }

  /**
   * Initialize the brain loop (legacy compatibility)
   */
  init(options = {}) {
    // Update memDir and state file if entity path is provided
    if (options.memoryDir) {
      this.memDir = options.memoryDir;
      if (!fs.existsSync(this.memDir)) {
        fs.mkdirSync(this.memDir, { recursive: true });
      }
    }
    this._stateFile = path.join(this.memDir, 'brain-loop-state.json');
    this._loadState();

    // Accept injection of subsystems via options for backward compatibility
    // and start the loop with available engines/managers.
    if (options.memoryStorage) this.memoryStorage = options.memoryStorage;
    if (options.traceGraph) this.traceGraph = options.traceGraph;
    if (options.dreamEngine) this.dreamEngine = options.dreamEngine;
    if (options.goalsManager) this.goalsManager = options.goalsManager;
    if (options.modelRouter) this.modelRouter = options.modelRouter;
    if (options.beliefGraph) this.beliefGraph = options.beliefGraph;
    if (options.neurochemistry) this.neurochemistry = options.neurochemistry;
    if (options.aspectConfigs) this._aspectConfigs = options.aspectConfigs;
    if (options.boredomEngine) this.boredomEngine = options.boredomEngine;
    if (options.dreamVisualizer) this.dreamVisualizer = options.dreamVisualizer;
    if (options.consciousMemory) this.consciousMemory = options.consciousMemory;
    if (options.cognitivePulse) this.cognitivePulse = options.cognitivePulse;
    if (options.dreamSeedPool) this.dreamSeedPool = options.dreamSeedPool;
    if (options.dreamMemory) this.dreamMemory = options.dreamMemory;
    if (options.dreamInterval != null) this.dreamInterval = options.dreamInterval;
    if (options.deepSleepInterval != null) this.deepSleepInterval = options.deepSleepInterval;

    // Start the loop using any provided parameters (or null if absent)
    this.start(
      options.consciousEngine || null,
      options.subconsciousAgent || null,
      options.memoryIndex || null,
      options.identityManager || null,
      options.callLLM || null
    );
  }

  /**
   * Start the brain loop with extended subsystems
   * Runs periodic subconscious cycles, dreams, trace updates, goal emergence
   */
  /**
   * Start the brain loop with extended subsystems.
   * Stores subsystem references so phase functions can access them via loop.*.
   */
  start(consciousEngine, subconsciousAgent, memoryIndex, identityManager, callLLM = null) {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this._identityManager = identityManager;
    this._callLLM = callLLM;
    this._subconsciousAgent = subconsciousAgent;
    this._memoryIndex = memoryIndex;
    console.log('  âœ“ Brain loop started with extended subsystems');
    this.loopHandle = setInterval(() => this.tick(), this.interval);
  }

  /**
   * Execute one brain loop cycle â€” runs all 14 cognitive phases with per-phase error isolation.
   */
  async tick() {
    this._tryCloseCircuitBreaker();
    if (this._health.circuitBreakerOpen) {
      this._emit('cycle_skipped', {
        reason: 'circuit_breaker_open',
        cooldownUntil: this._health.circuitCooldownUntil
      });
      return;
    }

    try {
      const cycleStartTime = Date.now();
      this._health.totalTicks++;
      this._health.lastTickStartedAt = cycleStartTime;
      this.cycleCount++;
      this._saveState();
      // Interrupt cognitive pulse — capture what the entity was thinking about
      if (this.cognitivePulse) {
        const interrupted = this.cognitivePulse.interrupt('brain_loop_tick');
        if (interrupted) {
          console.log(`  ℹ Pulse interrupted: was thinking about [${interrupted.title}]`);
        }
      }
      // â”€â”€ Homeostatic check â”€â”€ read somatic directives from last tick
      const directives = this.somaticAwareness
        ? this.somaticAwareness.getHomeostaticDirectives()
        : null;
      this._lastDirectives = directives;

      if (directives && directives.reason.length > 0) {
        console.log(`  âš  Homeostasis: ${directives.reason.join('; ')}`);
        this._emitHomeostaticResponse(directives);
      }

      const deepSleepInterval = this.deepSleepInterval || 150;
      const cyclesUntilDeepSleep = deepSleepInterval - (this.cycleCount % deepSleepInterval);
      const deepSleepNote = cyclesUntilDeepSleep === deepSleepInterval ? ' âŸ DeepSleep THIS cycle' : ` (DeepSleep in ${cyclesUntilDeepSleep} cycles)`;
      console.log(`  â„¹ Brain loop cycle ${this.cycleCount}${this.beliefGraph ? deepSleepNote : ''}`);
      this._emit('cycle_start', { cycleCount: this.cycleCount, cyclesUntilDeepSleep: this.beliefGraph ? cyclesUntilDeepSleep : null });

      // Run all cognitive phases with per-phase error isolation
      let phaseErrorsThisTick = 0;
      for (const [name, phaseFn] of PHASES) {
        const phaseHealth = this._ensurePhaseHealth(name);
        phaseHealth.runs++;
        phaseHealth.lastRunAt = Date.now();
        this._health.totalPhaseRuns++;
        try {
          await phaseFn(this);
          phaseHealth.consecutiveErrors = 0;
        } catch (err) {
          phaseErrorsThisTick++;
          phaseHealth.errors++;
          phaseHealth.consecutiveErrors++;
          phaseHealth.lastError = err.message;
          this._health.totalPhaseErrors++;
          this._health.lastError = err.message;
          console.error(`  âš  Brain loop phase [${name}] error:`, err.message);
          this._emit('phase', { name, status: 'error', error: err.message });
        }
      }

      this._emit('cycle_complete', { cycleCount: this.cycleCount });

      // Report cycle duration to somatic awareness
      if (this.somaticAwareness) {
        this.somaticAwareness.reportCycleTime(Date.now() - cycleStartTime);
      }

      const tickDuration = Date.now() - cycleStartTime;
      this._health.successfulTicks++;
      this._health.consecutiveTickFailures = 0;
      this._health.lastTickCompletedAt = Date.now();
      this._health.lastTickDurationMs = tickDuration;
      const completedTicks = Math.max(1, this._health.successfulTicks);
      this._health.avgTickDurationMs = Math.round(
        ((this._health.avgTickDurationMs * (completedTicks - 1)) + tickDuration) / completedTicks
      );
      if (phaseErrorsThisTick >= this._maxPhaseErrorsPerTick) {
        this._openCircuitBreaker(`phase_error_threshold:${phaseErrorsThisTick}`);
      }

      // â”€â”€ Dynamic interval adjustment based on homeostatic directives â”€â”€
      if (directives && directives.throttleMultiplier !== 1.0) {
        const desired = Math.round(this._baseInterval * directives.throttleMultiplier);
        if (desired !== this.interval) {
          this.interval = desired;
          clearInterval(this.loopHandle);
          this.loopHandle = setInterval(() => this.tick(), this.interval);
          console.log(`  âš  Brain loop throttled to ${this.interval}ms (Ã—${directives.throttleMultiplier})`);
        }
      } else if (this.interval !== this._baseInterval) {
        // Stress resolved â€” restore normal cadence
        this.interval = this._baseInterval;
        clearInterval(this.loopHandle);
        this.loopHandle = setInterval(() => this.tick(), this.interval);
        console.log(`  âœ“ Brain loop restored to ${this.interval}ms`);
      }

    } catch (err) {
      console.error('  âš  Brain loop tick error:', err.message);
      this._health.failedTicks++;
      this._health.consecutiveTickFailures++;
      this._health.lastError = err.message;
      if (this._health.consecutiveTickFailures >= this._maxConsecutiveTickFailures) {
        this._openCircuitBreaker(`consecutive_tick_failures:${this._health.consecutiveTickFailures}`);
      }
    }
  }

  /**
   * Emit a homeostatic response event through the cognitive bus.
   */
  _emitHomeostaticResponse(directives) {
    if (!this.somaticAwareness?.cognitiveBus) return;
    this.somaticAwareness.cognitiveBus.emitThought({
      type: ThoughtTypes.HOMEOSTATIC_RESPONSE,
      source: 'brain_loop',
      directives: {
        throttleMultiplier: directives.throttleMultiplier,
        skippedPhases: [
          directives.skipDreams && 'dreams',
          directives.skipTraceAnalysis && 'trace_analysis',
          directives.skipGoalEmergence && 'goal_emergence',
          directives.skipBeliefExtraction && 'belief_extraction'
        ].filter(Boolean),
        reducedMemoryLoad: directives.reducedMemoryLoad,
        maxMemoryBatchSize: directives.maxMemoryBatchSize
      },
      reason: directives.reason,
      overallStress: this.somaticAwareness.overallStress,
      importance: 0.7
    });
  }

  /**
   * Update aspect runtime configs for brain loop phases (e.g., belief extraction).
   * Called from server when aspect configs change or on first chat message.
   */
  setAspectConfigs(configs) {
    if (configs && typeof configs === 'object') {
      this._aspectConfigs = configs;
    }
  }

  /**
   * Update the callLLM function reference.
   */
  setCallLLM(fn) {
    if (typeof fn === 'function') {
      this._callLLM = fn;
    }
  }

  /**
   * Stop the brain loop
   */
  stop() {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
    this.running = false;
    console.log('  âœ“ Brain loop stopped');
  }

  /**
   * Find unprocessed archives in the memory directory
   */
  getUnprocessedArchives() {
    try {
      const archiveDir = path.join(this.memDir, 'archives');
      if (!fs.existsSync(archiveDir)) return [];
      
      return fs.readdirSync(archiveDir)
        .filter(f => f.endsWith('.json') && !f.includes('_processed'))
        .map(f => path.join(archiveDir, f));
    } catch (err) {
      return [];
    }
  }

  /**
   * Mark an archive as processed
   */
  markArchiveProcessed(archivePath) {
    try {
      const processed = archivePath.replace('.json', '_processed.json');
      fs.renameSync(archivePath, processed);
    } catch (err) {
      // Already processed or error
    }
  }

  /**
   * Trigger immediate sleep/subconscious cycle with dreams
   * @param {Object} subconsciousAgent
   * @param {Object} memoryIndex
   * @param {Object} identityManager
   * @param {Function} callLLM
   * @param {Object} opts â€” { maxDreams: number, isShutdown: boolean }
   */
  async triggerSleepCycle(subconsciousAgent, memoryIndex, identityManager, callLLM = null, opts = {}) {
    console.log(`  âœ“ Triggering ${opts.isShutdown ? 'shutdown' : 'manual'} sleep cycle...`);

    // Temporarily override instance refs so the phase functions see the right objects
    const saved = {
      _subconsciousAgent: this._subconsciousAgent,
      _memoryIndex: this._memoryIndex,
      _identityManager: this._identityManager,
      _callLLM: this._callLLM
    };
    if (subconsciousAgent) this._subconsciousAgent = subconsciousAgent;
    if (memoryIndex) this._memoryIndex = memoryIndex;
    if (identityManager) this._identityManager = identityManager;
    if (callLLM) this._callLLM = callLLM;

    try {
      await require('./phases/phase-archive')(this);
      if (this.dreamEngine && this._callLLM) await require('./phases/phase-dreams')(this);
      await require('./phases/phase-deep-sleep')(this);
    } finally {
      Object.assign(this, saved);
    }
  }

  /**
   * Get system diagnostics and health
   */
  getSystemStatus() {
    const status = {
      running: this.running,
      cycles_completed: this.cycleCount,
      uptime_minutes: this.running ? Math.floor((Date.now() - this.startTime) / 60000) : 0,
      subsystems: {
        memory_storage: this.memoryStorage ? 'initialized' : 'disabled',
        trace_graph: this.traceGraph ? 'initialized' : 'disabled',
        dream_engine: this.dreamEngine ? 'initialized' : 'disabled',
        goals_manager: this.goalsManager ? 'initialized' : 'disabled',
        model_router: this.modelRouter ? 'initialized' : 'disabled',
        belief_graph: this.beliefGraph ? 'initialized' : 'disabled'
      }
    };

    try {
      if (this.memoryStorage) {
        status.memory_stats = this.memoryStorage.getStats();
      }
      if (this.traceGraph) {
        status.trace_stats = this.traceGraph.analyzeTraces();
      }
      if (this.goalsManager) {
        status.goals_stats = this.goalsManager.analyzeProgress();
      }
      if (this.modelRouter) {
        status.router_stats = this.modelRouter.getStats();
      }
      if (this.beliefGraph) {
        status.belief_stats = this.beliefGraph.getStats();
      }
      if (this.boredomEngine) {
        status.boredom_stats = this.boredomEngine.getStats();
      }
    } catch (err) {
      console.warn('  âš  Error gathering status:', err.message);
    }

    status.health = this.getHealthDiagnostics();
    return status;
  }

  getHealthDiagnostics() {
    return {
      ...this._health,
      thresholds: {
        maxConsecutiveTickFailures: this._maxConsecutiveTickFailures,
        maxPhaseErrorsPerTick: this._maxPhaseErrorsPerTick,
        circuitBreakerCooldownMs: this._circuitBreakerCooldownMs
      }
    };
  }
}

module.exports = BrainLoop;
