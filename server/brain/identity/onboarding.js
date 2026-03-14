// ============================================================
// REM System — Onboarding Interview
// First-time structured conversation to learn about the user.
// ============================================================

const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entityPaths');

const ONBOARDING_QUESTIONS = [
  { round: 1, question: "Before we dive in — what's your name?" },
  { round: 2, question: "Nice to meet you, {name}! What are you into? Hobbies, interests, passions?" },
  { round: 3, question: "What do you do? (work, study, just exploring — anything goes)" },
  { round: 4, question: "What are you hoping we'll do together?" }
];

class Onboarding {
  /**
   * Check if onboarding is complete for an entity.
   * @param {string} entityId - Entity identifier
   * @returns {boolean}
   */
  static isComplete(entityId) {
    try {
      const stateFile = this._getStateFilePath(entityId);
      if (!fs.existsSync(stateFile)) return false;

      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return state.complete === true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Get the next onboarding question.
   * @param {string} entityId - Entity identifier
   * @returns {string|null} Question text or null if complete
   */
  static getNextQuestion(entityId) {
    try {
      const state = this._getState(entityId);
      if (state.complete) return null;

      const currentRound = state.currentRound || 1;
      const question = ONBOARDING_QUESTIONS.find(q => q.round === currentRound);
      if (!question) return null;

      // Replace {name} placeholder if available
      let text = question.question;
      if (state.answers && state.answers.name) {
        text = text.replace('{name}', state.answers.name);
      }

      return text;
    } catch (_) {
      // Initialize onboarding if not started
      this._initState(entityId);
      return ONBOARDING_QUESTIONS[0].question;
    }
  }

  /**
   * Process a user's answer to the current question.
   * @param {string} entityId - Entity identifier
   * @param {string} answer - User's response
   * @returns {object} { done: boolean, nextQuestion: string|null }
   */
  static processAnswer(entityId, answer) {
    const state = this._getState(entityId);
    const currentRound = state.currentRound || 1;
    const cleanedAnswer = this._sanitizeAnswer(answer);

    // Store answer
    if (!state.answers) state.answers = {};

    switch (currentRound) {
      case 1:
        state.answers.name = cleanedAnswer;
        break;
      case 2:
        state.answers.interests = cleanedAnswer;
        break;
      case 3:
        state.answers.occupation = cleanedAnswer;
        break;
      case 4:
        state.answers.intent = cleanedAnswer;
        break;
    }

    // Advance to next round
    state.currentRound = currentRound + 1;

    // Check if complete
    if (state.currentRound > ONBOARDING_QUESTIONS.length) {
      state.complete = true;
      state.completedAt = new Date().toISOString();
      this._saveState(entityId, state);
      return { done: true, nextQuestion: null };
    }

    this._saveState(entityId, state);
    return { done: false, nextQuestion: this.getNextQuestion(entityId) };
  }

  /**
   * Finalize onboarding — encode responses into entity memory.
   * @param {string} entityId - Entity identifier
   * @param {object} options - { memoryStorage, identityManager }
   * @returns {object} { name, interests, occupation, intent }
   */
  static async finalize(entityId, options = {}) {
    const state = this._getState(entityId);
    if (!state.complete) {
      throw new Error('Onboarding not yet complete');
    }

    const answers = state.answers || {};
    const name = answers.name || 'User';
    const interests = answers.interests || '';
    const occupation = answers.occupation || '';
    const intent = answers.intent || '';

    // Store as episodic memory
    if (options.memoryStorage) {
      try {
        const episodicMemory = {
          id: `onboarding_${Date.now()}`,
          semantic: `First meeting with ${name}`,
          summary: `I met ${name} for the first time. ${interests ? `They are interested in: ${interests}. ` : ''}${occupation ? `They do: ${occupation}. ` : ''}${intent ? `They hope we'll: ${intent}.` : ''}`,
          content: { name, interests, occupation, intent, onboarding: true },
          type: 'episodic_memory',
          importance: 0.9,
          decay: 1.0,
          topics: ['user', 'first_meeting', 'introduction'],
          emotionalTag: 'curious',
          created: new Date().toISOString()
        };
        await options.memoryStorage.storeMemory(episodicMemory);
        console.log(`  ✓ Onboarding encoded as episodic memory`);
      } catch (err) {
        console.error(`  ⚠ Failed to store onboarding memory:`, err.message);
      }
    }

    // Store as semantic fact
    if (options.memoryStorage) {
      try {
        const semanticMemory = {
          id: `user_profile_${Date.now()}`,
          semantic: `User profile: ${name}`,
          summary: `${name}'s interests: ${interests}; Occupation: ${occupation}; Intent: ${intent}`,
          content: { name, interests, occupation, intent, type: 'user_profile' },
          type: 'semantic_memory',
          importance: 0.95,
          decay: 1.0,
          topics: ['user', 'profile', 'facts'],
          created: new Date().toISOString()
        };
        await options.memoryStorage.storeMemory(semanticMemory);
        console.log(`  ✓ Onboarding encoded as semantic fact`);
      } catch (err) {
        console.error(`  ⚠ Failed to store semantic fact:`, err.message);
      }
    }

    // Update Life Diary opening entry (add user context)
    const LifeDiary = require('./life-diary');
    const identity = options.identityManager?.getIdentity();
    if (identity) {
      try {
        const userSummary = `I met ${name}${interests ? `, who is interested in ${interests}` : ''}${occupation ? ` and works in ${occupation}` : ''}.${intent ? ` They're hoping we'll ${intent}.` : ''}`;
        
        // Read current diary and append user context to the opening entry
        const diaryPath = entityPaths.getLifeDiaryPath(entityId);
        if (fs.existsSync(diaryPath)) {
          let content = fs.readFileSync(diaryPath, 'utf8');
          // Find the opening entry and insert user context after the first paragraph
          const birthMatch = content.match(/## \[[\d-]+\] — Birth\n\n([\s\S]+?)(?=---)/);
          if (birthMatch) {
            const originalNarrative = birthMatch[1].trim();
            const updatedNarrative = originalNarrative + `\n\n${userSummary}`;
            content = content.replace(birthMatch[1], updatedNarrative + '\n\n');
            fs.writeFileSync(diaryPath, content, 'utf8');
            console.log(`  ✓ Updated Life Diary opening entry with user context`);
          }
        }
      } catch (err) {
        console.error(`  ⚠ Failed to update Life Diary:`, err.message);
      }
    }

    return { name, interests, occupation, intent };
  }

  /**
   * Reset onboarding state (for testing/debugging).
   * @param {string} entityId - Entity identifier
   */
  static reset(entityId) {
    const stateFile = this._getStateFilePath(entityId);
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  }

  // ── Private helpers ──

  static _getStateFilePath(entityId) {
    const entityRoot = entityPaths.getEntityRoot(entityId);
    return path.join(entityRoot, 'onboarding-state.json');
  }

  static _getState(entityId) {
    const stateFile = this._getStateFilePath(entityId);
    if (!fs.existsSync(stateFile)) {
      return this._initState(entityId);
    }
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }

  static _initState(entityId) {
    const state = {
      currentRound: 1,
      complete: false,
      answers: {},
      startedAt: new Date().toISOString()
    };
    this._saveState(entityId, state);
    return state;
  }

  static _saveState(entityId, state) {
    const stateFile = this._getStateFilePath(entityId);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  }

  static _sanitizeAnswer(answer) {
    const raw = String(answer || '').trim();
    if (!raw) return '';

    // Strip accidental internal context payloads if they leak into onboarding.
    let cleaned = raw
      .replace(/^Subconscious turn context for this user message only:\s*/i, '')
      .replace(/\[SUBCONSCIOUS MEMORY CONTEXT\][\s\S]*$/i, '')
      .replace(/\[CONVERSATION RECALL\][\s\S]*$/i, '')
      .trim();

    if (!cleaned) cleaned = raw;

    // Keep onboarding fields concise and safe for diary/memory summaries.
    if (cleaned.length > 400) {
      cleaned = cleaned.slice(0, 400).trim();
    }

    return cleaned;
  }
}

module.exports = Onboarding;
