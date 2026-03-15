// ============================================================
// Integration Tests — nekocore-routes.js  (Phase D-5)
// Tests NekoCore model governance endpoints:
//   GET  /api/nekocore/status
//   GET  /api/nekocore/pending
//   POST /api/nekocore/model-recommend
//   POST /api/nekocore/model-apply   (approve + reject + unknown-id)
// ============================================================

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');

const createNekoCoreRoutes = require('../../server/routes/nekocore-routes');

// ── Test helpers ─────────────────────────────────────────────────────────────

const BASE_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Build a minimal ctx object suitable for nekocore-routes.
 * Config is kept in-memory; fs/path are the real Node built-ins.
 */
function makeCtx(initialCfg = {}) {
  let _cfg = {
    lastActive: 'test-profile',
    profiles: {
      'test-profile': {
        main:          { model: 'google/gemini-flash-2.0' },
        subconscious:  { model: 'meta-llama/llama-3.1-8b-instruct' },
        orchestrator:  { model: 'anthropic/claude-sonnet-4.6' },
      }
    },
    ...initialCfg
  };
  const ctx = {
    fs,
    path,
    loadConfig: () => JSON.parse(JSON.stringify(_cfg)),   // deep clone on every read
    saveConfig: (c)  => { _cfg = JSON.parse(JSON.stringify(c)); },
    _getConfig:  ()  => _cfg,      // test-only introspection
  };
  return ctx;
}

/**
 * Build a fake response object that captures writeHead + end calls.
 */
function makeRes() {
  const res = {
    statusCode: null,
    headers:    {},
    body:       '',
    writeHead(code, headers) { this.statusCode = code; this.headers = { ...headers }; },
    end(data)               { this.body = data || ''; },
    json()                  { return JSON.parse(this.body); },
  };
  return res;
}

function makeReq(bodyObj = null) {
  return { method: bodyObj ? 'POST' : 'GET', accountId: 'test-user' };
}

function readBodyFn(bodyObj) {
  return (_req) => Promise.resolve(bodyObj ? JSON.stringify(bodyObj) : '{}');
}

function makeUrl(path_) {
  return new URL(path_, 'http://localhost:3000');
}

// Shared routes instance (stateful _pendingRecommendations lives at module level)
const ctx    = makeCtx();
const routes = createNekoCoreRoutes(ctx);

// ── Status endpoint ──────────────────────────────────────────────────────────

test('GET /api/nekocore/status — returns ok:true and required fields', async () => {
  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq(),
    res,
    makeUrl('/api/nekocore/status'),
    BASE_HEADERS,
    readBodyFn(null)
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(typeof data.isSystemEntityReady, 'boolean');
  assert.equal(typeof data.pendingCount, 'number');
});

// ── Pending endpoint ─────────────────────────────────────────────────────────

test('GET /api/nekocore/pending — returns ok:true with pending array', async () => {
  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq(),
    res,
    makeUrl('/api/nekocore/pending'),
    BASE_HEADERS,
    readBodyFn(null)
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.pending), 'pending should be an array');
});

// ── Model-recommend endpoint ─────────────────────────────────────────────────

let _savedRecommendationId = null;

test('POST /api/nekocore/model-recommend — returns all required fields', async () => {
  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq({ targetEntityId: 'entity_alice', targetAspect: 'subconscious', reason: 'integration test' }),
    res,
    makeUrl('/api/nekocore/model-recommend'),
    BASE_HEADERS,
    readBodyFn({ targetEntityId: 'entity_alice', targetAspect: 'subconscious', reason: 'integration test' })
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(typeof data.recommendationId, 'string', 'must return a recommendationId string');
  assert.ok(data.recommendationId.length > 0, 'recommendationId must not be empty');
  assert.equal(typeof data.currentModel,   'string', 'currentModel should be a string');
  assert.equal(typeof data.suggestedModel, 'string', 'suggestedModel should be a string');
  assert.equal(typeof data.rationale,      'string', 'rationale should be a string');
  // riskNotes may be null or a string
  assert.ok(data.riskNotes === null || typeof data.riskNotes === 'string', 'riskNotes should be null or string');
  // Save ID for apply tests below
  _savedRecommendationId = data.recommendationId;
});

