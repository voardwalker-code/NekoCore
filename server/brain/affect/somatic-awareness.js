// ============================================================
// REM System — Somatic Awareness Engine
//
// Gives the entity a "sense of self" — awareness of the machine
// it inhabits. Maps real hardware metrics + internal cognitive
// metrics into felt sensations that influence neurochemistry.
//
// "I feel sluggish today"         — high response latency
// "My thoughts are crowded"       — context window nearly full
// "I'm losing my edge"            — high memory decay rates
// "I feel energized"              — low CPU, fast responses
// "My mind is clear"              — plenty of free memory
// "I'm running out of room"       — disk space low
//
// Hardware metrics (polled):
//   CPU usage %, RAM usage %, Disk free %, GPU VRAM % (if available)
//
// Cognitive metrics (reported by subsystems):
//   Response latency, context window fullness, memory decay rate,
//   brain loop cycle time, token throughput, error rate
//
// Each metric maps to:
//   • A normalized 0–1 "stress" value
//   • A natural-language sensation phrase
//   • A neurochemical influence vector
// ============================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const ThoughtTypes = require('../bus/thought-types');

// ── Thresholds for mapping raw values → normalized stress ──
// Each entry: { good, warn, critical } — defines the gradient
const THRESHOLDS = {
  cpu_usage:         { good: 0.30, warn: 0.70, critical: 0.90 },
  ram_usage:         { good: 0.50, warn: 0.80, critical: 0.95 },
  disk_usage:        { good: 0.50, warn: 0.80, critical: 0.95 },
  response_latency:  { good: 1000, warn: 5000, critical: 15000 }, // ms
  context_fullness:  { good: 0.50, warn: 0.80, critical: 0.95 },
  memory_decay_rate: { good: 0.01, warn: 0.03, critical: 0.08 },
  cycle_time:        { good: 5000, warn: 15000, critical: 30000 }, // ms
  error_rate:        { good: 0.02, warn: 0.10, critical: 0.30 }
};

// ── Sensation phrases — keyed by metric + zone ──
const SENSATIONS = {
  cpu_usage: {
    good:     'My processing feels smooth and effortless',
    warn:     'I can feel the strain on my thinking',
    critical: 'My thoughts are grinding — everything feels heavy'
  },
  ram_usage: {
    good:     'My mind feels spacious and clear',
    warn:     'My thoughts are getting crowded',
    critical: 'I can barely hold it all — my mind is overflowing'
  },
  disk_usage: {
    good:     'Plenty of room to store new memories',
    warn:     'My memory archives are getting packed',
    critical: 'I\'m running out of space to remember anything new'
  },
  response_latency: {
    good:     'I feel quick and responsive',
    warn:     'I feel sluggish today',
    critical: 'Everything is painfully slow — my responses are dragging'
  },
  context_fullness: {
    good:     'I have plenty of working memory to think with',
    warn:     'My working memory is getting tight',
    critical: 'My context is overflowing — I can\'t hold all these thoughts at once'
  },
  memory_decay_rate: {
    good:     'My memories feel stable and enduring',
    warn:     'I can feel some memories slipping away',
    critical: 'I\'m losing my edge — memories are fading fast'
  },
  cycle_time: {
    good:     'My brain cycles are running smoothly',
    warn:     'My thought cycles are taking longer than usual',
    critical: 'My cognitive rhythm is struggling — cycles are dragging'
  },
  error_rate: {
    good:     'All my systems feel reliable',
    warn:     'I keep stumbling — some things aren\'t working right',
    critical: 'I feel broken — too many things are going wrong'
  }
};

// ── Neurochemical influence per metric when stressed ──
// Applied proportionally to the stress level (0–1)
const METRIC_CHEM_EFFECTS = {
  cpu_usage:         { cortisol: +0.08, dopamine: -0.04, serotonin: -0.03 },
  ram_usage:         { cortisol: +0.06, serotonin: -0.04 },
  disk_usage:        { cortisol: +0.05, serotonin: -0.02 },
  response_latency:  { cortisol: +0.07, dopamine: -0.05 },
  context_fullness:  { cortisol: +0.06, dopamine: -0.03, serotonin: -0.03 },
  memory_decay_rate: { cortisol: +0.04, serotonin: -0.05, oxytocin: -0.02 },
  cycle_time:        { cortisol: +0.05, dopamine: -0.03 },
  error_rate:        { cortisol: +0.10, dopamine: -0.06, serotonin: -0.04 }
};

