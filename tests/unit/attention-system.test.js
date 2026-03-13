// ============================================================
// Unit Tests — attention-system.js
// Tests attention scoring, recency boost, novelty, and thought
// evaluation. Uses AttentionSystem without a cognitive bus.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const AttentionSystem = require('../../server/brain/cognition/attention-system');

function makeThought(overrides = {}) {
  return {
    type: 'test_thought',
    importance: 0.5,
    emotion: 3,
    topics: ['memory'],
    timestamp: Date.now(),
    ...overrides
  };
}

// ── Construction ───────────────────────────────────────────

test('constructs without options', () => {
  const as = new AttentionSystem();
  assert.ok(as instanceof AttentionSystem);
});

test('default focusThreshold is 0.5', () => {
  const as = new AttentionSystem();
  assert.equal(as.focusThreshold, 0.5);
});

test('custom focusThreshold is respected', () => {
  const as = new AttentionSystem({ focusThreshold: 0.8 });
  assert.equal(as.focusThreshold, 0.8);
});

// ── computeRecencyBoost ───────────────────────────────────

test('computeRecencyBoost returns ~1.0 for current timestamp', () => {
  const as = new AttentionSystem();
  const boost = as.computeRecencyBoost(Date.now());
  assert.ok(boost > 0.9, `expected > 0.9, got ${boost}`);
});

test('computeRecencyBoost returns low value for very old timestamp', () => {
  const as = new AttentionSystem();
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const boost = as.computeRecencyBoost(ninetyDaysAgo);
  assert.ok(boost < 0.1, `expected < 0.1, got ${boost}`);
});

test('computeRecencyBoost returns 0.3 for undefined timestamp', () => {
  const as = new AttentionSystem();
  assert.equal(as.computeRecencyBoost(undefined), 0.3);
});

test('computeRecencyBoost is larger for newer timestamps', () => {
  const as = new AttentionSystem();
  const recent = Date.now() - 1000;
  const old = Date.now() - 7 * 24 * 60 * 60 * 1000;
  assert.ok(as.computeRecencyBoost(recent) > as.computeRecencyBoost(old));
});

// ── computeGoalRelevance ──────────────────────────────────

test('computeGoalRelevance returns 0.2 for empty topics array', () => {
  const as = new AttentionSystem();
  assert.equal(as.computeGoalRelevance({ topics: [] }), 0.2);
});

test('computeGoalRelevance returns 0.2 for missing topics', () => {
  const as = new AttentionSystem();
  assert.equal(as.computeGoalRelevance({}), 0.2);
});

test('computeGoalRelevance increases with more topics', () => {
  const as = new AttentionSystem();
  const r1 = as.computeGoalRelevance({ topics: ['a'] });
  const r5 = as.computeGoalRelevance({ topics: ['a', 'b', 'c', 'd', 'e'] });
  assert.ok(r5 > r1, `r5 (${r5}) should be > r1 (${r1})`);
});

test('computeGoalRelevance caps at 0.9', () => {
  const as = new AttentionSystem();
  const topics = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
  const r = as.computeGoalRelevance({ topics });
  assert.ok(r <= 0.9, `expected <= 0.9, got ${r}`);
});

// ── computeNovelty ────────────────────────────────────────

test('computeNovelty returns 0.7 for empty history', () => {
  const as = new AttentionSystem();
  assert.equal(as.computeNovelty(makeThought()), 0.7);
});

test('computeNovelty decreases for repeated topics', () => {
  const as = new AttentionSystem();
  const thought = makeThought({ topics: ['memory'] });
  // Fill history with similar thoughts
  for (let i = 0; i < 5; i++) {
    as.attentionHistory.push({ timestamp: Date.now(), thought: makeThought({ topics: ['memory'] }), score: 0.5 });
  }
  const novelty = as.computeNovelty(thought);
  assert.ok(novelty < 0.7, `novelty ${novelty} should decrease after repeated similar thoughts`);
});

// ── computeAttentionScore ─────────────────────────────────

test('computeAttentionScore returns value in [0, 1]', () => {
  const as = new AttentionSystem();
  const score = as.computeAttentionScore(makeThought());
  assert.ok(score >= 0 && score <= 1, `score ${score} out of [0,1]`);
});

test('computeAttentionScore is higher for high-importance thought', () => {
  const as = new AttentionSystem();
  const low  = as.computeAttentionScore(makeThought({ importance: 0.1 }));
  const high = as.computeAttentionScore(makeThought({ importance: 0.9 }));
  assert.ok(high > low, `high importance score (${high}) should exceed low (${low})`);
});

test('computeAttentionScore handles missing optional fields', () => {
  const as = new AttentionSystem();
  const score = as.computeAttentionScore({});
  assert.ok(score >= 0 && score <= 1);
});

// ── evaluateThought ───────────────────────────────────────

test('evaluateThought pushes entry to attentionHistory', () => {
  const as = new AttentionSystem();
  as.evaluateThought(makeThought());
  assert.equal(as.attentionHistory.length, 1);
});

test('evaluateThought returns numeric score', () => {
  const as = new AttentionSystem();
  const score = as.evaluateThought(makeThought());
  assert.equal(typeof score, 'number');
  assert.ok(score >= 0 && score <= 1);
});

test('evaluateThought accumulates history across calls', () => {
  const as = new AttentionSystem();
  for (let i = 0; i < 5; i++) as.evaluateThought(makeThought());
  assert.equal(as.attentionHistory.length, 5);
});

test('evaluateThought caps history at maxHistorySize', () => {
  const as = new AttentionSystem({ maxHistorySize: 3 });
  for (let i = 0; i < 10; i++) as.evaluateThought(makeThought());
  assert.ok(as.attentionHistory.length <= 3, `history length ${as.attentionHistory.length} exceeds max 3`);
});

test('evaluateThought sets currentFocus when score exceeds threshold', () => {
  // Force score above threshold by using max importance and recent timestamp
  const as = new AttentionSystem({ focusThreshold: 0.0 });
  as.evaluateThought(makeThought({ importance: 1.0 }));
  assert.ok(as.currentFocus !== null, 'focus should be set when score > threshold');
});
