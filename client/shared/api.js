// ============================================================
// REM System — Shared API Client
// Thin named wrappers around fetch for all /api/* endpoints.
// Usage:  RemAPI.getEntities().then(d => ...)
//         RemAPI.loadEntity(id).then(...)
//         RemAPI.post('/api/custom', { foo: 'bar' })
// ============================================================
window.RemAPI = (function () {

  async function get(path) {
    const r = await fetch(path);
    return r.json();
  }

  async function post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  }

  // ── Entity endpoints ──
  const getEntities        = ()        => get('/api/entities');
  const getCurrentEntity   = ()        => get('/api/entity');
  const getCurrentEntId    = ()        => get('/api/entities/current');
  const loadEntity         = (id)      => post('/api/entities/load', { entityId: id });
  const deleteEntity       = (id)      => post('/api/entities/delete', { entityId: id });
  const healEntity         = ()        => post('/api/entities/heal', {});
  const getPersona         = ()        => get('/api/persona');
  const savePersona        = (data)    => post('/api/persona', data);

  // ── Memory endpoints ──
  const getMemories        = (limit)   => get('/api/memories' + (limit ? '?limit=' + limit : ''));
  const getMemorySummary   = (id)      => get('/api/memory/summary?id=' + encodeURIComponent(id));
  const getMemoryStats     = ()        => get('/api/memory-stats');
  const getMemoryGraph     = ()        => get('/api/memory-graph/nodes');
  const getMemoryGraphFull = ()        => get('/api/memory-graph/full-mind');
  const getLastMemory      = ()        => get('/api/entity-last-memory');

  // ── Brain / system endpoints ──
  const getBrainStatus     = ()        => get('/api/brain/status');
  const getNeurochemistry  = ()        => get('/api/neurochemistry');
  const getTraces          = ()        => get('/api/traces');
  const rebuildTraces      = ()        => post('/api/trace-rebuild', {});
  const getBeliefGraph     = ()        => get('/api/belief-graph/nodes');
  const getSomatic         = ()        => get('/api/somatic');
  const toggleSomatic      = (metric, enabled) => post('/api/somatic/toggle', { metric, enabled });
  const getSystemPrompt    = ()        => get('/api/system-prompt');
  const getSessionMeta     = ()        => get('/api/session-meta');

  // ── Config endpoints ──
  const getConfig          = ()         => get('/api/config');
  const saveConfig         = (data)     => post('/api/config', data);
  const getEntityConfig    = (entityId) => get('/api/entity-config?entityId=' + encodeURIComponent(entityId));

  // ── Shutdown ──
  const shutdown           = ()        => post('/api/shutdown', {});

  return {
    // primitives
    get, post,
    // entities
    getEntities, getCurrentEntity, getCurrentEntId,
    loadEntity, deleteEntity, healEntity, getPersona, savePersona,
    // memory
    getMemories, getMemorySummary, getMemoryStats,
    getMemoryGraph, getMemoryGraphFull, getLastMemory,
    // brain / system
    getBrainStatus, getNeurochemistry, getTraces, rebuildTraces,
    getBeliefGraph, getSomatic, toggleSomatic, getSystemPrompt, getSessionMeta,
    // config
    getConfig, saveConfig, getEntityConfig,
    // shutdown
    shutdown
  };
})();
