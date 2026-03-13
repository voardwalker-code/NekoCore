'use strict';
/**
 * server/services/memory-retrieval.js
 * Phase A Re-evaluation — A-Re4
 *
 * Subconscious memory retrieval pipeline.
 *
 * Pure module-scope helpers:
 *   extractSubconsciousTopics, getSemanticPreview, getChatlogContent,
 *   buildSubconsciousContextBlock
 *
 * Factory-bound (needs runtime state via getters):
 *   getSubconsciousMemoryContext
 *
 * Usage:
 *   const { getSubconsciousMemoryContext, extractSubconsciousTopics } =
 *     createMemoryRetrieval({
 *       getCurrentEntityId, getMemoryStorage, getMemoryIndex,
 *       getNeurochemistry, getCognitivePulse, getCognitiveBus,
 *       logTimeline, callSubconsciousReranker, loadAspectRuntimeConfig
 *     });
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { normalizeTopics } = require('../brain/topic-utils');
const ThoughtTypes = require('../brain/thought-types');

// ── Pure helpers ──────────────────────────────────────────────────────────────

function extractSubconsciousTopics(messageText) {
  if (!messageText || typeof messageText !== 'string') return [];
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'was', 'are', 'be', 'been',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'with', 'from', 'have', 'what', 'when', 'where', 'why', 'how',
    'about', 'into', 'just', 'like', 'your', 'their', 'them', 'then', 'than'
  ]);

  const raw = messageText
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(w => w.length >= 4 && !stopwords.has(w))
    .slice(0, 12);

  return normalizeTopics(raw);
}

function getSemanticPreview(memRoot, memId) {
  try {
    // Check episodic first, then semantic knowledge store
    const episodicPath = path.join(memRoot, 'episodic', memId, 'semantic.txt');
    if (fs.existsSync(episodicPath)) {
      return fs.readFileSync(episodicPath, 'utf8').trim().slice(0, 280);
    }
    const semanticPath = path.join(memRoot, 'semantic', memId, 'semantic.txt');
    if (fs.existsSync(semanticPath)) {
      return fs.readFileSync(semanticPath, 'utf8').trim().slice(0, 280);
    }
    return '';
  } catch (e) {
    return '';
  }
}

/**
 * Load full chatlog content for an LTM memory.
 * Reads from the ltm/ directory's content.txt (full compressed chatlog).
 * Falls back to decompressing memory.zip from episodic if ltm dir not found.
 */
function getChatlogContent(memRoot, ltmId, maxChars = 2000) {
  try {
    // Primary: read from ltm/ directory content.txt
    const ltmContentPath = path.join(memRoot, 'ltm', ltmId, 'content.txt');
    if (fs.existsSync(ltmContentPath)) {
      return fs.readFileSync(ltmContentPath, 'utf8').trim().slice(0, maxChars);
    }
    // Fallback: decompress from episodic memory.zip
    const episodicZip = path.join(memRoot, 'episodic', ltmId, 'memory.zip');
    if (fs.existsSync(episodicZip)) {
      const decompressed = zlib.gunzipSync(fs.readFileSync(episodicZip));
      const parsed = JSON.parse(decompressed.toString());
      return (parsed.content || parsed.semantic || '').slice(0, maxChars);
    }
    return '';
  } catch (e) {
    return '';
  }
}

