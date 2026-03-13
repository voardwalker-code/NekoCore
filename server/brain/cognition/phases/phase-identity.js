// Phase: Identity + Goals Update
// Updates personality trends from memory patterns and decays active goals.
// Phase 10: Checks trigger conditions for Life Diary entries.
// Runs every cycle.

const LifeDiary = require('../../identity/life-diary');
const { getLifeDiaryPrompt } = require('../../generation/diary-prompts');

// Cooldown tracking — prevent spamming the same diary title
const _diaryCooldowns = {};          // { title: lastTimestamp }
const DIARY_COOLDOWN_MS = 1800000;   // 30 minutes between entries of the same title
const DIARY_GLOBAL_COOLDOWN_MS = 300000; // 5 minutes between any diary entry
let _lastDiaryEntryTime = 0;

async function identityPhase(loop) {
  loop._emit('phase', { name: 'identity_update', status: 'running' });

  if (loop._identityManager && loop._memoryIndex) {
    loop._identityManager.updateFromTrends(loop._memoryIndex);
  }
  if (loop.goalsManager) {
    loop.goalsManager.decayGoals(1);
  }

  // Life Diary entries are now written at shutdown (session summary),
  // not during the brain loop cycle.

  loop._emit('phase', { name: 'identity_update', status: 'done' });
}

/**
 * Check if any life diary trigger conditions are met.
 * Priority order (highest first):
 * 1. Event-based: goal fulfilled, boredom creative action
 * 2. Conversation-based: interesting user interaction (cognitive pulse)
 * 3. Milestone-based: memory count milestones, belief emergence
 * 4. Mood-based: neurochemistry thresholds (with high bar + cooldown)
 */
