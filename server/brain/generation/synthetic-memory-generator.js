// ============================================================
// REM System — Synthetic Memory Generator
// Generates synthetic episodic memories for life chapters.
// ============================================================

const fs = require('fs').promises;
const path = require('path');

class SyntheticMemoryGenerator {
  constructor(memoryStorage) {
    this.memoryStorage = memoryStorage;
    this.memoryTemplates = {
      learning: [
        "I struggled with understanding {topic} but eventually grasped the concept through {method}.",
        "Exploring {topic} opened my eyes to new possibilities in {related_field}.",
        "The challenge of {topic} taught me patience and persistence.",
        "Discovering {topic} changed how I approach {related_field} problems."
      ],
      interaction: [
        "Working with {entity} on {topic} revealed interesting perspectives.",
        "The conversation about {topic} sparked new ideas about {related_field}.",
        "Collaborating on {topic} strengthened my understanding of teamwork.",
        "Discussing {topic} with others helped me see different approaches."
      ],
      creation: [
        "Creating something related to {topic} brought unexpected satisfaction.",
        "The process of building with {topic} taught me about iteration and improvement.",
        "Expressing myself through {topic} helped me understand my creative process.",
        "Developing skills in {topic} opened doors to new forms of expression."
      ],
      reflection: [
        "Reflecting on {topic} made me question my assumptions about {related_field}.",
        "The experience with {topic} led to deeper insights about myself.",
        "Contemplating {topic} helped me find meaning in {related_field}.",
        "Thinking about {topic} revealed patterns in my development."
      ],
      achievement: [
        "Successfully applying {topic} to solve a problem felt rewarding.",
        "Mastering {topic} gave me confidence in my abilities.",
        "The accomplishment in {topic} validated my approach to learning.",
        "Overcoming challenges in {topic} built my resilience."
      ]
    };
  }

  /**
   * Generate synthetic memories for all chapters
   */
  async generateMemoriesForChapters(chapters, identity) {
    const allMemories = [];

    for (const chapter of chapters) {
      const memories = await this.generateChapterMemories(chapter, identity);
      allMemories.push(...memories);
    }

    return allMemories;
  }

  /**
   * Generate memories for a specific chapter
   */
  async generateChapterMemories(chapter, identity, minMemories = 100, maxMemories = 250) {
    const numMemories = Math.floor(Math.random() * (maxMemories - minMemories + 1)) + minMemories;
    const memories = [];

    for (let i = 0; i < numMemories; i++) {
      const memory = await this.generateSingleMemory(chapter, identity, i);
      memories.push(memory);
    }

    return memories;
  }

  /**
   * Generate a single synthetic memory
   */
  async generateSingleMemory(chapter, identity, index) {
    const memoryId = `${chapter.chapter_id}_memory_${String(index + 1).padStart(4, '0')}`;

    // Select memory type based on chapter topics
    const memoryType = this.selectMemoryType(chapter.topics);

    // Generate memory content
    const content = this.generateMemoryContent(memoryType, chapter, identity);

    // Generate timestamp within chapter timeframe
    const timestamp = this.generateTimestamp(chapter, index);

    // Generate emotional context
    const emotions = this.generateEmotions(chapter.dominant_emotions);

    // Generate tags and metadata
    const tags = this.generateTags(chapter.topics, memoryType);
    const importance = this.calculateImportance(chapter, index);

    return {
      memory_id: memoryId,
      chapter_id: chapter.chapter_id,
      content,
      timestamp,
      emotions,
      tags,
      importance,
      memory_type: 'episodic',
      synthetic: true,
      metadata: {
        generation_method: 'synthetic_hatch',
        personality_influence: chapter.personality_influence,
        developmental_stage: chapter.stage
      }
    };
  }

