'use strict';

/**
 * NekoCore — Browser Routes (NB-6 LLM Mode Foundation)
 *
 * HTTP surface for browser host commands, history, bookmarks, session,
 * and LLM-powered page analysis, chat, structured extraction, and research sessions.
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
        historyStore, bookmarkStore, sessionStore, settingsStore, researchSession } = browserHost;

function createBrowserRoutes(ctx) {
  const { broadcastSSE, webFetch, callLLMWithRuntime, loadAspectRuntimeConfig,
          createCoreMemory, createSemanticKnowledge } = ctx;

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
      const q = url.searchParams.get('q') || '';
      const bookmarks = q ? bookmarkStore.search(q) : bookmarkStore.getAll();
      json(res, apiHeaders, 200, { ok: true, bookmarks });
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

    if (req.method === 'GET' && p === '/api/browser/settings') {
      json(res, apiHeaders, 200, { ok: true, settings: settingsStore.getAll() });
      return true;
    }

    if (req.method === 'GET' && p === '/api/browser/status') {
      json(res, apiHeaders, 200, {
        ok: true,
        tabCount: tabModel.getTabCount(),
        activeTabId: tabModel.getActiveTabId(),
        activeTab: tabModel.getTab(tabModel.getActiveTabId()),
        hostState: lifecycle.getHostState(),
        downloadCount: downloadManager.getAllDownloads().length,
      });
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
      if (p === '/api/browser/history/delete') {
        if (!body.id) { errEnvelope(res, apiHeaders, 400, 'MISSING_ID', 'id is required'); return true; }
        const deleted = historyStore.deleteEntry(body.id);
        json(res, apiHeaders, 200, { ok: true, deleted });
        return true;
      }
      if (p === '/api/browser/history/delete-range') {
        if (!body.startMs || !body.endMs) { errEnvelope(res, apiHeaders, 400, 'MISSING_RANGE', 'startMs and endMs are required'); return true; }
        const count = historyStore.deleteByDateRange(body.startMs, body.endMs);
        json(res, apiHeaders, 200, { ok: true, deletedCount: count });
        return true;
      }
      if (p === '/api/browser/history/clear') {
        historyStore.clear();
        json(res, apiHeaders, 200, { ok: true });
        return true;
      }
      if (p === '/api/browser/history/export') {
        json(res, apiHeaders, 200, { ok: true, entries: historyStore.exportAll() });
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
      if (p === '/api/browser/bookmarks/update') {
        if (!body.id) { errEnvelope(res, apiHeaders, 400, 'MISSING_ID', 'id is required'); return true; }
        const updated = bookmarkStore.update(body.id, body);
        if (!updated) { errEnvelope(res, apiHeaders, 404, 'BOOKMARK_NOT_FOUND', 'Bookmark not found'); return true; }
        json(res, apiHeaders, 200, { ok: true, bookmark: updated });
        return true;
      }
      if (p === '/api/browser/bookmarks/clear') {
        bookmarkStore.clear();
        json(res, apiHeaders, 200, { ok: true });
        return true;
      }
      if (p === '/api/browser/bookmarks/export') {
        json(res, apiHeaders, 200, { ok: true, bookmarks: bookmarkStore.exportAll() });
        return true;
      }
      if (p === '/api/browser/bookmarks/import') {
        if (!Array.isArray(body.bookmarks)) { errEnvelope(res, apiHeaders, 400, 'INVALID_DATA', 'bookmarks array is required'); return true; }
        const count = bookmarkStore.importBookmarks(body.bookmarks);
        json(res, apiHeaders, 200, { ok: true, importedCount: count, bookmarks: bookmarkStore.getAll() });
        return true;
      }
      if (p === '/api/browser/bookmarks/folders') {
        json(res, apiHeaders, 200, { ok: true, folders: bookmarkStore.getFolders() });
        return true;
      }

      // Session sub-routes
      if (p === '/api/browser/session/save') {
        const snapshot = sessionStore.save(tabModel.getAllTabs(), tabModel.getActiveTabId());
        json(res, apiHeaders, 200, { ok: true, snapshot });
        return true;
      }

      // Settings sub-routes
      if (p === '/api/browser/settings/update') {
        const settings = settingsStore.update(body);
        json(res, apiHeaders, 200, { ok: true, settings });
        return true;
      }
      if (p === '/api/browser/settings/reset') {
        const settings = settingsStore.reset();
        json(res, apiHeaders, 200, { ok: true, settings });
        return true;
      }
      if (p === '/api/browser/settings/export') {
        json(res, apiHeaders, 200, { ok: true, settings: settingsStore.getAll() });
        return true;
      }

      // ── LLM Mode endpoints (NB-6) ────────────────────────────────────────

      // Extract page content server-side
      if (p === '/api/browser/extract-page') {
        if (!body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_URL', 'url is required'); return true; }
        try {
          const result = await webFetch.fetchAndExtract(body.url);
          json(res, apiHeaders, 200, { ok: true, url: result.url, text: result.text, type: result.type });
        } catch (err) {
          errEnvelope(res, apiHeaders, 502, 'FETCH_FAILED', 'Failed to extract page: ' + err.message);
        }
        return true;
      }

      // Summarize page content using LLM
      if (p === '/api/browser/summarize') {
        if (!body.text && !body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_INPUT', 'text or url is required'); return true; }
        const runtime = loadAspectRuntimeConfig('main');
        if (!runtime) { errEnvelope(res, apiHeaders, 503, 'NO_LLM', 'No LLM configured'); return true; }

        let pageText = body.text || '';
        let pageUrl = body.url || '';
        if (!pageText && pageUrl) {
          try {
            const fetched = await webFetch.fetchAndExtract(pageUrl);
            pageText = fetched.text;
          } catch (err) {
            errEnvelope(res, apiHeaders, 502, 'FETCH_FAILED', err.message);
            return true;
          }
        }

        const messages = [
          { role: 'system', content: 'You are a research assistant in the NekoCore Browser. Summarize the following web page content concisely. Include key points, main arguments, and important details. Always cite specific parts of the text when making claims. Format with markdown.' },
          { role: 'user', content: `Page URL: ${pageUrl}\n\n--- PAGE CONTENT ---\n${pageText.slice(0, 12000)}` }
        ];

        try {
          const response = await callLLMWithRuntime(runtime, messages, { temperature: 0.3, maxTokens: 2000, returnUsage: true });
          const content = typeof response === 'string' ? response : response.content;
          const usage = typeof response === 'string' ? null : response.usage;

          // Track in research session if active
          const session = researchSession.getActiveSession();
          if (session) {
            researchSession.addPage(session.id, { url: pageUrl, title: body.title || pageUrl, extractedText: pageText.slice(0, 4000) });
            researchSession.addExtraction(session.id, { type: 'summary', data: content, pageUrl });
          }

          json(res, apiHeaders, 200, { ok: true, summary: content, usage, pageUrl, citations: [{ source: pageUrl, excerpt: pageText.slice(0, 200) }] });
        } catch (err) {
          errEnvelope(res, apiHeaders, 500, 'LLM_ERROR', 'Summarization failed: ' + err.message);
        }
        return true;
      }

      // Ask a question about a page
      if (p === '/api/browser/ask-page') {
        if (!body.question) { errEnvelope(res, apiHeaders, 400, 'MISSING_QUESTION', 'question is required'); return true; }
        if (!body.text && !body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_INPUT', 'text or url is required'); return true; }
        const runtime = loadAspectRuntimeConfig('main');
        if (!runtime) { errEnvelope(res, apiHeaders, 503, 'NO_LLM', 'No LLM configured'); return true; }

        let pageText = body.text || '';
        let pageUrl = body.url || '';
        if (!pageText && pageUrl) {
          try {
            const fetched = await webFetch.fetchAndExtract(pageUrl);
            pageText = fetched.text;
          } catch (err) {
            errEnvelope(res, apiHeaders, 502, 'FETCH_FAILED', err.message);
            return true;
          }
        }

        // Build conversation (include previous messages if provided)
        const chatHistory = Array.isArray(body.history) ? body.history.slice(-10) : [];
        const messages = [
          { role: 'system', content: `You are a research assistant in the NekoCore Browser. Answer questions using ONLY the page content provided below. Always cite specific quotes from the content to support your answers. If the answer isn't in the content, say so clearly. Format with markdown.\n\n--- PAGE CONTENT (from ${pageUrl}) ---\n${pageText.slice(0, 12000)}` },
          ...chatHistory.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: body.question }
        ];

        try {
          const response = await callLLMWithRuntime(runtime, messages, { temperature: 0.3, maxTokens: 2000, returnUsage: true });
          const content = typeof response === 'string' ? response : response.content;
          const usage = typeof response === 'string' ? null : response.usage;

          // Track in research session if active
          const session = researchSession.getActiveSession();
          if (session) {
            researchSession.addMessage(session.id, { role: 'user', content: body.question });
            researchSession.addMessage(session.id, { role: 'assistant', content, citations: [{ source: pageUrl }] });
          }

          json(res, apiHeaders, 200, { ok: true, answer: content, usage, pageUrl, citations: [{ source: pageUrl, excerpt: pageText.slice(0, 200) }] });
        } catch (err) {
          errEnvelope(res, apiHeaders, 500, 'LLM_ERROR', 'Ask-page failed: ' + err.message);
        }
        return true;
      }

      // Structured extraction (tables, entities, links, outline)
      if (p === '/api/browser/extract-structured') {
        if (!body.type) { errEnvelope(res, apiHeaders, 400, 'MISSING_TYPE', 'type is required (tables|entities|links|outline)'); return true; }
        if (!body.text && !body.url) { errEnvelope(res, apiHeaders, 400, 'MISSING_INPUT', 'text or url is required'); return true; }
        const runtime = loadAspectRuntimeConfig('main');
        if (!runtime) { errEnvelope(res, apiHeaders, 503, 'NO_LLM', 'No LLM configured'); return true; }

        let pageText = body.text || '';
        let pageUrl = body.url || '';
        if (!pageText && pageUrl) {
          try {
            const fetched = await webFetch.fetchAndExtract(pageUrl);
            pageText = fetched.text;
          } catch (err) {
            errEnvelope(res, apiHeaders, 502, 'FETCH_FAILED', err.message);
            return true;
          }
        }

        const extractionPrompts = {
          tables: 'Extract all tabular data from this page content. Return a JSON array of objects where each object represents a table with keys: "caption" (string), "headers" (string array), "rows" (array of string arrays). If no tables found, return an empty array.',
          entities: 'Extract all named entities from this page content. Return a JSON array of objects with keys: "name" (string), "type" (one of "person", "organization", "location", "product", "event", "other"), "context" (short excerpt where mentioned). If no entities found, return an empty array.',
          links: 'Extract and categorize all meaningful links/references mentioned in this page. Return a JSON array of objects with keys: "text" (link text), "url" (if available), "category" (one of "navigation", "reference", "resource", "social", "other"). If no links found, return an empty array.',
          outline: 'Create a structured outline/table of contents from this page. Return a JSON array of objects with keys: "level" (1-4), "text" (heading/section text), "summary" (1-sentence summary of that section). If structure is unclear, create a logical outline from content.'
        };

        const prompt = extractionPrompts[body.type];
        if (!prompt) { errEnvelope(res, apiHeaders, 400, 'INVALID_TYPE', 'type must be one of: tables, entities, links, outline'); return true; }

        const messages = [
          { role: 'system', content: `You are a structured data extraction assistant. ${prompt}\n\nRespond with ONLY valid JSON — no markdown fences, no explanation.` },
          { role: 'user', content: `--- PAGE CONTENT (from ${pageUrl}) ---\n${pageText.slice(0, 12000)}` }
        ];

        try {
          const response = await callLLMWithRuntime(runtime, messages, { temperature: 0.1, maxTokens: 3000, returnUsage: true });
          const raw = typeof response === 'string' ? response : response.content;
          const usage = typeof response === 'string' ? null : response.usage;
          let data;
          try {
            data = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim());
          } catch {
            data = raw;
          }

          // Track in research session if active
          const session = researchSession.getActiveSession();
          if (session) {
            researchSession.addExtraction(session.id, { type: body.type, data, pageUrl });
          }

          json(res, apiHeaders, 200, { ok: true, type: body.type, data, usage, pageUrl });
        } catch (err) {
          errEnvelope(res, apiHeaders, 500, 'LLM_ERROR', 'Extraction failed: ' + err.message);
        }
        return true;
      }

      // Save analysis result to entity memory (requires user confirmation on client)
      if (p === '/api/browser/save-to-memory') {
        if (!body.content) { errEnvelope(res, apiHeaders, 400, 'MISSING_CONTENT', 'content is required'); return true; }
        if (!ctx.currentEntityId) { errEnvelope(res, apiHeaders, 400, 'NO_ENTITY', 'No active entity — cannot save to memory'); return true; }

        const semantic = (body.semantic || body.content).slice(0, 280);
        const topics = Array.isArray(body.topics) ? body.topics : ['browser-research'];
        const saveType = body.saveType || 'semantic'; // 'core' or 'semantic'

        try {
          let result;
          if (saveType === 'core') {
            result = createCoreMemory({
              semantic,
              narrative: body.content,
              emotion: body.emotion || 'curious',
              topics,
              importance: body.importance || 0.7,
            });
          } else {
            result = createSemanticKnowledge({
              knowledge: body.content.slice(0, 2000),
              topics,
              importance: body.importance || 0.6,
            });
          }
          // Mark research session as saved if active
          const session = researchSession.getActiveSession();
          if (session) researchSession.markSaved(session.id);

          json(res, apiHeaders, 200, { ok: true, saveType, memResult: result, source: body.sourceUrl || '' });
        } catch (err) {
          errEnvelope(res, apiHeaders, 500, 'SAVE_FAILED', 'Memory save failed: ' + err.message);
        }
        return true;
      }

      // ── Research Session endpoints ──────────────────────────────────────

      if (p === '/api/browser/research/list') {
        json(res, apiHeaders, 200, { ok: true, sessions: researchSession.listSessions() });
        return true;
      }

      if (p === '/api/browser/research/create') {
        const session = researchSession.createSession(body.title);
        json(res, apiHeaders, 201, { ok: true, session });
        return true;
      }

      if (p === '/api/browser/research/get') {
        if (!body.id) { errEnvelope(res, apiHeaders, 400, 'MISSING_ID', 'id is required'); return true; }
        const session = researchSession.getSession(body.id);
        if (!session) { errEnvelope(res, apiHeaders, 404, 'NOT_FOUND', 'Session not found'); return true; }
        json(res, apiHeaders, 200, { ok: true, session });
        return true;
      }

      if (p === '/api/browser/research/activate') {
        if (!body.id) { errEnvelope(res, apiHeaders, 400, 'MISSING_ID', 'id is required'); return true; }
        const session = researchSession.setActiveSession(body.id);
        if (!session) { errEnvelope(res, apiHeaders, 404, 'NOT_FOUND', 'Session not found'); return true; }
        json(res, apiHeaders, 200, { ok: true, session });
        return true;
      }

      if (p === '/api/browser/research/active') {
        const session = researchSession.getActiveSession();
        json(res, apiHeaders, 200, { ok: true, session });
        return true;
      }

      if (p === '/api/browser/research/delete') {
        if (!body.id) { errEnvelope(res, apiHeaders, 400, 'MISSING_ID', 'id is required'); return true; }
        const deleted = researchSession.deleteSession(body.id);
        json(res, apiHeaders, 200, { ok: true, deleted });
        return true;
      }

      if (p === '/api/browser/research/clear') {
        researchSession.clearSessions();
        json(res, apiHeaders, 200, { ok: true });
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
