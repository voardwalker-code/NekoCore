// ── NekoCore Routes ───────────────────────────────────────────────────────────
// /api/nekocore/status
// /api/nekocore/pending
// /api/nekocore/model-recommend
// /api/nekocore/model-apply
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { appendAuditRecord, readAuditRecords } = require('../brain/nekocore/audit');
const { ROLE_DEFINITIONS }                    = require('../brain/nekocore/model-intelligence');
const entityPaths                             = require('../entityPaths');

// ── In-memory recommendation store ───────────────────────────────────────────
// Keyed by recommendationId. Server-restart safe is acceptable for v0.7.0.
const _pendingRecommendations = new Map();

function _shortId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// ── Route factory ─────────────────────────────────────────────────────────────

function createNekoCoreRoutes(ctx) {
  const { fs, path } = ctx;

  // ── GET /api/nekocore/status ────────────────────────────────────────────────
  function getStatus(req, res, apiHeaders) {
    try {
      const memRoot = entityPaths.getMemoryRoot('nekocore');
      const isReady = fs.existsSync(memRoot);

      let activeModel = null;
      if (isReady) {
        try {
          const registryPath = path.join(memRoot, 'model-registry.json');
          if (fs.existsSync(registryPath)) {
            // Registry exists — NekoCore is seeded
            activeModel = '(registry loaded)';
          }
        } catch (_) {}
      }

      const cfg = ctx.loadConfig ? ctx.loadConfig() : null;
      const profile = cfg?.profiles?.[cfg?.lastActive] || null;
      if (profile?.nekocore?.model) activeModel = profile.nekocore.model;

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        isSystemEntityReady: isReady,
        activeModel,
        pendingCount: _pendingRecommendations.size
      }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── GET /api/nekocore/pending ───────────────────────────────────────────────
  function getPending(req, res, apiHeaders) {
    const items = [..._pendingRecommendations.values()];
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, pending: items }));
  }

  // ── POST /api/nekocore/model-recommend ─────────────────────────────────────
  // Body: { targetEntityId, targetAspect, reason }
  // Response: { recommendationId, currentModel, suggestedModel, rationale, riskNotes }
  async function postModelRecommend(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { targetEntityId, targetAspect, reason } = body;

      if (!targetEntityId || !targetAspect) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'targetEntityId and targetAspect are required' }));
        return;
      }

      // Load current model for this aspect from global profile
      const cfg = ctx.loadConfig ? ctx.loadConfig() : null;
      const profile = cfg?.profiles?.[cfg?.lastActive] || {};
      const currentModel = profile?.[targetAspect]?.model || '(not configured)';

      // Load model registry + performance for selectModel
      const memRoot = entityPaths.getMemoryRoot('nekocore');
      let registry = null, performance = null;
      try {
        const mi = require('../brain/nekocore/model-intelligence');
        registry    = mi.getRegistry(memRoot);
        performance = mi.getPerformance(memRoot);
      } catch (_) {}

      // Suggest a model using NekoCore's intelligence
      let suggestedModel = currentModel;
      let rationale = 'No change recommended.';
      let riskNotes = null;
      let diffusionFlag = false;

      try {
        const mi = require('../brain/nekocore/model-intelligence');
        const result = mi.selectModel(targetAspect, { registry, performance, entityId: targetEntityId });
        if (result && result.modelId && result.modelId !== currentModel) {
          suggestedModel = result.modelId;
          rationale = `selectModel scored ${suggestedModel} highest for role "${targetAspect}" (${result.reason}).`;

          // Check if suggested model is a diffusion model and aspect is sensitive
          const DIFFUSION_SENSITIVE = new Set(['orchestrator', 'conscious']);
          const regModels = registry?.models || {};
          const modelEntry = regModels[suggestedModel];
          if (modelEntry?.diffusionModel && DIFFUSION_SENSITIVE.has(targetAspect)) {
            diffusionFlag = true;
            riskNotes = `${modelEntry.displayName} is a diffusion LLM. Character reformation artifacts may affect skill invocation, structured output, and persona fidelity for the "${targetAspect}" role. Consider a non-diffusion model for this aspect.`;
          } else if (modelEntry?.notes) {
            riskNotes = modelEntry.notes;
          }
        } else if (result?.modelId === currentModel) {
          rationale = `Current model "${currentModel}" is already the best fit for role "${targetAspect}" (score: ${result.score?.toFixed?.(2) || 'n/a'}).`;
        }
      } catch (_) {}

      const recommendationId = _shortId();
      const rec = {
        recommendationId,
        createdAt: new Date().toISOString(),
        requestor: req.accountId || 'unknown',
        targetEntityId,
        targetAspect,
        reason: reason || null,
        currentModel,
        suggestedModel,
        rationale,
        riskNotes,
        diffusionFlag,
        status: 'pending'
      };
      _pendingRecommendations.set(recommendationId, rec);

      appendAuditRecord({
        event: 'recommendation',
        recommendationId,
        requestor: rec.requestor,
        targetEntityId,
        targetAspect,
        beforeModel: currentModel,
        afterModel: suggestedModel,
        decision: 'pending',
        notes: reason || null,
        diffusionFlag
      });

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, ...rec }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── POST /api/nekocore/model-apply ─────────────────────────────────────────
  // Body: { recommendationId, approved: true|false }
  async function postModelApply(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { recommendationId, approved } = body;

      if (!recommendationId) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'recommendationId is required' }));
        return;
      }

      const rec = _pendingRecommendations.get(recommendationId);
      if (!rec) {
        res.writeHead(404, apiHeaders);
        res.end(JSON.stringify({ error: 'Recommendation not found or already resolved' }));
        return;
      }

      if (!approved) {
        rec.status = 'rejected';
        _pendingRecommendations.delete(recommendationId);
        appendAuditRecord({
          event: 'rejection',
          recommendationId,
          requestor: req.accountId || 'unknown',
          targetEntityId:  rec.targetEntityId,
          targetAspect:    rec.targetAspect,
          beforeModel:     rec.currentModel,
          afterModel:      null,
          decision:        'rejected',
          notes:           null,
          diffusionFlag:   rec.diffusionFlag
        });
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, decision: 'rejected', recommendationId }));
        return;
      }

      // Apply: write the suggested model into the global profile for the target aspect
      const globalCfg = ctx.loadConfig();
      if (!globalCfg.profiles) globalCfg.profiles = {};
      if (!globalCfg.lastActive) globalCfg.lastActive = 'default-multi-llm';
      if (!globalCfg.profiles[globalCfg.lastActive]) globalCfg.profiles[globalCfg.lastActive] = {};

      const targetProfile = globalCfg.profiles[globalCfg.lastActive];
      const existing = targetProfile[rec.targetAspect] || {};
      targetProfile[rec.targetAspect] = { ...existing, model: rec.suggestedModel };
      ctx.saveConfig(globalCfg);

      rec.status = 'approved';
      _pendingRecommendations.delete(recommendationId);

      appendAuditRecord({
        event: 'approval',
        recommendationId,
        requestor: req.accountId || 'unknown',
        targetEntityId:  rec.targetEntityId,
        targetAspect:    rec.targetAspect,
        beforeModel:     rec.currentModel,
        afterModel:      rec.suggestedModel,
        decision:        'approved',
        notes:           null,
        diffusionFlag:   rec.diffusionFlag
      });

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        decision: 'approved',
        recommendationId,
        targetAspect: rec.targetAspect,
        appliedModel: rec.suggestedModel
      }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── POST /api/nekocore/chat ────────────────────────────────────────────────
  // Dedicated chat with the NekoCore system entity — no checkout required.
  // Body: { message, chatHistory? }
  async function postChat(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { message, chatHistory } = body;
      if (!message || !String(message).trim()) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Missing message' }));
        return;
      }
      const result = await ctx.processNekoCoreChatMessage(
        String(message).trim(),
        Array.isArray(chatHistory) ? chatHistory : []
      );
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, response: result.response }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── Dispatcher ────────────────────────────────────────────────────────────
  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/nekocore/status'          && m === 'GET')  { getStatus(req, res, apiHeaders); return true; }
    if (p === '/api/nekocore/pending'         && m === 'GET')  { getPending(req, res, apiHeaders); return true; }
    if (p === '/api/nekocore/model-recommend' && m === 'POST') { await postModelRecommend(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/nekocore/model-apply'     && m === 'POST') { await postModelApply(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/nekocore/chat'            && m === 'POST') { await postChat(req, res, apiHeaders, readBody); return true; }

    return false;
  }

  return { dispatch };
}

module.exports = createNekoCoreRoutes;
