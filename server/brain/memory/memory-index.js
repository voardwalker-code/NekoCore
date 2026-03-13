// ============================================================
// REM System — Memory Index Module
// Manages memory storage, retrieval, search, and decay.
// ============================================================

class MemoryIndex {
  constructor(options = {}) {
    this.episodicMemories = []; // Specific events, decay over time
    this.semanticMemories = []; // General knowledge, persist
    this.maxEpisodic = options.maxEpisodic || 100;
    this.maxSemantic = options.maxSemantic || 50;
    this.decayRate = options.decayRate || 0.005; // 0.5% per period (daily)
  }

  /**
   * Add an episodic memory (event-based)
   */
  addEpisodicMemory(memory) {
    if (!memory || !memory.id) return;
    
    // Check for duplicates
    if (this.episodicMemories.some(m => m.id === memory.id)) {
      return;
    }
    
    this.episodicMemories.push(memory);
    
    // Trim if exceeded max
    if (this.episodicMemories.length > this.maxEpisodic) {
      // Remove oldest or least important
      this.episodicMemories.sort((a, b) => {
        const scoreA = a.importance * a.decay;
        const scoreB = b.importance * b.decay;
        return scoreB - scoreA; // Keep high importance/decay
      });
      this.episodicMemories = this.episodicMemories.slice(0, this.maxEpisodic);
    }
  }

  /**
   * Add a semantic memory (knowledge-based)
   */
  addSemanticMemory(memory) {
    if (!memory || !memory.id) return;
    
    // Check for duplicates
    if (this.semanticMemories.some(m => m.id === memory.id)) {
      return;
    }
    
    this.semanticMemories.push(memory);
    
    // Trim if exceeded max
    if (this.semanticMemories.length > this.maxSemantic) {
      // Remove least-accessed or lowest confidence
      this.semanticMemories.sort((a, b) => {
        const scoreA = a.confidence * (a.accessCount || 0);
        const scoreB = b.confidence * (b.accessCount || 0);
        return scoreB - scoreA;
      });
      this.semanticMemories = this.semanticMemories.slice(0, this.maxSemantic);
    }
  }

  /**
   * Search memories by topics/tags
   */
  searchMemories(topics, limit = 5) {
    if (!topics || topics.length === 0) return [];
    
    const topicSet = new Set(topics);
    const results = [];
    
    // Search episodic memories
    this.episodicMemories.forEach(mem => {
      let score = 0;
      if (mem.topics) {
        mem.topics.forEach(t => {
          if (topicSet.has(t)) score += 2;
        });
      }
      
      // Factor in importance and decay
      score *= mem.importance * mem.decay;
      
      if (score > 0) {
        results.push({ ...mem, relevanceScore: score });
      }
    });
    
    // Search semantic memories
    this.semanticMemories.forEach(mem => {
      let score = 0;
      if (mem.topics) {
        mem.topics.forEach(t => {
          if (topicSet.has(t)) score += 3; // Semantic is more specific
        });
      }
      
      // Factor in confidence
      score *= mem.confidence;
      
      if (score > 0) {
        results.push({ ...mem, relevanceScore: score });
        // Increment access count
        mem.accessCount = (mem.accessCount || 0) + 1;
      }
    });
    
    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Decay episodic memories over time
   * Older/less important memories fade
   */
  decayEpisodicMemories() {
    this.episodicMemories.forEach(mem => {
      // Decay is reduced by importance — gentle daily rate
      const importanceShield = 1 - (mem.importance || 0.5) * 0.7;
      const decayFactor = this.decayRate * importanceShield;
      mem.decay = Math.max(0.1, mem.decay * (1 - decayFactor));
    });
    
    // No longer removing memories — decay floor of 0.1 keeps them retrievable
  }

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      episodic: {
        count: this.episodicMemories.length,
        avg_importance: this.episodicMemories.length > 0
          ? this.episodicMemories.reduce((sum, m) => sum + m.importance, 0) / this.episodicMemories.length
          : 0,
        avg_decay: this.episodicMemories.length > 0
          ? this.episodicMemories.reduce((sum, m) => sum + m.decay, 0) / this.episodicMemories.length
          : 0
      },
      semantic: {
        count: this.semanticMemories.length,
        avg_confidence: this.semanticMemories.length > 0
          ? this.semanticMemories.reduce((sum, m) => sum + m.confidence, 0) / this.semanticMemories.length
          : 0,
        total_accesses: this.semanticMemories.reduce((sum, m) => sum + (m.accessCount || 0), 0)
      }
    };
  }

  /**
   * Export memories to JSON
   */
  exportMemories() {
    return {
      episodic: this.episodicMemories,
      semantic: this.semanticMemories,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import memories from JSON
   */
  importMemories(data) {
    if (data.episodic && Array.isArray(data.episodic)) {
      this.episodicMemories = data.episodic;
    }
    if (data.semantic && Array.isArray(data.semantic)) {
      this.semanticMemories = data.semantic;
    }
  }

  /**
   * Clear all memories
   */
  clear() {
    this.episodicMemories = [];
    this.semanticMemories = [];
  }

  /**
   * Get most important memories (for dreaming/consolidation)
   */
  getMostImportant(count = 5) {
    const all = [
      ...this.episodicMemories.map(m => ({ ...m, type: 'episodic' })),
      ...this.semanticMemories.map(m => ({ ...m, type: 'semantic' }))
    ];
    
    return all
      .sort((a, b) => {
        const scoreA = a.importance || a.confidence || 0;
        const scoreB = b.importance || b.confidence || 0;
        return scoreB - scoreA;
      })
      .slice(0, count);
  }
}

module.exports = MemoryIndex;
