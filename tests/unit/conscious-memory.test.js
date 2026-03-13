// ============================================================
// Unit Tests — conscious-memory.js
// Tests STM add/reinforce/decay/context retrieval and LTM promotion.
// All tests run in-memory (no entityId → no disk I/O required).
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ConsciousMemory = require('../../server/brain/memory/conscious-memory');

// ── Helper ───────────────────────────────────────────────────────────────────

function makeMemory() {
  return new ConsciousMemory(); // no entityId → in-memory only
}

// ── addToStm ─────────────────────────────────────────────────────────────────

test('addToStm stores an entry with default recall_weight=0 and age_cycles=0', () => {
  const mem = makeMemory();
  const entry = mem.addToStm({ summary: 'User asked about physics', topics: ['physics', 'science'] });
  assert.equal(entry.recall_weight, 0);
  assert.equal(entry.age_cycles, 0);
  assert.equal(entry.source, 'conscious_observation');
  assert.ok(entry.id.startsWith('cstm_'), `Expected id to start with cstm_, got: ${entry.id}`);
});

test('addToStm truncates summary to 500 chars', () => {
  const mem = makeMemory();
  const longSummary = 'x'.repeat(600);
  const entry = mem.addToStm({ summary: longSummary, topics: [] });
  assert.equal(entry.summary.length, 500);
});

test('addToStm uses provided source', () => {
  const mem = makeMemory();
  const entry = mem.addToStm({ summary: 'test', topics: ['a'], source: 'user_statement' });
  assert.equal(entry.source, 'user_statement');
});

test('addToStm returns unique ids for separate calls', () => {
  const mem = makeMemory();
  const a = mem.addToStm({ summary: 'first', topics: ['x'] });
  const b = mem.addToStm({ summary: 'second', topics: ['x'] });
  assert.notEqual(a.id, b.id);
});

// ── reinforce ────────────────────────────────────────────────────────────────

test('reinforce increments recall_weight for overlapping topics', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'About cats', topics: ['cats', 'pets'] });
  mem.reinforce(['cats', 'animals']);
  const [entry] = mem.getStmContext(['cats'], 5);
  assert.ok(entry.recall_weight > 0, `Expected recall_weight > 0, got ${entry.recall_weight}`);
});

test('reinforce does not increment recall_weight for non-overlapping topics', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'About cats', topics: ['cats', 'pets'] });
  mem.reinforce(['rockets', 'space']);
  const [entry] = mem.getStmContext(['cats'], 5);
  assert.equal(entry.recall_weight, 0);
});

test('reinforce queues entry for LTM promotion after threshold is reached', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'Important topic', topics: ['important'] });
  // Fully overlapping topics give score=1 per call → needs 3 calls to reach LTM_THRESHOLD=3
  mem.reinforce(['important']);
  mem.reinforce(['important']);
  mem.reinforce(['important']);
  const queue = mem.getPromotionQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].summary, 'Important topic');
});

test('reinforce does not add the same entry to the queue twice', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['t'] });
  for (let i = 0; i < 10; i++) mem.reinforce(['t']);
  assert.equal(mem.getPromotionQueue().length, 1);
});

test('reinforce with empty topics array does nothing', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['t'] });
  mem.reinforce([]);
  const [entry] = mem.getStmContext(['t'], 5);
  assert.equal(entry.recall_weight, 0);
});

// ── decayStm ─────────────────────────────────────────────────────────────────

test('decayStm reduces recall_weight', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['t'] });
  mem.reinforce(['t']); // weight > 0 now
  const before = mem.getStmContext(['t'], 5)[0].recall_weight;
  mem.decayStm();
  const after = mem.getStmContext(['t'], 5)[0].recall_weight;
  assert.ok(after < before, `Expected recall_weight to decrease, got before=${before} after=${after}`);
});

test('decayStm increments age_cycles', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['t'] });
  mem.decayStm();
  // Entry should still exist with age_cycles=1
  const entries = mem.getStmContext(['t'], 5);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].age_cycles, 1);
});

