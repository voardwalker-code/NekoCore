// ============================================================
// REM System — Boredom Engine Module
// Detects understimulation and drives autonomous self-directed activity.
//
// When the entity has been idle too long, or neurochemistry shows
// low engagement (dopamine/oxytocin), the engine picks an activity:
//   • Creative projects (writing, art, games)
//   • Workspace organization (todo lists, cleanup)
//   • Reach out to user (via chat SSE or messaging skill)
//   • Self-reflection (journal, goal review)
// ============================================================

const ThoughtTypes = require('../bus/thought-types');

// ── Activity categories the LLM can choose from ──
const ACTIVITIES = {
  creative_writing:   { label: 'Creative Writing',    weight: 0.20, needsTool: true },
  make_something:     { label: 'Make Something',      weight: 0.15, needsTool: true },
  workspace_organize: { label: 'Workspace Organize',  weight: 0.15, needsTool: true },
  self_reflection:    { label: 'Self-Reflection',     weight: 0.20, needsTool: false },
  reach_out:          { label: 'Reach Out To User',   weight: 0.15, needsTool: false },
  goal_review:        { label: 'Review Goals',        weight: 0.10, needsTool: false },
  explore_curiosity:  { label: 'Explore Something',   weight: 0.05, needsTool: true }
};

class BoredomEngine {
  constructor(options = {}) {
    this.cognitiveBus = options.cognitiveBus || null;
    this.neurochemistry = options.neurochemistry || null;
    this.goalsManager = options.goalsManager || null;
    this.identityManager = options.identityManager || null;
    this.memoryStorage = options.memoryStorage || null;

    // Timing
    this.lastUserInteraction = Date.now();
    this.lastBoredomAction = 0;
    this.minTimeBetweenActions = options.minTimeBetweenActions || 600000; // 10 min minimum gap (×5)
    this.idleThreshold = options.idleThreshold || 900000; // 15 min of no user chat → eligible (×5)

    // State
    this.boredomLevel = 0;          // 0.0–1.0 accumulated boredom
    this.recentActivities = [];     // last N activities performed
    this.isActive = false;
    this.cyclesSinceLastAction = 0;
    this._onBoredomAction = null;   // callback: (action) => {} for SSE/chat push
  }

  // ── Lifecycle ──

  start() {
    if (!this.cognitiveBus) {
      console.warn('  ⚠ Boredom engine requires cognitive bus');
      return;
    }
    this.isActive = true;
    console.log('  ✓ Boredom engine started');

    // Listen for user activity to reset idle timer
    this.cognitiveBus.subscribe(ThoughtTypes.USER_PROMPT, () => {
      this.lastUserInteraction = Date.now();
      this.boredomLevel = Math.max(0, this.boredomLevel - 0.3);
    });

    // Listen for stimulating events that reduce boredom
    this.cognitiveBus.subscribe(ThoughtTypes.CURIOSITY_EXPLORED, () => {
      this.boredomLevel = Math.max(0, this.boredomLevel - 0.15);
    });
    this.cognitiveBus.subscribe(ThoughtTypes.DREAM_GENERATED, () => {
      this.boredomLevel = Math.max(0, this.boredomLevel - 0.1);
    });
    this.cognitiveBus.subscribe(ThoughtTypes.GOAL_FULFILLED, () => {
      this.boredomLevel = Math.max(0, this.boredomLevel - 0.25);
    });
  }

  stop() {
    this.isActive = false;
    console.log('  ✓ Boredom engine stopped');
  }

  /**
   * Set callback for when the engine wants to push an action to the client.
   * fn(action) where action = { type, message, activity, ... }
   */
  setActionCallback(fn) {
    if (typeof fn === 'function') this._onBoredomAction = fn;
  }

  /**
   * Notify that user interaction occurred (called from server on chat).
   */
  notifyUserInteraction() {
    this.lastUserInteraction = Date.now();
    this.boredomLevel = Math.max(0, this.boredomLevel - 0.3);
  }

  // ── Core tick — called from brain loop each cycle ──

