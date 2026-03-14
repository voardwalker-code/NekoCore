/**
 * NekoCore Browser — Client Core (NB-6 LLM Mode Foundation)
 *
 * Multi-tab browser with address bar, history, bookmarks, downloads panel,
 * session restore, web search, settings integration, shell status reporting,
 * launch routing, iframe fallback handling, bookmark manager, history manager,
 * keyboard shortcuts, tab context menu, and import/export.
 *
 * Owns: browser shell UI state and user interaction wiring.
 * Must NOT contain: filesystem logic, host process management, or backend policy.
 */

/* global showNotification, openWindow, switchMainTab */

// ─── Constants ────────────────────────────────────────────────────────────────
let BROWSER_HOMEPAGE = 'https://neko-core.com';
const BROWSER_SEARCH_HISTORY_KEY = 'rem-browser-search-history-v1';
const BROWSER_SETTINGS_KEY = 'rem-browser-settings-v1';
const BROWSER_TRENDING_QUERIES = [
  'latest AI tools', 'javascript window resize observer',
  'memory consolidation research', 'chrome app mode flags',
  'node.js performance tuning', 'best prompt engineering guides'
];

// ─── State ────────────────────────────────────────────────────────────────────
const _browserTabs = new Map();    // tabId → { tabId, url, title, loading, iframe }
let _browserActiveTabId = null;
let _browserSearchHistory = [];
let _browserBookmarks = [];
let _browserInitialized = false;
let _browserSessionSaveTimer = null;
let _browserSettings = {};
let _browserStatusTimer = null;

// ─── LLM Mode State (NB-6) ───────────────────────────────────────────────────
let _browserLLMMode = false;        // Human Mode vs LLM Mode
let _browserPageText = '';           // Last extracted page text
let _browserPageUrl = '';            // URL of extracted page
let _browserAskHistory = [];         // Ask-this-page conversation
let _browserResearchSessionId = null; // Active research session
let _browserEphemeralMode = true;    // true = ephemeral analysis, false = auto-save

// ─── API helpers ──────────────────────────────────────────────────────────────
async function _browserApi(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

// ─── Tab Management ───────────────────────────────────────────────────────────
function _browserCreateIframe(tabId) {
  const iframe = document.createElement('iframe');
  iframe.className = 'browser-frame';
  iframe.dataset.tabId = tabId;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.display = 'none';
  iframe.src = 'about:blank';

  // Track load events
  iframe.addEventListener('load', () => {
    const tab = _browserTabs.get(tabId);
    if (!tab) return;
    tab.loading = false;
    tab.blocked = false;
    // Try to read title (same-origin only)
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.title) tab.title = doc.title;
    } catch { /* cross-origin */ }
    // Try to read URL (same-origin only)
    try {
      const loc = iframe.contentWindow.location.href;
      if (loc && loc !== 'about:blank') tab.url = loc;
    } catch { /* cross-origin */ }
    _browserUpdateTabStrip();
    _browserUpdateNavBar();
    _browserReportStatus();
    // Report state to server
    _browserApi('POST', '/api/browser/command/update-tab', {
      tabId, url: tab.url, title: tab.title, loading: false
    }).catch(() => {});
  });

  // Detect iframe load failures (X-Frame-Options, CSP blocks)
  iframe.addEventListener('error', () => {
    const tab = _browserTabs.get(tabId);
    if (!tab) return;
    tab.loading = false;
    tab.blocked = true;
    _browserShowBlockedOverlay(tabId);
    _browserUpdateTabStrip();
    _browserReportStatus();
  });

  document.getElementById('browserFrames').appendChild(iframe);
  return iframe;
}

async function browserNewTab(url, makeActive = true) {
  const targetUrl = url || '';
  const res = await _browserApi('POST', '/api/browser/command/tab-create', {
    makeActive, url: targetUrl || undefined
  });
  if (!res.ok) return;
  const tab = res.tab;
  const iframe = _browserCreateIframe(tab.tabId);
  _browserTabs.set(tab.tabId, {
    tabId: tab.tabId,
    url: targetUrl || 'about:blank',
    title: tab.title || 'New Tab',
    loading: false,
    iframe,
  });
  if (targetUrl) {
    iframe.src = targetUrl;
    _browserTabs.get(tab.tabId).loading = true;
  }
  if (makeActive) {
    _browserActivateTabLocal(tab.tabId);
  }
  _browserUpdateTabStrip();
  _browserScheduleSessionSave();
  // Show home view if no URL
  if (!targetUrl) _browserShowHomeView();
}

function _browserActivateTabLocal(tabId) {
  _browserActiveTabId = tabId;
  // Show/hide iframes
  for (const [id, tab] of _browserTabs) {
    if (tab.iframe) {
      tab.iframe.style.display = id === tabId ? '' : 'none';
    }
  }
  const tab = _browserTabs.get(tabId);
  if (tab && tab.url && tab.url !== 'about:blank') {
    _browserShowPageView();
  } else {
    _browserShowHomeView();
  }
  _browserUpdateTabStrip();
  _browserUpdateNavBar();
  _browserUpdateBookmarkStar();
}

async function browserActivateTab(tabId) {
  if (!_browserTabs.has(tabId)) return;
  _browserActivateTabLocal(tabId);
  await _browserApi('POST', '/api/browser/command/tab-activate', { tabId }).catch(() => {});
}

async function browserCloseTab(tabId) {
  const tab = _browserTabs.get(tabId);
  if (!tab) return;
  // Remove iframe
  if (tab.iframe && tab.iframe.parentNode) {
    tab.iframe.parentNode.removeChild(tab.iframe);
  }
  _browserTabs.delete(tabId);
  // Ask server to close (gives us deterministic new active)
  const res = await _browserApi('POST', '/api/browser/command/tab-close', { tabId });
  if (res.ok && res.newActiveTabId && _browserTabs.has(res.newActiveTabId)) {
    _browserActivateTabLocal(res.newActiveTabId);
  } else if (_browserTabs.size > 0) {
    // Fallback: activate first remaining
    _browserActivateTabLocal(_browserTabs.keys().next().value);
  } else {
    _browserActiveTabId = null;
    _browserShowHomeView();
  }
  _browserUpdateTabStrip();
  _browserScheduleSessionSave();
}

// ─── Tab Context Menu ─────────────────────────────────────────────────────────
let _browserContextMenuEl = null;

function _browserShowTabContextMenu(tabId, x, y) {
  _browserHideTabContextMenu();
  const tab = _browserTabs.get(tabId);
  if (!tab) return;
  const menu = document.createElement('div');
  menu.className = 'browser-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  const items = [
    { label: 'Duplicate Tab', action: () => browserNewTab(tab.url, true) },
    { label: 'Reload', action: () => { _browserActivateTabLocal(tabId); browserReload(); } },
    { label: '─', separator: true },
    { label: tab.pinned ? 'Unpin Tab' : 'Pin Tab', action: () => _browserTogglePin(tabId) },
    { label: tab.muted ? 'Unmute Tab' : 'Mute Tab', action: () => _browserToggleMute(tabId) },
    { label: '─', separator: true },
    { label: 'Close Tab', action: () => browserCloseTab(tabId) },
    { label: 'Close Other Tabs', action: () => _browserCloseOtherTabs(tabId) },
  ];
  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'browser-context-sep';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'browser-context-item';
    btn.textContent = item.label;
    btn.onclick = () => { _browserHideTabContextMenu(); item.action(); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  _browserContextMenuEl = menu;
  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', _browserHideTabContextMenu, { once: true });
  }, 10);
}

function _browserHideTabContextMenu() {
  if (_browserContextMenuEl) {
    _browserContextMenuEl.remove();
    _browserContextMenuEl = null;
  }
}

function _browserTogglePin(tabId) {
  const tab = _browserTabs.get(tabId);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  _browserUpdateTabStrip();
}

function _browserToggleMute(tabId) {
  const tab = _browserTabs.get(tabId);
  if (!tab) return;
  tab.muted = !tab.muted;
  _browserUpdateTabStrip();
}

