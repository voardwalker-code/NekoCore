// ============================================================
// REM System — Cognitive Pulse Engine
//
// A lightweight 200ms timer that walks the memory graph one hop
// at a time, keeping associative connections warm and tracking
// what the entity was "thinking about" between interactions.
//
// State is purely in-memory — no disk writes, no LLM calls.
//
// Key behaviours:
//  • Follows memory graph edges, preferring unvisited neighbours
//  • Resets to a fresh random node every resetEveryN hops to
//    prevent the pulse running down a single chain forever
//  • interrupt() snapshots the current node into the DreamSeedPool
//    so dreams are seeded by interrupted thoughts
// ============================================================

class CognitivePulse {
  /**
   * @param {Object} options
   * @param {import('../memory/memory-graph')} options.memoryGraph  — in-memory graph to walk
   * @param {import('./dream-seed-pool')}      options.dreamSeedPool — pool to push interrupts into
   * @param {number} [options.tickInterval=200]   — ms between hops
   * @param {number} [options.resetEveryN=25]     — hop count before jump to fresh node (~5 s)
   */
  constructor(options = {}) {
    this.memoryGraph    = options.memoryGraph   || null;
    this.dreamSeedPool  = options.dreamSeedPool || null;
    this.tickInterval   = options.tickInterval  || 200;
    this.resetEveryN    = options.resetEveryN   || 25;
    this.maxRecentNodes = options.maxRecentNodes || 80;
    this.maxPaths       = options.maxPaths || 200;

    /** @type {{ nodeId: string, title: string, timestamp: number, hopCount: number, path: string[] } | null} */
    this.currentPulseNode = null;

    this.recentNodes = [];
    this.traceIndex = {
      nodes: new Map(),
      edges: new Map(),
      paths: []
    };

    this._intervalHandle = null;
    this._running = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    this._intervalHandle = setInterval(() => this._tick(), this.tickInterval);
    console.log(`  ✓ Cognitive pulse started (${this.tickInterval}ms, reset every ${this.resetEveryN} hops)`);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    console.log('  ✓ Cognitive pulse stopped');
  }

  // ── Interrupt ──────────────────────────────────────────────

  /**
   * Called by the brain loop at the start of every tick.
   * Snapshots the current pulse node and pushes it into the
   * dream seed pool so the interrupted thought can influence
   * future dreams.
   *
   * @param {string} [reason='external'] — label for the interruption source
   * @returns {Object|null} the interrupted pulse node, or null if idle
   */
  interrupt(reason = 'external') {
    if (!this.currentPulseNode) return null;

    const interrupted = {
      ...this.currentPulseNode,
      interruptReason: reason,
      interruptedAt: Date.now()
    };

    if (this.dreamSeedPool) {
      this.dreamSeedPool.push(interrupted);
    }

    return interrupted;
  }

  // ── Public state ───────────────────────────────────────────

  /**
   * Return a snapshot of the current pulse node (or null if idle).
   * @returns {Object|null}
   */
  getState() {
    return this.currentPulseNode ? { ...this.currentPulseNode } : null;
  }

  getCurrentNode() {
    return this.getState();
  }

  getRecentNodes(limit = 5) {
    return this.recentNodes.slice(-Math.max(1, Number(limit) || 5)).map((n) => ({ ...n }));
  }

  getTraceIndexSnapshot(limitNodes = 200, limitEdges = 400) {
    const nodes = Array.from(this.traceIndex.nodes.entries())
      .map(([id, data]) => ({
        id,
        visits: data.visits || 0,
        retrievalHits: data.retrievalHits || 0,
        lastSeen: data.lastSeen || 0,
        avgSalience: data.avgSalience || 0,
        topics: this._topicsFromMap(data.topicCounts || {})
      }))
      .sort((a, b) => (b.visits + b.retrievalHits * 2) - (a.visits + a.retrievalHits * 2))
      .slice(0, Math.max(1, Number(limitNodes) || 200));

    const edges = Array.from(this.traceIndex.edges.values())
      .map((e) => ({
        from: e.from,
        to: e.to,
        count: e.count || 0,
        avgStrength: e.count > 0 ? (e.totalStrength / e.count) : 0,
        reinforced: e.reinforced || 0,
        retrievalHits: e.retrievalHits || 0,
        lastSeen: e.lastSeen || 0
      }))
      .sort((a, b) => ((b.count + b.reinforced * 2 + b.retrievalHits * 3) - (a.count + a.reinforced * 2 + a.retrievalHits * 3)))
      .slice(0, Math.max(1, Number(limitEdges) || 400));

    return {
      current: this.getState(),
      recent: this.getRecentNodes(10),
      nodes,
      edges,
      recentPaths: this.traceIndex.paths.slice(-10)
    };
  }

