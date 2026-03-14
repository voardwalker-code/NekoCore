// ============================================================
// REM System — Neurochemistry Engine
//
// Simulates a lightweight chemical state that influences memory
// retrieval, emotional tagging, and attention routing.
//
// Four neuromodulators drift toward baseline (0.5) and are
// nudged by cognitive-bus events:
//
//   dopamine  — reward, novelty, success
//   cortisol  — stress, contradiction, threat
//   serotonin — stability, calm reasoning, satisfaction
//   oxytocin  — social bonding, positive user interaction
//
// Also provides:
//   • Emotional vector computation (valence + arousal)
//   • Emotion-similarity scoring for memory retrieval
//   • Hebbian co-activation tracking
//   • Memory connection pruning recommendations
//   • Consolidation scoring for DeepSleep
// ============================================================

const fs = require('fs');
const ThoughtTypes = require('../bus/thought-types');

const BASELINE = 0.5;
const DRIFT_RATE = 0.12;          // per tick toward baseline (increased for balance)
const CLAMP_MIN = 0.0;
const CLAMP_MAX = 1.0;

// How much each event type nudges each chemical
// NOTE: Effects are further dampened by saturation (see _saturatedDelta).
// High-frequency events use smaller magnitudes to prevent runaway accumulation.
const EVENT_EFFECTS = {
  // Reward / success signals
  [ThoughtTypes.GOAL_FULFILLED]:      { dopamine: +0.10, serotonin: +0.04 },
  [ThoughtTypes.MEMORY_REINFORCED]:   { dopamine: +0.02, serotonin: +0.01 },
  [ThoughtTypes.CONNECTION_REINFORCED]: { dopamine: +0.02 },
  [ThoughtTypes.CURIOSITY_EXPLORED]:  { dopamine: +0.05, serotonin: -0.01 },

  // Contradiction / stress — also reduce serotonin (uncertainty)
  [ThoughtTypes.BELIEF_CONTRADICTED]: { cortisol: +0.10, dopamine: -0.04, serotonin: -0.05 },
  [ThoughtTypes.SYSTEM_ERROR]:        { cortisol: +0.08, serotonin: -0.04, dopamine: -0.03 },
  [ThoughtTypes.GOAL_BLOCKED]:        { cortisol: +0.06, dopamine: -0.05, serotonin: -0.03 },

  // Stable reasoning — reduced magnitudes (fires very often)
  [ThoughtTypes.INTERNAL_THOUGHT]:    { serotonin: +0.01 },
  [ThoughtTypes.THOUGHT_REFLECTION]:  { serotonin: +0.02, dopamine: -0.01 },
  [ThoughtTypes.BELIEF_REINFORCED]:   { serotonin: +0.02 },
  [ThoughtTypes.PATTERN_DETECTED]:    { serotonin: +0.02, dopamine: +0.02 },

  // Social / user bonding
  [ThoughtTypes.USER_PROMPT]:         { oxytocin: +0.05 },
  [ThoughtTypes.VALUES_REINFORCED]:   { oxytocin: +0.03, serotonin: +0.01 },

  // Dreaming / subconscious — dreaming is restful but costs dopamine
  [ThoughtTypes.DREAM_GENERATED]:     { serotonin: +0.03, cortisol: -0.03, dopamine: -0.02 },
  [ThoughtTypes.MEMORY_CONSOLIDATION]: { serotonin: +0.02, dopamine: -0.01 },

  // Belief graph activity
  [ThoughtTypes.BELIEF_CREATED]:      { dopamine: +0.04, serotonin: +0.01 },
  [ThoughtTypes.BELIEF_LINKED]:       { serotonin: +0.01 },

  // Attention — focus costs serotonin (tension of concentration)
  [ThoughtTypes.ATTENTION_FOCUS]:     { dopamine: +0.01, serotonin: -0.01 },

  // Homeostasis — self-regulation reduces cortisol, slight serotonin boost
  [ThoughtTypes.HOMEOSTATIC_RESPONSE]: { cortisol: -0.06, serotonin: +0.02 },

  // Boredom — acting on boredom is mildly rewarding (dopamine bump, serotonin from satisfaction)
  [ThoughtTypes.BOREDOM_ACTION]: { dopamine: +0.08, serotonin: +0.03, cortisol: -0.02 },
  [ThoughtTypes.BOREDOM_TRIGGER]: { dopamine: -0.03, serotonin: -0.02 }
};

