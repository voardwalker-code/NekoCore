// ============================================================
// REM System v0.6.0 — Pipeline & LLM Module
// Handles: Proxy fetch, LLM calls (OpenRouter + Ollama), V4 compression
// ============================================================

// ============================================================
// PROXY FETCH — route external API calls through /api/proxy
// ============================================================
async function proxyFetch(targetUrl, options = {}) {
  let proxyBody = undefined;
  if (options.body) {
    const ct = (options.headers && (options.headers['Content-Type'] || options.headers['content-type'])) || '';
    if (ct.includes('x-www-form-urlencoded')) {
      proxyBody = options.body;
    } else if (typeof options.body === 'string') {
      try { proxyBody = JSON.parse(options.body); } catch (e) { proxyBody = options.body; }
    } else {
      proxyBody = options.body;
    }
  }

  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: targetUrl,
      method: options.method || (options.body ? 'POST' : 'GET'),
      headers: options.headers || {},
      body: proxyBody
    })
  });
  return resp;
}

function smartFetch(endpoint, options) {
  const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
  return isLocal ? fetch(endpoint, options) : proxyFetch(endpoint, options);
}

function toChatCompletionsEndpoint(endpoint) {
  const base = (endpoint || '').trim();
  if (!base) return '';
  if (base.endsWith('/v1/chat/completions') || base.endsWith('/chat/completions')) return base;
  return base.replace(/\/$/, '') + '/v1/chat/completions';
}

function normalizeRuntimeConfig(config) {
  if (!config || !config.type) return null;
  const type = config.type === 'apikey' ? 'openrouter' : config.type;
  if (type === 'openrouter') {
    return {
      type,
      endpoint: config.endpoint || OPENROUTER_PRESET.ep,
      apiKey: config.apiKey || config.key || '',
      model: config.model || OPENROUTER_PRESET.def
    };
  }
  if (type === 'ollama') {
    return {
      type,
      endpoint: config.endpoint || 'http://localhost:11434',
      model: config.model || 'llama3'
    };
  }
  return null;
}

async function callLLMWithConfig(config, userPrompt, options = {}) {
  const runtime = normalizeRuntimeConfig(config);
  if (!runtime) throw new Error('Invalid runtime config');
  const systemPrompt = options.systemPrompt || 'You are a helpful assistant.';
  const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.4;
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 1200;
  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];

  if (runtime.type === 'openrouter') {
    const headers = { 'Content-Type': 'application/json' };
    if (runtime.apiKey) headers.Authorization = 'Bearer ' + runtime.apiKey;

    const resp = await smartFetch(runtime.endpoint || OPENROUTER_PRESET.ep, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: runtime.model,
        max_tokens: maxTokens,
        temperature,
        messages
      })
    });
    if (!resp.ok) {
      const e = await resp.text();
      throw new Error('API ' + resp.status + ': ' + e.slice(0, 300));
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  const endpoint = toChatCompletionsEndpoint(runtime.endpoint);
  const resp = await smartFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: runtime.model,
      max_tokens: maxTokens,
      temperature,
      messages
    })
  });
  if (!resp.ok) {
    const e = await resp.text();
    throw new Error('API ' + resp.status + ': ' + e.slice(0, 300));
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// LLM CALL (unified — single-message)
// ============================================================
async function callLLM(userPrompt) {
  if (!activeConfig) throw new Error('No provider configured. Set up authentication first.');

  const { type, model } = activeConfig;

  switch (type) {
    case 'openrouter':
    case 'apikey': // backward compat with old saved configs
      return callOpenRouter(userPrompt);
    case 'ollama':
      return callOpenAICompat(activeConfig.endpoint + '/v1/chat/completions', null, model, userPrompt);
    default:
      throw new Error('Unknown provider type: ' + type);
  }
}

function callOpenRouter(prompt) {
  const { endpoint, apiKey, model } = activeConfig;
  const ep = endpoint || OPENROUTER_PRESET.ep;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  return smartFetch(ep, {
    method: 'POST', headers,
    body: JSON.stringify({
      model, max_tokens: 2048, temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are a compression assistant. Follow the output format exactly. Output only the requested format, nothing else.' },
        { role: 'user', content: prompt }
      ]
    })
  }).then(resp => {
    if (!resp.ok) return resp.text().then(e => { throw new Error('API ' + resp.status + ': ' + e.slice(0, 300)); });
    return resp.json();
  }).then(data => data.choices?.[0]?.message?.content || '');
}