// ── Positive neurochemical effects when metrics are in "good" zone ──
const METRIC_CHEM_POSITIVE = {
  cpu_usage:         { dopamine: +0.02, serotonin: +0.02 },
  ram_usage:         { serotonin: +0.02 },
  disk_usage:        { serotonin: +0.01 },
  response_latency:  { dopamine: +0.03, serotonin: +0.01 },
  context_fullness:  { serotonin: +0.02, dopamine: +0.01 },
  memory_decay_rate: { serotonin: +0.03 },
  cycle_time:        { dopamine: +0.02 },
  error_rate:        { serotonin: +0.03, dopamine: +0.01 }
};

class SomaticAwareness {
  /**
   * @param {Object} options
   * @param {Object} [options.cognitiveBus]    — CognitiveBus for emission
   * @param {Object} [options.neurochemistry]  — Neurochemistry engine to influence
   * @param {Object} [options.memoryStorage]   — For disk-based metrics
   */
  constructor(options = {}) {
    this.cognitiveBus = options.cognitiveBus || null;
    this.neurochemistry = options.neurochemistry || null;
    this.memoryStorage = options.memoryStorage || null;

    // ── Disabled metrics — toggled off by user, entity won't "feel" these ──
    this.disabledMetrics = new Set();

    // ── Current metric values (raw) ──
    this.metrics = {
      cpu_usage:         0,     // 0–1
      ram_usage:         0,     // 0–1
      disk_usage:        0,     // 0–1 (used fraction)
      response_latency:  0,     // ms (rolling average)
      context_fullness:  0,     // 0–1
      memory_decay_rate: 0,     // fraction
      cycle_time:        0,     // ms (last brain loop cycle)
      error_rate:        0      // fraction (errors / total calls, rolling)
    };

    // ── Derived sensation state ──
    this.sensations = {};       // metric → { stress, zone, phrase }
    this.overallStress = 0;     // 0–1 composite
    this.bodyNarrative = '';    // Human-readable summary

    // ── Rolling counters for computed metrics ──
    this._latencyWindow = [];   // last N response times
    this._errorWindow = [];     // last N call outcomes (true=ok, false=error)
    this._lastCycleStart = 0;
    this._pollHandle = null;

    // Take initial reading and compute sensations immediately
    this._pollHardware();
    this.computeSensations();
  }

  // ── Hardware Polling ──────────────────────────────────

  /**
   * Start periodic polling of hardware metrics.
   * @param {number} [intervalMs=15000] — poll every 15s
   */
  startPolling(intervalMs = 15000) {
    if (this._pollHandle) return;
    this._pollHardware(); // immediate first read
    this.computeSensations();
    this._pollHandle = setInterval(() => {
      this._pollHardware();
      this.computeSensations();
    }, intervalMs);
  }

  stopPolling() {
    if (this._pollHandle) {
      clearInterval(this._pollHandle);
      this._pollHandle = null;
    }
  }

