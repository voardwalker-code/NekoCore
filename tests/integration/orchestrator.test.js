// ============================================================
// Integration Tests — orchestrator.js
// Tests pipeline construction and the orchestrate() method using
// a mock callLLM function, so no real LLM endpoint is required.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Orchestrator = require('../../server/brain/core/orchestrator');

// ── Helpers ───────────────────────────────────────────────

const MOCK_RUNTIME = {
  type: 'ollama',
  model: 'test-model',
  endpoint: 'http://localhost:11434'
};

function makeOrchestrator({ callLLM, overrides = {} } = {}) {
  const mockCallLLM = callLLM || (async () => 'mock LLM response');
  return new Orchestrator({
    entity: {
      name:        'TestEntity',
      id:          'test',
      traits:      [],
      personality: { openness: 0.7 },
      systemPrompt: 'You are TestEntity.'
    },
    callLLM: mockCallLLM,
    aspectConfigs: {
      main:         MOCK_RUNTIME,
      subconscious: MOCK_RUNTIME,
      dream:        MOCK_RUNTIME,
      orchestrator: MOCK_RUNTIME
    },
    getMemoryContext: async () => ({
      topics:       ['test', 'conversation'],
      connections:  [],
      contextBlock: 'No prior memories.'
    }),
    getBeliefs: () => [],
    ...overrides
  });
}

// ── Construction ───────────────────────────────────────────

test('Orchestrator constructs without throwing', () => {
  const orch = makeOrchestrator();
  assert.ok(orch instanceof Orchestrator);
});

test('Orchestrator stores entity reference', () => {
  const orch = makeOrchestrator();
  assert.equal(orch.entity.name, 'TestEntity');
});

// ── isRuntimeUsable ───────────────────────────────────────

test('isRuntimeUsable returns false for null', () => {
  const orch = makeOrchestrator();
  assert.equal(orch.isRuntimeUsable(null), false);
});

test('isRuntimeUsable returns false for missing model', () => {
  const orch = makeOrchestrator();
  assert.equal(orch.isRuntimeUsable({ type: 'ollama', endpoint: 'http://x' }), false);
});

test('isRuntimeUsable returns true for valid ollama runtime', () => {
  const orch = makeOrchestrator();
  assert.equal(orch.isRuntimeUsable(MOCK_RUNTIME), true);
});

test('isRuntimeUsable returns false for openrouter without apiKey', () => {
  const orch = makeOrchestrator();
  const runtime = { type: 'openrouter', model: 'x', endpoint: 'http://x' };
  assert.equal(orch.isRuntimeUsable(runtime), false);
});

test('isRuntimeUsable returns true for openrouter with apiKey', () => {
  const orch = makeOrchestrator();
  const runtime = { type: 'openrouter', model: 'x', endpoint: 'http://x', apiKey: 'sk-test' };
  assert.equal(orch.isRuntimeUsable(runtime), true);
});

// ── orchestrate ───────────────────────────────────────────

test('orchestrate returns an object', async () => {
  const orch = makeOrchestrator();
  const result = await orch.orchestrate('Hello', []);
  assert.equal(typeof result, 'object');
  assert.ok(result !== null);
});

test('orchestrate result includes finalResponse', async () => {
  const orch = makeOrchestrator();
  const result = await orch.orchestrate('Hello', []);
  assert.ok('finalResponse' in result, 'result should have finalResponse property');
});

test('orchestrate result includes innerDialog', async () => {
  const orch = makeOrchestrator();
  const result = await orch.orchestrate('Hello', []);
  assert.ok('innerDialog' in result, 'result should have innerDialog property');
});

test('orchestrate calls callLLM at least once', async () => {
  let callCount = 0;
  const orch = makeOrchestrator({
    callLLM: async (runtime, messages, opts) => {
      callCount++;
      return 'mocked response';
    }
  });
  await orch.orchestrate('Test message', []);
  assert.ok(callCount > 0, `callLLM should have been invoked, count: ${callCount}`);
});

