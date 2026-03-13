// ============================================================
// REM System — Subconscious Agent Module
// Processes archived conversations and creates structured memories.
// ============================================================

class SubconsciousAgent {
  constructor(options = {}) {
    this.compressionLevel = options.compressionLevel || 'v4'; // or 'semantic'
  }

  /**
   * Create an episodic memory from archived conversation
   * Episodic: specific events and experiences
   */
  createEpisodicMemory(archiveData) {
    if (!archiveData || !archiveData.messages || archiveData.messages.length === 0) {
      return null;
    }

    const messages = archiveData.messages;
    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];
    
    // Extract key facts from the conversation
    const summary = this.summarizeConversation(messages);
    const topics = this.extractConversationTopics(messages);
    
    return {
      id: `episodic_${Date.now()}`,
      type: 'episodic',
      summary,
      topics,
      date: firstMsg.timestamp || new Date().toISOString(),
      endDate: lastMsg.timestamp,
      importance: this.calculateImportance(messages),
      decay: 1.0, // Will decay over time (1.0 = fresh)
      rawContent: archiveData.compressed || null,
      metadata: {
        messageCount: messages.length,
        userTurns: messages.filter(m => m.role === 'user').length,
        assistantTurns: messages.filter(m => m.role === 'assistant').length
      }
    };
  }

  /**
   * Create a semantic memory from archived conversation
   * Semantic: general knowledge extracted from conversations
   */
  createSemanticMemory(archiveData) {
    if (!archiveData || !archiveData.messages || archiveData.messages.length === 0) {
      return null;
    }

    // Extract facts and insights from the conversation
    const facts = this.extractFacts(archiveData.messages);
    if (facts.length === 0) return null;

    return {
      id: `semantic_${Date.now()}`,
      type: 'semantic',
      facts,
      summary: this.summarizeFacts(facts),
      topics: this.extractConversationTopics(archiveData.messages),
      confidence: this.calculateConfidence(archiveData.messages),
      created: new Date().toISOString(),
      accessCount: 0 // Track how often this is retrieved
    };
  }

  /**
   * Summarize a conversation into a brief narrative
   */
  summarizeConversation(messages) {
    // Simple: take first user message and the gist of responses
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const topics = [];
    
    userMessages.forEach(msg => {
      const words = msg.split(/\s+/).slice(0, 20).join(' ');
      topics.push(words);
    });

    return topics.join(' → ').substring(0, 200) + (topics.length > 200 ? '...' : '');
  }

  /**
   * Extract key topics from messages
   */
  extractConversationTopics(messages) {
    const allText = messages.map(m => m.content).join(' ').toLowerCase();
    const words = allText.split(/\W+/).filter(w => w.length > 3);
    
    // Simple frequency analysis
    const freq = {};
    words.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
    });
    
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);
  }

  /**
   * Extract facts from conversation
   */
  extractFacts(messages) {
    const facts = [];
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    
    // Simple fact extraction: look for statements in assistant responses
    assistantMsgs.forEach(msg => {
      // Split into sentences
      const sentences = msg.content.split(/[.!?]+/).filter(s => s.trim().length > 10);
      sentences.slice(0, 2).forEach(sentence => {
        facts.push({
          statement: sentence.trim(),
          confidence: 0.7 // Default confidence
        });
      });
    });
    
    return facts.slice(0, 5); // Keep top 5 facts
  }

  /**
   * Summarize extracted facts
   */
  summarizeFacts(facts) {
    if (facts.length === 0) return '';
    return facts.map(f => f.statement).join(' ').substring(0, 300);
  }

  /**
   * Calculate importance score based on message characteristics
   */
  calculateImportance(messages) {
    let importance = 0.5; // Base importance
    
    // More messages = more important
    if (messages.length > 5) importance += 0.1;
    if (messages.length > 10) importance += 0.1;
    
    // Look for emotional markers (exclamation, question density)
    const text = messages.map(m => m.content).join(' ');
    const exclamations = (text.match(/!/g) || []).length;
    const questions = (text.match(/\?/g) || []).length;
    
    if (exclamations > 3) importance += 0.1;
    if (questions > 5) importance += 0.1;
    
    // Look for length variation (more interesting)
    const lengths = messages.map(m => m.content.length);
    const variation = Math.max(...lengths) - Math.min(...lengths);
    if (variation > 500) importance += 0.1;
    
    return Math.min(importance, 1.0);
  }

  /**
   * Calculate confidence in extracted facts
   */
  calculateConfidence(messages) {
    const hasSource = messages.some(m => 
      m.metadata && m.metadata.source
    );
    const confidence = hasSource ? 0.9 : 0.7;
    return confidence;
  }

  /**
   * Update identity profile from archived conversation
   */
  updateIdentityProfile(archiveData, identityManager) {
    if (!archiveData || !archiveData.sessionMeta) return;
    
    const meta = archiveData.sessionMeta;
    
    // Update emotional state
    if (meta.emotionalTone) {
      identityManager.updateEmotionalTone(meta.emotionalTone);
    }
    
    // Update preferences
    if (meta.preferences) {
      identityManager.updatePreferences(meta.preferences);
    }
    
    // Update personality traits
    if (meta.personalityTraits) {
      identityManager.updateTraits(meta.personalityTraits);
    }
    
    // Record the experience
    identityManager.recordExperience(archiveData);
  }

  /**
   * Generate a dream-like context from multiple memories
   * Used during sleep cycle
   */
  generateDreamContext(memories) {
    if (memories.length === 0) return '';
    
    let dream = '[DREAM SEQUENCE - Integrated Memories]\n\n';
    
    // Layer memories chronologically
    const sorted = memories.sort((a, b) => 
      new Date(a.date || a.created) - new Date(b.date || b.created)
    );
    
    sorted.slice(0, 5).forEach((mem, idx) => {
      if (mem.type === 'episodic') {
        dream += `**Memory ${idx + 1}:** ${mem.summary}\n`;
      } else if (mem.type === 'semantic') {
        dream += `**Insight ${idx + 1}:** ${mem.summary}\n`;
      }
    });
    
    dream += '\n[End of Dream Sequence]\n';
    return dream;
  }
}

module.exports = SubconsciousAgent;
