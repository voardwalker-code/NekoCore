/**
 * notify — lightweight floating toast notifications.
 *
 * window.notify.show(msg, type?, duration?)  — show a toast
 * window.notify.ok(msg)                      — green success toast
 * window.notify.error(msg)                   — red error toast
 * window.notify.info(msg)                    — blue info toast
 * window.notify.warn(msg)                    — orange warning toast
 *
 * Types: 'ok' | 'error' | 'info' | 'warn'
 * Default duration: 3000ms
 */
window.notify = (function () {
  let _container = null;

  function _getContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'rem-notify-container';
    Object.assign(_container.style, {
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      zIndex: '99999',
      display: 'flex',
      flexDirection: 'column',
      gap: '.5rem',
      alignItems: 'flex-end',
      pointerEvents: 'none'
    });
    document.body.appendChild(_container);
    return _container;
  }

  const TYPE_STYLES = {
    ok:    { bg: '#1a3d2a', border: '#22c55e', color: '#86efac' },
    error: { bg: '#3d1a1a', border: '#ef4444', color: '#fca5a5' },
    info:  { bg: '#1a2c3d', border: '#3b82f6', color: '#93c5fd' },
    warn:  { bg: '#3d2e1a', border: '#f59e0b', color: '#fcd34d' }
  };

  function show(msg, type, duration) {
    type = type || 'info';
    duration = (duration == null) ? 3000 : duration;

    const styles = TYPE_STYLES[type] || TYPE_STYLES.info;
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      background: styles.bg,
      border: '1px solid ' + styles.border,
      color: styles.color,
      padding: '.5rem 1rem',
      borderRadius: '6px',
      fontSize: '.8rem',
      fontFamily: 'var(--font-mono, monospace)',
      maxWidth: '320px',
      wordBreak: 'break-word',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity .2s ease',
      cursor: 'pointer'
    });
    toast.textContent = msg;

    const container = _getContainer();
    container.appendChild(toast);

    // Fade in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { toast.style.opacity = '1'; });
    });

    // Click to dismiss early
    toast.addEventListener('click', function () { _dismiss(toast); });

    if (duration > 0) {
      setTimeout(function () { _dismiss(toast); }, duration);
    }
  }

  function _dismiss(toast) {
    toast.style.opacity = '0';
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
  }

  return {
    show: show,
    ok:   function (msg, dur) { show(msg, 'ok',    dur); },
    error: function (msg, dur) { show(msg, 'error', dur); },
    info:  function (msg, dur) { show(msg, 'info',  dur); },
    warn:  function (msg, dur) { show(msg, 'warn',  dur); }
  };
})();
