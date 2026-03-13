// ============================================================
// Integration Tests — config-service.js
// Tests ConfigService load/save roundtrip, token limit defaults,
// and the singleton export.
// Note: tests interact with the real Config/ma-config.json file.
// Roundtrip tests clean up after themselves.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService, TOKEN_LIMIT_DEFAULTS } = require('../../server/services/config-service');

// ── TOKEN_LIMIT_DEFAULTS ──────────────────────────────────

test('TOKEN_LIMIT_DEFAULTS has memoryEncoding key', () => {
  assert.ok('memoryEncoding' in TOKEN_LIMIT_DEFAULTS);
});

test('TOKEN_LIMIT_DEFAULTS has dreamEngine key', () => {
  assert.ok('dreamEngine' in TOKEN_LIMIT_DEFAULTS);
});

test('TOKEN_LIMIT_DEFAULTS has bootstrapAwakening key', () => {
  assert.ok('bootstrapAwakening' in TOKEN_LIMIT_DEFAULTS);
});

test('TOKEN_LIMIT_DEFAULTS values are positive numbers', () => {
  for (const [k, v] of Object.entries(TOKEN_LIMIT_DEFAULTS)) {
    assert.ok(Number.isFinite(v.value) && v.value > 0, `${k}.value should be a positive number`);
  }
});

test('TOKEN_LIMIT_DEFAULTS entries have label and desc strings', () => {
  for (const [k, v] of Object.entries(TOKEN_LIMIT_DEFAULTS)) {
    assert.equal(typeof v.label, 'string', `${k}.label should be a string`);
    assert.equal(typeof v.desc,  'string', `${k}.desc should be a string`);
  }
});

// ── Singleton export ──────────────────────────────────────

test('singleton export is truthy and has getTokenLimit method', () => {
  const singleton = require('../../server/services/config-service');
  assert.ok(singleton !== null && singleton !== undefined);
  assert.equal(typeof singleton.getTokenLimit, 'function');
});

// ── ConfigService instance ────────────────────────────────

test('ConfigService constructs without throwing', () => {
  const cs = new ConfigService();
  assert.ok(cs instanceof ConfigService);
});

test('load() returns an object (empty or populated)', () => {
  const cs = new ConfigService();
  const cfg = cs.load();
  assert.equal(typeof cfg, 'object');
  assert.ok(cfg !== null);
});

test('getTokenLimit returns default for known key', () => {
  const cs = new ConfigService();
  const val = cs.getTokenLimit('memoryEncoding');
  assert.equal(val, TOKEN_LIMIT_DEFAULTS.memoryEncoding.value);
});

test('getTokenLimit returns default for dreamEngine key', () => {
  const cs = new ConfigService();
  const val = cs.getTokenLimit('dreamEngine');
  assert.equal(val, TOKEN_LIMIT_DEFAULTS.dreamEngine.value);
});

test('getTokenLimit returns positive number for unknown key', () => {
  const cs = new ConfigService();
  const val = cs.getTokenLimit('doesNotExistXYZ');
  assert.equal(typeof val, 'number');
  assert.ok(val > 0, `expected positive fallback, got ${val}`);
});

test('getTokenLimitDefaults returns the same object as TOKEN_LIMIT_DEFAULTS', () => {
  const cs = new ConfigService();
  const defaults = cs.getTokenLimitDefaults();
  assert.deepEqual(Object.keys(defaults).sort(), Object.keys(TOKEN_LIMIT_DEFAULTS).sort());
});

test('save and load roundtrip preserves custom key', () => {
  const cs = new ConfigService();
  const original = cs.load();
  const testData = { ...original, _test_roundtrip_marker: '__rem_test_2026__' };
  cs.save(testData);
  const reloaded = cs.load();
  assert.equal(reloaded._test_roundtrip_marker, '__rem_test_2026__');
  // Restore: remove test marker
  const { _test_roundtrip_marker, ...restored } = reloaded;
  cs.save(restored);
});

test('save and load roundtrip preserves maxTokens', () => {
  const cs = new ConfigService();
  const original = cs.load();
  const testData = { ...original, maxTokens: 54321 };
  cs.save(testData);
  const reloaded = cs.load();
  assert.equal(reloaded.maxTokens, 54321);
  // Restore
  cs.save(original);
});

test('defaultMaxTokens is a positive number', () => {
  const cs = new ConfigService();
  assert.ok(Number.isFinite(cs.defaultMaxTokens) && cs.defaultMaxTokens > 0);
});

// ── _runMigrations ────────────────────────────────────────

test('_runMigrations stamps configVersion=1 on unversioned config', () => {
  const cs = new ConfigService();
  const result = cs._runMigrations({ profiles: {}, lastActive: 'x' });
  assert.equal(result.configVersion, 1);
});

test('_runMigrations does not change config already at current version', () => {
  const cs = new ConfigService();
  const input = { profiles: {}, lastActive: 'x', configVersion: 1, _sentinel: 'unchanged' };
  const result = cs._runMigrations(input);
  assert.equal(result.configVersion, 1);
  assert.equal(result._sentinel, 'unchanged');
});

test('_runMigrations does not mutate the original config object', () => {
  const cs = new ConfigService();
  const original = { profiles: {}, lastActive: 'x' };
  cs._runMigrations(original);
  assert.equal(original.configVersion, undefined);
});