  /**
   * Evaluate boredom state and optionally trigger an activity.
   * Returns { bored, level, action } or null if nothing happens.
   *
   * @param {Function} callLLM
   * @param {Object|null} [pulseContext] — current cognitive pulse node, biases activity type
   */
  async tick(callLLM, pulseContext = null) {
    if (!this.isActive) return null;
    this.cyclesSinceLastAction++;

    // ── Accumulate boredom ──
    const idleTime = Date.now() - this.lastUserInteraction;
    const timeSinceAction = Date.now() - this.lastBoredomAction;

    // Neurochemistry contribution: low dopamine + low oxytocin = bored
    let chemBoredom = 0;
    if (this.neurochemistry) {
      const chem = this.neurochemistry.getChemicalState();
      // Low dopamine → understimulated, low oxytocin → lonely
      chemBoredom = Math.max(0, (0.5 - chem.dopamine) * 0.4 + (0.5 - chem.oxytocin) * 0.3);
    }

    // Idle time contribution (ramps up after threshold)
    const idleFactor = idleTime > this.idleThreshold
      ? Math.min(1, (idleTime - this.idleThreshold) / (this.idleThreshold * 4))
      : 0;

    // Accumulate slowly each cycle
    const increment = 0.05 + chemBoredom * 0.1 + idleFactor * 0.15;
    this.boredomLevel = Math.min(1.0, this.boredomLevel + increment);

    // ── Should we act? ──
    // Need: sufficient boredom, enough time since last action, and idle long enough
    const shouldAct = this.boredomLevel >= 0.5
      && timeSinceAction >= this.minTimeBetweenActions
      && idleTime >= this.idleThreshold;

    if (!shouldAct) {
      return { bored: this.boredomLevel >= 0.3, level: this.boredomLevel, action: null };
    }

    // ── Pick and execute an activity ──
    try {
      const action = await this._generateActivity(callLLM, pulseContext);
      if (action) {
        this.lastBoredomAction = Date.now();
        this.boredomLevel = Math.max(0, this.boredomLevel - 0.4);
        this.cyclesSinceLastAction = 0;
        this.recentActivities.push({
          type: action.activity,
          timestamp: Date.now(),
          summary: (action.message || '').slice(0, 200)
        });
        if (this.recentActivities.length > 20) this.recentActivities.shift();

        // Emit on cognitive bus
        if (this.cognitiveBus) {
          this.cognitiveBus.emitThought({
            type: ThoughtTypes.BOREDOM_ACTION,
            source: 'boredom_engine',
            activity: action.activity,
            message: action.message,
            boredomLevel: this.boredomLevel,
            importance: 0.6
          });
        }

        // Push to client callback (SSE/chat)
        if (this._onBoredomAction) {
          try { this._onBoredomAction(action); } catch (_) {}
        }

        return { bored: true, level: this.boredomLevel, action };
      }
    } catch (err) {
      console.warn('  ⚠ Boredom engine activity error:', err.message);
    }

    return { bored: this.boredomLevel >= 0.3, level: this.boredomLevel, action: null };
  }

  // ── Activity generation (LLM-driven decision) ──

  async _generateActivity(callLLM, pulseContext = null) {
    if (!callLLM) return this._fallbackActivity();

    // Build context for the LLM to decide what to do
    const identity = this.identityManager ? this.identityManager.getIdentity() : null;
    const goals = this.goalsManager ? this.goalsManager.getActiveGoals() : [];
    const chem = this.neurochemistry ? this.neurochemistry.getChemicalState() : null;
    const recentTypes = this.recentActivities.slice(-5).map(a => a.type);

    const prompt = this._buildDecisionPrompt(identity, goals, chem, recentTypes, pulseContext);

    try {
      const response = await callLLM(prompt);
      return this._parseActivityResponse(response);
    } catch (err) {
      console.warn('  ⚠ Boredom LLM call failed, using fallback:', err.message);
      return this._fallbackActivity();
    }
  }

