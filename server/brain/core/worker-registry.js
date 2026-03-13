'use strict';
/**
 * server/brain/core/worker-registry.js
 * Phase D — Worker Subsystem Pilot
 *
 * In-memory registry mapping aspect keys to worker entity bindings.
 * Not persisted — rebuilt at runtime from config injection.
 *
 * Aspect keys: 'subconscious', 'conscious', 'dream'
 * Binding shape: { entityId: string, mode: 'subsystem', runtime: object|null }
 */

const _registry = new Map();

/**
 * Bind a worker entity to an aspect key.
 *
 * @param {string} aspectKey  - e.g. 'subconscious', 'conscious', 'dream'
 * @param {string} entityId   - The worker entity's id string
 * @param {object|null} [runtime] - LLM runtime config for the worker (required for dispatch)
 */
function registerWorker(aspectKey, entityId, runtime = null) {
  if (!aspectKey || typeof aspectKey !== 'string') return;
  if (!entityId || typeof entityId !== 'string') return;
  _registry.set(aspectKey, { entityId, mode: 'subsystem', runtime: runtime || null });
}

/**
 * Remove a worker binding for an aspect key.
 *
 * @param {string} aspectKey
 */
function unregisterWorker(aspectKey) {
  _registry.delete(String(aspectKey));
}

/**
 * Look up the worker binding for an aspect key.
 * Returns null if no worker is registered for that key.
 *
 * @param {string} aspectKey
 * @returns {{ entityId: string, mode: string, runtime: object|null }|null}
 */
function getWorker(aspectKey) {
  return _registry.get(String(aspectKey)) || null;
}

/**
 * List all registered workers.
 *
 * @returns {Array<{ aspectKey: string, entityId: string, mode: string, runtime: object|null }>}
 */
function listWorkers() {
  return Array.from(_registry.entries()).map(([key, binding]) => ({
    aspectKey: key,
    ...binding
  }));
}

/**
 * Clear all registered workers.
 * Useful for test isolation.
 */
function clearRegistry() {
  _registry.clear();
}

module.exports = { registerWorker, unregisterWorker, getWorker, listWorkers, clearRegistry };