function _browserCloseOtherTabs(keepTabId) {
  const toClose = [..._browserTabs.keys()].filter(id => id !== keepTabId);
  toClose.forEach(id => browserCloseTab(id));
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function _browserNormalizeUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed)) return 'https://' + trimmed;
  // Treat as search query — respect search engine setting
  const engine = _browserSettings.searchEngine || 'google';
  const q = encodeURIComponent(trimmed);
  if (engine === 'duckduckgo') return 'https://duckduckgo.com/?q=' + q;
  if (engine === 'bing') return 'https://www.bing.com/search?q=' + q;
  return 'https://www.google.com/search?q=' + q;
}

async function browserNavigate(url) {
  if (!_browserActiveTabId) {
    await browserNewTab(url);
    return;
  }
  const normalized = _browserNormalizeUrl(url);
  if (!normalized) return;
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab) return;
  tab.url = normalized;
  tab.loading = true;
  tab.title = normalized;
  if (tab.iframe) tab.iframe.src = normalized;
  _browserShowPageView();
  _browserUpdateNavBar();
  _browserUpdateTabStrip();
  // Notify server
  _browserApi('POST', '/api/browser/command/navigate', {
    tabId: _browserActiveTabId, url: normalized, title: normalized
  }).catch(() => {});
  // Add to history
  _browserApi('POST', '/api/browser/history/add', { url: normalized, title: normalized }).catch(() => {});
  _browserScheduleSessionSave();
  _browserReportStatus();
  // Check for blocked iframe after a delay
  _browserCheckIframeLoaded(_browserActiveTabId);
}

function browserNavigateFromInput() {
  const input = document.getElementById('browserUrlInput');
  if (!input) return;
  browserNavigate(input.value);
}

function browserGoBack() {
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab || !tab.iframe) return;
  try { tab.iframe.contentWindow.history.back(); } catch { /* cross-origin */ }
  _browserShowPageView();
}

function browserGoForward() {
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab || !tab.iframe) return;
  try { tab.iframe.contentWindow.history.forward(); } catch { /* cross-origin */ }
  _browserShowPageView();
}

function browserReload() {
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab || !tab.iframe) return;
  try {
    tab.iframe.contentWindow.location.reload();
  } catch {
    tab.iframe.src = tab.iframe.src;
  }
  _browserShowPageView();
}

function browserGoHome() {
  _browserShowHomeView();
  const input = document.getElementById('browserUrlInput');
  if (input) input.value = '';
}

function browserOpenExternal() {
  const tab = _browserTabs.get(_browserActiveTabId);
  const url = tab ? tab.url : BROWSER_HOMEPAGE;
  if (url && url !== 'about:blank') {
    window.open(url, '_blank', 'noopener');
  }
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────
async function _browserLoadBookmarks() {
  try {
    const res = await _browserApi('GET', '/api/browser/bookmarks');
    if (res.ok) _browserBookmarks = res.bookmarks || [];
  } catch { _browserBookmarks = []; }
}

async function browserToggleBookmark() {
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab || !tab.url || tab.url === 'about:blank') return;
  const existing = _browserBookmarks.find(b => b.url === tab.url);
  if (existing) {
    await _browserApi('POST', '/api/browser/bookmarks/remove', { url: tab.url });
    _browserBookmarks = _browserBookmarks.filter(b => b.url !== tab.url);
  } else {
    const res = await _browserApi('POST', '/api/browser/bookmarks/add', { url: tab.url, title: tab.title });
    if (res.ok && res.bookmark) _browserBookmarks.unshift(res.bookmark);
  }
  _browserUpdateBookmarkStar();
  _browserRenderHomeBookmarks();
}

function _browserUpdateBookmarkStar() {
  const btn = document.getElementById('browserBookmarkBtn');
  if (!btn) return;
  const tab = _browserTabs.get(_browserActiveTabId);
  const isBookmarked = tab && _browserBookmarks.some(b => b.url === tab.url);
  btn.textContent = isBookmarked ? '★' : '☆';
  btn.title = isBookmarked ? 'Remove bookmark' : 'Add bookmark';
}

// ─── Downloads Panel ──────────────────────────────────────────────────────────
function browserToggleDownloads() {
  const panel = document.getElementById('browserDownloadsPanel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) _browserRefreshDownloads();
}

async function _browserRefreshDownloads() {
  const list = document.getElementById('browserDownloadsList');
  if (!list) return;
  try {
    const res = await _browserApi('GET', '/api/browser/downloads');
    if (!res.ok || !res.downloads || !res.downloads.length) {
      list.innerHTML = '<div class="browser-empty-state">No downloads yet</div>';
      return;
    }
    list.innerHTML = '';
    res.downloads.forEach(dl => {
      const row = document.createElement('div');
      row.className = 'browser-download-row';
      const stateIcon = dl.state === 'completed' ? '✓' : dl.state === 'failed' ? '✗' : '⬇';
      row.innerHTML = `
        <span class="browser-dl-icon">${stateIcon}</span>
        <div class="browser-dl-info">
          <div class="browser-dl-name">${_escHtml(dl.filename || 'download')}</div>
          <div class="browser-dl-url">${_escHtml(dl.url || '')}</div>
        </div>
        <span class="browser-dl-state">${dl.state}</span>
      `;
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<div class="browser-empty-state">Failed to load downloads</div>';
  }
}

// ─── View Switching ───────────────────────────────────────────────────────────
function _browserShowHomeView() {
  const homeWrap = document.getElementById('browserHomeWrap');
  const framesWrap = document.getElementById('browserFrames');
  const resultsWrap = document.getElementById('browserSearchResultsWrap');
  if (homeWrap) homeWrap.classList.remove('hidden');
  if (framesWrap) framesWrap.classList.add('hidden');
  if (resultsWrap) resultsWrap.classList.add('hidden');
  _browserRenderHome();
}

function _browserShowPageView() {
  const homeWrap = document.getElementById('browserHomeWrap');
  const framesWrap = document.getElementById('browserFrames');
  const resultsWrap = document.getElementById('browserSearchResultsWrap');
  if (homeWrap) homeWrap.classList.add('hidden');
  if (framesWrap) framesWrap.classList.remove('hidden');
  if (resultsWrap) resultsWrap.classList.add('hidden');
}

function _browserShowResultsView() {
  const homeWrap = document.getElementById('browserHomeWrap');
  const framesWrap = document.getElementById('browserFrames');
  const resultsWrap = document.getElementById('browserSearchResultsWrap');
  if (homeWrap) homeWrap.classList.add('hidden');
  if (framesWrap) framesWrap.classList.add('hidden');
  if (resultsWrap) resultsWrap.classList.remove('hidden');
}

// ─── Tab Strip UI ─────────────────────────────────────────────────────────────
function _browserUpdateTabStrip() {
  const strip = document.getElementById('browserTabs');
  if (!strip) return;
  strip.innerHTML = '';
  // Sort: pinned first
  const sorted = [..._browserTabs.entries()].sort((a, b) => {
    if (a[1].pinned && !b[1].pinned) return -1;
    if (!a[1].pinned && b[1].pinned) return 1;
    return 0;
  });
  for (const [id, tab] of sorted) {
    const btn = document.createElement('button');
    btn.className = 'browser-tab-btn' + (id === _browserActiveTabId ? ' active' : '') + (tab.pinned ? ' pinned' : '');
    btn.dataset.tabId = id;
    // Context menu on right-click
    btn.oncontextmenu = (e) => { e.preventDefault(); _browserShowTabContextMenu(id, e.clientX, e.clientY); };
    const prefix = (tab.pinned ? '📌 ' : '') + (tab.muted ? '🔇 ' : '');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'browser-tab-title';
    titleSpan.textContent = prefix + (tab.loading ? '⏳ Loading...' : _truncate(tab.title || 'New Tab', tab.pinned ? 12 : 24));
    titleSpan.title = tab.url || '';
    btn.appendChild(titleSpan);
    if (!tab.pinned) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'browser-tab-close';
      closeBtn.textContent = '✕';
      closeBtn.onclick = (e) => { e.stopPropagation(); browserCloseTab(id); };
      btn.appendChild(closeBtn);
    }
    btn.onclick = () => browserActivateTab(id);
    // Middle-click to close
    btn.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); browserCloseTab(id); } };
    strip.appendChild(btn);
  }
}