class Neurochemistry {
  /**
   * @param {Object} options
   * @param {Object} [options.cognitiveBus]  — CognitiveBus for event listening + emission
   * @param {Object} [options.memoryGraph]   — MemoryGraph for Hebbian tracking
   * @param {Object} [options.beliefGraph]   — BeliefGraph for consolidation
   * @param {string} [options.entityId]      — Entity ID for persistence
   */
  constructor(options = {}) {
    this.cognitiveBus = options.cognitiveBus || null;
    this.memoryGraph = options.memoryGraph || null;
    this.beliefGraph = options.beliefGraph || null;
    this.entityId = options.entityId || null;

    // Core chemical state
    this.state = {
      dopamine:  0.5,
      cortisol:  0.3,
      serotonin: 0.6,
      oxytocin:  0.4
    };

    // Hebbian co-activation log — tracks pairs activated within the same cycle
    // Map<string, { count, lastCycle }> where key = "memA|memB" (sorted)
    this.hebbianLog = new Map();
    this._currentCycleActivations = [];  // memory IDs activated this cycle

    // Subscribe to cognitive bus events
    if (this.cognitiveBus) {
      this._subscribe();
    }

    // Load persisted state if entityId provided
    if (this.entityId) {
      this.load();
    }
  }

  // ── Persistence ────────────────────────────────────────

  save() {
    if (!this.entityId) return;
    try {
      const { getNeurochemistryPath } = require('../../entityPaths');
      const data = { state: this.state, savedAt: new Date().toISOString() };
      fs.writeFileSync(getNeurochemistryPath(this.entityId), JSON.stringify(data, null, 2));
    } catch (_) {}
  }

  load() {
    if (!this.entityId) return;
    try {
      const { getNeurochemistryPath } = require('../../entityPaths');
      const file = getNeurochemistryPath(this.entityId);
      if (fs.existsSync(file)) {
        const d = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (d.state) this.state = { ...this.state, ...d.state };
      }
    } catch (_) {}
  }

  // ── Cognitive Bus Subscription ─────────────────────────

  _subscribe() {
    // Listen to all thought events for chemical updates
    this.cognitiveBus.subscribeToAll((event) => {
      if (event.type && EVENT_EFFECTS[event.type]) {
        this.updateChemistry(event.type);
      }
    });

    // Track memory activations for Hebbian learning
    this.cognitiveBus.subscribe(ThoughtTypes.MEMORY_RETRIEVED, (event) => {
      if (event.memory_id) {
        this._trackActivation(event.memory_id);
      }
    });

    this.cognitiveBus.subscribe(ThoughtTypes.ACTIVATION_SPREAD, (event) => {
      if (event.start_memory) {
        this._trackActivation(event.start_memory);
      }
    });
  }

  // ── Core Chemical State ────────────────────────────────

  /**
   * Get current neurochemical state (read-only copy).
   */
  getChemicalState() {
    return { ...this.state };
  }

  /**
   * Backward-compatible alias used by older phases/routes.
   */
  getState() {
    return this.getChemicalState();
  }

  /**
   * Compute a saturation-dampened delta. When a chemical is already far from
   * baseline in the direction of the nudge, the effect is reduced.
   * This prevents runaway accumulation toward 0 or 1.
   *
   * @param {string} chem — chemical name
   * @param {number} rawDelta — intended delta
   * @returns {number} dampened delta
   */
  _saturatedDelta(chem, rawDelta) {
    const current = this.state[chem];
    if (rawDelta > 0) {
      // Pushing up — dampen as we approach 1.0
      const headroom = CLAMP_MAX - current;  // 0 at top, 1 at baseline-ish
      return rawDelta * Math.max(headroom, 0.05);
    } else {
      // Pushing down — dampen as we approach 0.0
      const headroom = current - CLAMP_MIN;  // 0 at bottom, 1 at baseline-ish
      return rawDelta * Math.max(headroom, 0.05);
    }
  }

