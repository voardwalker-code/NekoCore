// ============================================================
// Unit Tests — neurochemistry.js
// Tests chemical state, event-driven updates, decay tick,
// emotional vector computation, and emotion similarity scoring.
// All tests use Neurochemistry with no cognitiveBus or entityId
// so no file I/O or event subscriptions occur.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Neurochemistry = require('../../server/brain/affect/neurochemistry');
const ThoughtTypes = require('../../server/brain/bus/thought-types');

// ── Construction ───────────────────────────────────────────

test('constructs without options', () => {
  const nc = new Neurochemistry();
  assert.ok(nc instanceof Neurochemistry);
});

test('default state has all four chemicals', () => {
  const nc = new Neurochemistry();
  const s = nc.getChemicalState();
  assert.ok('dopamine'  in s, 'missing dopamine');
  assert.ok('cortisol'  in s, 'missing cortisol');
  assert.ok('serotonin' in s, 'missing serotonin');
  assert.ok('oxytocin'  in s, 'missing oxytocin');
});

test('default chemical values are between 0 and 1', () => {
  const nc = new Neurochemistry();
  for (const [k, v] of Object.entries(nc.getChemicalState())) {
    assert.ok(v >= 0 && v <= 1, `${k} default ${v} out of [0,1]`);
  }
});

// ── getChemicalState ──────────────────────────────────────

test('getChemicalState returns a copy, not the internal reference', () => {
  const nc = new Neurochemistry();
  const state = nc.getChemicalState();
  state.dopamine = 999;
  assert.notEqual(nc.getChemicalState().dopamine, 999);
});

// ── updateChemistry ───────────────────────────────────────

test('GOAL_FULFILLED raises dopamine', () => {
  const nc = new Neurochemistry();
  const before = nc.getChemicalState().dopamine;
  nc.updateChemistry(ThoughtTypes.GOAL_FULFILLED);
  assert.ok(nc.getChemicalState().dopamine > before, 'dopamine should rise after GOAL_FULFILLED');
});

test('BELIEF_CONTRADICTED raises cortisol', () => {
  const nc = new Neurochemistry();
  const before = nc.getChemicalState().cortisol;
  nc.updateChemistry(ThoughtTypes.BELIEF_CONTRADICTED);
  assert.ok(nc.getChemicalState().cortisol > before, 'cortisol should rise after BELIEF_CONTRADICTED');
});

test('USER_PROMPT raises oxytocin', () => {
  const nc = new Neurochemistry();
  const before = nc.getChemicalState().oxytocin;
  nc.updateChemistry(ThoughtTypes.USER_PROMPT);
  assert.ok(nc.getChemicalState().oxytocin > before, 'oxytocin should rise after USER_PROMPT');
});

test('GOAL_FULFILLED has no effect on unknown event type', () => {
  const nc = new Neurochemistry();
  const before = nc.getChemicalState();
  nc.updateChemistry('NONEXISTENT_EVENT_TYPE_XYZ');
  const after = nc.getChemicalState();
  assert.deepEqual(before, after);
});

test('values stay in [0, 1] after many stress events', () => {
  const nc = new Neurochemistry();
  for (let i = 0; i < 30; i++) {
    nc.updateChemistry(ThoughtTypes.BELIEF_CONTRADICTED);
  }
  for (const [k, v] of Object.entries(nc.getChemicalState())) {
    assert.ok(v >= 0 && v <= 1, `${k} value ${v} out of [0,1] after saturation`);
  }
});

test('values stay in [0, 1] after many reward events', () => {
  const nc = new Neurochemistry();
  for (let i = 0; i < 30; i++) {
    nc.updateChemistry(ThoughtTypes.GOAL_FULFILLED);
  }
  for (const [k, v] of Object.entries(nc.getChemicalState())) {
    assert.ok(v >= 0 && v <= 1, `${k} value ${v} out of [0,1] after saturation`);
  }
});

// ── tick ──────────────────────────────────────────────────