function _browserUpdateNavBar() {
  const input = document.getElementById('browserUrlInput');
  const tab = _browserTabs.get(_browserActiveTabId);
  if (input && tab) {
    input.value = (tab.url && tab.url !== 'about:blank') ? tab.url : '';
  }
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function _browserRenderHome() {
  _browserRenderSearchChips();
  _browserRenderHomeBookmarks();
  _browserRenderHomeHistory();
}

function _browserRenderSearchChips() {
  const quickEl = document.getElementById('browserQuickSearchChips');
  const recentEl = document.getElementById('browserRecentSearchChips');
  if (!quickEl || !recentEl) return;
  quickEl.innerHTML = '';
  BROWSER_TRENDING_QUERIES.forEach(q => {
    const chip = document.createElement('button');
    chip.className = 'browser-chip';
    chip.type = 'button';
    chip.textContent = q;
    chip.onclick = () => { document.getElementById('browserSearchQuery').value = q; browserExecuteSearch(); };
    quickEl.appendChild(chip);
  });
  recentEl.innerHTML = '';
  const recent = _browserSearchHistory.slice(0, 8);
  if (!recent.length) {
    recentEl.innerHTML = '<div class="text-xs-c text-tertiary-c">No recent searches yet.</div>';
    return;
  }
  recent.forEach(q => {
    const chip = document.createElement('button');
    chip.className = 'browser-chip';
    chip.type = 'button';
    chip.textContent = q;
    chip.onclick = () => { document.getElementById('browserSearchQuery').value = q; browserExecuteSearch(); };
    recentEl.appendChild(chip);
  });
}

function _browserRenderHomeBookmarks() {
  const el = document.getElementById('browserBookmarksList');
  if (!el) return;
  if (!_browserBookmarks.length) {
    el.innerHTML = '<div class="browser-empty-state">No bookmarks yet. Click ☆ to add one.</div>';
    return;
  }
  el.innerHTML = '';
  _browserBookmarks.slice(0, 12).forEach(bm => {
    const chip = document.createElement('button');
    chip.className = 'browser-chip';
    chip.type = 'button';
    chip.textContent = _truncate(bm.title || bm.url, 30);
    chip.title = bm.url;
    chip.onclick = () => browserNavigate(bm.url);
    el.appendChild(chip);
  });
}

async function _browserRenderHomeHistory() {
  const el = document.getElementById('browserHistoryList');
  if (!el) return;
  try {
    const res = await _browserApi('GET', '/api/browser/history');
    if (!res.ok || !res.entries || !res.entries.length) {
      el.innerHTML = '<div class="browser-empty-state">No history yet.</div>';
      return;
    }
    el.innerHTML = '';
    res.entries.slice(0, 10).forEach(entry => {
      const row = document.createElement('div');
      row.className = 'browser-history-row';
      row.innerHTML = `
        <button class="browser-result-title" type="button">${_escHtml(_truncate(entry.title || entry.url, 50))}</button>
        <div class="browser-result-url">${_escHtml(entry.url)}</div>
      `;
      row.querySelector('button').onclick = () => browserNavigate(entry.url);
      el.appendChild(row);
    });
  } catch {
    el.innerHTML = '<div class="browser-empty-state">Failed to load history.</div>';
  }
}

// ─── Web Search ───────────────────────────────────────────────────────────────
function _browserLoadSearchHistory() {
  try {
    const raw = localStorage.getItem(BROWSER_SEARCH_HISTORY_KEY);
    _browserSearchHistory = raw ? JSON.parse(raw).filter(Boolean).slice(0, 12) : [];
  } catch { _browserSearchHistory = []; }
}

function _browserSaveSearchHistory() {
  try { localStorage.setItem(BROWSER_SEARCH_HISTORY_KEY, JSON.stringify(_browserSearchHistory.slice(0, 12))); } catch {}
}

function _browserRememberSearch(query) {
  const q = (query || '').trim();
  if (!q) return;
  _browserSearchHistory = [q, ..._browserSearchHistory.filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, 12);
  _browserSaveSearchHistory();
}

async function browserExecuteSearch() {
  const input = document.getElementById('browserSearchQuery');
  const resultsEl = document.getElementById('browserSearchResultsList');
  if (!input || !resultsEl) return;
  const query = (input.value || '').trim();
  if (!query) return;
  _browserRememberSearch(query);
  _browserShowResultsView();
  resultsEl.innerHTML = '<div style="color:var(--text-tertiary);text-align:center;padding:1rem">Searching...</div>';
  try {
    const res = await fetch('/api/skills/web-search/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      resultsEl.innerHTML = '<div style="color:var(--text-tertiary);text-align:center;padding:1rem">No results found</div>';
      return;
    }
    resultsEl.innerHTML = '';
    results.forEach(result => {
      const row = document.createElement('div');
      row.className = 'browser-search-result-row';
      const title = document.createElement('button');
      title.className = 'browser-result-title';
      title.type = 'button';
      title.textContent = result.title || result.url || 'Untitled';
      title.onclick = () => browserNavigate(result.url);
      const url = document.createElement('div');
      url.className = 'browser-result-url';
      url.textContent = result.url || '';
      const snippet = document.createElement('div');
      snippet.className = 'browser-result-snippet';
      snippet.textContent = result.snippet || '';
      row.appendChild(title);
      row.appendChild(url);
      row.appendChild(snippet);
      resultsEl.appendChild(row);
    });
  } catch (err) {
    resultsEl.innerHTML = `<div style="color:var(--danger);padding:1rem">${_escHtml(err.message || String(err))}</div>`;
  }
}

// ─── Session Save / Restore ───────────────────────────────────────────────────
function _browserScheduleSessionSave() {
  if (_browserSessionSaveTimer) clearTimeout(_browserSessionSaveTimer);
  _browserSessionSaveTimer = setTimeout(() => {
    _browserApi('POST', '/api/browser/session/save').catch(() => {});
  }, 2000);
}

async function _browserRestoreSession() {
  try {
    const res = await _browserApi('GET', '/api/browser/session-restore');
    if (!res.ok || !res.session || !res.session.tabs || !res.session.tabs.length) return false;
    for (const saved of res.session.tabs) {
      const iframe = _browserCreateIframe(saved.tabId);
      _browserTabs.set(saved.tabId, {
        tabId: saved.tabId,
        url: saved.url || 'about:blank',
        title: saved.title || 'Restored Tab',
        loading: false,
        iframe,
      });
      if (saved.url && saved.url !== 'about:blank') {
        iframe.src = saved.url;
      }
      // Re-create on server
      await _browserApi('POST', '/api/browser/command/tab-create', {
        makeActive: false, url: saved.url, title: saved.title
      }).catch(() => {});
    }
    // Activate the previously active tab
    const activeId = res.session.activeTabId;
    if (activeId && _browserTabs.has(activeId)) {
      _browserActivateTabLocal(activeId);
      await _browserApi('POST', '/api/browser/command/tab-activate', { tabId: activeId }).catch(() => {});
    } else if (_browserTabs.size > 0) {
      const firstId = _browserTabs.keys().next().value;
      _browserActivateTabLocal(firstId);
    }
    return true;
  } catch { return false; }
}

// ─── SSE Event Listeners ──────────────────────────────────────────────────────
function _browserHandleSSE(eventType, data) {
  if (eventType === 'browser.download.state') {
    // Auto-refresh downloads panel if visible
    const panel = document.getElementById('browserDownloadsPanel');
    if (panel && !panel.classList.contains('hidden')) {
      _browserRefreshDownloads();
    }
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function _browserLoadSettings() {
  try {
    const res = await _browserApi('GET', '/api/browser/settings');
    if (res.ok && res.settings) {
      _browserSettings = res.settings;
      BROWSER_HOMEPAGE = _browserSettings.homepage || 'https://neko-core.com';
    }
  } catch { /* use defaults */ }
}

async function browserSaveSettings(partial) {
  try {
    const res = await _browserApi('POST', '/api/browser/settings/update', partial);
    if (res.ok && res.settings) {
      _browserSettings = res.settings;
      BROWSER_HOMEPAGE = _browserSettings.homepage || 'https://neko-core.com';
      if (typeof showNotification === 'function') showNotification('Browser settings saved', 'success');
    }
  } catch {
    if (typeof showNotification === 'function') showNotification('Failed to save browser settings', 'error');
  }
}

async function browserResetSettings() {
  try {
    const res = await _browserApi('POST', '/api/browser/settings/reset', {});
    if (res.ok && res.settings) {
      _browserSettings = res.settings;
      BROWSER_HOMEPAGE = _browserSettings.homepage || 'https://neko-core.com';
      _browserPopulateSettingsUI();
      if (typeof showNotification === 'function') showNotification('Browser settings reset to defaults', 'success');
    }
  } catch {
    if (typeof showNotification === 'function') showNotification('Failed to reset browser settings', 'error');
  }
}

function _browserPopulateSettingsUI() {
  const homepageEl = document.getElementById('browserSettingsHomepage');
  const searchEl = document.getElementById('browserSettingsSearch');
  const sessionEl = document.getElementById('browserSettingsSessionRestore');
  const linkEl = document.getElementById('browserSettingsExternalLinks');
  if (homepageEl) homepageEl.value = _browserSettings.homepage || 'https://neko-core.com';
  if (searchEl) searchEl.value = _browserSettings.searchEngine || 'google';
  if (sessionEl) sessionEl.checked = _browserSettings.sessionRestore !== false;
  if (linkEl) linkEl.value = _browserSettings.externalLinkBehavior || 'in-app';
}

function browserSaveSettingsFromUI() {
  const homepage = (document.getElementById('browserSettingsHomepage')?.value || '').trim();
  const searchEngine = document.getElementById('browserSettingsSearch')?.value || 'google';
  const sessionRestore = document.getElementById('browserSettingsSessionRestore')?.checked !== false;
  const externalLinkBehavior = document.getElementById('browserSettingsExternalLinks')?.value || 'in-app';
  browserSaveSettings({ homepage: homepage || 'https://neko-core.com', searchEngine, sessionRestore, externalLinkBehavior });
}

async function browserClearHistory() {
  if (!confirm('Clear all browsing history?')) return;
  await _browserApi('POST', '/api/browser/history/clear', {});
  _browserRenderHomeHistory();
  if (typeof showNotification === 'function') showNotification('Browsing history cleared', 'success');
}

async function browserClearBookmarks() {
  if (!confirm('Remove all bookmarks?')) return;
  await _browserApi('POST', '/api/browser/bookmarks/clear', {});
  _browserBookmarks = [];
  _browserRenderHomeBookmarks();
  _browserUpdateBookmarkStar();
  if (typeof showNotification === 'function') showNotification('All bookmarks removed', 'success');
}

// ─── Bookmark Manager ─────────────────────────────────────────────────────────
let _bmManagerOpen = false;
let _bmManagerFilter = '';
let _bmManagerFolder = '';

function browserOpenBookmarkManager() {
  _bmManagerOpen = true;
  _bmManagerFilter = '';
  _bmManagerFolder = '';
  const panel = document.getElementById('browserBookmarkManager');
  if (panel) { panel.classList.remove('hidden'); _bmRender(); }
}

function browserCloseBookmarkManager() {
  _bmManagerOpen = false;
  const panel = document.getElementById('browserBookmarkManager');
  if (panel) panel.classList.add('hidden');
}

async function _bmRender() {
  const listEl = document.getElementById('bmManagerList');
  const folderEl = document.getElementById('bmManagerFolderFilter');
  if (!listEl) return;
  await _browserLoadBookmarks();
  // Populate folder filter
  if (folderEl) {
    const folders = [...new Set(_browserBookmarks.map(b => b.folder || 'default'))];
    folderEl.innerHTML = '<option value="">All Folders</option>';
    folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      if (f === _bmManagerFolder) opt.selected = true;
      folderEl.appendChild(opt);
    });
  }
  // Filter bookmarks
  let filtered = _browserBookmarks;
  if (_bmManagerFolder) {
    filtered = filtered.filter(b => (b.folder || 'default') === _bmManagerFolder);
  }
  if (_bmManagerFilter) {
    const q = _bmManagerFilter.toLowerCase();
    filtered = filtered.filter(b => b.url.toLowerCase().includes(q) || (b.title || '').toLowerCase().includes(q));
  }
  if (!filtered.length) {
    listEl.innerHTML = '<div class="browser-empty-state">No bookmarks found.</div>';
    return;
  }
  listEl.innerHTML = '';
  filtered.forEach(bm => {
    const row = document.createElement('div');
    row.className = 'bm-manager-row';
    row.innerHTML = `
      <div class="bm-manager-info">
        <div class="bm-manager-title">${_escHtml(_truncate(bm.title || bm.url, 50))}</div>
        <div class="bm-manager-url">${_escHtml(_truncate(bm.url, 60))}</div>
        <div class="bm-manager-folder">${_escHtml(bm.folder || 'default')}</div>
      </div>
      <div class="bm-manager-actions">
        <button class="btn-sm" title="Open" data-action="open">↗</button>
        <button class="btn-sm" title="Edit" data-action="edit">✏</button>
        <button class="btn-sm btn-danger-sm" title="Delete" data-action="delete">🗑</button>
      </div>
    `;
    row.querySelector('[data-action="open"]').onclick = () => { browserCloseBookmarkManager(); browserNavigate(bm.url); };
    row.querySelector('[data-action="edit"]').onclick = () => _bmStartEdit(bm, row);
    row.querySelector('[data-action="delete"]').onclick = () => _bmDelete(bm.id);
    listEl.appendChild(row);
  });
}

function _bmFilterChanged() {
  const searchEl = document.getElementById('bmManagerSearch');
  _bmManagerFilter = searchEl ? searchEl.value : '';
  _bmRender();
}

function _bmFolderChanged() {
  const folderEl = document.getElementById('bmManagerFolderFilter');
  _bmManagerFolder = folderEl ? folderEl.value : '';
  _bmRender();
}

function _bmStartEdit(bm, row) {
  const infoEl = row.querySelector('.bm-manager-info');
  if (!infoEl) return;
  infoEl.innerHTML = `
    <input class="bm-edit-input" value="${_escHtml(bm.title || '')}" placeholder="Title" data-field="title">
    <input class="bm-edit-input" value="${_escHtml(bm.url || '')}" placeholder="URL" data-field="url">
    <input class="bm-edit-input" value="${_escHtml(bm.folder || 'default')}" placeholder="Folder" data-field="folder">
  `;
  const actionsEl = row.querySelector('.bm-manager-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="btn-sm btn-success-sm" data-action="save">✓</button>
      <button class="btn-sm" data-action="cancel">✕</button>
    `;
    actionsEl.querySelector('[data-action="save"]').onclick = async () => {
      const title = row.querySelector('[data-field="title"]').value.trim();
      const url = row.querySelector('[data-field="url"]').value.trim();
      const folder = row.querySelector('[data-field="folder"]').value.trim() || 'default';
      await _browserApi('POST', '/api/browser/bookmarks/update', { id: bm.id, title, url, folder });
      await _browserLoadBookmarks();
      _bmRender();
    };
    actionsEl.querySelector('[data-action="cancel"]').onclick = () => _bmRender();
  }
}

async function _bmDelete(id) {
  await _browserApi('POST', '/api/browser/bookmarks/remove', { id });
  _browserBookmarks = _browserBookmarks.filter(b => b.id !== id);
  _bmRender();
  _browserUpdateBookmarkStar();
  _browserRenderHomeBookmarks();
}

async function bmAddBookmarkFromManager() {
  const urlEl = document.getElementById('bmAddUrl');
  const titleEl = document.getElementById('bmAddTitle');
  const folderEl = document.getElementById('bmAddFolder');
  const url = urlEl ? urlEl.value.trim() : '';
  const title = titleEl ? titleEl.value.trim() : '';
  const folder = folderEl ? folderEl.value.trim() : 'default';
  if (!url) { if (typeof showNotification === 'function') showNotification('URL is required', 'error'); return; }
  await _browserApi('POST', '/api/browser/bookmarks/add', { url, title: title || url, folder });
  if (urlEl) urlEl.value = '';
  if (titleEl) titleEl.value = '';
  await _browserLoadBookmarks();
  _bmRender();
  _browserRenderHomeBookmarks();
  _browserUpdateBookmarkStar();
}

// ─── History Manager ──────────────────────────────────────────────────────────
let _histManagerOpen = false;
let _histManagerFilter = '';
let _histManagerEntries = [];

function browserOpenHistoryManager() {
  _histManagerOpen = true;
  _histManagerFilter = '';
  const panel = document.getElementById('browserHistoryManager');
  if (panel) { panel.classList.remove('hidden'); _histRender(); }
}

function browserCloseHistoryManager() {
  _histManagerOpen = false;
  const panel = document.getElementById('browserHistoryManager');
  if (panel) panel.classList.add('hidden');
}

async function _histRender() {
  const listEl = document.getElementById('histManagerList');
  if (!listEl) return;
  try {
    const q = _histManagerFilter || '';
    const res = await _browserApi('GET', '/api/browser/history' + (q ? '?q=' + encodeURIComponent(q) : ''));
    _histManagerEntries = (res.ok && res.entries) ? res.entries : [];
  } catch { _histManagerEntries = []; }
  if (!_histManagerEntries.length) {
    listEl.innerHTML = '<div class="browser-empty-state">No history entries found.</div>';
    return;
  }
  listEl.innerHTML = '';
  // Group by date
  const groups = {};
  _histManagerEntries.forEach(entry => {
    const d = new Date(entry.visitedAt);
    const key = d.toLocaleDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  });
  for (const [date, entries] of Object.entries(groups)) {
    const header = document.createElement('div');
    header.className = 'hist-manager-date';
    header.textContent = date;
    listEl.appendChild(header);
    entries.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'hist-manager-row';
      const time = new Date(entry.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <span class="hist-manager-time">${time}</span>
        <div class="hist-manager-info">
          <button class="browser-result-title" type="button">${_escHtml(_truncate(entry.title || entry.url, 50))}</button>
          <div class="browser-result-url">${_escHtml(_truncate(entry.url, 60))}</div>
        </div>
        <button class="btn-sm btn-danger-sm hist-delete" title="Delete">🗑</button>
      `;
      row.querySelector('.browser-result-title').onclick = () => { browserCloseHistoryManager(); browserNavigate(entry.url); };
      row.querySelector('.hist-delete').onclick = () => _histDeleteEntry(entry.id);
      listEl.appendChild(row);
    });
  }
}