  getMessageTraceHints(options = {}) {
    const topics = Array.isArray(options.topics) ? options.topics.map((t) => String(t || '').toLowerCase()).filter(Boolean) : [];
    const limit = Math.max(1, Number(options.limit) || 12);
    const maxDepth = Math.max(1, Number(options.maxDepth) || 4);
    const minScore = Math.max(0, Number(options.minScore) || 0.05);
    if (topics.length === 0 || this.traceIndex.nodes.size === 0) return [];

    const seeds = [];
    for (const [id, stats] of this.traceIndex.nodes.entries()) {
      const overlap = this._topicOverlapScore(stats.topicCounts || {}, topics);
      if (overlap <= 0) continue;
      const visitNorm = Math.min(1, (stats.visits || 0) / 20);
      const hitNorm = Math.min(1, (stats.retrievalHits || 0) / 10);
      const seedScore = clamp01(overlap * 0.7 + visitNorm * 0.2 + hitNorm * 0.1);
      if (seedScore >= minScore) {
        seeds.push({ id, score: seedScore, path: [id], depth: 0, startId: id });
      }
    }

    if (seeds.length === 0) return [];

    const frontier = seeds.sort((a, b) => b.score - a.score).slice(0, Math.min(20, seeds.length));
    const bestByNode = new Map();

    for (const seed of frontier) {
      bestByNode.set(seed.id, { id: seed.id, score: seed.score, path: seed.path, startId: seed.startId });
    }

    while (frontier.length > 0) {
      frontier.sort((a, b) => b.score - a.score);
      const state = frontier.shift();
      if (!state || state.depth >= maxDepth) continue;

      const outgoing = this._getOutgoingEdges(state.id, 8);
      for (const edge of outgoing) {
        const edgeStrength = this._edgeCompositeStrength(edge);
        const nextScore = state.score * (0.60 + edgeStrength * 0.40) * 0.82;
        if (nextScore < minScore) continue;

        const nextPath = state.path.includes(edge.to)
          ? state.path
          : [...state.path, edge.to];

        const prevBest = bestByNode.get(edge.to);
        if (!prevBest || nextScore > prevBest.score) {
          const nextState = {
            id: edge.to,
            score: nextScore,
            path: nextPath,
            depth: state.depth + 1,
            startId: state.startId
          };
          bestByNode.set(edge.to, { id: edge.to, score: nextScore, path: nextPath, startId: state.startId });
          frontier.push(nextState);
        }
      }
    }

    return Array.from(bestByNode.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((h) => ({ ...h, score: clamp01(h.score) }));
  }

  getBestPath(fromId, toId, maxDepth = 6) {
    if (!fromId || !toId) return null;
    if (fromId === toId) return { path: [fromId], score: 1 };

    const queue = [{ id: fromId, path: [fromId], score: 1, depth: 0 }];
    const bestSeen = new Map([[fromId, 1]]);
    let bestPartial = null;

    while (queue.length > 0) {
      queue.sort((a, b) => b.score - a.score);
      const state = queue.shift();
      if (!state || state.depth >= maxDepth) continue;

      const outgoing = this._getOutgoingEdges(state.id, 10);
      for (const edge of outgoing) {
        if (state.path.includes(edge.to)) continue;

        const edgeStrength = this._edgeCompositeStrength(edge);
        const nextScore = state.score * (0.55 + edgeStrength * 0.45);
        const nextPath = [...state.path, edge.to];

        if (edge.to === toId) {
          return { path: nextPath, score: clamp01(nextScore) };
        }

        const prev = bestSeen.get(edge.to) || 0;
        if (nextScore <= prev) continue;
        bestSeen.set(edge.to, nextScore);

        const nextState = { id: edge.to, path: nextPath, score: nextScore, depth: state.depth + 1 };
        queue.push(nextState);

        if (!bestPartial || nextState.score > bestPartial.score) {
          bestPartial = nextState;
        }
      }
    }

    return bestPartial ? { path: bestPartial.path, score: clamp01(bestPartial.score) } : null;
  }

  reinforcePath(path, strength = 0.1, reason = 'retrieval_match') {
    if (!Array.isArray(path) || path.length < 2) return { reinforced: 0 };
    const clampedStrength = clamp01(Number(strength) || 0.1);
    let reinforced = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const fromId = path[i];
      const toId = path[i + 1];

      this._updateEdgeStats(fromId, toId, clampedStrength, {
        reinforced: clampedStrength,
        retrievalHit: reason === 'retrieval_match'
      });

      // Backtrace reinforcement is weaker, but keeps return route warm.
      this._updateEdgeStats(toId, fromId, clampedStrength * 0.6, {
        reinforced: clampedStrength * 0.6,
        retrievalHit: false
      });

      if (this.memoryGraph && typeof this.memoryGraph.reinforceMemories === 'function') {
        this.memoryGraph.reinforceMemories(fromId, toId, clampedStrength * 0.35);
        this.memoryGraph.reinforceMemories(toId, fromId, clampedStrength * 0.2);
      }
      reinforced++;
    }

    return { reinforced };
  }