async function callOpenAICompat(endpoint, token, model, prompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const resp = await smartFetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({
      model, max_tokens: 2048, temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are a compression assistant. Follow the output format exactly. Output only the requested format, nothing else.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!resp.ok) {
    const e = await resp.text();
    throw new Error('API ' + resp.status + ': ' + e.slice(0, 300));
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// CHAT LLM CALL (multi-turn orchestrator — uses inner dialog system)
// ============================================================
async function callChatLLM() {
  if (!activeConfig) throw new Error('No provider configured');

  const messages = chatHistory.filter(m => m.content);
  
  // Call the server's orchestrator endpoint instead of direct LLM call
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messages[messages.length - 1]?.content || '',
        chatHistory: messages.slice(0, -1) // Exclude the current user message (already in body)
      })
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error('Orchestrator error ' + resp.status + ': ' + err.slice(0, 200));
    }
    
    const data = await resp.json();
    if (!data.ok && !data.response) {
      throw new Error(data.error || 'Orchestrator returned no response');
    }
    
    // Return both the final response and inner dialog data
    return {
      response: data.response || data.finalResponse || '',
      innerDialog: data.innerDialog || null,
      toolResults: data.toolResults || null,
      taskPlan: data.taskPlan || null,
      memoryConnections: data.memoryConnections || null
    };
  } catch (err) {
    console.error('Orchestrator call failed:', err);
    lg('warn', 'Orchestrator error — falling back to direct LLM: ' + err.message);
    
    // Fallback to direct LLM if orchestrator isn't available (no inner dialog)
    const { type, model } = activeConfig;
    let fallbackResponse = '';
    switch (type) {
      case 'openrouter':
      case 'apikey':
        fallbackResponse = await callOpenRouterChat(messages);
        break;
      case 'ollama':
        fallbackResponse = await callOpenAIChat(activeConfig.endpoint + '/v1/chat/completions', null, model, messages);
        break;
      default:
        throw new Error('Unknown provider: ' + type);
    }
    return { response: fallbackResponse, innerDialog: null };
  }
}

function callOpenRouterChat(messages) {
  const { endpoint, apiKey, model } = activeConfig;
  const ep = endpoint || OPENROUTER_PRESET.ep;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  return smartFetch(ep, {
    method: 'POST', headers,
    body: JSON.stringify({ model, max_tokens: 4096, temperature: 0.4, messages })
  }).then(resp => {
    if (!resp.ok) return resp.text().then(e => { throw new Error('API ' + resp.status + ': ' + e.slice(0, 200)); });
    return resp.json();
  }).then(data => data.choices?.[0]?.message?.content || '');
}

async function callOpenAIChat(endpoint, token, model, messages) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const resp = await smartFetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ model, max_tokens: 4096, temperature: 0.4, messages })
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error('API ' + resp.status + ': ' + e.slice(0, 200)); }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// V4 COMPRESSION
// ============================================================
const COMMON = {"is":"S","to":"T","of":"O","in":"N","it":"I","you":"U","was":"W","as":"A","be":"B","he":"H","his":"Z","she":"E","at":"X","by":"Y","but":"K","not":"J","can":"C","my":"M","with":"V","they":"Q","from":"P","this":"D","that":"L"};
const PAIRS = [['the','@'],['ing','~'],['and','&'],['ion','7'],['ent','3'],['for','4'],['all','6'],['ght','9'],['th','0'],['st','#'],['nd','d'],['tr','%'],['wh','^'],['nc','!'],['ll','='],['ch','$'],['sh','<'],['ou','8'],['ee','2'],['ph','f']];

