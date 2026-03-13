// ============================================================
// REM System — Workspace Tools
//
// Parses tool-call commands from entity LLM output and executes
// them against the configured workspace and web search.
//
// Syntax the LLM uses:
//   [TOOL:ws_list path="subdir"]
//   [TOOL:ws_read path="notes.txt"]
//   [TOOL:ws_write path="notes.txt" content="Hello world"]
//   [TOOL:ws_append path="notes.txt" content="More text added"]
//   [TOOL:ws_delete path="old.txt"]
//   [TOOL:web_search query="quantum computing"]
//   [TOOL:web_fetch url="https://example.com"]
//
// Returns: { hadTools, cleanedResponse, toolResults[] }
// ============================================================

const fs = require('fs');
const path = require('path');

// ── Tool-call parser ──
// Strict regex for simple tools (no unescaped quotes in values)
const TOOL_REGEX = /\[TOOL:(\w+)((?:\s+\w+="(?:[^"\\]|\\.)*")*)\s*\]/g;

function parseToolParams(paramStr) {
  const params = {};
  const paramRegex = /(\w+)="((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = paramRegex.exec(paramStr)) !== null) {
    params[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return params;
}

/**
 * Extract tool calls from LLM output.
 *
 * Two-pass strategy:
 *  1. Strict regex — works for simple tools and properly-escaped content.
 *  2. Lenient fallback — for ws_write / ws_append where the LLM puts
 *     unescaped quotes inside the content value (very common in prose).
 *     We locate content=" and scan forward to the closing "] of the block.
 */
function extractToolCalls(text) {
  const calls = [];

  // Pass 1 — strict regex
  const regex = new RegExp(TOOL_REGEX.source, TOOL_REGEX.flags);
  const matchedStarts = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    matchedStarts.add(match.index);
    calls.push({
      fullMatch: match[0],
      command: match[1],
      params: parseToolParams(match[2] || '')
    });
  }

  // Pass 2 — lenient fallback for content-bearing tools the strict regex missed
  const contentToolRe = /\[TOOL:(ws_write|ws_append)\s+/g;
  let fb;
  while ((fb = contentToolRe.exec(text)) !== null) {
    if (matchedStarts.has(fb.index)) continue; // already captured

    const command = fb[1];
    const afterCmd = fb.index + fb[0].length;
    const rest = text.slice(afterCmd);

    // Limit search to before the next [TOOL: (if any)
    const nextTool = rest.indexOf('[TOOL:');
    const region = nextTool !== -1 ? rest.slice(0, nextTool) : rest;

    // The tool block closes with "] — find the LAST one in the region
    const closePos = region.lastIndexOf('"]');
    if (closePos === -1) continue;

    const paramSection = region.slice(0, closePos + 1); // includes closing "

    // Extract path (filenames never contain quotes)
    const params = {};
    const pathM = paramSection.match(/path="([^"]*)"\s*/);
    if (!pathM) continue;
    params.path = pathM[1];

    // Extract content — everything between content=" and the final "
    const cIdx = paramSection.indexOf('content="');
    if (cIdx !== -1) {
      params.content = paramSection.slice(cIdx + 9, closePos)
        .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    const fullMatch = text.slice(fb.index, afterCmd + closePos + 2);
    calls.push({ fullMatch, command, params });
    contentToolRe.lastIndex = afterCmd + closePos + 2;
  }

  return calls;
}

function stripToolCalls(text) {
  // First strip strict matches
  let cleaned = text.replace(TOOL_REGEX, '');
  // Then strip any lenient content-tool blocks that remain
  const contentToolRe = /\[TOOL:(ws_write|ws_append)\s+/g;
  let fb;
  while ((fb = contentToolRe.exec(cleaned)) !== null) {
    const afterCmd = fb.index + fb[0].length;
    const rest = cleaned.slice(afterCmd);
    const nextTool = rest.indexOf('[TOOL:');
    const region = nextTool !== -1 ? rest.slice(0, nextTool) : rest;
    const closePos = region.lastIndexOf('"]');
    if (closePos === -1) continue;
    const end = afterCmd + closePos + 2;
    cleaned = cleaned.slice(0, fb.index) + cleaned.slice(end);
    contentToolRe.lastIndex = fb.index;
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Execute workspace tool calls found in the LLM output.
 *
 * @param {string} responseText - The LLM's raw response text
 * @param {Object} options
 * @param {string} options.workspacePath - Configured workspace root directory
 * @param {Object} [options.webFetch] - The web-fetch module (for web_search/web_fetch)
 * @returns {{ hadTools: boolean, cleanedResponse: string, toolResults: Array }}
 */
async function executeToolCalls(responseText, options = {}) {
  const calls = extractToolCalls(responseText);
  if (calls.length === 0) {
    return { hadTools: false, cleanedResponse: responseText, toolResults: [] };
  }

  const wsRoot = options.workspacePath;
  const webFetch = options.webFetch;
  const toolResults = [];

  // Limit to 8 tool calls per turn to prevent abuse
  const maxCalls = Math.min(calls.length, 8);

  for (let i = 0; i < maxCalls; i++) {
    const call = calls[i];
    let result;
    try {
      switch (call.command) {
        case 'ws_list':
          result = await execWsList(wsRoot, call.params.path || '.');
          break;
        case 'ws_read':
          result = await execWsRead(wsRoot, call.params.path);
          break;
        case 'ws_write':
          result = await execWsWrite(wsRoot, call.params.path, call.params.content || '');
          break;
        case 'ws_append':
          result = await execWsAppend(wsRoot, call.params.path, call.params.content || '');
          break;
        case 'ws_delete':
          result = await execWsDelete(wsRoot, call.params.path);
          break;
        case 'web_search':
          result = await execWebSearch(webFetch, call.params.query);
          break;
        case 'web_fetch':
          result = await execWebFetch(webFetch, call.params.url);
          break;
        case 'mem_search':
          if (options.memorySearch) {
            result = await options.memorySearch(call.params.query || call.params.search || '');
          } else {
            result = { ok: false, error: 'Memory search not available' };
          }
          break;
        case 'mem_create':
          if (options.memoryCreate) {
            result = await options.memoryCreate(call.params);
          } else {
            result = { ok: false, error: 'Memory creation not available' };
          }
          break;
        case 'skill_create':
          if (options.skillCreate) {
            result = await options.skillCreate(call.params);
          } else {
            result = { ok: false, error: 'Skill creation not available' };
          }
          break;
        case 'skill_list':
          if (options.skillList) {
            result = await options.skillList();
          } else {
            result = { ok: false, error: 'Skill listing not available' };
          }
          break;
        case 'skill_edit':
          if (options.skillEdit) {
            result = await options.skillEdit(call.params);
          } else {
            result = { ok: false, error: 'Skill editing not available' };
          }
          break;
        case 'profile_update':
          if (options.profileUpdate) {
            result = await options.profileUpdate(call.params);
          } else {
            result = { ok: false, error: 'Profile update not available' };
          }
          break;
        default:
          result = { ok: false, error: `Unknown tool: ${call.command}` };
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    toolResults.push({ command: call.command, params: call.params, result });
  }

  const cleanedResponse = stripToolCalls(responseText);
  return { hadTools: true, cleanedResponse, toolResults };
}

// ── Safe path resolution ──
function resolveSafe(wsRoot, relPath) {
  if (!wsRoot) return null;
  const resolved = path.resolve(wsRoot, relPath || '.');
  if (!resolved.startsWith(path.resolve(wsRoot))) return null;
  return resolved;
}

// ── Tool implementations ──

async function execWsList(wsRoot, relPath) {
  if (!wsRoot) return { ok: false, error: 'No workspace configured' };
  const dir = resolveSafe(wsRoot, relPath);
  if (!dir) return { ok: false, error: 'Path outside workspace' };
  if (!fs.existsSync(dir)) return { ok: true, files: [] };
  const entries = fs.readdirSync(dir).map(name => {
    try {
      const stat = fs.statSync(path.join(dir, name));
      return stat.isDirectory() ? name + '/' : name;
    } catch { return name; }
  });
  return { ok: true, files: entries };
}

async function execWsRead(wsRoot, relPath) {
  if (!wsRoot) return { ok: false, error: 'No workspace configured' };
  if (!relPath) return { ok: false, error: 'No path specified' };
  const filep = resolveSafe(wsRoot, relPath);
  if (!filep) return { ok: false, error: 'Path outside workspace' };
  if (!fs.existsSync(filep)) return { ok: false, error: 'File not found: ' + relPath };
  const stat = fs.statSync(filep);
  if (stat.size > 100 * 1024) return { ok: false, error: 'File too large (>100KB)' };
  const content = fs.readFileSync(filep, 'utf-8');
  return { ok: true, content: content.slice(0, 8000) };
}

async function execWsWrite(wsRoot, relPath, content) {
  if (!wsRoot) return { ok: false, error: 'No workspace configured' };
  if (!relPath) return { ok: false, error: 'No path specified' };
  const filep = resolveSafe(wsRoot, relPath);
  if (!filep) return { ok: false, error: 'Path outside workspace' };
  const dir = path.dirname(filep);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filep, content, 'utf-8');
  return { ok: true, message: 'Written ' + relPath + ' (' + content.length + ' bytes)' };
}

async function execWsAppend(wsRoot, relPath, content) {
  if (!wsRoot) return { ok: false, error: 'No workspace configured' };
  if (!relPath) return { ok: false, error: 'No path specified' };
  const filep = resolveSafe(wsRoot, relPath);
  if (!filep) return { ok: false, error: 'Path outside workspace' };
  const dir = path.dirname(filep);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filep, content, 'utf-8');
  return { ok: true, message: 'Appended to ' + relPath + ' (' + content.length + ' chars added)' };
}

async function execWsDelete(wsRoot, relPath) {
  if (!wsRoot) return { ok: false, error: 'No workspace configured' };
  if (!relPath) return { ok: false, error: 'No path specified' };
  const filep = resolveSafe(wsRoot, relPath);
  if (!filep) return { ok: false, error: 'Path outside workspace' };
  if (!fs.existsSync(filep)) return { ok: true, message: 'Already gone' };
  fs.unlinkSync(filep);
  return { ok: true, message: 'Deleted ' + relPath };
}

async function execWebSearch(webFetch, query) {
  if (!webFetch || !webFetch.webSearch) return { ok: false, error: 'Web search not available' };
  if (!query) return { ok: false, error: 'No query specified' };
  try {
    const results = await webFetch.webSearch(query);
    return { ok: true, results: (results || []).slice(0, 5) };
  } catch (err) {
    return { ok: false, error: 'Search failed: ' + err.message };
  }
}

async function execWebFetch(webFetch, url) {
  if (!webFetch || !webFetch.fetchAndExtract) return { ok: false, error: 'Web fetch not available' };
  if (!url) return { ok: false, error: 'No URL specified' };
  try {
    const result = await webFetch.fetchAndExtract(url);
    return { ok: true, text: (result.text || '').slice(0, 6000) };
  } catch (err) {
    return { ok: false, error: 'Fetch failed: ' + err.message };
  }
}

/**
 * Format tool results into a text block for the LLM follow-up call.
 */
function formatToolResults(toolResults) {
  const parts = ['[TOOL RESULTS]:'];
  for (const tr of toolResults) {
    parts.push(`\n--- ${tr.command}(${Object.entries(tr.params).map(([k,v]) => k + '=' + JSON.stringify(v)).join(', ')}) ---`);
    if (tr.result.ok === false) {
      parts.push('ERROR: ' + (tr.result.error || 'Unknown error'));
    } else if (tr.result.files) {
      parts.push(tr.result.files.length === 0 ? '(empty directory)' : tr.result.files.join('\n'));
    } else if (tr.result.content !== undefined) {
      parts.push(tr.result.content);
    } else if (tr.result.results) {
      for (const r of tr.result.results) {
        parts.push(`• ${r.title || '(no title)'}\n  ${r.url || ''}\n  ${r.snippet || ''}`);
      }
    } else if (tr.result.skills) {
      for (const s of tr.result.skills) {
        parts.push(`\u2022 [${s.enabled ? 'ON' : 'OFF'}] ${s.name} — ${s.description || '(no description)'}`);
      }
    } else if (tr.result.memories) {
      for (const m of tr.result.memories) {
        const topicStr = Array.isArray(m.topics) ? m.topics.join(', ') : '';
        parts.push(`• [${m.type || 'memory'}] id=${m.id} score=${Number(m.relevanceScore || 0).toFixed(3)} topics=[${topicStr}] summary="${m.semantic || 'n/a'}"`);
      }
      if (tr.result.chatlogContext && tr.result.chatlogContext.length > 0) {
        parts.push('\n[RELATED CHATLOGS]:');
        for (const cl of tr.result.chatlogContext) {
          parts.push(`--- chatlog id=${cl.id} topic_overlap=${cl.overlap} ---`);
          if (cl.sessionMeta) parts.push(cl.sessionMeta);
          parts.push(cl.content);
          parts.push('--- end ---');
        }
      }
    } else if (tr.result.text) {
      parts.push(tr.result.text.slice(0, 4000));
    } else if (tr.result.message) {
      parts.push(tr.result.message);
    }
  }
  return parts.join('\n');
}

module.exports = { extractToolCalls, executeToolCalls, formatToolResults, stripToolCalls };
