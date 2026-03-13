'use strict';
/**
 * tests/unit/worker-subsystem.test.js
 * Phase D — Worker Subsystem Pilot
 *
 * Covers:
 *  D1 – validateWorkerOutput / normalizeWorkerOutput
 *  D2 – worker-registry: register, unregister, get, list
 *  D3 – worker-dispatcher: valid path, invalid output, timeout, LLM error
 *  Integration guards – orchestrator.js references registry + workerDiagnostics
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  validateWorkerOutput,
  normalizeWorkerOutput
} = require('../../server/contracts/worker-output-contract');

const {
  registerWorker,
  unregisterWorker,
  getWorker,
  listWorkers,
  clearRegistry
} = require('../../server/brain/core/worker-registry');

const { invokeWorker } = require('../../server/brain/core/worker-dispatcher');

// ---------------------------------------------------------------------------
// D1 — validateWorkerOutput
// ---------------------------------------------------------------------------

describe('validateWorkerOutput', () => {
  test('returns ok:true for fully valid payload', () => {
    const result = validateWorkerOutput({
      summary: 'The entity recalled a relevant memory.',
      signals: { emotion: 'curious' },
      confidence: 0.85
    });
    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
    assert.ok(result.value);
  });

  test('returns ok:false for null payload', () => {
    const r = validateWorkerOutput(null);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'payload-not-object');
  });

  test('returns ok:false for array payload', () => {
    const r = validateWorkerOutput([]);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'payload-not-object');
  });

  test('returns ok:false when summary is missing', () => {
    const r = validateWorkerOutput({ signals: {}, confidence: 0.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'summary-missing-or-empty');
  });

  test('returns ok:false when summary is empty string', () => {
    const r = validateWorkerOutput({ summary: '   ', signals: {}, confidence: 0.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'summary-missing-or-empty');
  });

  test('returns ok:false when summary is not a string', () => {
    const r = validateWorkerOutput({ summary: 42, signals: {}, confidence: 0.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'summary-missing-or-empty');
  });

  test('returns ok:false when signals is missing', () => {
    const r = validateWorkerOutput({ summary: 'hello', confidence: 0.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'signals-missing');
  });

  test('returns ok:false when signals is a primitive', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: 'bad', confidence: 0.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'signals-invalid-type');
  });

  test('accepts an array as signals', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: ['a', 'b'], confidence: 0.5 });
    assert.equal(r.ok, true);
  });

  test('returns ok:false when confidence is NaN', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: {}, confidence: 'high' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'confidence-out-of-range');
  });

  test('returns ok:false when confidence > 1', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: {}, confidence: 1.5 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'confidence-out-of-range');
  });

  test('returns ok:false when confidence < 0', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: {}, confidence: -0.1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'confidence-out-of-range');
  });

  test('returns ok:false when memoryRefs is not an array', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: {}, confidence: 0.5, memoryRefs: 'id1' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'memoryRefs-not-array');
  });

  test('returns ok:false when nextHints is not an array', () => {
    const r = validateWorkerOutput({ summary: 'hello', signals: {}, confidence: 0.5, nextHints: 42 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'nextHints-not-array');
  });

  test('accepts valid optional fields', () => {
    const r = validateWorkerOutput({
      summary: 'hello',
      signals: {},
      confidence: 0.5,
      memoryRefs: ['mem-1', 'mem-2'],
      nextHints: ['ask about topic X']
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.memoryRefs, ['mem-1', 'mem-2']);
    assert.deepEqual(r.value.nextHints, ['ask about topic X']);
  });
});

// ---------------------------------------------------------------------------
// D1 — normalizeWorkerOutput
// ---------------------------------------------------------------------------

describe('normalizeWorkerOutput', () => {
  test('fills defaults for null input', () => {
    const n = normalizeWorkerOutput(null);
    assert.equal(n.summary, '');
    assert.equal(n.confidence, 0);
    assert.deepEqual(n.memoryRefs, []);
    assert.deepEqual(n.nextHints, []);
  });

  test('trims whitespace from summary', () => {
    const n = normalizeWorkerOutput({ summary: '  hello world  ', signals: {}, confidence: 0.8 });
    assert.equal(n.summary, 'hello world');
  });

  test('clamps confidence to [0, 1]', () => {
    const high = normalizeWorkerOutput({ summary: 'x', signals: {}, confidence: 5 });
    assert.equal(high.confidence, 1);
    const low = normalizeWorkerOutput({ summary: 'x', signals: {}, confidence: -3 });
    assert.equal(low.confidence, 0);
  });

  test('fills empty arrays for absent optional fields', () => {
    const n = normalizeWorkerOutput({ summary: 'x', signals: {}, confidence: 0.5 });
    assert.deepEqual(n.memoryRefs, []);
    assert.deepEqual(n.nextHints, []);
  });
});

// ---------------------------------------------------------------------------
// D2 — worker-registry
// ---------------------------------------------------------------------------

describe('worker-registry', () => {
  beforeEach(() => clearRegistry());

  test('getWorker returns null for unknown key', () => {
    assert.equal(getWorker('subconscious'), null);
  });

  test('registerWorker and getWorker round-trip', () => {
    registerWorker('subconscious', 'entity-abc', { model: 'gpt-4o' });
    const w = getWorker('subconscious');
    assert.ok(w);
    assert.equal(w.entityId, 'entity-abc');
    assert.equal(w.mode, 'subsystem');
    assert.deepEqual(w.runtime, { model: 'gpt-4o' });
  });

  test('unregisterWorker removes the binding', () => {
    registerWorker('conscious', 'entity-xyz');
    unregisterWorker('conscious');
    assert.equal(getWorker('conscious'), null);
  });

  test('unregisterWorker is a no-op for absent key', () => {
    assert.doesNotThrow(() => unregisterWorker('nonexistent'));
  });

  test('listWorkers returns all registered workers', () => {
    registerWorker('subconscious', 'e1');
    registerWorker('dream', 'e2');
    const list = listWorkers();
    assert.equal(list.length, 2);
    const keys = list.map((w) => w.aspectKey).sort();
    assert.deepEqual(keys, ['dream', 'subconscious']);
  });

  test('listWorkers returns empty array when registry is clear', () => {
    assert.deepEqual(listWorkers(), []);
  });

  test('re-registering an aspect key overwrites the previous binding', () => {
    registerWorker('conscious', 'old-entity');
    registerWorker('conscious', 'new-entity');
    assert.equal(getWorker('conscious').entityId, 'new-entity');
  });

  test('ignores registration with missing aspectKey', () => {
    registerWorker('', 'entity-abc');
    registerWorker(null, 'entity-abc');
    assert.deepEqual(listWorkers(), []);
  });

  test('ignores registration with missing entityId', () => {
    registerWorker('subconscious', '');
    registerWorker('conscious', null);
    assert.deepEqual(listWorkers(), []);
  });
});

// ---------------------------------------------------------------------------
// D3 — worker-dispatcher
// ---------------------------------------------------------------------------

describe('invokeWorker — valid response path', () => {
  test('returns normalised value on valid JSON response', async () => {
    const binding = {
      entityId: 'worker-1',
      mode: 'subsystem',
      runtime: { model: 'mock-model' }
    };
    const mockLLM = async () =>
      JSON.stringify({ summary: 'Creative connection found.', signals: { type: 'association' }, confidence: 0.9 });

    const result = await invokeWorker(binding, { role: 'dream', userMessage: 'hello' }, mockLLM);
    assert.ok(result, 'Expected a non-null result');
    assert.equal(result.summary, 'Creative connection found.');
    assert.equal(result.confidence, 0.9);
  });

  test('returns normalised value when LLM wraps JSON in markdown code fence', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: { model: 'm' } };
    const mockLLM = async () =>
      '```json\n{"summary":"ok","signals":{},"confidence":0.7}\n```';

    const result = await invokeWorker(binding, { role: 'conscious', userMessage: 'test' }, mockLLM);
    assert.ok(result);
    assert.equal(result.summary, 'ok');
  });
});

describe('invokeWorker — fallback paths', () => {
  test('returns null when runtime is absent', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: null };
    const result = await invokeWorker(binding, { role: 'subconscious', userMessage: 'hi' }, async () => '');
    assert.equal(result, null);
  });

  test('returns null when callLLM is not a function', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: { model: 'm' } };
    const result = await invokeWorker(binding, { role: 'subconscious', userMessage: 'hi' }, null);
    assert.equal(result, null);
  });

  test('returns null when LLM rejects with an error', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: { model: 'm' } };
    const mockLLM = async () => { throw new Error('network error'); };
    const result = await invokeWorker(binding, { role: 'dream', userMessage: 'hi' }, mockLLM);
    assert.equal(result, null);
  });

  test('returns null when LLM response is not parseable JSON', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: { model: 'm' } };
    const mockLLM = async () => 'This is just plain text with no JSON.';
    const result = await invokeWorker(binding, { role: 'conscious', userMessage: 'hi' }, mockLLM);
    assert.equal(result, null);
  });

  test('returns null when worker output fails contract validation', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: { model: 'm' } };
    // missing summary
    const mockLLM = async () => JSON.stringify({ signals: {}, confidence: 0.5 });
    const result = await invokeWorker(binding, { role: 'subconscious', userMessage: 'hi' }, mockLLM);
    assert.equal(result, null);
  });

  test('returns null on timeout', async () => {
    const binding = { entityId: 'w', mode: 'subsystem', runtime: { model: 'm' } };
    const mockLLM = async () => new Promise(() => {}); // hangs forever
    const result = await invokeWorker(
      binding,
      { role: 'dream', userMessage: 'hi' },
      mockLLM,
      { timeoutMs: 25 }
    );
    assert.equal(result, null);
  });
});

describe('invokeWorker — bus events', () => {
  test('emits worker_invoked on start', async () => {
    const binding = { entityId: 'ev-worker', mode: 'subsystem', runtime: { model: 'm' } };
    const events = [];
    const bus = { emit: (e, p) => events.push({ e, p }) };
    const mockLLM = async () =>
      JSON.stringify({ summary: 'hi', signals: {}, confidence: 0.5 });

    await invokeWorker(binding, { role: 'conscious', userMessage: 'test' }, mockLLM, { bus });
    const invoked = events.find((x) => x.p.type === 'worker_invoked');
    assert.ok(invoked, 'worker_invoked event must be emitted');
    assert.equal(invoked.p.entityId, 'ev-worker');
  });

  test('emits worker_success on valid result', async () => {
    const binding = { entityId: 'ev-worker', mode: 'subsystem', runtime: { model: 'm' } };
    const events = [];
    const bus = { emit: (e, p) => events.push({ e, p }) };
    const mockLLM = async () =>
      JSON.stringify({ summary: 'great', signals: {}, confidence: 0.9 });

    await invokeWorker(binding, { role: 'dream', userMessage: 'hi' }, mockLLM, { bus });
    const success = events.find((x) => x.p.type === 'worker_success');
    assert.ok(success, 'worker_success event must be emitted');
    assert.equal(success.p.confidence, 0.9);
  });

  test('emits worker_fallback on LLM error', async () => {
    const binding = { entityId: 'ev-worker', mode: 'subsystem', runtime: { model: 'm' } };
    const events = [];
    const bus = { emit: (e, p) => events.push({ e, p }) };
    const mockLLM = async () => { throw new Error('oops'); };

    await invokeWorker(binding, { role: 'subconscious', userMessage: 'hi' }, mockLLM, { bus });
    const fallback = events.find((x) => x.p.type === 'worker_fallback');
    assert.ok(fallback, 'worker_fallback event must be emitted');
  });
});

// ---------------------------------------------------------------------------
// Integration guards — orchestrator.js source
// ---------------------------------------------------------------------------

describe('orchestrator.js integration guards — worker subsystem', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../server/brain/core/orchestrator.js'),
    'utf8'
  );

  test('requires worker-dispatcher', () => {
    assert.ok(
      src.includes("require('./worker-dispatcher')"),
      'orchestrator.js must require worker-dispatcher'
    );
  });

  test('stores workerRegistry in constructor', () => {
    assert.ok(
      src.includes('workerRegistry'),
      'orchestrator constructor must assign workerRegistry'
    );
  });

  test('checks registry in runSubconscious', () => {
    const sub = src.slice(src.indexOf('async runSubconscious('));
    const nextMethod = sub.indexOf('\n  async ', 5);
    const methodBody = nextMethod > 0 ? sub.slice(0, nextMethod) : sub;
    assert.ok(
      methodBody.includes("getWorker('subconscious')"),
      'runSubconscious must check workerRegistry for subconscious key'
    );
  });

  test('checks registry in runConscious', () => {
    const sub = src.slice(src.indexOf('async runConscious('));
    const nextMethod = sub.indexOf('\n  async ', 5);
    const methodBody = nextMethod > 0 ? sub.slice(0, nextMethod) : sub;
    assert.ok(
      methodBody.includes("getWorker('conscious')"),
      'runConscious must check workerRegistry for conscious key'
    );
  });

  test('checks registry in runDreamIntuition', () => {
    const sub = src.slice(src.indexOf('async runDreamIntuition('));
    const nextMethod = sub.indexOf('\n  async ', 5);
    const methodBody = nextMethod > 0 ? sub.slice(0, nextMethod) : sub;
    assert.ok(
      methodBody.includes("getWorker('dream')"),
      'runDreamIntuition must check workerRegistry for dream key'
    );
  });

  test('innerDialog.artifacts contains workerDiagnostics', () => {
    assert.ok(
      src.includes('workerDiagnostics'),
      'innerDialog.artifacts must include workerDiagnostics'
    );
  });

  test('each diagnostic entry has used and entityId fields', () => {
    const diagnosticsSection = src.slice(src.indexOf('workerDiagnostics'));
    assert.ok(diagnosticsSection.includes('used:'), 'workerDiagnostics entries must have used field');
    assert.ok(diagnosticsSection.includes('entityId:'), 'workerDiagnostics entries must have entityId field');
  });
});
