/**
 * EntitySelect — shared entity loading/switching module.
 *
 * window.EntitySelect.load(dropdownEl?)  → Promise<entity[]>  populates optional <select>
 * window.EntitySelect.select(id)         → Promise<entity>    loads entity via API, fires listeners
 * window.EntitySelect.onChanged(fn)      → registers callback fired with (entity) on switch
 * window.EntitySelect.getCurrentId()     → string|null        returns currently loaded entity id
 * window.EntitySelect.getCurrentEntity() → object|null        returns full entity object (if loaded via this module)
 */
window.EntitySelect = (function () {
  let _entityId = null;
  let _entity = null;
  const _listeners = [];

  function _notify(entity) {
    _listeners.forEach(function (fn) { try { fn(entity); } catch (_) {} });
  }

  /**
   * Fetch entity list. If dropdownEl provided, populate it as a <select>.
   * Returns the entity array.
   */
  async function load(dropdownEl) {
    const resp = await fetch('/api/entities');
    if (!resp.ok) throw new Error('Failed to fetch entities (' + resp.status + ')');
    const data = await resp.json();
    const entities = data.entities || [];

    if (dropdownEl) {
      dropdownEl.innerHTML = '';
      entities.forEach(function (e) {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name || e.id;
        if (e.id === _entityId) opt.selected = true;
        dropdownEl.appendChild(opt);
      });
    }

    return entities;
  }

  /**
   * Load a specific entity by ID. Updates internal state and fires onChange listeners.
   * Returns the entity object.
   */
  async function select(id) {
    const resp = await fetch('/api/entities/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: id })
    });
    if (!resp.ok) throw new Error('Failed to load entity (' + resp.status + ')');
    const data = await resp.json();
    _entityId = id;
    _entity = data.entity || null;
    _notify(_entity);
    return _entity;
  }

  /** Register a callback to be called whenever the active entity changes. */
  function onChanged(fn) {
    _listeners.push(fn);
  }

  /** Returns the id of the currently loaded entity, or null. */
  function getCurrentId() {
    // Respect app.js global if EntitySelect.select() hasn't been called yet.
    return _entityId || (typeof window.currentEntityId !== 'undefined' ? window.currentEntityId : null);
  }

  /** Returns the full entity object if loaded via this module, or null. */
  function getCurrentEntity() {
    return _entity;
  }

  return { load, select, onChanged, getCurrentId, getCurrentEntity };
})();
