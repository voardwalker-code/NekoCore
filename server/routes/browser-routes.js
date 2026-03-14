'use strict';

/**
 * NekoCore — Browser Routes (NB-3 Browser Core MVP)
 *
 * HTTP surface for browser host commands, history, bookmarks, and session.
 * Follows the existing route-module factory pattern.
 *
 * Endpoints:
 *   GET  /api/browser/session        — host state + active tab snapshot
 *   GET  /api/browser/tabs           — all tabs
 *   GET  /api/browser/downloads      — all downloads
 *   GET  /api/browser/history        — browsing history (optional ?q= search)
 *   GET  /api/browser/bookmarks      — all bookmarks
 *   GET  /api/browser/bookmark-check — check if URL is bookmarked (?url=)
 *   GET  /api/browser/session-restore — load saved session for restore
 *   POST /api/browser/command/navigate      — navigate tab
 *   POST /api/browser/command/tab-create    — create new tab
 *   POST /api/browser/command/tab-activate  — switch active tab
 *   POST /api/browser/command/tab-close     — close tab
 *   POST /api/browser/command/reload        — reload tab
 *   POST /api/browser/command/go-back       — navigate back
 *   POST /api/browser/command/go-forward    — navigate forward
 *   POST /api/browser/history/add           — add history entry
 *   POST /api/browser/history/clear         — clear all history
 *   POST /api/browser/bookmarks/add         — add bookmark
 *   POST /api/browser/bookmarks/remove      — remove bookmark by id or url
 *   POST /api/browser/session/save          — save current session
 */

const browserHost = require('../../browser-host');
const { tabModel, navigation, lifecycle, downloadManager, eventBus,
        historyStore, bookmarkStore, sessionStore } = browserHost;

