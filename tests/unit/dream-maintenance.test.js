// ============================================================
// Phase B6 — Unit tests for Dream Maintenance Selector and Dream Link Writer
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreDreamCandidate,
  selectDreamCandidates,
  bucketDreamCandidates
} = require('../../server/brain/cognition/dream-maintenance-selector');

const {
  writeDreamSourceLinks,
  emitDreamLinkEvents
} = require('../../server/brain/knowledge/dream-link-writer');

// ── scoreDreamCandidate ────────────────────────────────────────────────────

test('scoreDreamCandidate returns 0 for null input', () => {
  const score = scoreDreamCandidate(null, null, {});
  assert.strictEqual(score, 0);
});

test('scoreDreamCandidate returns 0 for empty record with no signals', () => {
  const score = scoreDreamCandidate({ id: 'x', importance: 0 }, null, {});
  assert.strictEqual(score, 0);
});

test('scoreDreamCandidate scores high importance positively', () => {
  const score = scoreDreamCandidate({ id: 'x', importance: 0.9 }, null, {});
  assert.ok(score > 0, 'high importance memory should score > 0');
});

test('scoreDreamCandidate scores learn tag positively', () => {
  const scoreLearn = scoreDreamCandidate({ id: 'x', topics: ['learn'] }, null, {});
  const scoreNone = scoreDreamCandidate({ id: 'x', topics: [] }, null, {});
  assert.ok(scoreLearn > scoreNone, 'learn tag should increase score');
});

test('scoreDreamCandidate scores learnFrom tag higher than learn', () => {
  const scoreLearnFrom = scoreDreamCandidate({ id: 'x', topics: ['learnFrom'] }, null, {});
  const scoreLearn = scoreDreamCandidate({ id: 'x', topics: ['learn'] }, null, {});
  assert.ok(scoreLearnFrom > scoreLearn, 'learnFrom tag should score higher than learn');
});

test('scoreDreamCandidate scores mistake tag positively', () => {
  const scoreError = scoreDreamCandidate({ id: 'x', topics: ['mistake'] }, null, {});
  const scoreNone = scoreDreamCandidate({ id: 'x', topics: [] }, null, {});
  assert.ok(scoreError > scoreNone, 'mistake tag should increase score');
});

test('scoreDreamCandidate scores orphaned graph node (degree 0) positively', () => {
  const scoreOrphan = scoreDreamCandidate({ id: 'x' }, { degree: 0 }, {});
  const scoreConnected = scoreDreamCandidate({ id: 'x' }, { degree: 10 }, {});
  assert.ok(scoreOrphan > scoreConnected, 'orphaned node should score higher than well-connected');
});

test('scoreDreamCandidate scores stale memory positively', () => {
  const longAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
  const recent = Date.now() - (1 * 24 * 60 * 60 * 1000);   // 1 day ago
  const staleScore = scoreDreamCandidate({ id: 'x', _lastAccessedMs: longAgo }, null, {});
  const recentScore = scoreDreamCandidate({ id: 'x', _lastAccessedMs: recent }, null, {});
  assert.ok(staleScore > recentScore, 'stale memory should score higher than recently accessed');
});

test('scoreDreamCandidate is clamped to 0..1', () => {
  const highScore = scoreDreamCandidate({
    id: 'x',
    importance: 1,
    emotionalIntensity: 1,
    topics: ['learnFrom', 'mistake'],
    _lastAccessedMs: Date.now() - (90 * 24 * 60 * 60 * 1000)
  }, { degree: 0 }, {});
  assert.ok(highScore >= 0 && highScore <= 1, `score should be in [0,1], got ${highScore}`);
});

// ── selectDreamCandidates ──────────────────────────────────────────────────

test('selectDreamCandidates returns empty for empty index', () => {
  const result = selectDreamCandidates([], null, null, {});
  assert.deepStrictEqual(result, []);
});

test('selectDreamCandidates returns empty for null index', () => {
  const result = selectDreamCandidates(null, null, null, {});
  assert.deepStrictEqual(result, []);
});

test('selectDreamCandidates filters out memories below minScore', () => {
  const memories = [
    { id: 'a', type: 'episodic', importance: 0.0, topics: [] }, // will score 0
    { id: 'b', type: 'episodic', importance: 0.9, topics: ['learnFrom'] } // will score high
  ];
  const result = selectDreamCandidates(memories, null, null, { minScore: 0.3 });
  assert.ok(result.every(r => r.score >= 0.3), 'all returned candidates should meet minScore');
  assert.ok(result.some(r => r.memory.id === 'b'), 'high score memory should be included');
});

test('selectDreamCandidates skips system and chat_log type memories', () => {
  const memories = [
    { id: 'sys', type: 'system', importance: 1 },
    { id: 'log', type: 'chat_log', importance: 1 },
    { id: 'real', type: 'episodic', importance: 0.8, topics: ['learn'] }
  ];
  const result = selectDreamCandidates(memories, null, null, { minScore: 0 });
  assert.ok(!result.some(r => r.memory.id === 'sys'), 'system type should be excluded');
  assert.ok(!result.some(r => r.memory.id === 'log'), 'chat_log type should be excluded');
  assert.ok(result.some(r => r.memory.id === 'real'), 'episodic type should be included');
});

