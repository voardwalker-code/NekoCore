function createRuntimeLifecycle(deps = {}) {
  let shuttingDown = false;

  async function startTelegramBot() {
    try {
      const config = deps.loadConfig();
      const tgConfig = config?.telegram;
      if (!tgConfig || !tgConfig.botToken) {
        console.log('  ℹ Telegram: no bot token configured (add telegram.botToken to Config/ma-config.json)');
        return;
      }

      if (!tgConfig.enabled) {
        console.log('  ℹ Telegram: disabled in config (set telegram.enabled to true)');
        return;
      }

      const bot = new deps.TelegramBot({
        botToken: tgConfig.botToken,
        allowedChatIds: tgConfig.allowedChatIds || null,
        tts: (tgConfig.tts?.enabled && tgConfig.tts?.apiKey) ? {
          apiKey: tgConfig.tts.apiKey,
          model: tgConfig.tts.model || 'tts-1',
          voice: tgConfig.tts.voice || 'nova'
        } : null,
        onMessage: async (_chatId, text, _userName, history) => {
          const chatHistory = history.map((h) => ({ role: h.role, content: h.content }));
          const result = await deps.processChatMessage(text, chatHistory);
          return result.finalResponse;
        },
        onWebContent: tgConfig.webBrowsing !== false ? async (text) => deps.webFetch.processWebContent(text) : null,
        onWebSearch: tgConfig.webBrowsing !== false ? async (query) => {
          const results = await deps.webFetch.webSearch(query);
          return deps.webFetch.formatSearchResults(results, query);
        } : null
      });

      await bot.start();
      deps.setTelegramBot(bot);

      deps.cognitiveBus.emitThought({
        type: deps.ThoughtTypes.SYSTEM_LOG,
        source: 'telegram',
        message: `Telegram bot @${bot.botInfo.username} connected and polling.`,
        importance: 0.6
      });
    } catch (err) {
      console.warn(`  ⚠ Telegram bot failed to start: ${err.message}`);
    }
  }

  async function gracefulShutdown(source) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n  ⏳ Graceful shutdown (${source}) — saving state...`);

    try {
      const brainLoop = deps.getBrainLoop();
      const somaticAwareness = deps.getSomaticAwareness();
      const neurochemistry = deps.getNeurochemistry();
      const memoryStorage = deps.getMemoryStorage();
      const goalsManager = deps.getGoalsManager();
      const dreamEngine = deps.getDreamEngine();
      const currentEntityId = deps.getCurrentEntityId();
      const identityManager = deps.getIdentityManager();

      if (brainLoop && brainLoop.running) {
        brainLoop.stop();
      }

      if (brainLoop && typeof brainLoop._saveState === 'function') {
        brainLoop._saveState();
        console.log('  ✓ Brain loop state saved');
      }

      if (somaticAwareness) {
        somaticAwareness.stopPolling();
      }

      if (neurochemistry && memoryStorage) {
        try {
          neurochemistry.pruneWeakConnections();
          const allMems = await memoryStorage.listMemories(100);
          if (allMems && allMems.length > 0) {
            neurochemistry.runConsolidation(allMems);
          }
          console.log('  ✓ Final consolidation complete');
        } catch (e) {
          console.warn('  ⚠ Final consolidation error:', e.message);
        }
      }

      if (memoryStorage && typeof memoryStorage.decayMemories === 'function') {
        try {
          await memoryStorage.decayMemories(0.01);
          console.log('  ✓ Shutdown sleep-cycle: memory decay pass complete');
        } catch (e) {
          console.warn('  ⚠ Shutdown sleep-cycle decay error:', e.message);
        }
      }
      if (goalsManager && typeof goalsManager.decayGoals === 'function') {
        try {
          goalsManager.decayGoals(2);
          console.log('  ✓ Shutdown sleep-cycle: goals decay pass complete');
        } catch (e) {
          console.warn('  ⚠ Shutdown sleep-cycle goals error:', e.message);
        }
      }

      if (dreamEngine && brainLoop && deps.getMemoryIndex() && currentEntityId) {
        try {
          let dreamRuntime = deps.loadAspectRuntimeConfig('dream');
          if (!dreamRuntime) dreamRuntime = deps.loadAspectRuntimeConfig('subconscious') || deps.loadAspectRuntimeConfig('main');
          if (dreamRuntime) {
            const dreamCallLLM = async (prompt) => deps.callLLMWithRuntime(dreamRuntime, [
              { role: 'system', content: 'You are the Imagination Engine of a dreaming AI entity. Write a brief, vivid dream story. First person, present tense.' },
              { role: 'user', content: prompt }
            ], { temperature: 0.85, maxTokens: deps.getTokenLimit('dreamAgentLoop') });

            try {
              const identity = identityManager.getIdentity();
              if (identity) dreamEngine.setEntityIdentity(identity);
            } catch (_) {}

            const runDreamPhase = require('../brain/cognition/phases/phase-dreams');
            brainLoop._forcedDreamRun = { maxDreams: 1, isShutdown: true };
            await runDreamPhase(brainLoop);
            console.log('  ✓ Shutdown dream generated');
          }
        } catch (e) {
          console.warn('  ⚠ Shutdown dream error:', e.message);
        }
      } else {
        console.log('  ℹ Shutdown dream skipped (missing dream subsystem/runtime prerequisites)');
      }

      if (currentEntityId) {
        try {
          const entityPaths = require('../entities/entityPaths');
          deps.contextConsolidator.buildConsolidatedContext(currentEntityId, entityPaths);
          console.log('  ✓ Shutdown sleep-cycle: context rebuilt');
        } catch (e) {
          console.warn('  ⚠ Shutdown context rebuild error:', e.message);
        }
      }

      // ── Shutdown diary entries ──
      // Life Diary: summarize the session
      // Dream Diary: pick the most important dream of the session
      if (currentEntityId && identityManager) {
        let diaryRuntime = deps.loadAspectRuntimeConfig('dream');
        if (!diaryRuntime) diaryRuntime = deps.loadAspectRuntimeConfig('subconscious') || deps.loadAspectRuntimeConfig('main');

        if (diaryRuntime) {
          const diaryCallLLM = async (prompt) => deps.callLLMWithRuntime(diaryRuntime, [
            { role: 'user', content: prompt }
          ], { temperature: 0.75, maxTokens: 600 });

          // Life Diary — session summary
          try {
            const LifeDiary = require('../brain/identity/life-diary');
            const { getSessionSummaryPrompt } = require('../brain/generation/diary-prompts');
            const identity = identityManager.getIdentity();

            if (identity) {
              // Gather recent memory summaries for context
              const recentSummaries = [];
              if (memoryStorage) {
                const recent = await memoryStorage.listMemories(15);
                for (const m of recent.slice(0, 10)) {
                  try {
                    const full = await memoryStorage.retrieveMemory(m.id);
                    if (full && full.semantic) recentSummaries.push(full.semantic);
                  } catch (_) {}
                }
              }

              const ctx = {};
              if (neurochemistry) {
                try {
                  ctx.neurochemistry = typeof neurochemistry.getState === 'function'
                    ? neurochemistry.getState()
                    : (typeof neurochemistry.getChemicalState === 'function' ? neurochemistry.getChemicalState() : null);
                } catch (_) {}
              }
              if (goalsManager) {
                try {
                  ctx.goals = goalsManager.getActiveGoals(3).map(g => ({ description: g.description }));
                } catch (_) {}
              }

              const prompt = getSessionSummaryPrompt(identity, recentSummaries, ctx);
              const narrative = await diaryCallLLM(prompt);
              if (narrative && narrative.length >= 10) {
                const result = await LifeDiary.appendEntry(currentEntityId, 'Session Summary', narrative);
                if (result.ok) console.log('  ✓ Life diary: session summary written');
              }
            }
          } catch (e) {
            console.warn('  ⚠ Shutdown life diary error:', e.message);
          }

          // Dream Diary — best dream of the session
          try {
            const brainLoop = deps.getBrainLoop();
            const bestDream = brainLoop && brainLoop._bestSessionDream;
            if (bestDream) {
              const DreamDiary = require('../brain/identity/dream-diary');
              const { getDreamDiaryPrompt } = require('../brain/generation/diary-prompts');
              const identity = identityManager.getIdentity();

              if (identity) {
                const prompt = getDreamDiaryPrompt(identity, bestDream);
                const narrative = await diaryCallLLM(prompt);
                if (narrative && narrative.length >= 10) {
                  const result = await DreamDiary.appendDreamEntry(currentEntityId, bestDream, narrative);
                  if (result.ok) console.log('  ✓ Dream diary: best dream of session written');
                }
              }
            }
          } catch (e) {
            console.warn('  ⚠ Shutdown dream diary error:', e.message);
          }
        }
      }

      // Release all entity checkouts on shutdown
      try {
        const entityCheckout = require('./entity-checkout');
        entityCheckout.releaseAll();
        console.log('  ✓ All entity checkouts released');
      } catch (e) {
        console.warn('  ⚠ Checkout cleanup error:', e.message);
      }

      deps.broadcastSSE('server_shutdown', { message: 'Server shutting down — state saved' });
      console.log('  ✓ Graceful shutdown complete. Goodbye!');
    } catch (e) {
      console.error('  ⚠ Shutdown error:', e.message);
    }
  }

  return {
    startTelegramBot,
    gracefulShutdown
  };
}

module.exports = createRuntimeLifecycle;
