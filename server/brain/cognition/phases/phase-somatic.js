// Phase: Somatic Awareness Tick
// Polls hardware metrics, computes felt sensations, influences neurochemistry.
// Runs every cycle.

function somaticPhase(loop) {
  if (!loop.somaticAwareness) return;
  loop._emit('phase', { name: 'somatic_awareness', status: 'running' });
  loop.somaticAwareness.tick();
  loop._emit('phase', { name: 'somatic_awareness', status: 'done', stress: loop.somaticAwareness.overallStress });
}

module.exports = somaticPhase;
