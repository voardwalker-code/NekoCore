// ============================================================
// REM System — Curiosity Engine Module
// Generates internal thoughts when idle or detecting patterns.
// ============================================================

const ThoughtTypes = require('../bus/thought-types');

class CuriosityEngine {
  constructor(options = {}) {
    this.cognitiveBus = options.cognitiveBus;
    this.memoryGraph = options.memoryGraph;
    this.identityManager = options.identityManager;
    this.isActive = false;
    this.curiosityTriggers = [];
    this.lastCuriosityTime = 0;
    this.minTimeBetweenCuriosities = options.minTimeBetween || 30000; // 30 seconds
    this.curiosityThreshold = options.curiosityThreshold || 0.3;
  }

  /**
   * Start the curiosity engine (subscribe to events)
   */
  start() {
    if (!this.cognitiveBus) {
      console.warn('  ⚠ Curiosity engine requires cognitive bus');
      return;
    }

    this.isActive = true;
    console.log('  ✓ Curiosity engine started');

    // Subscribe to relevant events to detect curiosity triggers
    this.cognitiveBus.subscribe(ThoughtTypes.MEMORY_RETRIEVED, (event) => {
      this.onMemoryAccessed(event);
    });

    this.cognitiveBus.subscribe(ThoughtTypes.PATTERN_DETECTED, (event) => {
      this.onPatternDetected(event);
    });

    this.cognitiveBus.subscribe(ThoughtTypes.DREAM_GENERATED, (event) => {
      this.onDreamCompleted(event);
    });
  }

  /**
   * Stop the curiosity engine
   */
  stop() {
    this.isActive = false;
    console.log('  ✓ Curiosity engine stopped');
  }

  /**
   * Check if idle and generate a curiosity thought
   */
  checkIdleness() {
    if (!this.isActive || !this.cognitiveBus || !this.memoryGraph) {
      return null;
    }

    const now = Date.now();
    if (now - this.lastCuriosityTime < this.minTimeBetweenCuriosities) {
      return null; // Too soon
    }

    // Check for unusual patterns in active memories
    const activeMemories = this.memoryGraph.getActiveMemories(10);
    if (activeMemories.length === 0) {
      return null;
    }

    const thought = this.generateCuriosityThought(activeMemories);
    if (thought) {
      this.lastCuriosityTime = now;
      this.cognitiveBus.emitThought(thought);
    }

    return thought;
  }

  /**
   * Generate a curiosity thought from active memories
   */
  generateCuriosityThought(activeMemories) {
    const triggers = [
      () => this.triggerTopicExpansion(activeMemories),
      () => this.triggerConnectionGaps(activeMemories),
      () => this.triggerRepeatedPatterns(activeMemories),
      () => this.triggerEmotionalUnresolved(activeMemories),
      () => this.triggerKnowledgeGaps(activeMemories)
    ];

    // Pick a random trigger
    const randomTrigger = triggers[Math.floor(Math.random() * triggers.length)];
    return randomTrigger();
  }

  /**
   * Generate a thought about expanding on a topic
   */
  triggerTopicExpansion(activeMemories) {
    const memory = activeMemories[0];
    if (!memory.topics || memory.topics.length === 0) return null;

    const topic = memory.topics[Math.floor(Math.random() * memory.topics.length)];
    const relatedCount = this.memoryGraph.findByTopic(topic).length;

    return {
      type: ThoughtTypes.CURIOSITY_TRIGGER,
      source: 'curiosity_engine',
      question: `I've been thinking a lot about "${topic}". I wonder what else I could learn about this?`,
      trigger_type: 'topic_expansion',
      topic,
      related_memories: relatedCount,
      importance: Math.min(0.6 + (relatedCount * 0.05), 0.95)
    };
  }