function buildSubconsciousContextBlock(messageText, topics, connections, chatlogContext, relationshipBlock) {
  const lines = [];
  const normalizeTopicList = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const seen = new Set();
    const out = [];
    for (const raw of arr) {
      const t = String(raw || '').trim().toLowerCase();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= 10) break;
    }
    return out;
  };

  lines.push('[SUBCONSCIOUS MEMORY CONTEXT]');
  lines.push('User message: ' + messageText);
  lines.push('Detected topics: ' + (topics.length ? topics.join(', ') : 'none'));
  if (!connections || connections.length === 0) {
    lines.push('Potentially related memories: none');
    lines.push('No reliable memory matches found for this turn. Do not invent memory events.');
  } else {
    lines.push('Potentially related memories (main should decide relevance):');

    connections.forEach((c, idx) => {
      const cleanTopics = normalizeTopicList(c.topics);
      const topicStr = cleanTopics.length ? cleanTopics.join(', ') : 'none';
      const sem = c.semantic ? c.semantic.replace(/\s+/g, ' ').trim() : '';
      const isDocument = c.source === 'document_digest' || c.type === 'knowledge_memory' || String(c.id || '').startsWith('doc_');
      const memType = isDocument ? '[DOCUMENT]' : (c.type === 'semantic_knowledge') ? '[KNOWLEDGE]' : '[EXPERIENCE]';
      const userTag = (!isDocument && c.userName) ? ` with user="${c.userName}"` : '';
      lines.push(
        `${idx + 1}. ${memType}${userTag} id=${c.id} score=${Number(c.relevanceScore || 0).toFixed(3)} topics=[${topicStr}] summary="${sem || 'n/a'}"`
      );
    });

    lines.push('EXPERIENCE memories are past conversations. The "with user" tag identifies which user was in that conversation.');
    lines.push('KNOWLEDGE memories are extracted facts/insights from conversations.');
    lines.push('DOCUMENT memories are ingested from external files/documents — NOT from the user, NOT from any conversation. Do not attribute document content to the user.');
    lines.push('Use this as optional context only. If weakly relevant, ignore it.');
  }

  // Append chatlog context if available
  if (chatlogContext && chatlogContext.length > 0) {
    lines.push('');
    lines.push('[CONVERSATION RECALL]');
    lines.push('The following compressed chatlogs are from past conversations related to the recalled memories.');
    lines.push('Reconstruct the narrative context to understand the full conversational history.');
    for (const cl of chatlogContext) {
      lines.push(`--- chatlog id=${cl.id} topic_overlap=${cl.overlap} ---`);
      if (cl.sessionMeta) lines.push(cl.sessionMeta);
      lines.push(cl.content);
      lines.push('--- end ---');
    }
  }

  // Append relationship context if available
  if (relationshipBlock && typeof relationshipBlock === 'string' && relationshipBlock.trim()) {
    lines.push('');
    lines.push(relationshipBlock);
  }

  return lines.join('\n');
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   getCurrentEntityId:       Function,
 *   getMemoryStorage:         Function,
 *   getMemoryIndex:           Function,
 *   getNeurochemistry:        Function,
 *   getCognitivePulse:        Function,
 *   getCognitiveBus:          Function,
 *   logTimeline:              Function,
 *   callSubconsciousReranker: Function,
 *   loadAspectRuntimeConfig:  Function
 * }} deps
 */
