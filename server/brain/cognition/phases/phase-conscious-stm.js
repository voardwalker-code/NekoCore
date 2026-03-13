// Phase: ConsciousStm — Per-Cycle STM Decay and Promotion Check
// Runs every brain-loop cycle.
// Decays all STM entries and emits an event if anything is queued for LTM promotion.

async function consciousStmPhase(loop) {
  if (!loop.consciousMemory) return;

  loop.consciousMemory.decayStm();

  const queue = loop.consciousMemory.getPromotionQueue();
  if (queue.length > 0) {
    loop._emit('phase', { name: 'conscious_stm', status: 'promotion_pending', count: queue.length });
  }
}

module.exports = consciousStmPhase;