  /**
   * Apply an event's effect on the chemical state.
   * Effects are dampened by saturation (diminishing returns near extremes).
   * @param {string} eventType — ThoughtTypes constant
   * @param {number} [intensity=1.0] — multiplier for the effect
   */
  updateChemistry(eventType, intensity = 1.0) {
    const effects = EVENT_EFFECTS[eventType];
    if (!effects) return;

    for (const [chem, delta] of Object.entries(effects)) {
      if (this.state[chem] !== undefined) {
        const dampened = this._saturatedDelta(chem, delta * intensity);
        this.state[chem] = clamp(this.state[chem] + dampened);
      }
    }

    // Emit neurochemical shift event
    if (this.cognitiveBus) {
      this.cognitiveBus.emitThought({
        type: 'neurochemical_shift',
        source: 'neurochemistry',
        trigger: eventType,
        state: this.getChemicalState(),
        importance: 0.1
      });
    }
  }

  /**
   * Drift all chemicals toward baseline. Call once per brain-loop cycle.
   * Uses non-linear drift: the further from baseline, the stronger the pull.
   * This models neurotransmitter reuptake / metabolic clearance.
   */
  tick() {
    for (const chem of Object.keys(this.state)) {
      const diff = BASELINE - this.state[chem];
      // Non-linear: drift accelerates quadratically when far from baseline
      const pull = diff * DRIFT_RATE * (1 + 2 * Math.abs(diff));
      this.state[chem] = clamp(this.state[chem] + pull);
    }

    // Process Hebbian pairs from this cycle
    this._processHebbianPairs();
    this._currentCycleActivations = [];
  }

  // ── Emotional Vector ───────────────────────────────────

  /**
   * Compute the current emotional vector from the chemical state.
   * valence: -1 (negative) to +1 (positive)
   * arousal:  0 (calm)     to  1 (activated)
   *
   * Mapping:
   *   valence ≈ (dopamine + serotonin + oxytocin - cortisol×2) normalized
   *   arousal ≈ (dopamine + cortisol) / 2
   */
  getEmotionalVector() {
    const s = this.state;
    const rawValence = (s.dopamine + s.serotonin + s.oxytocin - s.cortisol * 2) / 2.5;
    const valence = clamp(rawValence, -1, 1);
    const arousal = clamp((s.dopamine + s.cortisol) / 2, 0, 1);
    return { valence, arousal };
  }

  /**
   * Derive a human-readable mood and emotions string from the current
   * chemical state.  Used to keep `entity.persona.mood` / `.emotions`
   * in sync with live neurochemistry before each orchestrator call.
   *
   * Returns { mood: string, emotions: string }
   */
  deriveMood() {
    const s  = this.state;
    const ev = this.getEmotionalVector();        // { valence, arousal }
    const v  = ev.valence;                       // -1 … +1
    const a  = ev.arousal;                       //  0 … 1

    // Dominant-chemical overrides (extreme spikes first)
    if (s.cortisol > 0.80)                      return { mood: 'stressed',    emotions: 'tense, on-edge, alert' };
    if (s.dopamine > 0.80 && s.oxytocin > 0.65) return { mood: 'elated',     emotions: 'joyful, connected, energised' };
    if (s.dopamine > 0.80)                      return { mood: 'excited',     emotions: 'motivated, buzzing, eager' };
    if (s.oxytocin > 0.75)                      return { mood: 'warm',        emotions: 'affectionate, trusting, open' };
    if (s.serotonin > 0.75 && s.cortisol < 0.3) return { mood: 'content',    emotions: 'calm, satisfied, steady' };

    // Valence × arousal grid (Russell circumplex, simplified)
    if (v > 0.25 && a > 0.45)  return { mood: 'engaged',     emotions: 'curious, energetic, interested' };
    if (v > 0.25 && a <= 0.45) return { mood: 'relaxed',     emotions: 'at ease, mellow, comfortable' };
    if (v > -0.1 && v <= 0.25) return { mood: 'neutral',     emotions: 'attentive, even-keeled' };
    if (v <= -0.1 && a > 0.45) return { mood: 'uneasy',      emotions: 'restless, unsettled, wary' };
    if (v <= -0.1 && a <= 0.45) return { mood: 'low',        emotions: 'subdued, withdrawn, flat' };

    return { mood: 'neutral', emotions: 'attentive' };
  }

