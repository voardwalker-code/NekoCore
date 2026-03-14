/**
 * NekoCore Browser — Client Core (NB-4 Shell Integration)
 *
 * Multi-tab browser with address bar, history, bookmarks, downloads panel,
 * session restore, web search, settings integration, shell status reporting,
 * launch routing, and iframe fallback handling.
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
  for (const [id, tab] of _browserTabs) {
    const btn = document.createElement('button');
    btn.className = 'browser-tab-btn' + (id === _browserActiveTabId ? ' active' : '');
    btn.dataset.tabId = id;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'browser-tab-title';
    titleSpan.textContent = tab.loading ? '⏳ Loading...' : _truncate(tab.title || 'New Tab', 24);
    titleSpan.title = tab.url || '';
    btn.appendChild(titleSpan);
    const closeBtn = document.createElement('span');
    closeBtn.className = 'browser-tab-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = (e) => { e.stopPropagation(); browserCloseTab(id); };
    btn.appendChild(closeBtn);
    btn.onclick = () => browserActivateTab(id);
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
  // Remove one by one via API (bookmark store has no clear-all)
  for (const bm of [..._browserBookmarks]) {
    await _browserApi('POST', '/api/browser/bookmarks/remove', { url: bm.url });
  }
  _browserBookmarks = [];
  _browserRenderHomeBookmarks();
  _browserUpdateBookmarkStar();
  if (typeof showNotification === 'function') showNotification('All bookmarks removed', 'success');
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

// ─── Exports for shell integration (NB-4) ────────────────────────────────────
// openInBrowser(url) — launch routing: opens browser window and navigates
// browserCleanup() — graceful shutdown: save session synchronously
// browserSaveSettingsFromUI() — save settings from Advanced tab form
// browserResetSettings() — reset to defaults
// browserClearHistory() — clear all history
// browserClearBookmarks() — clear all bookmarks
// _browserReportStatus() — update task manager browser card
