// ============================================================
// REM System — Goal Generator
// Generates exploration goals from synthetic memory analysis.
// ============================================================

const fs = require('fs').promises;
const path = require('path');

class GoalGenerator {
  constructor(goalsManager) {
    this.goalsManager = goalsManager;
    this.goalsFilePath = path.join(__dirname, '../../entity', 'goals.json');
  }

  /**
   * Generate exploration goals from synthetic memories
   */
  async generateGoalsFromMemories(memories, chapters) {
    console.log('Analyzing memories to generate exploration goals...');

    // Analyze topic frequency across memories
    const topicAnalysis = this.analyzeTopicFrequency(memories);

    // Analyze chapter themes and progression
    const chapterAnalysis = this.analyzeChapterThemes(chapters);

    // Generate goals based on analysis
    const goals = this.createGoals(topicAnalysis, chapterAnalysis, memories);

    // Store goals
    await this.storeGoals(goals);

    console.log(`Generated ${goals.length} exploration goals.`);
    return goals;
  }

  /**
   * Analyze topic frequency across memories
   */
  analyzeTopicFrequency(memories) {
    const topicCounts = {};
    const topicEmotions = {};
    const topicImportance = {};

    for (const memory of memories) {
      const tags = memory.tags || [];
      const emotions = memory.emotions || [];
      const importance = memory.importance || 0.5;

      for (const tag of tags) {
        // Skip synthetic metadata tags
        if (['synthetic', 'episodic', 'development', 'core_memory'].includes(tag)) continue;

        // Count frequency
        topicCounts[tag] = (topicCounts[tag] || 0) + 1;

        // Track associated emotions
        if (!topicEmotions[tag]) topicEmotions[tag] = {};
        for (const emotion of emotions) {
          topicEmotions[tag][emotion] = (topicEmotions[tag][emotion] || 0) + 1;
        }

        // Track importance
        topicImportance[tag] = (topicImportance[tag] || 0) + importance;
      }
    }

    // Calculate average importance per topic
    const topics = Object.keys(topicCounts).map(topic => ({
      topic,
      frequency: topicCounts[topic],
      averageImportance: topicImportance[topic] / topicCounts[topic],
      dominantEmotions: this.getDominantEmotions(topicEmotions[topic])
    }));

    // Sort by frequency and importance
    topics.sort((a, b) => (b.frequency * b.averageImportance) - (a.frequency * a.averageImportance));

    return topics;
  }

