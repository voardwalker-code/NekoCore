const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  enforceResponseContract,
  validateChatResponse,
  validateMemoriesReconstructResponse,
  validateDocumentIngestResponse
} = require('../../server/contracts/response-contracts');

test('validateChatResponse returns no errors for valid payload', () => {
  const errs = validateChatResponse({ ok: true, response: 'hello', innerDialog: {} });
  assert.deepEqual(errs, []);
});

test('validateMemoriesReconstructResponse requires reconstructed string', () => {
  const errs = validateMemoriesReconstructResponse({ ok: true, reconstructed: 10 });
  assert.ok(errs.length > 0);
});

test('validateDocumentIngestResponse validates required fields', () => {
  const errs = validateDocumentIngestResponse({ ok: true, chunkId: 'doc_1', topics: ['x'], importance: 0.8, overwritten: false });
  assert.deepEqual(errs, []);
});

test('enforceResponseContract throws for invalid payload', () => {
  assert.throws(() => {
    enforceResponseContract('/api/chat', { ok: true, response: 123 });
  }, /Response contract violation/);
});