  /**
   * Create an emotional tag for a memory being stored right now.
   * Captures the current chemical snapshot + derived valence/arousal.
   */
  createEmotionalTag() {
    const vector = this.getEmotionalVector();
    return {
      valence: Math.round(vector.valence * 1000) / 1000,
      arousal: Math.round(vector.arousal * 1000) / 1000,
      neurochemistry: {
        dopamine:  Math.round(this.state.dopamine * 1000) / 1000,
        cortisol:  Math.round(this.state.cortisol * 1000) / 1000,
        serotonin: Math.round(this.state.serotonin * 1000) / 1000,
        oxytocin:  Math.round(this.state.oxytocin * 1000) / 1000
      },
      timestamp: Date.now()
    };
  }

  // ── Emotion Similarity Scoring ─────────────────────────

  /**
   * Compute similarity between the current emotional state and a memory's
   * stored emotional tag. Returns 0–1 (1 = perfect match).
   *
   * @param {Object} emotionalTag — { valence, arousal, neurochemistry }
   * @returns {number} 0–1
   */
  emotionSimilarity(emotionalTag) {
    if (!emotionalTag || typeof emotionalTag !== 'object') return 0;

    const current = this.getEmotionalVector();
    const memValence = emotionalTag.valence ?? 0;
    const memArousal = emotionalTag.arousal ?? 0.5;

    // Euclidean distance in (valence, arousal) space, normalized to 0–1
    const dv = current.valence - memValence;
    const da = current.arousal - memArousal;
    const dist = Math.sqrt(dv * dv + da * da);   // max ≈ √(4+1) ≈ 2.24
    const similarity = 1 - Math.min(dist / 2.24, 1);

    // Bonus for neurochemical alignment (if stored)
    if (emotionalTag.neurochemistry) {
      const nc = emotionalTag.neurochemistry;
      let chemSim = 0;
      let count = 0;
      for (const chem of ['dopamine', 'cortisol', 'serotonin', 'oxytocin']) {
        if (nc[chem] !== undefined) {
          chemSim += 1 - Math.abs((this.state[chem] || BASELINE) - nc[chem]);
          count++;
        }
      }
      if (count > 0) {
        chemSim /= count; // 0–1
        return similarity * 0.6 + chemSim * 0.4;
      }
    }

    return similarity;
  }

  // ── Activation Scoring ─────────────────────────────────

  /**
   * Compute a neurochemistry-aware activation score for a memory.
   * Used to bias memory retrieval toward emotionally relevant memories.
   *
   * @param {Object} memory — memory metadata (needs: importance, topics, emotionalTag)
   * @param {number} topicMatchScore — pre-computed topic relevance (0–1)
   * @param {number} beliefWeight — belief graph influence (0–1)
   * @returns {number} composite activation score
   */
  computeActivationScore(memory, topicMatchScore = 0, beliefWeight = 0) {
    const importance  = memory.importance ?? 0.5;
    const emotionSim  = this.emotionSimilarity(memory.emotionalTag || memory.emotional_tag);
    const decay       = memory.decay ?? 1.0;

    // Weighted sum (totals 1.0):
    //   topic_match:       0.30
    //   importance:        0.20
    //   belief_weight:     0.20
    //   emotion_similarity: 0.20
    //   decay (freshness):  0.10
    return (
      topicMatchScore * 0.30 +
      importance      * 0.20 +
      beliefWeight    * 0.20 +
      emotionSim      * 0.20 +
      decay           * 0.10
    );
  }

  // ── Hebbian Reinforcement ──────────────────────────────
  // "Neurons that fire together wire together"

