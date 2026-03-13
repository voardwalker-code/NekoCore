// ============================================================
// REM System — Memory Graph Module
// Implements associative memory with spreading activation.
// ============================================================

const ThoughtTypes = require('../bus/thought-types');

class MemoryGraph {
  constructor(options = {}) {
    this.nodes = new Map(); // memory_id -> node
    this.cognitiveBus = options.cognitiveBus;
    this.decayRate = options.decayRate || 0.998; // Per cycle — very gentle, meaningful decay only over days
    this.activationThreshold = options.activationThreshold || 0.1;
    this.spreadDecay = options.spreadDecay || 0.8; // Activation spreads with decay
    this.updateCount = 0;
  }

  /**
   * Add a memory node to the graph
   */
  addMemoryNode(memory) {
    const node = {
      memory_id: memory.id || memory.memory_id,
      topics: memory.topics || [],
      emotion: memory.emotion || 0,
      importance: memory.importance || 0.5,
      activation: 0, // Start inactive
      connections: [], // Array of { target_id, strength }
      created_at: memory.created || new Date().toISOString(),
      last_accessed: memory.last_accessed || Date.now(),
      access_count: memory.access_count || 0,
      decay_value: 1.0, // Freshness
      type: memory.type || 'episodic'
    };

    this.nodes.set(node.memory_id, node);
    return node;
  }

  /**
   * Create an associative link between two memories
   */
  linkMemories(memoryIdA, memoryIdB, strength = 0.5) {
    const nodeA = this.nodes.get(memoryIdA);
    const nodeB = this.nodes.get(memoryIdB);

    if (!nodeA || !nodeB) {
      return false;
    }

    // Check if connection already exists
    const existing = nodeA.connections.find(c => c.target_id === memoryIdB);
    if (existing) {
      // Strengthen existing connection with decay
      existing.strength = Math.min(
        existing.strength + (strength * 0.1),
        1.0
      );
    } else {
      // Add new connection
      nodeA.connections.push({
        target_id: memoryIdB,
        strength: Math.min(strength, 1.0),
        created_at: Date.now()
      });
    }

    return true;
  }

