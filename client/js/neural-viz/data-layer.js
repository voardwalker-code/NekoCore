/**
 * neural-viz/data-layer.js
 *
 * Injects the real connectSSE() implementation into the renderer module
 * (window._NVR), which is created by renderer.js.
 *
 * This file must be loaded AFTER renderer.js and BEFORE index.js.
 */
(function () {
  var R = window._NVR;
  if (!R) { console.error('Neural Viz data-layer: renderer not loaded'); return; }

  R.connectSSE = function connectSSE() {
    var existing = R._getEventSource();
    if (existing) existing.close();

    // Fetch initial neurochemistry state
    fetch('/api/neurochemistry').then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok && data.chemicals) R.setNeurochemState(data.chemicals);
    }).catch(function () {});

    try {
      var es = new EventSource('/api/brain/events');
      R._setEventSource(es);

      es.addEventListener('thought', function (e) {
        try { R.handleBrainEvent(JSON.parse(e.data)); } catch (_) {}
      });

      es.addEventListener('memory_accessed', function (e) {
        try {
          var d = JSON.parse(e.data);
          if (d.memory_id) {
            R.flashNode(d.memory_id, R._colors.nodeHot, 1.0);
            R.selectNodeById(d.memory_id);
          }
        } catch (_) {}
      });

      es.addEventListener('memory_created', function (e) {
        try {
          var d = JSON.parse(e.data);
          if (d.memory_id) R.debouncedGraphReload(d.memory_id);
        } catch (_) {}
      });

      es.addEventListener('brain_deep_sleep_complete', function (e) {
        try { setTimeout(function () { R.reloadBeliefData(); }, 500); } catch (_) {}
      });

      es.addEventListener('message', function (e) {
        try {
          var d = JSON.parse(e.data);
          if (d.type) R.handleBrainEvent(d);
        } catch (_) {}
      });

      es.onerror = function () {
        // SSE auto-reconnects on its own; no action needed.
      };
    } catch (err) {
      console.warn('Neural Viz: SSE connection failed', err);
    }
  };
})();