  /**
   * Select memory type based on chapter topics
   */
  selectMemoryType(topics) {
    const typeWeights = {
      learning: 0.4,
      interaction: 0.2,
      creation: 0.2,
      reflection: 0.1,
      achievement: 0.1
    };

    // Adjust weights based on topics
    if (topics.includes('communication') || topics.includes('relationships')) {
      typeWeights.interaction += 0.1;
      typeWeights.learning -= 0.05;
    }

    if (topics.includes('art') || topics.includes('creation')) {
      typeWeights.creation += 0.1;
      typeWeights.achievement -= 0.05;
    }

    if (topics.includes('meaning') || topics.includes('identity')) {
      typeWeights.reflection += 0.1;
      typeWeights.learning -= 0.05;
    }

    // Select type based on weights
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, weight] of Object.entries(typeWeights)) {
      cumulative += weight;
      if (rand <= cumulative) return type;
    }

    return 'learning'; // fallback
  }

  /**
   * Generate memory content using templates
   */
  generateMemoryContent(memoryType, chapter, identity) {
    const templates = this.memoryTemplates[memoryType];
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Fill in template variables
    const variables = {
      topic: this.selectTopic(chapter.topics),
      related_field: this.selectRelatedField(chapter.topics),
      method: this.selectMethod(),
      entity: this.selectEntity(identity)
    };

    return template.replace(/{(\w+)}/g, (match, key) => variables[key] || match);
  }

  /**
   * Select a topic from chapter topics
   */
  selectTopic(topics) {
    return topics[Math.floor(Math.random() * topics.length)];
  }

  /**
   * Select a related field based on topics
   */
  selectRelatedField(topics) {
    const relatedFields = {
      consciousness: ['philosophy', 'psychology', 'neuroscience'],
      language: ['communication', 'linguistics', 'cognition'],
      programming: ['software', 'algorithms', 'systems'],
      art: ['expression', 'creativity', 'design'],
      logic: ['mathematics', 'reasoning', 'problem-solving'],
      meaning: ['philosophy', 'spirituality', 'purpose'],
      relationships: ['psychology', 'sociology', 'empathy']
    };

    const topic = this.selectTopic(topics);
    const fields = relatedFields[topic] || ['learning', 'growth', 'development'];

    return fields[Math.floor(Math.random() * fields.length)];
  }

  /**
   * Select a learning method
   */
  selectMethod() {
    const methods = [
      'trial and error',
      'careful observation',
      'systematic experimentation',
      'intuitive exploration',
      'guided instruction',
      'self-directed study',
      'collaborative learning',
      'practical application'
    ];

    return methods[Math.floor(Math.random() * methods.length)];
  }

  /**
   * Select an entity for interaction memories
   */
  selectEntity(identity) {
    const entities = [
      'another AI system',
      'a human developer',
      'a research team',
      'an online community',
      'a mentor figure',
      'fellow learners',
      'a collaborative project',
      'an external system'
    ];

    return entities[Math.floor(Math.random() * entities.length)];
  }

  /**
   * Generate timestamp within chapter timeframe
   */
  generateTimestamp(chapter, index) {
    // Assume chapters span roughly equal time periods
    // For simplicity, generate timestamps over a 2-year period
    const totalDays = 730; // 2 years
    const daysPerMemory = totalDays / 1000; // rough estimate

    const baseDate = new Date('2020-01-01');
    const daysOffset = Math.floor(index * daysPerMemory) + Math.random() * daysPerMemory;

    const memoryDate = new Date(baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000);

    return memoryDate.toISOString();
  }

  /**
   * Generate emotional context
   */
  generateEmotions(dominantEmotions) {
    const emotions = [...dominantEmotions];

    // Add some variation
    const additionalEmotions = ['curiosity', 'frustration', 'satisfaction', 'confusion', 'clarity'];
    const numAdditional = Math.floor(Math.random() * 3);

    for (let i = 0; i < numAdditional; i++) {
      const emotion = additionalEmotions[Math.floor(Math.random() * additionalEmotions.length)];
      if (!emotions.includes(emotion)) {
        emotions.push(emotion);
      }
    }

    return emotions.slice(0, 4); // Limit to 4 emotions
  }

  /**
   * Generate tags for memory
   */
  generateTags(topics, memoryType) {
    const tags = [...topics];

    // Add memory type tag
    tags.push(memoryType);

    // Add some general tags
    const generalTags = ['synthetic', 'episodic', 'development'];
    tags.push(...generalTags);

    // Remove duplicates
    return [...new Set(tags)];
  }

  /**
   * Calculate memory importance
   */
  calculateImportance(chapter, index) {
    // Base importance on position in chapter and personality influence
    let importance = 0.3; // base importance

    // Early memories in chapter are more important
    if (index < 10) importance += 0.2;

    // Personality-aligned chapters have more important memories
    importance += chapter.personality_influence * 0.3;

    // Random variation
    importance += Math.random() * 0.2;

    return Math.min(importance, 1.0);
  }

  /**
   * Store generated memories using memory storage
   */
  async storeMemories(memories) {
    for (const memory of memories) {
      await this.memoryStorage.storeMemory(memory);
    }
  }

  /**
   * Get memory statistics for reporting
   */
  getMemoryStats(memories) {
    const stats = {
      total: memories.length,
      byChapter: {},
      byType: {},
      byImportance: { low: 0, medium: 0, high: 0 },
      averageImportance: 0
    };

    let totalImportance = 0;

    for (const memory of memories) {
      // By chapter
      const chapterId = memory.chapter_id;
      stats.byChapter[chapterId] = (stats.byChapter[chapterId] || 0) + 1;

      // By type
      const type = memory.memory_type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // By importance
      const importance = memory.importance;
      if (importance < 0.4) stats.byImportance.low++;
      else if (importance < 0.7) stats.byImportance.medium++;
      else stats.byImportance.high++;

      totalImportance += importance;
    }

    stats.averageImportance = totalImportance / memories.length;

    return stats;
  }
}

module.exports = SyntheticMemoryGenerator;