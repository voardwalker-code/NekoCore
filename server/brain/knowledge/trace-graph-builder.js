// ============================================================
// REM System — Trace Graph Builder
// Builds initial trace graphs connecting synthetic memories.
// ============================================================

class TraceGraphBuilder {
  constructor(traceGraph, memoryStorage) {
    this.traceGraph = traceGraph;
    this.memoryStorage = memoryStorage;
    this.connectionProbability = {
      withinChapter: 0.8,  // 80% chance of connection within chapter
      crossChapter: 0.2    // 20% chance of connection across chapters
    };
  }

  /**
   * Build trace graph for all synthetic memories
   */
  async buildInitialTraceGraph(memories) {
    console.log(`Building trace graph for ${memories.length} synthetic memories...`);
    let connectionCount = 0;

    // Group memories by chapter
    const chapterGroups = this.groupMemoriesByChapter(memories);

    // Build connections within chapters
    for (const [chapterId, chapterMemories] of Object.entries(chapterGroups)) {
      connectionCount += await this.buildWithinChapterConnections(chapterMemories);
    }

    // Build connections across chapters
    connectionCount += await this.buildCrossChapterConnections(chapterGroups);

    console.log(`Trace graph building completed (${connectionCount} connections).`);
    return connectionCount;
  }

  /**
   * Group memories by chapter
   */
  groupMemoriesByChapter(memories) {
    const groups = {};

    for (const memory of memories) {
      const chapterId = memory.chapter_id;
      if (!groups[chapterId]) {
        groups[chapterId] = [];
      }
      groups[chapterId].push(memory);
    }

    return groups;
  }

  /**
   * Build connections within a chapter
   */
  async buildWithinChapterConnections(chapterMemories) {
    let count = 0;
    // Sort memories by timestamp
    chapterMemories.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (let i = 0; i < chapterMemories.length; i++) {
      const currentMemory = chapterMemories[i];

      // Connect to previous memories in chapter (temporal sequence)
      const maxConnections = Math.min(5, i); // Connect to up to 5 previous memories
      for (let j = Math.max(0, i - maxConnections); j < i; j++) {
        if (Math.random() < this.connectionProbability.withinChapter) {
          await this.createTraceConnection(currentMemory, chapterMemories[j], 'temporal_sequence');
          count++;
        }
      }

      // Connect to thematically similar memories
      for (let j = 0; j < chapterMemories.length; j++) {
        if (i !== j && this.areThematicallySimilar(currentMemory, chapterMemories[j])) {
          if (Math.random() < this.connectionProbability.withinChapter * 0.5) {
            await this.createTraceConnection(currentMemory, chapterMemories[j], 'thematic_similarity');
            count++;
          }
        }
      }
    }
    return count;
  }

  /**
   * Build connections across chapters
   */
  async buildCrossChapterConnections(chapterGroups) {
    let count = 0;
    const chapterIds = Object.keys(chapterGroups);

    for (let i = 0; i < chapterIds.length; i++) {
      const currentChapterId = chapterIds[i];
      const currentMemories = chapterGroups[currentChapterId];

      // Connect to memories in adjacent chapters
      const adjacentChapters = [
        chapterIds[i - 1], // previous chapter
        chapterIds[i + 1]  // next chapter
      ].filter(id => id); // remove undefined

      for (const adjacentChapterId of adjacentChapters) {
        const adjacentMemories = chapterGroups[adjacentChapterId];

        // Sample a few memories from each chapter for cross-chapter connections
        const sampleSize = Math.min(10, Math.floor(currentMemories.length * 0.1));
        const currentSample = this.sampleMemories(currentMemories, sampleSize);
        const adjacentSample = this.sampleMemories(adjacentMemories, sampleSize);

        for (const currentMemory of currentSample) {
          for (const adjacentMemory of adjacentSample) {
            if (Math.random() < this.connectionProbability.crossChapter) {
              const connectionType = this.determineCrossChapterConnectionType(
                currentMemory, adjacentMemory, i, chapterIds.indexOf(adjacentChapterId)
              );
              await this.createTraceConnection(currentMemory, adjacentMemory, connectionType);
              count++;
            }
          }
        }
      }
    }
    return count;
  }

