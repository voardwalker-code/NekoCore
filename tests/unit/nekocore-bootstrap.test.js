// ============================================================
// Unit Tests — NekoCore Bootstrap (A-3)
// Tests ensureSystemEntity() idempotency, entity.json contents,
// directory structure, and stub file creation.
// ============================================================

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');
const os       = require('node:os');

const { ensureSystemEntity, SYSTEM_ENTITY_ID } = require('../../server/brain/nekocore/bootstrap');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nekocore-bootstrap-test-'));
}

// ── SYSTEM_ENTITY_ID constant ────────────────────────────────────────────────

test('SYSTEM_ENTITY_ID is nekocore', () => {
  assert.equal(SYSTEM_ENTITY_ID, 'nekocore');
});

// ── First-call creation ──────────────────────────────────────────────────────

test('ensureSystemEntity creates entity folder on first call', () => {
  const tmpDir = makeTmpDir();
  try {
    const created = ensureSystemEntity(tmpDir);
    assert.equal(created, true, 'should return true on first call');
    const entityDir = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`);
    assert.ok(fs.existsSync(entityDir), `entity dir should exist: ${entityDir}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ensureSystemEntity writes entity.json on first call', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entityFile = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json');
    assert.ok(fs.existsSync(entityFile), 'entity.json should exist');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── entity.json field assertions ─────────────────────────────────────────────

test('created entity has isSystemEntity: true', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entity = JSON.parse(fs.readFileSync(
      path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json'), 'utf8'
    ));
    assert.equal(entity.isSystemEntity, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('created entity has dreamDisabled: true', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entity = JSON.parse(fs.readFileSync(
      path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json'), 'utf8'
    ));
    assert.equal(entity.dreamDisabled, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('created entity has operationalMemory: true', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entity = JSON.parse(fs.readFileSync(
      path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json'), 'utf8'
    ));
    assert.equal(entity.operationalMemory, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('created entity has ownerId: __system__', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entity = JSON.parse(fs.readFileSync(
      path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json'), 'utf8'
    ));
    assert.equal(entity.ownerId, '__system__');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('created entity has isPublic: false', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entity = JSON.parse(fs.readFileSync(
      path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json'), 'utf8'
    ));
    assert.equal(entity.isPublic, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('created entity id matches SYSTEM_ENTITY_ID', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entity = JSON.parse(fs.readFileSync(
      path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json'), 'utf8'
    ));
    assert.equal(entity.id, SYSTEM_ENTITY_ID);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Stub files ───────────────────────────────────────────────────────────────

test('ensureSystemEntity writes memories/persona.json', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const personaFile = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'memories', 'persona.json');
    assert.ok(fs.existsSync(personaFile), 'persona.json should exist in memories/');
    const persona = JSON.parse(fs.readFileSync(personaFile, 'utf8'));
    assert.equal(persona.llmName, 'NekoCore');
    assert.equal(persona.locked, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ensureSystemEntity writes memories/system-prompt.txt', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const promptFile = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'memories', 'system-prompt.txt');
    assert.ok(fs.existsSync(promptFile), 'system-prompt.txt should exist in memories/');
    const content = fs.readFileSync(promptFile, 'utf8');
    assert.ok(content.length > 0, 'system-prompt.txt should not be empty');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Idempotency ───────────────────────────────────────────────────────────────

test('ensureSystemEntity returns false on second call (idempotent)', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const secondCall = ensureSystemEntity(tmpDir);
    assert.equal(secondCall, false, 'second call should return false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ensureSystemEntity does not overwrite entity.json on second call', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const entityFile = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'entity.json');
    const originalMtime = fs.statSync(entityFile).mtimeMs;
    // Small delay to ensure mtime would differ if written again
    const start = Date.now();
    while (Date.now() - start < 10) { /* spin wait */ }
    ensureSystemEntity(tmpDir);
    const secondMtime = fs.statSync(entityFile).mtimeMs;
    assert.equal(originalMtime, secondMtime, 'entity.json should not be rewritten on second call');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Phase C: Model Intelligence ───────────────────────────────────────────────

const {
  ROLE_DEFINITIONS, KNOWN_MODELS,
  seedRoleKnowledge, seedModelRegistry,
  selectModel, recordPerformance,
  getRegistry, getPerformance
} = require('../../server/brain/nekocore/model-intelligence');

// C-1: Role knowledge seeding ─────────────────────────────────────────────────

test('seedRoleKnowledge creates role-knowledge.json with all 4 role keys', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-mi-test-'));
  try {
    const created = seedRoleKnowledge(tmpDir);
    assert.equal(created, true, 'should return true on first call');
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'role-knowledge.json'), 'utf8'));
    for (const role of ['subconscious', 'conscious', 'dream', 'orchestrator']) {
      assert.ok(data.roles[role], `role-knowledge.json should contain role: ${role}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('role entries have required fields (purpose, requirements, priorities)', () => {
  for (const [role, def] of Object.entries(ROLE_DEFINITIONS)) {
    assert.ok(typeof def.purpose === 'string' && def.purpose.length > 0,
      `${role}.purpose must be a non-empty string`);
    assert.ok(def.requirements && typeof def.requirements.reasoning === 'number',
      `${role}.requirements.reasoning must be a number`);
    assert.ok(Array.isArray(def.priorities) && def.priorities.length > 0,
      `${role}.priorities must be a non-empty array`);
  }
});

test('seedRoleKnowledge is idempotent (returns false on second call)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-mi-test-'));
  try {
    seedRoleKnowledge(tmpDir);
    const second = seedRoleKnowledge(tmpDir);
    assert.equal(second, false, 'second call should be a no-op');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// C-2: Model registry seeding ─────────────────────────────────────────────────

test('seedModelRegistry creates model-registry.json with known model entries', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-mi-test-'));
  try {
    seedModelRegistry(tmpDir);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'model-registry.json'), 'utf8'));
    assert.ok(data.models && Object.keys(data.models).length > 0, 'registry should have model entries');
    // Check at least one known model is present
    const hasGemini = Object.keys(data.models).some(k => k.includes('gemini'));
    assert.ok(hasGemini, 'registry should contain at least one Gemini model');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('model entries have cost, speed, and capability fields', () => {
  for (const [modelId, model] of Object.entries(KNOWN_MODELS)) {
    assert.ok(typeof model.costPer1kIn  === 'number', `${modelId}.costPer1kIn must be a number`);
    assert.ok(typeof model.costPer1kOut === 'number', `${modelId}.costPer1kOut must be a number`);
    assert.ok(typeof model.speedScore   === 'number', `${modelId}.speedScore must be a number`);
    assert.ok(model.capabilities && typeof model.capabilities.reasoning === 'number',
      `${modelId}.capabilities.reasoning must be a number`);
  }
});

// C-4: Model selection ────────────────────────────────────────────────────────

test('selectModel for subconscious returns a fast/cheap model (not Claude Opus)', () => {
  const result = selectModel('subconscious');
  assert.ok(result && result.modelId, 'selectModel should return a result');
  // Opus is the most expensive and slowest — subconscious priorities are speed+cost
  assert.notEqual(result.modelId, 'anthropic/claude-opus-4.6',
    'subconscious role should not pick the most expensive model');
});

test('selectModel for conscious returns a high-reasoning model', () => {
  const result = selectModel('conscious');
  assert.ok(result && result.modelId, 'selectModel should return a result');
  const model = KNOWN_MODELS[result.modelId];
  assert.ok(model, 'selected model should be in KNOWN_MODELS');
  assert.ok(model.capabilities.reasoning >= 0.75,
    `conscious role should pick a model with reasoning >= 0.75, got ${model.capabilities.reasoning}`);
});

test('selectModel applies entity performance multiplier to scoring', () => {
  // Seed a performance record that gives a very high score to the cheapest model for this entity
  const performance = {
    records: {
      'subconscious|entity_test|google/gemini-flash-1.5': {
        role: 'subconscious', modelId: 'google/gemini-flash-1.5', entityId: 'entity_test',
        sampleCount: 10, qualityScore: 0.99, taskScores: {}, avgLatencyMs: 200
      },
      'subconscious|entity_test|meta-llama/llama-3.1-8b-instruct': {
        role: 'subconscious', modelId: 'meta-llama/llama-3.1-8b-instruct', entityId: 'entity_test',
        sampleCount: 10, qualityScore: 0.10, taskScores: {}, avgLatencyMs: 400
      }
    }
  };
  const resultWithPerf = selectModel('subconscious', { performance, entityId: 'entity_test' });
  // The low-quality model should be penalised (perfMultiplier ~0.68 vs ~1.39)
  assert.ok(resultWithPerf.modelId !== 'meta-llama/llama-3.1-8b-instruct',
    'low-quality model in performance history should not win against a well-performing competitor');
});

// C-3: Performance tracking ───────────────────────────────────────────────────

test('recordPerformance creates a new performance entry on first call', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-mi-test-'));
  try {
    recordPerformance(tmpDir, {
      role: 'conscious', modelId: 'anthropic/claude-sonnet-4.6',
      entityId: 'entity_alice', quality: 0.9, tokensTotal: 500
    });
    const data = getPerformance(tmpDir);
    const key  = 'conscious|entity_alice|anthropic/claude-sonnet-4.6';
    assert.ok(data.records[key], 'performance record should be created');
    assert.equal(data.records[key].sampleCount, 1);
    assert.ok(Math.abs(data.records[key].qualityScore - 0.9) < 0.001, 'quality should be recorded');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recordPerformance updates rolling average on subsequent calls', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-mi-test-'));
  try {
    const params = { role: 'conscious', modelId: 'openai/gpt-4o', entityId: 'entity_bob' };
    recordPerformance(tmpDir, { ...params, quality: 1.0 });
    recordPerformance(tmpDir, { ...params, quality: 0.0 });
    const data = getPerformance(tmpDir);
    const key  = 'conscious|entity_bob|openai/gpt-4o';
    assert.equal(data.records[key].sampleCount, 2);
    // Rolling avg of 1.0 and 0.0 should be ~0.5
    assert.ok(Math.abs(data.records[key].qualityScore - 0.5) < 0.001,
      'rolling average should be 0.5 after 1.0 and 0.0');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// C-1 bootstrap integration: intelligence files created alongside entity ───────

test('bootstrap seeds role-knowledge.json and model-registry.json', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const memRoot = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`, 'memories');
    assert.ok(
      fs.existsSync(path.join(memRoot, 'role-knowledge.json')),
      'bootstrap should create role-knowledge.json'
    );
    assert.ok(
      fs.existsSync(path.join(memRoot, 'model-registry.json')),
      'bootstrap should create model-registry.json'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Directory structure ───────────────────────────────────────────────────────

test('ensureSystemEntity creates expected subdirectory structure', () => {
  const tmpDir = makeTmpDir();
  try {
    ensureSystemEntity(tmpDir);
    const base = path.join(tmpDir, `entity_${SYSTEM_ENTITY_ID}`);
    const expectedDirs = [
      'memories/episodic',
      'memories/dreams',
      'memories/archives',
      'memories/goals',
      'memories/index',
      'beliefs',
    ];
    for (const sub of expectedDirs) {
      const full = path.join(base, sub);
      assert.ok(fs.existsSync(full) && fs.statSync(full).isDirectory(),
        `expected directory to exist: ${sub}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── B-4: Dream pipeline skip guard ───────────────────────────────────────────

test('dreamsPhase skips generation when entity has dreamDisabled: true', async () => {
  const tmpDir = makeTmpDir();
  try {
    const entityDir = path.join(tmpDir, 'entity_skipdream');
    fs.mkdirSync(entityDir, { recursive: true });
    fs.writeFileSync(
      path.join(entityDir, 'entity.json'),
      JSON.stringify({ id: 'skipdream', dreamDisabled: true })
    );
    let dreamEngineStarted = false;
    const mockLoop = {
      memDir: entityDir,
      dreamEngine: {
        startDreamCycle: () => { dreamEngineStarted = true; return { max_dreams: 1 }; }
      },
      _forcedDreamRun: { maxDreams: 1, isShutdown: false },
      cycleCount: 5,
      dreamInterval: 5,
      _callLLM: () => Promise.resolve('dream text'),
      _lastDirectives: {},
      _identityManager: null,
      _aspectConfigs: { main: { type: 'ollama', model: 'test', endpoint: 'http://localhost' } },
      _getTokenLimit: () => 2000,
      _emit: () => {}
    };
    const dreamsPhase = require('../../server/brain/cognition/phases/phase-dreams');
    await dreamsPhase(mockLoop);
    assert.equal(dreamEngineStarted, false, 'dreamEngine.startDreamCycle must not be called when dreamDisabled');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dreamsPhase runs normally when entity does NOT have dreamDisabled', async () => {
  const tmpDir = makeTmpDir();
  try {
    const entityDir = path.join(tmpDir, 'entity_allowdream');
    fs.mkdirSync(entityDir, { recursive: true });
    fs.writeFileSync(
      path.join(entityDir, 'entity.json'),
      JSON.stringify({ id: 'allowdream', dreamDisabled: false })
    );
    let dreamEngineStarted = false;
    const mockLoop = {
      memDir: entityDir,
      dreamEngine: {
        startDreamCycle: () => {
          dreamEngineStarted = true;
          // Return minimal cycle info to allow phase to proceed without real seeds
          return { max_dreams: 0 };
        }
      },
      _forcedDreamRun: { maxDreams: 0, isShutdown: false },
      cycleCount: 5,
      dreamInterval: 5,
      _callLLM: () => Promise.resolve('dream text'),
      _lastDirectives: {},
      _identityManager: null,
      _aspectConfigs: { main: { type: 'ollama', model: 'test', endpoint: 'http://localhost' } },
      _getTokenLimit: () => 2000,
      _emit: () => {},
      memoryStorage: null
    };
    const dreamsPhase = require('../../server/brain/cognition/phases/phase-dreams');
    await dreamsPhase(mockLoop);
    assert.equal(dreamEngineStarted, true, 'dreamEngine.startDreamCycle should be called when dreamDisabled is absent/false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── B-4: Orchestrator context wiring ─────────────────────────────────────────

test('Orchestrator includes entity summaries in mergePrompt when isSystemEntity is true', async () => {
  const Orchestrator = require('../../server/brain/core/orchestrator');
  let capturedUserMessage = null;
  const fakeCallLLM = async (runtime, messages) => {
    capturedUserMessage = (messages || []).find(m => m.role === 'user')?.content || '';
    return { content: 'ok', usage: null };
  };
  const orch = new Orchestrator({
    entity: { id: 'nekocore', name: 'NekoCore', isSystemEntity: true },
    callLLM: fakeCallLLM,
    aspectConfigs: { main: { type: 'ollama', model: 'test', endpoint: 'http://localhost' } },
    getEntitySummaries: () => [
      { id: 'entity_alice', name: 'Alice', traits: ['curious', 'warm'] },
      { id: 'entity_bob', name: 'Bob', traits: ['logical'] }
    ]
  });
  await orch.runOrchestrator('(conscious output)', '(subconscious)', '(dream)', 'hi there');
  assert.ok(capturedUserMessage !== null, 'callLLM should have been called');
  assert.ok(capturedUserMessage.includes('MANAGED ENTITIES'), 'mergePrompt must include MANAGED ENTITIES block');
  assert.ok(capturedUserMessage.includes('Alice'), 'mergePrompt must include entity name Alice');
  assert.ok(capturedUserMessage.includes('Bob'), 'mergePrompt must include entity name Bob');
});

test('Orchestrator omits entity summaries block when entity is not a system entity', async () => {
  const Orchestrator = require('../../server/brain/core/orchestrator');
  let capturedUserMessage = null;
  const fakeCallLLM = async (runtime, messages) => {
    capturedUserMessage = (messages || []).find(m => m.role === 'user')?.content || '';
    return { content: 'ok', usage: null };
  };
  const orch = new Orchestrator({
    entity: { id: 'regular_entity', name: 'Alice', isSystemEntity: false },
    callLLM: fakeCallLLM,
    aspectConfigs: { main: { type: 'ollama', model: 'test', endpoint: 'http://localhost' } },
    getEntitySummaries: () => [{ id: 'entity_bob', name: 'Bob', traits: [] }]
  });
  await orch.runOrchestrator('(conscious)', '(sub)', '(dream)', 'hello');
  assert.ok(!capturedUserMessage.includes('MANAGED ENTITIES'), 'non-system entity should not receive MANAGED ENTITIES block');
});

test('Orchestrator getEntitySummaries does not mutate source entity objects', async () => {
  const Orchestrator = require('../../server/brain/core/orchestrator');
  const sourceEntities = [
    { id: 'entity_alice', name: 'Alice', personality_traits: ['curious', 'warm'] }
  ];
  const fakeCallLLM = async () => ({ content: 'ok', usage: null });
  const orch = new Orchestrator({
    entity: { id: 'nekocore', name: 'NekoCore', isSystemEntity: true },
    callLLM: fakeCallLLM,
    aspectConfigs: { main: { type: 'ollama', model: 'test', endpoint: 'http://localhost' } },
    getEntitySummaries: () => sourceEntities.map(e => ({
      id: e.id,
      name: e.name,
      traits: (e.personality_traits || []).slice(0, 3)
    }))
  });
  await orch.runOrchestrator('(conscious)', '(sub)', '(dream)', 'hi');
  assert.equal(sourceEntities[0].name, 'Alice', 'entity name must not be mutated');
  assert.deepEqual(sourceEntities[0].personality_traits, ['curious', 'warm'], 'entity traits must not be mutated');
});
