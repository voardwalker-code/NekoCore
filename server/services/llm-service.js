class LLMService {
  constructor(options = {}) {
    this.somaticAwareness = options.somaticAwareness || null;
    this.defaultMaxTokens = options.defaultMaxTokens || 16000;
  }

  _sanitizeOllamaContextWindow(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1024, Math.min(32768, Math.floor(n)));
  }

  setDefaultMaxTokens(value) {
    if (Number.isFinite(value) && value > 0) {
      this.defaultMaxTokens = value;
    }
  }

  setSomaticAwareness(sa) {
    this.somaticAwareness = sa;
  }

  toChatEndpoint(baseEndpoint) {
    const ep = (baseEndpoint || '').trim();
    if (!ep) return '';
    if (ep.endsWith('/v1/chat/completions') || ep.endsWith('/chat/completions')) return ep;
    return ep.replace(/\/$/, '') + '/v1/chat/completions';
  }

  parseJsonBlock(text) {
    if (!text || typeof text !== 'string') return null;
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      try {
        const fixed = candidate
          .replace(/\n/g, ' ')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        return JSON.parse(fixed);
      } catch (_) {
        return null;
      }
    }
  }

  async call(runtime, messages, options = {}) {
    if (!runtime || !messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid runtime or messages');
    }

    const _llmStart = Date.now();
    const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.35;
    const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : this.defaultMaxTokens;
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : 90000;

    if (runtime.type === 'openrouter') {
      return this._callOpenRouter(runtime, messages, { temperature, maxTokens, timeoutMs, responseFormat: options.responseFormat, returnUsage: options.returnUsage, contextWindow: options.contextWindow, _llmStart });
    }
    const resolvedContextWindow = this._sanitizeOllamaContextWindow(options.contextWindow || runtime.contextWindow || runtime.num_ctx);
    return this._callOllama(runtime, messages, { temperature, maxTokens, timeoutMs, responseFormat: options.responseFormat, returnUsage: options.returnUsage, contextWindow: resolvedContextWindow, _llmStart });
  }

  async _callOpenRouter(runtime, messages, opts) {
    const apiKey = String(runtime.apiKey || runtime.key || '').trim();
    const endpoint = String(runtime.endpoint || '').trim() || 'https://openrouter.ai/api/v1/chat/completions';
    if (!apiKey) throw new Error('OpenRouter runtime missing API key');
    if (!runtime.model) throw new Error('OpenRouter runtime missing model');

    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    const bodyObj = { model: runtime.model, temperature: opts.temperature, max_tokens: opts.maxTokens, messages };
    if (opts.responseFormat === 'json') bodyObj.response_format = { type: 'json_object' };

    let resp;
    try {
      resp = await fetch(endpoint, { method: 'POST', headers, signal: ac.signal, body: JSON.stringify(bodyObj) });
    } catch (err) {
      clearTimeout(timer);
      if (this.somaticAwareness) this.somaticAwareness.reportCallOutcome(false);
      if (err.name === 'AbortError') throw new Error(`OpenRouter call timed out after ${opts.timeoutMs / 1000}s`);
      throw err;
    }
    clearTimeout(timer);
    if (!resp.ok) {
      if (this.somaticAwareness) this.somaticAwareness.reportCallOutcome(false);
      const errText = await resp.text();
      throw new Error('OpenRouter call failed: ' + errText.slice(0, 220));
    }
    const data = await resp.json();
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning || '';
    if (this.somaticAwareness) {
      this.somaticAwareness.reportLatency(Date.now() - opts._llmStart);
      this.somaticAwareness.reportCallOutcome(true);
      const u = data?.usage || {};
      const contextWindow = opts.contextWindow || 128000;
      if (u.prompt_tokens) this.somaticAwareness.reportContextFullness(u.prompt_tokens, contextWindow);
    }
    if (opts.returnUsage) {
      const u = data?.usage || {};
      return { content, usage: { prompt_tokens: u.prompt_tokens || 0, completion_tokens: u.completion_tokens || 0, total_tokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0) } };
    }
    return content;
  }

  async _callOllama(runtime, messages, opts) {
    const endpoint = this.toChatEndpoint(runtime.endpoint);
    if (!endpoint) throw new Error('Ollama runtime missing endpoint');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    const ollamaBody = { model: runtime.model, temperature: opts.temperature, max_tokens: opts.maxTokens, messages };
    if (Number.isFinite(opts.contextWindow) && opts.contextWindow > 0) {
      ollamaBody.options = {
        num_ctx: Math.floor(opts.contextWindow),
        num_predict: Math.floor(opts.maxTokens)
      };
    }
    if (opts.responseFormat === 'json') ollamaBody.format = 'json';

    let resp;
    try {
      resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal, body: JSON.stringify(ollamaBody) });
    } catch (err) {
      clearTimeout(timer);
      if (this.somaticAwareness) this.somaticAwareness.reportCallOutcome(false);
      if (err.name === 'AbortError') throw new Error(`Ollama call timed out after ${opts.timeoutMs / 1000}s`);
      throw err;
    }
    clearTimeout(timer);
    if (!resp.ok) {
      if (this.somaticAwareness) this.somaticAwareness.reportCallOutcome(false);
      const errText = await resp.text();
      throw new Error('Ollama call failed: ' + errText.slice(0, 220));
    }
    const data = await resp.json();
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning || '';
    if (this.somaticAwareness) {
      this.somaticAwareness.reportLatency(Date.now() - opts._llmStart);
      this.somaticAwareness.reportCallOutcome(true);
      const u = data?.usage || {};
      const contextWindow = opts.contextWindow || 128000;
      if (u.prompt_tokens) this.somaticAwareness.reportContextFullness(u.prompt_tokens, contextWindow);
    }
    if (opts.returnUsage) {
      const u = data?.usage || {};
      return { content, usage: { prompt_tokens: u.prompt_tokens || 0, completion_tokens: u.completion_tokens || 0, total_tokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0) } };
    }
    return content;
  }

  async callSubconsciousReranker(runtime, userMessage, candidates) {
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
    if (runtime.type === 'openrouter') {
      const apiKey = String(runtime.apiKey || runtime.key || '').trim();
      const endpoint = String(runtime.endpoint || '').trim() || 'https://openrouter.ai/api/v1/chat/completions';
      if (!apiKey || !runtime.model) throw new Error('OpenRouter reranker runtime incomplete');
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
      const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model: runtime.model, temperature: 0.1, max_tokens: 2000, messages }) });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('OpenRouter rerank failed: ' + errText.slice(0, 220));
      }
      const data = await resp.json();
      const rrMsg = data?.choices?.[0]?.message;
      text = rrMsg?.content || rrMsg?.reasoning || '';
    } else {
      const endpoint = this.toChatEndpoint(runtime.endpoint);
      const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: runtime.model, temperature: 0.1, max_tokens: 2000, messages }) });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('Ollama rerank failed: ' + errText.slice(0, 220));
      }
      const data = await resp.json();
      const olMsg = data?.choices?.[0]?.message;
      text = olMsg?.content || olMsg?.reasoning || '';
    }

    const parsed = this.parseJsonBlock(text);
    if (!parsed || !Array.isArray(parsed.scores)) {
      return { ok: false, reason: 'invalid-rerank-json' };
    }

    const scoreMap = new Map();
    parsed.scores.forEach(item => {
      if (!item || !item.id) return;
      const relevance = Math.max(0, Math.min(1, Number(item.relevance || 0)));
      scoreMap.set(item.id, { relevance, reason: String(item.reason || '').slice(0, 120) });
    });

    return { ok: true, scoreMap };
  }
}

module.exports = LLMService;