  /**
   * Generate a thought about gaps in memory connections
   */
  triggerConnectionGaps(activeMemories) {
    const memory = activeMemories[0];
    const node = this.memoryGraph.getNode(memory.memory_id);

    if (!node) return null;

    const totalPossibleConnections = this.memoryGraph.getNodeCount() - 1;
    const actualConnections = node.connections.length;
    const gapRatio = 1 - (actualConnections / Math.max(totalPossibleConnections, 5));

    if (gapRatio < 0.3) return null; // Not enough gap

    return {
      type: ThoughtTypes.CURIOSITY_TRIGGER,
      source: 'curiosity_engine',
      question: 'I feel like I might be missing connections between some of my memories. What else could relate to this?',
      trigger_type: 'connection_gap',
      memory_id: memory.memory_id,
      connection_count: actualConnections,
      gap_ratio: gapRatio,
      importance: 0.5
    };
  }

  /**
   * Generate a thought about repeated patterns
   */
  triggerRepeatedPatterns(activeMemories) {
    const topicCounts = {};

    for (const memory of activeMemories) {
      if (memory.topics) {
        for (const topic of memory.topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
    }

    // Find most repeated topic
    let maxTopic = null;
    let maxCount = 1;
    for (const [topic, count] of Object.entries(topicCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxTopic = topic;
      }
    }

    if (!maxTopic || maxCount < 2) return null;

    return {
      type: ThoughtTypes.CURIOSITY_TRIGGER,
      source: 'curiosity_engine',
      question: `"${maxTopic}" keeps coming up in my thoughts. Why is this pattern recurring?`,
      trigger_type: 'repeated_pattern',
      pattern_topic: maxTopic,
      occurrence_count: maxCount,
      importance: Math.min(0.5 + (maxCount * 0.1), 0.9)
    };
  }

  /**
   * Generate thought about unresolved emotions
   */
  triggerEmotionalUnresolved(activeMemories) {
    const emotionalMemories = activeMemories.filter(m => Math.abs(m.emotion) > 3);

    if (emotionalMemories.length === 0) return null;

    const memory = emotionalMemories[0];
    const emotionType = memory.emotion > 0 ? 'excited' : 'troubled';

    return {
      type: ThoughtTypes.CURIOSITY_TRIGGER,
      source: 'curiosity_engine',
      question: `I still feel ${emotionType} about this. I wonder if there's more to explore here?`,
      trigger_type: 'emotional_unresolved',
      memory_id: memory.memory_id,
      emotion_intensity: Math.abs(memory.emotion),
      emotion_type: emotionType,
      importance: 0.7
    };
  }

  /**
   * Generate thought about knowledge gaps
   */
  triggerKnowledgeGaps(activeMemories) {
    // Look for memories with specific question words
    const questions = ['why', 'how', 'what', 'when', 'where'];
    let foundQuestion = null;

    for (const memory of activeMemories) {
      if (!memory.topics) continue;
      for (const question of questions) {
        if (memory.topics.some(t => t.toLowerCase().includes(question))) {
          foundQuestion = question;
          break;
        }
      }
      if (foundQuestion) break;
    }

    if (!foundQuestion) {
      foundQuestion = questions[Math.floor(Math.random() * questions.length)];
    }

    return {
      type: ThoughtTypes.CURIOSITY_TRIGGER,
      source: 'curiosity_engine',
      question: `${foundQuestion.charAt(0).toUpperCase()}${foundQuestion.slice(1)} hasn't been explored enough?`,
      trigger_type: 'knowledge_gap',
      question_word: foundQuestion,
      importance: 0.5
    };
  }

  /**
   * Handle memory access event
   */
  onMemoryAccessed(event) {
    this.curiosityTriggers.push({
      type: 'memory_access',
      memory_id: event.memory_id,
      time: Date.now()
    });
  }

  /**
   * Handle pattern detection
   */
  onPatternDetected(event) {
    // Could amplify curiosity about detected patterns
  }

  /**
   * Handle dream completion
   */
  onDreamCompleted(event) {
    // Dreams might inspire curiosity
  }

  /**
   * Get curiosity statistics
   */
  getStats() {
    return {
      is_active: this.isActive,
      triggers_recorded: this.curiosityTriggers.length,
      last_curiosity: this.lastCuriosityTime,
      min_time_between: this.minTimeBetweenCuriosities,
      curiosity_threshold: this.curiosityThreshold,
      recent_triggers: this.curiosityTriggers.slice(-10)
    };
  }
}

module.exports = CuriosityEngine;
