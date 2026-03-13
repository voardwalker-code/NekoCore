// ── Chat Routes ───────────────────────────────────────────────
// POST /api/chat, POST /api/shutdown,
// GET|POST /api/telegram/*, 

function createChatRoutes(ctx) {
  const { enforceResponseContract } = require('../contracts/response-contracts');
  const logTimeline = (type, payload = {}) => {
    try {
      if (ctx.timelineLogger && typeof ctx.timelineLogger.logEvent === 'function') {
        ctx.timelineLogger.logEvent(type, payload);
      }
    } catch (_) {}
  };

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/shutdown' && m === 'POST') { await shutdown(res, apiHeaders); return true; }
    if (p === '/api/chat' && m === 'POST') { await chat(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/telegram/status' && m === 'GET') { telegramStatus(req, res, apiHeaders); return true; }
    if (p === '/api/telegram/config' && m === 'POST') { await telegramConfig(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/telegram/start' && m === 'POST') { await telegramStart(req, res, apiHeaders); return true; }
    if (p === '/api/telegram/stop' && m === 'POST') { telegramStop(req, res, apiHeaders); return true; }
    return false;
  }

  async function shutdown(res, apiHeaders) {
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, message: 'Server shutting down — running sleep cycle...' }));
    console.log('\n  Server shutdown requested from UI. Running graceful shutdown...');
    try {
      await ctx.gracefulShutdown('ui');
      // Allow stdout flush so the user can see final shutdown logs.
      setTimeout(() => process.exit(0), 120);
    } catch (err) {
      console.error('  ⚠ UI shutdown failed:', err.message);
      process.exit(1);
    }
  }

  async function chat(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { message: userMessage, chatHistory } = body;

      logTimeline('api.chat.request', {
        userMessage: String(userMessage || '').slice(0, 1200),
        chatHistoryCount: Array.isArray(chatHistory) ? chatHistory.length : 0
      });

      if (!userMessage) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Missing message' }));
        logTimeline('api.chat.rejected', { reason: 'missing_message' });
        return;
      }

      const result = await ctx.processChatMessage(userMessage, chatHistory || []);

      res.writeHead(200, apiHeaders);
      const chatResponse = {
        ok: true,
        response: result.finalResponse,
        chunks: result.chunks || null,
        innerDialog: result.innerDialog
      };
      if (result.innerDialog?.subconscious?.memoryContext?.connections) {
        chatResponse.memoryConnections = result.innerDialog.subconscious.memoryContext.connections.map(c => ({
          id: c.id,
          relevanceScore: c.relevanceScore,
          topics: c.topics,
          importance: c.importance,
          decay: c.decay,
          type: c.type,
          semantic: (c.semantic || '').slice(0, 200)
        }));
      }
      if (result.toolResults && result.toolResults.length > 0) {
        chatResponse.toolResults = result.toolResults.map(t => ({
          command: t.command,
          params: t.params || {},
          success: t.success !== false,
          result: typeof t.result === 'string' ? t.result.slice(0, 500) : t.result
        }));
      }
      if (result.taskPlan) {
        chatResponse.taskPlan = {
          steps: result.taskPlan.steps.map(s => ({ description: s.description, done: s.done })),
          stepOutputs: (result.taskPlan.stepOutputs || []).map(s => ({
            step: s.step,
            description: s.description,
            output: (s.output || '').slice(0, 300)
          })),
          llmCalls: result.taskPlan.llmCalls || 0
        };
      }
      res.end(JSON.stringify(enforceResponseContract('/api/chat', chatResponse)));
      logTimeline('api.chat.response', {
        ok: true,
        responseLength: String(result.finalResponse || '').length,
        memoryConnections: Array.isArray(chatResponse.memoryConnections) ? chatResponse.memoryConnections.length : 0,
        toolResults: Array.isArray(chatResponse.toolResults) ? chatResponse.toolResults.length : 0
      });

      // Broadcast any follow-up messages via SSE with natural staggered delays.
      // These arrive as additional chat bubbles without requiring a new user prompt.
      const followUps = Array.isArray(result.followUps) ? result.followUps : [];
      if (followUps.length > 0 && typeof ctx.broadcastSSE === 'function') {
        let cumulativeDelay = 1800; // start 1.8s after main response
        for (const msg of followUps) {
          const text = String(msg || '').trim();
          if (!text) continue;
          const delay = cumulativeDelay;
          setTimeout(() => {
            try {
              ctx.broadcastSSE('chat_follow_up', { message: text, timestamp: Date.now() });
            } catch (_) {}
          }, delay);
          // Each subsequent follow-up waits for the typing time of the previous one
          cumulativeDelay += Math.min(2500 + text.length * 40, 7000);
        }
      }
    } catch (e) {
      console.error('  ⚠ Chat orchestration error:', e.message);
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
      logTimeline('api.chat.error', { error: e.message });
    }
  }

  function telegramStatus(req, res, apiHeaders) {
    const config = ctx.loadConfig();
    const tgConfig = config?.telegram || {};
    const bot = ctx.telegramBot;
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({
      ok: true,
      configured: !!tgConfig.botToken,
      enabled: !!tgConfig.enabled,
      connected: !!(bot && bot.running),
      botUsername: bot?.botInfo?.username || null,
      activeChats: bot ? bot.chatHistories.size : 0
    }));
  }

  async function telegramConfig(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { botToken, enabled, allowedChatIds } = body;
      const config = ctx.loadConfig();
      config.telegram = {
        enabled: enabled !== undefined ? !!enabled : !!(config.telegram?.enabled),
        botToken: botToken !== undefined ? String(botToken).trim() : (config.telegram?.botToken || ''),
        allowedChatIds: Array.isArray(allowedChatIds)
          ? allowedChatIds.map(Number).filter(n => !isNaN(n))
          : (config.telegram?.allowedChatIds || [])
      };
      ctx.saveConfig(config);
      console.log('  \u2713 Telegram config saved');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function telegramStart(req, res, apiHeaders) {
    try {
      if (ctx.telegramBot && ctx.telegramBot.running) {
        ctx.telegramBot.stop();
      }
      await ctx.startTelegramBot();
      const bot = ctx.telegramBot;
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        connected: !!(bot && bot.running),
        botUsername: bot?.botInfo?.username || null
      }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function telegramStop(req, res, apiHeaders) {
    if (ctx.telegramBot) {
      ctx.telegramBot.stop();
    }
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, connected: false }));
  }

  return { dispatch };
}

module.exports = createChatRoutes;
