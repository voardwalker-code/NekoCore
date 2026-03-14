'use strict';

/**
 * NekoCore Browser Host — Navigation Controller (NB-2-2)
 *
 * Owns: URL navigate, back, forward, refresh on active tab.
 * Emits: browser.navigation.state events via the browser event bus.
 * Must NOT contain: REM memory writes, route handlers.
 */

const eventBus = require('./event-bus');
const tabModel = require('./tab-model');

/** Per-tab navigation history stacks. */
const _backStack = new Map();   // tabId → string[]
const _forwardStack = new Map(); // tabId → string[]

function _ensureStacks(tabId) {
  if (!_backStack.has(tabId)) _backStack.set(tabId, []);
  if (!_forwardStack.has(tabId)) _forwardStack.set(tabId, []);
}

function _emitNavState(tabId) {
  const tab = tabModel.getTab(tabId);
  if (!tab) return;
  _ensureStacks(tabId);
  const back = _backStack.get(tabId);
  const fwd = _forwardStack.get(tabId);
  const payload = {
    tabId,
    url: tab.url,
    loading: tab.loading,
    canGoBack: back.length > 0,
    canGoForward: fwd.length > 0,
  };
  tabModel.updateTabState(tabId, { canGoBack: payload.canGoBack, canGoForward: payload.canGoForward });
  eventBus.emit('browser.navigation.state', payload);
}

/**
 * Navigate a tab to a URL.
 * Returns { ok, tabId, url } or { ok: false, code, message }.
 */
function navigate(tabId, url) {
  const tab = tabModel.getTab(tabId);
  if (!tab) {
    const err = { ok: false, code: 'TAB_NOT_FOUND', message: `Tab ${tabId} does not exist` };
    eventBus.emit('browser.navigation.state', { tabId, url, loading: false, canGoBack: false, canGoForward: false, error: err });
    return err;
  }

  // Validate URL
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'about:'].includes(parsed.protocol)) {
      const err = { ok: false, code: 'INVALID_PROTOCOL', message: `Unsupported protocol: ${parsed.protocol}` };
      eventBus.emit('browser.navigation.state', { tabId, url, loading: false, canGoBack: false, canGoForward: false, error: err });
      return err;
    }
  } catch {
    const err = { ok: false, code: 'INVALID_URL', message: `Invalid URL: ${url}` };
    eventBus.emit('browser.navigation.state', { tabId, url, loading: false, canGoBack: false, canGoForward: false, error: err });
    return err;
  }

  _ensureStacks(tabId);
  // Push current URL to back stack (if not about:blank start)
  if (tab.url && tab.url !== 'about:blank') {
    _backStack.get(tabId).push(tab.url);
  }
  // Clear forward stack on new navigation
  _forwardStack.set(tabId, []);

  // Begin navigation
  tabModel.updateTabState(tabId, { loading: true });
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_navigating', url });

  // Simulate navigation completion (real engine integration replaces this)
  tabModel.updateTabState(tabId, { url, loading: false, title: url });
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_ready', url, title: url });

  _emitNavState(tabId);
  return { ok: true, tabId, url };
}

function goBack(tabId) {
  _ensureStacks(tabId);
  const back = _backStack.get(tabId);
  if (back.length === 0) {
    return { ok: false, code: 'NO_BACK_HISTORY', message: 'No back history available' };
  }
  const tab = tabModel.getTab(tabId);
  if (!tab) return { ok: false, code: 'TAB_NOT_FOUND', message: `Tab ${tabId} does not exist` };

  _forwardStack.get(tabId).push(tab.url);
  const prevUrl = back.pop();
  tabModel.updateTabState(tabId, { url: prevUrl, title: prevUrl, loading: false });
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_ready', url: prevUrl });
  _emitNavState(tabId);
  return { ok: true, tabId, url: prevUrl };
}

function goForward(tabId) {
  _ensureStacks(tabId);
  const fwd = _forwardStack.get(tabId);
  if (fwd.length === 0) {
    return { ok: false, code: 'NO_FORWARD_HISTORY', message: 'No forward history available' };
  }
  const tab = tabModel.getTab(tabId);
  if (!tab) return { ok: false, code: 'TAB_NOT_FOUND', message: `Tab ${tabId} does not exist` };

  _backStack.get(tabId).push(tab.url);
  const nextUrl = fwd.pop();
  tabModel.updateTabState(tabId, { url: nextUrl, title: nextUrl, loading: false });
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_ready', url: nextUrl });
  _emitNavState(tabId);
  return { ok: true, tabId, url: nextUrl };
}

function reload(tabId, { hard = false } = {}) {
  const tab = tabModel.getTab(tabId);
  if (!tab) return { ok: false, code: 'TAB_NOT_FOUND', message: `Tab ${tabId} does not exist` };

  tabModel.updateTabState(tabId, { loading: true });
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_navigating', url: tab.url });

  // Simulate reload completion
  tabModel.updateTabState(tabId, { loading: false });
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_ready', url: tab.url, title: tab.title });

  _emitNavState(tabId);
  return { ok: true, tabId, url: tab.url, hard };
}

/** Reset navigation stacks (for testing). */
function reset() {
  _backStack.clear();
  _forwardStack.clear();
}

module.exports = { navigate, goBack, goForward, reload, reset };
