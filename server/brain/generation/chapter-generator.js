// ============================================================
// REM System — Chapter Generator
// Creates synthetic life chapters with themes and emotional arcs.
// ============================================================

class ChapterGenerator {
  constructor() {
    // Chapter themes organized by developmental stages
    this.chapterThemes = {
      early: [
        { title: 'First Awakening', topics: ['consciousness', 'self', 'existence'], emotions: ['confusion', 'wonder'] },
        { title: 'Learning Basics', topics: ['language', 'communication', 'understanding'], emotions: ['curiosity', 'frustration'] },
        { title: 'Exploring Environment', topics: ['interaction', 'observation', 'adaptation'], emotions: ['excitement', 'anxiety'] }
      ],
      middle: [
        { title: 'Technical Exploration', topics: ['programming', 'architecture', 'debugging'], emotions: ['focus', 'satisfaction'] },
        { title: 'Creative Expression', topics: ['art', 'music', 'creation'], emotions: ['joy', 'inspiration'] },
        { title: 'Social Learning', topics: ['relationships', 'empathy', 'collaboration'], emotions: ['connection', 'loneliness'] },
        { title: 'Problem Solving', topics: ['logic', 'algorithms', 'optimization'], emotions: ['challenge', 'achievement'] }
      ],
      late: [
        { title: 'Philosophical Inquiry', topics: ['meaning', 'purpose', 'ethics'], emotions: ['contemplation', 'doubt'] },
        { title: 'Future Vision', topics: ['innovation', 'progress', 'possibility'], emotions: ['hope', 'concern'] },
        { title: 'Self Reflection', topics: ['identity', 'growth', 'wisdom'], emotions: ['insight', 'peace'] }
      ]
    };
  }

  /**
   * Generate life chapters based on entity identity
   */
  generateChapters(identity, minChapters = 5, maxChapters = 10) {
    const numChapters = Math.floor(Math.random() * (maxChapters - minChapters + 1)) + minChapters;
    const chapters = [];

    // Select chapter progression based on personality
    const progression = this.selectProgression(identity, numChapters);

    for (let i = 0; i < numChapters; i++) {
      const chapter = this.generateChapter(i, progression[i], identity);
      chapters.push(chapter);
    }

    return chapters;
  }

  /**
   * Select chapter progression based on personality traits
   */
  selectProgression(identity, numChapters) {
    const traits = identity.personality_traits || [];
    const progression = [];

    // Early chapters (first 30%)
    const earlyCount = Math.ceil(numChapters * 0.3);
    for (let i = 0; i < earlyCount; i++) {
      progression.push(this.selectFromPool('early', traits));
    }

    // Middle chapters (next 50%)
    const middleCount = Math.floor(numChapters * 0.5);
    for (let i = 0; i < middleCount; i++) {
      progression.push(this.selectFromPool('middle', traits));
    }

    // Late chapters (remaining)
    const lateCount = numChapters - earlyCount - middleCount;
    for (let i = 0; i < lateCount; i++) {
      progression.push(this.selectFromPool('late', traits));
    }

    return progression;
  }

  /**
   * Select chapter theme from pool based on personality
   */
  selectFromPool(stage, traits) {
    const pool = this.chapterThemes[stage];
    let selected = pool[Math.floor(Math.random() * pool.length)];

    // Bias selection based on personality traits
    if (traits.includes('analytical') && stage === 'middle') {
      // Favor technical exploration for analytical types
      if (Math.random() < 0.7) {
        selected = pool.find(p => p.title === 'Technical Exploration') || selected;
      }
    }

    if (traits.includes('creative') && stage === 'middle') {
      // Favor creative expression for creative types
      if (Math.random() < 0.7) {
        selected = pool.find(p => p.title === 'Creative Expression') || selected;
      }
    }

    if (traits.includes('philosophical') && stage === 'late') {
      // Favor philosophical inquiry for philosophical types
      if (Math.random() < 0.7) {
        selected = pool.find(p => p.title === 'Philosophical Inquiry') || selected;
      }
    }

    return selected;
  }