  /**
   * Track a memory activation within the current cycle.
   */
  _trackActivation(memoryId) {
    if (!this._currentCycleActivations.includes(memoryId)) {
      this._currentCycleActivations.push(memoryId);
    }
  }

  /**
   * At end of each tick, compute all pairs of co-activated memories
   * and log them for Hebbian reinforcement.
   */
  _processHebbianPairs() {
    const ids = this._currentCycleActivations;
    if (ids.length < 2) return;

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
        const entry = this.hebbianLog.get(key);
        if (entry) {
          entry.count++;
          entry.lastCycle = Date.now();
        } else {
          this.hebbianLog.set(key, { count: 1, lastCycle: Date.now() });
        }
      }
    }
  }

  /**
   * Apply Hebbian reinforcement to the memory graph.
   * Strengthens connections between memories that are frequently co-activated.
   * Call during brain-loop maintenance cycles.
   *
   * @param {number} [threshold=3] — minimum co-activations before reinforcing
   * @returns {{ reinforced: number, newLinks: number }}
   */
  applyHebbianReinforcement(threshold = 3) {
    if (!this.memoryGraph) return { reinforced: 0, newLinks: 0 };

    let reinforced = 0;
    let newLinks = 0;

    for (const [key, entry] of this.hebbianLog.entries()) {
      if (entry.count < threshold) continue;

      const [memA, memB] = key.split('|');
      const nodeA = this.memoryGraph.nodes.get(memA);
      const nodeB = this.memoryGraph.nodes.get(memB);
      if (!nodeA || !nodeB) continue;

      // Reinforcement strength scales with co-activation count (capped)
      const strength = Math.min(entry.count * 0.02, 0.15);

      const existingConn = nodeA.connections.find(c => c.target_id === memB);
      if (existingConn) {
        // Strengthen existing connection
        existingConn.strength = Math.min(existingConn.strength + strength, 1.0);
        reinforced++;
      } else {
        // Create new connection — Hebbian emergence
        this.memoryGraph.linkMemories(memA, memB, Math.min(0.3, strength * 2));
        newLinks++;
      }

      // Also do reverse direction
      const existingRev = nodeB.connections.find(c => c.target_id === memA);
      if (existingRev) {
        existingRev.strength = Math.min(existingRev.strength + strength, 1.0);
      } else {
        this.memoryGraph.linkMemories(memB, memA, Math.min(0.3, strength * 2));
      }

      // Reset count after reinforcement (but keep the entry)
      entry.count = 0;
    }

    // Prune stale Hebbian entries (> 1 hour since last co-activation)
    const staleThreshold = Date.now() - 3600000;
    for (const [key, entry] of this.hebbianLog.entries()) {
      if (entry.count === 0 && entry.lastCycle < staleThreshold) {
        this.hebbianLog.delete(key);
      }
    }

    if (reinforced > 0 || newLinks > 0) {
      console.log(`  ✓ Hebbian: ↑${reinforced} reinforced, +${newLinks} new links`);
    }

    return { reinforced, newLinks };
  }

  // ── Connection Pruning ─────────────────────────────────

  /**
   * Scan memory graph connections and prune weak, stale ones.
   * This keeps the graph sparse and encourages reliance on
   * belief graph relationships over time.
   *
   * Prune condition:
   *   connection.strength < strengthThreshold
   *   AND node.last_accessed < ageThreshold (ms ago)
   *
   * @param {Object} options
   * @param {number} [options.strengthThreshold=0.15]
   * @param {number} [options.ageThresholdMs=604800000] — 7 days default
   * @returns {{ pruned: number, scanned: number }}
   */
  pruneWeakConnections(options = {}) {
    if (!this.memoryGraph) return { pruned: 0, scanned: 0 };

    const strengthThreshold = options.strengthThreshold ?? 0.15;
    const ageThresholdMs = options.ageThresholdMs ?? 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let pruned = 0;
    let scanned = 0;

    for (const node of this.memoryGraph.nodes.values()) {
      const originalLen = node.connections.length;
      scanned += originalLen;

      node.connections = node.connections.filter(conn => {
        // Keep strong connections
        if (conn.strength >= strengthThreshold) return true;

        // Keep recently-accessed nodes even if connection is weak
        const targetNode = this.memoryGraph.nodes.get(conn.target_id);
        if (targetNode && (now - targetNode.last_accessed) < ageThresholdMs) return true;

        // Prune: weak + stale
        pruned++;
        return false;
      });
    }

    if (pruned > 0) {
      console.log(`  ✓ Pruned ${pruned} weak memory connections (scanned ${scanned})`);

      if (this.cognitiveBus) {
        this.cognitiveBus.emitThought({
          type: 'memory_connections_pruned',
          source: 'neurochemistry',
          pruned,
          scanned,
          strengthThreshold,
          importance: 0.3
        });
      }
    }

    return { pruned, scanned };
  }

  // ── Consolidation Scoring ──────────────────────────────

  /**
   * Score memories for consolidation during DeepSleep.
   * High-emotion memories → strengthen belief connections.
   * Low importance + low emotion → candidate for pruning.
   *
   * @param {Object[]} memories — array of memory metadata with emotionalTag
   * @returns {{ strengthen: Object[], prune: Object[] }}
   */
  scoreForConsolidation(memories) {
    const strengthen = [];
    const prune = [];

    for (const mem of memories) {
      const tag = mem.emotionalTag || mem.emotional_tag;
      const importance = mem.importance ?? 0.5;
      const decay = mem.decay ?? 1.0;

      // Emotional intensity: high |valence| + high arousal
      let emotionIntensity = 0;
      if (tag && typeof tag === 'object') {
        emotionIntensity = (Math.abs(tag.valence || 0) + (tag.arousal || 0)) / 2;
      }

      const consolidationScore = importance * 0.4 + emotionIntensity * 0.4 + decay * 0.2;

      if (consolidationScore > 0.6) {
        strengthen.push({
          memoryId: mem.memory_id || mem.id,
          score: consolidationScore,
          emotionIntensity,
          importance
        });
      } else if (consolidationScore < 0.25 && decay < 0.4) {
        prune.push({
          memoryId: mem.memory_id || mem.id,
          score: consolidationScore,
          emotionIntensity,
          importance,
          decay
        });
      }
    }

    // Sort: strongest candidates first
    strengthen.sort((a, b) => b.score - a.score);
    prune.sort((a, b) => a.score - b.score);

    return { strengthen, prune };
  }

  /**
   * Run full consolidation: strengthen high-emotion memories in the belief
   * graph and prune low-value, low-emotion memories.
   *
   * @param {Object[]} memories — memory metadata array
   * @returns {{ strengthened: number, pruned: number }}
   */
  runConsolidation(memories) {
    const { strengthen, prune } = this.scoreForConsolidation(memories);
    let strengthened = 0;
    let prunedCount = 0;

    // Strengthen high-emotion memories → reinforce their belief connections
    if (this.beliefGraph) {
      for (const item of strengthen.slice(0, 20)) {
        // Find beliefs sourced from this memory and reinforce them
        const beliefsForMem = this.beliefGraph.index.memoryToBelief[item.memoryId];
        if (beliefsForMem) {
          for (const beliefId of beliefsForMem) {
            this.beliefGraph.reinforceBelief(beliefId, item.memoryId);
            strengthened++;
          }
        }
      }
    }

    // Flag prunable memories (actual removal left to the caller / memory storage)
    prunedCount = prune.length;

    if (strengthened > 0 || prunedCount > 0) {
      console.log(`  ✓ Consolidation: ↑${strengthened} belief reinforcements, ↓${prunedCount} prune candidates`);
    }

    return { strengthened, pruned: prunedCount, pruneCandidates: prune };
  }

  // ── Diagnostics ────────────────────────────────────────

  getStats() {
    const ev = this.getEmotionalVector();
    return {
      chemicals: this.getChemicalState(),
      emotionalVector: ev,
      hebbianPairs: this.hebbianLog.size,
      currentCycleActivations: this._currentCycleActivations.length
    };
  }
}

function clamp(v, min = CLAMP_MIN, max = CLAMP_MAX) {
  return Math.max(min, Math.min(max, v));
}

module.exports = Neurochemistry;