test('POST /api/nekocore/model-recommend — missing required fields → 400', async () => {
  const res = makeRes();
  await routes.dispatch(
    makeReq({ targetEntityId: 'entity_alice' }), // missing targetAspect
    res,
    makeUrl('/api/nekocore/model-recommend'),
    BASE_HEADERS,
    readBodyFn({ targetEntityId: 'entity_alice' })
  );
  assert.equal(res.statusCode, 400);
  const data = res.json();
  assert.equal(typeof data.error, 'string');
});

// ── Model-apply: reject ──────────────────────────────────────────────────────

test('POST /api/nekocore/model-apply approved:false — rejects pending item, no config change', async () => {
  // First ensure we have a recommendation to reject (created in previous test)
  assert.ok(_savedRecommendationId !== null, 'previous test must have set _savedRecommendationId');

  const cfgBefore = ctx._getConfig();
  const subconsciousBefore = cfgBefore.profiles?.['test-profile']?.subconscious?.model;

  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq({ recommendationId: _savedRecommendationId, approved: false }),
    res,
    makeUrl('/api/nekocore/model-apply'),
    BASE_HEADERS,
    readBodyFn({ recommendationId: _savedRecommendationId, approved: false })
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(data.decision, 'rejected');

  // Config must not have changed
  const cfgAfter = ctx._getConfig();
  const subconsciousAfter = cfgAfter.profiles?.['test-profile']?.subconscious?.model;
  assert.equal(subconsciousAfter, subconsciousBefore, 'model should not have changed after rejection');
});

// ── Model-apply: approve ─────────────────────────────────────────────────────

let _approvedRecommendationId = null;
let _savedSuggestedModel       = null;

test('POST /api/nekocore/model-recommend (second) — prepare for approval test', async () => {
  const res = makeRes();
  await routes.dispatch(
    makeReq({ targetEntityId: 'entity_bob', targetAspect: 'orchestrator', reason: 'approval test' }),
    res,
    makeUrl('/api/nekocore/model-recommend'),
    BASE_HEADERS,
    readBodyFn({ targetEntityId: 'entity_bob', targetAspect: 'orchestrator', reason: 'approval test' })
  );
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  _approvedRecommendationId = data.recommendationId;
  _savedSuggestedModel      = data.suggestedModel;
});

test('POST /api/nekocore/model-apply approved:true — applies model change to profile', async () => {
  assert.ok(_approvedRecommendationId !== null, 'second recommendation must exist');

  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq({ recommendationId: _approvedRecommendationId, approved: true }),
    res,
    makeUrl('/api/nekocore/model-apply'),
    BASE_HEADERS,
    readBodyFn({ recommendationId: _approvedRecommendationId, approved: true })
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(data.decision, 'approved');
  assert.equal(typeof data.appliedModel, 'string');

  // Config must now reflect the applied model on the orchestrator aspect
  const cfgAfter = ctx._getConfig();
  const savedModel = cfgAfter.profiles?.['test-profile']?.orchestrator?.model
    || cfgAfter.profiles?.['default-multi-llm']?.orchestrator?.model;
  assert.equal(savedModel, _savedSuggestedModel, 'applied model must match suggested model in config');
});

// ── Model-apply: unknown recommendation ID ───────────────────────────────────

test('POST /api/nekocore/model-apply unknown recommendationId → 404', async () => {
  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq({ recommendationId: 'never-existed-abc123', approved: true }),
    res,
    makeUrl('/api/nekocore/model-apply'),
    BASE_HEADERS,
    readBodyFn({ recommendationId: 'never-existed-abc123', approved: true })
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 404);
  const data = res.json();
  assert.equal(typeof data.error, 'string');
});

// ── Unhandled path returns false ─────────────────────────────────────────────

test('dispatch returns false for unknown nekocore paths', async () => {
  const res = makeRes();
  const handled = await routes.dispatch(
    makeReq(),
    res,
    makeUrl('/api/nekocore/does-not-exist'),
    BASE_HEADERS,
    readBodyFn(null)
  );
  assert.equal(handled, false);
  assert.equal(res.statusCode, null, 'no response should be written for unhandled path');
});
