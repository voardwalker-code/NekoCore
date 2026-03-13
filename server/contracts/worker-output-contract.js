'use strict';
/**
 * server/contracts/worker-output-contract.js
 * Phase D — Worker Subsystem Pilot
 *
 * Contract validation and normalisation for worker entity output payloads.
 * Workers operating in subsystem mode must produce this shape so the host
 * orchestrator can consume their contribution safely.
 *
 * Required fields:
 *   summary    {string}          – Non-empty prose contribution for the aspect.
 *   signals    {object|array}    – Structured signals/intent hints for the orchestrator.
 *   confidence {number 0-1}      – Self-assessed confidence in the output quality.
 *
 * Optional fields:
 *   memoryRefs {string[]}        – Memory IDs the worker referenced.
 *   nextHints  {string[]}        – Follow-up suggestions for subsequent turns.
 */

/**
 * Validate a raw worker output payload.
 *
 * @param {*} payload
 * @returns {{ ok: boolean, reason: string|null, value: object|null }}
 */
function validateWorkerOutput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'payload-not-object', value: null };
  }

  if (typeof payload.summary !== 'string' || payload.summary.trim() === '') {
    return { ok: false, reason: 'summary-missing-or-empty', value: null };
  }

  if (payload.signals === null || payload.signals === undefined) {
    return { ok: false, reason: 'signals-missing', value: null };
  }
  if (typeof payload.signals !== 'object') {
    return { ok: false, reason: 'signals-invalid-type', value: null };
  }

  const confidence = Number(payload.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, reason: 'confidence-out-of-range', value: null };
  }

  if (payload.memoryRefs !== undefined && !Array.isArray(payload.memoryRefs)) {
    return { ok: false, reason: 'memoryRefs-not-array', value: null };
  }

  if (payload.nextHints !== undefined && !Array.isArray(payload.nextHints)) {
    return { ok: false, reason: 'nextHints-not-array', value: null };
  }

  return { ok: true, reason: null, value: normalizeWorkerOutput(payload) };
}

/**
 * Coerce and fill defaults for a worker output payload.
 * Does not validate — call validateWorkerOutput first.
 *
 * @param {*} payload
 * @returns {object}
 */
function normalizeWorkerOutput(payload) {
  if (!payload || typeof payload !== 'object') {
    return { summary: '', signals: {}, confidence: 0, memoryRefs: [], nextHints: [] };
  }
  return {
    summary: String(payload.summary || '').trim(),
    signals: (payload.signals && typeof payload.signals === 'object') ? payload.signals : {},
    confidence: Math.min(1, Math.max(0, Number(payload.confidence) || 0)),
    memoryRefs: Array.isArray(payload.memoryRefs) ? payload.memoryRefs : [],
    nextHints: Array.isArray(payload.nextHints) ? payload.nextHints : []
  };
}

module.exports = { validateWorkerOutput, normalizeWorkerOutput };