test('_runMigrations returns an object with all original fields intact', () => {
  const cs = new ConfigService();
  const input = { profiles: { default: {} }, lastActive: 'default', maxTokens: 8000 };
  const result = cs._runMigrations(input);
  assert.equal(result.maxTokens, 8000);
  assert.ok('profiles' in result);
});

// ── load() stamps configVersion ───────────────────────────

test('load() stamps configVersion onto config that lacked it', () => {
  const cs = new ConfigService();
  const original = cs.load();
  // Strip version, save stripped copy, then reload — should re-stamp it
  const stripped = { ...original };
  delete stripped.configVersion;
  cs.save(stripped);
  const reloaded = cs.load();
  assert.ok(Number.isFinite(reloaded.configVersion) && reloaded.configVersion >= 1);
  // Restore
  cs.save(original);
});

// ── validateGlobalConfig ──────────────────────────────────

test('validateGlobalConfig returns empty array for a valid config', () => {
  const cs = new ConfigService();
  const cfg = {
    profiles: { default: { apikey: { endpoint: 'https://api.example.com', model: 'gpt-4o' } } },
    lastActive: 'default',
  };
  const warnings = cs.validateGlobalConfig(cfg);
  assert.deepEqual(warnings, []);
});

test('validateGlobalConfig warns when profiles object is missing', () => {
  const cs = new ConfigService();
  const warnings = cs.validateGlobalConfig({ lastActive: 'default' });
  assert.ok(warnings.length > 0);
  assert.ok(warnings.some(w => /profiles/.test(w)));
});

test('validateGlobalConfig warns when profiles object is empty', () => {
  const cs = new ConfigService();
  const warnings = cs.validateGlobalConfig({ profiles: {}, lastActive: 'default' });
  assert.ok(warnings.length > 0);
});

test('validateGlobalConfig warns when lastActive does not match any profile', () => {
  const cs = new ConfigService();
  const cfg = {
    profiles: { real: { apikey: { endpoint: 'https://x.com', model: 'gpt-4' } } },
    lastActive: 'nonexistent',
  };
  const warnings = cs.validateGlobalConfig(cfg);
  assert.ok(warnings.some(w => /lastActive/.test(w) || /nonexistent/.test(w)));
});

test('validateGlobalConfig returns an array even for null input', () => {
  const cs = new ConfigService();
  const warnings = cs.validateGlobalConfig(null);
  assert.ok(Array.isArray(warnings));
  assert.ok(warnings.length > 0);
});

test('validateGlobalConfig returns an array for non-object input', () => {
  const cs = new ConfigService();
  const warnings = cs.validateGlobalConfig('not an object');
  assert.ok(Array.isArray(warnings));
  assert.ok(warnings.length > 0);
});

// ── validateProfileConfig ─────────────────────────────────

test('validateProfileConfig returns empty array for valid apikey profile', () => {
  const cs = new ConfigService();
  const profile = { apikey: { endpoint: 'https://api.example.com', model: 'gpt-4o' } };
  const warnings = cs.validateProfileConfig(profile, 'test');
  assert.deepEqual(warnings, []);
});

test('validateProfileConfig returns empty array for valid ollama profile', () => {
  const cs = new ConfigService();
  const profile = { ollama: { url: 'http://localhost:11434', model: 'llama3' } };
  const warnings = cs.validateProfileConfig(profile, 'test');
  assert.deepEqual(warnings, []);
});

test('validateProfileConfig warns when apikey.endpoint is missing', () => {
  const cs = new ConfigService();
  const profile = { apikey: { model: 'gpt-4o' } };
  const warnings = cs.validateProfileConfig(profile, 'test');
  assert.ok(warnings.some(w => /endpoint/.test(w)));
});

test('validateProfileConfig warns when apikey.model is missing', () => {
  const cs = new ConfigService();
  const profile = { apikey: { endpoint: 'https://api.example.com' } };
  const warnings = cs.validateProfileConfig(profile, 'test');
  assert.ok(warnings.some(w => /model/.test(w)));
});

test('validateProfileConfig warns when ollama.url is missing', () => {
  const cs = new ConfigService();
  const profile = { ollama: { model: 'llama3' } };
  const warnings = cs.validateProfileConfig(profile, 'test');
  assert.ok(warnings.some(w => /url/.test(w)));
});

test('validateProfileConfig warns when ollama.model is missing', () => {
  const cs = new ConfigService();
  const profile = { ollama: { url: 'http://localhost:11434' } };
  const warnings = cs.validateProfileConfig(profile, 'test');
  assert.ok(warnings.some(w => /model/.test(w)));
});

test('validateProfileConfig warns when no provider config at all', () => {
  const cs = new ConfigService();
  const profile = { _activeType: 'apikey' };
  const warnings = cs.validateProfileConfig(profile, 'empty');
  assert.ok(warnings.length > 0);
  assert.ok(warnings.some(w => /provider/.test(w) || /config/.test(w)));
});

test('validateProfileConfig warns for non-object profile', () => {
  const cs = new ConfigService();
  const warnings = cs.validateProfileConfig(null, 'nullprofile');
  assert.ok(warnings.length > 0);
});

test('validateProfileConfig returns empty array for aspect-only profile', () => {
  const cs = new ConfigService();
  const profile = {
    main: { type: 'apikey', model: 'gpt-4o', endpoint: 'https://x.com' },
    subconscious: { type: 'ollama', model: 'llama3', url: 'http://localhost:11434' },
  };
  const warnings = cs.validateProfileConfig(profile, 'aspectOnly');
  assert.deepEqual(warnings, []);
});
