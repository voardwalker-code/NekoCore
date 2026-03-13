// Phase: Connection Pruning
// Removes weak or stale memory connections from the neurochemistry layer.
// Runs every 15 cycles (DeepSleep cadence).

function pruningPhase(loop) {
  if (!loop.neurochemistry || !loop.memoryStorage) return;
  const deepSleepInterval = loop.deepSleepInterval || 150;
  if (loop.cycleCount % deepSleepInterval !== 0) return;

  loop._emit('phase', { name: 'connection_pruning', status: 'running' });
  const pruneResult = loop.neurochemistry.pruneWeakConnections();
  loop._emit('phase', { name: 'connection_pruning', status: 'done', ...pruneResult });
}

module.exports = pruningPhase;
