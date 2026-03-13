// Phase: Memory Decay + Belief Decay
// Applies daily memory decay and companion belief decay.
// Runs once per day (checked every cycle via timestamp).

const ThoughtTypes = require('../../bus/thought-types');

async function decayPhase(loop) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (now - loop.lastDecayTime < dayMs) return;

  loop._emit('phase', { name: 'memory_decay', status: 'running' });
  let decayResult = { decayed: 0, healed: 0, totalDecayDelta: 0, avgDecayDelta: 0, samples: [] };
  if (loop.memoryStorage) {
    decayResult = await loop.memoryStorage.decayMemories(0.01); // 1% per day
  } else if (loop._memoryIndex) {
    loop._memoryIndex.decayEpisodicMemories();
    decayResult = {
      decayed: Array.isArray(loop._memoryIndex.episodicMemories) ? loop._memoryIndex.episodicMemories.length : 0,
      healed: 0,
      totalDecayDelta: 0,
      avgDecayDelta: 0,
      samples: []
    };
  }

  if (loop.cognitiveBus && typeof loop.cognitiveBus.emitThought === 'function') {
    loop.cognitiveBus.emitThought({
      type: ThoughtTypes.MEMORY_DECAY_TICK,
      source: 'phase_decay',
      decayed: decayResult.decayed || 0,
      healed: decayResult.healed || 0,
      totalDecayDelta: Number(decayResult.totalDecayDelta || 0),
      avgDecayDelta: Number(decayResult.avgDecayDelta || 0),
      samples: Array.isArray(decayResult.samples) ? decayResult.samples : [],
      importance: 0.35
    });
  }

  loop.lastDecayTime = now;
  loop._emit('phase', {
    name: 'memory_decay',
    status: 'done',
    decayed: decayResult.decayed || 0,
    healed: decayResult.healed || 0,
    totalDecayDelta: Number(decayResult.totalDecayDelta || 0)
  });
  console.log('  ℹ Daily memory decay applied');

  // Belief decay runs in the same daily tick
  if (loop._identityManager) {
    loop._identityManager.decayBeliefs(0.02);
    if (loop.cognitiveBus && typeof loop.cognitiveBus.emitThought === 'function') {
      loop.cognitiveBus.emitThought({
        type: ThoughtTypes.BELIEF_DECAY_TICK,
        source: 'phase_decay',
        rate: 0.02,
        importance: 0.25
      });
    }
    loop._emit('phase', { name: 'belief_decay', status: 'done' });
  }
}

module.exports = decayPhase;
