// ============================================================
// REM System — Goals Manager Module
// Manages exploration goals and goal emergence from memory patterns.
// ============================================================

const fs = require('fs');
const path = require('path');

class GoalsManager {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories');
    this.goalsDir = path.join(this.memDir, 'goals');
    this.goalsFile = path.join(this.goalsDir, 'goals.json');
    
    // Ensure goals directory exists
    if (!fs.existsSync(this.goalsDir)) {
      fs.mkdirSync(this.goalsDir, { recursive: true });
    }
    
    this.goals = [];
    this.load();
  }

  /**
   * Load goals from disk
   */
  load() {
    try {
      if (fs.existsSync(this.goalsFile)) {
        const data = fs.readFileSync(this.goalsFile, 'utf8');
        this.goals = JSON.parse(data);
        console.log(`  ✓ Loaded ${this.goals.length} goals`);
      }
    } catch (err) {
      console.warn('  ⚠ Could not load goals:', err.message);
      this.goals = [];
    }
  }

  /**
   * Save goals to disk
   */
  save() {
    try {
      fs.writeFileSync(this.goalsFile, JSON.stringify(this.goals, null, 2), 'utf8');
    } catch (err) {
      console.error('  ⚠ Could not save goals:', err.message);
    }
  }

  /**
   * Create a new goal
   */
  addGoal(description, origin = 'manual', priority = 0.5) {
    const goal = {
      goal_id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description,
      origin, // manual | memory_pattern | memory_anomaly | curiosity
      priority: Math.max(0, Math.min(1, priority)),
      status: 'active', // active | dormant | completed | abandoned
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      dream_explorations: 0,
      relevance_score: 0.5,
      decay_rate: 0.01, // Decay 1% per cycle if unused
      metadata: {
        source_memory: null,
        related_topics: []
      }
    };
    
    this.goals.push(goal);
    this.save();
    console.log(`  ✓ Goal added: ${goal.goal_id}`);
    return goal;
  }

  /**
   * Emerge goals from memory patterns
   * Looks for:
   * - Repeated topics
   * - Unresolved questions
   * - Strong emotional signals
   * - Curiosity patterns
   */
  emergeGoals(memories, minOccurrences = 2) {
    if (!memories || memories.length === 0) {
      return [];
    }

    // Track topic frequency and emotional signals
    const topicCounts = {};
    const emotionalSignals = {};
    const unresolvedPatterns = [];

    for (const mem of memories) {
      // Count topics
      if (mem.topics && Array.isArray(mem.topics)) {
        mem.topics.forEach(topic => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }

      // Track emotional keywords
      const content = (mem.semantic || mem.summary || '').toLowerCase();
      const emotionalWords = ['confused', 'uncertain', 'question', 'wonder', 'curious', 'fascinated', 'struggling', 'conflicted'];
      emotionalWords.forEach(word => {
        if (content.includes(word)) {
          emotionalSignals[word] = (emotionalSignals[word] || 0) + 1;
        }
      });

      // Detect unresolved patterns (questions without clear answers)
      if (content.includes('?') || content.includes('uncertain')) {
        unresolvedPatterns.push({
          memory_id: mem.id,
          content: content.substring(0, 100)
        });
      }
    }

    // Create goals from patterns
    const emergentGoals = [];

    // Goal 1: High-frequency topics
    for (const [topic, count] of Object.entries(topicCounts)) {
      if (count >= minOccurrences) {
        // Check if goal already exists
        const existing = this.goals.find(g =>
          g.description.includes(topic) && g.status === 'active'
        );

        if (!existing) {
          const goal = this.addGoal(
            `Explore and deepen understanding of "${topic}"`,
            'memory_pattern',
            Math.min(1.0, 0.5 + (count * 0.1)) // Priority based on frequency
          );
          goal.metadata.related_topics = [topic];
          emergentGoals.push(goal);
        }
      }
    }

    // Goal 2: Emotional/curiosity signals
    for (const [emotion, count] of Object.entries(emotionalSignals)) {
      if (count >= 2) {
        const existing = this.goals.find(g =>
          g.description.includes(emotion) && g.status === 'active'
        );

        if (!existing) {
          const goal = this.addGoal(
            `Process ${emotion} feelings and build confidence`,
            'memory_pattern',
            0.6
          );
          goal.metadata.related_topics = [emotion];
          emergentGoals.push(goal);
        }
      }
    }

    // Goal 3: Unresolved questions
    if (unresolvedPatterns.length >= 2) {
      const existing = this.goals.find(g =>
        g.description.includes('unresolved') && g.status === 'active'
      );

      if (!existing) {
        const goal = this.addGoal(
          'Explore and resolve recurring questions',
          'memory_pattern',
          0.7
        );
        goal.metadata.source_memory = unresolvedPatterns[0].memory_id;
        emergentGoals.push(goal);
      }
    }

    this.save();
    console.log(`  ✓ Emerged ${emergentGoals.length} new goals`);
    return emergentGoals;
  }

  /**
   * Apply decay to goals that haven't been explored
   */
  decayGoals(decayPeriods = 1) {
    let decayedCount = 0;

    for (const goal of this.goals) {
      if (goal.status !== 'active') continue;

      // Only decay if not recently updated
      const lastUpdate = new Date(goal.last_updated);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate > 1) {
        goal.priority *= (1 - (goal.decay_rate * decayPeriods));

        // Mark dormant if priority drops too low
        if (goal.priority < 0.1) {
          goal.status = 'dormant';
        }

        decayedCount++;
      }
    }

    if (decayedCount > 0) {
      this.save();
      console.log(`  ✓ Decayed ${decayedCount} goals`);
    }

    return decayedCount;
  }

  /**
   * Mark a goal as explored (used in dreams)
   */
  markExplored(goalId) {
    const goal = this.goals.find(g => g.goal_id === goalId);
    if (goal) {
      goal.dream_explorations++;
      goal.last_updated = new Date().toISOString();
      // Boost priority when explored
      goal.priority = Math.min(1.0, goal.priority + 0.1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Mark a goal as completed
   */
  completeGoal(goalId) {
    const goal = this.goals.find(g => g.goal_id === goalId);
    if (goal) {
      goal.status = 'completed';
      goal.last_updated = new Date().toISOString();
      this.save();
      console.log(`  ✓ Goal completed: ${goalId}`);
      return true;
    }
    return false;
  }

  /**
   * Get active goals sorted by priority
   */
  getActiveGoals(limit = 5) {
    return this.goals
      .filter(g => g.status === 'active')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  /**
   * Get all goals with their status
   */
  getAllGoals() {
    return this.goals.map(g => ({
      id: g.goal_id,
      description: g.description,
      priority: g.priority,
      status: g.status,
      origin: g.origin,
      explorations: g.dream_explorations,
      created: g.created,
      last_updated: g.last_updated
    }));
  }

  /**
   * Get goal recommendations for dream generation
   * Returns highest priority active goals
   */
  getDreamGoals(limit = 3) {
    return this.getActiveGoals(limit).map(goal => ({
      goal_id: goal.goal_id,
      description: goal.description,
      priority: goal.priority,
      topics: goal.metadata.related_topics
    }));
  }

  /**
   * Analyze goal progress and health
   */
  analyzeProgress() {
    const statusDistribution = {
      active: 0,
      dormant: 0,
      completed: 0,
      abandoned: 0
    };

    let totalPriority = 0;
    let totalExplorations = 0;

    for (const goal of this.goals) {
      statusDistribution[goal.status]++;
      totalPriority += goal.priority;
      totalExplorations += goal.dream_explorations;
    }

    return {
      total_goals: this.goals.length,
      status_distribution: statusDistribution,
      avg_priority: this.goals.length > 0 ? totalPriority / this.goals.length : 0,
      total_explorations: totalExplorations,
      avg_explorations: this.goals.length > 0 ? totalExplorations / this.goals.length : 0,
      stale_goals: this.goals.filter(g => {
        const daysOld = (Date.now() - new Date(g.last_updated).getTime()) / (1000 * 60 * 60 * 24);
        return daysOld > 7;
      }).length
    };
  }

  /**
   * TODO: Implement goal interference detection
   * Prevent contradictory goals from pursuing simultaneously
   */
  detectGoalInterference() {
    // TODO: Find goals with conflicting descriptions
    // TODO: Suggest consolidation or priority weighting
    console.log('  ℹ TODO: Implement goal interference detection');
  }

  /**
   * TODO: Implement goal synthesis
   * Combine related goals into meta-goals
   */
  synthesizeGoals() {
    // TODO: Group related goals by topic
    // TODO: Create parent goals that encompass multiple sub-goals
    // TODO: Track progress at multiple levels of abstraction
    console.log('  ℹ TODO: Implement goal synthesis');
  }
}

module.exports = GoalsManager;