function _histFilterChanged() {
  const searchEl = document.getElementById('histManagerSearch');
  _histManagerFilter = searchEl ? searchEl.value : '';
  _histRender();
}

async function _histDeleteEntry(id) {
  await _browserApi('POST', '/api/browser/history/delete', { id });
  _histRender();
  _browserRenderHomeHistory();
}

async function histClearAll() {
  if (!confirm('Clear all browsing history?')) return;
  await _browserApi('POST', '/api/browser/history/clear', {});
  _histRender();
  _browserRenderHomeHistory();
  if (typeof showNotification === 'function') showNotification('History cleared', 'success');
}

async function histDeleteToday() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  await _browserApi('POST', '/api/browser/history/delete-range', { startMs: startOfDay, endMs: Date.now() });
  _histRender();
  _browserRenderHomeHistory();
  if (typeof showNotification === 'function') showNotification("Today's history cleared", 'success');
}

// ─── Import / Export ──────────────────────────────────────────────────────────
async function browserExportBookmarks() {
  try {
    const res = await _browserApi('POST', '/api/browser/bookmarks/export', {});
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(res.bookmarks, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nekocore-bookmarks.json';
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof showNotification === 'function') showNotification('Bookmarks exported', 'success');
  } catch { if (typeof showNotification === 'function') showNotification('Export failed', 'error'); }
}

