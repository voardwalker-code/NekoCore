'use strict';

/**
 * NekoCore Browser Host — Bookmark Store
 *
 * Persists bookmarks to disk as JSON.
 * Each entry: { id, url, title, addedAt, folder }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOOKMARKS_FILE = path.join(__dirname, '..', 'server', 'data', 'browser-bookmarks.json');

let _bookmarks = [];
let _loaded = false;

function _load() {
  if (_loaded) return;
  _loaded = true;
  try {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      _bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8'));
    }
  } catch { _bookmarks = []; }
}

function _save() {
  try {
    fs.mkdirSync(path.dirname(BOOKMARKS_FILE), { recursive: true });
    fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(_bookmarks, null, 2));
  } catch { /* best effort */ }
}

function add(url, title, folder) {
  _load();
  // Don't duplicate
  const existing = _bookmarks.find(b => b.url === url);
  if (existing) return existing;
  const bm = {
    id: crypto.randomBytes(6).toString('hex'),
    url,
    title: title || url,
    folder: folder || 'default',
    addedAt: Date.now(),
  };
  _bookmarks.unshift(bm);
  _save();
  return bm;
}

function remove(id) {
  _load();
  const idx = _bookmarks.findIndex(b => b.id === id);
  if (idx === -1) return false;
  _bookmarks.splice(idx, 1);
  _save();
  return true;
}

function removeByUrl(url) {
  _load();
  const idx = _bookmarks.findIndex(b => b.url === url);
  if (idx === -1) return false;
  _bookmarks.splice(idx, 1);
  _save();
  return true;
}

function isBookmarked(url) {
  _load();
  return _bookmarks.some(b => b.url === url);
}

function getAll() {
  _load();
  return _bookmarks;
}

function reset() { _bookmarks = []; _loaded = false; }

module.exports = { add, remove, removeByUrl, isBookmarked, getAll, reset };