  recordRetrievalTrace(options = {}) {
    const targetId = options.targetId || null;
    const path = Array.isArray(options.path) ? options.path.filter(Boolean) : [];
    const confidence = clamp01(Number(options.confidence) || 0);
    const matched = !!options.matched;
    const topics = Array.isArray(options.topics) ? options.topics : [];

    const entry = {
      timestamp: Date.now(),
      userMessage: String(options.userMessage || '').slice(0, 280),
      topics: topics.slice(0, 12),
      targetId,
      matched,
      confidence,
      path
    };

    this.traceIndex.paths.push(entry);
    if (this.traceIndex.paths.length > this.maxPaths) {
      this.traceIndex.paths.shift();
    }

    if (targetId) {
      const n = this._ensureNodeStats(targetId);
      n.retrievalHits = (n.retrievalHits || 0) + (matched ? 1 : 0.25);
      n.lastMatchedAt = Date.now();
    }

    if (matched && path.length > 1) {
      const strengthen = Math.max(0.05, Math.min(0.25, confidence * 0.25));
      this.reinforcePath(path, strengthen, 'retrieval_match');
    }

    return entry;
  }

  // ── Internal walk ──────────────────────────────────────────

  _tick() {
    if (!this.memoryGraph || this.memoryGraph.nodes.size === 0) return;

    const hopCount = (this.currentPulseNode?.hopCount ?? -1) + 1;

    // First hop or scheduled reset — jump to a fresh random node
    if (!this.currentPulseNode || hopCount % this.resetEveryN === 0) {
      this._jumpToFreshNode(hopCount);
      return;
    }

    const node = this.memoryGraph.nodes.get(this.currentPulseNode.nodeId);
    if (!node || !node.connections || node.connections.length === 0) {
      // Dead-end — jump to fresh
      this._jumpToFreshNode(hopCount);
      return;
    }

    // Prefer neighbours not in the recent path
    const recentPath = this.currentPulseNode.path || [];
    const visitedIds  = new Set(recentPath);
    const unvisited   = node.connections.filter(c => !visitedIds.has(c.target_id));
    const candidates  = unvisited.length > 0 ? unvisited : node.connections;

    const chosen   = this._pickByStrength(candidates);
    const nextNode = this.memoryGraph.nodes.get(chosen.target_id);

    if (!nextNode) {
      this._jumpToFreshNode(hopCount);
      return;
    }

    // Keep path as last 5 visited node IDs
    const newPath = [...recentPath.slice(-4), this.currentPulseNode.nodeId];

    this.currentPulseNode = this._buildPulseNode(nextNode, hopCount, newPath, {
      incomingStrength: chosen.strength || 0.5,
      fromId: this.currentPulseNode.nodeId
    });
    this._recordNodeVisit(this.currentPulseNode, {
      fromId: this.currentPulseNode.path.length > 0 ? this.currentPulseNode.path[this.currentPulseNode.path.length - 1] : null,
      edgeStrength: chosen.strength || 0.5
    });
  }

  _jumpToFreshNode(hopCount) {
    const nodeIds = Array.from(this.memoryGraph.nodes.keys());
    if (nodeIds.length === 0) return;

    const randomId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
    const node     = this.memoryGraph.nodes.get(randomId);
    if (!node) return;

    this.currentPulseNode = this._buildPulseNode(node, hopCount, [], { incomingStrength: 0.5, fromId: null });
    this._recordNodeVisit(this.currentPulseNode, { fromId: null, edgeStrength: 0.5 });
  }

  /**
   * Build a pulse node from a memory graph node.
   */
  _buildPulseNode(graphNode, hopCount, path, meta = {}) {
    const title = (graphNode.topics && graphNode.topics.length > 0)
      ? graphNode.topics[0]
      : (graphNode.memory_id || 'unknown');

    const importance = Number(graphNode.importance || 0.5);
    const activation = Number(graphNode.activation || 0);
    const incomingStrength = Number(meta.incomingStrength || 0.5);
    const salience = clamp01((importance * 0.45) + (activation * 0.35) + (incomingStrength * 0.20));

    return {
      nodeId:    graphNode.memory_id,
      title,
      timestamp: Date.now(),
      hopCount,
      path,
      topics: Array.isArray(graphNode.topics) ? graphNode.topics.slice(0, 8) : [],
      emotion: graphNode.emotion ?? null,
      salience
    };
  }

