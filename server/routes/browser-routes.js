'use strict';

/**
 * NekoCore — Browser Routes (NB-2-5)
 *
 * HTTP surface for browser host commands.
 * Follows the existing route-module factory pattern:
 *   createBrowserRoutes(ctx) → { dispatch(req, res, url, apiHeaders) → boolean }
 *
 * Endpoints implemented (from NB-1-2 contract):
 *   GET  /api/browser/session   — host state snapshot
 *   GET  /api/browser/tabs      — all tabs
 *   GET  /api/browser/downloads — all downloads
 *   POST /api/browser/command/navigate      — navigate active tab
 *   POST /api/browser/command/tab-create    — create a new tab
 *   POST /api/browser/command/tab-activate  — switch active tab
 *   POST /api/browser/command/tab-close     — close a tab
 *   POST /api/browser/command/reload        — reload active tab
 *   POST /api/browser/command/go-back       — navigate back
 *   POST /api/browser/command/go-forward    — navigate forward
 */

const browserHost = require('../browser-host');
const { tabModel, navigation, lifecycle, downloadManager, eventBus } = browserHost;

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

  // ── helpers ───────────────────────────────────────────────────────────────
  function json(res, apiHeaders, status, body) {
    res.writeHead(status, apiHeaders);
    res.end(JSON.stringify(body));
  }

  function errEnvelope(res, apiHeaders, status, code, message) {
    json(res, apiHeaders, status, { ok: false, code, message });
  }

  // ── dispatch ──────────────────────────────────────────────────────────────
  async function dispatch(req, res, url, apiHeaders) {
    const p = url.pathname;

    // ── READ endpoints ────────────────────────────────────────────────────
    if (req.method === 'GET' && p === '/api/browser/session') {
      json(res, apiHeaders, 200, {
        ok: true,
        hostState: lifecycle.getHostState(),
        activeTabId: tabModel.getActiveTabId(),
        tabCount: tabModel.getTabCount(),
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

    // ── COMMAND endpoints ─────────────────────────────────────────────────
    if (req.method === 'POST' && p.startsWith('/api/browser/command/')) {
      const cmd = p.replace('/api/browser/command/', '');
      let body = {};
      try {
        const raw = await ctx.readBody(req);
        if (raw) body = JSON.parse(raw);
      } catch {
        errEnvelope(res, apiHeaders, 400, 'INVALID_JSON', 'Request body is not valid JSON');
        return true;
      }

      switch (cmd) {
        case 'navigate': {
          const tabId = body.tabId || tabModel.getActiveTabId();
          if (!tabId) { errEnvelope(res, apiHeaders, 400, 'NO_ACTIVE_TAB', 'No active tab'); return true; }
          if (!body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_URL', 'url is required'); return true; }
          const result = navigation.navigate(tabId, body.url);
          json(res, apiHeaders, result.ok ? 200 : 400, result);
          return true;
        }

        case 'tab-create': {
          const tab = tabModel.createTab({ makeActive: body.makeActive !== false });
          json(res, apiHeaders, 201, { ok: true, tab });
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

        default:
          errEnvelope(res, apiHeaders, 404, 'UNKNOWN_COMMAND', `Unknown browser command: ${cmd}`);
          return true;
      }
    }

    // OPTIONS preflight for /api/browser/**
    if (req.method === 'OPTIONS' && p.startsWith('/api/browser/')) {
      res.writeHead(204, apiHeaders);
      res.end();
      return true;
    }

    return false; // not ours
  }

  return { dispatch };
}

module.exports = createBrowserRoutes;