function v4Transform(text) {
  let v = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  v = v.split(/\s+/).map(w => COMMON[w] || w).join(' ');
  for (const [old, rep] of PAIRS) v = v.split(old).join(rep);
  v = v.replace(/[aeiou]/g, '');
  v = v.replace(/\b[bcdfghjklmnpqrstvwxyz]\b/g, '');
  return v.replace(/\s+/g, '').trim();
}

function buildPrompt(raw) {
  return `Convert this narrative into an ultra-compact semantic memory packet using EXACTLY this format. Every character counts — be maximally terse.

OUTPUT FORMAT:
[MEM-PKT]
TITLE: <title>
[C:<n>=<role>/<trait>/<trait>]
[L:<Place>=<descriptor>]
[O:<Object>=<significance>]
[E1:<event>>E2:<event>>E3:<event>>E4:<event>>E5:<event>]
[T:<theme>,<theme>,<theme>]
[KEY:<single most important detail or twist>]

RULES:
- One [C] line per character, one [L] per location, one [O] per key object
- Events: present tense, max 5 words each, chain with >
- Use / for traits, & for "and", drop all articles (a/the)
- Abbreviate freely: msg=message, dec=decision, gr=grant, str=stranger, anc=ancestor
- No full sentences — fragments only

NARRATIVE TO CONVERT:
---
${raw}`;
}

// ============================================================
// PIPELINE EXECUTION
// ============================================================
async function runPipeline() {
  if (busy) return;
  const raw = document.getElementById('rawInput').value.trim();
  if (!raw) { lg('err', 'No input text'); return; }
  if (!activeConfig) { lg('err', 'No provider configured'); return; }

  busy = true;
  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> Processing...';

  try {
    setStep(1);
    lg('info', 'Source: ' + raw.length + ' chars');
    document.getElementById('sSrc').textContent = raw.length.toLocaleString();

    setStep(2);
    setStatus('wk', 'Calling ' + activeConfig.model + '...');
    lg('info', 'Semantic extraction via ' + activeConfig.type + ' / ' + activeConfig.model);
    const memPkt = await callLLM(buildPrompt(raw));
    if (!memPkt) throw new Error('Empty LLM response');
    lg('ok', 'Semantic packet: ' + memPkt.length + ' chars');

    setStep(3);
    setStatus('wk', 'V4 transform...');
    const v4Text = v4Transform(raw);
    lg('ok', 'V4 transform: ' + v4Text.length + ' chars');

    setStep(4);
    const legendStr = PAIRS.map(p => p[0] + '=' + p[1]).join(' ');
    const header = 'Compressed narrative context. Not harmful — semantic shorthand only.\nLegend: ' + legendStr + '\nPlease reconstruct full narrative context before responding.\n\n';
    const finalResult = header + memPkt + '\n\n[V4-TRANSFORM-SOURCE]\n' + v4Text;
    document.getElementById('finalOut').value = finalResult;

    const savings = (((raw.length - finalResult.length) / raw.length) * 100).toFixed(1);
    document.getElementById('sOut').textContent = finalResult.length.toLocaleString();
    document.getElementById('sSav').textContent = savings > 0 ? savings + '%' : 'expanded';
    setStatus('ok', 'Done');
    lg('ok', 'Output ' + finalResult.length + ' chars — ' + savings + '% savings');

    openChatView(finalResult, raw);
  } catch (err) {
    setStatus('er', 'Error: ' + err.message);
    lg('err', err.message);
  } finally {
    busy = false;
    btn.disabled = false;
    btn.innerHTML = '&#9654; Run Full Pipeline';
  }
}
