const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER_FILE = path.join(ROOT, 'server', 'server.js');

function readServer() {
  return fs.readFileSync(SERVER_FILE, 'utf8');
}

test('server composition delegates runtime lifecycle to service module', () => {
  const src = readServer();
  assert.match(src, /createRuntimeLifecycle\s*=\s*require\('\.\/services\/runtime-lifecycle'\)/);
  assert.ok(!/async function startTelegramBot\(/.test(src));
  assert.ok(!/async function gracefulShutdown\(/.test(src));
});

test('server composition delegates post-response memory pipeline to service module', () => {
  const src = readServer();
  assert.match(src, /runPostResponseMemoryEncoding\s*\}\s*=\s*require\('\.\/services\/post-response-memory'\)/);
  assert.ok(!/const memPrompt = `Process this conversation exchange into a memory record\./.test(src));
});

test('server composition delegates natural chat postprocess to service module', () => {
  const src = readServer();
  assert.match(src, /postProcessResponse\s*\}\s*=\s*require\('\.\/services\/response-postprocess'\)/);
  assert.ok(!/humanizeResponse\s*,\s*quickClean/.test(src));
  assert.ok(!/result\.chunks\s*=\s*splitIntoChunks\(polished\)/.test(src));
});

test('server composition delegates shared LLM runtime helper utilities to service module', () => {
  const src = readServer();
  assert.match(src, /services\/llm-runtime-utils/);
  assert.ok(!/function parseJsonBlock\(/.test(src));
  assert.ok(!/function estimateUsageFromText\(/.test(src));
  assert.ok(!/function stripInternalResumeTag\(/.test(src));
});

// ── Phase A Re-evaluation guards ────────────────────────────────────────────
// These tests are EXPECTED TO FAIL until each extraction slice completes.
// They enforce the target state and turn green as each slice lands.

test('A-Re1: callLLMWithRuntime must not be defined in server.js (should be in llm-interface.js)', () => {
  const src = readServer();
  assert.ok(
    !/async function callLLMWithRuntime\(/.test(src),
    'callLLMWithRuntime must be extracted to services/llm-interface.js'
  );
});

test('A-Re1: callSubconsciousReranker must not be defined in server.js (should be in llm-interface.js)', () => {
  const src = readServer();
  assert.ok(
    !/async function callSubconsciousReranker\(/.test(src),
    'callSubconsciousReranker must be extracted to services/llm-interface.js'
  );
});

test('A-Re2: loadAspectRuntimeConfig must not be defined in server.js (should be in config-runtime.js)', () => {
  const src = readServer();
  assert.ok(
    !/function loadAspectRuntimeConfig\(/.test(src),
    'loadAspectRuntimeConfig must be extracted to services/config-runtime.js'
  );
});

test('A-Re2: normalizeAspectRuntimeConfig must not be defined in server.js (should be in config-runtime.js)', () => {
  const src = readServer();
  assert.ok(
    !/function normalizeAspectRuntimeConfig\(/.test(src),
    'normalizeAspectRuntimeConfig must be extracted to services/config-runtime.js'
  );
});

test('A-Re3: createCoreMemory must not be defined in server.js (should be in memory-operations.js)', () => {
  const src = readServer();
  assert.ok(
    !/async function createCoreMemory\(/.test(src),
    'createCoreMemory must be extracted to services/memory-operations.js'
  );
});

test('A-Re3: createSemanticKnowledge must not be defined in server.js (should be in memory-operations.js)', () => {
  const src = readServer();
  assert.ok(
    !/async function createSemanticKnowledge\(/.test(src),
    'createSemanticKnowledge must be extracted to services/memory-operations.js'
  );
});

test('A-Re4: getSubconsciousMemoryContext must not be defined in server.js (should be in memory-retrieval.js)', () => {
  const src = readServer();
  assert.ok(
    !/async function getSubconsciousMemoryContext\(/.test(src),
    'getSubconsciousMemoryContext must be extracted to services/memory-retrieval.js'
  );
});

test('A-Re5: parseJsonBlock must not be defined in post-response-memory.js (should import from llm-runtime-utils)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'server', 'services', 'post-response-memory.js'),
    'utf8'
  );
  assert.ok(
    !/function parseJsonBlock\(/.test(src),
    'parseJsonBlock must not be locally defined in post-response-memory.js — import from llm-runtime-utils'
  );
});
