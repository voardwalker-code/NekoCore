// ============================================================
// REM System — Attention System Module
// Computes attention scores and determines cognitive focus.
// ============================================================

const ThoughtTypes = require('../bus/thought-types');

class AttentionSystem {
  constructor(options = {}) {
    this.cognitiveBus = options.cognitiveBus;
    this.neurochemistry = options.neurochemistry || null;
    this.weights = {
      importance: options.importanceWeight || 0.25,
      emotion: options.emotionWeight || 0.20,
      goalRelevance: options.goalRelevance || 0.20,
      recencyBoost: options.recencyBoostWeight || 0.15,
      novelty: options.noveltyWeight || 0.10,
      emotionSimilarity: options.emotionSimilarityWeight || 0.10
    };

    this.currentFocus = null;
    this.focusThreshold = options.focusThreshold || 0.5;
    this.attentionHistory = [];
    this.maxHistorySize = options.maxHistorySize || 500;

    // If cognitive bus provided, subscribe to relevant events
    if (this.cognitiveBus) {
      this.subscribe();
    }
  }

  /**
   * Subscribe to thought events on the cognitive bus
   */
  subscribe() {
    if (!this.cognitiveBus) return;

    // Listen to thoughts that might need attention
    this.cognitiveBus.subscribe(ThoughtTypes.USER_PROMPT, (event) => {
      this.evaluateThought(event);
    });

    this.cognitiveBus.subscribe(ThoughtTypes.INTERNAL_THOUGHT, (event) => {
      this.evaluateThought(event);
    });

    this.cognitiveBus.subscribe(ThoughtTypes.CURIOSITY_TRIGGER, (event) => {
      this.evaluateThought(event);
    });

    this.cognitiveBus.subscribe(ThoughtTypes.GOAL_EMERGED, (event) => {
      this.evaluateThought(event);
    });

    this.cognitiveBus.subscribe(ThoughtTypes.DREAM_GENERATED, (event) => {
      this.evaluateThought(event);
    });
  }

  /**
   * Compute attention score for a thought
   * Formula: importance * emotionWeight * goalRelevance * recencyBoost * novelty
   */
  computeAttentionScore(thought) {
    // Normalize values between 0 and 1
    const importance = Math.min(thought.importance || 0.5, 1.0);
    const emotion = Math.min(Math.abs(thought.emotion || 0) / 10, 1.0);
    const goalRelevance = this.computeGoalRelevance(thought);
    const recencyBoost = this.computeRecencyBoost(thought.timestamp);
    const novelty = this.computeNovelty(thought);

    // Neurochemistry-driven emotion similarity (if available)
    let emotionSimilarity = 0.5; // neutral default
    if (this.neurochemistry && thought.emotionalTag) {
      emotionSimilarity = this.neurochemistry.emotionSimilarity(thought.emotionalTag);
    }

    const score =
      (importance * this.weights.importance) +
      (emotion * this.weights.emotion) +
      (goalRelevance * this.weights.goalRelevance) +
      (recencyBoost * this.weights.recencyBoost) +
      (novelty * this.weights.novelty) +
      (emotionSimilarity * this.weights.emotionSimilarity);

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Compute relevance to current goals (simplified)
   */
  computeGoalRelevance(thought) {
    if (!thought.topics || thought.topics.length === 0) {
      return 0.2; // Slight base relevance
    }
    // In full implementation, would check against active goals
    return Math.min(thought.topics.length * 0.1, 0.9);
  }

  /**
   * Compute recency boost (newer = higher)
   */
  computeRecencyBoost(timestamp) {
    if (!timestamp) return 0.3;
    const age = Date.now() - timestamp;
    const ageDays = age / (1000 * 60 * 60 * 24);
    // Exponential decay: fresh = 1.0, after 7 days = ~0.37, after 30 days = ~0.05
    return Math.max(0.05, Math.exp(-ageDays / 7));
  }

  /**
   * Compute novelty score (how different from recent thoughts)
   */
  computeNovelty(thought) {
    if (this.attentionHistory.length === 0) return 0.7;

    const recentThoughts = this.attentionHistory.slice(-5);
    const similarThoughts = recentThoughts.filter(t => {
      if (!thought.topics || !t.thought.topics) return false;
      const intersection = thought.topics.filter(topic =>
        t.thought.topics.includes(topic)
      );
      return intersection.length > 0;
    });

    // More similar recent thoughts = less novel
    return Math.max(0, 1.0 - (similarThoughts.length * 0.15));
  }

  /**
   * Evaluate a thought and potentially shift attention
   */
  evaluateThought(thought) {
    const score = this.computeAttentionScore(thought);

    const entry = {
      timestamp: Date.now(),
      thought,
      score
    };

    this.attentionHistory.push(entry);
    if (this.attentionHistory.length > this.maxHistorySize) {
      this.attentionHistory.shift();
    }

    // If score exceeds threshold, emit attention focus event
    if (score > this.focusThreshold) {
      this.shiftFocus(thought, score);
    } else {
      this.emitAttentionScore(thought, score);
    }

    return score;
  }

  /**
   * Shift focus to a new thought
   */
  shiftFocus(thought, score) {
    const previousFocus = this.currentFocus;

    this.currentFocus = {
      timestamp: Date.now(),
      type: thought.type,
      source: thought.source,
      content: thought.content,
      score,
      previous_focus: previousFocus
    };

    if (this.cognitiveBus) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.ATTENTION_FOCUS,
        source: 'attention_system',
        focus: this.currentFocus,
        importance: score,
        previous_focus: previousFocus ? previousFocus.content : null
      });
    }
  }

  /**
   * Emit attention score without shifting focus
   */
  emitAttentionScore(thought, score) {
    if (this.cognitiveBus) {
      this.cognitiveBus.emitThought({
        type: ThoughtTypes.ATTENTION_SCORE_COMPUTED,
        source: 'attention_system',
        thought_type: thought.type,
        score,
        importance: 0.3 // Low importance for just scoring
      });
    }
  }

  /**
   * Get current focus
   */
  getCurrentFocus() {
    return this.currentFocus;
  }

  /**
   * Get attention history
   */
  getAttentionHistory(limit = 20) {
    return this.attentionHistory.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const avgScore = this.attentionHistory.length > 0
      ? this.attentionHistory.reduce((sum, e) => sum + e.score, 0) /
        this.attentionHistory.length
      : 0;

    const typeCounts = {};
    for (const entry of this.attentionHistory) {
      const type = entry.thought.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    return {
      current_focus: this.currentFocus,
      history_size: this.attentionHistory.length,
      average_score: avgScore,
      focus_threshold: this.focusThreshold,
      thought_types: typeCounts,
      weights: this.weights
    };
  }
}

module.exports = AttentionSystem;