function createBrowserRoutes(ctx) {
  const { broadcastSSE } = ctx;

  // Forward all browser events to SSE clients
  eventBus.on('*', (ev) => {
    if (ev.channel && broadcastSSE) {
      broadcastSSE(ev.channel, ev);
    }
  });

  // Boot the browser host when routes are registered
  if (!lifecycle.getHostState()) {
    lifecycle.startup();
  }

  function json(res, apiHeaders, status, body) {
    res.writeHead(status, apiHeaders);
    res.end(JSON.stringify(body));
  }

  function errEnvelope(res, apiHeaders, status, code, message) {
    json(res, apiHeaders, status, { ok: false, code, message });
  }

  async function dispatch(req, res, url, apiHeaders) {
    const p = url.pathname;

    // ── READ endpoints ────────────────────────────────────────────────────
    if (req.method === 'GET' && p === '/api/browser/session') {
      json(res, apiHeaders, 200, {
        ok: true,
        hostState: lifecycle.getHostState(),
        activeTabId: tabModel.getActiveTabId(),
        tabCount: tabModel.getTabCount(),
        tabs: tabModel.getAllTabs(),
      });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/tabs') {
      json(res, apiHeaders, 200, { ok: true, tabs: tabModel.getAllTabs() });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/downloads') {
      json(res, apiHeaders, 200, { ok: true, downloads: downloadManager.getAllDownloads() });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/history') {
      const q = url.searchParams.get('q') || '';
      const entries = q ? historyStore.search(q) : historyStore.getAll();
      json(res, apiHeaders, 200, { ok: true, entries });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/bookmarks') {
      json(res, apiHeaders, 200, { ok: true, bookmarks: bookmarkStore.getAll() });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/bookmark-check') {
      const checkUrl = url.searchParams.get('url') || '';
      json(res, apiHeaders, 200, { ok: true, bookmarked: bookmarkStore.isBookmarked(checkUrl) });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/session-restore') {
      const session = sessionStore.load();
      json(res, apiHeaders, 200, { ok: true, session });
      return true;
    }

    // ── COMMAND endpoints ─────────────────────────────────────────────────
    if (req.method === 'POST' && p.startsWith('/api/browser/')) {
      let body = {};
      try {
        const raw = await ctx.readBody(req);
        if (raw) body = JSON.parse(raw);
      } catch {
        errEnvelope(res, apiHeaders, 400, 'INVALID_JSON', 'Request body is not valid JSON');
        return true;
      }

      // Command sub-routes
      if (p.startsWith('/api/browser/command/')) {
        const cmd = p.replace('/api/browser/command/', '');
        switch (cmd) {
          case 'navigate': {
            const tabId = body.tabId || tabModel.getActiveTabId();
            if (!tabId) { errEnvelope(res, apiHeaders, 400, 'NO_ACTIVE_TAB', 'No active tab'); return true; }
            if (!body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_URL', 'url is required'); return true; }
            const result = navigation.navigate(tabId, body.url);
            if (result.ok) {
              historyStore.addEntry(body.url, body.title || body.url);
            }
            json(res, apiHeaders, result.ok ? 200 : 400, result);
            return true;
          }
          case 'tab-create': {
            const tab = tabModel.createTab({ makeActive: body.makeActive !== false });
            if (body.url) {
              navigation.navigate(tab.tabId, body.url);
              if (body.title) tabModel.updateTabState(tab.tabId, { title: body.title });
            }
            json(res, apiHeaders, 201, { ok: true, tab: tabModel.getTab(tab.tabId) });
            return true;
          }
          case 'tab-activate': {
            if (!body.tabId) { errEnvelope(res, apiHeaders, 400, 'MISSING_TAB_ID', 'tabId is required'); return true; }
            const tab = tabModel.activateTab(body.tabId);
            if (!tab) { errEnvelope(res, apiHeaders, 404, 'TAB_NOT_FOUND', `Tab ${body.tabId} not found`); return true; }
            json(res, apiHeaders, 200, { ok: true, tab });
            return true;
          }
          case 'tab-close': {
            if (!body.tabId) { errEnvelope(res, apiHeaders, 400, 'MISSING_TAB_ID', 'tabId is required'); return true; }
            const newActive = tabModel.closeTab(body.tabId);
            // Auto-save session after close
            sessionStore.save(tabModel.getAllTabs(), tabModel.getActiveTabId());
            json(res, apiHeaders, 200, { ok: true, newActiveTabId: newActive });
            return true;
          }
          case 'reload': {
            const tabId = body.tabId || tabModel.getActiveTabId();
            if (!tabId) { errEnvelope(res, apiHeaders, 400, 'NO_ACTIVE_TAB', 'No active tab'); return true; }
            const result = navigation.reload(tabId, { hard: !!body.hard });
            json(res, apiHeaders, result.ok ? 200 : 400, result);
            return true;
          }
          case 'go-back': {
            const tabId = body.tabId || tabModel.getActiveTabId();
            if (!tabId) { errEnvelope(res, apiHeaders, 400, 'NO_ACTIVE_TAB', 'No active tab'); return true; }
            const result = navigation.goBack(tabId);
            json(res, apiHeaders, result.ok ? 200 : 400, result);
            return true;
          }
          case 'go-forward': {
            const tabId = body.tabId || tabModel.getActiveTabId();
            if (!tabId) { errEnvelope(res, apiHeaders, 400, 'NO_ACTIVE_TAB', 'No active tab'); return true; }
            const result = navigation.goForward(tabId);
            json(res, apiHeaders, result.ok ? 200 : 400, result);
            return true;
          }
          case 'update-tab': {
            const tabId = body.tabId || tabModel.getActiveTabId();
            if (!tabId) { errEnvelope(res, apiHeaders, 400, 'NO_ACTIVE_TAB', 'No active tab'); return true; }
            const fields = {};
            if (body.url != null) fields.url = body.url;
            if (body.title != null) fields.title = body.title;
            if (body.loading != null) fields.loading = body.loading;
            tabModel.updateTabState(tabId, fields);
            json(res, apiHeaders, 200, { ok: true, tab: tabModel.getTab(tabId) });
            return true;
          }
          default:
            errEnvelope(res, apiHeaders, 404, 'UNKNOWN_COMMAND', `Unknown browser command: ${cmd}`);
            return true;
        }
      }

      // History sub-routes
      if (p === '/api/browser/history/add') {
        if (!body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_URL', 'url is required'); return true; }
        const entry = historyStore.addEntry(body.url, body.title);
        json(res, apiHeaders, 201, { ok: true, entry });
        return true;
      }
      if (p === '/api/browser/history/clear') {
        historyStore.clear();
        json(res, apiHeaders, 200, { ok: true });
        return true;
      }

      // Bookmark sub-routes
      if (p === '/api/browser/bookmarks/add') {
        if (!body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_URL', 'url is required'); return true; }
        const bm = bookmarkStore.add(body.url, body.title, body.folder);
        json(res, apiHeaders, 201, { ok: true, bookmark: bm });
        return true;
      }
      if (p === '/api/browser/bookmarks/remove') {
        if (body.id) {
          bookmarkStore.remove(body.id);
        } else if (body.url) {
          bookmarkStore.removeByUrl(body.url);
        } else {
          errEnvelope(res, apiHeaders, 400, 'MISSING_ID_OR_URL', 'id or url is required');
          return true;
        }
        json(res, apiHeaders, 200, { ok: true });
        return true;
      }

      // Session sub-routes
      if (p === '/api/browser/session/save') {
        const snapshot = sessionStore.save(tabModel.getAllTabs(), tabModel.getActiveTabId());
        json(res, apiHeaders, 200, { ok: true, snapshot });
        return true;
      }

      return false;
    }

    // OPTIONS preflight
    if (req.method === 'OPTIONS' && p.startsWith('/api/browser/')) {
      res.writeHead(204, apiHeaders);
      res.end();
      return true;
    }

    return false;
  }

  return { dispatch };
}

module.exports = createBrowserRoutes;
