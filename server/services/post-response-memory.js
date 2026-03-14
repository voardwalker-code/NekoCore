'use strict';
const { parseJsonBlock } = require('./llm-runtime-utils');

async function runPostResponseMemoryEncoding(params = {}) {
  const {
    effectiveUserMessage,
    finalResponse,
    innerDialog,
    memoryEntityId,
    memoryAspectConfigs,
    callLLMWithRuntime,
    getTokenLimit,
    createCoreMemory,
    createSemanticKnowledge,
    broadcastSSE,
    traceGraph,
    memoryGraph,
    logTimeline,
    memoryStorage,
    entityName,
    userName,
    activeUserId,
    entityPersona
  } = params;

  if (!memoryEntityId || !memoryAspectConfigs?.subconscious) return;

  try {
    const safeUserMsg = String(effectiveUserMessage || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .substring(0, 600);

    const safeResponse = String(finalResponse || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .substring(0, 800);

    const entityLabel = entityName ? `The entity's name is "${entityName}"` : 'The entity';
    const userLabel = (userName && userName !== 'User') ? `The user's name is "${userName}"` : 'The user is unnamed';
    const nameGuard = `IMPORTANT: ${entityLabel}. ${userLabel}. Do NOT label the user as "${entityName || 'the entity'}". Keep them clearly distinct in the memory summary.`;

    const memPrompt = `Process this conversation exchange into a memory record.

${nameGuard}

USER: "${safeUserMsg}"
ENTITY (${entityName || 'entity'}): "${safeResponse}"

Return ONLY this JSON (no other text, no markdown, no explanation):
{"episodic":{"semantic":"<1-2 sentence summary>","narrative":"<2-3 sentence experience description>","emotion":"<primary emotion>","topics":["topic1","topic2"],"importance":<0.3-0.95>},"knowledge":"<factual knowledge learned, or empty string>"}`;

    const memResult = await callLLMWithRuntime(memoryAspectConfigs.background || memoryAspectConfigs.subconscious, [
      { role: 'system', content: 'You are a JSON-only memory encoder. You MUST respond with raw JSON only — no prose, no explanation, no markdown fences, no thinking. Output starts with { and ends with }.' },
      { role: 'user', content: memPrompt }
    ], { temperature: 0.1, maxTokens: getTokenLimit('memoryEncoding'), timeout: 30000, responseFormat: 'json' });

    let memData = parseJsonBlock(memResult);

    if (!memData) {
      let cleaned = String(memResult || '').trim();
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      cleaned = cleaned.replace(/\r/g, '').replace(/\t/g, ' ');

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('  ⚠ Memory encoding: LLM returned non-JSON, using fallback memory. Raw response:', String(memResult || '').substring(0, 300));
        const fallbackData = {
          semantic: safeUserMsg.substring(0, 150),
          narrative: `User said: ${safeUserMsg.substring(0, 100)}. Entity responded.`,
          emotion: 'neutral',
          topics: [],
          importance: 0.4
        };
        const coreResult = createCoreMemory(fallbackData);
        if (coreResult.ok) {
          console.log(`  🧠 Episodic memory created (fallback): ${coreResult.memId}`);
          broadcastSSE('memory_created', {
            memory_id: coreResult.memId,
            type: 'episodic',
            importance: 0.4,
            topics: [],
            emotion: 'neutral',
            timestamp: Date.now()
          });
        }
        return;
      }

      let jsonStr = jsonMatch[0].replace(/\n/g, ' ');
      const openBraces = (jsonStr.match(/\{/g) || []).length;
      const closeBraces = (jsonStr.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        const lastQuote = jsonStr.lastIndexOf('"');
        const afterLast = jsonStr.substring(lastQuote + 1).trim();
        if (afterLast === '' || afterLast === ',') {
          jsonStr = jsonStr.substring(0, lastQuote + 1) + '}'.repeat(openBraces - closeBraces);
        } else {
          jsonStr += '}'.repeat(openBraces - closeBraces);
        }
      }

      try {
        memData = JSON.parse(jsonStr);
      } catch (_) {
        console.warn('  ⚠ Memory encoding: JSON repair failed, using fallback memory');
        memData = {
          episodic: {
            semantic: safeUserMsg.substring(0, 150),
            narrative: `User said: ${safeUserMsg.substring(0, 100)}. Entity responded.`,
            emotion: 'neutral',
            topics: [],
            importance: 0.4
          },
          knowledge: ''
        };
      }
    }

    const episodic = memData.episodic || memData;
    const knowledge = memData.knowledge || '';

    if (!episodic.semantic) return;

    // E3: Guard against system boilerplate leaking into stored memory summaries.
    // This can happen when the memory-encoding LLM echoes back the context block
    // it received as input rather than generating a fresh summary.
    const MEMORY_BOILERPLATE_MARKERS = [
      '[SUBCONSCIOUS MEMORY CONTEXT]',
      'Subconscious turn context for this user message',
      '[CONVERSATION RECALL]',
      '[INTERNAL-RESUME]'
    ];
    if (MEMORY_BOILERPLATE_MARKERS.some(m => String(episodic.semantic).includes(m))) {
      console.warn('  ⚠ Memory encoding: blocked — semantic summary contains system boilerplate. Skipping memory creation.');
      return;
    }

    const coreResult = createCoreMemory({
      semantic: episodic.semantic,
      narrative: episodic.narrative || episodic.semantic,
      emotion: episodic.emotion || 'neutral',
      topics: episodic.topics || [],
      importance: episodic.importance || 0.5
    });

    if (!coreResult.ok) {
      if (coreResult.duplicate) {
        console.log('  ℹ Memory encoding: duplicate detected, skipped');
      }
      return;
    }

    // Stamp active user onto the log.json so memories are attributed to who said them
    if (activeUserId && coreResult.memId && memoryEntityId) {
      try {
        const entityPathsMod = require('../entityPaths');
        const fs = require('fs');
        const path = require('path');
        const episodicPath = entityPathsMod.getEpisodicMemoryPath(memoryEntityId);
        const logPath = path.join(episodicPath, coreResult.memId, 'log.json');
        if (fs.existsSync(logPath)) {
          const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
          log.userId = activeUserId;
          log.userName = userName || null;
          fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
          // Sync userId/userName into the in-memory index cache so retrieval can use it
          if (memoryStorage && memoryStorage.indexCache) {
            memoryStorage.indexCache.addMemory(coreResult.memId, log);
          }
        }
      } catch (_) {}
    }

    console.log(`  🧠 Episodic memory created: ${coreResult.memId}`);
    broadcastSSE('memory_created', {
      memory_id: coreResult.memId,
      type: 'episodic',
      importance: episodic.importance || 0.5,
      topics: episodic.topics || [],
      emotion: episodic.emotion || 'neutral',
      timestamp: Date.now()
    });

    if (knowledge && knowledge.length >= 10) {
      const semResult = createSemanticKnowledge({
        knowledge,
        topics: episodic.topics || [],
        importance: Math.min(1.0, (episodic.importance || 0.5) + 0.1),
        sourceMemId: coreResult.memId
      });
      if (semResult.ok) {
        console.log(`  💡 Semantic knowledge created: ${semResult.memId}`);
      } else if (semResult.duplicate) {
        console.log('  ℹ Semantic knowledge: duplicate detected, skipped');
      }
    }

    if (!traceGraph) return;

    try {
      const retrievedMemories = innerDialog?.subconscious?.memoryContext?.connections || [];

      for (const conn of retrievedMemories.slice(0, 10)) {
        if (conn.id && memoryGraph) {
          memoryGraph.activateMemory(conn.id, 0.7);
          logTimeline('memory.used', {
            memory_id: conn.id,
            source: 'subconscious_retrieval',
            relevanceScore: Number(conn.relevanceScore || 0)
          });
          broadcastSSE('memory_accessed', {
            memory_id: conn.id,
            source: 'subconscious_retrieval',
            timestamp: Date.now()
          });
          if (memoryStorage && typeof memoryStorage.logAccess === 'function') {
            memoryStorage.logAccess(conn.id, null, 'subconscious_retrieval').catch(() => {});
          }
        }
      }

      const traceId = traceGraph.createTrace('conversation_turn', coreResult.memId);

      for (const conn of retrievedMemories.slice(0, 10)) {
        if (conn.id && conn.id !== coreResult.memId) {
          traceGraph.addStep(coreResult.memId, conn.id, 'subconscious_retrieval');
        }
      }

      for (const conn of retrievedMemories.slice(0, 5)) {
        if (conn.id && conn.id !== coreResult.memId) {
          traceGraph.addStep(conn.id, coreResult.memId, 'conversation_continuity');
        }
      }

      traceGraph.closeTrace();
      console.log(`  📊 Trace graph updated: ${traceId} (${retrievedMemories.length} connections)`);
      logTimeline('trace.updated', {
        traceId,
        source: 'conversation_turn',
        memory_id: coreResult.memId,
        retrievedCount: retrievedMemories.length,
        retrievedIds: retrievedMemories.slice(0, 10).map((m) => m.id)
      });
    } catch (traceErr) {
      console.warn('  ⚠ Trace graph update failed:', traceErr.message);
    }

    // ── Update per-user relationship (fire-and-forget) ──────────────────
    if (activeUserId && memoryEntityId && memoryAspectConfigs?.subconscious) {
      try {
        const relSvc = require('./relationship-service');
        relSvc.updateRelationshipFromExchange({
          entityId: memoryEntityId,
          userId: activeUserId,
          userName: userName || 'User',
          entityName: entityName || 'Entity',
          userMessage: effectiveUserMessage,
          entityResponse: finalResponse,
          entityPersona,
          callLLMWithRuntime,
          runtimeConfig: memoryAspectConfigs.background || memoryAspectConfigs.subconscious,
          getTokenLimit
        }).catch(e => console.warn('  ⚠ Relationship update async error:', e.message));
      } catch (relErr) {
        console.warn('  ⚠ Relationship update init error:', relErr.message);
      }
    }
  } catch (err) {
    console.warn('  ⚠ Memory encoding failed:', err.message);
  }
}

module.exports = {
  runPostResponseMemoryEncoding
};
