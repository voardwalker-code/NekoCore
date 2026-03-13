'use strict';
/**
 * server/brain/core/worker-dispatcher.js
 * Phase D — Worker Subsystem Pilot
 *
 * Invokes a bound worker entity as a subsystem contributor.
 * All failures are silent (no throws) — logs a warning and returns null
 * so the caller can fall back to the native aspect contributor.
 *
 * D5 diagnostics are emitted here:
 *   worker_invoked  { aspectKey, entityId, inputSize }
 *   worker_success  { aspectKey, entityId, confidence }
 *   worker_fallback { aspectKey, entityId, reason }
 */

const { validateWorkerOutput } = require('../../contracts/worker-output-contract');
const { enforceLatencyGuard } = require('./orchestration-policy');

// ---------------------------------------------------------------------------
// Subsystem prompt template
// ---------------------------------------------------------------------------

const SUBSYSTEM_SYSTEM_PROMPT =
  'You are a subsystem contributor operating in hidden system mode for the host entity. ' +
  'Your role is to provide structured cognitive input for one aspect of the orchestration pipeline. ' +
  'Respond ONLY with a raw JSON object — no prose, no markdown, no code fences. ' +
  'Required fields: summary (string, non-empty), signals (object), confidence (number 0–1). ' +
  'Optional fields: memoryRefs (array of strings), nextHints (array of strings).';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWorkerMessage(input) {
  const parts = [
    `Aspect role: ${String(input.role || 'contributor')}`,
    `User message: "${String(input.userMessage || '')}"`
  ];
  if (input.turnSignals && typeof input.turnSignals === 'object') {
    parts.push(`Turn signals: ${JSON.stringify(input.turnSignals)}`);
  }
  return parts.join('\n');
}

function tryParseJSON(text) {
  const s = String(text || '').trim();
  // Strip optional markdown code fence
  const stripped = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {
    // Last resort: extract first {...} block
    const match = s.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  }
}

function emitBus(bus, eventType, payload) {
  if (!bus || typeof bus.emit !== 'function') return;
  try {
    bus.emit('thought', { type: eventType, ...payload, ts: Date.now() });
  } catch (_) {
    // bus errors must never propagate
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Invoke a worker entity as a subsystem contributor.
 *
 * @param {{ entityId: string, mode: string, runtime: object }} workerBinding
 * @param {{ role: string, userMessage: string, [turnSignals]: object }} input
 * @param {Function} callLLM  - async (runtime, messages, opts) => any
 * @param {{ timeoutMs?: number, bus?: object }} [opts]
 * @returns {Promise<{ summary, signals, confidence, memoryRefs, nextHints }|null>}
 */
async function invokeWorker(workerBinding, input, callLLM, opts = {}) {
  const { timeoutMs = 15000, bus = null } = opts;
  const { entityId, runtime } = workerBinding;
  const aspectKey = String(input.role || 'unknown');

  // Pre-flight checks
  if (!runtime) {
    emitBus(bus, 'worker_fallback', { aspectKey, entityId, reason: 'no-runtime' });
    return null;
  }
  if (typeof callLLM !== 'function') {
    emitBus(bus, 'worker_fallback', { aspectKey, entityId, reason: 'no-callLLM' });
    return null;
  }

  emitBus(bus, 'worker_invoked', {
    aspectKey,
    entityId,
    inputSize: String(input.userMessage || '').length
  });

  const messages = [
    { role: 'system', content: SUBSYSTEM_SYSTEM_PROMPT },
    { role: 'user', content: buildWorkerMessage(input) }
  ];

  // Call with latency ceiling
  let rawResult;
  try {
    rawResult = await enforceLatencyGuard(
      () => callLLM(runtime, messages, { temperature: 0.4, maxTokens: 512, returnUsage: false }),
      timeoutMs
    );
  } catch (err) {
    const reason = err && err.timedOut ? 'timeout' : 'llm-error';
    console.warn(
      `  ⚠ Worker ${entityId} [${aspectKey}] failed: ${reason}` +
      (err?.message ? ` — ${err.message}` : '')
    );
    emitBus(bus, 'worker_fallback', { aspectKey, entityId, reason });
    return null;
  }

  // Extract text
  const text = (rawResult && typeof rawResult === 'object' && rawResult.content !== undefined)
    ? rawResult.content
    : rawResult;

  // Parse and validate
  const parsed = tryParseJSON(String(text || ''));
  const validation = validateWorkerOutput(parsed);

  if (!validation.ok) {
    console.warn(`  ⚠ Worker ${entityId} [${aspectKey}] output invalid: ${validation.reason}`);
    emitBus(bus, 'worker_fallback', { aspectKey, entityId, reason: `invalid-contract-${validation.reason}` });
    return null;
  }

  emitBus(bus, 'worker_success', {
    aspectKey,
    entityId,
    confidence: validation.value.confidence
  });

  return validation.value;
}

module.exports = { invokeWorker };
