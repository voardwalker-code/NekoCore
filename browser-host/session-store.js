'use strict';

/**
 * NekoCore Browser Host — Session Store
 *
 * Persists open tabs to disk for crash-safe session restore.
 * Format: { tabs: [{ tabId, url, title, index }], activeTabId, savedAt }
 */

const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '..', 'server', 'data', 'browser-session.json');

function save(tabs, activeTabId) {
  const snapshot = {
    tabs: tabs.map(t => ({ tabId: t.tabId, url: t.url, title: t.title, index: t.index })),
    activeTabId,
    savedAt: Date.now(),
  };
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(snapshot, null, 2));
  } catch { /* best effort */ }
  return snapshot;
}

function load() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

function clear() {
  try { if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE); } catch { /* ok */ }
}

module.exports = { save, load, clear };