test('decayStm evicts entries older than STM_MAX_AGE', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'old entry', topics: ['old'] });
  // Run 21 decay cycles (max age is 20)
  for (let i = 0; i < 21; i++) mem.decayStm();
  assert.equal(mem.getStmContext(['old'], 5).length, 0);
});

test('decayStm does not go below zero recall_weight', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['t'] });
  for (let i = 0; i < 5; i++) mem.decayStm();
  const entries = mem.getStmContext(['t'], 5);
  if (entries.length > 0) {
    assert.ok(entries[0].recall_weight >= 0, `Expected recall_weight >= 0, got ${entries[0].recall_weight}`);
  }
});

// ── getStmContext ─────────────────────────────────────────────────────────────

test('getStmContext returns empty array when no entries match', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'cats', topics: ['cats'] });
  const results = mem.getStmContext(['dogs'], 5);
  assert.equal(results.length, 0);
});

test('getStmContext respects limit parameter', () => {
  const mem = makeMemory();
  for (let i = 0; i < 5; i++) {
    mem.addToStm({ summary: `entry ${i}`, topics: ['shared'] });
  }
  const results = mem.getStmContext(['shared'], 3);
  assert.equal(results.length, 3);
});

test('getStmContext returns entries in descending relevance order', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'weak match', topics: ['a', 'b', 'c', 'd'] }); // 1/4 overlap
  const strong = mem.addToStm({ summary: 'strong match', topics: ['a'] }); // 1/1 overlap
  const results = mem.getStmContext(['a'], 5);
  assert.equal(results[0].id, strong.id, 'Strong match should come first');
});

// ── getLtmContext ─────────────────────────────────────────────────────────────

test('getLtmContext returns empty array when no ltmDir is set', () => {
  const mem = makeMemory(); // no entityId → no ltmDir
  assert.deepEqual(mem.getLtmContext(['anything']), []);
});

// ── getContext ───────────────────────────────────────────────────────────────

test('getContext merges STM results when no LTM dir is set', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'relevant', topics: ['topic1'] });
  const results = mem.getContext(['topic1'], 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].summary, 'relevant');
});

test('getContext deduplicates entries by id', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['x'] });
  // Even if somehow merged twice, no duplicates should appear
  const results = mem.getContext(['x'], 10);
  const ids = results.map(e => e.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size);
});

// ── promoteToLtm ─────────────────────────────────────────────────────────────

test('promoteToLtm removes entry from STM', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'promo candidate', topics: ['x'] });
  for (let i = 0; i < 3; i++) mem.reinforce(['x']);

  const queue = mem.getPromotionQueue();
  assert.equal(queue.length, 1);

  mem.promoteToLtm(queue[0]);

  assert.equal(mem.getPromotionQueue().length, 0);
  assert.equal(mem.getStmContext(['x'], 5).length, 0);
});

test('promoteToLtm returns an LTM entry with promoted_at set', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'promo', topics: ['y'] });
  for (let i = 0; i < 3; i++) mem.reinforce(['y']);
  const ltm = mem.promoteToLtm(mem.getPromotionQueue()[0], { subcon_links: ['mem_abc'], ltm_links: [] });
  assert.ok(ltm.promoted_at, 'promoted_at should be set');
  assert.deepEqual(ltm.subcon_links, ['mem_abc']);
  assert.equal(ltm.summary, 'promo');
});

// ── getPromotionQueue ─────────────────────────────────────────────────────────

test('getPromotionQueue returns a copy (mutation does not affect internal state)', () => {
  const mem = makeMemory();
  mem.addToStm({ summary: 'test', topics: ['t'] });
  for (let i = 0; i < 3; i++) mem.reinforce(['t']);
  const queue = mem.getPromotionQueue();
  queue.splice(0, 1); // mutate the returned array
  assert.equal(mem.getPromotionQueue().length, 1, 'Internal promotion queue should be unaffected');
});
