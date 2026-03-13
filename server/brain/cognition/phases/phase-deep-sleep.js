// Phase: DeepSleep — Belief Graph Emergence
// Scans semantic memories for recurring patterns and forms belief graph nodes.
// Also decays the belief graph and cross-links related beliefs.
// Runs every 15 cycles.

async function deepSleepPhase(loop) {
  if (!loop.beliefGraph || !loop.memoryStorage) return;
  const deepSleepInterval = loop.deepSleepInterval || 150;
  if (loop.cycleCount % deepSleepInterval !== 0) return;

  loop._emit('phase', { name: 'deep_sleep', status: 'running' });

  try {
    const allMemories = await loop.memoryStorage.listMemories(100);
    if (!allMemories || allMemories.length < 3) {
      loop._emit('phase', { name: 'deep_sleep', status: 'done' });
      return;
    }

    const semanticMemories = allMemories.filter(m =>
      (m.type === 'semantic' || m.type === 'episodic' || m.type === 'core_memory') &&
      (m.importance || 0) >= 0.3 &&
      (m.decay || 1) >= 0.2
    );

    if (semanticMemories.length < 3) {
      loop._emit('phase', { name: 'deep_sleep', status: 'done' });
      return;
    }

    const result = loop.beliefGraph.emergeBeliefs(semanticMemories);
    const decayResult = loop.beliefGraph.decayBeliefs(0.015);
    const stats = loop.beliefGraph.getStats();

    loop._emit('phase', {
      name: 'deep_sleep',
      status: 'details',
      beliefs_created: result.created,
      beliefs_reinforced: result.reinforced,
      beliefs_linked: result.linked,
      beliefs_pruned: decayResult.pruned,
      total_beliefs: stats.total_beliefs,
      avg_confidence: stats.avg_confidence
    });

    if (result.created > 0 || result.reinforced > 0 || result.linked > 0 || decayResult.pruned > 0) {
      loop._emit('deep_sleep_complete', {
        beliefs_created: result.created,
        beliefs_reinforced: result.reinforced,
        beliefs_linked: result.linked,
        beliefs_pruned: decayResult.pruned,
        total_beliefs: stats.total_beliefs
      });
      console.log(`  ✓ DeepSleep: +${result.created} beliefs, ↑${result.reinforced} reinforced, ↔${result.linked} linked, ✂${decayResult.pruned} pruned (total: ${stats.total_beliefs})`);
    }
  } catch (err) {
    console.error('  ⚠ DeepSleep phase error:', err.message);
  }

  // ── Conscious LTM promotion ──────────────────────────────────────────
  // Promote any STM entries that have been reinforced enough times.
  // Cross-links to related subconscious + existing LTM memories are added here.
  if (loop.consciousMemory) {
    try {
      const queue = loop.consciousMemory.getPromotionQueue();
      if (queue.length > 0) {
        // Build a flat topic→memory-id lookup from available subconscious memories
        let subconMemories = [];
        if (loop.memoryStorage) {
          try { subconMemories = await loop.memoryStorage.listMemories(200); } catch (_) {}
        }

        let promoted = 0;
        for (const entry of queue) {
          // Find subconscious memories that share topics with this entry
          const subconLinks = subconMemories
            .filter(m => Array.isArray(m.topics) && m.topics.some(t =>
              entry.topics.some(et => et.toLowerCase() === t.toLowerCase())
            ))
            .map(m => m.memory_id)
            .filter(Boolean)
            .slice(0, 10);

          // Find existing LTM entries that share topics (simple disk scan via getLtmContext)
          const relatedLtm = loop.consciousMemory.getLtmContext(entry.topics, 10);
          const ltmLinks = relatedLtm.map(e => e.id).filter(Boolean);

          loop.consciousMemory.promoteToLtm(entry, { subcon_links: subconLinks, ltm_links: ltmLinks });
          promoted++;
        }

        if (promoted > 0) {
          loop._emit('conscious_ltm_promoted', { count: promoted });
          console.log(`  ✓ ConsciousLTM: promoted ${promoted} STM entr${promoted === 1 ? 'y' : 'ies'} to LTM`);
        }
      }
    } catch (err) {
      console.error('  ⚠ Conscious LTM promotion error:', err.message);
    }
  }

  loop._emit('phase', { name: 'deep_sleep', status: 'done' });
}

module.exports = deepSleepPhase;
