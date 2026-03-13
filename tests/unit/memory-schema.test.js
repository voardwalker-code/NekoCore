const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MEMORY_SCHEMA_VERSION, normalizeMemoryRecord } = require('../../server/contracts/memory-schema');

test('normalizeMemoryRecord applies default schema version', () => {
  const out = normalizeMemoryRecord({ memory_id: 'mem_1' });
  assert.equal(out.memorySchemaVersion, MEMORY_SCHEMA_VERSION);
});

test('normalizeMemoryRecord maps id to memory_id', () => {
  const out = normalizeMemoryRecord({ id: 'abc', type: 'semantic' });
  assert.equal(out.memory_id, 'abc');
  assert.equal(out.type, 'semantic');
});

test('normalizeMemoryRecord sanitizes topics to string array', () => {
  const out = normalizeMemoryRecord({ topics: ['alpha', '', 10, 'beta'] });
  assert.deepEqual(out.topics, ['alpha', 'beta']);
});
