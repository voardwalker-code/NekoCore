// ============================================================
// REM System — Conscious Engine Module
// Processes user messages, retrieves context, and manages LLM interactions.
// ============================================================

const fs = require('fs');
const path = require('path');
const MemoryImages = require('../memory/memory-images');

class ConsciousEngine {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories');
    this.systemPromptPath = path.join(this.memDir, 'system-prompt.txt');
    this.entityId = options.entityId || null;
  }

  /**
   * Redirect to a new memory directory (e.g. per-entity).
   */
  setMemDir(memDir) {
    this.memDir = memDir;
    this.systemPromptPath = path.join(this.memDir, 'system-prompt.txt');
  }

  setEntityId(entityId) {
    this.entityId = entityId || null;
  }

  /**
   * Process a user message and generate a response
   * Returns { role, content, tags, topics }
   */
  async processUserMessage(userMessage, memoryIndex, callLLM) {
    const timestamp = new Date().toISOString();
    
    // Extract topics from the user message
    const topics = this.extractTopics(userMessage);
    
    // Retrieve relevant memories
    const relevantMemories = memoryIndex.searchMemories(topics);
    
    // Build context from memories
    const contextStr = this.buildContext(relevantMemories);
    
    // Load system prompt
    const systemPrompt = this.getSystemPrompt();
    
    // Build the full prompt for the LLM
    const fullPrompt = this.buildLLMPrompt(systemPrompt, contextStr, userMessage);
    
    try {
      // Call the LLM
      const response = await callLLM(fullPrompt);
      
      // Create conversation entry
      return {
        timestamp,
        userMessage,
        assistantResponse: response,
        topics,
        tags: this.generateTags(userMessage, response),
        contextUsed: relevantMemories.length > 0
      };
    } catch (err) {
      console.error('  ⚠ LLM call error:', err.message);
      throw err;
    }
  }

  /**
   * Extract key topics from text
   */
  extractTopics(text) {
    // Simple topic extraction: look for nouns and key phrases
    const words = text.toLowerCase().split(/\s+/);
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'was', 'are', 'be', 'been', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    
    return words
      .filter(w => w.length > 3 && !stopwords.has(w))
      .slice(0, 10); // Top 10 topics
  }

  /**
   * Generate tags based on message content
   */
  generateTags(userMessage, response) {
    const tags = [];
    
    // Check for common patterns
    if (/question|what|how|why|when|where|who/i.test(userMessage)) tags.push('question');
    if (/opinion|think|believe|opinion|feel/i.test(userMessage)) tags.push('opinion');
    if (/problem|issue|help|fix|error/i.test(userMessage)) tags.push('problem');
    if (/solution|answer|resolve|working/i.test(response)) tags.push('solution');
    if (userMessage.length > 500) tags.push('long-form');
    if (response.length > 800) tags.push('detailed-response');
    
    return tags;
  }

  /**
   * Build context string from retrieved memories
   */
  buildContext(memories) {
    if (memories.length === 0) return '';

    let memoryImages = null;
    if (this.entityId) {
      try {
        memoryImages = new MemoryImages({ entityId: this.entityId });
      } catch (_) {
        memoryImages = null;
      }
    }
    
    let context = '[MEMORY CONTEXT]\n';
    
    // Add episodic memories (recent specific events)
    const episodic = memories.filter(m => m.type === 'episodic');
    if (episodic.length > 0) {
      context += '## Recent Events:\n';
      episodic.slice(0, 3).forEach(m => {
        const imageLine = memoryImages && m.id && memoryImages.hasImage(m.id)
          ? ` [image: /api/memory/image?id=${encodeURIComponent(m.id)}]`
          : '';
        context += `- ${m.summary} (${m.date})${imageLine}\n`;
      });
    }
    
    // Add semantic memories (general knowledge)
    const semantic = memories.filter(m => m.type === 'semantic');
    if (semantic.length > 0) {
      context += '## Known Facts:\n';
      semantic.slice(0, 3).forEach(m => {
        const imageLine = memoryImages && m.id && memoryImages.hasImage(m.id)
          ? ` [image: /api/memory/image?id=${encodeURIComponent(m.id)}]`
          : '';
        context += `- ${m.summary}${imageLine}\n`;
      });
    }
    
    context += '\n';
    return context;
  }

  /**
   * Get the system prompt from file
   */
  getSystemPrompt() {
    try {
      if (fs.existsSync(this.systemPromptPath)) {
        return fs.readFileSync(this.systemPromptPath, 'utf8');
      }
    } catch (err) {
      console.error('  ⚠ Could not read system prompt:', err.message);
    }
    
    return `You are an intelligent assistant with access to conversation archives and memory. You maintain continuity across sessions using your memory bank. When you encounter compressed archives, reconstruct the full context before responding.`;
  }

  /**
   * Build the full LLM prompt
   */
  buildLLMPrompt(systemPrompt, contextStr, userMessage) {
    return `${systemPrompt}

${contextStr}

User: ${userMessage}

Respond thoughtfully, using the memory context to maintain continuity and inform your response.`;
  }

  /**
   * Archive a conversation segment
   */
  async archiveConversation(conversationData) {
    try {
      const archiveDir = path.join(this.memDir, 'archives');
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
      
      const archivePath = path.join(
        archiveDir,
        `archive_${Date.now()}.json`
      );
      
      fs.writeFileSync(archivePath, JSON.stringify(conversationData, null, 2), 'utf8');
      console.log(`  ✓ Archived conversation to ${archivePath}`);
      
      return archivePath;
    } catch (err) {
      console.error('  ⚠ Archive error:', err.message);
      throw err;
    }
  }

  /**
   * Clear the current chat display but keep in archive
   */
  clearChatDisplay() {
    return {
      cleared: true,
      timestamp: new Date().toISOString(),
      note: 'Chat cleared for memory archival. Memories consolidated and available in sleep cycle.'
    };
  }
}

module.exports = ConsciousEngine;