  /**
   * Sample memories from a collection
   */
  sampleMemories(memories, sampleSize) {
    if (memories.length <= sampleSize) return memories;

    const sampled = [];
    const indices = new Set();

    while (sampled.length < sampleSize) {
      const index = Math.floor(Math.random() * memories.length);
      if (!indices.has(index)) {
        indices.add(index);
        sampled.push(memories[index]);
      }
    }

    return sampled;
  }

  /**
   * Create a trace connection between two memories
   */
  async createTraceConnection(fromMemory, toMemory, connectionType) {
    const traceId = `trace_${fromMemory.memory_id}_to_${toMemory.memory_id}`;

    const trace = {
      trace_id: traceId,
      from_memory_id: fromMemory.memory_id,
      to_memory_id: toMemory.memory_id,
      connection_type: connectionType,
      strength: this.calculateConnectionStrength(fromMemory, toMemory, connectionType),
      created_timestamp: new Date().toISOString(),
      synthetic: true,
      metadata: {
        generation_method: 'synthetic_hatch',
        chapter_context: `${fromMemory.chapter_id}->${toMemory.chapter_id}`
      }
    };

    await this.traceGraph.createTrace(trace);
  }

  /**
   * Calculate connection strength
   */
  calculateConnectionStrength(memory1, memory2, connectionType) {
    let baseStrength = 0.5;

    switch (connectionType) {
      case 'temporal_sequence':
        baseStrength = 0.8; // Strong temporal connections
        break;
      case 'thematic_similarity':
        baseStrength = 0.6; // Moderate thematic connections
        break;
      case 'developmental_progression':
        baseStrength = 0.7; // Strong developmental connections
        break;
      case 'emotional_arc':
        baseStrength = 0.65; // Moderate emotional connections
        break;
      default:
        baseStrength = 0.5;
    }

    // Adjust based on memory importance
    const avgImportance = (memory1.importance + memory2.importance) / 2;
    baseStrength += avgImportance * 0.2;

    // Adjust based on emotional similarity
    if (this.haveSimilarEmotions(memory1, memory2)) {
      baseStrength += 0.1;
    }

    return Math.min(baseStrength, 1.0);
  }

  /**
   * Determine cross-chapter connection type
   */
  determineCrossChapterConnectionType(memory1, memory2, chapterIndex1, chapterIndex2) {
    // Developmental progression (adjacent chapters)
    if (Math.abs(chapterIndex1 - chapterIndex2) === 1) {
      return 'developmental_progression';
    }

    // Emotional arc connections
    if (this.haveSimilarEmotions(memory1, memory2)) {
      return 'emotional_arc';
    }

    // Thematic bridge
    if (this.shareTopics(memory1, memory2)) {
      return 'thematic_bridge';
    }

    // Default cross-chapter connection
    return 'cross_chapter_link';
  }

  /**
   * Check if two memories are thematically similar
   */
  areThematicallySimilar(memory1, memory2) {
    return this.shareTopics(memory1, memory2) ||
           this.haveSimilarEmotions(memory1, memory2) ||
           this.haveContentSimilarity(memory1, memory2);
  }

  /**
   * Check if memories share topics
   */
  shareTopics(memory1, memory2) {
    const tags1 = new Set(memory1.tags || []);
    const tags2 = new Set(memory2.tags || []);

    // Remove synthetic tags for comparison
    const syntheticTags = ['synthetic', 'episodic', 'development'];
    syntheticTags.forEach(tag => {
      tags1.delete(tag);
      tags2.delete(tag);
    });

    const intersection = new Set([...tags1].filter(x => tags2.has(x)));
    return intersection.size > 0;
  }

  /**
   * Check if memories have similar emotions
   */
  haveSimilarEmotions(memory1, memory2) {
    const emotions1 = new Set(memory1.emotions || []);
    const emotions2 = new Set(memory2.emotions || []);

    const intersection = new Set([...emotions1].filter(x => emotions2.has(x)));
    return intersection.size > 0;
  }

