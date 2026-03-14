'use strict';

/**
 * NekoCore Browser — Research Session Store (NB-6 LLM Mode Foundation)
 *
 * Manages ephemeral research sessions that are separate from normal entity chat.
 * Each session tracks: extracted pages, Q&A exchanges, structured extractions,
 * and optionally saves selected items to entity memory on user confirmation.
 *
 * Persistence: server/data/browser-research-sessions.json
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'browser-research-sessions.json');
const MAX_SESSIONS = 20;
const MAX_MESSAGES_PER_SESSION = 100;

// ── In-memory state ──────────────────────────────────────────
let sessions = {};   // sessionId → session object
let activeSessionId = null;

function _ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function _load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      sessions = raw.sessions || {};
      activeSessionId = raw.activeSessionId || null;
    }
  } catch { sessions = {}; activeSessionId = null; }
}

function _save() {
  _ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ sessions, activeSessionId }, null, 2), 'utf8');
}

_load();

// ── Session CRUD ─────────────────────────────────────────────

function createSession(title) {
  const id = 'rs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  sessions[id] = {
    id,
    title: title || 'Research Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pages: [],       // { url, title, extractedText, extractedAt }
    messages: [],    // { role: 'user'|'assistant', content, citations?, timestamp }
    extractions: [], // { type: 'summary'|'tables'|'entities'|'links'|'outline', data, pageUrl, timestamp }
    saved: false,    // Whether any items have been saved to entity memory
  };
  // Enforce max sessions (evict oldest)
  const ids = Object.keys(sessions).sort((a, b) => sessions[a].createdAt - sessions[b].createdAt);
  while (ids.length > MAX_SESSIONS) {
    const evict = ids.shift();
    delete sessions[evict];
  }
  activeSessionId = id;
  _save();
  return sessions[id];
}

function getSession(id) {
  return sessions[id] || null;
}

function getActiveSession() {
  if (!activeSessionId || !sessions[activeSessionId]) return null;
  return sessions[activeSessionId];
}

function setActiveSession(id) {
  if (!sessions[id]) return null;
  activeSessionId = id;
  _save();
  return sessions[id];
}

function listSessions() {
  return Object.values(sessions)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(s => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      pageCount: s.pages.length,
      messageCount: s.messages.length,
    }));
}

function deleteSession(id) {
  if (!sessions[id]) return false;
  delete sessions[id];
  if (activeSessionId === id) activeSessionId = null;
  _save();
  return true;
}

function clearSessions() {
  sessions = {};
  activeSessionId = null;
  _save();
}

// ── Page tracking ────────────────────────────────────────────

function addPage(sessionId, page) {
  const s = sessions[sessionId];
  if (!s) return null;
  const entry = {
    url: page.url,
    title: page.title || page.url,
    extractedText: page.extractedText || '',
    extractedAt: Date.now(),
  };
  // Don't duplicate same URL
  const existing = s.pages.findIndex(p => p.url === page.url);
  if (existing >= 0) {
    s.pages[existing] = entry;
  } else {
    s.pages.push(entry);
  }
  s.updatedAt = Date.now();
  _save();
  return entry;
}

// ── Chat messages ────────────────────────────────────────────

function addMessage(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return null;
  const entry = {
    role: msg.role,
    content: msg.content,
    citations: msg.citations || null,
    timestamp: Date.now(),
  };
  s.messages.push(entry);
  if (s.messages.length > MAX_MESSAGES_PER_SESSION) {
    s.messages = s.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  s.updatedAt = Date.now();
  _save();
  return entry;
}

function getMessages(sessionId) {
  const s = sessions[sessionId];
  return s ? s.messages : [];
}

// ── Structured extractions ───────────────────────────────────

function addExtraction(sessionId, extraction) {
  const s = sessions[sessionId];
  if (!s) return null;
  const entry = {
    type: extraction.type,
    data: extraction.data,
    pageUrl: extraction.pageUrl || '',
    timestamp: Date.now(),
  };
  s.extractions.push(entry);
  s.updatedAt = Date.now();
  _save();
  return entry;
}

// ── Mark as saved to memory ──────────────────────────────────

function markSaved(sessionId) {
  const s = sessions[sessionId];
  if (!s) return false;
  s.saved = true;
  s.updatedAt = Date.now();
  _save();
  return true;
}

// ── Reset ────────────────────────────────────────────────────

function reset() {
  sessions = {};
  activeSessionId = null;
  try { fs.unlinkSync(DATA_FILE); } catch { /* ok */ }
}

module.exports = {
  createSession,
  getSession,
  getActiveSession,
  setActiveSession,
  listSessions,
  deleteSession,
  clearSessions,
  addPage,
  addMessage,
  getMessages,
  addExtraction,
  markSaved,
  reset,
};
