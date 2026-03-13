// Phase: Belief Extraction
// Scans recent high-importance memories and extracts belief candidates via LLM.
// Beliefs are compressed worldview rules derived from patterns across memories.
// Runs every 10 cycles; skippable under homeostatic stress.

async function beliefsPhase(loop) {
  if (!loop._identityManager || !loop.memoryStorage || !loop._callLLM) return;
  if (loop.cycleCount % 10 !== 0) return;

  const directives = loop._lastDirectives;
  if (directives && directives.skipBeliefExtraction) {
    loop._emit('phase', { name: 'belief_extraction', status: 'skipped', reason: 'homeostasis' });
    return;
  }

  loop._emit('phase', { name: 'belief_extraction', status: 'running' });

  try {
    if (!loop._aspectConfigs) { loop._emit('phase', { name: 'belief_extraction', status: 'done' }); return; }

    const memories = await loop.memoryStorage.listMemories(30);
    if (!memories || memories.length < 3) { loop._emit('phase', { name: 'belief_extraction', status: 'done' }); return; }

    const significant = memories.filter(m => (m.importance || 0) >= 0.5 && (m.decay || 1) >= 0.3);
    if (significant.length < 2) { loop._emit('phase', { name: 'belief_extraction', status: 'done' }); return; }

    const memorySummaries = significant.slice(0, 15).map(m => ({
      id: m.memory_id || m.id,
      summary: (m.semantic || '').slice(0, 200),
      topics: m.topics || [],
      emotion: m.emotion || '',
      importance: m.importance || 0.5,
      type: m.type || 'episodic'
    }));

    const existingBeliefs = loop._identityManager.getAllBeliefs(20);
    const existingBlock = existingBeliefs.length > 0
      ? '\n\nEXISTING BELIEFS:\n' + existingBeliefs.map(b =>
          `- [${b.topic}] "${b.statement}" (confidence: ${(b.confidence || 0).toFixed(2)}, evidence: ${b.evidenceCount || 1})`
        ).join('\n')
      : '';

    const runtime = loop._aspectConfigs.background || loop._aspectConfigs.subconscious || loop._aspectConfigs.main;
    if (!runtime) { loop._emit('phase', { name: 'belief_extraction', status: 'done' }); return; }

    const prompt = `You are the belief extraction subsystem. Analyze these memories and extract beliefs — compressed worldview rules that the entity can carry forward without re-reading all memories.

MEMORIES:
${memorySummaries.map(m => `[${m.id}] (${m.type}, imp:${m.importance}) ${m.summary} [topics: ${m.topics.join(', ')}]`).join('\n')}
${existingBlock}

RULES:
- Extract 1-3 NEW beliefs (not duplicates of existing ones)
- Each belief must be supported by at least 2 memories
- Confidence should reflect how strong the evidence is (0.5-0.95)
- If an existing belief is supported by new evidence, mark it for reinforcement
- If evidence contradicts an existing belief, note the conflict
- Topics should be single words or short phrases

Respond with ONLY valid JSON:
{"beliefs":[{"topic":"<topic>","statement":"<belief statement>","confidence":<0.5-0.95>,"sourceMemories":["mem_id1","mem_id2"],"action":"new"}],"reinforcements":[{"topic":"<topic>","statement":"<existing belief text>","sourceMemories":["mem_id"]}],"conflicts":[{"topic":"<topic>","existingBelief":"<text>","contradiction":"<what contradicts it>","sourceMemories":["mem_id"]}]}`;

    const result = await loop._callLLM(runtime, [
      { role: 'system', content: 'You are a belief extraction system. Respond ONLY with valid JSON. No explanation, no markdown.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.2, maxTokens: loop._getTokenLimit('beliefExtraction') || 600 });

    const text = (typeof result === 'object' && result.content) ? result.content : result;
    const jsonMatch = (text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) { loop._emit('phase', { name: 'belief_extraction', status: 'done' }); return; }

    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch { loop._emit('phase', { name: 'belief_extraction', status: 'done' }); return; }

    let added = 0, reinforced = 0, weakened = 0;

    if (Array.isArray(parsed.beliefs)) {
      for (const b of parsed.beliefs) {
        if (b.statement && b.topic && b.confidence >= 0.5) {
          const r = loop._identityManager.addBelief(b.topic, b.statement, b.confidence, b.sourceMemories || []);
          if (r.action === 'added') added++;
        }
      }
    }
    if (Array.isArray(parsed.reinforcements)) {
      for (const r of parsed.reinforcements) {
        if (r.topic && r.statement) {
          const res = loop._identityManager.addBelief(r.topic, r.statement, 0.1, r.sourceMemories || []);
          if (res.action === 'reinforced') reinforced++;
        }
      }
    }
    if (Array.isArray(parsed.conflicts)) {
      for (const c of parsed.conflicts) {
        if (c.topic && c.existingBelief) {
          const existing = loop._identityManager.getBeliefsAbout(c.topic);
          const match = existing.find(b =>
            (b.statement || '').toLowerCase().includes((c.existingBelief || '').toLowerCase().slice(0, 40))
          );
          if (match && match.id) { loop._identityManager.weakenBelief(c.topic, match.id, 0.12); weakened++; }
        }
      }
    }

    if (added > 0 || reinforced > 0 || weakened > 0) {
      console.log(`  ✓ Belief extraction: +${added} new, ↑${reinforced} reinforced, ↓${weakened} weakened`);
    }
  } catch (err) {
    console.error('  ⚠ Belief extraction phase error:', err.message);
  }

  loop._emit('phase', { name: 'belief_extraction', status: 'done' });
}

module.exports = beliefsPhase;
