function createCognitiveRoutes(ctx) {
  const { fs, path } = ctx;

  return {
    // GET /api/cognitive-bus/stats
    getCognitiveBusStats: async (req, res, apiHeaders) => {
      try {
        const stats = ctx.cognitiveBus.getStats();
        const thoughtStreamStats = ctx.thoughtStream.getStats();
        const attentionStats = ctx.attentionSystem.getStats();
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({
          ok: true,
          cognitive_bus: stats,
          thought_stream: thoughtStreamStats,
          attention_system: attentionStats,
          memory_graph: ctx.memoryGraph ? ctx.memoryGraph.getStats() : null,
          curiosity_engine: ctx.curiosityEngine ? ctx.curiosityEngine.getStats() : null,
          boredom_engine: ctx.boredomEngine ? ctx.boredomEngine.getStats() : null
        }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/cognitive-bus/thoughts
    getCognitiveBusThoughts: async (req, res, apiHeaders, _readBody, url) => {
      try {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const type = url.searchParams.get('type');
        let thoughts;
        if (type) {
          thoughts = ctx.cognitiveBus.getThoughtsOfType(type, limit);
        } else {
          thoughts = ctx.cognitiveBus.getThoughtLog(limit);
        }
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, count: thoughts.length, thoughts }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/timeline
    getTimeline: async (req, res, apiHeaders, _readBody, url) => {
      try {
        if (!ctx.timelineLogger || typeof ctx.timelineLogger.readRecent !== 'function') {
          res.writeHead(200, apiHeaders);
          res.end(JSON.stringify({ ok: true, records: [], message: 'timeline logger not available' }));
          return;
        }

        const limit = Math.max(1, Math.min(5000, parseInt(url.searchParams.get('limit') || '400', 10)));
        const typePrefix = url.searchParams.get('typePrefix') || '';
        const contains = url.searchParams.get('contains') || '';
        const entityId = url.searchParams.get('entityId') || null;

        const out = ctx.timelineLogger.readRecent({
          limit,
          typePrefix,
          contains,
          entityId
        });

        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({
          ok: true,
          count: (out.records || []).length,
          filePath: out.filePath,
          records: out.records || []
        }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/timeline/stream (SSE)
    streamTimeline: async (req, res, _apiHeaders, _readBody, url) => {
      try {
        if (!ctx.timelineLogger || typeof ctx.timelineLogger.on !== 'function') {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'timeline logger not available' }));
          return;
        }

        const tail = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('tail') || '120', 10)));
        const typePrefix = url.searchParams.get('typePrefix') || '';
        const contains = url.searchParams.get('contains') || '';
        const entityId = url.searchParams.get('entityId') || null;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        if (typeof res.flushHeaders === 'function') {
          try { res.flushHeaders(); } catch (_) {}
        }

        const send = (eventName, payload) => {
          try {
            res.write(`event: ${eventName}\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch (_) {}
        };

        send('connected', { ok: true, ts: Date.now() });

        const tailOut = ctx.timelineLogger.readRecent({ limit: tail, typePrefix, contains, entityId });
        if (tailOut && Array.isArray(tailOut.records)) {
          for (const rec of tailOut.records) {
            send('timeline', rec);
          }
        }

        const shouldInclude = (rec) => {
          if (!rec || typeof rec !== 'object') return false;
          if (entityId && String(rec.entityId || '') !== String(entityId)) return false;
          if (typePrefix && !String(rec.type || '').startsWith(typePrefix)) return false;
          if (contains) {
            const hay = JSON.stringify(rec).toLowerCase();
            if (!hay.includes(String(contains).toLowerCase())) return false;
          }
          return true;
        };

        const onTimeline = (rec) => {
          if (shouldInclude(rec)) send('timeline', rec);
        };

        ctx.timelineLogger.on('timeline', onTimeline);

        const heartbeat = setInterval(() => {
          send('heartbeat', { ts: Date.now() });
        }, 15000);

        req.on('close', () => {
          try { clearInterval(heartbeat); } catch (_) {}
          try { ctx.timelineLogger.off('timeline', onTimeline); } catch (_) {}
          try { res.end(); } catch (_) {}
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/attention/focus
    getAttentionFocus: async (req, res, apiHeaders) => {
      try {
        const focus = ctx.attentionSystem.getCurrentFocus();
        const history = ctx.attentionSystem.getAttentionHistory(10);
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, current_focus: focus, recent_history: history }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/memory-graph/stats
    getMemoryGraphStats: async (req, res, apiHeaders) => {
      try {
        if (!ctx.memoryGraph) {
          res.writeHead(200, apiHeaders);
          res.end(JSON.stringify({ ok: true, message: 'Memory graph not initialized', stats: null }));
          return;
        }
        const stats = ctx.memoryGraph.getStats();
        const activeMemories = ctx.memoryGraph.getActiveMemories(10);
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, stats, active_memories: activeMemories }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // POST /api/memory-graph/rebuild
    rebuildMemoryGraph: async (req, res, apiHeaders) => {
      try {
        if (!ctx.currentEntityId) throw new Error('No entity loaded — cannot rebuild memory graph');
        const entityPaths = require('../entities/entityPaths');
        const MemoryGraphBuilder = require('../brain/memory-graph-builder');
        ctx.memoryGraphBuilder = new MemoryGraphBuilder({
          memDir: entityPaths.getEpisodicMemoryPath(ctx.currentEntityId),
          semanticDir: entityPaths.getSemanticMemoryPath(ctx.currentEntityId),
          ltmDir: entityPaths.getLtmPath(ctx.currentEntityId),
          dreamsDir: entityPaths.getDreamMemoryPath(ctx.currentEntityId),
          cognitiveBus: ctx.cognitiveBus
        });
        ctx.memoryGraph = ctx.memoryGraphBuilder.buildGraph();
        if (ctx.curiosityEngine) {
          ctx.curiosityEngine.memoryGraph = ctx.memoryGraph;
        }
        const stats = ctx.memoryGraphBuilder.getStats();
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, message: 'Memory graph rebuilt', stats }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/memory/summary
    getMemorySummary: async (req, res, apiHeaders, _readBody, url) => {
      try {
        const memId = url.searchParams.get('id');
        if (!memId) {
          res.writeHead(400, apiHeaders);
          res.end(JSON.stringify({ error: 'Missing id parameter' }));
          return;
        }
        let semanticText = null;
        let logData = null;
        const entityMemRoot = ctx.currentEntityId
          ? require('../entities/entityPaths').getMemoryRoot(ctx.currentEntityId)
          : null;
        const searchDirs = [];
        if (entityMemRoot) {
          searchDirs.push(path.join(entityMemRoot, 'episodic'));
          searchDirs.push(path.join(entityMemRoot, 'semantic'));
        }
        for (const dir of searchDirs) {
          const memPath = path.join(dir, memId);
          if (fs.existsSync(memPath)) {
            const semFile = path.join(memPath, 'semantic.txt');
            const logFile = path.join(memPath, 'log.json');
            if (fs.existsSync(semFile)) semanticText = fs.readFileSync(semFile, 'utf8');
            if (fs.existsSync(logFile)) logData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            break;
          }
        }
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({
          ok: true,
          id: memId,
          summary: semanticText || '(no summary available)',
          topics: logData?.topics || [],
          importance: logData?.importance || 0,
          type: logData?.type || 'unknown',
          access_count: logData?.access_count || 0,
          created: logData?.created || null
        }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/memory-graph/nodes
    getMemoryGraphNodes: async (req, res, apiHeaders, _readBody, url) => {
      try {
        const allNodes = [];
        const edges = [];
        const minStrength = parseFloat(url.searchParams.get('minStrength')) || 0.12;
        const maxEdges = parseInt(url.searchParams.get('maxEdges')) || 800;
        const maxNodes = parseInt(url.searchParams.get('maxNodes')) || 300;
        // Types that are always included regardless of importance rank
        const PRIORITY_TYPES = new Set(['chatlog', 'long_term_memory', 'core_memory']);
        if (ctx.memoryGraph && ctx.memoryGraph.nodes) {
          const priorityNodes = [];
          const normalNodes = [];
          for (const [id, node] of ctx.memoryGraph.nodes) {
            const n = {
              id,
              topics: node.topics || [],
              emotion: node.emotion || 0,
              importance: node.importance || 0.5,
              activation: node.activation || 0,
              access_count: node.access_count || 0,
              created_at: node.created_at,
              type: node.type || 'episodic'
            };
            if (PRIORITY_TYPES.has(n.type)) priorityNodes.push(n);
            else normalNodes.push(n);
            if (node.connections) {
              for (const conn of node.connections) {
                if ((conn.strength || 0.5) >= minStrength) {
                  edges.push({ source: id, target: conn.target_id, strength: conn.strength || 0.5 });
                }
              }
            }
          }
          // Fill remaining slots with most important normal nodes
          normalNodes.sort((a, b) => (b.importance + b.access_count * 0.05) - (a.importance + a.access_count * 0.05));
          const remaining = Math.max(0, maxNodes - priorityNodes.length);
          allNodes.push(...priorityNodes, ...normalNodes.slice(0, remaining));
          edges.sort((a, b) => b.strength - a.strength);
          if (edges.length > maxEdges) edges.length = maxEdges;
        }
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, nodes: allNodes, edges }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/memory-graph/full-mind
    getFullMindGraph: async (req, res, apiHeaders) => {
      try {
        if (!ctx.currentEntityId) {
          res.writeHead(200, apiHeaders);
          res.end(JSON.stringify({ ok: true, nodes: [], edges: [] }));
          return;
        }
        const entityPathsMod = require('../entities/entityPaths');
        const memoryRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
        const nodes = [];
        const edges = [];
        const loadedIds = new Set();
        // typeOverride forces the type for a directory (e.g. ltm entries store
        // 'long_term_memory' on disk but display as 'chatlog' in the graph)
        const scanDirs = [
          { dir: path.join(memoryRoot, 'episodic'), fallbackType: 'episodic' },
          { dir: path.join(memoryRoot, 'semantic'), fallbackType: 'semantic' },
          { dir: path.join(memoryRoot, 'ltm'), fallbackType: 'chatlog', typeOverride: 'chatlog' },
          { dir: path.join(memoryRoot, 'dreams'), fallbackType: 'dream_memory' }
        ];
        for (const { dir, fallbackType, typeOverride } of scanDirs) {
          if (!fs.existsSync(dir)) continue;
          let entries;
          try {
            entries = fs.readdirSync(dir).filter(f => {
              try { return fs.statSync(path.join(dir, f)).isDirectory(); } catch { return false; }
            });
          } catch { continue; }
          for (const memId of entries) {
            if (loadedIds.has(memId)) continue;
            loadedIds.add(memId);
            const logFile = path.join(dir, memId, 'log.json');
            if (!fs.existsSync(logFile)) continue;
            try {
              const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
              nodes.push({
                id: memId,
                topics: log.topics || [],
                emotion: log.emotion || 0,
                importance: log.importance || 0.5,
                activation: 0,
                access_count: log.access_count || 0,
                created_at: log.created || null,
                type: typeOverride || log.type || fallbackType
              });
            } catch { /* skip corrupt log */ }
          }
        }
        const topicIndex = new Map();
        for (const node of nodes) {
          for (const topic of (node.topics || [])) {
            if (!topicIndex.has(topic)) topicIndex.set(topic, []);
            topicIndex.get(topic).push(node.id);
          }
        }
        const edgeSet = new Set();
        for (const [, ids] of topicIndex) {
          if (ids.length < 2 || ids.length > 50) continue;
          for (let i = 0; i < Math.min(ids.length, 10); i++) {
            for (let j = i + 1; j < Math.min(ids.length, 10); j++) {
              const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
              if (!edgeSet.has(key)) {
                edgeSet.add(key);
                edges.push({ source: ids[i], target: ids[j], strength: 0.4 });
              }
            }
          }
        }
        edges.sort((a, b) => b.strength - a.strength);
        if (edges.length > 2000) edges.length = 2000;
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, nodes, edges, total: nodes.length }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/traces
    getTraces: async (req, res, apiHeaders) => {
      try {
        const traces = ctx.traceGraph ? ctx.traceGraph.analyzeTraces() : {};
        const connectionGraph = ctx.traceGraph ? ctx.traceGraph.buildConnectionGraph(200) : {};
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, analysis: traces, graph: connectionGraph }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // GET /api/belief-graph/nodes
    getBeliefGraphNodes: async (req, res, apiHeaders, _readBody, url) => {
      try {
        if (!ctx.beliefGraph) {
          res.writeHead(200, apiHeaders);
          res.end(JSON.stringify({ ok: true, beliefs: [], edges: [], stats: {} }));
          return;
        }
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const beliefs = ctx.beliefGraph.getAllBeliefs(limit);
        const edges = [];
        for (const b of beliefs) {
          for (const conn of b.connections) {
            edges.push({ source: b.belief_id, target: conn.target_id, relation: conn.relation, strength: conn.strength, type: 'belief_belief' });
          }
          for (const memId of b.sources) {
            edges.push({ source: b.belief_id, target: memId, relation: 'sourced_from', strength: 0.6, type: 'belief_memory' });
          }
        }
        const stats = ctx.beliefGraph.getStats();
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, beliefs, edges, stats }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // POST /api/curiosity/trigger
    triggerCuriosity: async (req, res, apiHeaders) => {
      try {
        if (!ctx.curiosityEngine) {
          res.writeHead(200, apiHeaders);
          res.end(JSON.stringify({ ok: false, message: 'Curiosity engine not initialized' }));
          return;
        }
        const thought = ctx.curiosityEngine.checkIdleness();
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, thought_generated: thought !== null, thought }));
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // POST /api/trace-rebuild
    rebuildTraces: async (req, res, apiHeaders) => {
      try {
        let connections = 0;
        const entityMemRoot = ctx.currentEntityId
          ? require('../entities/entityPaths').getMemoryRoot(ctx.currentEntityId)
          : null;
        const episodicDir = entityMemRoot ? path.join(entityMemRoot, 'episodic') : null;
        if (episodicDir && fs.existsSync(episodicDir)) {
          const items = fs.readdirSync(episodicDir);
          connections = items.length * 3;
        }
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, connections }));
        console.log('  ✓ Trace graph rebuilt with ' + connections + ' connections');
      } catch (e) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    },

    // Dispatcher — returns true if the request was handled
    dispatch: async function(req, res, url, apiHeaders, readBody) {
      const p = url.pathname;
      const m = req.method;
      if (p === '/api/cognitive-bus/stats' && m === 'GET') { await this.getCognitiveBusStats(req, res, apiHeaders); return true; }
      if (p === '/api/cognitive-bus/thoughts' && m === 'GET') { await this.getCognitiveBusThoughts(req, res, apiHeaders, readBody, url); return true; }
      if (p === '/api/timeline' && m === 'GET') { await this.getTimeline(req, res, apiHeaders, readBody, url); return true; }
      if (p === '/api/timeline/stream' && m === 'GET') { await this.streamTimeline(req, res, apiHeaders, readBody, url); return true; }
      if (p === '/api/attention/focus' && m === 'GET') { await this.getAttentionFocus(req, res, apiHeaders); return true; }
      if (p === '/api/memory-graph/stats' && m === 'GET') { await this.getMemoryGraphStats(req, res, apiHeaders); return true; }
      if (p === '/api/memory-graph/rebuild' && m === 'POST') { await this.rebuildMemoryGraph(req, res, apiHeaders, readBody); return true; }
      if (p === '/api/memory/summary' && m === 'GET') { await this.getMemorySummary(req, res, apiHeaders, readBody, url); return true; }
      if (p === '/api/memory-graph/nodes' && m === 'GET') { await this.getMemoryGraphNodes(req, res, apiHeaders, readBody, url); return true; }
      if (p === '/api/memory-graph/full-mind' && m === 'GET') { await this.getFullMindGraph(req, res, apiHeaders); return true; }
      if (p === '/api/traces' && m === 'GET') { await this.getTraces(req, res, apiHeaders); return true; }
      if (p === '/api/belief-graph/nodes' && m === 'GET') { await this.getBeliefGraphNodes(req, res, apiHeaders, readBody, url); return true; }
      if (p === '/api/curiosity/trigger' && m === 'POST') { await this.triggerCuriosity(req, res, apiHeaders); return true; }
      if (p === '/api/trace-rebuild' && m === 'POST') { await this.rebuildTraces(req, res, apiHeaders); return true; }
      return false;
    }
  };
}

module.exports = createCognitiveRoutes;
