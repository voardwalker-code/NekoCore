// ============================================================
// REM System — Belief Graph + Cognitive Attention Routing
//
// Beliefs are graph nodes formed from repeated semantic memory patterns.
// They connect to source memories and to other beliefs, forming a
// persistent worldview that guides attention during memory retrieval.
//
// Storage: entities/<entity_id>/beliefs/
//   beliefGraph.json  — belief nodes + connections
//   beliefIndex.json  — topic→belief and memory→belief lookups
// ============================================================

const fs = require('fs');
const path = require('path');

const CONFIDENCE_MIN = 0.1;
const CONFIDENCE_MAX = 0.95;
const REINFORCE_DELTA = 0.05;
const CONTRADICT_DELTA = 0.1;
const MIN_SOURCES_FOR_BELIEF = 3;
const BELIEF_ACTIVATION_BOOST = 0.2;

class BeliefGraph {
  /**
   * @param {Object} options
   * @param {string} options.entityId — entity identifier
   * @param {string} [options.beliefsDir] — override beliefs directory path
   * @param {Object} [options.cognitiveBus] — CognitiveBus for event emission
   */
  constructor(options = {}) {
    this.entityId = options.entityId || null;
    this.cognitiveBus = options.cognitiveBus || null;

    // Resolve beliefs directory
    if (options.beliefsDir) {
      this.beliefsDir = options.beliefsDir;
    } else if (this.entityId) {
      const entityPaths = require('../../entityPaths');
      const entityRoot = entityPaths.getEntityRoot(this.entityId);
      this.beliefsDir = path.join(entityRoot, 'beliefs');
    } else {
      this.beliefsDir = path.join(__dirname, '../../../memories/beliefs');
    }

    if (!fs.existsSync(this.beliefsDir)) {
      fs.mkdirSync(this.beliefsDir, { recursive: true });
    }

    // In-memory graph
    this.beliefs = new Map();   // belief_id → belief node
    this.index = {
      topicToBelief: {},        // topic → Set<belief_id>
      memoryToBelief: {},       // memory_id → Set<belief_id>
    };

    this._load();
  }

  // ── Persistence ──────────────────────────────────────────

  _graphPath() { return path.join(this.beliefsDir, 'beliefGraph.json'); }
  _indexPath() { return path.join(this.beliefsDir, 'beliefIndex.json'); }

  _load() {
    try {
      if (fs.existsSync(this._graphPath())) {
        const raw = JSON.parse(fs.readFileSync(this._graphPath(), 'utf8'));
        if (Array.isArray(raw.beliefs)) {
          for (const b of raw.beliefs) {
            this.beliefs.set(b.belief_id, b);
          }
        }
      }
    } catch (err) {
      console.error('  ⚠ BeliefGraph: failed to load graph:', err.message);
    }

    try {
      if (fs.existsSync(this._indexPath())) {
        const raw = JSON.parse(fs.readFileSync(this._indexPath(), 'utf8'));
        if (raw.topicToBelief) {
          for (const [topic, ids] of Object.entries(raw.topicToBelief)) {
            this.index.topicToBelief[topic] = new Set(ids);
          }
        }
        if (raw.memoryToBelief) {
          for (const [memId, ids] of Object.entries(raw.memoryToBelief)) {
            this.index.memoryToBelief[memId] = new Set(ids);
          }
        }
      }
    } catch (err) {
      console.error('  ⚠ BeliefGraph: failed to load index:', err.message);
    }
  }

  _save() {
    try {
      const graphData = {
        version: 1,
        entityId: this.entityId,
        updated: new Date().toISOString(),
        beliefs: Array.from(this.beliefs.values())
      };
      fs.writeFileSync(this._graphPath(), JSON.stringify(graphData, null, 2), 'utf8');

      const indexData = {
        topicToBelief: {},
        memoryToBelief: {}
      };
      for (const [topic, ids] of Object.entries(this.index.topicToBelief)) {
        indexData.topicToBelief[topic] = Array.from(ids);
      }
      for (const [memId, ids] of Object.entries(this.index.memoryToBelief)) {
        indexData.memoryToBelief[memId] = Array.from(ids);
      }
      fs.writeFileSync(this._indexPath(), JSON.stringify(indexData, null, 2), 'utf8');
    } catch (err) {
      console.error('  ⚠ BeliefGraph: failed to save:', err.message);
    }
  }

