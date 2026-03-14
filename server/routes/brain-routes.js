// ── Brain Routes ─────────────────────────────────────────────
// /api/brain/status, /api/brain/ingest, /api/brain/ltm,
// /api/brain/bootstrap, /api/brain/dream-cycle, /api/brain/llm-proxy,
// /api/brain/subconscious-context, /api/brain/dreams,
// /api/brain/pixel-art*, /api/brain/sleep, /api/brain/create-core-memory
// /api/neurochemistry, /api/somatic, /api/somatic/toggle

const DreamVisualizer = require('../brain/dream-visualizer');

function createBrainRoutes(ctx) {
  const { fs, path, zlib, crypto } = ctx;

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/brain/status' && m === 'GET') { await getBrainStatus(req, res, apiHeaders); return true; }
    if (p === '/api/brain/ingest' && m === 'POST') { await postBrainIngest(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/ltm' && m === 'POST') { await postBrainLtm(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/bootstrap' && m === 'POST') { await postBrainBootstrap(req, res, apiHeaders); return true; }
    if (p === '/api/brain/dream-cycle' && m === 'POST') { await postBrainDreamCycle(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/llm-proxy' && m === 'POST') { await postBrainLlmProxy(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/subconscious-context' && m === 'POST') { await postSubconsciousContext(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/dreams' && m === 'GET') { getBrainDreams(req, res, apiHeaders); return true; }
    if (p === '/api/brain/pixel-art/deps' && m === 'GET') { getPixelArtDeps(req, res, apiHeaders); return true; }
    if (p === '/api/brain/pixel-art' && m === 'GET') { getPixelArtList(req, res, apiHeaders); return true; }
    if (p === '/api/brain/pixel-art/generate' && m === 'POST') { await postPixelArtGenerate(req, res, apiHeaders, readBody); return true; }
    if (p.startsWith('/api/brain/pixel-art/') && m === 'GET') { servePixelArtFile(req, res, apiHeaders, url); return true; }
    if (p === '/api/brain/sleep' && m === 'POST') { await postBrainSleep(req, res, apiHeaders); return true; }
    if (p === '/api/brain/create-core-memory' && m === 'POST') { await postCreateCoreMemory(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/neurochemistry' && m === 'GET') { getNeurochemistry(req, res, apiHeaders); return true; }
    if (p === '/api/somatic' && m === 'GET') { getSomatic(req, res, apiHeaders); return true; }
    if (p === '/api/somatic/toggle' && m === 'POST') { await postSomaticToggle(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/deep-sleep-interval' && m === 'POST') { await postDeepSleepInterval(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/brain/deep-sleep-interval' && m === 'GET') { getDeepSleepInterval(req, res, apiHeaders); return true; }
    return false;
  }

  async function getBrainStatus(req, res, apiHeaders) {
    try {
      const b = ctx.brainLoop;
      const status = {
        running: b ? b.running : false,
        cycleCount: b ? b.cycleCount : 0,
        uptimeMinutes: b && b.startTime ? Math.floor((Date.now() - b.startTime) / 60000) : 0,
        deepSleepInterval: b ? (b.deepSleepInterval || 150) : 150,
        cyclesUntilDeepSleep: b && ctx.beliefGraph ? ((b.deepSleepInterval || 150) - (b.cycleCount % (b.deepSleepInterval || 150))) % (b.deepSleepInterval || 150) || (b.deepSleepInterval || 150) : null,
        subsystems: {
          memoryStorage: !!ctx.memoryStorage,
          traceGraph: !!ctx.traceGraph,
          dreamEngine: !!ctx.dreamEngine,
          goalsManager: !!ctx.goalsManager,
          modelRouter: !!ctx.modelRouter,
          beliefGraph: !!ctx.beliefGraph,
          neurochemistry: !!ctx.neurochemistry,
          somaticAwareness: !!ctx.somaticAwareness,
          boredomEngine: !!ctx.boredomEngine
        }
      };
      if (ctx.memoryStorage && typeof ctx.memoryStorage.getStats === 'function') {
        try { status.memoryStats = await ctx.memoryStorage.getStats(); } catch (_) {}
      }
      if (ctx.goalsManager && typeof ctx.goalsManager.analyzeProgress === 'function') {
        try { status.goalStats = ctx.goalsManager.analyzeProgress(); } catch (_) {}
      }
      if (ctx.traceGraph && typeof ctx.traceGraph.analyzeTraces === 'function') {
        try { status.traceStats = ctx.traceGraph.analyzeTraces(); } catch (_) {}
      }
      if (ctx.beliefGraph && typeof ctx.beliefGraph.getStats === 'function') {
        try { status.beliefStats = ctx.beliefGraph.getStats(); } catch (_) {}
      }
      if (ctx.neurochemistry) { try { status.neurochemistry = ctx.neurochemistry.getStats(); } catch (_) {} }
      if (ctx.somaticAwareness) { try { status.somatic = ctx.somaticAwareness.getStats(); } catch (_) {} }
      if (b && typeof b.getHealthDiagnostics === 'function') {
        try { status.health = b.getHealthDiagnostics(); } catch (_) {}
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, ...status }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postBrainIngest(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { userMessage, assistantResponse } = body;
      if (ctx.currentEntityId && userMessage) {
        const entityPaths = require('../entityPaths');
        const archiveDir = path.join(entityPaths.getMemoryRoot(ctx.currentEntityId), 'archives');
        if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
        const archiveFile = path.join(archiveDir, `archive_${Date.now()}.json`);
        fs.writeFileSync(archiveFile, JSON.stringify({
          messages: [
            { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
            { role: 'assistant', content: assistantResponse || '', timestamp: new Date().toISOString() }
          ],
          sessionMeta: {},
          created: new Date().toISOString()
        }, null, 2), 'utf8');
        if (ctx.boredomEngine) ctx.boredomEngine.notifyUserInteraction();
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postBrainLtm(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { compressedText, sessionMeta, source } = body;
      if (!ctx.currentEntityId) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'No active entity' })); return; }
      if (!compressedText) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'No compressed text provided' })); return; }

      const entityPathsMod = require('../entityPaths');
      const memRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
      const ltmDir = path.join(memRoot, 'ltm');
      if (!fs.existsSync(ltmDir)) fs.mkdirSync(ltmDir, { recursive: true });

      const ltmId = `ltm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const ltmPath = path.join(ltmDir, ltmId);
      fs.mkdirSync(ltmPath, { recursive: true });
      fs.writeFileSync(path.join(ltmPath, 'content.txt'), compressedText, 'utf8');

      const semanticSummary = compressedText
        .replace(/\[SESSION-META\][\s\S]*?\[PERSONALITY-PROFILE\][\s\S]*?\n\n/i, '')
        .replace(/\[MEM-PKT\]/g, '').replace(/\[V4-TRANSFORM-SOURCE\]/g, '')
        .replace(/Compressed conversation context[\s\S]*?Speaker labels:.*\n/i, '')
        .trim().substring(0, 280);
      fs.writeFileSync(path.join(ltmPath, 'semantic.txt'), semanticSummary || 'Compressed conversation', 'utf8');

      const ltmMeta = {
        ltm_id: ltmId, memory_id: ltmId, type: 'long_term_memory',
        source: source || 'compression', created: new Date().toISOString(),
        charCount: compressedText.length, sessionMeta: sessionMeta || {},
        importance: 0.6, decay: 0.002, topics: []
      };
      const cleanedForTopics = compressedText
        .replace(/\[V4-TRANSFORM-SOURCE\][\s\S]*/i, '')
        .replace(/\[SESSION-META\][\s\S]*?\[PERSONALITY-PROFILE\][\s\S]*?\n\n/i, '')
        .replace(/\[MEM-PKT\]/g, '')
        .replace(/Compressed conversation context[\s\S]*?Speaker labels:.*\n/i, '');
      const stopwords = new Set(['the','and','that','this','with','from','have','for','are','was','were','been','will','about','into','just','like','your','their','them','then','than','what','when','where','which','would','could','should','some','other','more','very','also','only','most','such','each','after','before','because','between','through','during','these','those','being','both','same','many','much','make','made','know','here','take','come','back','still','well','even','over','does','done','going','want','need','help']);
      const topicWords = cleanedForTopics.toLowerCase().split(/[^a-z0-9]+/)
        .filter(w => w.length >= 4 && w.length <= 25 && !stopwords.has(w))
        .reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
      ltmMeta.topics = ctx.normalizeTopics(Object.entries(topicWords).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w));
      fs.writeFileSync(path.join(ltmPath, 'log.json'), JSON.stringify(ltmMeta, null, 2), 'utf8');
      fs.writeFileSync(path.join(ltmPath, 'memory.zip'), zlib.gzipSync(compressedText));

      if (ctx.memoryStorage && ctx.memoryStorage.indexCache) {
        ctx.memoryStorage.indexCache.addMemory(ltmId, ltmMeta);
        ctx.memoryStorage.indexCache.save();
      }

      const episodicDir = entityPathsMod.getEpisodicMemoryPath(ctx.currentEntityId);
      const episodicLtmPath = path.join(episodicDir, ltmId);
      if (!fs.existsSync(episodicLtmPath)) {
        fs.mkdirSync(episodicLtmPath, { recursive: true });
        fs.writeFileSync(path.join(episodicLtmPath, 'semantic.txt'), semanticSummary || 'Compressed conversation', 'utf8');
        fs.writeFileSync(path.join(episodicLtmPath, 'memory.zip'), zlib.gzipSync(JSON.stringify({ type: 'long_term_memory', semantic: semanticSummary, content: compressedText, source: source || 'compression', created: ltmMeta.created })));
        fs.writeFileSync(path.join(episodicLtmPath, 'log.json'), JSON.stringify(ltmMeta, null, 2), 'utf8');
      }

      if (ctx.traceGraph) {
        try {
          ctx.traceGraph.createTrace('ltm_compression', ltmId);
          if (ctx.memoryStorage && ctx.memoryStorage.indexCache) {
            ctx.memoryStorage.indexCache.load();
            const thirtyMinAgo = Date.now() - (30 * 60 * 1000);
            for (const [memId, meta] of Object.entries(ctx.memoryStorage.indexCache.memoryIndex || {})) {
              if (memId === ltmId || !meta || !meta.created) continue;
              if (new Date(meta.created).getTime() >= thirtyMinAgo) {
                ctx.traceGraph.addStep(ltmId, memId, 'ltm_encompasses');
              }
            }
          }
          ctx.traceGraph.closeTrace();
        } catch (traceErr) { console.warn('  ⚠ LTM trace error:', traceErr.message); }
      }

      ctx.broadcastSSE('memory_created', {
        memory_id: ltmId, type: 'long_term_memory', importance: 0.6,
        topics: ltmMeta.topics, timestamp: Date.now()
      });

      if (ctx.memoryGraph) {
        try {
          ctx.memoryGraph.addMemoryNode({ id: ltmId, ...ltmMeta, type: 'chatlog' });
          if (ctx.memoryGraphBuilder && ltmMeta.topics.length > 0) {
            for (const topic of ltmMeta.topics) {
              const related = ctx.memoryGraph.findByTopic(topic, 5);
              for (const node of related) {
                if (node.memory_id !== ltmId) ctx.memoryGraph.linkMemories(ltmId, node.memory_id, 0.5);
              }
            }
          }
        } catch (graphErr) { console.warn('  ⚠ Memory graph add error:', graphErr.message); }
      }

      console.log(`  ✓ Long Term Memory stored: ${ltmId} (${compressedText.length} chars)`);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, ltmId }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postBrainBootstrap(req, res, apiHeaders) {
    try {
      const subRuntime = ctx.loadAspectRuntimeConfig('subconscious');
      if (!subRuntime) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'subconscious-provider-not-configured' })); return; }

      const entity = ctx.currentEntityId ? ctx.hatchEntity.loadEntity() : null;
      const chapters = Array.isArray(entity?.chapters) ? entity.chapters.slice(0, 5).map((c, i) => 'Chapter ' + (i + 1) + ': ' + (c.title || c)).join('\n') : 'No chapters available.';
      const traits = Array.isArray(entity?.personality_traits) ? entity.personality_traits.join(', ') : 'unknown';
      const memoryCount = Number(entity?.memory_count || 0);
      const intro = entity?.introduction || '';

      const awakeningPrompt = `Generate a subconscious handoff for the conscious model.\n\nRequirements:\n- Start with: [SUBCONSCIOUS AWAKENING]\n- Address the entity by name.\n- Mention personality traits.\n- Mention memory count and that REM Systemure is online.\n- Include a short list of restored chapters.\n- Keep it concise (120-220 words).\n- No markdown headings other than the opening tag line.\n${intro ? '\nThe entity introduces itself like this (match this tone):\n' + intro + '\n' : ''}\nEntity name: ${entity?.name || 'Unknown'}\nTraits: ${traits}\nMemory count: ${memoryCount}\nRestored chapters:\n${chapters}`;

      const awakeningText = await ctx.callLLMWithRuntime(subRuntime, [
        { role: 'system', content: 'You are the subconscious background processor of a persistent synthetic entity. You maintain continuity and memory coherence.' },
        { role: 'user', content: awakeningPrompt }
      ], { temperature: 0.35, maxTokens: ctx.getTokenLimit('bootstrapAwakening') });

      if (!awakeningText || !awakeningText.trim()) throw new Error('Subconscious returned empty awakening message');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, awakeningText: awakeningText.trim() }));
    } catch (e) {
      console.error('  ⚠ Bootstrap error:', e.message);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postBrainDreamCycle(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { prompt } = body;
      let dreamRuntime = ctx.loadAspectRuntimeConfig('dream');
      if (!dreamRuntime) dreamRuntime = ctx.loadAspectRuntimeConfig('main');
      if (!dreamRuntime) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'dream-provider-not-configured' })); return; }

      const result = await ctx.callLLMWithRuntime(dreamRuntime, [
        { role: 'system', content: 'You are the Dream Engine for a persistent AI entity. Synthesize memory integration faithfully and output only the required persona update fields.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.4, maxTokens: ctx.getTokenLimit('dreamEngine') });

      if (!result || !result.trim()) throw new Error('Dream engine returned empty response');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, dreamResult: result.trim() }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postBrainLlmProxy(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { aspect, prompt, systemPrompt, temperature, maxTokens } = body;
      const runtime = ctx.loadAspectRuntimeConfig(aspect || 'main');
      if (!runtime) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: (aspect || 'main') + '-provider-not-configured' })); return; }

      const result = await ctx.callLLMWithRuntime(runtime, [
        { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ], { temperature: Number.isFinite(temperature) ? temperature : 0.4, maxTokens: Number.isFinite(maxTokens) ? maxTokens : ctx._defaultMaxTokens });

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, result: result || '' }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postSubconsciousContext(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const userMessage = (body.userMessage || '').trim();
      const limit = Math.max(1, Math.min(parseInt(body.limit || '100', 10), 100));
      if (!userMessage) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Missing userMessage' })); return; }
      const memoryCtx = await ctx.getSubconsciousMemoryContext(userMessage, limit);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, topics: memoryCtx.topics, connections: memoryCtx.connections, rerankUsed: memoryCtx.rerankUsed, rerankError: memoryCtx.rerankError, contextBlock: memoryCtx.contextBlock }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getBrainDreams(req, res, apiHeaders) {
    try {
      const dreams = [];
      let analysis = null;
      if (ctx.currentEntityId) {
        const entityPaths = require('../entityPaths');
        const dreamsDir = path.join(entityPaths.getMemoryRoot(ctx.currentEntityId), 'dreams');
        if (fs.existsSync(dreamsDir)) {
          const files = fs.readdirSync(dreamsDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
          for (const f of files) {
            try { const d = JSON.parse(fs.readFileSync(path.join(dreamsDir, f), 'utf8')); dreams.push({ file: f, ...d }); } catch (_) {}
          }
        }
      }
      if (ctx.dreamEngine && typeof ctx.dreamEngine.analyzeDreamPatterns === 'function' && dreams.length > 0) {
        try { analysis = ctx.dreamEngine.analyzeDreamPatterns(dreams); } catch (_) {}
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, dreams, analysis }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getPixelArtDeps(req, res, apiHeaders) {
    const installed = DreamVisualizer.depsInstalled();
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, installed }));
  }

  function getPixelArtList(req, res, apiHeaders) {
    try {
      const cycles = [];
      if (ctx.currentEntityId) {
        const entityPaths = require('../entityPaths');
        const pixelArtDir = entityPaths.getPixelArtPath(ctx.currentEntityId);
        if (fs.existsSync(pixelArtDir)) {
          const dirs = fs.readdirSync(pixelArtDir).filter(d => fs.statSync(path.join(pixelArtDir, d)).isDirectory()).sort().reverse().slice(0, 20);
          for (const d of dirs) {
            const metaPath = path.join(pixelArtDir, d, 'visualization-meta.json');
            let meta = null;
            if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) {} }
            const files = fs.readdirSync(path.join(pixelArtDir, d));
            cycles.push({ id: d, meta, hasGif: files.includes('dream-cycle.gif'), frames: files.filter(f => f.endsWith('.png')), files });
          }
        }
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, cycles }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function servePixelArtFile(req, res, apiHeaders, url) {
    try {
      const parts = url.pathname.replace('/api/brain/pixel-art/', '').split('/');
      if (parts.length === 2 && ctx.currentEntityId) {
        const cycleId = parts[0].replace(/[^a-zA-Z0-9_-]/g, '');
        const filename = parts[1].replace(/[^a-zA-Z0-9_.\-]/g, '');
        const entityPaths = require('../entityPaths');
        const pixelArtRoot = entityPaths.getPixelArtPath(ctx.currentEntityId);
        const filePath = path.join(pixelArtRoot, cycleId, filename);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(pixelArtRoot))) {
          res.writeHead(403, apiHeaders);
          res.end(JSON.stringify({ error: 'Access denied' }));
          return;
        }
        if (fs.existsSync(resolved)) {
          const ext = path.extname(filename).toLowerCase();
          const contentType = ctx.MIME_TYPES[ext] || 'application/octet-stream';
          const data = fs.readFileSync(resolved);
          res.writeHead(200, { ...apiHeaders, 'Content-Type': contentType, 'Content-Length': data.length });
          res.end(data);
        } else {
          res.writeHead(404, apiHeaders);
          res.end(JSON.stringify({ error: 'File not found' }));
        }
      } else {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Invalid path — expected /api/brain/pixel-art/{cycleId}/{filename}' }));
      }
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postPixelArtGenerate(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { memoryId, narrative, emotion } = body;
      if (!ctx.dreamVisualizer) { res.writeHead(503, apiHeaders); res.end(JSON.stringify({ error: 'Dream visualizer not initialized' })); return; }
      if (ctx.dreamVisualizer.imageGenMode === 'off') { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Image generation is disabled. Enable it in the Dream Gallery settings.' })); return; }

      let text = narrative || '';
      let emo = emotion || 'neutral';
      if (memoryId && ctx.memoryStorage) {
        const mem = await ctx.memoryStorage.retrieveMemory(memoryId) || await ctx.memoryStorage.retrieveDream(memoryId);
        if (mem) { text = text || mem.semantic || mem.content?.generated_content || ''; emo = emo || mem.emotionalTag || mem.emotion || 'neutral'; }
      }
      if (!text) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ error: 'No narrative text provided or found' })); return; }

      let pixelCallLLM = null;
      if (ctx.currentEntityId) {
        const artRuntime = ctx.loadAspectRuntimeConfig('dream') || ctx.loadAspectRuntimeConfig('subconscious') || ctx.loadAspectRuntimeConfig('main');
        if (artRuntime) {
          pixelCallLLM = async (prompt) => ctx.callLLMWithRuntime(artRuntime, [{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 8000 });
        }
      }

      const useApi = ctx.dreamVisualizer.imageGenMode === 'api' && ctx.dreamVisualizer.imageApiEndpoint && ctx.dreamVisualizer.imageApiKey;
      let result;
      if (useApi) {
        result = await ctx.dreamVisualizer.generateImageFromAPI(text, emo, body.genre || 'memory_remix');
        if (!result) result = await ctx.dreamVisualizer.pixelEngine.generateFromNarrative(text, { emotion: emo, genre: body.genre || 'memory_remix', scale: 4, callLLM: pixelCallLLM });
      } else {
        result = await ctx.dreamVisualizer.pixelEngine.generateFromNarrative(text, { emotion: emo, genre: body.genre || 'memory_remix', scale: 4, callLLM: pixelCallLLM });
      }

      if (ctx.currentEntityId) {
        const entityPaths = require('../entityPaths');
        const pixelArtDir = entityPaths.getPixelArtPath(ctx.currentEntityId);
        const artId = `art_${Date.now()}`;
        const artDir = path.join(pixelArtDir, artId);
        if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });
        fs.writeFileSync(path.join(artDir, 'pixel-art.png'), result.png);
        fs.writeFileSync(path.join(artDir, 'meta.json'), JSON.stringify({ ...result.metadata, memoryId: memoryId || null, narrative: text.slice(0, 500) }, null, 2), 'utf8');
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, artId, url: `/api/brain/pixel-art/${artId}/pixel-art.png`, metadata: result.metadata }));
      } else {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, imageBase64: result.png.toString('base64'), metadata: result.metadata }));
      }
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postBrainSleep(req, res, apiHeaders) {
    try {
      const results = { dreamsGenerated: 0, memoriesDecayed: false, goalsUpdated: false, dreamAgentUsed: false, dreamAgentError: null };
      if (ctx.memoryStorage && typeof ctx.memoryStorage.decayMemories === 'function') {
        await ctx.memoryStorage.decayMemories(0.01);
        results.memoriesDecayed = true;
      }
      if (ctx.dreamEngine && ctx.brainLoop) {
        try {
          if (ctx.currentEntityId) {
            try { const identity = ctx.identityManager.getIdentity(); if (identity) ctx.dreamEngine.setEntityIdentity(identity); } catch (_) {}
          }
          let dreamCallLLM = null;
          if (ctx.currentEntityId) {
            let dreamRuntime = ctx.loadAspectRuntimeConfig('dream');
            if (!dreamRuntime) dreamRuntime = ctx.loadAspectRuntimeConfig('subconscious') || ctx.loadAspectRuntimeConfig('main');
            if (dreamRuntime) {
              dreamCallLLM = async (prompt) => ctx.callLLMWithRuntime(dreamRuntime, [
                { role: 'system', content: 'You are the Imagination Engine of a dreaming AI entity. Write vivid, creative, literary dream stories. First person, present tense. Every dream must be unique.' },
                { role: 'user', content: prompt }
              ], { temperature: 0.85, maxTokens: ctx.getTokenLimit('dreamAgentLoop') });
              results.dreamAgentUsed = true;
            } else {
              results.dreamAgentError = 'dream-provider-not-configured';
            }
          }
          const sleepCfg = (ctx.loadConfig().sleep) || {};
          const maxDreams = sleepCfg.maxDreamCycles || 3;
          const runDreamPhase = require('../brain/cognition/phases/phase-dreams');
          ctx.brainLoop._forcedDreamRun = { maxDreams, isShutdown: false };
          await runDreamPhase(ctx.brainLoop);
          if (dreamCallLLM) results.dreamsGenerated = maxDreams;
        } catch (e) { results.dreamAgentError = e.message; }
      }
      if (ctx.goalsManager) { ctx.goalsManager.decayGoals(2); results.goalsUpdated = true; }
      if (ctx.currentEntityId) {
        try { ctx.contextConsolidator.buildConsolidatedContext(ctx.currentEntityId, require('../entityPaths')); } catch (e2) { console.error('Context rebuild after sleep failed:', e2.message); }
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, ...results }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postCreateCoreMemory(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { semantic, narrative, emotion, topics, importance } = body;
      if (!semantic) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Missing semantic text' })); return; }
      const result = ctx.createCoreMemory({ semantic, narrative, emotion, topics, importance });
      res.writeHead(result.ok ? 200 : 409, apiHeaders);
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getNeurochemistry(req, res, apiHeaders) {
    if (!ctx.neurochemistry) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Neurochemistry not initialized' })); return; }
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, ...ctx.neurochemistry.getStats() }));
  }

  function getSomatic(req, res, apiHeaders) {
    if (!ctx.somaticAwareness) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Somatic awareness not initialized' })); return; }
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, ...ctx.somaticAwareness.getStats() }));
  }

  async function postSomaticToggle(req, res, apiHeaders, readBody) {
    if (!ctx.somaticAwareness) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Somatic awareness not initialized' })); return; }
    try {
      const body = JSON.parse(await readBody(req));
      const { metric, enabled } = body;
      if (!metric || typeof enabled !== 'boolean') { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Missing metric or enabled field' })); return; }
      const success = ctx.somaticAwareness.setMetricEnabled(metric, enabled);
      if (!success) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Unknown metric: ' + metric })); return; }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, metric, enabled, toggles: ctx.somaticAwareness.getMetricToggles() }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getDeepSleepInterval(req, res, apiHeaders) {
    const b = ctx.brainLoop;
    const interval = b ? (b.deepSleepInterval || 150) : 150;
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, deepSleepInterval: interval }));
  }

  async function postDeepSleepInterval(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const val = Number(body.deepSleepInterval);
      if (!Number.isFinite(val) || val < 5 || val > 500) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'deepSleepInterval must be 5–500' }));
        return;
      }
      if (ctx.brainLoop) ctx.brainLoop.deepSleepInterval = val;
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, deepSleepInterval: val }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  return { dispatch };
}

module.exports = createBrainRoutes;
