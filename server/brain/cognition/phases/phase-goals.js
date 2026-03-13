// Phase: Goal Emergence
// Scans recent memories for patterns and generates new goals.
// Runs every 5 cycles; skippable under homeostatic stress.

async function goalsPhase(loop) {
  if (!loop.goalsManager) return;
  if (loop.cycleCount % 5 !== 0) return;

  const directives = loop._lastDirectives;
  if (directives && directives.skipGoalEmergence) {
    loop._emit('phase', { name: 'goal_emergence', status: 'skipped', reason: 'homeostasis' });
    return;
  }

  loop._emit('phase', { name: 'goal_emergence', status: 'running' });
  const memLimit = (directives && directives.maxMemoryBatchSize) || 50;
  const memories = await loop.memoryStorage?.listMemories(memLimit);
  if (memories) {
    loop.goalsManager.emergeGoals(memories, 2);
  }
  loop._emit('phase', { name: 'goal_emergence', status: 'done' });
}

module.exports = goalsPhase;
