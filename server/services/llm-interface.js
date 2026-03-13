'use strict';
/**
 * server/services/llm-interface.js
 * Phase A Re-evaluation — A-Re1
 *
 * LLM call infrastructure: callLLMWithRuntime (OpenRouter + Ollama)
 * and callSubconsciousReranker (memory relevance scoring).
 *
 * Both functions are bound to mutable server-level state (somaticAwareness,
 * defaultMaxTokens) via getter functions supplied at creation time.
 *
 * Usage:
 *   const { callLLMWithRuntime, callSubconsciousReranker } =
 *     createLLMInterface({
 *       getSomaticAwareness: () => somaticAwareness,
 *       getDefaultMaxTokens: () => _defaultMaxTokens
 *     });
 */

const { toChatEndpoint, estimateUsageFromText, parseJsonBlock } = require('./llm-runtime-utils');

/**
 * @param {{ getSomaticAwareness: Function, getDefaultMaxTokens: Function }} deps
 */
function createLLMInterface({ getSomaticAwareness = () => null, getDefaultMaxTokens = () => 16000 } = {}) {

  async function callLLMWithRuntime(runtime, messages, options = {}) {
    if (!runtime || !messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid runtime or messages');
    }

    const somaticAwareness = getSomaticAwareness();
    const _defaultMaxTokens = getDefaultMaxTokens();
    const _llmStart = Date.now();
    const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.35;
    const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : _defaultMaxTokens;
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : 90000;
    const normalizedContextWindow = Number.isFinite(options.contextWindow)
      ? Math.max(1024, Math.min(32768, Math.floor(options.contextWindow)))
      : (Number.isFinite(runtime?.contextWindow)
        ? Math.max(1024, Math.min(32768, Math.floor(runtime.contextWindow)))
        : null);

    if (runtime.type === 'openrouter') {
      const apiKey = String(runtime.apiKey || runtime.key || '').trim();
      const endpoint = String(runtime.endpoint || '').trim() || 'https://openrouter.ai/api/v1/chat/completions';
      if (!apiKey) throw new Error('OpenRouter runtime missing API key');
      if (!runtime.model) throw new Error('OpenRouter runtime missing model');

      const headers = { 'Content-Type': 'application/json' };
      headers.Authorization = 'Bearer ' + apiKey;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const bodyObj = { model: runtime.model, temperature, max_tokens: maxTokens, messages };
      if (options.responseFormat === 'json') bodyObj.response_format = { type: 'json_object' };

      let resp;
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: ac.signal,
          body: JSON.stringify(bodyObj)
        });
      } catch (err) {
        clearTimeout(timer);
        if (somaticAwareness) somaticAwareness.reportCallOutcome(false);
        if (err.name === 'AbortError') throw new Error(`OpenRouter call timed out after ${timeoutMs / 1000}s`);
        throw err;
      }
      clearTimeout(timer);
      if (!resp.ok) {
        if (somaticAwareness) somaticAwareness.reportCallOutcome(false);
        const err = await resp.text();
        throw new Error('OpenRouter call failed: ' + err.slice(0, 220));
      }
      const data = await resp.json();
      const msg = data?.choices?.[0]?.message;
      const content = msg?.content || msg?.reasoning || '';
      const finishReason = data?.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        console.warn(`  ⚠ OpenRouter response truncated (finish_reason=length, max_tokens=${maxTokens}, model=${runtime.model})`);
      }
      if (somaticAwareness) {
        somaticAwareness.reportLatency(Date.now() - _llmStart);
        somaticAwareness.reportCallOutcome(true);
        const u = data?.usage || {};
        const contextWindow = options.contextWindow || 128000;
        if (u.prompt_tokens) somaticAwareness.reportContextFullness(u.prompt_tokens, contextWindow);
      }
      if (options.returnUsage) {
        const u = data?.usage || {};
        let usage = {
          prompt_tokens: u.prompt_tokens || 0,
          completion_tokens: u.completion_tokens || 0,
          total_tokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0)
        };
        if (!usage.prompt_tokens && !usage.completion_tokens) {
          usage = estimateUsageFromText(messages, content);
        }
        return { content, usage };
      }
      return content;
    }

    // Ollama branch
    const endpoint = toChatEndpoint(runtime.endpoint);
    if (!endpoint) throw new Error('Ollama runtime missing endpoint');
    const ac2 = new AbortController();
    const timer2 = setTimeout(() => ac2.abort(), timeoutMs);
    const ollamaBody = { model: runtime.model, temperature, max_tokens: maxTokens, messages };
    if (normalizedContextWindow) {
      ollamaBody.options = {
        num_ctx: normalizedContextWindow,
        num_predict: Math.floor(maxTokens)
      };
    }
    if (options.responseFormat === 'json') ollamaBody.format = 'json';

    let resp;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac2.signal,
        body: JSON.stringify(ollamaBody)
      });
    } catch (err) {
      clearTimeout(timer2);
      if (somaticAwareness) somaticAwareness.reportCallOutcome(false);
      if (err.name === 'AbortError') throw new Error(`Ollama call timed out after ${timeoutMs / 1000}s`);
      throw err;
    }
    clearTimeout(timer2);
    if (!resp.ok) {
      if (somaticAwareness) somaticAwareness.reportCallOutcome(false);
      const err = await resp.text();
      throw new Error('Ollama call failed: ' + err.slice(0, 220));
    }
    const data = await resp.json();
    const msg2 = data?.choices?.[0]?.message;
    const content2 = msg2?.content || msg2?.reasoning || '';
    if (somaticAwareness) {
      somaticAwareness.reportLatency(Date.now() - _llmStart);
      somaticAwareness.reportCallOutcome(true);
      const u = data?.usage || {};
      const contextWindow2 = normalizedContextWindow || 128000;
      if (u.prompt_tokens) somaticAwareness.reportContextFullness(u.prompt_tokens, contextWindow2);
    }
    if (options.returnUsage) {
      const u = data?.usage || {};
      let usage = {
        prompt_tokens: u.prompt_tokens || 0,
        completion_tokens: u.completion_tokens || 0,
        total_tokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0)
      };
      if (!usage.prompt_tokens && !usage.completion_tokens) {
        usage = estimateUsageFromText(messages, content2);
      }
      return { content: content2, usage };
    }
    return content2;
  }

  async function callSubconsciousReranker(runtime, userMessage, candidates) {
    if (!runtime || !candidates || candidates.length === 0) {
      return { ok: false, reason: 'missing-runtime-or-candidates' };
    }

    const payloadCandidates = candidates.map((c, idx) => ({
      rank: idx + 1,
      id: c.id,
      topics: c.topics || [],
      summary: (c.semantic || '').slice(0, 220),
      lexical_score: Number(c.relevanceScore || 0)
    }));

    const prompt = `You are the Subconscious relevance scorer for memory retrieval.
Given a user message and candidate memories, score each memory for relevance from 0.0 to 1.0.
Return ONLY valid JSON in this exact shape:
{
  "scores": [
    {"id":"<memory_id>","relevance":0.0,"reason":"short reason"}
  ]
}

Guidelines:
- 1.0 = directly relevant and useful to answer the user now.
- 0.5 = maybe related background context.
- 0.0 = not relevant.
- Be conservative. If unsure, score lower.
- Keep reasons very short.

User message:
${userMessage}

Candidates:
${JSON.stringify(payloadCandidates, null, 2)}`;

    const messages = [
      { role: 'system', content: 'You score memory relevance for subconscious retrieval. Output JSON only.' },
      { role: 'user', content: prompt }
    ];

    let text = '';
    try {
      const result = await callLLMWithRuntime(runtime, messages, { temperature: 0.1, maxTokens: 2000 });
      text = typeof result === 'object' && result.content !== undefined ? result.content : String(result || '');
    } catch (err) {
      throw err;
    }

    const parsed = parseJsonBlock(text);
    if (!parsed || !Array.isArray(parsed.scores)) {
      return { ok: false, reason: 'invalid-rerank-json' };
    }

    const scoreMap = new Map();
    parsed.scores.forEach(item => {
      if (!item || !item.id) return;
      const relevance = Math.max(0, Math.min(1, Number(item.relevance || 0)));
      scoreMap.set(item.id, {
        relevance,
        reason: String(item.reason || '').slice(0, 120)
      });
    });

    return { ok: true, scoreMap };
  }

  return { callLLMWithRuntime, callSubconsciousReranker };
}

module.exports = { createLLMInterface };
