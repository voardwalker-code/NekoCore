// Phase: Neurochemistry Tick
// Drifts all four neuromodulators toward their baselines.
// Runs every cycle.

function neurochemistryPhase(loop) {
  if (loop.neurochemistry) {
    loop.neurochemistry.tick();
  }
}

module.exports = neurochemistryPhase;