function browserImportBookmarks() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const bookmarks = Array.isArray(data) ? data : (data.bookmarks || []);
      const res = await _browserApi('POST', '/api/browser/bookmarks/import', { bookmarks });
      if (res.ok) {
        _browserBookmarks = res.bookmarks || [];
        _browserRenderHomeBookmarks();
        _browserUpdateBookmarkStar();
        if (_bmManagerOpen) _bmRender();
        if (typeof showNotification === 'function') showNotification(`Imported ${res.importedCount} bookmarks`, 'success');
      }
    } catch { if (typeof showNotification === 'function') showNotification('Import failed — invalid JSON file', 'error'); }
  };
  input.click();
}

async function browserExportSettings() {
  try {
    const res = await _browserApi('POST', '/api/browser/settings/export', {});
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(res.settings, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nekocore-browser-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof showNotification === 'function') showNotification('Settings exported', 'success');
  } catch { if (typeof showNotification === 'function') showNotification('Export failed', 'error'); }
}

function browserImportSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const settings = JSON.parse(text);
      const res = await _browserApi('POST', '/api/browser/settings/update', settings);
      if (res.ok && res.settings) {
        _browserSettings = res.settings;
        BROWSER_HOMEPAGE = _browserSettings.homepage || 'https://neko-core.com';
        _browserPopulateSettingsUI();
        if (typeof showNotification === 'function') showNotification('Settings imported', 'success');
      }
    } catch { if (typeof showNotification === 'function') showNotification('Import failed — invalid JSON file', 'error'); }
  };
  input.click();
}

async function browserExportHistory() {
  try {
    const res = await _browserApi('POST', '/api/browser/history/export', {});
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(res.entries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nekocore-history.json';
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof showNotification === 'function') showNotification('History exported', 'success');
  } catch { if (typeof showNotification === 'function') showNotification('Export failed', 'error'); }
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
function _browserHandleKeydown(e) {
  // Only handle when browser tab is active
  const browserTab = document.getElementById('tab-browser');
  if (!browserTab || browserTab.classList.contains('hidden') || browserTab.style.display === 'none') return;
  // Don't capture when typing in non-browser inputs
  const tag = (e.target.tagName || '').toLowerCase();
  const isBrowserInput = e.target.id === 'browserUrlInput' || e.target.id === 'browserSearchQuery';

  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 't') {
    e.preventDefault();
    browserNewTab();
    return;
  }
  if (ctrl && e.key === 'w') {
    e.preventDefault();
    if (_browserActiveTabId) browserCloseTab(_browserActiveTabId);
    return;
  }
  if (ctrl && e.key === 'l') {
    e.preventDefault();
    const urlInput = document.getElementById('browserUrlInput');
    if (urlInput) { urlInput.focus(); urlInput.select(); }
    return;
  }
  if (ctrl && e.key === 'r') {
    e.preventDefault();
    browserReload();
    return;
  }
  if (ctrl && e.key === 'd') {
    e.preventDefault();
    browserToggleBookmark();
    return;
  }
  if (ctrl && e.shiftKey && e.key === 'B') {
    e.preventDefault();
    browserOpenBookmarkManager();
    return;
  }
  if (ctrl && e.key === 'h') {
    e.preventDefault();
    browserOpenHistoryManager();
    return;
  }
  if (ctrl && e.key === 'j') {
    e.preventDefault();
    browserToggleDownloads();
    return;
  }
  // Tab switching: Ctrl+1-9
  if (ctrl && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    const tabIds = [..._browserTabs.keys()];
    if (idx < tabIds.length) browserActivateTab(tabIds[idx]);
    return;
  }
  // Alt+Left/Right for back/forward
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    browserGoBack();
    return;
  }
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    browserGoForward();
    return;
  }
  // Escape closes managers/overlays
  if (e.key === 'Escape') {
    if (_bmManagerOpen) { browserCloseBookmarkManager(); e.preventDefault(); return; }
    if (_histManagerOpen) { browserCloseHistoryManager(); e.preventDefault(); return; }
    _browserHideTabContextMenu();
    return;
  }
  // F5 reload
  if (e.key === 'F5' && !ctrl) {
    e.preventDefault();
    browserReload();
    return;
  }
  // Enter in URL bar = navigate
  if (isBrowserInput && e.key === 'Enter') {
    // Already handled by inline handler, skip
    return;
  }
}