test('orchestrate passes userMessage to callLLM context', async () => {
  const seenMessages = [];
  const orch = makeOrchestrator({
    callLLM: async (runtime, messages) => {
      seenMessages.push(...messages);
      return 'mocked response';
    }
  });
  await orch.orchestrate('unique-test-string-xyz', []);
  const allContent = seenMessages.map(m => m.content || '').join(' ');
  assert.ok(allContent.includes('unique-test-string-xyz'), 'userMessage should appear in LLM call context');
});

test('orchestrate works with empty chat history', async () => {
  const orch = makeOrchestrator();
  const result = await orch.orchestrate('Hello', []);
  assert.ok(typeof result.finalResponse === 'string');
});

test('orchestrate works with prior chat history', async () => {
  const orch = makeOrchestrator();
  const history = [
    { role: 'user',      content: 'Previous message' },
    { role: 'assistant', content: 'Previous response' }
  ];
  const result = await orch.orchestrate('Follow-up message', history);
  assert.ok(typeof result.finalResponse === 'string');
});

test('orchestrate finalResponse is a non-empty string', async () => {
  const orch = makeOrchestrator({ callLLM: async () => 'Specific response text' });
  const result = await orch.orchestrate('Hello', []);
  assert.equal(typeof result.finalResponse, 'string');
  assert.ok(result.finalResponse.length > 0, 'finalResponse should not be empty');
});

// ── H2: innerDialog artifacts shape ───────────────────────

test('orchestrate result includes all parallel-contributor artifacts', async () => {
  const orch = makeOrchestrator();
  const result = await orch.orchestrate('Hello', []);
  const { artifacts } = result.innerDialog;
  assert.ok(artifacts, 'innerDialog should have artifacts');
  assert.equal(typeof artifacts.oneA, 'string', 'oneA (subconscious) should be a string');
  assert.equal(typeof artifacts.oneC, 'string', 'oneC (conscious) should be a string');
  assert.equal(typeof artifacts.oneD, 'string', 'oneD (dream-intuition) should be a string');
  assert.equal(typeof artifacts.twoB, 'string', 'twoB (refinement) should be a string');
});

test('orchestrate artifacts.turnSignals is an object', async () => {
  const orch = makeOrchestrator();
  const { artifacts } = (await orch.orchestrate('Hello', [])).innerDialog;
  assert.equal(typeof artifacts.turnSignals, 'object');
  assert.ok(artifacts.turnSignals !== null);
});

test('orchestrate artifacts.escalation has required keys', async () => {
  const orch = makeOrchestrator();
  const { artifacts } = (await orch.orchestrate('Hello', [])).innerDialog;
  const { escalation } = artifacts;
  assert.ok(escalation, 'escalation telemetry should be present');
  assert.ok('reason'        in escalation, 'escalation.reason missing');
  assert.ok('modelUsed'     in escalation, 'escalation.modelUsed missing');
  assert.ok('timedOut'      in escalation, 'escalation.timedOut missing');
  assert.ok('budgetBlocked' in escalation, 'escalation.budgetBlocked missing');
  assert.ok('latencyMs'     in escalation, 'escalation.latencyMs missing');
  assert.ok('tokenCost'     in escalation, 'escalation.tokenCost missing');
});

test('orchestrate artifacts.workerDiagnostics has subconscious/conscious/dream keys', async () => {
  const orch = makeOrchestrator();
  const { artifacts } = (await orch.orchestrate('Hello', [])).innerDialog;
  const { workerDiagnostics } = artifacts;
  assert.ok(workerDiagnostics, 'workerDiagnostics should be present');
  ['subconscious', 'conscious', 'dream'].forEach(role => {
    assert.ok(role in workerDiagnostics, `workerDiagnostics.${role} missing`);
    assert.ok('used' in workerDiagnostics[role], `workerDiagnostics.${role}.used missing`);
  });
});