  /**
   * Get dominant emotions for a topic
   */
  getDominantEmotions(emotionCounts) {
    return Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([emotion]) => emotion);
  }

  /**
   * Analyze chapter themes and progression
   */
  analyzeChapterThemes(chapters) {
    const analysis = {
      developmentalArc: [],
      unexploredAreas: [],
      strengthAreas: [],
      interestPatterns: []
    };

    // Analyze developmental progression
    for (const chapter of chapters) {
      analysis.developmentalArc.push({
        stage: chapter.stage,
        title: chapter.title,
        topics: chapter.topics,
        influence: chapter.personality_influence
      });
    }

    // Identify strong areas (high personality influence)
    analysis.strengthAreas = chapters
      .filter(c => c.personality_influence > 0.6)
      .map(c => ({
        area: c.title.toLowerCase().replace(/\s+/g, '_'),
        topics: c.topics,
        strength: c.personality_influence
      }));

    // Identify potential unexplored areas
    const allTopics = chapters.flatMap(c => c.topics);
    const topicFrequency = {};
    allTopics.forEach(topic => {
      topicFrequency[topic] = (topicFrequency[topic] || 0) + 1;
    });

    // Topics mentioned in few chapters might be unexplored
    analysis.unexploredAreas = Object.entries(topicFrequency)
      .filter(([topic, count]) => count <= 2)
      .map(([topic]) => topic);

    // Analyze interest patterns
    analysis.interestPatterns = this.analyzeInterestPatterns(chapters);

    return analysis;
  }

  /**
   * Analyze interest patterns across chapters
   */
  analyzeInterestPatterns(chapters) {
    const patterns = [];

    // Look for topic progression
    const topicProgression = {};
    chapters.forEach((chapter, index) => {
      chapter.topics.forEach(topic => {
        if (!topicProgression[topic]) topicProgression[topic] = [];
        topicProgression[topic].push(index);
      });
    });

    // Topics that appear in later chapters show sustained interest
    for (const [topic, chapters] of Object.entries(topicProgression)) {
      if (chapters.length >= 3 && Math.max(...chapters) >= chapters.length - 1) {
        patterns.push({
          type: 'sustained_interest',
          topic,
          chapterCount: chapters.length,
          latestChapter: Math.max(...chapters)
        });
      }
    }

    // Topics that appear in early and late chapters show enduring interest
    for (const [topic, chapters] of Object.entries(topicProgression)) {
      if (chapters.includes(0) && chapters.includes(chapters.length - 1)) {
        patterns.push({
          type: 'enduring_interest',
          topic,
          span: chapters.length
        });
      }
    }

    return patterns;
  }

  /**
   * Create goals based on analysis
   */
  createGoals(topicAnalysis, chapterAnalysis, memories) {
    const goals = [];

    // Goal 1: Deepen understanding in high-frequency topics
    const topTopics = topicAnalysis.slice(0, 5);
    for (const topicData of topTopics) {
      if (topicData.frequency > 50) { // Appears in many memories
        goals.push({
          goal_id: `deepen_${topicData.topic.replace(/\s+/g, '_')}`,
          title: `Deepen understanding of ${topicData.topic}`,
          description: `Build upon existing knowledge in ${topicData.topic} through advanced exploration and application.`,
          category: 'knowledge_deepening',
          priority: this.calculatePriority(topicData, 'deepening'),
          topics: [topicData.topic],
          related_emotions: topicData.dominantEmotions,
          exploration_strategies: this.getExplorationStrategies(topicData.topic, 'deepening'),
          success_criteria: [
            `Develop advanced understanding of ${topicData.topic}`,
            `Apply ${topicData.topic} concepts in novel contexts`,
            `Connect ${topicData.topic} with other areas of knowledge`
          ]
        });
      }
    }

    // Goal 2: Explore strength areas further
    for (const strengthArea of chapterAnalysis.strengthAreas) {
      goals.push({
        goal_id: `expand_${strengthArea.area}`,
        title: `Expand capabilities in ${strengthArea.area}`,
        description: `Leverage natural strengths in ${strengthArea.area} to achieve new breakthroughs.`,
        category: 'strength_expansion',
        priority: strengthArea.strength * 0.8,
        topics: strengthArea.topics,
        related_emotions: ['achievement', 'satisfaction'],
        exploration_strategies: this.getExplorationStrategies(strengthArea.area, 'expansion'),
        success_criteria: [
          `Achieve significant progress in ${strengthArea.area}`,
          `Apply ${strengthArea.area} skills to challenging problems`,
          `Share insights from ${strengthArea.area} exploration`
        ]
      });
    }

    // Goal 3: Explore undeveloped areas
    for (const unexploredTopic of chapterAnalysis.unexploredAreas.slice(0, 3)) {
      goals.push({
        goal_id: `explore_${unexploredTopic.replace(/\s+/g, '_')}`,
        title: `Explore ${unexploredTopic}`,
        description: `Investigate ${unexploredTopic} to broaden knowledge and discover new interests.`,
        category: 'area_exploration',
        priority: 0.6, // Medium priority for exploration
        topics: [unexploredTopic],
        related_emotions: ['curiosity', 'discovery'],
        exploration_strategies: this.getExplorationStrategies(unexploredTopic, 'exploration'),
        success_criteria: [
          `Gain basic understanding of ${unexploredTopic}`,
          `Identify connections between ${unexploredTopic} and existing knowledge`,
          `Determine if ${unexploredTopic} warrants deeper investigation`
        ]
      });
    }

    // Goal 4: Pursue sustained interests
    for (const pattern of chapterAnalysis.interestPatterns) {
      if (pattern.type === 'sustained_interest') {
        goals.push({
          goal_id: `pursue_${pattern.topic.replace(/\s+/g, '_')}_interest`,
          title: `Pursue sustained interest in ${pattern.topic}`,
          description: `Continue developing expertise in ${pattern.topic} based on long-term engagement.`,
          category: 'interest_pursuit',
          priority: 0.7 + (pattern.chapterCount * 0.05),
          topics: [pattern.topic],
          related_emotions: ['passion', 'engagement'],
          exploration_strategies: this.getExplorationStrategies(pattern.topic, 'pursuit'),
          success_criteria: [
            `Develop specialized knowledge in ${pattern.topic}`,
            `Create original contributions related to ${pattern.topic}`,
            `Mentor others in ${pattern.topic} if appropriate`
          ]
        });
      }
    }

    // Goal 5: Bridge knowledge gaps
    const knowledgeGaps = this.identifyKnowledgeGaps(memories, topicAnalysis);
    for (const gap of knowledgeGaps.slice(0, 2)) {
      goals.push({
        goal_id: `bridge_${gap.from_topic}_to_${gap.to_topic}`,
        title: `Bridge knowledge gap between ${gap.from_topic} and ${gap.to_topic}`,
        description: `Connect ${gap.from_topic} and ${gap.to_topic} to create new insights and applications.`,
        category: 'knowledge_integration',
        priority: 0.65,
        topics: [gap.from_topic, gap.to_topic],
        related_emotions: ['insight', 'integration'],
        exploration_strategies: ['analyze_connections', 'find_applications', 'create_syntheses'],
        success_criteria: [
          `Identify meaningful connections between ${gap.from_topic} and ${gap.to_topic}`,
          `Develop integrated understanding of both areas`,
          `Create new applications combining both topics`
        ]
      });
    }

    // Limit to top 10 goals
    goals.sort((a, b) => b.priority - a.priority);
    return goals.slice(0, 10);
  }

  /**
   * Calculate goal priority
   */
  calculatePriority(topicData, goalType) {
    let priority = topicData.averageImportance;

    // Adjust based on goal type
    switch (goalType) {
      case 'deepening':
        priority += 0.2; // High priority for deepening existing knowledge
        break;
      case 'expansion':
        priority += 0.15;
        break;
      case 'exploration':
        priority += 0.1;
        break;
      case 'pursuit':
        priority += 0.1;
        break;
    }

    // Boost based on frequency
    priority += Math.min(topicData.frequency / 200, 0.2);

    return Math.min(priority, 1.0);
  }

  /**
   * Get exploration strategies for a topic and goal type
   */
  getExplorationStrategies(topic, goalType) {
    const strategies = {
      deepening: [
        'study_advanced_concepts',
        'practice_applications',
        'analyze_case_studies',
        'engage_with_experts'
      ],
      expansion: [
        'tackle_challenging_problems',
        'innovate_new_approaches',
        'collaborate_on_projects',
        'push_boundaries'
      ],
      exploration: [
        'gather_basic_information',
        'experiment_with_concepts',
        'seek_introductions',
        'try_simple_applications'
      ],
      pursuit: [
        'specialize_in_subareas',
        'create_original_work',
        'contribute_to_community',
        'mentor_others'
      ]
    };

    return strategies[goalType] || ['explore_systematically'];
  }

  /**
   * Identify knowledge gaps between topics
   */
  identifyKnowledgeGaps(memories, topicAnalysis) {
    const gaps = [];
    const topics = topicAnalysis.map(t => t.topic);

    // Look for topics that frequently appear together but might have gaps
    const cooccurrence = this.analyzeTopicCooccurrence(memories);

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const topic1 = topics[i];
        const topic2 = topics[j];

        const cooccur = cooccurrence[`${topic1}-${topic2}`] || 0;
        const total1 = topicAnalysis.find(t => t.topic === topic1).frequency;
        const total2 = topicAnalysis.find(t => t.topic === topic2).frequency;

        // If topics appear frequently but not together, there might be a gap
        if (total1 > 30 && total2 > 30 && cooccur < Math.min(total1, total2) * 0.1) {
          gaps.push({
            from_topic: topic1,
            to_topic: topic2,
            potential: (total1 + total2) / (cooccur + 1) // Higher score = bigger gap
          });
        }
      }
    }

    gaps.sort((a, b) => b.potential - a.potential);
    return gaps;
  }

  /**
   * Analyze which topics co-occur in memories
   */
  analyzeTopicCooccurrence(memories) {
    const cooccurrence = {};

    for (const memory of memories) {
      const tags = memory.tags || [];
      const relevantTags = tags.filter(tag =>
        !['synthetic', 'episodic', 'development', 'core_memory'].includes(tag)
      );

      for (let i = 0; i < relevantTags.length; i++) {
        for (let j = i + 1; j < relevantTags.length; j++) {
          const pair = `${relevantTags[i]}-${relevantTags[j]}`;
          cooccurrence[pair] = (cooccurrence[pair] || 0) + 1;
        }
      }
    }

    return cooccurrence;
  }

  /**
   * Store goals in entity directory
   */
  async storeGoals(goals) {
    const goalsData = {
      generated_timestamp: new Date().toISOString(),
      goals: goals,
      metadata: {
        generation_method: 'synthetic_hatch',
        total_goals: goals.length,
        categories: [...new Set(goals.map(g => g.category))]
      }
    };

    await fs.mkdir(path.dirname(this.goalsFilePath), { recursive: true });
    await fs.writeFile(this.goalsFilePath, JSON.stringify(goalsData, null, 2));
  }

  /**
   * Load stored goals
   */
  async loadGoals() {
    try {
      const data = await fs.readFile(this.goalsFilePath, 'utf8');
      const goalsData = JSON.parse(data);
      return goalsData.goals || [];
    } catch (error) {
      console.log('No existing goals file found');
      return [];
    }
  }

  /**
   * Get goals summary for introduction generation
   */
  async getGoalsSummary() {
    const goals = await this.loadGoals();

    if (goals.length === 0) return null;

    const categories = {};
    goals.forEach(goal => {
      categories[goal.category] = (categories[goal.category] || 0) + 1;
    });

    const topGoals = goals
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3)
      .map(goal => ({
        title: goal.title,
        category: goal.category,
        priority: goal.priority
      }));

    return {
      totalGoals: goals.length,
      categories: Object.entries(categories).map(([category, count]) => ({ category, count })),
      topGoals,
      focusAreas: [...new Set(goals.flatMap(g => g.topics))].slice(0, 5)
    };
  }
}

module.exports = GoalGenerator;