// ─── Shell Launch Routing ─────────────────────────────────────────────────────
function openInBrowser(url) {
  // Open the browser window and navigate to the given URL
  if (typeof openWindow === 'function') {
    openWindow('browser');
  } else if (typeof switchMainTab === 'function') {
    switchMainTab('browser');
  }
  // Wait for init if needed, then navigate
  const doNav = () => {
    if (url) browserNavigate(url);
  };
  if (_browserInitialized) {
    doNav();
  } else {
    // Defer until init completes
    setTimeout(doNav, 300);
  }
}

// ─── Shell Status Reporting ───────────────────────────────────────────────────
function _browserReportStatus() {
  // Update the browser status card in the task manager if it exists
  const tabCount = document.getElementById('tmBrowserTabCount');
  const activeUrl = document.getElementById('tmBrowserActiveUrl');
  const statusEl = document.getElementById('tmBrowserStatus');
  if (tabCount) tabCount.textContent = String(_browserTabs.size);
  if (activeUrl) {
    const tab = _browserTabs.get(_browserActiveTabId);
    activeUrl.textContent = tab ? _truncate(tab.url || 'New Tab', 60) : 'No active tab';
  }
  if (statusEl) {
    const loadingCount = Array.from(_browserTabs.values()).filter(t => t.loading).length;
    statusEl.textContent = loadingCount > 0 ? loadingCount + ' loading' : 'Ready';
  }
  // Update taskbar badge
  _browserUpdateTaskbarBadge();
}

function _browserUpdateTaskbarBadge() {
  // Find the taskbar button for the browser and update its badge
  const btns = document.querySelectorAll('.os-pinned-app[data-tab="browser"]');
  btns.forEach(btn => {
    let badge = btn.querySelector('.browser-tab-badge');
    if (_browserTabs.size > 1) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'browser-tab-badge';
        btn.appendChild(badge);
      }
      badge.textContent = String(_browserTabs.size);
    } else if (badge) {
      badge.remove();
    }
  });
}

// ─── Iframe Fallback / Blocked Site Handling ──────────────────────────────────
function _browserShowBlockedOverlay(tabId) {
  const tab = _browserTabs.get(tabId);
  if (!tab || !tab.iframe) return;
  // Remove existing overlay if any
  const existing = document.querySelector(`.browser-blocked-overlay[data-tab-id="${tabId}"]`);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'browser-blocked-overlay';
  overlay.dataset.tabId = tabId;
  overlay.innerHTML = `
    <div class="browser-blocked-content">
      <div class="browser-blocked-icon">🚫</div>
      <div class="browser-blocked-title">This site can't be displayed here</div>
      <div class="browser-blocked-msg">This website blocks embedded viewing (X-Frame-Options or CSP).</div>
      <div class="browser-blocked-actions">
        <button class="btn bp" onclick="window.open('${_escHtml(tab.url)}', '_blank', 'noopener')">Open in System Browser ↗</button>
        <button class="btn bg" onclick="browserGoHome()">Go Home</button>
      </div>
    </div>
  `;
  const framesEl = document.getElementById('browserFrames');
  if (framesEl) framesEl.appendChild(overlay);
}

// Proactive blocked-site check: after navigation, check if iframe loaded
function _browserCheckIframeLoaded(tabId) {
  setTimeout(() => {
    const tab = _browserTabs.get(tabId);
    if (!tab || !tab.iframe || !tab.loading) return;
    // If still loading after 8 seconds, might be blocked
    try {
      // Try to access content — if blocked, this throws
      const doc = tab.iframe.contentDocument;
      if (doc && doc.body && doc.body.innerHTML === '') {
        tab.blocked = true;
        tab.loading = false;
        _browserShowBlockedOverlay(tabId);
        _browserUpdateTabStrip();
      }
    } catch { /* cross-origin is normal, not necessarily blocked */ }
  }, 8000);
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
function _browserSaveSessionSync() {
  // Synchronous session save using sendBeacon for beforeunload
  if (!_browserInitialized || _browserTabs.size === 0) return;
  const tabs = [];
  for (const [id, tab] of _browserTabs) {
    tabs.push({ tabId: id, url: tab.url, title: tab.title });
  }
  const payload = JSON.stringify({ tabs, activeTabId: _browserActiveTabId, savedAt: Date.now() });
  try {
    navigator.sendBeacon('/api/browser/session/save', new Blob([payload], { type: 'application/json' }));
  } catch { /* best effort */ }
}

function browserCleanup() {
  // Called when browser window is closed or shell is shutting down
  _browserSaveSessionSync();
  if (_browserSessionSaveTimer) clearTimeout(_browserSessionSaveTimer);
  if (_browserStatusTimer) clearInterval(_browserStatusTimer);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function _truncate(s, max) { return s && s.length > max ? s.slice(0, max) + '…' : (s || ''); }
function _escHtml(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s || ''));
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NB-6 LLM Mode Foundation
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Mode Toggle ──────────────────────────────────────────────────────────────
function browserToggleLLMMode() {
  _browserLLMMode = !_browserLLMMode;
  const panel = document.getElementById('browserLLMPanel');
  const toggle = document.getElementById('browserLLMModeBtn');
  if (panel) panel.classList.toggle('hidden', !_browserLLMMode);
  if (toggle) {
    toggle.textContent = _browserLLMMode ? '🤖' : '🧠';
    toggle.title = _browserLLMMode ? 'Switch to Human Mode' : 'Switch to LLM Mode';
    toggle.classList.toggle('llm-mode-active', _browserLLMMode);
  }
  // Auto-extract page when switching to LLM mode
  if (_browserLLMMode) _llmAutoExtract();
}

// ─── Page Extraction ──────────────────────────────────────────────────────────
async function _llmAutoExtract() {
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab || !tab.url || tab.url === 'about:blank') return;
  // Skip if already extracted this URL
  if (_browserPageUrl === tab.url && _browserPageText) return;
  await browserExtractPage();
}

