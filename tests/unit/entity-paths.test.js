// ============================================================
// Unit Tests — entity-paths.js
// Tests normalizeEntityId (pure) and path format of key helpers.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { normalizeEntityId, getEntityRoot, getMemoryRoot, getNeurochemistryPath } = require('../../server/entities/entityPaths');

// Use a dedicated test entity id to avoid polluting real entity dirs
const TEST_ENTITY = '_unit-test-paths-abc';

test('normalizeEntityId strips entity_ prefix', () => {
  assert.equal(normalizeEntityId('entity_aria'), 'aria');
});

test('normalizeEntityId strips double entity_ prefix', () => {
  assert.equal(normalizeEntityId('entity_entity_aria'), 'aria');
});

test('normalizeEntityId leaves plain id unchanged', () => {
  assert.equal(normalizeEntityId('aria'), 'aria');
});

test('normalizeEntityId trims whitespace', () => {
  assert.equal(normalizeEntityId('  aria  '), 'aria');
});

test('normalizeEntityId returns empty string for null', () => {
  assert.equal(normalizeEntityId(null), '');
});

test('normalizeEntityId returns empty string for empty string', () => {
  assert.equal(normalizeEntityId(''), '');
});

test('getEntityRoot throws for empty entityId', () => {
  assert.throws(() => getEntityRoot(''), /Invalid entityId/);
});

test('getEntityRoot returns path containing entity_ prefix', () => {
  const root = getEntityRoot(TEST_ENTITY);
  assert.ok(root.includes('entity_'), `expected path to contain entity_, got: ${root}`);
});

test('getEntityRoot result ends with normalized entity folder', () => {
  const root = getEntityRoot(TEST_ENTITY);
  const basename = path.basename(root);
  assert.equal(basename, `entity_${TEST_ENTITY}`);
});

test('getMemoryRoot is inside getEntityRoot', () => {
  const entityRoot = getEntityRoot(TEST_ENTITY);
  const memRoot = getMemoryRoot(TEST_ENTITY);
  assert.ok(memRoot.startsWith(entityRoot), `memRoot ${memRoot} not inside entityRoot ${entityRoot}`);
});

test('getNeurochemistryPath returns a .json file path', () => {
  const p = getNeurochemistryPath(TEST_ENTITY);
  assert.ok(p.endsWith('.json'), `expected .json, got: ${p}`);
  assert.ok(p.includes('neurochemistry'), `expected 'neurochemistry' in path, got: ${p}`);
});

test('getEntityRoot with entity_ prefixed id produces same dir as without', () => {
  const withPrefix = getEntityRoot('entity_' + TEST_ENTITY);
  const withoutPrefix = getEntityRoot(TEST_ENTITY);
  assert.equal(withPrefix, withoutPrefix);
});
