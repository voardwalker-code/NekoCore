// ============================================================
// Unit Tests — NekoCore Protection Guards (A-3)
// Verifies via source-code inspection that:
//   1. Reserved entity name block is in place on all creation paths
//   2. System entity ID guard is in place on delete + visibility routes
//   3. _isSystemEntityId normalises correctly (via bootstrap SYSTEM_ENTITY_ID)
// ============================================================

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const ROOT             = path.resolve(__dirname, '..', '..');
const ENTITY_ROUTES    = path.join(ROOT, 'server', 'routes', 'entity-routes.js');
const { SYSTEM_ENTITY_ID } = require('../../server/brain/nekocore/bootstrap');

function readEntityRoutes() {
  return fs.readFileSync(ENTITY_ROUTES, 'utf8');
}

// ── Reserved name block ──────────────────────────────────────────────────────

test('RESERVED_ENTITY_NAME_KEYS set is defined in entity-routes.js', () => {
  const src = readEntityRoutes();
  assert.ok(src.includes("new Set(['nekocore', 'neko', 'echo', 'agentecho'])"),
    'expected RESERVED_ENTITY_NAME_KEYS set with all four reserved names');
});

test('_assertEntityNameAllowed is called in postEntitiesCreate', () => {
  const src = readEntityRoutes();
  // Narrow the check to the create function
  const createBlock = src.slice(src.indexOf('async function postEntitiesCreate('));
  const endIdx = createBlock.indexOf('async function postEntitiesCreateHatch(');
  const block = endIdx > 0 ? createBlock.slice(0, endIdx) : createBlock.slice(0, 600);
  assert.ok(block.includes('_assertEntityNameAllowed'),
    '_assertEntityNameAllowed must be called in postEntitiesCreate');
});

test('_assertEntityNameAllowed is called in postEntitiesCreateHatch', () => {
  const src = readEntityRoutes();
  const hatchStart = src.indexOf('async function postEntitiesCreateHatch(');
  const guidedStart = src.indexOf('async function postEntitiesCreateGuided(');
  // Extract the full function body between the two markers
  const block = src.slice(hatchStart, guidedStart > hatchStart ? guidedStart : hatchStart + 2000);
  assert.ok(block.includes('_assertEntityNameAllowed'),
    '_assertEntityNameAllowed must be called in postEntitiesCreateHatch');
});

test('_assertEntityNameAllowed is called in postEntitiesCreateGuided', () => {
  const src = readEntityRoutes();
  const guidedStart = src.indexOf('async function postEntitiesCreateGuided(');
  const afterGuided = src.slice(guidedStart, guidedStart + 800);
  assert.ok(afterGuided.includes('_assertEntityNameAllowed'),
    '_assertEntityNameAllowed must be called in postEntitiesCreateGuided');
});

test('_assertEntityNameAllowed is called in postEntitiesCreateCharacter', () => {
  const src = readEntityRoutes();
  const charStart = src.indexOf('async function postEntitiesCreateCharacter(');
  const afterChar = src.slice(charStart, charStart + 800);
  assert.ok(afterChar.includes('_assertEntityNameAllowed'),
    '_assertEntityNameAllowed must be called in postEntitiesCreateCharacter');
});

// ── System entity ID guard ────────────────────────────────────────────────────

test('_isSystemEntityId helper is defined in entity-routes.js', () => {
  const src = readEntityRoutes();
  assert.ok(src.includes('function _isSystemEntityId('),
    '_isSystemEntityId must be defined in entity-routes.js');
});

test('SYSTEM_ENTITY_IDS set in entity-routes contains nekocore', () => {
  const src = readEntityRoutes();
  assert.ok(src.includes("new Set(['nekocore'])"),
    "SYSTEM_ENTITY_IDS must include 'nekocore'");
});

test('postEntitiesDelete has system entity guard returning 403', () => {
  const src = readEntityRoutes();
  const deleteStart = src.indexOf('async function postEntitiesDelete(');
  // Get enough of the function to see the guard — up to the ownership guard comment
  const block = src.slice(deleteStart, deleteStart + 800);
  assert.ok(block.includes('_isSystemEntityId(canonicalId)'),
    'postEntitiesDelete must call _isSystemEntityId guard');
  assert.ok(block.includes('System entities cannot be deleted'),
    'postEntitiesDelete guard must use the correct error message');
});

test('postEntitiesVisibility has system entity guard returning 403', () => {
  const src = readEntityRoutes();
  const visStart = src.indexOf('async function postEntitiesVisibility(');
  const block = src.slice(visStart, visStart + 800);
  assert.ok(block.includes('_isSystemEntityId(canonicalId)'),
    'postEntitiesVisibility must call _isSystemEntityId guard');
  assert.ok(block.includes('System entity visibility cannot be changed'),
    'postEntitiesVisibility guard must use the correct error message');
});

// ── Bootstrap SYSTEM_ENTITY_ID matches routes guard ───────────────────────────

test('SYSTEM_ENTITY_ID from bootstrap matches the entity-routes SYSTEM_ENTITY_IDS set', () => {
  // If these diverge, the bootstrap creates an entity that the guard does not protect.
  const src = readEntityRoutes();
  assert.ok(src.includes(`'${SYSTEM_ENTITY_ID}'`),
    `entity-routes must reference '${SYSTEM_ENTITY_ID}' to protect the system entity`);
});

// ── Guard ordering: system guard must come before ownership guard ─────────────

test('system entity guard appears before ownership guard in postEntitiesDelete', () => {
  const src = readEntityRoutes();
  const deleteStart = src.indexOf('async function postEntitiesDelete(');
  const block = src.slice(deleteStart, deleteStart + 1200);
  const sysGuardPos   = block.indexOf('_isSystemEntityId(canonicalId)');
  const ownerGuardPos = block.indexOf('You do not own this entity');
  assert.ok(sysGuardPos > -1, 'system entity guard must be present');
  assert.ok(ownerGuardPos > -1, 'ownership guard must be present');
  assert.ok(sysGuardPos < ownerGuardPos,
    'system entity guard must come before ownership guard in postEntitiesDelete');
});