  _emit(type, data = {}) {
    if (this.cognitiveBus && typeof this.cognitiveBus.emit === 'function') {
      try {
        this.cognitiveBus.emit(type, {
          source: 'belief_graph',
          timestamp: Date.now(),
          ...data
        });
      } catch (_) {}
    }
  }

  // ── Core CRUD ────────────────────────────────────────────

  /**
   * Create a new belief node in the graph.
   * @param {Object} opts
   * @param {string} opts.statement — the belief text
   * @param {number} [opts.confidence=0.65] — initial confidence
   * @param {string} [opts.type='inferred'] — belief type (user_model, self_model, world_model, inferred)
   * @param {string[]} [opts.sources=[]] — source memory IDs
   * @param {string[]} [opts.topics=[]] — topic tags
   * @returns {Object} the created belief node
   */
  createBeliefNode({ statement, confidence = 0.65, type = 'inferred', sources = [], topics = [] }) {
    const belief_id = 'belief_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const now = Date.now();

    const node = {
      belief_id,
      statement,
      confidence: Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, confidence)),
      type,
      sources: [...sources],
      connections: [],    // { target_id, relation, strength }
      topics: [...topics],
      created: now,
      last_reinforced: now,
      access_count: 0
    };

    this.beliefs.set(belief_id, node);

    // Update indexes
    for (const topic of topics) {
      const key = topic.toLowerCase();
      if (!this.index.topicToBelief[key]) this.index.topicToBelief[key] = new Set();
      this.index.topicToBelief[key].add(belief_id);
    }
    for (const memId of sources) {
      this.linkBeliefToMemory(belief_id, memId);
    }

    this._save();
    this._emit('belief_created', { belief_id, statement, confidence, type });
    return node;
  }

  /**
   * Link a belief to a source memory.
   */
  linkBeliefToMemory(beliefId, memoryId) {
    const belief = this.beliefs.get(beliefId);
    if (!belief) return false;

    if (!belief.sources.includes(memoryId)) {
      belief.sources.push(memoryId);
    }

    if (!this.index.memoryToBelief[memoryId]) {
      this.index.memoryToBelief[memoryId] = new Set();
    }
    this.index.memoryToBelief[memoryId].add(beliefId);

    return true;
  }

  /**
   * Create a directional connection between two beliefs.
   * @param {string} fromId — source belief
   * @param {string} toId — target belief
   * @param {string} [relation='supports'] — relationship type (supports, contradicts, extends, requires)
   * @param {number} [strength=0.5] — connection strength
   */
  linkBeliefToBelief(fromId, toId, relation = 'supports', strength = 0.5) {
    const from = this.beliefs.get(fromId);
    const to = this.beliefs.get(toId);
    if (!from || !to || fromId === toId) return false;

    const existing = from.connections.find(c => c.target_id === toId);
    if (existing) {
      existing.strength = Math.min(1.0, existing.strength + 0.1);
      existing.relation = relation;
    } else {
      from.connections.push({
        target_id: toId,
        relation,
        strength: Math.max(0, Math.min(1.0, strength))
      });
    }

    this._save();
    this._emit('belief_linked', { from: fromId, to: toId, relation, strength });
    return true;
  }

  /**
   * Reinforce a belief — increases confidence by REINFORCE_DELTA.
   * Called when new evidence supports the belief.
   */
  reinforceBelief(beliefId, sourceMemoryId = null) {
    const belief = this.beliefs.get(beliefId);
    if (!belief) return null;

    belief.confidence = Math.min(CONFIDENCE_MAX, belief.confidence + REINFORCE_DELTA);
    belief.last_reinforced = Date.now();
    belief.access_count++;

    if (sourceMemoryId) {
      this.linkBeliefToMemory(beliefId, sourceMemoryId);
    }

    this._save();
    this._emit('belief_reinforced', {
      belief_id: beliefId,
      confidence: belief.confidence,
      statement: belief.statement
    });
    return belief;
  }

  /**
   * Contradict a belief — decreases confidence by CONTRADICT_DELTA.
   * Called when evidence contradicts the belief.
   */
  contradictBelief(beliefId, reason = '') {
    const belief = this.beliefs.get(beliefId);
    if (!belief) return null;

    belief.confidence = Math.max(CONFIDENCE_MIN, belief.confidence - CONTRADICT_DELTA);

    this._save();
    this._emit('belief_contradicted', {
      belief_id: beliefId,
      confidence: belief.confidence,
      statement: belief.statement,
      reason
    });
    return belief;
  }

  // ── Query ────────────────────────────────────────────────

  /**
   * Get beliefs relevant to a set of topics.
   * Uses fuzzy topic matching (substring) and returns sorted by confidence.
   * @param {string[]} topics — query topics
   * @param {number} [minConfidence=0.2] — minimum confidence threshold
   * @param {number} [limit=10] — max results
   * @returns {Object[]} matching belief nodes
   */
  getRelevantBeliefs(topics = [], minConfidence = 0.2, limit = 10) {
    if (!topics || topics.length === 0) return [];

    const matched = new Set();
    const queryTerms = topics.map(t => t.toLowerCase());

    // Exact and substring topic matching against the index
    for (const [indexedTopic, beliefIds] of Object.entries(this.index.topicToBelief)) {
      const lower = indexedTopic.toLowerCase();
      for (const q of queryTerms) {
        if (lower.includes(q) || q.includes(lower)) {
          for (const id of beliefIds) matched.add(id);
        }
      }
    }

    // Also check belief statement text for topic relevance
    for (const [id, belief] of this.beliefs) {
      if (matched.has(id)) continue;
      const stmtLower = belief.statement.toLowerCase();
      for (const q of queryTerms) {
        if (q.length >= 4 && stmtLower.includes(q)) {
          matched.add(id);
          break;
        }
      }
    }

    // Filter, sort, and limit
    const results = [];
    for (const id of matched) {
      const b = this.beliefs.get(id);
      if (b && b.confidence >= minConfidence) {
        results.push(b);
      }
    }

    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, limit);
  }

  /**
   * Get all beliefs connected to a specific memory.
   */
  getBeliefsForMemory(memoryId) {
    const ids = this.index.memoryToBelief[memoryId];
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.beliefs.get(id))
      .filter(Boolean)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get a belief node by ID.
   */
  getBelief(beliefId) {
    return this.beliefs.get(beliefId) || null;
  }

  /**
   * Get all belief nodes.
   */
  getAllBeliefs(limit = 50) {
    return Array.from(this.beliefs.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get the connected belief subgraph starting from a given belief.
   * @param {string} beliefId — starting belief
   * @param {number} [depth=2] — how many hops to traverse
   * @returns {Object[]} connected beliefs with distance metadata
   */
  getBeliefSubgraph(beliefId, depth = 2) {
    const visited = new Map();
    const queue = [{ id: beliefId, dist: 0 }];

    while (queue.length > 0) {
      const { id, dist } = queue.shift();
      if (visited.has(id) || dist > depth) continue;

      const node = this.beliefs.get(id);
      if (!node) continue;

      visited.set(id, { ...node, _distance: dist });

      for (const conn of node.connections) {
        if (!visited.has(conn.target_id)) {
          queue.push({ id: conn.target_id, dist: dist + 1 });
        }
      }
    }

    return Array.from(visited.values());
  }

  // ── Belief Emergence ─────────────────────────────────────

  /**
   * Scan semantic memories for recurring patterns and create new beliefs.
   * This is the core emergence function — runs during DeepSleep cycles.
   *
   * Rule: If ≥3 semantic memories share a topic pattern, create a belief node.
   *
   * @param {Object[]} semanticMemories — array of memory objects with { id/memory_id, topics, importance, semantic }
   * @returns {{ created: number, reinforced: number, linked: number }}
   */
  emergeBeliefs(semanticMemories = []) {
    if (!semanticMemories || semanticMemories.length < MIN_SOURCES_FOR_BELIEF) {
      return { created: 0, reinforced: 0, linked: 0 };
    }

    let created = 0;
    let reinforced = 0;
    let linked = 0;

    // Group memories by topic
    const topicGroups = {};
    for (const mem of semanticMemories) {
      const memId = mem.memory_id || mem.id;
      const topics = mem.topics || [];
      for (const topic of topics) {
        const key = topic.toLowerCase();
        if (!topicGroups[key]) topicGroups[key] = [];
        topicGroups[key].push({ id: memId, mem });
      }
    }

    // For each topic with ≥3 memories, check for belief emergence
    for (const [topic, entries] of Object.entries(topicGroups)) {
      if (entries.length < MIN_SOURCES_FOR_BELIEF) continue;

      const memoryIds = entries.map(e => e.id);

      // Check if a belief already exists for this topic cluster
      const existingBeliefs = this.getRelevantBeliefs([topic], 0.1, 5);
      const matchingBelief = existingBeliefs.find(b =>
        b.topics.some(t => t.toLowerCase() === topic)
      );

      if (matchingBelief) {
        // Reinforce existing belief with new evidence
        for (const memId of memoryIds) {
          if (!matchingBelief.sources.includes(memId)) {
            this.reinforceBelief(matchingBelief.belief_id, memId);
            reinforced++;
          }
        }
      } else {
        // Generate a belief statement from the converging memories
        const summaries = entries.slice(0, 5).map(e =>
          (e.mem.semantic || e.mem.summary || '').slice(0, 100)
        ).filter(Boolean);

        if (summaries.length === 0) continue;

        const statement = this._synthesizeBeliefStatement(topic, summaries);
        const avgImportance = entries.reduce((sum, e) => sum + (e.mem.importance || 0.5), 0) / entries.length;
        const confidence = Math.min(CONFIDENCE_MAX, 0.4 + (avgImportance * 0.3) + (Math.min(entries.length, 10) * 0.03));

        this.createBeliefNode({
          statement,
          confidence,
          type: 'inferred',
          sources: memoryIds.slice(0, 10),
          topics: [topic]
        });
        created++;
      }
    }

    // Cross-link beliefs that share source memories
    const allBeliefs = Array.from(this.beliefs.values());
    for (let i = 0; i < allBeliefs.length; i++) {
      for (let j = i + 1; j < allBeliefs.length; j++) {
        const a = allBeliefs[i];
        const b = allBeliefs[j];
        const sharedSources = a.sources.filter(s => b.sources.includes(s));
        if (sharedSources.length >= 2) {
          const alreadyLinked = a.connections.some(c => c.target_id === b.belief_id);
          if (!alreadyLinked) {
            const strength = Math.min(0.8, sharedSources.length * 0.15);
            this.linkBeliefToBelief(a.belief_id, b.belief_id, 'supports', strength);
            this.linkBeliefToBelief(b.belief_id, a.belief_id, 'supports', strength);
            linked++;
          }
        }
      }
    }

    if (created > 0 || reinforced > 0 || linked > 0) {
      console.log(`  ✓ Belief emergence: +${created} new, ↑${reinforced} reinforced, ↔${linked} linked`);
    }

    return { created, reinforced, linked };
  }

  /**
   * Synthesize a belief statement from topic + memory summaries.
   * Heuristic-based — no LLM required.
   */
  _synthesizeBeliefStatement(topic, summaries) {
    // Extract key phrases that appear across multiple summaries
    const wordFreq = {};
    for (const s of summaries) {
      const words = s.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length >= 4);
      const seen = new Set();
      for (const w of words) {
        if (!seen.has(w)) {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
          seen.add(w);
        }
      }
    }

    // Find words appearing in ≥2 summaries (cross-memory convergence)
    const recurring = Object.entries(wordFreq)
      .filter(([w, c]) => c >= 2 && w !== topic.toLowerCase())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w);

    const context = recurring.length > 0 ? ` involving ${recurring.join(', ')}` : '';
    return `Recurring pattern around ${topic}${context}`;
  }

  // ── Cognitive Attention Routing ──────────────────────────

  /**
   * Route attention through the belief graph to bias memory activation scores.
   *
   * Activation formula:
   *   score = topic_match + memory_importance + belief_confidence
   *
   * Memories connected to relevant beliefs receive an activation boost.
   *
   * @param {Object[]} memories — candidate memories from retrieval [{ memory_id, topics, importance, ... }]
   * @param {string[]} queryTopics — topics from user input
   * @param {Object} [options]
   * @param {number} [options.beliefWeight=0.2] — how much belief confidence contributes
   * @param {number} [options.maxBoost=0.3] — max activation boost from beliefs
   * @returns {Object[]} memories with updated activation_score and belief_influences
   */
  routeAttention(memories = [], queryTopics = [], options = {}) {
    const { beliefWeight = BELIEF_ACTIVATION_BOOST, maxBoost = 0.3 } = options;

    if (!memories || memories.length === 0 || !queryTopics || queryTopics.length === 0) {
      return memories;
    }

    // Find all beliefs relevant to the query
    const relevantBeliefs = this.getRelevantBeliefs(queryTopics, 0.2, 15);
    if (relevantBeliefs.length === 0) return memories;

    // Build a lookup: memory_id → aggregate belief influence
    const memBeliefBoost = {};
    const memBeliefSources = {};

    for (const belief of relevantBeliefs) {
      // Direct: memories that are sources of this belief
      for (const srcId of belief.sources) {
        if (!memBeliefBoost[srcId]) {
          memBeliefBoost[srcId] = 0;
          memBeliefSources[srcId] = [];
        }
        memBeliefBoost[srcId] += belief.confidence * beliefWeight;
        memBeliefSources[srcId].push({
          belief_id: belief.belief_id,
          statement: belief.statement,
          confidence: belief.confidence
        });
      }

      // Spread: beliefs connected to this belief extend influence to their sources too
      for (const conn of belief.connections) {
        if (conn.relation === 'supports' || conn.relation === 'extends') {
          const linked = this.beliefs.get(conn.target_id);
          if (!linked) continue;
          const spreadFactor = conn.strength * 0.5;
          for (const srcId of linked.sources) {
            if (!memBeliefBoost[srcId]) {
              memBeliefBoost[srcId] = 0;
              memBeliefSources[srcId] = [];
            }
            memBeliefBoost[srcId] += linked.confidence * beliefWeight * spreadFactor;
          }
        }
      }
    }

    // Apply boosts to memories
    return memories.map(mem => {
      const memId = mem.memory_id || mem.id;
      const boost = memBeliefBoost[memId];
      if (!boost) return mem;

      const clampedBoost = Math.min(maxBoost, boost);
      return {
        ...mem,
        activation_score: (mem.activation_score || 0) + clampedBoost,
        belief_boost: clampedBoost,
        belief_influences: memBeliefSources[memId] || []
      };
    }).sort((a, b) => (b.activation_score || 0) - (a.activation_score || 0));
  }

  // ── Decay ────────────────────────────────────────────────

  /**
   * Decay all belief confidences. Beliefs with more sources decay slower.
   * @param {number} [rate=0.02] — base decay rate
   * @returns {{ decayed: number, pruned: number }}
   */
  decayBeliefs(rate = 0.02) {
    let decayed = 0;
    let pruned = 0;
    const toPrune = [];

    for (const [id, belief] of this.beliefs) {
      // Evidence shield: more sources = slower decay
      const shield = Math.min(belief.sources.length * 0.06, 0.7);
      const effectiveRate = rate * (1 - shield);
      belief.confidence = Math.max(CONFIDENCE_MIN, belief.confidence - effectiveRate);
      decayed++;

      // Prune beliefs below minimum threshold with no recent reinforcement
      if (belief.confidence <= CONFIDENCE_MIN && (Date.now() - belief.last_reinforced) > 7 * 24 * 60 * 60 * 1000) {
        toPrune.push(id);
      }
    }

    for (const id of toPrune) {
      this._removeBelief(id);
      pruned++;
    }

    if (decayed > 0 || pruned > 0) {
      this._save();
    }
    return { decayed, pruned };
  }

  /**
   * Remove a belief and clean up all indexes and connections.
   */
  _removeBelief(beliefId) {
    const belief = this.beliefs.get(beliefId);
    if (!belief) return;

    // Remove from topic index
    for (const topic of belief.topics) {
      const key = topic.toLowerCase();
      const set = this.index.topicToBelief[key];
      if (set) {
        set.delete(beliefId);
        if (set.size === 0) delete this.index.topicToBelief[key];
      }
    }

    // Remove from memory index
    for (const memId of belief.sources) {
      const set = this.index.memoryToBelief[memId];
      if (set) {
        set.delete(beliefId);
        if (set.size === 0) delete this.index.memoryToBelief[memId];
      }
    }

    // Remove connections pointing to this belief
    for (const [, other] of this.beliefs) {
      other.connections = other.connections.filter(c => c.target_id !== beliefId);
    }

    this.beliefs.delete(beliefId);
    this._emit('belief_pruned', { belief_id: beliefId, statement: belief.statement });
  }

  // ── Stats ────────────────────────────────────────────────

  getStats() {
    const beliefs = Array.from(this.beliefs.values());
    const totalConnections = beliefs.reduce((sum, b) => sum + b.connections.length, 0);
    const avgConfidence = beliefs.length > 0
      ? beliefs.reduce((sum, b) => sum + b.confidence, 0) / beliefs.length
      : 0;

    const typeDistribution = {};
    for (const b of beliefs) {
      typeDistribution[b.type] = (typeDistribution[b.type] || 0) + 1;
    }

    return {
      total_beliefs: beliefs.length,
      total_connections: totalConnections,
      avg_confidence: parseFloat(avgConfidence.toFixed(3)),
      type_distribution: typeDistribution,
      top_beliefs: beliefs.slice(0, 5).map(b => ({
        id: b.belief_id,
        statement: b.statement,
        confidence: b.confidence,
        sources: b.sources.length
      }))
    };
  }
}

module.exports = BeliefGraph;