test('tick drifts elevated dopamine toward baseline', () => {
  const nc = new Neurochemistry();
  nc.state.dopamine = 0.9;
  const before = nc.state.dopamine;
  nc.tick();
  assert.ok(nc.getChemicalState().dopamine < before, 'dopamine should decay toward 0.5');
});

test('tick drifts suppressed serotonin upward toward baseline', () => {
  const nc = new Neurochemistry();
  nc.state.serotonin = 0.1;
  const before = nc.state.serotonin;
  nc.tick();
  assert.ok(nc.getChemicalState().serotonin > before, 'serotonin should rise toward 0.5');
});

test('multiple ticks converge toward baseline', () => {
  const nc = new Neurochemistry();
  nc.state.dopamine = 0.95;
  for (let i = 0; i < 10; i++) nc.tick();
  const final = nc.getChemicalState().dopamine;
  assert.ok(final < 0.75, `dopamine should approach 0.5 after many ticks, got ${final}`);
});

// ── getEmotionalVector ────────────────────────────────────

test('getEmotionalVector returns valence and arousal', () => {
  const nc = new Neurochemistry();
  const v = nc.getEmotionalVector();
  assert.ok('valence' in v && 'arousal' in v);
});

test('valence is in range [-1, 1]', () => {
  const nc = new Neurochemistry();
  const { valence } = nc.getEmotionalVector();
  assert.ok(valence >= -1 && valence <= 1, `valence ${valence} out of [-1,1]`);
});

test('arousal is in range [0, 1]', () => {
  const nc = new Neurochemistry();
  const { arousal } = nc.getEmotionalVector();
  assert.ok(arousal >= 0 && arousal <= 1, `arousal ${arousal} out of [0,1]`);
});

test('high cortisol produces negative valence', () => {
  const nc = new Neurochemistry();
  nc.state.cortisol  = 0.9;
  nc.state.dopamine  = 0.3;
  nc.state.serotonin = 0.3;
  nc.state.oxytocin  = 0.3;
  const { valence } = nc.getEmotionalVector();
  assert.ok(valence < 0, `expected negative valence with high cortisol, got ${valence}`);
});

test('high dopamine+serotonin produces positive valence', () => {
  const nc = new Neurochemistry();
  nc.state.dopamine  = 0.9;
  nc.state.serotonin = 0.9;
  nc.state.cortisol  = 0.1;
  nc.state.oxytocin  = 0.6;
  const { valence } = nc.getEmotionalVector();
  assert.ok(valence > 0, `expected positive valence, got ${valence}`);
});

// ── createEmotionalTag ─────────────────────────────────────

test('createEmotionalTag returns object with valence, arousal, neurochemistry, timestamp', () => {
  const nc = new Neurochemistry();
  const tag = nc.createEmotionalTag();
  assert.ok('valence' in tag);
  assert.ok('arousal' in tag);
  assert.ok('neurochemistry' in tag);
  assert.ok('timestamp' in tag);
});

// ── emotionSimilarity ─────────────────────────────────────

test('emotionSimilarity returns 0 for null input', () => {
  const nc = new Neurochemistry();
  assert.equal(nc.emotionSimilarity(null), 0);
});

test('emotionSimilarity returns 0 for non-object input', () => {
  const nc = new Neurochemistry();
  assert.equal(nc.emotionSimilarity('bad'), 0);
});

test('emotionSimilarity returns > 0.8 for own emotional tag', () => {
  const nc = new Neurochemistry();
  const tag = nc.createEmotionalTag();
  const sim = nc.emotionSimilarity(tag);
  assert.ok(sim > 0.8, `similarity ${sim} should be > 0.8 for matching state`);
});

test('emotionSimilarity returns value in [0, 1]', () => {
  const nc = new Neurochemistry();
  const tag = { valence: -1, arousal: 1, neurochemistry: { dopamine: 0, cortisol: 1, serotonin: 0, oxytocin: 0 } };
  const sim = nc.emotionSimilarity(tag);
  assert.ok(sim >= 0 && sim <= 1, `similarity ${sim} out of [0,1]`);
});