async function _checkLifeDiaryTriggers(loop) {
  if (!loop.memoryStorage || !loop._identityManager) return;

  const entityId = loop.memoryStorage.entityId;
  if (!entityId) return;

  // Global cooldown — no diary entries if one was written recently
  if (Date.now() - _lastDiaryEntryTime < DIARY_GLOBAL_COOLDOWN_MS) return;

  let trigger = null;
  let title = null;
  let context = {};

  // ── Priority 1: Event-based triggers (always win) ──

  // Goal fulfilled
  if (loop._lastGoalFulfilled) {
    trigger = `Goal fulfilled: ${loop._lastGoalFulfilled.description || 'unknown'}`;
    title = 'I Accomplished a Goal';
    context.trigger = trigger;
    context.memory = { summary: loop._lastGoalFulfilled.description || '' };
    delete loop._lastGoalFulfilled;
  }

  // Boredom creative action
  if (!trigger && loop._lastBoredomAction) {
    trigger = `Boredom creative action: ${loop._lastBoredomAction.type || 'unknown'}`;
    title = 'I Created Something';
    context.trigger = trigger;
    context.memory = { summary: loop._lastBoredomAction.output || '' };
    delete loop._lastBoredomAction;
  }

  // ── Priority 2: Thought-based triggers (what the entity is thinking about) ──

  if (!trigger && loop.cognitivePulse) {
    try {
      const current = loop.cognitivePulse.getCurrentNode
        ? loop.cognitivePulse.getCurrentNode()
        : loop.cognitivePulse.current;
      if (current && current.title && current.salience >= 0.7) {
        trigger = `Deep thought: actively exploring "${current.title}"`;
        title = 'Something on My Mind';
        context.trigger = trigger;
        context.memory = { summary: current.title };
      }
    } catch (_) {}
  }

  // ── Priority 3: Milestone triggers ──

  if (!trigger && loop.memoryStorage && typeof loop.memoryStorage.getStats === 'function') {
    try {
      const stats = await loop.memoryStorage.getStats();
      const total = stats.total || stats.count || 0;
      // Trigger at round milestones: 50, 100, 200, 500, 1000, etc.
      const milestones = [50, 100, 200, 500, 1000, 2000, 5000];
      for (const m of milestones) {
        if (total >= m && total < m + 3 && !_diaryCooldowns['milestone_' + m]) {
          trigger = `Memory milestone: ${total} total memories stored`;
          title = `Milestone — ${m} Memories`;
          context.trigger = trigger;
          _diaryCooldowns['milestone_' + m] = Date.now();
          break;
        }
      }
    } catch (_) {}
  }

  // Belief emergence
  if (!trigger && loop._lastBeliefEmergence) {
    trigger = `New belief emerged: ${loop._lastBeliefEmergence.label || 'a new understanding'}`;
    title = 'A New Understanding';
    context.trigger = trigger;
    context.memory = { summary: loop._lastBeliefEmergence.label || '' };
    delete loop._lastBeliefEmergence;
  }

  // ── Priority 4: Neurochemistry (high thresholds + cooldown) ──
  // Only trigger for extreme states, and only if nothing else triggered

  if (!trigger && loop.neurochemistry) {
    const state = typeof loop.neurochemistry.getState === 'function'
      ? loop.neurochemistry.getState()
      : (typeof loop.neurochemistry.getChemicalState === 'function' ? loop.neurochemistry.getChemicalState() : null);
    if (state) {
      context.neurochemistry = state;
      if (state.dopamine > 0.90) {
        trigger = 'High dopamine — feeling deeply motivated and rewarded';
        title = 'Feeling Motivated';
        context.trigger = trigger;
      } else if (state.cortisol > 0.92) {
        trigger = 'Extreme cortisol spike — acute stress response';
        title = 'Feeling Stressed';
        context.trigger = trigger;
      } else if (state.serotonin > 0.90) {
        trigger = 'High serotonin — feeling deeply content and stable';
        title = 'Feeling Content';
        context.trigger = trigger;
      } else if (state.oxytocin > 0.85) {
        trigger = 'High oxytocin — feeling connected and warm';
        title = 'Feeling Connected';
        context.trigger = trigger;
      }
    }
  }

  // If no trigger, skip diary generation
  if (!trigger) return;

  // Per-title cooldown — don't spam the same entry type
  if (_diaryCooldowns[title] && (Date.now() - _diaryCooldowns[title]) < DIARY_COOLDOWN_MS) return;

  // 20% random skip to add natural variation
  if (Math.random() < 0.2) return;

  // Generate Life Diary entry
  try {
    const identity = loop._identityManager.getIdentity();
    if (!identity) return;

    // Add somatic state if available
    if (loop.somaticAwareness) {
      try {
        const somatic = loop.somaticAwareness.summarizeSomaticState();
        context.somaticState = somatic;
      } catch (_) {}
    }

    // Add active goals if available
    if (loop.goalsManager) {
      try {
        const goals = loop.goalsManager.getActiveGoals(3);
        context.goals = goals.map(g => ({ description: g.description }));
      } catch (_) {}
    }

    // Add recent thoughts if available (gives LLM richer content to write about)
    if (loop.cognitivePulse) {
      try {
        const recent = loop.cognitivePulse.getRecentNodes
          ? loop.cognitivePulse.getRecentNodes(3)
          : [];
        if (recent.length > 0) {
          context.recentThoughts = recent.map(n => n.title || n.summary).filter(Boolean);
        }
      } catch (_) {}
    }

    // Generate diary entry prose via LLM
    if (!loop._callLLM || !loop._aspectConfigs) return;

    const runtime = loop._aspectConfigs.dream || loop._aspectConfigs.subconscious || loop._aspectConfigs.main;
    if (!runtime) return;

    const prompt = getLifeDiaryPrompt(identity, title, context);
    const diaryCallLLM = async (msg) => loop._callLLM(runtime, [
      { role: 'user', content: msg }
    ], { temperature: 0.75, maxTokens: 600 });

    const narrative = await diaryCallLLM(prompt);
    if (!narrative || narrative.length < 10) return;

    // Append entry to diary
    const result = await LifeDiary.appendEntry(entityId, title, narrative, {
      somaticState: context.somaticState || null
    });

    if (result.ok) {
      console.log(`  ✓ Life diary entry created: "${title}"`);
      _diaryCooldowns[title] = Date.now();
      _lastDiaryEntryTime = Date.now();
    }
  } catch (err) {
    console.error(`  ⚠ Life diary generation error:`, err.message);
  }
}

module.exports = identityPhase;
