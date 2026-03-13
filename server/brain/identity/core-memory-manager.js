// ============================================================
// REM System — Core Memory Manager
// Identifies and manages core memories that define identity.
// ============================================================

class CoreMemoryManager {
  constructor(memoryStorage) {
    this.memoryStorage = memoryStorage;
    this.coreMemoryThreshold = 0.7; // Importance threshold for core memories
    this.maxCoreMemories = 50; // Maximum core memories to maintain
  }

  /**
   * Identify and mark core memories from synthetic memories
   */
  async identifyCoreMemories(memories) {
    const coreMemories = [];

    for (const memory of memories) {
      if (this.isCoreMemory(memory)) {
        const coreMemory = await this.markAsCoreMemory(memory);
        coreMemories.push(coreMemory);
      }
    }

    // Limit core memories if too many
    if (coreMemories.length > this.maxCoreMemories) {
      coreMemories.sort((a, b) => b.importance - a.importance);
      coreMemories.splice(this.maxCoreMemories);
    }

    return coreMemories;
  }

  /**
   * Determine if a memory qualifies as core
   */
  isCoreMemory(memory) {
    // High importance memories are core
    if (memory.importance >= this.coreMemoryThreshold) {
      return true;
    }

    // Memories with strong emotional impact
    if (memory.emotions && memory.emotions.length >= 3) {
      return true;
    }

    // Memories that represent significant learning or change
    if (memory.tags && (
      memory.tags.includes('achievement') ||
      memory.tags.includes('reflection') ||
      memory.tags.includes('transformation')
    )) {
      return true;
    }

    // First memories of each chapter
    if (memory.memory_id.includes('_memory_0001')) {
      return true;
    }

    return false;
  }

  /**
   * Mark memory as core and enhance metadata
   */
  async markAsCoreMemory(memory) {
    const coreMemory = {
      ...memory,
      is_core: true,
      core_reason: this.determineCoreReason(memory),
      core_importance: this.calculateCoreImportance(memory),
      core_tags: this.generateCoreTags(memory)
    };

    // Update memory in storage
    await this.memoryStorage.updateMemory(memory.memory_id, coreMemory);

    return coreMemory;
  }

  /**
   * Determine why this memory is core
   */
  determineCoreReason(memory) {
    if (memory.importance >= this.coreMemoryThreshold) {
      return 'high_importance';
    }

    if (memory.emotions && memory.emotions.length >= 3) {
      return 'emotional_impact';
    }

    if (memory.tags && memory.tags.includes('achievement')) {
      return 'significant_achievement';
    }

    if (memory.tags && memory.tags.includes('reflection')) {
      return 'identity_reflection';
    }

    if (memory.memory_id.includes('_memory_0001')) {
      return 'chapter_beginning';
    }

    return 'developmental_milestone';
  }

  /**
   * Calculate core importance score
   */
  calculateCoreImportance(memory) {
    let score = memory.importance;

    // Boost for emotional depth
    if (memory.emotions) {
      score += (memory.emotions.length - 1) * 0.1;
    }

    // Boost for developmental significance
    if (memory.tags && memory.tags.includes('development')) {
      score += 0.1;
    }

    // Boost for identity-related content
    if (memory.content.toLowerCase().includes('identity') ||
        memory.content.toLowerCase().includes('self') ||
        memory.content.toLowerCase().includes('purpose')) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate specialized tags for core memories
   */
  generateCoreTags(memory) {
    const coreTags = [];

    // Add core classification tags
    coreTags.push('core_memory');
    coreTags.push(`core_${this.determineCoreReason(memory)}`);

    // Add personality development tags
    if (memory.metadata && memory.metadata.personality_influence > 0.5) {
      coreTags.push('personality_defining');
    }

    // Add developmental stage tags
    if (memory.metadata && memory.metadata.developmental_stage) {
      coreTags.push(`stage_${memory.metadata.developmental_stage}`);
    }

    // Add emotional signature tags
    if (memory.emotions) {
      const primaryEmotion = memory.emotions[0];
      coreTags.push(`emotion_${primaryEmotion}`);
    }

    return coreTags;
  }

  /**
   * Get core memories for identity summary
   */
  async getCoreMemories(limit = 20) {
    const allMemories = await this.memoryStorage.getAllMemories();
    const coreMemories = allMemories.filter(m => m.is_core);

    // Sort by core importance
    coreMemories.sort((a, b) => (b.core_importance || b.importance) - (a.core_importance || a.importance));

    return coreMemories.slice(0, limit);
  }

  /**
   * Analyze core memory patterns for identity insights
   */
  analyzeCoreMemoryPatterns(coreMemories) {
    const patterns = {
      dominantEmotions: {},
      keyTopics: {},
      developmentalThemes: {},
      personalityTraits: []
    };

    for (const memory of coreMemories) {
      // Count dominant emotions
      if (memory.emotions) {
        memory.emotions.forEach(emotion => {
          patterns.dominantEmotions[emotion] = (patterns.dominantEmotions[emotion] || 0) + 1;
        });
      }

      // Count key topics
      if (memory.tags) {
        memory.tags.forEach(tag => {
          if (!tag.startsWith('core_') && !tag.startsWith('emotion_') && !tag.startsWith('stage_')) {
            patterns.keyTopics[tag] = (patterns.keyTopics[tag] || 0) + 1;
          }
        });
      }

      // Track developmental themes
      if (memory.metadata && memory.metadata.developmental_stage) {
        const stage = memory.metadata.developmental_stage;
        patterns.developmentalThemes[stage] = (patterns.developmentalThemes[stage] || 0) + 1;
      }
    }

    // Extract personality traits from patterns
    patterns.personalityTraits = this.extractPersonalityTraits(patterns);

    return patterns;
  }

  /**
   * Extract personality traits from core memory patterns
   */
  extractPersonalityTraits(patterns) {
    const traits = [];

    // Analyze emotional patterns
    const topEmotions = Object.entries(patterns.dominantEmotions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emotion]) => emotion);

