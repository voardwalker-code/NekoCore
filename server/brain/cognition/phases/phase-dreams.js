// Phase: Dream Generation
// Generates vivid story-like dreams during REM cycles via the Imagination Engine.
// Phase 9: frequency gate — dreams fire when seed pool is non-empty OR every dreamInterval cycles.

const path = require('path');
const fs = require('fs');
const ThoughtTypes = require('../../bus/thought-types');
const { selectDreamCandidates, bucketDreamCandidates } = require('../dream-maintenance-selector');
const { writeDreamSourceLinks, emitDreamLinkEvents } = require('../../knowledge/dream-link-writer');

async function dreamsPhase(loop) {
  if (!loop.dreamEngine) return;

  // B-1: System entity guard — skip dream generation for entities with dreamDisabled flag
  if (loop.memDir) {
    try {
      const _entityFile = path.join(loop.memDir, 'entity.json');
      if (fs.existsSync(_entityFile)) {
        const _entityData = JSON.parse(fs.readFileSync(_entityFile, 'utf8'));
        if (_entityData.dreamDisabled) {
          loop._emit('phase', { name: 'dream', status: 'skipped', reason: 'dreamDisabled' });
          console.log('  ℹ Dream phase skipped: dreamDisabled flag set for this entity');
          return;
        }
      }
    } catch (_) { /* entity.json unreadable — allow dreams to proceed */ }
  }

  const forcedRun = loop._forcedDreamRun && typeof loop._forcedDreamRun === 'object'
    ? loop._forcedDreamRun
    : null;
  const forceMode = !!forcedRun;

  // Phase 9 frequency gate: dreamInterval (default 5) replaces the old hard-coded % 3
  const dreamInterval = loop.dreamInterval || 5;
  if (!forceMode && loop.cycleCount % dreamInterval !== 0) return;

  const activeLLM = loop._callLLM;
  if (!activeLLM) return;

  const directives = loop._lastDirectives;
  if (directives && directives.skipDreams) {
    loop._emit('phase', { name: 'dream', status: 'skipped', reason: 'homeostasis' });
    return;
  }

  loop._emit('phase', { name: 'dream', status: 'running' });

  // Feed entity identity into dream engine for personality-aware dreams
  if (loop._identityManager) {
    try {
      const identity = loop._identityManager.getIdentity();
      if (identity) loop.dreamEngine.setEntityIdentity(identity);
    } catch (_) { /* identity not available yet */ }
  }

  // Resolve dream runtime from aspect configs
  const dreamRuntime = (loop._aspectConfigs &&
    (loop._aspectConfigs.dream || loop._aspectConfigs.subconscious || loop._aspectConfigs.main)) || null;

  if (!dreamRuntime) {
    loop._emit('phase', { name: 'dream', status: 'done' });
    return;
  }

  const dreamCallLLM = async (prompt) => activeLLM(dreamRuntime, [
    { role: 'system', content: 'You are the Imagination Engine of a dreaming AI entity. Write vivid, creative, literary dream stories. First person, present tense. Every dream must be unique.' },
    { role: 'user', content: prompt }
  ], { temperature: 0.85, maxTokens: loop._getTokenLimit('dreamAgentLoop') || 2000 });

  await _runDreamCycle(loop, dreamCallLLM, {
    maxDreams: forceMode ? Number(forcedRun.maxDreams || 1) : 1,
    isShutdown: forceMode ? !!forcedRun.isShutdown : false
  });

  if (forceMode) {
    loop._forcedDreamRun = null;
  }

  loop._emit('phase', { name: 'dream', status: 'done' });
}

