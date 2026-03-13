// Phase: Memory Consolidation
// Strengthens high-emotion memories and flags low-value ones during DeepSleep.
// Runs every 15 cycles (DeepSleep cadence).

async function consolidationPhase(loop) {
  if (!loop.neurochemistry || !loop.memoryStorage) return;
  const deepSleepInterval = loop.deepSleepInterval || 150;
  if (loop.cycleCount % deepSleepInterval !== 0) return;

  loop._emit('phase', { name: 'consolidation', status: 'running' });
  const directives = loop._lastDirectives;
  const consolidationLimit = (directives && directives.maxMemoryBatchSize) || 100;
  const allMemories = await loop.memoryStorage.listMemories(consolidationLimit);
  if (allMemories && allMemories.length > 0) {
    const consolidationResult = loop.neurochemistry.runConsolidation(allMemories);
    loop._emit('phase', { name: 'consolidation', status: 'done', ...consolidationResult });
  } else {
    loop._emit('phase', { name: 'consolidation', status: 'done', strengthened: 0, pruned: 0 });
  }
}

module.exports = consolidationPhase;
