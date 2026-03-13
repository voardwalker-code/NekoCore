// ============================================================
// Phase B - Dream Split Hardening Guard Tests (B1)
// Asserts:
//   1. Orchestrator live loop uses runDreamIntuition (no-write) only.
//   2. dream-intuition-adapter.js has no memory-write call sites.
//   3. phase-dreams.js is wired to dream-maintenance-selector.
//   4. phase-dreams.js is wired to dream-link-writer.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── B1a: Orchestrator parallel contributors block ──────────────────────────

test('orchestrator live loop uses runDreamIntuition (no-write) as parallel contributor', () => {
  const src = readFile('server/brain/core/orchestrator.js');

  // runDreamIntuition must be invoked to produce dreamPromise,
  // which then feeds into the outer Promise.all contributor block.
  assert.ok(
    /this\.runDreamIntuition\(/.test(src),
    'orchestrator must call this.runDreamIntuition() as a contributor'
  );
  assert.ok(
    /runDreamIntuition[\s\S]{0,600}Promise\.all\(/.test(src),
    'orchestrator Promise.all contributors block must reference runDreamIntuition upstream'
  );
});

test('orchestrator live loop parallel contributors block does not call runDream', () => {
  const src = readFile('server/brain/core/orchestrator.js');

  // Capture the Promise.all contributors block (up to 600 chars after Promise.all)
  const match = src.match(/Promise\.all\(([\s\S]{0,600}?)\)/);
  assert.ok(match, 'orchestrator must contain a Promise.all call for parallel contributors');

  const parallelBlock = match[1];
  assert.ok(
    !/this\.runDream\b/.test(parallelBlock),
    'orchestrator parallel contributors block must not call runDream (heavy maintenance path)'
  );
});

// ── B1b: dream-intuition-adapter no-write guarantee ──────────────────────

const WRITE_CALL_PATTERNS = [
  'createCoreMemory',
  'createSemanticKnowledge',
  'storeMemory',
  'storeDream',
  'writeMemory'
];

test('dream-intuition-adapter.js contains no memory-write call sites', () => {
  const src = readFile('server/brain/cognition/dream-intuition-adapter.js');

  for (const pattern of WRITE_CALL_PATTERNS) {
    assert.ok(
      !src.includes(pattern),
      `dream-intuition-adapter.js must not contain memory-write call: ${pattern}`
    );
  }
});

// ── B4/B5 wiring guards (added after B4+B5 are implemented) ───────────────

test('phase-dreams.js imports dream-maintenance-selector', () => {
  const src = readFile('server/brain/cognition/phases/phase-dreams.js');
  assert.match(
    src,
    /require\(.*dream-maintenance-selector/,
    'phase-dreams.js must require dream-maintenance-selector'
  );
});

test('phase-dreams.js imports dream-link-writer', () => {
  const src = readFile('server/brain/cognition/phases/phase-dreams.js');
  assert.match(
    src,
    /require\(.*dream-link-writer/,
    'phase-dreams.js must require dream-link-writer'
  );
});

test('phase-dreams.js calls selectDreamCandidates', () => {
  const src = readFile('server/brain/cognition/phases/phase-dreams.js');
  assert.match(
    src,
    /selectDreamCandidates\(/,
    'phase-dreams.js must call selectDreamCandidates from selector module'
  );
});

test('phase-dreams.js calls writeDreamSourceLinks', () => {
  const src = readFile('server/brain/cognition/phases/phase-dreams.js');
  assert.match(
    src,
    /writeDreamSourceLinks\(/,
    'phase-dreams.js must call writeDreamSourceLinks from link writer module'
  );
});
