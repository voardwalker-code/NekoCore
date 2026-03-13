// Phase: Trace Analysis
// Analyzes reasoning trace patterns accumulated since last review.
// Runs every 10 cycles; skippable under homeostatic stress.

async function tracesPhase(loop) {
  if (!loop.traceGraph) return;
  if (loop.cycleCount % 10 !== 0) return;

  const directives = loop._lastDirectives;
  if (directives && directives.skipTraceAnalysis) {
    loop._emit('phase', { name: 'trace_analysis', status: 'skipped', reason: 'homeostasis' });
    return;
  }

  loop._emit('phase', { name: 'trace_analysis', status: 'running' });
  const analysis = loop.traceGraph.analyzeTraces();
  loop._emit('phase', { name: 'trace_analysis', status: 'done', traces: analysis.total_traces });
  console.log(`  ℹ Trace analysis: ${analysis.total_traces} traces, avg depth ${analysis.max_depth}`);
}

module.exports = tracesPhase;
