'use strict';

/**
 * NekoCore Browser Host — Tab Model (NB-2-3)
 *
 * Owns: tab create/switch/close with deterministic active-tab logic.
 * Emits: browser.tab.lifecycle events via the browser event bus.
 * Must NOT contain: REM memory writes, route handlers.
 */

const crypto = require('crypto');
const eventBus = require('./event-bus');

/** @type {Map<string, object>} tabId → tab state */
const tabs = new Map();
let activeTabId = null;
let tabOrder = []; // ordered tab id list

function _makeTabId() {
  return 'tab_' + crypto.randomBytes(6).toString('hex');
}

function createTab({ openerTabId, makeActive = true } = {}) {
  const tabId = _makeTabId();
  const tab = {
    tabId,
    index: tabOrder.length,
    url: 'about:blank',
    title: 'New Tab',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    lastEventAt: Date.now(),
  };
  tabs.set(tabId, tab);
  tabOrder.push(tabId);
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_created', url: tab.url, title: tab.title });
  if (makeActive || tabs.size === 1) {
    activateTab(tabId);
  }
  return tab;
}

function activateTab(tabId) {
  if (!tabs.has(tabId)) return null;
  activeTabId = tabId;
  const tab = tabs.get(tabId);
  tab.lastEventAt = Date.now();
  return tab;
}

function closeTab(tabId) {
  if (!tabs.has(tabId)) return null;
  tabs.delete(tabId);
  const idx = tabOrder.indexOf(tabId);
  if (idx !== -1) tabOrder.splice(idx, 1);
  eventBus.emit('browser.tab.lifecycle', { tabId, state: 'tab_closed' });

  // Deterministic active-tab fallback: next → previous → none
  if (activeTabId === tabId) {
    if (tabOrder.length === 0) {
      activeTabId = null;
    } else if (idx < tabOrder.length) {
      activeTabId = tabOrder[idx]; // next
    } else {
      activeTabId = tabOrder[tabOrder.length - 1]; // previous
    }
  }
  // Re-index
  tabOrder.forEach((id, i) => { tabs.get(id).index = i; });
  return activeTabId;
}

function getTab(tabId) {
  return tabs.get(tabId) || null;
}

function getActiveTab() {
  return activeTabId ? tabs.get(activeTabId) || null : null;
}

function getActiveTabId() {
  return activeTabId;
}

function getAllTabs() {
  return tabOrder.map(id => tabs.get(id));
}

function getTabCount() {
  return tabs.size;
}

/** Update tab fields after navigation events. */
function updateTabState(tabId, fields) {
  const tab = tabs.get(tabId);
  if (!tab) return null;
  Object.assign(tab, fields, { lastEventAt: Date.now() });
  return tab;
}

/** Reset all state (for testing). */
function reset() {
  tabs.clear();
  tabOrder = [];
  activeTabId = null;
}

module.exports = {
  createTab, activateTab, closeTab,
  getTab, getActiveTab, getActiveTabId, getAllTabs, getTabCount,
  updateTabState, reset,
};
