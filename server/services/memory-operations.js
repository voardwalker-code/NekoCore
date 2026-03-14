'use strict';
/**
 * server/services/memory-operations.js
 * Phase A Re-evaluation — A-Re3
 *
 * Core memory creation helpers: createCoreMemory, createSemanticKnowledge.
 * Both write to the entity's episodic/semantic directories.
 *
 * Usage:
 *   const { createCoreMemory, createSemanticKnowledge } = createMemoryOperations({
 *     getCurrentEntityId: () => currentEntityId,
 *     getMemoryStorage:   () => memoryStorage,
 *     getMemoryGraph:     () => memoryGraph,
 *     logTimeline
 *   });
 */

'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

/**
 * @param {{
 *   getCurrentEntityId: Function,
 *   getMemoryStorage:   Function,
 *   getMemoryGraph:     Function,
 *   logTimeline:        Function
 * }} deps
 */
function createMemoryOperations({ getCurrentEntityId, getMemoryStorage, getMemoryGraph, logTimeline }) {

  function createCoreMemory({ semantic, narrative, emotion, topics, importance }) {
    const currentEntityId = getCurrentEntityId();
    const memoryStorage = getMemoryStorage();
    const memoryGraph = getMemoryGraph();

    if (!currentEntityId || !memoryStorage) {
      logTimeline('memory.core.create_failed', { reason: 'no_active_entity' });
      return { ok: false, error: 'No active entity' };
    }

    const entityPathsMod = require('../entityPaths');
    const episodicPath = entityPathsMod.getEpisodicMemoryPath(currentEntityId);
    const normalizedSemantic = (semantic || '').toLowerCase().replace(/\s+/g, ' ').trim();

    if (!normalizedSemantic) {
      logTimeline('memory.core.create_failed', { reason: 'empty_semantic' });
      return { ok: false, error: 'Empty semantic text' };
    }

    // Deduplicate: scan existing memory semantics
    try {
      if (fs.existsSync(episodicPath)) {
        const existingDirs = fs.readdirSync(episodicPath).filter(d => {
          try { return fs.statSync(path.join(episodicPath, d)).isDirectory(); } catch { return false; }
        });
        for (const memDir of existingDirs) {
          const semPath = path.join(episodicPath, memDir, 'semantic.txt');
          if (fs.existsSync(semPath)) {
            const existing = fs.readFileSync(semPath, 'utf8').toLowerCase().replace(/\s+/g, ' ').trim();
            if (existing === normalizedSemantic) {
              console.log(`  ⚠ Duplicate core memory skipped: "${semantic.substring(0, 60)}..."`);
              logTimeline('memory.core.duplicate', {
                semantic: (semantic || '').slice(0, 240),
                existingId: memDir,
                topics: topics || []
              });
              return { ok: false, duplicate: true, existingId: memDir };
            }
          }
        }
      }
    } catch (err) {
      console.warn('  ⚠ Dedup scan failed, proceeding anyway:', err.message);
    }

    // Create the memory
    const memId = 'mem_' + crypto.randomBytes(4).toString('hex');
    const memDir = path.join(episodicPath, memId);

    try {
      fs.mkdirSync(memDir, { recursive: true });

      // semantic.txt
      fs.writeFileSync(path.join(memDir, 'semantic.txt'), semantic, 'utf8');

      // memory.zip (compressed content)
      const memContent = JSON.stringify({
        semantic: semantic,
        narrative: narrative || semantic,
        emotion: emotion || 'neutral',
        topics: topics || [],
        phase: 'core_memory',
        createdDuring: 'conversation'
      });
      fs.writeFileSync(path.join(memDir, 'memory.zip'), zlib.gzipSync(memContent));

      // log.json
      const log = {
        memory_id: memId,
        created: new Date().toISOString(),
        importance: Math.min(1.0, Math.max(0, importance || 0.8)),
        emotion: emotion || 'neutral',
        decay: 0.005, // Very slow decay for core memories
        topics: topics || [],
        access_count: 0,
        type: 'core_memory'
      };
      fs.writeFileSync(path.join(memDir, 'log.json'), JSON.stringify(log, null, 2), 'utf8');

      // Update index cache
      if (memoryStorage.indexCache) {
        memoryStorage.indexCache.addMemory(memId, log);
        memoryStorage.indexCache.save();
      }

      // Add to in-memory graph so activateMemory() can find it immediately
      if (memoryGraph) {
        memoryGraph.addMemoryNode({
          id: memId,
          topics: topics || [],
          emotion: 0,
          importance: log.importance,
          created: log.created,
          access_count: 0
        });
      }

      console.log(`  ✓ Created new core memory: ${memId} — "${semantic.substring(0, 60)}"`);
      logTimeline('memory.core.created', {
        memId,
        semantic: (semantic || '').slice(0, 320),
        emotion: emotion || 'neutral',
        topics: topics || [],
        importance: log.importance
      });
      return { ok: true, memId };
    } catch (err) {
      console.error(`  ⚠ Failed to create core memory: ${err.message}`);
      logTimeline('memory.core.create_failed', {
        reason: err.message,
        semantic: (semantic || '').slice(0, 240)
      });
      return { ok: false, error: err.message };
    }
  }

  function createSemanticKnowledge({ knowledge, topics, importance, sourceMemId }) {
    const currentEntityId = getCurrentEntityId();
    const memoryStorage = getMemoryStorage();
    const memoryGraph = getMemoryGraph();

    if (!currentEntityId || !memoryStorage) {
      logTimeline('memory.semantic.create_failed', { reason: 'no_active_entity' });
      return { ok: false, error: 'No active entity' };
    }

    const entityPathsMod = require('../entityPaths');
    const semanticPath = entityPathsMod.getSemanticMemoryPath(currentEntityId);
    const normalizedKnowledge = (knowledge || '').toLowerCase().replace(/\s+/g, ' ').trim();

    if (!normalizedKnowledge || normalizedKnowledge.length < 10) {
      logTimeline('memory.semantic.create_failed', { reason: 'knowledge_too_short' });
      return { ok: false, error: 'Knowledge too short or empty' };
    }

    // Deduplicate: scan existing semantic memories
    try {
      if (fs.existsSync(semanticPath)) {
        const existingDirs = fs.readdirSync(semanticPath).filter(d => {
          try { return fs.statSync(path.join(semanticPath, d)).isDirectory(); } catch { return false; }
        });
        for (const memDir of existingDirs) {
          const semPath = path.join(semanticPath, memDir, 'semantic.txt');
          if (fs.existsSync(semPath)) {
            const existing = fs.readFileSync(semPath, 'utf8').toLowerCase().replace(/\s+/g, ' ').trim();
            if (existing === normalizedKnowledge) {
              logTimeline('memory.semantic.duplicate', {
                knowledge: (knowledge || '').slice(0, 240),
                existingId: memDir,
                topics: topics || []
              });
              return { ok: false, duplicate: true, existingId: memDir };
            }
          }
        }
      }
    } catch (err) {
      console.warn('  ⚠ Semantic dedup scan failed, proceeding anyway:', err.message);
    }

    const memId = 'sem_' + crypto.randomBytes(4).toString('hex');
    const memDir = path.join(semanticPath, memId);

    try {
      fs.mkdirSync(memDir, { recursive: true });

      // semantic.txt — the knowledge itself
      fs.writeFileSync(path.join(memDir, 'semantic.txt'), knowledge, 'utf8');

      // memory.zip (compressed content)
      const memContent = JSON.stringify({
        knowledge,
        topics: topics || [],
        sourceMemId: sourceMemId || null,
        phase: 'semantic_knowledge',
        createdDuring: 'conversation'
      });
      fs.writeFileSync(path.join(memDir, 'memory.zip'), zlib.gzipSync(memContent));

      // log.json
      const log = {
        memory_id: memId,
        created: new Date().toISOString(),
        importance: Math.min(1.0, Math.max(0, importance || 0.6)),
        emotion: 'neutral',
        decay: 0.002, // Semantic knowledge decays very slowly
        topics: topics || [],
        access_count: 0,
        type: 'semantic_knowledge',
        sourceMemId: sourceMemId || null
      };
      fs.writeFileSync(path.join(memDir, 'log.json'), JSON.stringify(log, null, 2), 'utf8');

      // Update index cache
      if (memoryStorage.indexCache) {
        memoryStorage.indexCache.addMemory(memId, log);
        memoryStorage.indexCache.save();
      }

      // Add to in-memory graph so activateMemory() can find it immediately
      if (memoryGraph) {
        memoryGraph.addMemoryNode({
          id: memId,
          topics: topics || [],
          emotion: 0,
          importance: log.importance,
          created: log.created,
          access_count: 0
        });
      }

      console.log(`  💡 Created semantic knowledge: ${memId} — "${knowledge.substring(0, 60)}"`);
      logTimeline('memory.semantic.created', {
        memId,
        knowledge: (knowledge || '').slice(0, 320),
        topics: topics || [],
        importance: log.importance,
        sourceMemId: sourceMemId || null
      });
      return { ok: true, memId };
    } catch (err) {
      console.error(`  ⚠ Failed to create semantic knowledge: ${err.message}`);
      logTimeline('memory.semantic.create_failed', {
        reason: err.message,
        knowledge: (knowledge || '').slice(0, 240)
      });
      return { ok: false, error: err.message };
    }
  }

  return { createCoreMemory, createSemanticKnowledge };
}

module.exports = { createMemoryOperations };
