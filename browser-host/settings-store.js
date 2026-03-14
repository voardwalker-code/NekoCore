'use strict';

/**
 * NekoCore Browser Host — Settings Store
 *
 * Persists browser settings to disk as JSON.
 * Settings: homepage, searchEngine, sessionRestore, externalLinkBehavior.
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'server', 'data', 'browser-settings.json');

const DEFAULTS = {
  homepage: 'https://neko-core.com',
  searchEngine: 'google',
  sessionRestore: true,
  externalLinkBehavior: 'in-app',
};

let _settings = null;

function _load() {
  if (_settings) return;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      _settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
      return;
    }
  } catch { /* ignore corrupt file */ }
  _settings = { ...DEFAULTS };
}

function _save() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(_settings, null, 2));
  } catch { /* best effort */ }
}

function getAll() {
  _load();
  return { ..._settings };
}

function get(key) {
  _load();
  return _settings[key] !== undefined ? _settings[key] : DEFAULTS[key];
}

function update(partial) {
  _load();
  const allowed = Object.keys(DEFAULTS);
  for (const [key, value] of Object.entries(partial)) {
    if (allowed.includes(key)) _settings[key] = value;
  }
  _save();
  return { ..._settings };
}

function reset() {
  _settings = { ...DEFAULTS };
  _save();
  return { ..._settings };
}

module.exports = { getAll, get, update, reset, DEFAULTS };