  /**
   * Check for content similarity (simple keyword overlap)
   */
  haveContentSimilarity(memory1, memory2) {
    const words1 = new Set(memory1.content.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const words2 = new Set(memory2.content.toLowerCase().split(/\W+/).filter(w => w.length > 3));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    return intersection.size >= 3; // At least 3 common words
  }

  /**
   * Build specialized trace graphs for core memories
   */
  async buildCoreMemoryTraceGraph(coreMemories) {
    console.log(`Building specialized trace graph for ${coreMemories.length} core memories...`);

    // Create a central hub for core memories
    const coreHubTrace = {
      trace_id: 'core_memory_hub',
      from_memory_id: 'core_hub',
      to_memory_id: 'core_hub',
      connection_type: 'core_memory_network',
      strength: 1.0,
      created_timestamp: new Date().toISOString(),
      synthetic: true,
      metadata: {
        generation_method: 'synthetic_hatch',
        purpose: 'core_identity_network'
      }
    };

    // Connect each core memory to the hub
    for (const coreMemory of coreMemories) {
      const hubConnection = {
        ...coreHubTrace,
        trace_id: `core_hub_to_${coreMemory.memory_id}`,
        to_memory_id: coreMemory.memory_id
      };

      await this.traceGraph.createTrace(hubConnection);
    }

    // Create connections between related core memories
    for (let i = 0; i < coreMemories.length; i++) {
      for (let j = i + 1; j < coreMemories.length; j++) {
        const memory1 = coreMemories[i];
        const memory2 = coreMemories[j];

        if (this.areCoreMemoriesRelated(memory1, memory2)) {
          await this.createTraceConnection(memory1, memory2, 'core_memory_link');
        }
      }
    }
  }

  /**
   * Check if two core memories are related
   */
  areCoreMemoriesRelated(memory1, memory2) {
    // Stronger criteria for core memory connections
    return this.shareTopics(memory1, memory2) &&
           (this.haveSimilarEmotions(memory1, memory2) ||
            this.haveContentSimilarity(memory1, memory2) ||
            this.shareCoreReason(memory1, memory2));
  }

  /**
   * Check if core memories share core reasons
   */
  shareCoreReason(memory1, memory2) {
    const reason1 = memory1.core_reason;
    const reason2 = memory2.core_reason;

    if (!reason1 || !reason2) return false;

    // Similar reasons indicate related core memories
    const similarReasons = {
      'high_importance': ['emotional_impact', 'significant_achievement'],
      'emotional_impact': ['high_importance', 'identity_reflection'],
      'significant_achievement': ['high_importance', 'developmental_milestone'],
      'identity_reflection': ['emotional_impact', 'developmental_milestone'],
      'developmental_milestone': ['significant_achievement', 'identity_reflection']
    };

    return similarReasons[reason1]?.includes(reason2) || reason1 === reason2;
  }

  /**
   * Get trace graph statistics
   */
  async getTraceGraphStats() {
    const allTraces = await this.traceGraph.getAllTraces();

    const stats = {
      totalTraces: allTraces.length,
      connectionTypes: {},
      averageStrength: 0,
      syntheticTraces: 0
    };

    let totalStrength = 0;

    for (const trace of allTraces) {
      // Count connection types
      const type = trace.connection_type;
      stats.connectionTypes[type] = (stats.connectionTypes[type] || 0) + 1;

      // Calculate average strength
      totalStrength += trace.strength;

      // Count synthetic traces
      if (trace.synthetic) {
        stats.syntheticTraces++;
      }
    }

    stats.averageStrength = totalStrength / allTraces.length;

    return stats;
  }

  /**
   * Validate trace graph integrity
   */
  async validateTraceGraph(memories) {
    const allTraces = await this.traceGraph.getAllTraces();
    const memoryIds = new Set(memories.map(m => m.memory_id));
    const issues = [];

    for (const trace of allTraces) {
      // Check that referenced memories exist
      if (!memoryIds.has(trace.from_memory_id) && trace.from_memory_id !== 'core_hub') {
        issues.push(`Trace ${trace.trace_id} references non-existent from_memory: ${trace.from_memory_id}`);
      }
      if (!memoryIds.has(trace.to_memory_id) && trace.to_memory_id !== 'core_hub') {
        issues.push(`Trace ${trace.trace_id} references non-existent to_memory: ${trace.to_memory_id}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

module.exports = TraceGraphBuilder;