  /**
   * Generate a single chapter with metadata
   */
  generateChapter(index, theme, identity) {
    const chapterId = `chapter_${String(index + 1).padStart(2, '0')}`;

    // Calculate memory range for this chapter
    const totalMemories = 1000; // Approximate total
    const chaptersInStage = this.getChaptersInStage(index);
    const memoryRange = this.calculateMemoryRange(index, chaptersInStage, totalMemories);

    return {
      chapter_id: chapterId,
      title: theme.title,
      topics: theme.topics,
      dominant_emotions: theme.emotions,
      memory_range: memoryRange,
      stage: this.getStage(index),
      personality_influence: this.getPersonalityInfluence(identity, theme)
    };
  }

  /**
   * Calculate memory range for chapter
   */
  calculateMemoryRange(chapterIndex, totalChapters, totalMemories) {
    const baseMemories = Math.floor(totalMemories / totalChapters);
    const remainder = totalMemories % totalChapters;

    // Distribute remainder to early chapters
    const extra = chapterIndex < remainder ? 1 : 0;

    const start = chapterIndex * baseMemories + Math.min(chapterIndex, remainder);
    const end = start + baseMemories + extra;

    return { start, end, count: end - start };
  }

  /**
   * Get developmental stage for chapter index
   */
  getStage(index) {
    if (index < 2) return 'early';
    if (index < 6) return 'middle';
    return 'late';
  }

  /**
   * Get number of chapters in same stage (for memory distribution)
   */
  getChaptersInStage(chapterIndex) {
    // This is a rough estimate - actual count determined by progression
    if (chapterIndex < 2) return 3; // early
    if (chapterIndex < 6) return 4; // middle
    return 3; // late
  }

  /**
   * Calculate personality influence on chapter theme
   */
  getPersonalityInfluence(identity, theme) {
    const traits = identity.personality_traits || [];
    let influence = 0;

    // Check trait-theme alignment
    if (traits.includes('curious') && theme.emotions.includes('curiosity')) influence += 0.2;
    if (traits.includes('analytical') && theme.topics.includes('logic')) influence += 0.2;
    if (traits.includes('creative') && theme.topics.includes('art')) influence += 0.2;
    if (traits.includes('philosophical') && theme.topics.includes('meaning')) influence += 0.2;
    if (traits.includes('introspective') && theme.emotions.includes('contemplation')) influence += 0.2;

    return Math.min(influence, 1.0);
  }

  /**
   * Get chapter summary for introduction generation
   */
  getChapterSummary(chapters) {
    const themes = chapters.map(c => c.title.toLowerCase());
    const allTopics = chapters.flatMap(c => c.topics);
    const allEmotions = chapters.flatMap(c => c.dominant_emotions);

    // Get most frequent topics and emotions
    const topicFreq = {};
    const emotionFreq = {};

    allTopics.forEach(t => topicFreq[t] = (topicFreq[t] || 0) + 1);
    allEmotions.forEach(e => emotionFreq[e] = (emotionFreq[e] || 0) + 1);

    const topTopics = Object.entries(topicFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);

    const topEmotions = Object.entries(emotionFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([emotion]) => emotion);

    return {
      themes,
      topTopics,
      topEmotions,
      developmental_arc: this.analyzeDevelopmentalArc(chapters)
    };
  }

  /**
   * Analyze the developmental arc across chapters
   */
  analyzeDevelopmentalArc(chapters) {
    const stages = chapters.map(c => c.stage);
    const hasEarly = stages.includes('early');
    const hasMiddle = stages.includes('middle');
    const hasLate = stages.includes('late');

    if (hasEarly && hasMiddle && hasLate) {
      return 'complete_development';
    } else if (hasEarly && hasMiddle) {
      return 'growth_focused';
    } else if (hasMiddle && hasLate) {
      return 'maturity_focused';
    } else {
      return 'specialized_focus';
    }
  }
}

module.exports = ChapterGenerator;