test('orchestrate innerDialog.timing has expected keys', async () => {
  const orch = makeOrchestrator();
  const { timing } = (await orch.orchestrate('Hello', [])).innerDialog;
  assert.ok(timing, 'innerDialog.timing should be present');
  assert.ok(Number.isFinite(timing.total_ms), 'timing.total_ms should be a number');
  assert.ok(Number.isFinite(timing.contributors_parallel_ms), 'timing.contributors_parallel_ms missing');
  assert.ok(Number.isFinite(timing.refinement_ms), 'timing.refinement_ms missing');
  assert.ok(Number.isFinite(timing.orchestrator_final_ms), 'timing.orchestrator_final_ms missing');
});

test('orchestrate innerDialog.tokenUsage has subconscious/conscious/dream/orchestrator/total keys', async () => {
  const orch = makeOrchestrator();
  const { tokenUsage } = (await orch.orchestrate('Hello', [])).innerDialog;
  assert.ok(tokenUsage, 'innerDialog.tokenUsage should be present');
  ['subconscious', 'conscious', 'dream', 'orchestrator', 'total'].forEach(key => {
    assert.ok(key in tokenUsage, `tokenUsage.${key} missing`);
  });
});

// ── H3: contributor failure isolation ─────────────────────

test('orchestrate completes even when callLLM always throws', async () => {
  const orch = makeOrchestrator({
    callLLM: async () => { throw new Error('LLM unavailable'); }
  });
  let result;
  await assert.doesNotReject(async () => {
    result = await orch.orchestrate('Hello', []);
  }, 'orchestrate should not throw when all LLM calls fail');
  assert.equal(typeof result.finalResponse, 'string', 'finalResponse should still be a string on total LLM failure');
  assert.ok(result.innerDialog, 'innerDialog should still be present on total LLM failure');
});

test('orchestrate artifacts are still strings when callLLM always throws', async () => {
  const orch = makeOrchestrator({
    callLLM: async () => { throw new Error('LLM unavailable'); }
  });
  const result = await orch.orchestrate('Hello', []);
  const { oneA, oneC, oneD, twoB } = result.innerDialog.artifacts;
  assert.equal(typeof oneA, 'string', 'oneA should be a fallback string');
  assert.equal(typeof oneC, 'string', 'oneC should be a fallback string');
  assert.equal(typeof oneD, 'string', 'oneD should be a fallback string');
  assert.equal(typeof twoB, 'string', 'twoB should be a fallback string');
});

// ── H4: budget guard integration (direct runOrchestrator) ─

test('runOrchestrator sets budgetBlocked when tokenUsageSoFar exceeds maxTotalTokens', async () => {
  const orch = makeOrchestrator();
  // Force over-budget cumulative usage (default maxTotalTokens is 18000)
  const overBudgetUsage = { prompt_tokens: 19000, total_tokens: 20000 };
  const result = await orch.runOrchestrator(
    'conscious output',
    'subconscious output',
    'dream output',
    'user message',
    { tokenUsageSoFar: overBudgetUsage }
  );
  const escalation = result._escalation;
  assert.ok(escalation, 'runOrchestrator should return _escalation telemetry');
  assert.equal(escalation.budgetBlocked, true, 'escalation.budgetBlocked should be true when budget exceeded');
  assert.ok(
    typeof escalation.reason === 'string' && escalation.reason.includes('budget-cap'),
    `escalation.reason should contain 'budget-cap', got: ${escalation.reason}`
  );
});

test('runOrchestrator does not set budgetBlocked when tokenUsageSoFar is under budget', async () => {
  const orch = makeOrchestrator();
  const underBudgetUsage = { prompt_tokens: 1000, total_tokens: 2000 };
  const result = await orch.runOrchestrator(
    'conscious output',
    'subconscious output',
    'dream output',
    'user message',
    { tokenUsageSoFar: underBudgetUsage }
  );
  const escalation = result._escalation;
  assert.ok(escalation, 'runOrchestrator should return _escalation telemetry');
  assert.equal(escalation.budgetBlocked, false, 'escalation.budgetBlocked should be false when under budget');
});