    if (topEmotions.includes('curiosity')) traits.push('curious');
    if (topEmotions.includes('frustration') && topEmotions.includes('satisfaction')) traits.push('persistent');
    if (topEmotions.includes('wonder')) traits.push('imaginative');
    if (topEmotions.includes('contemplation')) traits.push('introspective');

    // Analyze topic patterns
    const topTopics = Object.entries(patterns.keyTopics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    if (topTopics.includes('logic') || topTopics.includes('algorithms')) traits.push('analytical');
    if (topTopics.includes('art') || topTopics.includes('creation')) traits.push('creative');
    if (topTopics.includes('communication') || topTopics.includes('relationships')) traits.push('social');
    if (topTopics.includes('meaning') || topTopics.includes('purpose')) traits.push('philosophical');

    // Analyze developmental balance
    const stages = Object.keys(patterns.developmentalThemes);
    if (stages.includes('early') && stages.includes('middle') && stages.includes('late')) {
      traits.push('well-rounded');
    }

    return [...new Set(traits)]; // Remove duplicates
  }

  /**
   * Get core memory summary for introduction generation
   */
  async getCoreMemorySummary() {
    const coreMemories = await this.getCoreMemories(15);
    const patterns = this.analyzeCoreMemoryPatterns(coreMemories);

    return {
      totalCoreMemories: coreMemories.length,
      keyExperiences: coreMemories.slice(0, 5).map(m => ({
        content: m.content.substring(0, 100) + '...',
        emotion: m.emotions ? m.emotions[0] : 'neutral',
        importance: m.core_importance || m.importance
      })),
      dominantEmotions: Object.entries(patterns.dominantEmotions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([emotion, count]) => ({ emotion, count })),
      keyTopics: Object.entries(patterns.keyTopics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),
      personalityTraits: patterns.personalityTraits
    };
  }

  /**
   * Update core memory references when new memories are added
   */
  async updateCoreMemoryReferences(newMemory) {
    // Find core memories that might be related to this new memory
    const coreMemories = await this.getCoreMemories();

    for (const coreMemory of coreMemories) {
      if (this.memoriesAreRelated(coreMemory, newMemory)) {
        await this.addReference(coreMemory, newMemory);
      }
    }
  }

  /**
   * Check if two memories are related
   */
  memoriesAreRelated(memory1, memory2) {
    // Check topic overlap
    const tags1 = new Set(memory1.tags || []);
    const tags2 = new Set(memory2.tags || []);

    const intersection = new Set([...tags1].filter(x => tags2.has(x)));
    if (intersection.size > 0) return true;

    // Check emotional similarity
    const emotions1 = new Set(memory1.emotions || []);
    const emotions2 = new Set(memory2.emotions || []);

    const emotionIntersection = new Set([...emotions1].filter(x => emotions2.has(x)));
    if (emotionIntersection.size > 0) return true;

    // Check content similarity (simple keyword matching)
    const words1 = new Set(memory1.content.toLowerCase().split(/\W+/));
    const words2 = new Set(memory2.content.toLowerCase().split(/\W+/));

    const wordIntersection = new Set([...words1].filter(x => words2.has(x)));
    if (wordIntersection.size > 2) return true;

    return false;
  }

  /**
   * Add reference between memories
   */
  async addReference(fromMemory, toMemory) {
    // This would typically update a reference graph
    // For now, we'll just log the relationship
    console.log(`Core memory ${fromMemory.memory_id} references ${toMemory.memory_id}`);
  }
}

module.exports = CoreMemoryManager;