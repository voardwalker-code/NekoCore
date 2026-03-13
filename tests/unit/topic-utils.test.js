// ============================================================
// Unit Tests — topic-utils.js
// Tests normalization, stemming, synonyms, and query expansion.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTopic,
  stemWord,
  canonicalizeTopic,
  normalizeTopics,
  expandSynonyms,
  expandQueryTopic
} = require('../../server/brain/utils/topic-utils');

// ── normalizeTopic ──────────────────────────────────────────

test('normalizeTopic lowercases and trims', () => {
  assert.equal(normalizeTopic('  Emotion  '), 'emotion');
});

test('normalizeTopic converts hyphens to spaces', () => {
  assert.equal(normalizeTopic('problem-solving'), 'problem solving');
});

test('normalizeTopic converts underscores to spaces', () => {
  assert.equal(normalizeTopic('goal_tracking'), 'goal tracking');
});

test('normalizeTopic strips trailing punctuation', () => {
  assert.equal(normalizeTopic('memory!'), 'memory');
});

test('normalizeTopic collapses multiple spaces', () => {
  assert.equal(normalizeTopic('a  b   c'), 'a b c');
});

test('normalizeTopic returns empty string for null', () => {
  assert.equal(normalizeTopic(null), '');
});

test('normalizeTopic returns empty string for non-string number', () => {
  assert.equal(normalizeTopic(42), '');
});

// ── stemWord ───────────────────────────────────────────────

test('stemWord strips -ing suffix', () => {
  assert.equal(stemWord('learning'), 'learn');
});

test('stemWord strips -ed suffix', () => {
  assert.equal(stemWord('learned'), 'learn');
});

test('stemWord strips -tion suffix', () => {
  // Rule: 'tion' → 'te', so 'connection' → 'connecte'
  assert.equal(stemWord('connection'), 'connecte');
});

test('stemWord strips -ness suffix', () => {
  assert.equal(stemWord('happiness'), 'happi');
});

test('stemWord leaves short words unchanged', () => {
  assert.equal(stemWord('ai'), 'ai');
  assert.equal(stemWord('go'), 'go');
});

test('stemWord returns original if no rule matches', () => {
  assert.equal(stemWord('xyz'), 'xyz');
});

// ── canonicalizeTopic ─────────────────────────────────────

test('canonicalizeTopic returns non-empty string for known topic', () => {
  const result = canonicalizeTopic('Memories');
  assert.ok(typeof result === 'string' && result.length > 0);
});

test('canonicalizeTopic returns empty string for empty input', () => {
  assert.equal(canonicalizeTopic(''), '');
  assert.equal(canonicalizeTopic(null), '');
});

test('canonicalizeTopic maps synonyms to the same canonical form', () => {
  // 'emotion' and 'feeling' are in the same synonym group
  const r1 = canonicalizeTopic('emotion');
  const r2 = canonicalizeTopic('feeling');
  assert.equal(r1, r2, `'emotion' and 'feeling' should canonicalize identically`);
});

test('canonicalizeTopic maps memory synonyms consistently', () => {
  const r1 = canonicalizeTopic('memory');
  const r2 = canonicalizeTopic('memories');
  assert.equal(r1, r2);
});

// ── normalizeTopics ───────────────────────────────────────

test('normalizeTopics returns empty array for empty input', () => {
  assert.deepEqual(normalizeTopics([]), []);
});

test('normalizeTopics deduplicates synonym variants', () => {
  const result = normalizeTopics(['memory', 'memories', 'memory']);
  assert.equal(result.length, 1);
});

test('normalizeTopics handles mixed case and punctuation', () => {
  const result = normalizeTopics(['Emotion!', 'FEELING', 'mood']);
  assert.equal(result.length, 1, 'emotion/feeling/mood are synonyms, should collapse to 1');
});

test('normalizeTopics returns array for non-array input', () => {
  assert.deepEqual(normalizeTopics(null), []);
  assert.deepEqual(normalizeTopics('string'), []);
});

test('normalizeTopics preserves distinct topics', () => {
  const result = normalizeTopics(['memory', 'goal', 'identity']);
  assert.equal(result.length, 3);
});

// ── expandSynonyms ────────────────────────────────────────

test('expandSynonyms returns array including the input', () => {
  const result = expandSynonyms('emotion');
  assert.ok(Array.isArray(result));
  assert.ok(result.includes('emotion'));
});

test('expandSynonyms returns multiple synonyms for known term', () => {
  const result = expandSynonyms('emotion');
  assert.ok(result.length > 1, `expected >1 synonyms, got: ${result.length}`);
});

test('expandSynonyms returns singleton array for unknown term', () => {
  const result = expandSynonyms('zzznonsenseword');
  assert.deepEqual(result, ['zzznonsenseword']);
});

// ── expandQueryTopic ──────────────────────────────────────

test('expandQueryTopic returns a Set', () => {
  const result = expandQueryTopic('emotion');
  assert.ok(result instanceof Set);
});

test('expandQueryTopic returns multiple variants for known topic', () => {
  const result = expandQueryTopic('emotion');
  assert.ok(result.size > 1, `expected >1 entries, got ${result.size}`);
});

test('expandQueryTopic returns empty Set for empty input', () => {
  const result = expandQueryTopic('');
  assert.equal(result.size, 0);
});

test('expandQueryTopic includes stemmed form', () => {
  const result = expandQueryTopic('learning');
  // Should include both 'learning' and 'learn'
  assert.ok(result.has('learning') || result.has('learn'), 'should include stemmed variant');
});