test('selectDreamCandidates returns descending by score', () => {
  const memories = [
    { id: 'low', type: 'episodic', importance: 0.1, topics: [] },
    { id: 'high', type: 'episodic', importance: 0.9, topics: ['learnFrom', 'mistake'] },
    { id: 'mid', type: 'episodic', importance: 0.5, topics: ['learn'] }
  ];
  const result = selectDreamCandidates(memories, null, null, { minScore: 0 });
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i - 1].score >= result[i].score, 'results should be descending by score');
  }
});

test('selectDreamCandidates respects maxCandidates', () => {
  const memories = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`, type: 'episodic', importance: 0.8, topics: ['learn']
  }));
  const result = selectDreamCandidates(memories, null, null, { minScore: 0, maxCandidates: 5 });
  assert.ok(result.length <= 5, 'should not exceed maxCandidates');
});

// ── bucketDreamCandidates ──────────────────────────────────────────────────

test('bucketDreamCandidates returns empty for empty input', () => {
  const buckets = bucketDreamCandidates([], 4);
  assert.deepStrictEqual(buckets, []);
});

test('bucketDreamCandidates splits into correct bucket sizes', () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ memory: { id: `m${i}` }, score: 0.5 }));
  const buckets = bucketDreamCandidates(candidates, 4);
  assert.strictEqual(buckets[0].length, 4);
  assert.strictEqual(buckets[1].length, 4);
  assert.strictEqual(buckets[2].length, 2); // remainder
});

test('bucketDreamCandidates returns memory objects not score wrappers', () => {
  const candidates = [{ memory: { id: 'x' }, score: 0.9 }];
  const buckets = bucketDreamCandidates(candidates, 2);
  assert.ok(buckets[0][0].id === 'x', 'bucket should contain memory objects, not score wrappers');
  assert.ok(!('score' in buckets[0][0]), 'bucket items should not have score field');
});

// ── writeDreamSourceLinks ───────────────────────────────────────────────────

test('writeDreamSourceLinks returns written:false when storage is null', async () => {
  const result = await writeDreamSourceLinks('dream-1', ['mem-a'], {}, null);
  assert.strictEqual(result.written, false);
});

test('writeDreamSourceLinks returns written:false when dreamId is missing', async () => {
  const result = await writeDreamSourceLinks(null, ['mem-a'], {}, {});
  assert.strictEqual(result.written, false);
});

test('writeDreamSourceLinks returns written:true with 0 linkedSources for empty sourceIds', async () => {
  const patchCalls = [];
  const mockStorage = {
    patchMemory: async (id, fn) => { patchCalls.push(id); fn({ id }); }
  };
  const result = await writeDreamSourceLinks('dream-1', [], {}, mockStorage);
  assert.strictEqual(result.written, true);
  assert.strictEqual(result.linkedSources, 0);
  assert.strictEqual(patchCalls.length, 0);
});

test('writeDreamSourceLinks patches each source memory with dreamRef', async () => {
  const patched = {};
  const mockStorage = {
    patchMemory: async (id, fn) => {
      const updated = fn({ id, dreamRefs: [] });
      patched[id] = updated;
    }
  };
  const result = await writeDreamSourceLinks('dream-99', ['mem-a', 'mem-b'], { genre: 'surreal' }, mockStorage);
  assert.strictEqual(result.written, true);
  assert.strictEqual(result.linkedSources, 2);
  assert.ok(patched['mem-a'].dreamRefs.includes('dream-99'));
  assert.ok(patched['mem-b'].dreamRefs.includes('dream-99'));
});

test('writeDreamSourceLinks does not duplicate dreamRef if already present', async () => {
  const mockStorage = {
    patchMemory: async (id, fn) => {
      const result = fn({ id, dreamRefs: ['dream-99'] }); // already has the ref
      return result;
    }
  };
  // Should not throw and should return linked count
  const result = await writeDreamSourceLinks('dream-99', ['mem-a'], {}, mockStorage);
  assert.strictEqual(result.linkedSources, 1);
});

test('writeDreamSourceLinks tolerates patchMemory throwing (non-critical)', async () => {
  const mockStorage = {
    patchMemory: async () => { throw new Error('storage failure'); }
  };
  // Should not throw — failures are non-critical
  const result = await writeDreamSourceLinks('dream-1', ['mem-a'], {}, mockStorage);
  assert.strictEqual(result.written, true);
  assert.strictEqual(result.linkedSources, 0); // patch failed, so no links written
});

// ── emitDreamLinkEvents ────────────────────────────────────────────────────

test('emitDreamLinkEvents is a no-op when bus is null', () => {
  // Should not throw
  assert.doesNotThrow(() => emitDreamLinkEvents(null, { dreamId: 'x', sourceIds: [] }));
});

test('emitDreamLinkEvents is a no-op when bus has no emitThought', () => {
  assert.doesNotThrow(() => emitDreamLinkEvents({}, { dreamId: 'x', sourceIds: [] }));
});

test('emitDreamLinkEvents calls emitThought with correct event type', () => {
  const emitted = [];
  const mockBus = { emitThought: (ev) => emitted.push(ev) };
  emitDreamLinkEvents(mockBus, { dreamId: 'dream-1', sourceIds: ['m1', 'm2'], genre: 'lucid_adventure' });
  assert.strictEqual(emitted.length, 1);
  assert.ok(emitted[0].type, 'emitted event must have a type');
  assert.strictEqual(emitted[0].dreamId, 'dream-1');
  assert.deepStrictEqual(emitted[0].sourceIds, ['m1', 'm2']);
  assert.strictEqual(emitted[0].genre, 'lucid_adventure');
});