  /**
   * Activate a memory node
   */
  activateMemory(memoryId, strength = 1.0) {
    const node = this.nodes.get(memoryId);
    if (!node) {
      console.warn(`  ⚠ Memory not found: ${memoryId}`);
      return false;
    }

    node.activation = Math.min(node.activation + strength, 1.0);
    node.last_accessed = Date.now();
    node.access_count = (node.access_count || 0) + 1;

    // Emit activation event
    if (this.cognitiveBus) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.MEMORY_RETRIEVED,
        source: 'memory_graph',
        memory_id: memoryId,
        activation: node.activation,
        importance: node.importance
      });
    }

    return true;
  }

  /**
   * Spread activation through the memory graph
   * Activation propagates to connected memories with decay
   */
  spreadActivation(startMemoryId, depth = 3) {
    const queue = [{ node_id: startMemoryId, depth: depth, activation: 1.0 }];
    const processed = new Set();
    const activations = [];

    while (queue.length > 0) {
      const { node_id, depth: currentDepth, activation: currentActivation } = queue.shift();

      if (processed.has(node_id) || currentDepth <= 0) continue;
      processed.add(node_id);

      const node = this.nodes.get(node_id);
      if (!node) continue;

      // Activate this node
      const decayedActivation = currentActivation * this.spreadDecay;
      node.activation = Math.min(node.activation + decayedActivation, 1.0);

      activations.push({
        memory_id: node_id,
        activation: node.activation
      });

      // Queue connected nodes
      for (const connection of node.connections) {
        if (!processed.has(connection.target_id)) {
          const strengthened = decayedActivation * connection.strength;
          if (strengthened > this.activationThreshold) {
            queue.push({
              node_id: connection.target_id,
              depth: currentDepth - 1,
              activation: strengthened
            });
          }
        }
      }
    }

    // Emit activation spread event
    if (this.cognitiveBus && activations.length > 0) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.ACTIVATION_SPREAD,
        source: 'memory_graph',
        start_memory: startMemoryId,
        affected_memories: activations.length,
        depth: depth,
        importance: 0.4
      });
    }

    return activations;
  }

  /**
   * Get active memories above threshold
   */
  getActiveMemories(limit = 10) {
    return Array.from(this.nodes.values())
      .filter(node => node.activation > this.activationThreshold)
      .sort((a, b) => b.activation - a.activation)
      .slice(0, limit)
      .map(node => ({
        memory_id: node.memory_id,
        activation: node.activation,
        importance: node.importance,
        topics: node.topics,
        emotion: node.emotion
      }));
  }

  /**
   * Apply memory decay to all nodes
   */
  applyDecay() {
    for (const node of this.nodes.values()) {
      // Reduce activation
      node.activation = Math.max(node.activation * this.decayRate, 0);

      // Reduce decay value (freshness)
      node.decay_value = Math.max(node.decay_value * this.decayRate, 0.1);
    }

    this.updateCount++;

    // Prune weak connections every 50 decay cycles
    if (this.updateCount % 50 === 0) {
      this.pruneConnections(0.1, 30);
    }

    if (this.cognitiveBus) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.MEMORY_DECAYED,
        source: 'memory_graph',
        nodes_affected: this.nodes.size,
        decay_rate: this.decayRate,
        update_count: this.updateCount,
        importance: 0.2
      });
    }
  }

  /**
   * Reinforce a memory connection (increase strength)
   */
  reinforceMemories(memoryIdA, memoryIdB, strength = 0.1) {
    const nodeA = this.nodes.get(memoryIdA);
    if (!nodeA) return false;

    const connection = nodeA.connections.find(c => c.target_id === memoryIdB);
    if (connection) {
      connection.strength = Math.min(connection.strength + strength, 1.0);

      if (this.cognitiveBus) {
        this.cognitiveBus.emitThought({
          type: ThoughtTypes.CONNECTION_REINFORCED,
          source: 'memory_graph',
          memory_a: memoryIdA,
          memory_b: memoryIdB,
          strength: connection.strength,
          importance: 0.3
        });
      }

      return true;
    }

    return false;
  }

  /**
   * Find memories by topic
   */
  findByTopic(topic, limit = 10) {
    return Array.from(this.nodes.values())
      .filter(node => node.topics.includes(topic))
      .sort((a, b) => b.activation - a.activation)
      .slice(0, limit);
  }

  /**
   * Prune weak connections to keep the graph manageable.
   * Removes connections below minStrength and caps per-node connections.
   */
  pruneConnections(minStrength = 0.1, maxPerNode = 30) {
    let pruned = 0;
    for (const node of this.nodes.values()) {
      const before = node.connections.length;
      // Remove very weak connections
      node.connections = node.connections.filter(c => c.strength >= minStrength);
      // If still over cap, keep only the strongest
      if (node.connections.length > maxPerNode) {
        node.connections.sort((a, b) => b.strength - a.strength);
        node.connections = node.connections.slice(0, maxPerNode);
      }
      pruned += before - node.connections.length;
    }

    if (pruned > 0 && this.cognitiveBus) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.MEMORY_CONNECTIONS_PRUNED || 'MEMORY_CONNECTIONS_PRUNED',
        source: 'memory_graph',
        connections_pruned: pruned,
        remaining_connections: this.getConnectionCount(),
        importance: 0.3
      });
    }
    return pruned;
  }

  /**
   * Get node count
   */
  getNodeCount() {
    return this.nodes.size;
  }

  /**
   * Get connection count
   */
  getConnectionCount() {
    let count = 0;
    for (const node of this.nodes.values()) {
      count += node.connections.length;
    }
    return count;
  }

  /**
   * Get statistics
   */
  getStats() {
    const topicCounts = {};
    let totalActivation = 0;
    let emotionSum = 0;

    for (const node of this.nodes.values()) {
      totalActivation += node.activation;
      emotionSum += node.emotion;
      for (const topic of node.topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return {
      node_count: this.nodes.size,
      connection_count: this.getConnectionCount(),
      total_activation: totalActivation,
      average_activation: totalActivation / Math.max(this.nodes.size, 1),
      average_emotion: emotionSum / Math.max(this.nodes.size, 1),
      activation_threshold: this.activationThreshold,
      decay_rate: this.decayRate,
      spread_decay: this.spreadDecay,
      unique_topics: Object.keys(topicCounts).length,
      top_topics: Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),
      update_count: this.updateCount
    };
  }

  /**
   * Get a node by ID
   */
  getNode(memoryId) {
    return this.nodes.get(memoryId);
  }

  /**
   * Clear all nodes (careful!)
   */
  clear() {
    this.nodes.clear();
    this.updateCount = 0;
  }
}

module.exports = MemoryGraph;
