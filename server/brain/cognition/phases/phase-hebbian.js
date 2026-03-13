// Phase: Hebbian Reinforcement
// Strengthens memory connections that co-activate frequently.
// Runs every 5 cycles.

function hebbianPhase(loop) {
  if (!loop.neurochemistry) return;
  if (loop.cycleCount % 5 !== 0) return;

  loop._emit('phase', { name: 'hebbian', status: 'running' });
  const hebbianResult = loop.neurochemistry.applyHebbianReinforcement(3);
  loop._emit('phase', { name: 'hebbian', status: 'done', ...hebbianResult });
}

module.exports = hebbianPhase;