function createMemoryRetrieval({
  getCurrentEntityId,
  getMemoryStorage,
  getMemoryIndex,
  getNeurochemistry,
  getCognitivePulse,
  getCognitiveBus,
  logTimeline,
  callSubconsciousReranker,
  loadAspectRuntimeConfig,
  getActiveUserId
}) {

  async function getSubconsciousMemoryContext(userMessage, limit = 36) {
    const currentEntityId = getCurrentEntityId();
    const memoryStorage = getMemoryStorage();
    const memoryIndex = getMemoryIndex();
    const neurochemistry = getNeurochemistry();
    const cognitivePulse = getCognitivePulse();
    const cognitiveBus = getCognitiveBus();

    logTimeline('memory.recall.requested', {
      userMessage: String(userMessage || '').slice(0, 400),
      limit
    });
    const topics = extractSubconsciousTopics(userMessage);
    const connections = [];

    const wantsAllCoreMemories = /\b(all|list|show|summary|summarize|tell|give|recall|what|describe)\b.*\b(core\s+memories?|memories?|remember|past|history|goals?)\b/i.test(userMessage)
      || /\bcore\s+memories?\b/i.test(userMessage)
      || /\b(what|tell me)\b.*\b(remember|recall|know about)\b/i.test(userMessage)
      || /\bmemories?\b.*\b(summary|have|do you|stored|about)\b/i.test(userMessage)
      || /\b(mood|feeling|how are you)\b/i.test(userMessage);

    if (memoryStorage && memoryStorage.indexCache && currentEntityId) {
      const entityPaths = require('../entities/entityPaths');
      const memoryRoot = entityPaths.getMemoryRoot(currentEntityId);
      const scoreMap = new Map();

      if (wantsAllCoreMemories) {
        memoryStorage.indexCache.load();
        const allEntries = Object.entries(memoryStorage.indexCache.memoryIndex || {});
        for (const [memId, meta] of allEntries) {
          if (!meta) continue;
          const importance = Number(meta.importance ?? 0.5);
          const decay = Number(meta.decay ?? 1.0);
          const relevanceScore = (importance * 0.7) + (decay * 0.3);
          connections.push({
            id: memId,
            relevanceScore,
            topics: meta.topics || [],
            importance,
            decay,
            type: meta.type || 'episodic',
            semantic: getSemanticPreview(memoryRoot, memId),
            userId: meta.userId || null,
            userName: meta.userName || null
          });
        }
      }

      topics.forEach((topic, idx) => {
        const ids = memoryStorage.indexCache.getMemoriesByTopic(topic) || [];
        const topicWeight = Math.max(1, topics.length - idx);
        ids.forEach(memId => {
          const prev = scoreMap.get(memId) || 0;
          scoreMap.set(memId, prev + topicWeight);
        });
      });

      for (const [memId, baseScore] of scoreMap.entries()) {
        const meta = memoryStorage.indexCache.getMemoryMeta(memId);
        if (!meta) continue;
        const importance = Number(meta.importance ?? 0.5);
        const decay = Number(meta.decay ?? 1.0);
        let relevanceScore = baseScore * (0.35 + (importance * decay));

        // Neurochemistry emotion similarity bonus
        if (neurochemistry && meta.emotionalTag) {
          const emotionSim = neurochemistry.emotionSimilarity(meta.emotionalTag);
          relevanceScore *= (1 + emotionSim * 0.3); // up to 30% boost for emotional match
        }

        connections.push({
          id: memId,
          relevanceScore,
          topics: meta.topics || [],
          importance,
          decay,
          type: meta.type || 'episodic',
          semantic: getSemanticPreview(memoryRoot, memId),
          userId: meta.userId || null,
          userName: meta.userName || null
        });
      }

      // ── Fallback: if topic search found 0 results, surface top memories by importance ──
      if (connections.length === 0 && memoryStorage.indexCache) {
        memoryStorage.indexCache.load();
        const allEntries = Object.entries(memoryStorage.indexCache.memoryIndex || {});
        if (allEntries.length > 0) {
          console.log(`  ℹ Subconscious fallback: topic search found 0 matches, surfacing top ${Math.min(limit, allEntries.length)} memories by importance`);
          const sorted = allEntries
            .map(([memId, meta]) => ({ memId, meta, score: (Number(meta.importance ?? 0.5) * 0.7) + (Number(meta.decay ?? 1.0) * 0.3) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
          for (const { memId, meta, score } of sorted) {
            connections.push({
              id: memId,
              relevanceScore: score,
              topics: meta.topics || [],
              importance: Number(meta.importance ?? 0.5),
              decay: Number(meta.decay ?? 1.0),
              type: meta.type || 'episodic',
              semantic: getSemanticPreview(memoryRoot, memId),
              userId: meta.userId || null,
              userName: meta.userName || null
            });
          }
        }
      }
    } else {
      const indexed = memoryIndex.searchMemories(topics, limit) || [];
      indexed.forEach(m => {
        connections.push({
          id: m.id,
          relevanceScore: Number(m.relevanceScore || 0),
          topics: m.topics || [],
          importance: Number(m.importance || 0.5),
          decay: Number(m.decay || 1.0),
          type: m.type || 'episodic',
          semantic: (m.summary || '').slice(0, 280),
          userId: m.userId || null,
          userName: m.userName || null
        });
      });
    }

    // Pulse-trace hints: reuse wandering cognitive paths as soft retrieval priors.
    let pulseHints = [];
    let pulseHintError = null;
    if (cognitivePulse && topics.length > 0) {
      try {
        pulseHints = cognitivePulse.getMessageTraceHints({
          topics,
          limit: Math.max(limit, 16),
          maxDepth: 4,
          minScore: 0.05
        }) || [];

        if (pulseHints.length > 0) {
          const entityPaths = require('../entities/entityPaths');
          const memoryRoot = currentEntityId ? entityPaths.getMemoryRoot(currentEntityId) : null;
          const existingById = new Map();
          connections.forEach((c, idx) => existingById.set(c.id, idx));

          for (const hint of pulseHints) {
            const boost = Math.max(0, Math.min(1, Number(hint.score || 0))) * 0.35;
            const hitIdx = existingById.get(hint.id);
            if (hitIdx !== undefined) {
              const curr = Number(connections[hitIdx].relevanceScore || 0);
              connections[hitIdx].pulseTraceScore = Number(hint.score || 0);
              connections[hitIdx].pulsePath = Array.isArray(hint.path) ? hint.path : [];
              connections[hitIdx].relevanceScore = curr * (1 + boost);
              continue;
            }

            // If topic retrieval missed it, allow pulse-discovered memories to enter with modest prior.
            if (!memoryStorage || !memoryStorage.indexCache || !memoryRoot) continue;
            const meta = memoryStorage.indexCache.getMemoryMeta(hint.id);
            if (!meta) continue;
            const prior = 0.15 + (boost * 0.85);
            connections.push({
              id: hint.id,
              relevanceScore: prior,
              pulseTraceScore: Number(hint.score || 0),
              pulsePath: Array.isArray(hint.path) ? hint.path : [],
              topics: meta.topics || [],
              importance: Number(meta.importance ?? 0.5),
              decay: Number(meta.decay ?? 1.0),
              type: meta.type || 'episodic',
              semantic: getSemanticPreview(memoryRoot, hint.id),
              userId: meta.userId || null,
              userName: meta.userName || null
            });
          }
        }
      } catch (err) {
        pulseHintError = err.message;
      }
    }

    const topConnections = connections
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      // Deduplicate: keep highest-scoring entry per memory ID
      .filter((c, idx, arr) => arr.findIndex(x => x.id === c.id) === idx)
      .slice(0, limit);

    // Build a cleaner context subset for prompts: keep strong matches only.
    const topScore = Number(topConnections[0]?.relevanceScore || 0);
    const minContextScore = topScore > 1
      ? Math.max(0.12, topScore * 0.2)
      : Math.max(0.12, topScore * 0.35);
    let contextConnections = topConnections.filter((c) => Number(c.relevanceScore || 0) >= minContextScore).slice(0, 12);
    if (contextConnections.length === 0 && topConnections.length > 0) {
      contextConnections = [topConnections[0]];
    }

    // E1: Remove document-ingestion chunks from conversational context.
    // doc_* entries are knowledge-base pages, not episodic/semantic memories.
    // Showing them as [EXPERIENCE]/[KNOWLEDGE] items causes the LLM to hallucinate
    // about document content mid-conversation.
    // Also strip any entry whose semantic summary contains system boilerplate
    // (e.g. a corrupted user_profile memory that captured [SUBCONSCIOUS MEMORY CONTEXT]).
    const BOILERPLATE_MARKERS = ['[SUBCONSCIOUS MEMORY CONTEXT]', 'Subconscious turn context for this user message'];
    contextConnections = contextConnections.filter(c => {
      if (String(c.id || '').startsWith('doc_')) return false;
      const sem = String(c.semantic || '');
      if (BOILERPLATE_MARKERS.some(m => sem.includes(m))) return false;
      return true;
    });
    if (contextConnections.length === 0 && topConnections.length > 0) {
      // Fall back to the first non-doc, non-corrupt entry
      const firstClean = topConnections.find(c =>
        !String(c.id || '').startsWith('doc_') &&
        !BOILERPLATE_MARKERS.some(m => String(c.semantic || '').includes(m))
      );
      if (firstClean) contextConnections = [firstClean];
    }

    // Rerank with subconscious LLM if configured
    let rerankUsed = false;
    let rerankError = null;
    if (currentEntityId && topConnections.length > 0) {
      try {
        const runtime = loadAspectRuntimeConfig('subconscious') || loadAspectRuntimeConfig('main');
        if (runtime) {
          const rerank = await callSubconsciousReranker(runtime, userMessage, topConnections.slice(0, Math.min(20, topConnections.length)));
          if (rerank.ok && rerank.scoreMap) {
            rerankUsed = true;
            topConnections.forEach(c => {
              const hit = rerank.scoreMap.get(c.id);
              if (!hit) return;
              const lexicalNormalized = Math.min(1, Number(c.relevanceScore || 0) / 10);
              const blended = (lexicalNormalized * 0.45) + (hit.relevance * 0.55);
              c.lexicalScore = lexicalNormalized;
              c.subconsciousScore = hit.relevance;
              c.relevanceScore = blended;
              if (hit.reason) c.subconsciousReason = hit.reason;
            });
            topConnections.sort((a, b) => b.relevanceScore - a.relevanceScore);
          } else {
            rerankError = rerank.reason || 'rerank-failed';
          }
        } else {
          rerankError = 'subconscious-provider-not-configured';
        }
      } catch (err) {
        rerankError = err.message;
      }
    }

    // ── Chatlog recall: surface related compressed chatlogs for full conversational context ──
    let chatlogContext = [];
    if (currentEntityId && topConnections.length > 0) {
      try {
        const entityPathsMod = require('../entities/entityPaths');
        const memoryRoot = entityPathsMod.getMemoryRoot(currentEntityId);
        const ltmDir = path.join(memoryRoot, 'ltm');

        if (fs.existsSync(ltmDir)) {
          // Collect topics from top recalled memories (non-chatlog, non-document only)
          // E2: Exclude doc_* entries — their topics (knowledge, document, pg41445, …)
          // would match other doc_* ltm folders and pull in document pages as chatlog recall.
          const recalledTopics = new Set();
          for (const c of topConnections.slice(0, 12)) {
            if (c.id && !c.id.startsWith('ltm_') && !c.id.startsWith('doc_') && Array.isArray(c.topics)) {
              c.topics.forEach(t => recalledTopics.add(t));
            }
          }

          if (recalledTopics.size > 0) {
            // Also add user message topics
            topics.forEach(t => recalledTopics.add(t));

            // Score each LTM by topic overlap with recalled memories
            // E2: Exclude doc_* folders — document ingestion stores chunks in ltm/ but
            // they are not conversation archives and must not be chatlog-reconstructed.
            const ltmFolders = fs.readdirSync(ltmDir)
              .filter(f => !f.startsWith('doc_'))
              .filter(f => { try { return fs.statSync(path.join(ltmDir, f)).isDirectory(); } catch { return false; } });

            const ltmScores = [];
            for (const folder of ltmFolders) {
              const logFile = path.join(ltmDir, folder, 'log.json');
              if (!fs.existsSync(logFile)) continue;
              try {
                const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
                const ltmTopics = log.topics || [];
                // Count topic overlap with recalled memory topics
                let overlap = 0;
                for (const t of ltmTopics) {
                  if (recalledTopics.has(t)) overlap++;
                }
                if (overlap > 0) {
                  ltmScores.push({
                    id: folder,
                    overlap,
                    importance: log.importance || 0.6,
                    created: log.created,
                    sessionMeta: log.sessionMeta || '',
                    topics: ltmTopics
                  });
                }
              } catch (e) { /* skip */ }
            }

            // Take the top relevant chatlogs while keeping context bounded.
            ltmScores.sort((a, b) => b.overlap - a.overlap || b.importance - a.importance);
            for (const ltm of ltmScores.slice(0, 3)) {
              const content = getChatlogContent(memoryRoot, ltm.id, 900);
              if (content) {
                chatlogContext.push({
                  id: ltm.id,
                  overlap: ltm.overlap,
                  content,
                  sessionMeta: typeof ltm.sessionMeta === 'string' ? ltm.sessionMeta.slice(0, 200) : '',
                  topics: ltm.topics
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('  ⚠ Chatlog recall failed:', e.message);
      }
    }

    // Record retrieval trace outcome and reinforce successful best paths.
    try {
      if (cognitivePulse && topConnections.length > 0) {
        const best = topConnections[0];
        let confidence = Number(best.relevanceScore || 0);
        if (!rerankUsed) confidence = Math.min(1, confidence / 10);
        confidence = Math.max(0, Math.min(1, confidence));

        let bestPath = Array.isArray(best.pulsePath) ? best.pulsePath.slice() : [];
        if ((!bestPath || bestPath.length < 2) && typeof cognitivePulse.getBestPath === 'function') {
          const state = typeof cognitivePulse.getState === 'function' ? cognitivePulse.getState() : null;
          const fromId = (pulseHints.find(h => h.id === best.id) || {}).startId || state?.nodeId || null;
          if (fromId && fromId !== best.id) {
            const computed = cognitivePulse.getBestPath(fromId, best.id, 6);
            if (computed && Array.isArray(computed.path) && computed.path.length > 0) {
              bestPath = computed.path;
            }
          }
        }
        if (!bestPath || bestPath.length === 0) bestPath = [best.id];

        const matched = confidence >= 0.58;
        cognitivePulse.recordRetrievalTrace({
          userMessage,
          topics,
          targetId: best.id,
          path: bestPath,
          confidence,
          matched
        });

        cognitiveBus.emitThought({
          type: ThoughtTypes.MEMORY_TRACE_SELECTED,
          source: 'subconscious_recall',
          target_id: best.id,
          confidence,
          matched,
          path: bestPath,
          topics,
          importance: confidence
        });
      }
    } catch (err) {
      console.warn('  ⚠ Pulse trace reinforcement failed:', err.message);
      logTimeline('memory.recall.trace_error', { error: err.message });
    }

    logTimeline('memory.recall.completed', {
      userMessage: String(userMessage || '').slice(0, 300),
      topics,
      selectedCount: topConnections.length,
      selected: topConnections.slice(0, 8).map((c) => ({
        id: c.id,
        relevanceScore: Number(c.relevanceScore || 0),
        pulseTraceScore: Number(c.pulseTraceScore || 0),
        type: c.type || 'episodic'
      })),
      pulseHintsUsed: pulseHints.length > 0,
      rerankUsed,
      chatlogContextCount: chatlogContext.length
    });

    return {
      topics,
      connections: topConnections,
      chatlogContext,
      pulseHintsUsed: pulseHints.length > 0,
      pulseHintError,
      rerankUsed,
      rerankError,
      contextBlock: buildSubconsciousContextBlock(userMessage, topics, contextConnections, chatlogContext, (() => {
        try {
          if (typeof getActiveUserId !== 'function') return '';
          const userId = getActiveUserId();
          const entityId = currentEntityId;
          if (!userId || !entityId) return '';
          const relSvc = require('./relationship-service');
          const rel = relSvc.getRelationship(entityId, userId);
          return rel ? relSvc.buildRelationshipContextBlock(rel) : '';
        } catch (_) { return ''; }
      })())
    };
  }

  return {
    getSubconsciousMemoryContext,
    extractSubconsciousTopics
  };
}

module.exports = {
  createMemoryRetrieval,
  // Pure helpers exported for direct use / testing
  extractSubconsciousTopics,
  getSemanticPreview,
  getChatlogContent,
  buildSubconsciousContextBlock
};
