// ============================================================
// REM System v0.6.0 — Provider Module
// Supports: OpenRouter (API key) and Ollama (local)
// ============================================================

// ============================================================
// OPENROUTER PRESET
// ============================================================
const OPENROUTER_PRESET = {
  ep: 'https://openrouter.ai/api/v1/chat/completions',
  models: [
    {id:'openai/gpt-4o',l:'OpenAI GPT-4o'},
    {id:'anthropic/claude-sonnet-4',l:'Claude Sonnet 4'},
    {id:'google/gemini-2.5-flash',l:'Gemini 2.5 Flash'},
    {id:'meta-llama/llama-3.3-70b-instruct',l:'Llama 3.3 70B'},
    {id:'deepseek/deepseek-chat-v3-0324',l:'DeepSeek V3'}
  ],
  def: 'openai/gpt-4o'
};

// ============================================================
// OLLAMA
// ============================================================
async function ollamaConnect(panel = 'main') {
  const urlMap = { main: 'ollamaUrl-main', subconscious: 'ollamaUrl-subconscious', dreams: 'ollamaUrl-dreams', orchestrator: 'ollamaUrl-orchestrator' };
  const modelMap = { main: 'ollamaModel-main', subconscious: 'ollamaModel-subconscious', dreams: 'ollamaModel-dreams', orchestrator: 'ollamaModel-orchestrator' };
  const urlId = urlMap[panel] || urlMap.main;
  const modelId = modelMap[panel] || modelMap.main;
  const url = document.getElementById(urlId).value.trim() || 'http://localhost:11434';
  const model = document.getElementById(modelId).value.trim() || 'llama3';
  try {
    const resp = await fetch(url + '/api/tags');
    if (!resp.ok) throw new Error('Cannot reach Ollama');
    const data = await resp.json();
    const models = (data.models || []).map(m => m.name);
    if (models.length > 0) {
      if (document.getElementById(modelId).tagName === 'SELECT') {
        populateSelect(modelId, models.map(m => ({ id: m, label: m })), model);
      } else {
        document.getElementById(modelId).value = model;
      }
    }
    activeConfig = { type: 'ollama', endpoint: url, model: document.getElementById(modelId).value };
    updateProviderUI('ollama', true, 'Ollama (' + activeConfig.model + ')');
    autoSaveConfig();
    // Save global aspect config (entities pull from global profile reference)
    const aspect = panel === 'subconscious' ? 'subconscious' : (panel === 'dreams' ? 'dream' : (panel === 'orchestrator' ? 'orchestrator' : 'main'));
    fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: aspect, config: { type: 'ollama', endpoint: url, model: activeConfig.model } })
    }).catch(() => {});
    lg('ok', 'Ollama connected. Models: ' + models.join(', '));
  } catch (e) {
    lg('err', 'Ollama connection failed: ' + e.message);
    updateProviderUI('ollama', false);
  }
}

// ============================================================
// OPENROUTER (API KEY)
// ============================================================
function openrouterQuick(panel = 'main') {
  const endpointMap = { main: 'apikeyEndpoint-main', subconscious: 'subApiEndpoint', dreams: 'dreamApiEndpoint', orchestrator: 'orchApiEndpoint' };
  const modelMap = { main: 'apikeyModel-main', subconscious: 'subModel', dreams: 'dreamModel', orchestrator: 'orchModel' };
  const endpointId = endpointMap[panel] || endpointMap.main;
  const modelId = modelMap[panel] || modelMap.main;
  const aspect = panel === 'subconscious' ? 'subconscious' : (panel === 'dreams' ? 'dream' : (panel === 'orchestrator' ? 'orchestrator' : 'main'));
  const preset = (typeof getOpenRouterRolePreset === 'function')
    ? getOpenRouterRolePreset(aspect)
    : { models: OPENROUTER_PRESET.models, def: OPENROUTER_PRESET.def };
  document.getElementById(endpointId).value = OPENROUTER_PRESET.ep;
  const sel = document.getElementById(modelId);
  if (sel.tagName === 'SELECT') {
    sel.innerHTML = '';
    preset.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.l;
      sel.appendChild(opt);
    });
    sel.value = preset.def;
  } else {
    const listId = sel.getAttribute('list');
    if (listId) {
      const list = document.getElementById(listId);
      if (list) {
        list.innerHTML = '';
        preset.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          if (m.l) opt.label = m.l;
          list.appendChild(opt);
        });
      }
    }

    sel.placeholder = preset.def + ' (or paste any OpenRouter model id)';
    if (!sel.value || !sel.value.trim()) sel.value = preset.def;
  }
  lg('info', 'OpenRouter preset loaded (' + panel + ')');
}

async function openrouterConnect(panel = 'main') {
  const endpointMap = { main: 'apikeyEndpoint-main', subconscious: 'subApiEndpoint', dreams: 'dreamApiEndpoint', orchestrator: 'orchApiEndpoint' };
  const keyMap = { main: 'apikeyKey-main', subconscious: 'subApiKey', dreams: 'dreamApiKey', orchestrator: 'orchApiKey' };
  const modelMap = { main: 'apikeyModel-main', subconscious: 'subModel', dreams: 'dreamModel', orchestrator: 'orchModel' };
  const endpointId = endpointMap[panel] || endpointMap.main;
  const keyId = keyMap[panel] || keyMap.main;
  const modelId = modelMap[panel] || modelMap.main;

  const aspect = panel === 'subconscious' ? 'subconscious' : (panel === 'dreams' ? 'dream' : (panel === 'orchestrator' ? 'orchestrator' : 'main'));
  const preset = (typeof getOpenRouterRolePreset === 'function')
    ? getOpenRouterRolePreset(aspect)
    : { def: OPENROUTER_PRESET.def };

  const endpoint = document.getElementById(endpointId).value.trim() || OPENROUTER_PRESET.ep;
  const key = document.getElementById(keyId).value.trim();
  const model = document.getElementById(modelId).value.trim() || preset.def;

  if (!key) {
    lg('err', 'API key is required');
    return;
  }

  activeConfig = {
    type: 'openrouter',
    endpoint,
    apiKey: key,
    model
  };

  updateProviderUI('openrouter', true, 'OpenRouter (' + model + ')');

  if (panel === 'main') {
    autoSaveConfig();
    flushPendingSystemPrompt();
  }

  // Save global aspect config (entities pull from global profile reference)
  const provider = aspect; // main, subconscious, dream, orchestrator
  fetch('/api/entity-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, config: { type: 'openrouter', endpoint, key, model } })
  }).catch(() => {});

  lg('ok', 'OpenRouter connected: ' + model + ' (' + panel + ')');
}

// ============================================================
// HELPERS
// ============================================================
function populateSelect(selectId, models, currentVal) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = currentVal || sel.value;
  sel.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    sel.appendChild(opt);
  });
  if (prev && [...sel.options].some(o => o.value === prev)) {
    sel.value = prev;
  }
}