  /**
   * Weighted random selection from a list of connections.
   * Connections with higher strength are more likely to be followed.
   */
  _pickByStrength(connections) {
    const total = connections.reduce((sum, c) => sum + (c.strength || 0.5), 0);
    let r = Math.random() * total;
    for (const c of connections) {
      r -= (c.strength || 0.5);
      if (r <= 0) return c;
    }
    return connections[connections.length - 1];
  }

  _recordNodeVisit(node, options = {}) {
    if (!node || !node.nodeId) return;

    const stats = this._ensureNodeStats(node.nodeId);
    stats.visits = (stats.visits || 0) + 1;
    stats.lastSeen = Date.now();
    stats.avgSalience = rollingAverage(stats.avgSalience || 0, node.salience || 0, stats.visits);
    stats.avgHop = rollingAverage(stats.avgHop || 0, Number(node.hopCount || 0), stats.visits);
    this._mergeTopics(stats, node.topics || []);

    this.recentNodes.push({ ...node });
    if (this.recentNodes.length > this.maxRecentNodes) {
      this.recentNodes.shift();
    }

    if (options.fromId) {
      this._updateEdgeStats(options.fromId, node.nodeId, options.edgeStrength || 0.5, { reinforced: 0, retrievalHit: false });
    }
  }

  _ensureNodeStats(nodeId) {
    if (!this.traceIndex.nodes.has(nodeId)) {
      this.traceIndex.nodes.set(nodeId, {
        visits: 0,
        retrievalHits: 0,
        lastSeen: 0,
        avgSalience: 0,
        avgHop: 0,
        topicCounts: {}
      });
    }
    return this.traceIndex.nodes.get(nodeId);
  }

  _mergeTopics(nodeStats, topics) {
    if (!nodeStats || !Array.isArray(topics)) return;
    if (!nodeStats.topicCounts) nodeStats.topicCounts = {};
    for (const t of topics) {
      const topic = String(t || '').toLowerCase().trim();
      if (!topic) continue;
      nodeStats.topicCounts[topic] = (nodeStats.topicCounts[topic] || 0) + 1;
    }
  }

  _topicsFromMap(topicCounts) {
    return Object.entries(topicCounts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic]) => topic);
  }

  _topicOverlapScore(topicCounts, topics) {
    const haystack = topicCounts || {};
    if (!topics.length) return 0;
    let hits = 0;
    let weight = 0;
    for (const t of topics) {
      const count = haystack[t] || 0;
      if (count > 0) {
        hits += 1;
        weight += Math.min(1, count / 5);
      }
    }
    if (hits === 0) return 0;
    return clamp01((hits / topics.length) * 0.7 + (weight / topics.length) * 0.3);
  }

  _edgeKey(fromId, toId) {
    return `${fromId}->${toId}`;
  }

  _updateEdgeStats(fromId, toId, strength, options = {}) {
    if (!fromId || !toId) return;
    const key = this._edgeKey(fromId, toId);
    const now = Date.now();
    const s = clamp01(Number(strength) || 0.5);

    if (!this.traceIndex.edges.has(key)) {
      this.traceIndex.edges.set(key, {
        key,
        from: fromId,
        to: toId,
        count: 0,
        totalStrength: 0,
        lastSeen: 0,
        reinforced: 0,
        retrievalHits: 0
      });
    }

    const edge = this.traceIndex.edges.get(key);
    edge.count += 1;
    edge.totalStrength += s;
    edge.lastSeen = now;
    if (options.reinforced) edge.reinforced += Number(options.reinforced) || 0;
    if (options.retrievalHit) edge.retrievalHits += 1;
  }

  _getOutgoingEdges(fromId, limit = 8) {
    if (!fromId) return [];
    const out = [];
    for (const edge of this.traceIndex.edges.values()) {
      if (edge.from === fromId) out.push(edge);
    }
    out.sort((a, b) => this._edgeCompositeStrength(b) - this._edgeCompositeStrength(a));
    return out.slice(0, Math.max(1, Number(limit) || 8));
  }

  _edgeCompositeStrength(edge) {
    const avgStrength = edge.count > 0 ? (edge.totalStrength / edge.count) : 0.5;
    const freq = Math.min(1, (edge.count || 0) / 15);
    const reinforced = Math.min(1, (edge.reinforced || 0));
    const retrieval = Math.min(1, (edge.retrievalHits || 0) / 8);
    return clamp01(avgStrength * 0.50 + freq * 0.20 + reinforced * 0.15 + retrieval * 0.15);
  }
}

function clamp01(v) {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function rollingAverage(prev, next, count) {
  if (count <= 1) return next;
  return prev + ((next - prev) / count);
}

module.exports = CognitivePulse;