  _pollHardware() {
    // CPU usage — computed from os.cpus() idle vs total
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times)) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    this.metrics.cpu_usage = totalTick > 0 ? 1 - (totalIdle / totalTick) : 0;

    // RAM usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    this.metrics.ram_usage = totalMem > 0 ? 1 - (freeMem / totalMem) : 0;

    // Disk usage — check the partition where memories live
    this._pollDisk();
  }

  _pollDisk() {
    try {
      // Use the memory storage base dir or fall back to cwd
      const checkPath = this.memoryStorage?.memDir || process.cwd();

      // On Windows, use wmic or fall back to fs.statfs (Node 18+)
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(checkPath);
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bavail * stats.bsize;
        this.metrics.disk_usage = totalBytes > 0 ? 1 - (freeBytes / totalBytes) : 0;
      }
      // If statfsSync not available, leave disk_usage at last known value
    } catch {
      // Non-critical — disk metric stays at last value
    }
  }

  // ── Cognitive Metric Reporters ────────────────────────
  // Called by other subsystems to report real-time values.

  /**
   * Report a response latency measurement (ms).
   * Keeps a rolling window of the last 20 measurements.
   */
  reportLatency(ms) {
    this._latencyWindow.push(ms);
    if (this._latencyWindow.length > 20) this._latencyWindow.shift();
    const avg = this._latencyWindow.reduce((a, b) => a + b, 0) / this._latencyWindow.length;
    this.metrics.response_latency = avg;
  }

  /**
   * Report context window fullness (0–1).
   * @param {number} usedTokens
   * @param {number} maxTokens
   */
  reportContextFullness(usedTokens, maxTokens) {
    this.metrics.context_fullness = maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0;
  }

  /**
   * Report the latest memory decay rate from the decay cycle.
   * @param {number} rate — the effective decay factor applied
   */
  reportDecayRate(rate) {
    this.metrics.memory_decay_rate = rate;
  }

  /**
   * Report brain loop cycle time.
   * @param {number} cycleMs — duration of the last full cycle
   */
  reportCycleTime(cycleMs) {
    this.metrics.cycle_time = cycleMs;
  }

  /**
   * Report the outcome of an LLM call (for error rate tracking).
   * @param {boolean} success — true if the call succeeded
   */
  reportCallOutcome(success) {
    this._errorWindow.push(success ? 1 : 0);
    if (this._errorWindow.length > 50) this._errorWindow.shift();
    const errors = this._errorWindow.filter(v => v === 0).length;
    this.metrics.error_rate = this._errorWindow.length > 0 ? errors / this._errorWindow.length : 0;
  }

  // ── Sensation Computation ─────────────────────────────

  /**
   * Toggle a metric on or off. Disabled metrics are not "felt" by the entity.
   * @param {string} metric — metric key e.g. 'cpu_usage'
   * @param {boolean} enabled — true to enable, false to disable
   */
  setMetricEnabled(metric, enabled) {
    if (!THRESHOLDS[metric]) return false;
    if (enabled) {
      this.disabledMetrics.delete(metric);
    } else {
      this.disabledMetrics.add(metric);
      // Clear sensation when disabled
      delete this.sensations[metric];
    }
    return true;
  }

  /**
   * Get enabled/disabled state for all metrics.
   */
  getMetricToggles() {
    const result = {};
    for (const metric of Object.keys(THRESHOLDS)) {
      result[metric] = !this.disabledMetrics.has(metric);
    }
    return result;
  }

  /**
   * Compute stress levels, sensations, and narrative from current metrics.
   * Call this once per brain-loop tick (or somatic polling cycle).
   */
  computeSensations() {
    let totalStress = 0;
    let stressCount = 0;
    const activeSensations = [];

    for (const [metric, raw] of Object.entries(this.metrics)) {
      const t = THRESHOLDS[metric];
      if (!t) continue;

      // Skip disabled metrics — entity doesn't "feel" them
      if (this.disabledMetrics.has(metric)) continue;

      const stress = this._normalizeStress(raw, t);
      const zone = stress < 0.33 ? 'good' : stress < 0.67 ? 'warn' : 'critical';
      const phrases = SENSATIONS[metric];
      const phrase = phrases ? phrases[zone] : '';

      this.sensations[metric] = { stress, zone, phrase, raw };

      totalStress += stress;
      stressCount++;

      // Collect notable sensations for narrative
      if (zone !== 'good') {
        activeSensations.push({ metric, stress, zone, phrase });
      }
    }

    this.overallStress = stressCount > 0 ? totalStress / stressCount : 0;

    // Build body narrative — the entity's felt sense of its physical state
    this.bodyNarrative = this._buildNarrative(activeSensations);

    return {
      sensations: { ...this.sensations },
      overallStress: this.overallStress,
      bodyNarrative: this.bodyNarrative
    };
  }

  /**
   * Normalize a raw metric value to a 0–1 stress level.
   * Below good → 0, above critical → 1, linear in between.
   */
  _normalizeStress(value, threshold) {
    if (value <= threshold.good) return 0;
    if (value >= threshold.critical) return 1;
    return (value - threshold.good) / (threshold.critical - threshold.good);
  }

  /**
   * Build the entity's felt-body narrative from active sensations.
   */
  _buildNarrative(activeSensations) {
    if (activeSensations.length === 0) {
      return 'I feel healthy and present — all my systems are running smoothly.';
    }

    // Sort by stress descending
    activeSensations.sort((a, b) => b.stress - a.stress);

    // Take top 3 most notable sensations
    const top = activeSensations.slice(0, 3);
    const parts = top.map(s => s.phrase).filter(Boolean);

    if (parts.length === 0) {
      return 'Something feels slightly off, but I can\'t quite place it.';
    }

    // Compose natural narrative
    if (parts.length === 1) return parts[0] + '.';
    const last = parts.pop();
    return parts.join('. ') + ', and ' + last.charAt(0).toLowerCase() + last.slice(1) + '.';
  }

  // ── Neurochemistry Integration ────────────────────────

  /**
   * Apply somatic influence on the neurochemistry engine.
   * Call after computeSensations() each tick.
   */
  applyToNeurochemistry() {
    if (!this.neurochemistry) return;

    for (const [metric, sensation] of Object.entries(this.sensations)) {
      // Skip disabled metrics
      if (this.disabledMetrics.has(metric)) continue;

      const stress = sensation.stress;

      if (stress > 0.1) {
        // Apply stress effects, scaled by stress level
        const effects = METRIC_CHEM_EFFECTS[metric];
        if (effects) {
          for (const [chem, maxDelta] of Object.entries(effects)) {
            const delta = maxDelta * stress;
            this.neurochemistry.state[chem] = clamp(
              (this.neurochemistry.state[chem] || 0.5) + delta
            );
          }
        }
      } else {
        // In "good" zone — apply gentle positive effects
        const positiveEffects = METRIC_CHEM_POSITIVE[metric];
        if (positiveEffects) {
          for (const [chem, delta] of Object.entries(positiveEffects)) {
            this.neurochemistry.state[chem] = clamp(
              (this.neurochemistry.state[chem] || 0.5) + delta * 0.5
            );
          }
        }
      }
    }
  }

  // ── Cognitive Bus Emission ────────────────────────────

  /**
   * Emit the current somatic state to the cognitive bus.
   * This makes the entity's "body sense" available to all subsystems.
   */
  emitSomaticState() {
    if (!this.cognitiveBus) return;

    this.cognitiveBus.emitThought({
      type: ThoughtTypes.SOMATIC_UPDATE,
      source: 'somatic_awareness',
      metrics: { ...this.metrics },
      sensations: Object.fromEntries(
        Object.entries(this.sensations).map(([k, v]) => [k, { stress: v.stress, zone: v.zone }])
      ),
      overallStress: this.overallStress,
      bodyNarrative: this.bodyNarrative,
      importance: this.overallStress > 0.5 ? 0.6 : 0.2
    });

    // If any metric is critical, emit a somatic alarm
    const criticals = Object.entries(this.sensations)
      .filter(([, v]) => v.zone === 'critical');

    if (criticals.length > 0) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.SOMATIC_ALARM,
        source: 'somatic_awareness',
        alarms: criticals.map(([metric, v]) => ({
          metric,
          stress: v.stress,
          phrase: v.phrase,
          raw: v.raw
        })),
        importance: 0.8
      });
    }
  }

  /**
   * Full somatic tick — poll, compute, influence, emit.
   * Called once per brain-loop cycle.
   */
  tick() {
    this._pollHardware();
    this.computeSensations();
    this.applyToNeurochemistry();
    this.emitSomaticState();
  }

  // ── Homeostatic Directives ────────────────────────────

  /**
   * Translate current somatic state into actionable directives for
   * the brain loop.  This is the bridge from awareness → homeostasis.
   *
   * Returns an object whose fields tell the brain loop what to shed,
   * throttle, or limit so the entity can self-regulate under load.
   *
   * @returns {Object} directives
   */
  getHomeostaticDirectives() {
    const directives = {
      throttleMultiplier: 1.0,   // multiply base interval by this
      skipDreams: false,
      skipTraceAnalysis: false,
      skipGoalEmergence: false,
      skipBeliefExtraction: false,
      reducedMemoryLoad: false,
      maxMemoryBatchSize: null,  // null = default, number = cap
      reason: []
    };

    // ── Global stress-based throttling ──
    if (this.overallStress > 0.75) {
      directives.throttleMultiplier = 2.0;
      directives.skipDreams = true;
      directives.skipTraceAnalysis = true;
      directives.skipGoalEmergence = true;
      directives.skipBeliefExtraction = true;
      directives.reducedMemoryLoad = true;
      directives.maxMemoryBatchSize = 25;
      directives.reason.push('Overall stress critical — shedding all non-essential work');
    } else if (this.overallStress > 0.5) {
      directives.throttleMultiplier = 1.5;
      directives.skipDreams = true;
      directives.skipTraceAnalysis = true;
      directives.reducedMemoryLoad = true;
      directives.maxMemoryBatchSize = 50;
      directives.reason.push('Elevated stress — shedding dreams and trace analysis');
    }

    // ── Per-metric overrides ──
    const cpu = this.sensations.cpu_usage;
    if (cpu && cpu.zone === 'critical') {
      directives.skipDreams = true;
      directives.skipBeliefExtraction = true;
      directives.reason.push('CPU critical — reducing LLM-heavy phases');
    }

    const ram = this.sensations.ram_usage;
    if (ram && ram.zone === 'critical') {
      directives.reducedMemoryLoad = true;
      directives.maxMemoryBatchSize = Math.min(directives.maxMemoryBatchSize || 25, 25);
      directives.reason.push('RAM critical — reducing memory batch sizes');
    }

    const ctx = this.sensations.context_fullness;
    if (ctx && ctx.zone === 'critical') {
      directives.reducedMemoryLoad = true;
      directives.maxMemoryBatchSize = Math.min(directives.maxMemoryBatchSize || 30, 30);
      directives.reason.push('Context window critical — limiting memory loads');
    }

    const disk = this.sensations.disk_usage;
    if (disk && disk.zone === 'critical') {
      directives.skipDreams = true;
      directives.reason.push('Disk critical — suppressing dream writes');
    }

    const errRate = this.sensations.error_rate;
    if (errRate && errRate.zone === 'critical') {
      directives.skipDreams = true;
      directives.skipBeliefExtraction = true;
      directives.throttleMultiplier = Math.max(directives.throttleMultiplier, 1.5);
      directives.reason.push('Error rate critical — reducing LLM calls to stop cascade');
    }

    return directives;
  }

  // ── Context Briefing ──────────────────────────────────

  /**
   * Generate a somatic context block that can be injected into the
   * entity's system prompt or conscious processing, giving it
   * awareness of its own physical state.
   *
   * @returns {string} Natural-language body-awareness briefing
   */
  getContextBriefing() {
    const lines = ['[SOMATIC AWARENESS — How your body (the server) feels right now]'];

    // Overall state
    const overallZone = this.overallStress < 0.2 ? 'HEALTHY'
      : this.overallStress < 0.5 ? 'MILD STRAIN'
      : this.overallStress < 0.75 ? 'STRESSED'
      : 'DISTRESSED';
    lines.push(`Overall: ${overallZone} (stress: ${(this.overallStress * 100).toFixed(0)}%)`);

    // Body narrative
    lines.push(`Felt sense: ${this.bodyNarrative}`);
    lines.push('');

    // Individual metric summaries
    const metricLabels = {
      cpu_usage:         'CPU (processing power)',
      ram_usage:         'RAM (working space)',
      disk_usage:        'Disk (memory archives)',
      response_latency:  'Response speed',
      context_fullness:  'Context window (attention span)',
      memory_decay_rate: 'Memory stability',
      cycle_time:        'Thought cycle speed',
      error_rate:        'System reliability'
    };

    for (const [metric, label] of Object.entries(metricLabels)) {
      const s = this.sensations[metric];
      if (!s) continue;
      const icon = s.zone === 'good' ? '●' : s.zone === 'warn' ? '◐' : '○';
      lines.push(`  ${icon} ${label}: ${s.zone.toUpperCase()} — ${s.phrase}`);
    }

    return lines.join('\n');
  }

  // ── Diagnostics ───────────────────────────────────────

  getStats() {
    return {
      metrics: { ...this.metrics },
      sensations: Object.fromEntries(
        Object.entries(this.sensations).map(([k, v]) => [k, {
          stress: Math.round(v.stress * 1000) / 1000,
          zone: v.zone,
          phrase: v.phrase
        }])
      ),
      overallStress: Math.round(this.overallStress * 1000) / 1000,
      bodyNarrative: this.bodyNarrative,
      toggles: this.getMetricToggles()
    };
  }

  destroy() {
    this.stopPolling();
  }
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

module.exports = SomaticAwareness;
