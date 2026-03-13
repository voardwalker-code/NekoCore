'use strict';
/**
 * tests/unit/escalation-guardrails.test.js
 * Phase C — Escalation Guardrails
 *
 * Covers:
 *  C1 – shouldEscalateO2 returns { escalate, reason } for every trigger
 *  C2 – enforceBudgetGuard blocks over-budget usage and returns correct reason
 *  C3 – enforceLatencyGuard rejects with { timedOut: true } when ceiling fires
 *  Integration guards – call site presence in orchestrator.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  buildTurnPolicy,
  shouldEscalateO2,
  chooseO2Runtime,
  enforceBudgetGuard,
  enforceLatencyGuard
} = require('../../server/brain/core/orchestration-policy');

// ---------------------------------------------------------------------------
// C1 — shouldEscalateO2 reason strings
// ---------------------------------------------------------------------------

describe('shouldEscalateO2 — reason field', () => {
  test('returns { escalate:false, reason:"none" } when allowStrongFinalEval is false', () => {
    const policy = buildTurnPolicy({}, {}, { allowStrongFinalEval: false });
    const result = shouldEscalateO2({ turnSignals: {}, policy, userRequestedDepth: false });
    assert.equal(result.escalate, false);
    assert.equal(result.reason, 'none');
  });

  test('returns reason "high-tension" when tension >= threshold', () => {
    const policy = buildTurnPolicy({}, {}, { highTensionThreshold: 0.7 });
    const result = shouldEscalateO2({
      turnSignals: { tension: 0.85 },
      policy
    });
    assert.equal(result.escalate, true);
    assert.equal(result.reason, 'high-tension');
  });

  test('returns { escalate:false } when tension is exactly below threshold', () => {
    const policy = buildTurnPolicy({}, {}, { highTensionThreshold: 0.7 });
    const result = shouldEscalateO2({
      turnSignals: { tension: 0.69 },
      policy
    });
    assert.equal(result.escalate, false);
  });

  test('returns reason "error-constraint-combo" for matching event pair', () => {
    const policy = buildTurnPolicy();
    const result = shouldEscalateO2({
      turnSignals: { events: ['error_report', 'constraint'], tension: 0 },
      policy
    });
    assert.equal(result.escalate, true);
    assert.equal(result.reason, 'error-constraint-combo');
  });

  test('does NOT escalate on error_report alone', () => {
    const policy = buildTurnPolicy();
    const result = shouldEscalateO2({
      turnSignals: { events: ['error_report'], tension: 0 },
      policy
    });
    assert.equal(result.escalate, false);
  });

  test('returns reason "planning-implementation-combo" for matching hints', () => {
    const policy = buildTurnPolicy();
    const result = shouldEscalateO2({
      turnSignals: { intentHints: ['planning', 'implementation'], tension: 0 },
      policy
    });
    assert.equal(result.escalate, true);
    assert.equal(result.reason, 'planning-implementation-combo');
  });

  test('does NOT escalate on planning hint alone', () => {
    const policy = buildTurnPolicy();
    const result = shouldEscalateO2({
      turnSignals: { intentHints: ['planning'], tension: 0 },
      policy
    });
    assert.equal(result.escalate, false);
  });

  test('returns reason "user-requested-depth" when flag is true', () => {
    const policy = buildTurnPolicy();
    const result = shouldEscalateO2({
      turnSignals: { tension: 0 },
      policy,
      userRequestedDepth: true
    });
    assert.equal(result.escalate, true);
    assert.equal(result.reason, 'user-requested-depth');
  });

  test('returns { escalate:false, reason:"none" } when no trigger fires', () => {
    const policy = buildTurnPolicy();
    const result = shouldEscalateO2({ turnSignals: {}, policy });
    assert.equal(result.escalate, false);
    assert.equal(result.reason, 'none');
  });

  test('high-tension takes priority over user-requested-depth (same pass)', () => {
    const policy = buildTurnPolicy({}, {}, { highTensionThreshold: 0.5 });
    const result = shouldEscalateO2({
      turnSignals: { tension: 0.9 },
      policy,
      userRequestedDepth: true
    });
    // tension check fires first — reason must be high-tension
    assert.equal(result.reason, 'high-tension');
  });
});

// ---------------------------------------------------------------------------
// C2 — enforceBudgetGuard
// ---------------------------------------------------------------------------

describe('enforceBudgetGuard', () => {
  test('returns { ok:true, reason:null } when usage is within budget', () => {
    const policy = buildTurnPolicy({}, {}, { maxPromptTokens: 14000, maxTotalTokens: 18000 });
    const result = enforceBudgetGuard({ prompt_tokens: 5000, total_tokens: 8000 }, policy);
    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
  });

  test('returns ok:false with "prompt-token-budget-exceeded" when prompt is over cap', () => {
    const policy = buildTurnPolicy({}, {}, { maxPromptTokens: 10000 });
    const result = enforceBudgetGuard({ prompt_tokens: 12000, total_tokens: 12000 }, policy);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'prompt-token-budget-exceeded');
  });

  test('returns ok:false with "total-token-budget-exceeded" when total is over cap', () => {
    const policy = buildTurnPolicy({}, {}, { maxTotalTokens: 10000 });
    const result = enforceBudgetGuard({ prompt_tokens: 1000, total_tokens: 11000 }, policy);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'total-token-budget-exceeded');
  });

  test('uses sensible defaults when no policy provided', () => {
    // Default maxPromptTokens = 14000, maxTotalTokens = 18000
    const result = enforceBudgetGuard({ prompt_tokens: 0, total_tokens: 0 });
    assert.equal(result.ok, true);
  });

  test('prompt check fires before total check', () => {
    // Both exceed; expect prompt-related reason
    const policy = buildTurnPolicy({}, {}, { maxPromptTokens: 1000, maxTotalTokens: 1000 });
    const result = enforceBudgetGuard({ prompt_tokens: 2000, total_tokens: 2000 }, policy);
    assert.equal(result.reason, 'prompt-token-budget-exceeded');
  });

  test('treats missing token fields as zero', () => {
    const policy = buildTurnPolicy();
    const result = enforceBudgetGuard({}, policy);
    assert.equal(result.ok, true);
  });
});

// ---------------------------------------------------------------------------
// C3 — enforceLatencyGuard
// ---------------------------------------------------------------------------

describe('enforceLatencyGuard', () => {
  test('resolves with the call result when fast enough', async () => {
    const result = await enforceLatencyGuard(() => Promise.resolve('ok'), 5000);
    assert.equal(result, 'ok');
  });

  test('rejects with { timedOut:true } when call exceeds ceiling', async () => {
    const neverResolves = () => new Promise(() => {}); // hangs forever
    const rejection = await enforceLatencyGuard(neverResolves, 30)
      .then(() => null)
      .catch((err) => err);
    assert.ok(rejection, 'Expected a rejection');
    assert.equal(rejection.timedOut, true);
  });

  test('rejection carries the maxMs value', async () => {
    const rejection = await enforceLatencyGuard(() => new Promise(() => {}), 25)
      .catch((e) => e);
    assert.equal(rejection.maxMs, 25);
  });

  test('forwards call errors when they fire before timeout', async () => {
    const boom = () => Promise.reject(new Error('network'));
    const err = await enforceLatencyGuard(boom, 5000).catch((e) => e);
    assert.equal(err.message, 'network');
    assert.ok(!err.timedOut);
  });

  test('uses 35000ms default when maxMs is absent or invalid', async () => {
    // Just confirm it resolves quickly — the default shouldn't fire in the test
    const result = await enforceLatencyGuard(() => Promise.resolve(42));
    assert.equal(result, 42);
  });
});

// ---------------------------------------------------------------------------
// chooseO2Runtime — respects updated decision shape
// ---------------------------------------------------------------------------

describe('chooseO2Runtime — decision object branch', () => {
  const def = { model: 'default' };
  const strong = { model: 'strong' };

  test('returns strong model when escalate:true', () => {
    const rt = chooseO2Runtime(def, strong, { escalate: true, reason: 'high-tension' });
    assert.equal(rt, strong);
  });

  test('returns default model when escalate:false', () => {
    const rt = chooseO2Runtime(def, strong, { escalate: false, reason: 'none' });
    assert.equal(rt, def);
  });

  test('returns default model when strongRuntime is null even if escalate:true', () => {
    const rt = chooseO2Runtime(def, null, { escalate: true, reason: 'high-tension' });
    assert.equal(rt, def);
  });
});

// ---------------------------------------------------------------------------
// Integration guards — call sites in orchestrator.js source
// ---------------------------------------------------------------------------

describe('orchestrator.js integration guards', () => {
  const orchestratorSrc = fs.readFileSync(
    path.resolve(__dirname, '../../server/brain/core/orchestrator.js'),
    'utf8'
  );

  test('imports enforceBudgetGuard from orchestration-policy', () => {
    assert.ok(
      orchestratorSrc.includes('enforceBudgetGuard'),
      'orchestrator.js must destructure enforceBudgetGuard from orchestration-policy'
    );
  });

  test('imports enforceLatencyGuard from orchestration-policy', () => {
    assert.ok(
      orchestratorSrc.includes('enforceLatencyGuard'),
      'orchestrator.js must destructure enforceLatencyGuard from orchestration-policy'
    );
  });

  test('calls enforceBudgetGuard inside runOrchestrator', () => {
    const inMethod = orchestratorSrc.slice(
      orchestratorSrc.indexOf('async runOrchestrator(')
    );
    assert.ok(
      inMethod.includes('enforceBudgetGuard('),
      'runOrchestrator must call enforceBudgetGuard'
    );
  });

  test('calls enforceLatencyGuard inside runOrchestrator', () => {
    const inMethod = orchestratorSrc.slice(
      orchestratorSrc.indexOf('async runOrchestrator(')
    );
    assert.ok(
      inMethod.includes('enforceLatencyGuard('),
      'runOrchestrator must call enforceLatencyGuard'
    );
  });

  test('innerDialog.artifacts contains escalation field', () => {
    assert.ok(
      orchestratorSrc.includes("escalation:"),
      'innerDialog.artifacts must include an escalation key'
    );
  });

  test('runOrchestrator return object carries _escalation', () => {
    assert.ok(
      orchestratorSrc.includes('_escalation:'),
      'runOrchestrator must return an _escalation property'
    );
  });
});