async function _runDreamCycle(loop, dreamCallLLM, options = {}) {
  try {
    const { maxDreams, isShutdown } = {
      maxDreams: Number(options.maxDreams || 1),
      isShutdown: !!options.isShutdown
    };
    const cycleInfo = loop.dreamEngine.startDreamCycle(maxDreams, isShutdown);

    const seedPoolSize = Math.max(cycleInfo.max_dreams * 3, 8);

    // Check dream seed pool first — seeds from interrupted cognitive pulse thoughts
    // produce more coherent, personally meaningful dreams than random memory selection.
    let priorityMemories = [];
    let pulseSeeded = false;
    if (loop.dreamSeedPool && loop.dreamSeedPool.size > 0) {
      const pulseSeeds = loop.dreamSeedPool.drain();
      console.log(`  \u2713 Dream seed pool: ${pulseSeeds.length} interrupted thought(s) to seed dreams`);
      if (loop._memoryIndex) {
        const allIndexed = [
          ...loop._memoryIndex.episodicMemories,
          ...loop._memoryIndex.semanticMemories
        ];
        for (const seed of pulseSeeds) {
          const found = allIndexed.find(m => m.id === seed.nodeId);
          if (found) priorityMemories.push(found);
        }
      }
      if (priorityMemories.length > 0) pulseSeeded = true;
    }

    // Use deterministic selector to score + rank maintenance candidates [JS_OFFLOAD]
    // Falls back to getMostImportant when memory index is unavailable.
    let selectorCandidates = [];
    if (loop._memoryIndex) {
      const allIndexed = [
        ...(loop._memoryIndex.episodicMemories || []),
        ...(loop._memoryIndex.semanticMemories || [])
      ];
      const graph = loop.traceGraph || null;
      const graphProxy = graph && typeof graph.getEdges === 'function'
        ? { getDegree: (id) => (graph.getEdges(id) || []).length }
        : null;
      const ranked = selectDreamCandidates(allIndexed, null, graphProxy, { minScore: 0.25, maxCandidates: seedPoolSize });
      selectorCandidates = ranked.map(r => r.memory);
    }
    const topMemories = selectorCandidates.length > 0
      ? selectorCandidates
      : (loop._memoryIndex ? loop._memoryIndex.getMostImportant(seedPoolSize) : []);
    // Priority seeds (from cognitive pulse) come first; top-up with selector output
    const seedMemories = [...priorityMemories, ...topMemories].slice(0, seedPoolSize);

    const goals = loop.goalsManager ? loop.goalsManager.getDreamGoals(cycleInfo.max_dreams) : null;

    const dreams = await loop.dreamEngine.generateCycleDreams(seedMemories, goals, dreamCallLLM);    // Tag dreams that were seeded from the cognitive pulse (affects significance scoring)
    if (pulseSeeded) { for (const d of dreams) d.pulseSeeded = true; }    console.log(`  ✓ Dream phase: generated ${dreams.length} dream(s)`);

    if (loop.memoryStorage) {
      for (const dream of dreams) {
        if (loop.cognitiveBus) {
          loop.cognitiveBus.emitThought({
            type: ThoughtTypes.DREAM_GENERATED,
            source: 'dream_phase',
            title: dream.title || dream.semantic || null,
            genre: dream.genre || null,
            emotion: dream.emotion || null,
            pulseSeeded: !!dream.pulseSeeded,
            importance: 0.55
          });
        }

        // Phase 9: store to multi-tier DreamMemory if available
        let isSignificant = false;
        if (loop.dreamMemory) {
          const storeResult = await loop.dreamMemory.store(dream);
          isSignificant = storeResult.isCore || false; // Check if dream was promoted to CoreDreamMemory
        } else {
          // Legacy flat-file fallback
          await loop.memoryStorage.storeDream(dream);
        }
        const dreamMemory = {
          id: `dream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          semantic: `[DREAM — not a real event] ${dream.semantic || ''}`,
          summary: dream.summary || '',
          content: { ...dream.content, is_dream: true, dream_genre: dream.genre, dream_genre_label: dream.genre_label, full_dream_text: dream.fullText || '' },
          type: 'dream_memory',
          importance: 0.35,
          decay: 0.85,
          topics: ['dream', 'imagination', dream.genre || 'unknown'],
          emotionalTag: dream.emotion || null,
          created: dream.created || new Date().toISOString()
        };
        await loop.memoryStorage.storeMemory(dreamMemory);

        // Track the best dream of the session for diary entry at shutdown.
        // Dream diary entries are written at shutdown, not per-dream.
        if (!loop._bestSessionDream || (dream.pulseSeeded && !loop._bestSessionDream.pulseSeeded)) {
          loop._bestSessionDream = dream;
        }

        // B5: Write dream-to-source links and emit bus event [dream-link-writer]
        const dreamStorageId = dreamMemory.id;
        const sourceIds = Array.isArray(dream.origin_memories) ? dream.origin_memories : [];
        await writeDreamSourceLinks(dreamStorageId, sourceIds, { genre: dream.genre, timestamp: dream.created }, loop.memoryStorage);
        emitDreamLinkEvents(loop.cognitiveBus, { dreamId: dreamStorageId, sourceIds, genre: dream.genre, timestamp: dream.created });
      }
    }

    if (dreams.length > 0) {
      const analysis = loop.dreamEngine.analyzeDreamPatterns(dreams);
      console.log(`  ℹ Dream analysis: ${analysis.total_dreams} dream(s), insights: ${(analysis.insights || []).join('; ')}`);
    }

    // Generate pixel art visualizations
    if (loop.dreamVisualizer && dreams.length > 0) {
      try {
        const entityPaths = require('../../../entityPaths');
        const pixelArtDir = entityPaths.getPixelArtPath(loop.memoryStorage.entityId || 'default');
        const cycleId = `cycle_${Date.now()}`;
        const cycleDir = path.join(pixelArtDir, cycleId);
        let pixelCallLLM = null;
        const artRuntime = loop._aspectConfigs && (loop._aspectConfigs.dream || loop._aspectConfigs.subconscious || loop._aspectConfigs.main);
        if (loop._callLLM && artRuntime) {
          pixelCallLLM = async (prompt) => loop._callLLM(artRuntime, [{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 1000 });
        }
        const vizResult = await loop.dreamVisualizer.visualizeDreamCycle(dreams, pixelCallLLM, cycleDir);
        if (vizResult) {
          console.log(`  ✓ Dream pixel art: ${vizResult.frames.length} frame(s), GIF saved`);
          // Append image references to dream diary
          _appendDreamImages(loop, cycleId, vizResult);
        }
      } catch (vizErr) {
        console.warn('  ⚠ Dream visualization failed (non-fatal):', vizErr.message);
      }
    }
  } catch (err) {
    console.error('  ⚠ Dream phase error:', err.message);
  }
}

/**
 * Generate a Dream Diary entry for a significant dream (CoreDreamMemory).
 * @private
 */
async function _generateDreamDiaryEntry(loop, dream) {
  const DreamDiary = require('../../identity/dream-diary');
  const { getDreamDiaryPrompt } = require('../../generation/diary-prompts');

  try {
    const entityId = loop.memoryStorage?.entityId;
    if (!entityId) return;

    const identity = loop._identityManager?.getIdentity();
    if (!identity) return;

    // Only generate diary entry if LLM is available
    if (!loop._callLLM || !loop._aspectConfigs) return;

    const runtime = loop._aspectConfigs.dream || loop._aspectConfigs.subconscious || loop._aspectConfigs.main;
    if (!runtime) return;

    const prompt = getDreamDiaryPrompt(identity, dream);
    const dreamDiaryCallLLM = async (msg) => loop._callLLM(runtime, [
      { role: 'user', content: msg }
    ], { temperature: 0.75, maxTokens: 500 });

    const narrative = await dreamDiaryCallLLM(prompt);
    if (!narrative || narrative.length < 10) return;

    // Append entry to dream diary
    const result = await DreamDiary.appendDreamEntry(entityId, dream, narrative);
    if (result.ok) {
      console.log(`  ✓ Dream diary entry created for: "${dream.title || dream.semantic}"`);
    }
  } catch (err) {
    console.error(`  ⚠ Dream diary generation error:`, err.message);
  }
}

/**
 * Append image references to the dream diary after pixel art generation.
 * @private
 */
function _appendDreamImages(loop, cycleId, vizResult) {
  try {
    const entityId = loop.memoryStorage?.entityId;
    if (!entityId) return;
    const entityPaths = require('../../../entityPaths');
    const diaryPath = entityPaths.getDreamDiaryPath(entityId);
    if (!fs.existsSync(diaryPath)) return;

    let imgBlock = `\n**Dream Visualizations** (${cycleId}):\n\n`;
    // Use savedFiles.frames (file paths) to derive filenames
    if (vizResult.savedFiles && vizResult.savedFiles.frames && vizResult.savedFiles.frames.length > 0) {
      for (const framePath of vizResult.savedFiles.frames) {
        const fname = path.basename(framePath);
        imgBlock += `![dream art](/api/brain/pixel-art/${cycleId}/${fname})\n\n`;
      }
    }
    imgBlock += `![dream cycle gif](/api/brain/pixel-art/${cycleId}/dream-cycle.gif)\n\n---\n`;
    fs.appendFileSync(diaryPath, imgBlock, 'utf8');
    console.log(`  ✓ Dream diary images appended for ${cycleId}`);
  } catch (err) {
    console.warn(`  ⚠ Failed to append dream images to diary:`, err.message);
  }
}

module.exports = dreamsPhase;
