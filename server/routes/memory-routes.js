// ── Memory Routes ────────────────────────────────────────────
// /api/memories, /api/system-prompt, /api/session-meta, /api/persona,
// /api/status, /api/memory-heal, /api/memory-stats,
// /api/memories/search, /api/memories/reconstruct, /api/memory/detail,
// /api/visualizer/chat-history

function createMemoryRoutes(ctx) {
  const { fs, path, zlib } = ctx;
  const { enforceResponseContract } = require('../contracts/response-contracts');
  const reconstructCache = ctx.reconstructionCache instanceof Map ? ctx.reconstructionCache : new Map();
  const reconstructCacheTtlMs = Number.isFinite(ctx.reconstructionCacheTtlMs) ? ctx.reconstructionCacheTtlMs : 15 * 60 * 1000;

  function buildReconstructCacheKey(memoryId, text) {
    const raw = String(text || '');
    return `${memoryId}|${raw.length}|${raw.slice(0, 120)}`;
  }

  function getCachedReconstruction(cacheKey) {
    const now = Date.now();
    const hit = reconstructCache.get(cacheKey);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      reconstructCache.delete(cacheKey);
      return null;
    }
    return hit.value;
  }

  function setCachedReconstruction(cacheKey, value) {
    const now = Date.now();
    reconstructCache.set(cacheKey, { value, expiresAt: now + reconstructCacheTtlMs });
    if (reconstructCache.size > 160) {
      for (const [k, v] of reconstructCache.entries()) {
        if (!v || v.expiresAt <= now) reconstructCache.delete(k);
      }
    }
  }

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/status' && m === 'GET') { getStatus(req, res, apiHeaders); return true; }
    if (p === '/api/memories' && m === 'GET') { getMemories(req, res, apiHeaders); return true; }
    if (p === '/api/memories' && m === 'POST') { await postMemory(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/system-prompt' && m === 'GET') { getSystemPrompt(req, res, apiHeaders); return true; }
    if (p === '/api/session-meta' && m === 'POST') { await postSessionMeta(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/persona' && m === 'GET') { getPersona(req, res, apiHeaders); return true; }
    if (p === '/api/persona' && m === 'POST') { await postPersona(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/memory-heal' && m === 'POST') { getMemoryHeal(req, res, apiHeaders, url); return true; }
    if (p === '/api/memory-stats' && m === 'GET') { getMemoryStats(req, res, apiHeaders); return true; }
    if (p === '/api/memory/image' && m === 'GET') { getMemoryImage(req, res, url); return true; }
    if (p === '/api/diary/life' && m === 'GET') { getLifeDiary(req, res, apiHeaders); return true; }
    if (p === '/api/diary/dream' && m === 'GET') { getDreamDiary(req, res, apiHeaders); return true; }
    if (p === '/api/memories/search' && m === 'GET') { getMemoriesSearch(req, res, apiHeaders, url); return true; }
    if (p === '/api/memories/reconstruct' && m === 'POST') { await postMemoriesReconstruct(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/memories/prewarm-doc' && m === 'POST') { await postMemoriesPrewarmDoc(req, res, apiHeaders); return true; }
    if (p === '/api/memory/detail' && m === 'GET') { getMemoryDetail(req, res, apiHeaders, url); return true; }
    if (p === '/api/visualizer/chat-history' && m === 'POST') { await postVisualizerChatHistory(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/visualizer/chat-history' && m === 'GET') { getVisualizerChatHistory(req, res, apiHeaders); return true; }
    return false;
  }

  function getStatus(req, res, apiHeaders) {
    let personaExists = false;
    let archiveFiles = [];
    const entityMemRoot = ctx.getEntityMemoryRootIfActive();

    if (entityMemRoot) {
      const personaPath = path.join(entityMemRoot, 'persona.json');
      const archiveDir = path.join(entityMemRoot, 'archives');
      personaExists = fs.existsSync(personaPath);
      if (fs.existsSync(archiveDir)) {
        archiveFiles = fs.readdirSync(archiveDir).filter(f => f.endsWith('.txt') || f.endsWith('.json'));
      }
    }
    // No entity active → return defaults (no persona, no archives)

    const entityStatus = ctx.hatchEntity.getEntityStatus();
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, firstRun: !personaExists, archiveCount: archiveFiles.length, personaExists, entityStatus }));
  }

  function getMemories(req, res, apiHeaders) {
    try {
      let archives = [];
      if (ctx.currentEntityId) {
        const entityPaths = require('../entities/entityPaths');
        const archiveDir = path.join(entityPaths.getMemoryRoot(ctx.currentEntityId), 'archives');
        if (fs.existsSync(archiveDir)) {
          const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.txt'));
          archives = files.map(f => ({ name: f, content: fs.readFileSync(path.join(archiveDir, f), 'utf8') }));
        }
      }
      // No entity active → return empty archives
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, archives }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postMemory(req, res, apiHeaders, readBody) {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      if (!data.filename || !data.content) throw new Error('Missing filename or content');
      const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (!entityMemRoot) {
        res.writeHead(409, apiHeaders);
        res.end(JSON.stringify({ error: 'No entity active — cannot store memory' }));
        return;
      }
      const archiveDir = path.join(entityMemRoot, 'archives');
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      const outPath = path.join(archiveDir, safeName);

      fs.writeFileSync(outPath, data.content, 'utf8');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, path: outPath }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getSystemPrompt(req, res, apiHeaders) {
    try {
      let sysPath = null;
      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (entityMemRoot) {
        const entitySysPath = path.join(entityMemRoot, 'system-prompt.txt');
        if (fs.existsSync(entitySysPath)) sysPath = entitySysPath;
      }
      // Fallback: root memories/system-prompt.txt serves as default template only
      if (!sysPath) {
        const defaultPath = path.join(ctx.MEM_DIR, 'system-prompt.txt');
        if (fs.existsSync(defaultPath)) sysPath = defaultPath;
      }
      if (!fs.existsSync(sysPath)) {
        res.writeHead(404, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'system prompt not found' }));
        return;
      }
      const text = fs.readFileSync(sysPath, 'utf8');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, text }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postSessionMeta(req, res, apiHeaders, readBody) {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const metaText = data.metaText || data.meta || '';
      if (!metaText) throw new Error('Missing metaText');

      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (!entityMemRoot) {
        res.writeHead(409, apiHeaders);
        res.end(JSON.stringify({ error: 'No entity active — cannot save session metadata' }));
        return;
      }
      const targetDir = entityMemRoot;

      let mood = '', emotions = '', tone = '', userPersona = '', llmPersona = '';
      for (const line of metaText.split(/\r?\n/)) {
        if (line.startsWith('MOOD:')) mood = line.slice(5).trim();
        else if (line.startsWith('EMOTIONS:')) emotions = line.slice(9).trim();
        else if (line.startsWith('TONE:')) tone = line.slice(5).trim();
        else if (line.startsWith('USER:')) userPersona = line.slice(5).trim();
        else if (line.startsWith('LLM:')) llmPersona = line.slice(4).trim();
      }
      if (mood) fs.writeFileSync(path.join(targetDir, 'mood.txt'), mood, 'utf8');
      if (emotions) fs.writeFileSync(path.join(targetDir, 'emotions.txt'), emotions, 'utf8');
      if (tone) fs.writeFileSync(path.join(targetDir, 'tone.txt'), tone, 'utf8');
      if (userPersona) fs.writeFileSync(path.join(targetDir, 'user-personality.txt'), userPersona, 'utf8');
      if (llmPersona) fs.writeFileSync(path.join(targetDir, 'llm-personality.txt'), llmPersona, 'utf8');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getPersona(req, res, apiHeaders) {
    try {
      let personaPath = null;
      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (entityMemRoot) {
        const ep = path.join(entityMemRoot, 'persona.json');
        if (fs.existsSync(ep)) personaPath = ep;
      }
      if (fs.existsSync(personaPath)) {
        const data = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, persona: data }));
      } else {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, persona: null }));
      }
    } catch (e) {
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, persona: null }));
    }
  }

  async function postPersona(req, res, apiHeaders, readBody) {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);

      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (!entityMemRoot) {
        res.writeHead(409, apiHeaders);
        res.end(JSON.stringify({ error: 'No entity active — cannot save persona' }));
        return;
      }

      fs.writeFileSync(path.join(entityMemRoot, 'persona.json'), JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
      if (ctx.currentEntityId) {
        try { ctx.contextConsolidator.buildConsolidatedContext(ctx.currentEntityId, require('../entities/entityPaths')); } catch (e2) { /* ignore */ }
      }
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getMemoryHeal(req, res, apiHeaders, url) {
    try {
      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (!entityMemRoot) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, repaired: 0, errors: 0, indexAudit: null }));
        return;
      }
      const episodicDir = path.join(entityMemRoot, 'episodic');
      if (!fs.existsSync(episodicDir)) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, repaired: 0, errors: 0, indexAudit: null }));
        return;
      }

      let repaired = 0, errors = 0;
      for (const item of fs.readdirSync(episodicDir)) {
        const itemPath = path.join(episodicDir, item);
        if (!fs.statSync(itemPath).isDirectory()) continue;
        const logPath = path.join(itemPath, 'log.json');
        if (!fs.existsSync(logPath)) continue;
        try {
          JSON.parse(fs.readFileSync(logPath, 'utf8'));
        } catch (e) {
          try {
            const newLog = { memory_id: item, created: new Date().toISOString(), last_accessed: new Date().toISOString(), access_count: 0, access_events: [], type: 'episodic', decay: 0.5, importance: 0.5, topics: [] };
            fs.writeFileSync(logPath, JSON.stringify(newLog, null, 2), 'utf8');
            repaired++;
          } catch (repairErr) { errors++; }
        }
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, repaired, errors }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getMemoryStats(req, res, apiHeaders) {
    try {
      let totalMemories = 0, storageSize = 0, memoryLogs = 0, healthyLogs = 0, corruptedLogs = 0;
      const entityMemRoot = ctx.getEntityMemoryRootIfActive();
      if (!entityMemRoot) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, totalMemories: 0, storageSize: 0, memoryLogs: 0, healthyLogs: 0, corruptedLogs: 0 }));
        return;
      }
      const episodicDir = path.join(entityMemRoot, 'episodic');
      if (fs.existsSync(episodicDir)) {
        for (const item of fs.readdirSync(episodicDir)) {
          const itemPath = path.join(episodicDir, item);
          if (!fs.statSync(itemPath).isDirectory()) continue;
          totalMemories++;
          const logPath = path.join(itemPath, 'log.json');
          if (fs.existsSync(logPath)) {
            memoryLogs++;
            storageSize += fs.statSync(logPath).size;
            try { JSON.parse(fs.readFileSync(logPath, 'utf8')); healthyLogs++; } catch (e) { corruptedLogs++; }
          }
          const contentPath = path.join(itemPath, 'content.json');
          if (fs.existsSync(contentPath)) storageSize += fs.statSync(contentPath).size;
        }
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, totalMemories, storageSize, memoryLogs, healthyLogs, corruptedLogs }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getMemoryImage(req, res, url) {
    try {
      const memId = url.searchParams.get('id');
      if (!memId || !ctx.currentEntityId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing id or no active entity' }));
        return;
      }

      const MemoryImages = require('../brain/memory/memory-images');
      const memoryImages = new MemoryImages({ entityId: ctx.currentEntityId });
      const imagePath = memoryImages.getImagePath(memId);

      if (!imagePath || !fs.existsSync(imagePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Image not found' }));
        return;
      }

      const content = fs.readFileSync(imagePath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(content);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getLifeDiary(req, res, apiHeaders) {
    try {
      if (!ctx.currentEntityId) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, text: '', entries: [] }));
        return;
      }
      const LifeDiary = require('../brain/identity/life-diary');
      const entityPaths = require('../entities/entityPaths');
      const diaryPath = entityPaths.getLifeDiaryPath(ctx.currentEntityId);
      const text = fs.existsSync(diaryPath) ? fs.readFileSync(diaryPath, 'utf8') : '';
      const entries = LifeDiary.readRecent(ctx.currentEntityId, 20);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, text, entries }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getDreamDiary(req, res, apiHeaders) {
    try {
      if (!ctx.currentEntityId) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, text: '', entries: [] }));
        return;
      }
      const DreamDiary = require('../brain/identity/dream-diary');
      const entityPaths = require('../entities/entityPaths');
      const diaryPath = entityPaths.getDreamDiaryPath(ctx.currentEntityId);
      const text = fs.existsSync(diaryPath) ? fs.readFileSync(diaryPath, 'utf8') : '';
      const entries = DreamDiary.readRecent(ctx.currentEntityId, 20);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, text, entries }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getMemoriesSearch(req, res, apiHeaders, url) {
    try {
      const keyword = (url.searchParams.get('q') || '').toLowerCase().trim();
      const filterType = (url.searchParams.get('type') || '').toLowerCase().trim();
      const sortBy = url.searchParams.get('sort') || 'date';
      const limitParam = parseInt(url.searchParams.get('limit')) || 200;

      if (!ctx.currentEntityId) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, memories: [] }));
        return;
      }

      const entityPathsMod = require('../entities/entityPaths');
      const memoryRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
      const MemoryImages = require('../brain/memory/memory-images');
      const memoryImages = new MemoryImages({ entityId: ctx.currentEntityId });
      const results = [];

      const searchDirs = [
        { dir: path.join(memoryRoot, 'episodic'), fallbackType: 'episodic' },
        { dir: path.join(memoryRoot, 'semantic'), fallbackType: 'semantic' },
        { dir: path.join(memoryRoot, 'ltm'), fallbackType: 'long_term_memory' },
        { dir: path.join(memoryRoot, 'dreams'), fallbackType: 'dream_memory' }
      ];

      for (const { dir, fallbackType } of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir).filter(f => {
          const full = path.join(dir, f);
          return fs.statSync(full).isDirectory();
        });
        for (const memId of entries) {
          const memDir = path.join(dir, memId);
          let meta = null, semantic = '';
          const logFile = path.join(memDir, 'log.json');
          const semFile = path.join(memDir, 'semantic.txt');
          if (fs.existsSync(logFile)) { try { meta = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch (e) { /* skip */ } }
          if (fs.existsSync(semFile)) { try { semantic = fs.readFileSync(semFile, 'utf8').trim(); } catch (e) { /* skip */ } }

          const type = meta?.type || fallbackType;
          const topics = meta?.topics || [];
          const importance = Number(meta?.importance ?? 0.5);
          const decay = Number(meta?.decay ?? 1.0);
          const created = meta?.created || null;
          const emotionalTag = meta?.emotionalTag || null;
          const accessCount = meta?.access_count || 0;

          if (filterType && type !== filterType) continue;
          if (keyword) {
            const haystack = (semantic + ' ' + topics.join(' ') + ' ' + (emotionalTag || '') + ' ' + memId).toLowerCase();
            if (!haystack.includes(keyword)) continue;
          }
          results.push({
            id: memId,
            type,
            topics,
            importance,
            decay,
            created,
            emotionalTag,
            access_count: accessCount,
            semantic: semantic.slice(0, 300),
            hasImage: memoryImages.hasImage(memId),
            imageUrl: memoryImages.hasImage(memId) ? '/api/memory/image?id=' + encodeURIComponent(memId) : null
          });
        }
      }

      if (sortBy === 'importance') { results.sort((a, b) => b.importance - a.importance); }
      else if (sortBy === 'type') { results.sort((a, b) => a.type.localeCompare(b.type)); }
      else { results.sort((a, b) => { if (!a.created && !b.created) return 0; if (!a.created) return 1; if (!b.created) return -1; return new Date(b.created) - new Date(a.created); }); }

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, memories: results.slice(0, limitParam), total: results.length }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postMemoriesReconstruct(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const memId = body.memoryId;
      if (!memId || !ctx.currentEntityId) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Missing memoryId or no active entity' }));
        return;
      }

      const entityPathsMod = require('../entities/entityPaths');
      const MemoryImages = require('../brain/memory/memory-images');
      const memoryImages = new MemoryImages({ entityId: ctx.currentEntityId });
      const memoryRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
      let compressedContent = null;

      function extractReconstructableText(rawText) {
        const raw = String(rawText || '').trim();
        if (!raw) return '';

        // LTM chatlogs are often plain compressed text. Keep as-is.
        if (raw.includes('[V4-TRANSFORM-SOURCE]') || raw.includes('[MEM-PKT]')) {
          return raw;
        }

        // Episodic/semantic entries are often JSON payloads. Extract the best text field.
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'string') return parsed;

          if (parsed && typeof parsed === 'object') {
            const candidates = [
              parsed.content && parsed.content.text,
              parsed.content,
              parsed.rawContent,
              parsed.narrative,
              parsed.text,
              parsed.semantic,
              parsed.summary
            ].filter(v => typeof v === 'string' && v.trim().length > 0);

            if (candidates.length > 0) return candidates[0].trim();
          }
        } catch (_) {
          // Not JSON, keep raw text.
        }

        return raw;
      }

      const searchDirs = ['ltm', 'episodic', 'semantic'].map(d => path.join(memoryRoot, d, memId));
      for (const memDir of searchDirs) {
        if (!fs.existsSync(memDir)) continue;
        const zipFile = path.join(memDir, 'memory.zip');
        if (fs.existsSync(zipFile)) {
          try {
            const raw = zlib.gunzipSync(fs.readFileSync(zipFile)).toString('utf8');
            const extracted = extractReconstructableText(raw);
            if (extracted) {
              compressedContent = extracted;
              break;
            }
          } catch (e) { /* try content.txt */ }
        }
        const contentFile = path.join(memDir, 'content.txt');
        if (fs.existsSync(contentFile)) {
          const extracted = extractReconstructableText(fs.readFileSync(contentFile, 'utf8'));
          if (extracted) { compressedContent = extracted; break; }
        }
        const semFile = path.join(memDir, 'semantic.txt');
        if (fs.existsSync(semFile)) {
          const extracted = extractReconstructableText(fs.readFileSync(semFile, 'utf8'));
          if (extracted) { compressedContent = extracted; break; }
        }
      }

      if (!compressedContent) { res.writeHead(404, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Memory content not found' })); return; }

      const cacheKey = buildReconstructCacheKey(memId, compressedContent);
      const cached = getCachedReconstruction(cacheKey);
      if (cached) {
        const payload = { ok: true, reconstructed: cached };
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify(enforceResponseContract('/api/memories/reconstruct', payload)));
        return;
      }

      let runtime = ctx.loadAspectRuntimeConfig('subconscious') || ctx.loadAspectRuntimeConfig('main');
      if (!runtime) { res.writeHead(500, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'No LLM provider configured' })); return; }

      const reconstructed = await ctx.callLLMWithRuntime(runtime, [
        { role: 'system', content: 'You reconstruct compressed memory artifacts into readable content. If this is a chatlog, output a clear User/Assistant transcript. If this is document knowledge, output clean prose preserving key facts and structure. If already readable, lightly clean formatting only.' },
        { role: 'user', content: 'Reconstruct this stored memory content:\n\n' + compressedContent.slice(0, 8000) }
      ], { temperature: 0.2, maxTokens: ctx.getTokenLimit('chatlogReconstruct') });

      const payload = {
        ok: true,
        reconstructed: typeof reconstructed === 'object' ? reconstructed.content : reconstructed
      };
      if (payload.reconstructed) {
        setCachedReconstruction(cacheKey, payload.reconstructed);
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify(enforceResponseContract('/api/memories/reconstruct', payload)));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postMemoriesPrewarmDoc(req, res, apiHeaders) {
    try {
      if (!ctx.currentEntityId) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: false, warmed: false, reason: 'no-active-entity' }));
        return;
      }

      const entityPathsMod = require('../entities/entityPaths');
      const memoryRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
      const ltmDir = path.join(memoryRoot, 'ltm');
      if (!fs.existsSync(ltmDir)) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, warmed: false, reason: 'no-ltm' }));
        return;
      }

      const ltmFolders = fs.readdirSync(ltmDir)
        .filter(f => { try { return fs.statSync(path.join(ltmDir, f)).isDirectory(); } catch { return false; } });

      let best = null;
      for (const folder of ltmFolders) {
        const logFile = path.join(ltmDir, folder, 'log.json');
        if (!fs.existsSync(logFile)) continue;
        try {
          const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
          const topics = Array.isArray(log.topics) ? log.topics : [];
          const source = String(log.source || '').toLowerCase();
          const isDocument = source === 'document_digest' || topics.some(t => /document|knowledge|chunk/i.test(String(t || '')));
          if (!isDocument) continue;

          const importance = Number(log.importance ?? log.meta?.importance ?? 0.5);
          const score = Number.isFinite(importance) ? importance : 0.5;
          if (!best || score > best.score) {
            best = { id: folder, score };
          }
        } catch (_) {}
      }

      if (!best) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, warmed: false, reason: 'no-document-ltm' }));
        return;
      }

      const contentPath = path.join(ltmDir, best.id, 'content.txt');
      if (!fs.existsSync(contentPath)) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, warmed: false, reason: 'missing-content' }));
        return;
      }

      const compressedContent = fs.readFileSync(contentPath, 'utf8').trim().slice(0, 8000);
      if (!compressedContent) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, warmed: false, reason: 'empty-content' }));
        return;
      }

      const cacheKey = buildReconstructCacheKey(best.id, compressedContent);
      const cached = getCachedReconstruction(cacheKey);
      if (cached) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, warmed: true, source: 'cache', id: best.id }));
        return;
      }

      const runtime = ctx.loadAspectRuntimeConfig('subconscious') || ctx.loadAspectRuntimeConfig('main');
      if (!runtime) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: false, warmed: false, reason: 'no-runtime' }));
        return;
      }

      const reconstructed = await ctx.callLLMWithRuntime(runtime, [
        { role: 'system', content: 'You reconstruct compressed document memory artifacts into clean readable prose while preserving factual content and structure.' },
        { role: 'user', content: 'Reconstruct this stored document memory content:\n\n' + compressedContent }
      ], { temperature: 0.2, maxTokens: ctx.getTokenLimit('chatlogReconstruct') });

      const reconstructedText = typeof reconstructed === 'object' ? reconstructed.content : reconstructed;
      if (reconstructedText) {
        setCachedReconstruction(cacheKey, reconstructedText);
      }

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, warmed: Boolean(reconstructedText), source: 'llm', id: best.id }));
    } catch (e) {
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: false, warmed: false, error: e.message }));
    }
  }

  function getMemoryDetail(req, res, apiHeaders, url) {
    try {
      const memId = url.searchParams.get('id');
      if (!memId || !ctx.currentEntityId) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Missing id or no active entity' }));
        return;
      }

      const entityPathsMod = require('../entities/entityPaths');
      const MemoryImages = require('../brain/memory/memory-images');
      const memoryImages = new MemoryImages({ entityId: ctx.currentEntityId });
      const memoryRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
      let semantic = null, logData = null, content = null;

      const searchDirs = ['episodic', 'semantic', 'ltm'].map(d => path.join(memoryRoot, d, memId));
      for (const memDir of searchDirs) {
        if (!fs.existsSync(memDir)) continue;
        const semFile = path.join(memDir, 'semantic.txt');
        const logFile = path.join(memDir, 'log.json');
        const zipFile = path.join(memDir, 'memory.zip');
        const contentFile = path.join(memDir, 'content.txt');
        if (fs.existsSync(semFile)) semantic = fs.readFileSync(semFile, 'utf8');
        if (fs.existsSync(logFile)) { try { logData = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch (e) { /* skip */ } }
        if (fs.existsSync(zipFile)) { try { content = zlib.gunzipSync(fs.readFileSync(zipFile)).toString('utf8'); } catch (e) { /* skip */ } }
        else if (fs.existsSync(contentFile)) { content = fs.readFileSync(contentFile, 'utf8'); }
        break;
      }

      let related = { outgoing: [], incoming: [] };
      if (ctx.traceGraph && typeof ctx.traceGraph.getRelatedMemories === 'function') {
        try { related = ctx.traceGraph.getRelatedMemories(memId); } catch (e) { /* skip */ }
      }

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        id: memId,
        semantic: semantic || '(no summary)',
        log: logData,
        content: content ? content.slice(0, 5000) : null,
        related,
        imageUrl: memoryImages.hasImage(memId) ? '/api/memory/image?id=' + encodeURIComponent(memId) : null
      }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postVisualizerChatHistory(req, res, apiHeaders, readBody) {
    try {
      if (!ctx.currentEntityPath) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'No entity active' }));
        return;
      }
      const body = await readBody(req);
      const data = JSON.parse(body);
      const historyFile = path.join(ctx.currentEntityPath, 'visualizer-chat-history.json');
      let history = [];
      if (fs.existsSync(historyFile)) { try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch (_) { history = []; } }
      if (data.exchange) {
        history.push(data.exchange);
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, count: history.length }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getVisualizerChatHistory(req, res, apiHeaders) {
    try {
      if (!ctx.currentEntityPath) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, history: [] }));
        return;
      }
      const historyFile = path.join(ctx.currentEntityPath, 'visualizer-chat-history.json');
      let history = [];
      if (fs.existsSync(historyFile)) { try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch (_) { history = []; } }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, history }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  return { dispatch };
}

module.exports = createMemoryRoutes;
