'use strict';
// ============================================================
// NekoCore — Knowledge Retrieval
//
// Lightweight topic-based retrieval over NekoCore's semantic
// memory directory. Used by processNekoCoreChatMessage to
// surface relevant architecture doc chunks before the
// orchestrator call — the same way the subconscious surfaces
// memories for regular entities, without the full cognitive
// machinery (neurochemistry, cognitivePulse, etc.) NekoCore
// doesn't use.
//
// Returns: { contextBlock, topics, connections, chatlogContext }
// Matches the shape getMemoryContext must return for the Orchestrator.
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── Topic extractor — min-length 3 to catch "rem", "api", "llm", "sse" ──────
const STOPWORDS = new Set([
  'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'was', 'are', 'be', 'been',
  'a', 'an', 'it', 'its', 'of', 'that', 'this', 'with', 'from', 'has', 'have', 'had',
  'by', 'as', 'up', 'not', 'all', 'any', 'can', 'may', 'will', 'no', 'do', 'does',
  'use', 'used', 'when', 'what', 'how', 'why', 'which', 'per', 'via', 'each', 'you',
  'i', 'me', 'my', 'she', 'her', 'him', 'we', 'our', 'they', 'them', 'your',
  'tell', 'know', 'explain', 'describe', 'show', 'just', 'more', 'about', 'help',
]);

function extractTopics(text) {
  const lower = (text || '').toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
  const seen = new Set();
  const result = [];
  for (const w of words) {
    if (!seen.has(w) && result.length < 16) {
      seen.add(w);
      result.push(w);
    }
  }
  return result;
}

// ── Score a memory against query topics ──────────────────────────────────────
function scoreMemory(memTopics, queryTopics) {
  if (!Array.isArray(memTopics) || !Array.isArray(queryTopics)) return 0;
  let hits = 0;
  for (const qt of queryTopics) {
    if (memTopics.includes(qt)) hits++;
  }
  return hits;
}

// ── Build context block in the shape the Orchestrator's subconscious expects ─
function buildContextBlock(userMessage, topics, matches) {
  const lines = [];
  lines.push('[SUBCONSCIOUS MEMORY CONTEXT]');
  lines.push('User message: ' + userMessage);
  lines.push('Detected topics: ' + (topics.length ? topics.join(', ') : 'none'));

  if (matches.length === 0) {
    lines.push('Potentially related memories: none');
    lines.push('No system knowledge chunks matched this query.');
  } else {
    lines.push('Potentially related memories (main should decide relevance):');
    matches.forEach((m, idx) => {
      const topicStr = (m.topics || []).join(', ');
      // Trim semantic preview to ~200 chars for the summary line
      const preview = (m.semantic || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      lines.push(
        `${idx + 1}. [DOCUMENT] id=${m.id} score=${Number(m.relevanceScore || 0).toFixed(2)} topics=[${topicStr}] summary="${preview}"`
      );
    });
    lines.push('');
    lines.push('DOCUMENT memories are ingested from architecture documents — NOT from conversations. Draw from these to answer system and architecture questions.');
  }

  return lines.join('\n');
}

// ── Main retrieval function ───────────────────────────────────────────────────
/**
 * Scan NekoCore's semantic/ directory for nkdoc_* chunks matching the
 * user's message topics and return the top matches as a context block.
 *
 * @param {string} userMessage
 * @param {string} memRoot  — path to entities/entity_nekocore/memories/
 * @param {Object} [opts]
 * @param {number} [opts.limit=10]
 * @returns {{ contextBlock: string, topics: string[], connections: Array, chatlogContext: [] }}
 */
function buildNekoKnowledgeContext(userMessage, memRoot, opts = {}) {
  const limit = opts.limit || 10;
  const topics = extractTopics(userMessage || '');
  const semanticDir = path.join(memRoot, 'semantic');

  if (!topics.length || !fs.existsSync(semanticDir)) {
    return {
      contextBlock: buildContextBlock(userMessage, topics, []),
      topics,
      connections: [],
      chatlogContext: [],
    };
  }

  // Scan all nkdoc_* directories
  let entries;
  try {
    entries = fs.readdirSync(semanticDir).filter(f => {
      if (!f.startsWith('nkdoc_')) return false;
      try { return fs.statSync(path.join(semanticDir, f)).isDirectory(); } catch { return false; }
    });
  } catch (_) {
    return {
      contextBlock: buildContextBlock(userMessage, topics, []),
      topics,
      connections: [],
      chatlogContext: [],
    };
  }

  const candidates = [];

  for (const folder of entries) {
    const logPath = path.join(semanticDir, folder, 'log.json');
    if (!fs.existsSync(logPath)) continue;

    let log;
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (_) { continue; }

    const score = scoreMemory(log.topics || [], topics);
    if (score === 0) continue;

    const importance = Number(log.importance || 0.9);
    const relevanceScore = score * importance;

    // Lazy-load semantic.txt only for candidates
    candidates.push({ id: folder, relevanceScore, topics: log.topics || [], importance });
  }

  // Sort and take top N
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const top = candidates.slice(0, limit);

  // Now load the actual semantic content for the winners
  const connections = [];
  for (const c of top) {
    const semPath = path.join(semanticDir, c.id, 'semantic.txt');
    let semantic = '';
    try { semantic = fs.readFileSync(semPath, 'utf8').trim(); } catch (_) {}
    connections.push({ ...c, semantic });
  }

  const contextBlock = buildContextBlock(userMessage, topics, connections);
  return { contextBlock, topics, connections, chatlogContext: [] };
}

module.exports = { buildNekoKnowledgeContext };