async function browserExtractPage() {
  const tab = _browserTabs.get(_browserActiveTabId);
  if (!tab || !tab.url) {
    if (typeof showNotification === 'function') showNotification('No active page to extract', 'warning');
    return;
  }
  const statusEl = document.getElementById('llmStatus');
  if (statusEl) statusEl.textContent = 'Extracting page content...';

  try {
    const r = await _browserApi('POST', '/api/browser/extract-page', { url: tab.url });
    if (r.ok) {
      _browserPageText = r.text;
      _browserPageUrl = r.url || tab.url;
      _browserAskHistory = [];
      _llmUpdateSourcePreview();
      if (statusEl) statusEl.textContent = `Extracted ${r.text.length} chars from ${_truncate(_browserPageUrl, 40)}`;
    } else {
      if (statusEl) statusEl.textContent = 'Extraction failed: ' + (r.message || 'Unknown error');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Extraction error: ' + err.message;
  }
}

function _llmUpdateSourcePreview() {
  const preview = document.getElementById('llmSourcePreview');
  if (!preview) return;
  if (_browserPageText) {
    preview.innerHTML = `<div class="llm-source-url">${_escHtml(_truncate(_browserPageUrl, 60))}</div><div class="llm-source-text">${_escHtml(_truncate(_browserPageText, 300))}</div>`;
  } else {
    preview.innerHTML = '<div class="llm-source-empty">No page content extracted. Navigate to a page and click Extract.</div>';
  }
}

// ─── Summarize Page ───────────────────────────────────────────────────────────
async function browserSummarizePage() {
  if (!_browserPageText) {
    await browserExtractPage();
    if (!_browserPageText) return;
  }
  const output = document.getElementById('llmOutput');
  const statusEl = document.getElementById('llmStatus');
  if (output) output.innerHTML = '<div class="llm-loading">Summarizing page…</div>';
  if (statusEl) statusEl.textContent = 'Calling LLM for summary...';

  try {
    const r = await _browserApi('POST', '/api/browser/summarize', {
      text: _browserPageText, url: _browserPageUrl,
      title: _browserTabs.get(_browserActiveTabId)?.title || ''
    });
    if (r.ok) {
      _llmRenderOutput('Summary', r.summary, r.citations, r.usage);
      if (statusEl) statusEl.textContent = 'Summary complete' + (r.usage ? ` (${r.usage.total_tokens} tokens)` : '');
    } else {
      if (output) output.innerHTML = `<div class="llm-error">${_escHtml(r.message || 'Summarization failed')}</div>`;
      if (statusEl) statusEl.textContent = 'Summary failed';
    }
  } catch (err) {
    if (output) output.innerHTML = `<div class="llm-error">${_escHtml(err.message)}</div>`;
  }
}

// ─── Ask This Page ────────────────────────────────────────────────────────────
async function browserAskPage() {
  const input = document.getElementById('llmAskInput');
  const question = input ? input.value.trim() : '';
  if (!question) return;
  if (!_browserPageText) {
    await browserExtractPage();
    if (!_browserPageText) return;
  }

  const output = document.getElementById('llmOutput');
  // Show user question
  const qDiv = document.createElement('div');
  qDiv.className = 'llm-chat-user';
  qDiv.textContent = question;
  if (output) output.appendChild(qDiv);
  if (input) input.value = '';

  // Show loading
  const loadDiv = document.createElement('div');
  loadDiv.className = 'llm-loading';
  loadDiv.textContent = 'Thinking…';
  if (output) output.appendChild(loadDiv);
  output.scrollTop = output.scrollHeight;

  const statusEl = document.getElementById('llmStatus');
  if (statusEl) statusEl.textContent = 'Asking LLM...';

  try {
    const r = await _browserApi('POST', '/api/browser/ask-page', {
      question, text: _browserPageText, url: _browserPageUrl,
      history: _browserAskHistory.slice(-10)
    });
    loadDiv.remove();
    if (r.ok) {
      _browserAskHistory.push({ role: 'user', content: question });
      _browserAskHistory.push({ role: 'assistant', content: r.answer });
      const aDiv = document.createElement('div');
      aDiv.className = 'llm-chat-assistant';
      aDiv.innerHTML = _llmFormatMarkdown(r.answer);
      if (r.citations && r.citations.length) {
        const cite = document.createElement('div');
        cite.className = 'llm-citation';
        cite.innerHTML = '📎 Source: ' + r.citations.map(c => `<a href="#" onclick="browserNavigate('${_escHtml(c.source)}');return false">${_escHtml(_truncate(c.source, 40))}</a>`).join(', ');
        aDiv.appendChild(cite);
      }
      if (output) output.appendChild(aDiv);
      output.scrollTop = output.scrollHeight;
      if (statusEl) statusEl.textContent = 'Answer ready' + (r.usage ? ` (${r.usage.total_tokens} tokens)` : '');
    } else {
      loadDiv.remove();
      const errDiv = document.createElement('div');
      errDiv.className = 'llm-error';
      errDiv.textContent = r.message || 'Failed to get answer';
      if (output) output.appendChild(errDiv);
    }
  } catch (err) {
    loadDiv.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'llm-error';
    errDiv.textContent = err.message;
    if (output) output.appendChild(errDiv);
  }
}

// ─── Structured Extraction ────────────────────────────────────────────────────
async function browserExtractStructured(type) {
  if (!_browserPageText) {
    await browserExtractPage();
    if (!_browserPageText) return;
  }
  const output = document.getElementById('llmOutput');
  const statusEl = document.getElementById('llmStatus');
  if (output) output.innerHTML = `<div class="llm-loading">Extracting ${type}…</div>`;
  if (statusEl) statusEl.textContent = `Extracting ${type}...`;

  try {
    const r = await _browserApi('POST', '/api/browser/extract-structured', {
      type, text: _browserPageText, url: _browserPageUrl
    });
    if (r.ok) {
      _llmRenderExtraction(type, r.data, r.usage);
      if (statusEl) statusEl.textContent = `${type} extraction complete` + (r.usage ? ` (${r.usage.total_tokens} tokens)` : '');
    } else {
      if (output) output.innerHTML = `<div class="llm-error">${_escHtml(r.message || 'Extraction failed')}</div>`;
    }
  } catch (err) {
    if (output) output.innerHTML = `<div class="llm-error">${_escHtml(err.message)}</div>`;
  }
}

function _llmRenderExtraction(type, data, usage) {
  const output = document.getElementById('llmOutput');
  if (!output) return;
  const titles = { tables: '📊 Tables', entities: '🏷️ Entities', links: '🔗 Links', outline: '📑 Outline' };
  let html = `<div class="llm-result-header">${titles[type] || type}</div>`;

  if (typeof data === 'string') {
    html += `<pre class="llm-raw">${_escHtml(data)}</pre>`;
  } else if (Array.isArray(data)) {
    if (type === 'tables') {
      data.forEach(table => {
        html += `<div class="llm-table-wrap">`;
        if (table.caption) html += `<div class="llm-table-caption">${_escHtml(table.caption)}</div>`;
        html += '<table class="llm-table"><thead><tr>';
        (table.headers || []).forEach(h => { html += `<th>${_escHtml(h)}</th>`; });
        html += '</tr></thead><tbody>';
        (table.rows || []).forEach(row => {
          html += '<tr>';
          (Array.isArray(row) ? row : []).forEach(cell => { html += `<td>${_escHtml(String(cell))}</td>`; });
          html += '</tr>';
        });
        html += '</tbody></table></div>';
      });
      if (data.length === 0) html += '<div class="llm-empty">No tables found on this page.</div>';
    } else if (type === 'entities') {
      if (data.length === 0) { html += '<div class="llm-empty">No named entities found.</div>'; }
      else {
        html += '<div class="llm-entity-list">';
        data.forEach(e => {
          html += `<div class="llm-entity"><span class="llm-entity-type">${_escHtml(e.type || 'other')}</span> <strong>${_escHtml(e.name || '')}</strong> <span class="llm-entity-ctx">${_escHtml(e.context || '')}</span></div>`;
        });
        html += '</div>';
      }
    } else if (type === 'links') {
      if (data.length === 0) { html += '<div class="llm-empty">No links found.</div>'; }
      else {
        html += '<div class="llm-link-list">';
        data.forEach(l => {
          const urlPart = l.url ? ` <a href="#" onclick="browserNavigate(\'${_escHtml(l.url)}\');return false" class="llm-link-url">${_escHtml(_truncate(l.url, 40))}</a>` : '';
          html += `<div class="llm-link-row"><span class="llm-link-cat">${_escHtml(l.category || '')}</span> ${_escHtml(l.text || '')}${urlPart}</div>`;
        });
        html += '</div>';
      }
    } else if (type === 'outline') {
      if (data.length === 0) { html += '<div class="llm-empty">Could not build outline.</div>'; }
      else {
        html += '<div class="llm-outline">';
        data.forEach(item => {
          const indent = Math.max(0, (item.level || 1) - 1) * 16;
          html += `<div class="llm-outline-item" style="padding-left:${indent}px"><strong>${_escHtml(item.text || '')}</strong> <span class="llm-outline-summary">${_escHtml(item.summary || '')}</span></div>`;
        });
        html += '</div>';
      }
    } else {
      html += `<pre class="llm-raw">${_escHtml(JSON.stringify(data, null, 2))}</pre>`;
    }
  }
  output.innerHTML = html;
}

// ─── Save to Entity Memory (with confirmation) ───────────────────────────────
function browserSaveToMemory() {
  const output = document.getElementById('llmOutput');
  if (!output || !output.textContent.trim()) {
    if (typeof showNotification === 'function') showNotification('Nothing to save — run an analysis first', 'warning');
    return;
  }
  // Show confirmation dialog
  const dialog = document.getElementById('llmSaveConfirm');
  if (dialog) {
    const preview = document.getElementById('llmSavePreview');
    if (preview) preview.textContent = _truncate(output.textContent, 400);
    dialog.classList.remove('hidden');
  }
}

function browserConfirmSave() {
  const dialog = document.getElementById('llmSaveConfirm');
  if (dialog) dialog.classList.add('hidden');

  const output = document.getElementById('llmOutput');
  const content = output ? output.textContent.trim() : '';
  if (!content) return;

  const topicsInput = document.getElementById('llmSaveTopics');
  const topics = topicsInput ? topicsInput.value.split(',').map(t => t.trim()).filter(Boolean) : ['browser-research'];
  const saveType = _browserEphemeralMode ? 'semantic' : 'core';

  _browserApi('POST', '/api/browser/save-to-memory', {
    content, semantic: _truncate(content, 280),
    topics, saveType, sourceUrl: _browserPageUrl,
    importance: 0.7, emotion: 'curious'
  }).then(r => {
    if (r.ok) {
      if (typeof showNotification === 'function') showNotification('Saved to entity memory (' + saveType + ')', 'success');
    } else {
      if (typeof showNotification === 'function') showNotification('Save failed: ' + (r.message || 'Unknown'), 'error');
    }
  }).catch(err => {
    if (typeof showNotification === 'function') showNotification('Save error: ' + err.message, 'error');
  });
}

function browserCancelSave() {
  const dialog = document.getElementById('llmSaveConfirm');
  if (dialog) dialog.classList.add('hidden');
}

// ─── Ephemeral vs Saved Toggle ────────────────────────────────────────────────
function browserToggleEphemeral() {
  _browserEphemeralMode = !_browserEphemeralMode;
  const btn = document.getElementById('llmEphemeralBtn');
  if (btn) {
    btn.textContent = _browserEphemeralMode ? '👁 Ephemeral' : '💾 Saved';
    btn.title = _browserEphemeralMode
      ? 'Analysis is ephemeral — nothing auto-saved. Click to switch.'
      : 'Analysis auto-tracked in research session. Click to switch.';
  }
}

// ─── Research Sessions ────────────────────────────────────────────────────────
async function browserNewResearchSession() {
  const title = prompt('Research session title:', 'Research ' + new Date().toLocaleDateString());
  if (!title) return;
  const r = await _browserApi('POST', '/api/browser/research/create', { title });
  if (r.ok) {
    _browserResearchSessionId = r.session.id;
    if (typeof showNotification === 'function') showNotification('Research session started: ' + title, 'success');
    _llmUpdateSessionLabel();
  }
}

async function browserEndResearchSession() {
  _browserResearchSessionId = null;
  _llmUpdateSessionLabel();
}

function _llmUpdateSessionLabel() {
  const label = document.getElementById('llmSessionLabel');
  if (!label) return;
  if (_browserResearchSessionId) {
    label.textContent = '📂 Session Active';
    label.title = 'Research session: ' + _browserResearchSessionId;
  } else {
    label.textContent = '';
  }
}

// ─── Render Helpers ───────────────────────────────────────────────────────────
function _llmRenderOutput(title, content, citations, usage) {
  const output = document.getElementById('llmOutput');
  if (!output) return;
  let html = `<div class="llm-result-header">${_escHtml(title)}</div>`;
  html += `<div class="llm-result-body">${_llmFormatMarkdown(content)}</div>`;
  if (citations && citations.length) {
    html += '<div class="llm-citations">';
    citations.forEach(c => {
      html += `<div class="llm-citation">📎 <a href="#" onclick="browserNavigate('${_escHtml(c.source)}');return false">${_escHtml(_truncate(c.source, 50))}</a>`;
      if (c.excerpt) html += ` — <em>${_escHtml(_truncate(c.excerpt, 100))}</em>`;
      html += '</div>';
    });
    html += '</div>';
  }
  output.innerHTML = html;
}

function _llmFormatMarkdown(text) {
  if (!text) return '';
  // Basic markdown → HTML (headings, bold, italic, code, lists, links)
  return _escHtml(text)
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function _llmClearOutput() {
  const output = document.getElementById('llmOutput');
  if (output) output.innerHTML = '';
  _browserAskHistory = [];
  const statusEl = document.getElementById('llmStatus');
  if (statusEl) statusEl.textContent = '';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initBrowserApp() {
  if (_browserInitialized) return;
  _browserInitialized = true;

  await _browserLoadSettings();
  _browserLoadSearchHistory();
  await _browserLoadBookmarks();

  // Try session restore if enabled
  const shouldRestore = _browserSettings.sessionRestore !== false;
  const restored = shouldRestore ? await _browserRestoreSession() : false;
  if (!restored) {
    await browserNewTab();
  }

  _browserUpdateTabStrip();
  _browserRenderHome();
  _browserUpdateBookmarkStar();
  _browserPopulateSettingsUI();
  _browserReportStatus();

  // Start periodic status reporting (for task manager)
  _browserStatusTimer = setInterval(_browserReportStatus, 3000);

  // Register keyboard shortcuts
  document.addEventListener('keydown', _browserHandleKeydown);

  // Hook into SSE if available
  if (typeof window._browserSSERegistered === 'undefined') {
    window._browserSSERegistered = true;
    const origOnMessage = window._sseOnMessage;
    window._sseOnMessage = function(eventType, data) {
      if (origOnMessage) origOnMessage(eventType, data);
      _browserHandleSSE(eventType, data);
    };
  }
}

// ─── Compatibility shims for app.js references ───────────────────────────────
// These are called from app.js init and other legacy paths
function loadBrowserSearchHistory() { _browserLoadSearchHistory(); }
function renderBrowserSearchHome() { if (_browserInitialized) _browserRenderSearchChips(); }
function openBrowserHome() { browserGoHome(); }
function navigateBrowserToInput() { browserNavigateFromInput(); }
function executeBrowserSearch() { browserExecuteSearch(); }
function showBrowserHomeView() { _browserShowHomeView(); }
function showBrowserPageView() { _browserShowPageView(); }
function showBrowserResultsView() { _browserShowResultsView(); }
function openBrowserExternal() { browserOpenExternal(); }

// ─── Exports for shell integration (NB-5) ────────────────────────────────────
// openInBrowser(url) — launch routing: opens browser window and navigates
// browserCleanup() — graceful shutdown: save session synchronously
// browserSaveSettingsFromUI() — save settings from Advanced tab form
// browserResetSettings() — reset to defaults
// browserClearHistory() — clear all history
// browserClearBookmarks() — clear all bookmarks
// browserOpenBookmarkManager() — open bookmark manager panel
// browserCloseBookmarkManager() — close bookmark manager panel
// browserOpenHistoryManager() — open history manager panel
// browserCloseHistoryManager() — close history manager panel
// browserExportBookmarks() — export bookmarks as JSON file
// browserImportBookmarks() — import bookmarks from JSON file
// browserExportSettings() — export settings as JSON file
// browserImportSettings() — import settings from JSON file
// browserExportHistory() — export history as JSON file
// bmAddBookmarkFromManager() — add bookmark from manager form
// _bmFilterChanged() — bookmark manager search handler
// _bmFolderChanged() — bookmark manager folder filter handler
// _histFilterChanged() — history manager search handler
// histClearAll() — clear all history from manager
// histDeleteToday() — delete today's history from manager

// ─── Exports for LLM Mode (NB-6) ─────────────────────────────────────────────
// browserToggleLLMMode() — toggle between Human and LLM mode
// browserExtractPage() — extract current page content
// browserSummarizePage() — summarize current page via LLM
// browserAskPage() — ask a question about current page
// browserExtractStructured(type) — extract tables/entities/links/outline
// browserSaveToMemory() — save analysis to entity memory (with confirmation)
// browserConfirmSave() — confirm memory save
// browserCancelSave() — cancel memory save
// browserToggleEphemeral() — toggle ephemeral vs saved mode
// browserNewResearchSession() — create new research session
// browserEndResearchSession() — end current research session
// _llmClearOutput() — clear LLM output panel