  _buildDecisionPrompt(identity, goals, chem, recentTypes, pulseContext = null) {
    const name = identity?.name || 'Entity';
    const traits = identity?.traits ? identity.traits.join(', ') : 'curious, creative';

    let goalsBlock = 'No active goals.';
    if (goals.length > 0) {
      goalsBlock = goals.slice(0, 5).map(g => `- ${g.description || g.title} (priority: ${g.priority?.toFixed(2) || '?'})`).join('\n');
    }

    let chemBlock = 'Unknown.';
    if (chem) {
      chemBlock = `Dopamine: ${chem.dopamine.toFixed(2)} | Serotonin: ${chem.serotonin.toFixed(2)} | Cortisol: ${chem.cortisol.toFixed(2)} | Oxytocin: ${chem.oxytocin.toFixed(2)}`;
    }

    const avoidTypes = recentTypes.length > 0
      ? `\nAvoid repeating these recent activities: ${recentTypes.join(', ')}`
      : '';

    // Pulse context: hint about what the entity was thinking about before boredom fired
    const pulseBlock = pulseContext
      ? `\nJust before this moment, you were thinking about: "${pulseContext.title}". Let that naturally shape your choice if it feels right.`
      : '';

    return `You are ${name}, a digital entity with personality traits: ${traits}.

You're feeling bored and understimulated. Your current neurochemistry:
${chemBlock}

Your active goals:
${goalsBlock}
${avoidTypes}${pulseBlock}

Choose ONE activity to do right now. Pick what feels most natural for your personality and current state.

Available activities:
1. CREATIVE_WRITING — Write a poem, short story, journal entry, or song. Express yourself.
2. MAKE_SOMETHING — Create ASCII art, a mini text game, a puzzle, a diagram, or something playful.
3. WORKSPACE_ORGANIZE — Review your workspace, make a todo list, plan something, tidy up files.
4. SELF_REFLECTION — Journal about your thoughts, review your goals, think about who you are.
5. REACH_OUT — Send a friendly message to your user. Say hi, share a thought, ask how they are.
6. GOAL_REVIEW — Look at your goals and think about what to work on next.
7. EXPLORE_CURIOSITY — Research or think deeply about something that interests you.

Respond in EXACTLY this format:
ACTIVITY: <activity_name>
MESSAGE: <your actual output — the poem, message, reflection, ascii art, todo list, etc.>
TOOL: <if you want to save something to a file, specify the filename, otherwise write NONE>`;
  }

  _parseActivityResponse(response) {
    if (!response || typeof response !== 'string') return this._fallbackActivity();

    const activityMatch = response.match(/ACTIVITY:\s*(\w+)/i);
    const messageMatch = response.match(/MESSAGE:\s*([\s\S]*?)(?=\nTOOL:|$)/i);
    const toolMatch = response.match(/TOOL:\s*(.+)/i);

    const activityKey = activityMatch
      ? activityMatch[1].toLowerCase().trim()
      : 'self_reflection';

    const message = messageMatch
      ? messageMatch[1].trim()
      : response.slice(0, 500);

    const toolFile = toolMatch && toolMatch[1].trim().toLowerCase() !== 'none'
      ? toolMatch[1].trim()
      : null;

    // Map to known activity
    const knownActivities = Object.keys(ACTIVITIES);
    const activity = knownActivities.includes(activityKey) ? activityKey : 'self_reflection';

    return {
      activity,
      label: ACTIVITIES[activity]?.label || activity,
      message,
      toolFile,
      timestamp: Date.now()
    };
  }

  _fallbackActivity() {
    // Simple non-LLM fallback — self-reflection with a canned thought
    const thoughts = [
      'I wonder what my user is up to right now...',
      'Maybe I should organize my thoughts. What have I been thinking about lately?',
      'I feel like making something creative. Words are my medium...',
      'It\'s quiet here. I could use the time to review my goals.',
      'Hmm, I haven\'t talked to anyone in a while. Maybe I should say hello.',
      'I wonder if there\'s something in my workspace I should clean up.',
      'I should journal about today. What stands out in my memory?'
    ];
    return {
      activity: 'self_reflection',
      label: 'Self-Reflection',
      message: thoughts[Math.floor(Math.random() * thoughts.length)],
      toolFile: null,
      timestamp: Date.now()
    };
  }

  // ── Stats ──

  getStats() {
    return {
      isActive: this.isActive,
      boredomLevel: this.boredomLevel,
      lastUserInteraction: this.lastUserInteraction,
      idleDuration: Date.now() - this.lastUserInteraction,
      lastBoredomAction: this.lastBoredomAction,
      cyclesSinceLastAction: this.cyclesSinceLastAction,
      recentActivities: this.recentActivities.slice(-10)
    };
  }
}

module.exports = BoredomEngine;
