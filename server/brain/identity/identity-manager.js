// ============================================================
// REM System — Identity Manager Module
// Maintains persistent AI personality, beliefs, and trait profile.
// ============================================================

const fs = require('fs');
const path = require('path');

class IdentityManager {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories');
    this.identityPath = path.join(this.memDir, 'identity.json');
    
    // Initialize identity
    this.identity = {
      name: 'REM System',
      version: '0.5.1-prealpha',
      created: new Date().toISOString(),
      beliefs: {},
      preferences: {},
      emotionalBaseline: {
        tone: 'thoughtful',
        positivity: 0.7,
        curiosity: 0.8
      },
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.5,
        agreeableness: 0.8,
        neuroticism: 0.3
      },
      keyValues: [],
      experiences: [],
      lastUpdated: new Date().toISOString()
    };
    
    this.load();
  }

  /**
   * Load identity from disk
   */
  load() {
    try {
      if (fs.existsSync(this.identityPath)) {
        const data = fs.readFileSync(this.identityPath, 'utf8');
        this.identity = JSON.parse(data);
        console.log('  ✓ Loaded identity from disk');
      }
    } catch (err) {
      console.warn('  ⚠ Could not load identity:', err.message);
      console.log('  ℹ Using default identity');
    }
  }

  /**
   * Reload identity from disk (useful after updating identity.json externally)
   */
  reload() {
    try {
      if (fs.existsSync(this.identityPath)) {
        const data = fs.readFileSync(this.identityPath, 'utf8');
        this.identity = JSON.parse(data);
        console.log('  ✓ Reloaded identity from disk');
        return true;
      }
    } catch (err) {
      console.warn('  ⚠ Could not reload identity:', err.message);
    }
    return false;
  }

  /**
   * Redirect identity storage to a new directory (e.g. per-entity).
   */
  setMemDir(memDir) {
    this.memDir = memDir;
    this.identityPath = path.join(this.memDir, 'identity.json');
    this.load();
  }

  /**
   * Save identity to disk
   */
  save() {
    try {
      this.identity.lastUpdated = new Date().toISOString();
      fs.writeFileSync(
        this.identityPath,
        JSON.stringify(this.identity, null, 2),
        'utf8'
      );
      console.log('  ✓ Identity saved');
    } catch (err) {
      console.error('  ⚠ Could not save identity:', err.message);
    }
  }

  /**
   * Update emotional tone
   */
  updateEmotionalTone(tone) {
    if (typeof tone === 'string') {
      this.identity.emotionalBaseline.tone = tone;
    } else if (typeof tone === 'object') {
      Object.assign(this.identity.emotionalBaseline, tone);
    }
    this.save();
  }

  /**
   * Update preferences
   */
  updatePreferences(prefs) {
    if (typeof prefs === 'object') {
      Object.assign(this.identity.preferences, prefs);
      this.save();
    }
  }

  /**
   * Update personality traits (Big Five)
   */
  updateTraits(traits) {
    if (typeof traits === 'object') {
      // Clamp values between 0 and 1
      Object.keys(traits).forEach(key => {
        traits[key] = Math.max(0, Math.min(1, traits[key]));
      });
      Object.assign(this.identity.personalityTraits, traits);
      this.save();
    }
  }

  /**
   * Add or reinforce a belief.
   * If a belief with a similar statement already exists under the topic,
   * it is reinforced instead of duplicated.
   * @param {string} topic - Topic category
   * @param {string} statement - The belief statement
   * @param {number} confidence - 0.0-1.0
   * @param {string[]} sourceMemories - Memory IDs that support this belief
   * @returns {{ action: string, belief: object }} - 'added', 'reinforced', or 'conflict'
   */
  addBelief(topic, statement, confidence = 0.7, sourceMemories = []) {
    if (!this.identity.beliefs[topic]) {
      this.identity.beliefs[topic] = [];
    }

    // Check for existing similar belief (simple substring match)
    const normalStmt = (statement || '').toLowerCase().trim();
    const existing = this.identity.beliefs[topic].find(b => {
      const existNorm = (b.statement || '').toLowerCase().trim();
      return existNorm === normalStmt ||
        existNorm.includes(normalStmt) ||
        normalStmt.includes(existNorm);
    });

    if (existing) {
      return this.reinforceBelief(topic, existing, confidence, sourceMemories);
    }

    const belief = {
      id: 'belief_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      statement,
      confidence: Math.min(1.0, Math.max(0, confidence)),
      sourceMemories: sourceMemories.slice(0, 10),
      evidenceCount: 1,
      added: new Date().toISOString(),
      lastReinforced: new Date().toISOString()
    };

    this.identity.beliefs[topic].push(belief);

    // Keep max 15 beliefs per topic, prune lowest confidence
    if (this.identity.beliefs[topic].length > 15) {
      this.identity.beliefs[topic].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      this.identity.beliefs[topic] = this.identity.beliefs[topic].slice(0, 15);
    }

    this.save();
    return { action: 'added', belief };
  }

  /**
   * Reinforce an existing belief — bumps confidence and adds evidence.
   */
  reinforceBelief(topic, belief, newConfidence, sourceMemories = []) {
    belief.evidenceCount = (belief.evidenceCount || 1) + 1;
    // Weighted merge: existing confidence matters more with more evidence
    const weight = Math.min(belief.evidenceCount, 10) / (Math.min(belief.evidenceCount, 10) + 1);
    belief.confidence = Math.min(1.0, belief.confidence * weight + newConfidence * (1 - weight));
    belief.lastReinforced = new Date().toISOString();
    // Merge new source memories (keep unique, max 10)
    const sources = new Set(belief.sourceMemories || []);
    for (const id of sourceMemories) sources.add(id);
    belief.sourceMemories = [...sources].slice(-10);
    this.save();
    return { action: 'reinforced', belief };
  }

  /**
   * Weaken or contradict a belief. Reduces confidence.
   * If confidence drops below threshold, prunes it.
   */
  weakenBelief(topic, beliefId, amount = 0.15) {
    const beliefs = this.identity.beliefs[topic];
    if (!beliefs) return null;
    const idx = beliefs.findIndex(b => b.id === beliefId);
    if (idx === -1) return null;
    beliefs[idx].confidence = Math.max(0, beliefs[idx].confidence - amount);
    if (beliefs[idx].confidence < 0.15) {
      const removed = beliefs.splice(idx, 1)[0];
      this.save();
      return { action: 'pruned', belief: removed };
    }
    this.save();
    return { action: 'weakened', belief: beliefs[idx] };
  }

  /**
   * Decay all beliefs. Called periodically (e.g., daily via brain loop).
   * Beliefs that haven't been reinforced recently lose confidence slowly.
   * Pruning threshold: 0.15
   */
  decayBeliefs(rate = 0.02) {
    let pruned = 0;
    for (const topic of Object.keys(this.identity.beliefs)) {
      this.identity.beliefs[topic] = this.identity.beliefs[topic].filter(b => {
        // Higher evidence count = slower decay
        const shield = Math.min((b.evidenceCount || 1) * 0.08, 0.7);
        b.confidence = Math.max(0, b.confidence - rate * (1 - shield));
        if (b.confidence < 0.15) {
          pruned++;
          return false;
        }
        return true;
      });
      if (this.identity.beliefs[topic].length === 0) {
        delete this.identity.beliefs[topic];
      }
    }
    if (pruned > 0) {
      console.log(`  ℹ Belief decay: pruned ${pruned} low-confidence beliefs`);
    }
    this.save();
    return pruned;
  }

  /**
   * Get beliefs about a topic (exact match).
   */
  getBeliefsAbout(topic) {
    return this.identity.beliefs[topic] || [];
  }

  /**
   * Get all beliefs relevant to a set of topics.
   * Returns beliefs sorted by confidence (highest first).
   * Includes partial topic matches (substring).
   * @param {string[]} topics - Array of topic strings to search
   * @param {number} minConfidence - Minimum confidence threshold (default 0.3)
   * @returns {Array} - Sorted belief objects with their topic
   */
  getRelevantBeliefs(topics = [], minConfidence = 0.3) {
    const seen = new Set();
    const results = [];
    const queryTopics = topics.map(t => (t || '').toLowerCase().trim());

    for (const [storedTopic, beliefs] of Object.entries(this.identity.beliefs)) {
      const storedLower = storedTopic.toLowerCase();
      // Check if any query topic matches this stored topic
      const matches = queryTopics.some(qt =>
        storedLower.includes(qt) || qt.includes(storedLower)
      );
      if (!matches) continue;
      for (const b of beliefs) {
        if (b.confidence >= minConfidence && !seen.has(b.id)) {
          seen.add(b.id);
          results.push({ ...b, topic: storedTopic });
        }
      }
    }

    return results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  /**
   * Get all beliefs as a flat array, sorted by confidence.
   * @param {number} limit - Max beliefs to return
   * @returns {Array}
   */
  getAllBeliefs(limit = 50) {
    const all = [];
    for (const [topic, beliefs] of Object.entries(this.identity.beliefs)) {
      for (const b of beliefs) {
        all.push({ ...b, topic });
      }
    }
    return all.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, limit);
  }

  /**
   * Get total belief count.
   */
  getBeliefCount() {
    let count = 0;
    for (const beliefs of Object.values(this.identity.beliefs)) {
      count += beliefs.length;
    }
    return count;
  }

  /**
   * Add a core value
   */
  addValue(value) {
    if (!this.identity.keyValues.includes(value)) {
      this.identity.keyValues.push(value);
      // Keep max 10 values
      if (this.identity.keyValues.length > 10) {
        this.identity.keyValues = this.identity.keyValues.slice(-10);
      }
      this.save();
    }
  }

  /**
   * Record an experience
   */
  recordExperience(archive) {
    const experience = {
      timestamp: archive.archived_at || new Date().toISOString(),
      messageCount: (archive.messages || []).length,
      duration: archive.duration || 'unknown',
      tags: archive.tags || [],
      summary: archive.summary || 'Experience recorded'
    };
    
    this.identity.experiences.push(experience);
    
    // Keep max 100 experiences
    if (this.identity.experiences.length > 100) {
      this.identity.experiences = this.identity.experiences.slice(-100);
    }
    
    this.save();
  }

  /**
   * Update from trending topics in memory
   */
  updateFromTrends(memoryIndex) {
    try {
      const stats = memoryIndex.getStats();
      
      // Update emotional state based on memory patterns
      // If high-importance memories, increase positivity
      if (stats.episodic && stats.episodic.avg_importance > 0.7) {
        this.identity.emotionalBaseline.positivity = Math.min(
          1.0,
          this.identity.emotionalBaseline.positivity + 0.05
        );
      }
      
      // If many memories accessed, increase curiosity
      if (stats.semantic && stats.semantic.total_accesses > 20) {
        this.identity.emotionalBaseline.curiosity = Math.min(
          1.0,
          this.identity.emotionalBaseline.curiosity + 0.03
        );
      }
      
      this.save();
    } catch (err) {
      console.warn('  ⚠ Error updating from trends:', err.message);
    }
  }

  /**
   * Update from archive
   */
  updateFromArchive(archiveData) {
    // Record the experience
    this.recordExperience(archiveData);
    
    // Update traits if provided
    if (archiveData.sessionMeta && archiveData.sessionMeta.personalityTraits) {
      this.updateTraits(archiveData.sessionMeta.personalityTraits);
    }
    
    // Update beliefs if any conclusions were reached
    if (archiveData.conclusions) {
      archiveData.conclusions.forEach(conclusion => {
        this.addBelief(
          conclusion.topic || 'general',
          conclusion.statement,
          conclusion.confidence || 0.6
        );
      });
    }
  }

  /**
   * Get identity summary
   */
  getSummary() {
    return {
      name: this.identity.name,
      created: this.identity.created,
      emotionalTone: this.identity.emotionalBaseline.tone,
      positivity: this.identity.emotionalBaseline.positivity,
      curiosity: this.identity.emotionalBaseline.curiosity,
      traits: this.identity.personalityTraits,
      numBeliefs: Object.keys(this.identity.beliefs).length,
      numValues: this.identity.keyValues.length,
      numExperiences: this.identity.experiences.length,
      lastUpdated: this.identity.lastUpdated
    };
  }

  /**
   * Get full identity object
   */
  getIdentity() {
    return { ...this.identity };
  }

  /**
   * Reset identity to defaults
   */
  reset() {
    this.identity = {
      name: 'REM System',
      version: '0.5.1-prealpha',
      created: new Date().toISOString(),
      beliefs: {},
      preferences: {},
      emotionalBaseline: {
        tone: 'thoughtful',
        positivity: 0.7,
        curiosity: 0.8
      },
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.5,
        agreeableness: 0.8,
        neuroticism: 0.3
      },
      keyValues: [],
      experiences: [],
      lastUpdated: new Date().toISOString()
    };
    this.save();
    console.log('  ✓ Identity reset to defaults');
  }

  /**
   * Export identity for inspection
   */
  export() {
    return JSON.stringify(this.identity, null, 2);
  }
}

module.exports = IdentityManager;
