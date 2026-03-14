'use strict';

/**
 * NekoCore Browser Host — History Store
 *
 * Persists browsing history to disk as JSON.
 * Each entry: { id, url, title, visitedAt }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HISTORY_FILE = path.join(__dirname, '..', 'server', 'data', 'browser-history.json');
const MAX_ENTRIES = 500;

let _entries = [];
let _loaded = false;

function _load() {
  if (_loaded) return;
  _loaded = true;
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      _entries = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch { _entries = []; }
}

function _save() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(_entries, null, 2));
  } catch { /* best effort */ }
}

function addEntry(url, title) {
  _load();
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    url,
    title: title || url,
    visitedAt: Date.now(),
  };
  _entries.unshift(entry);
  if (_entries.length > MAX_ENTRIES) _entries.length = MAX_ENTRIES;
  _save();
  return entry;
}

function getAll() {
  _load();
  return _entries;
}

function search(query) {
  _load();
  const q = (query || '').toLowerCase();
  if (!q) return _entries;
  return _entries.filter(e => e.url.toLowerCase().includes(q) || (e.title || '').toLowerCase().includes(q));
}

function clear() {
  _entries = [];
  _save();
}

function reset() { _entries = []; _loaded = false; }

module.exports = { addEntry, getAll, search, clear, reset };
