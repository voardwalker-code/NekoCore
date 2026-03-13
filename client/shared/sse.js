// ============================================================
// REM System — Shared SSE Client
// Factory that manages an EventSource with auto-reconnect.
// Usage:
//   const conn = RemSSE.connect('/api/brain/events', {
//     thought:         (data) => { ... },
//     memory_created:  (data) => { ... },
//     _open:           ()     => { ... },  // special: on open
//     _error:          (err)  => { ... },  // special: on error
//   });
//   conn.close();
// ============================================================
window.RemSSE = (function () {

  /**
   * Open an SSE connection with auto-reconnect.
   * @param {string}   url        SSE endpoint
   * @param {object}   handlers   { eventName: fn(parsedData), _open: fn, _error: fn }
   * @param {object}   [options]  { reconnectDelay: 5000 }
   * @returns {{ close: function }}
   */
  function connect(url, handlers, options) {
    const opts = Object.assign({ reconnectDelay: 5000 }, options);
    let es = null;
    let closed = false;
    let reconnectTimer = null;

    function open() {
      if (closed) return;
      es = new EventSource(url);

      es.onopen = () => {
        if (handlers._open) handlers._open();
      };

      // Register named event listeners
      for (const [name, fn] of Object.entries(handlers)) {
        if (name.startsWith('_')) continue; // skip special keys
        es.addEventListener(name, (e) => {
          let data = e.data;
          try { data = JSON.parse(e.data); } catch (_) { /* keep raw string */ }
          fn(data, e);
        });
      }

      // Generic message fallback (unnamed events)
      es.onmessage = (e) => {
        if (handlers._message) {
          let data = e.data;
          try { data = JSON.parse(e.data); } catch (_) {}
          handlers._message(data, e);
        }
      };

      es.onerror = (err) => {
        if (handlers._error) handlers._error(err);
        if (es.readyState === EventSource.CLOSED) {
          es = null;
          if (!closed) {
            reconnectTimer = setTimeout(open, opts.reconnectDelay);
          }
        }
      };
    }

    open();

    return {
      close() {
        closed = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (es) { es.close(); es = null; }
      },
      /** Replace the underlying EventSource (e.g. after manual close) */
      reconnect() {
        closed = false;
        if (es) { es.close(); es = null; }
        open();
      }
    };
  }

  return { connect };
})();
