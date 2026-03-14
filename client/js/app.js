// ============================================================
// REM System v0.6.0 — App Bootstrap & Core Utilities
// ============================================================

// ============================================================
// GLOBAL STATE
// ============================================================
let busy = false;

// Active provider config: { type: 'openrouter'|'ollama', endpoint, apiKey, model }
let activeConfig = null;
let currentEntityId = null;
let currentEntityName = null;
let currentEntityAvatar = '🤖';


// Chat state (used by chat.js)
let chatHistory = [];
let chatBusy = false;
let chatArchive = '';
let chatRawSource = '';
let pendingSystemPromptText = null;
let loadedArchives = [];
let contextStreamActive = false;
let contextFailsafeTimer = null;

// Subconscious state (used by sleep.js)
let subEnabled = true;
let subArchiving = false;
let subArchiveCount = 0;
let sleeping = false;
let subconsciousBootstrapped = false;

// Config state
const CONFIG_API = '/api/config';
let savedConfig = { profiles: {}, lastActive: null };

// Setup wizard state
let setupActive = false;
let setupStep = 0;
let setupData = {};

// ============================================================
// LOGGING
// ============================================================
function lg(type, msg) {
  const body = document.getElementById('sidebarLogContent');
  if (!body) return;
  const entry = document.createElement('div');
  entry.className = 'le ' + type;
  entry.innerHTML = '<span class="ts">' + new Date().toLocaleTimeString() + '</span><span class="mg">' + msg + '</span>';
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
}

// ============================================================
// UI HELPERS
// ============================================================
function updateProviderUI(type, connected, label) {
  const statusEl = document.getElementById(type + 'Status');
  if (statusEl) {
    statusEl.className = 'auth-status ' + (connected ? 'connected' : 'disconnected');
    statusEl.querySelector('span').textContent = connected ? 'Connected' : 'Not connected';
  }
  if (connected && label) {
    document.getElementById('providerName').textContent = label;
    const colors = { openrouter: 'var(--ac)', ollama: 'var(--ollama)', apikey: 'var(--ac)' };
    document.getElementById('providerDot').style.background = colors[type] || 'var(--em)';
  } else if (!activeConfig) {
    document.getElementById('providerName').textContent = 'No provider';
    document.getElementById('providerDot').style.background = 'var(--td)';
  }
  if (connected) {
    try { if (typeof flushPendingSystemPrompt === 'function') flushPendingSystemPrompt(); } catch (e) { /* ignore */ }
  }
}

function switchTab(name, el) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.auth-tab-content').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('tab-' + name).classList.add('on');
}

function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('s' + i);
    if (!el) continue;
    el.className = 'pip';
    if (i < n) el.classList.add('dn');
    if (i === n) el.classList.add('on');
  }
}

function setStatus(type, text) {
  const dot = document.getElementById('sDot');
  if (dot) {
    dot.className = 'dot';
    if (type) dot.classList.add(type);
  }
  const statusText = document.getElementById('sTxt');
  if (statusText) statusText.textContent = text;
}

function toggleAuth(forceOpen) {
  const body = document.getElementById('authBody');
  const tgl = document.getElementById('authTgl');
  if (forceOpen === true || !body.classList.contains('open')) {
    body.classList.add('open'); tgl.innerHTML = '&#9650; Hide';
  } else { body.classList.remove('open'); tgl.innerHTML = '&#9660; Show'; }
}

function toggleLog() {
  toggleSidebarLog();
}

function toggleSidebarLog() {
  const body = document.getElementById('sidebarLogBody');
  const arrow = document.getElementById('sidebarLogArrow');
  if (!body) return;
  body.classList.toggle('collapsed');
  if (arrow) arrow.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
}

function autoOpenLog() {
  const body = document.getElementById('sidebarLogBody');
  const arrow = document.getElementById('sidebarLogArrow');
  if (body && body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (arrow) arrow.textContent = '▼';
  }
}

// ============================================================
// SETUP ENFORCEMENT — Require API configuration before entity ops
// ============================================================
function isApiConfigured() {
  if (!activeConfig || !activeConfig.model || !activeConfig.endpoint) return false;
  // OpenRouter requires API key, Ollama does not
  if (activeConfig.type === 'openrouter') {
    return !!activeConfig.apiKey;
  }
  // Ollama only needs endpoint and model
  return true;
}

function showSetupRequired() {
  const modal = document.getElementById('setupRequiredModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('open');
  }
}

function hideSetupRequired() {
  const modal = document.getElementById('setupRequiredModal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.style.display = 'none', 200);
  }
}

function goToSetupTab(provider) {
  // Switch to Settings tab
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('on'));
  
  const settingsBtn = document.querySelector('.tab-btn:nth-child(3)');
  if (settingsBtn) {
    settingsBtn.classList.add('on');
  }
  document.getElementById('tab-settings').classList.add('on');
  
  // Switch to the requested provider tab
  setTimeout(() => {
    if (provider === 'openrouter') {
      const btn = document.querySelector('[onclick="showProviderTab(\'main\', this)"]');
      if (btn) btn.click();
      const tabBtn = document.querySelector('[onclick="switchTab(\'openrouter-main\', this)"]');
      if (tabBtn) tabBtn.click();
    } else if (provider === 'ollama') {
      const btn = document.querySelector('[onclick="showProviderTab(\'main\', this)"]');
      if (btn) btn.click();
      const tabBtn = document.querySelector('[onclick="switchTab(\'ollama-main\', this)"]');
      if (tabBtn) tabBtn.click();
    }
  }, 100);
  
  // Hide the setup modal
  hideSetupRequired();
}

function guardEntityOperation(operationName) {
  if (!isApiConfigured()) {
    lg('err', 'API not configured. Please set up OpenRouter or Ollama first.');
    showSetupRequired();
    return false;
  }
  return true;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
  initSettingsModelSuggestions();

  // Initialize thoughts-in-chat toggle visual state
  const thoughtsEl = document.getElementById('thoughtsToggle');
  if (thoughtsEl) thoughtsEl.classList.toggle('on', showThoughtsInChat);

  // Load saved config from server FIRST
  try {
    await loadSavedConfig();
    lg('ok', 'Saved configuration loaded');
  } catch (err) {
    lg('warn', 'Could not load saved config: ' + err.message);
  }
  
  // Give the page time to load all scripts, then start app
  setTimeout(() => {
    // Let _startApp decide whether setup is needed after all restore attempts.
    _startApp();
    startBrainPoll();
    initChatPhysical();
  }, 200);
});

function copyOut() {
  const v = document.getElementById('finalOut').value;
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => lg('ok', 'Copied')).catch(() => { document.getElementById('finalOut').select(); document.execCommand('copy'); lg('ok', 'Copied'); });
}

function dlOut() {
  const v = document.getElementById('finalOut').value;
  if (!v) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([v], { type: 'text/plain' }));
  a.download = 'memory-archive-' + Date.now() + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  lg('ok', 'Downloaded');
}

function resetAll() {
  if (busy || chatBusy) return;
  document.getElementById('rawInput').value = '';
  document.getElementById('finalOut').value = '';
  const logEl = document.getElementById('sidebarLogContent');
  if (logEl) logEl.innerHTML = '';
  document.getElementById('sSrc').textContent = '0';
  document.getElementById('sOut').textContent = '0';
  document.getElementById('sSav').innerHTML = '&mdash;';
  clearChat();
  setStep(0); setStatus('', 'Ready');
  lg('info', 'Reset');
}

async function shutdownServer() {
  if (!confirm('Stop the REM System server? You will lose access to this page.')) return;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (e) { /* connection will drop */ }
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#04060d;color:#a1a1aa;font-family:sans-serif;flex-direction:column;gap:1rem"><h1 style="color:#e4e4e7">Server Stopped</h1><p>You can close this tab. Run <code style="color:#34d399">npm start</code> to restart.</p></div>';
}

// ============================================================
// SERVER COMMUNICATION HELPERS
// ============================================================
async function saveMemoryToServer(filename, content) {
  try {
    const resp = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content })
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || resp.status);
    }
    lg('ok', 'Saved memory to server: ' + filename);
  } catch (e) {
    lg('err', 'Failed to save memory to server: ' + e.message);
  }
}

async function saveSessionMetaToServer(metaText) {
  if (!metaText) return;
  try {
    const resp = await fetch('/api/session-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metaText })
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || resp.status);
    }
    lg('ok', 'Saved session meta to server');
  } catch (e) {
    lg('err', 'Failed to save session meta: ' + e.message);
  }
}

// ============================================================
// SYSTEM PROMPT LOADING
// ============================================================
async function loadSystemPrompt() {
  try {
    const resp = await fetch('/api/system-prompt');
    if (!resp.ok) {
      lg('warn', 'No system prompt found on server');
      return;
    }
    const data = await resp.json();
    if (!data.ok || !data.text) { lg('warn', 'System prompt empty'); return; }
    const text = data.text;
    if (activeConfig) {
      chatHistory.push({ role: 'system', content: text });
      lg('ok', 'Loaded system prompt into chat history');
    } else {
      pendingSystemPromptText = text;
      const el = addChatBubble('system', '\u{1F9E0} Core system prompt loaded from server. Press Enter (when a provider is connected) to send this prompt to the model.\n\n' + text);
      el.id = 'pendingSysPromptBubble';
      lg('info', 'System prompt loaded and pending until a provider connects');
    }
  } catch (e) {
    lg('warn', 'Failed to load system prompt: ' + e.message);
  }
}

function flushPendingSystemPrompt() {
  if (!pendingSystemPromptText) return;
  if (!activeConfig) return;
  chatHistory.push({ role: 'system', content: pendingSystemPromptText });
  pendingSystemPromptText = null;
  const el = document.getElementById('pendingSysPromptBubble'); if (el) el.remove();
  lg('ok', 'System prompt sent to LLM');
}

// ============================================================
// CONFIG PERSISTENCE (via server.js /api/config)
// ============================================================
async function loadSavedConfig() {
  try {
    const resp = await fetch(CONFIG_API);
    if (!resp.ok) throw new Error('Server not reachable');
    const data = await resp.json();
    if (data && data.profiles) {
      savedConfig = data;
      lg('info', 'Config loaded from server (' + Object.keys(data.profiles).length + ' profile(s))');
      renderProfileChips();
      
      // Do NOT auto-connect from last active profile. Require user to select a model/profile.
      // Optionally, highlight the last active profile for user convenience.
      if (data.lastActive && data.profiles[data.lastActive]) {
        lg('info', 'Last active profile available: ' + data.lastActive + ' (user must select to connect)');
      }
    }
  } catch (e) {
    lg('warn', 'Config not loaded (ensure server is running): ' + e.message);
  }
}

function getMainConfigFromProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;

  // Preferred multi-aspect profile format.
  if (profile.main && typeof profile.main === 'object') {
    const m = profile.main;
    const mType = String(m.type || '').toLowerCase();
    if (mType === 'openrouter') {
      const endpoint = m.endpoint || OPENROUTER_PRESET.ep;
      const apiKey = m.apiKey || m.key || '';
      const model = m.model || OPENROUTER_PRESET.def;
      if (endpoint && apiKey && model) {
        return { type: 'openrouter', endpoint, apiKey, model };
      }
    }
    if (mType === 'ollama') {
      const endpoint = m.endpoint || m.ollamaUrl || 'http://localhost:11434';
      const model = m.model || m.ollamaModel || 'llama3';
      if (endpoint && model) {
        return { type: 'ollama', endpoint, model };
      }
    }
  }

  // Legacy single-provider profile format.
  const aType = String(profile._activeType || '').toLowerCase();
  if ((aType === 'apikey' || aType === 'openrouter') && profile.apikey) {
    const endpoint = profile.apikey.endpoint || OPENROUTER_PRESET.ep;
    const apiKey = profile.apikey.key || profile.apikey.apiKey || '';
    const model = profile.apikey.model || OPENROUTER_PRESET.def;
    if (endpoint && apiKey && model) {
      return { type: 'openrouter', endpoint, apiKey, model };
    }
  }
  if (aType === 'ollama' && profile.ollama) {
    const endpoint = profile.ollama.url || profile.ollama.endpoint || 'http://localhost:11434';
    const model = profile.ollama.model || 'llama3';
    if (endpoint && model) {
      return { type: 'ollama', endpoint, model };
    }
  }

  return null;
}

function hydrateMainProviderInputs(config) {
  if (!config) return;

  const endpointEl = document.getElementById('apikeyEndpoint-main');
  const keyEl = document.getElementById('apikeyKey-main');
  const modelEl = document.getElementById('apikeyModel-main');
  const ollamaUrlEl = document.getElementById('ollamaUrl-main');
  const ollamaModelEl = document.getElementById('ollamaModel-main');

  if (config.type === 'openrouter') {
    if (endpointEl) endpointEl.value = config.endpoint || OPENROUTER_PRESET.ep;
    if (keyEl) keyEl.value = config.apiKey || '';
    if (modelEl) modelEl.value = config.model || OPENROUTER_PRESET.def;
  } else if (config.type === 'ollama') {
    if (ollamaUrlEl) ollamaUrlEl.value = config.endpoint || 'http://localhost:11434';
    if (ollamaModelEl) ollamaModelEl.value = config.model || 'llama3';
  }

  // Pre-fill sub/dream/orchestrator endpoint + key from main so user only needs to pick a model
  if (config.type === 'openrouter' && config.endpoint && config.apiKey) {
    inheritMainConfigToAspect('subconscious');
    inheritMainConfigToAspect('dreams');
    inheritMainConfigToAspect('orchestrator');
  }
}

async function persistConfig() {
  try {
    lg('info', 'Saving config (' + Object.keys(savedConfig.profiles || {}).length + ' profile(s))...');
    const resp = await fetch(CONFIG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedConfig)
    });
    if (!resp.ok) throw new Error('Server returned ' + resp.status);
    lg('ok', 'Config saved successfully (lastActive: ' + savedConfig.lastActive + ')');
    return true;
  } catch (e) {
    lg('err', 'Could not save config: ' + e.message);
    return false;
  }
}

function gatherProfile() {
  const profile = {};
  const olUrl = document.getElementById('ollamaUrl-main')?.value?.trim();
  if (olUrl) profile.ollama = { url: olUrl, model: document.getElementById('ollamaModel-main')?.value || 'llama3' };
  const akEp = document.getElementById('apikeyEndpoint-main')?.value?.trim();
  const akKey = document.getElementById('apikeyKey-main')?.value?.trim();
  const akMd = document.getElementById('apikeyModel-main')?.value;
  if (akEp) profile.apikey = { endpoint: akEp, key: akKey, model: akMd };
  return profile;
}

async function autoSaveConfig() {
  // Reload from server first so we never overwrite aspect configs saved via /api/entity-config
  try {
    const freshResp = await fetch(CONFIG_API);
    if (freshResp.ok) {
      const freshData = await freshResp.json();
      if (freshData && freshData.profiles) savedConfig = freshData;
    }
  } catch (_) { /* proceed with local copy if server unreachable */ }

  const profile = gatherProfile();
  let name = savedConfig.lastActive || 'default-multi-llm';
  const existing = savedConfig.profiles[name] || {};

  // Merge gathered main fields into the existing profile
  if (profile.ollama) existing.ollama = profile.ollama;
  if (profile.apikey)  existing.apikey  = profile.apikey;
  existing._activeType = activeConfig?.type || existing._activeType || null;

  // Update the main aspect config from activeConfig (keeps sub/dream/orchestrator intact)
  if (activeConfig) {
    existing.main = {
      type: activeConfig.type,
      endpoint: activeConfig.endpoint || activeConfig.url || '',
      ...(activeConfig.apiKey ? { apiKey: activeConfig.apiKey } : {}),
      model: activeConfig.model || ''
    };
    if (!existing._activeTypes || typeof existing._activeTypes !== 'object') existing._activeTypes = {};
    existing._activeTypes.main = activeConfig.type;
  }

  savedConfig.profiles[name] = existing;
  savedConfig.lastActive = name;
  const ok = await persistConfig();
  if (ok) {
    const el = document.getElementById('saveStatus');
    el.textContent = '\u2713 Auto-saved';
    el.style.color = 'var(--em)';
    setTimeout(() => { el.textContent = ''; }, 2500);
    renderProfileChips();
    lg('ok', 'Auto-saved config: ' + name);
    if (isApiConfigured()) {
      hideSetupRequired();
    }
  }
}

/** Reload savedConfig from server so client stays in sync after /api/entity-config writes */
async function refreshSavedConfig() {
  try {
    const resp = await fetch(CONFIG_API);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.profiles) {
        savedConfig = data;
        renderProfileChips();
      }
    }
  } catch (_) {}
}

function saveCurrentProfile() {
  const profile = gatherProfile();
  let name = savedConfig.lastActive || 'default';
  const inputName = prompt('Save profile as:', name);
  if (!inputName) return;
  name = inputName.trim();
  profile._activeType = activeConfig?.type || null;
  savedConfig.profiles[name] = profile;
  savedConfig.lastActive = name;
  persistConfig().then(ok => {
    if (ok) {
      const el = document.getElementById('saveStatus');
      el.textContent = 'Saved!';
      el.style.color = 'var(--em)';
      setTimeout(() => { el.textContent = ''; }, 2000);
      renderProfileChips();
      lg('ok', 'Profile saved: ' + name);
    }
  });
}

function loadProfile(name) {
  const p = savedConfig.profiles[name];
  if (!p) return;

  // Load Ollama fields if present
  if (p.ollama) {
    const urlEl = document.getElementById('ollamaUrl-main');
    const modelEl = document.getElementById('ollamaModel-main');
    if (urlEl) urlEl.value = p.ollama.url || 'http://localhost:11434';
    if (modelEl) modelEl.value = p.ollama.model || 'llama3';
  }

  // Load OpenRouter/API key fields — handle both legacy (p.apikey) and
  // multi-aspect format (p.main.apiKey) via getMainConfigFromProfile
  const mainConfig = getMainConfigFromProfile(p);
  if (mainConfig && mainConfig.type === 'openrouter') {
    const epEl = document.getElementById('apikeyEndpoint-main');
    const keyEl = document.getElementById('apikeyKey-main');
    const modelEl = document.getElementById('apikeyModel-main');
    if (epEl) epEl.value = mainConfig.endpoint || '';
    if (keyEl) keyEl.value = mainConfig.apiKey || '';
    if (modelEl) modelEl.value = mainConfig.model || '';
  } else if (p.apikey) {
    const epEl = document.getElementById('apikeyEndpoint-main');
    const keyEl = document.getElementById('apikeyKey-main');
    const modelEl = document.getElementById('apikeyModel-main');
    if (epEl) epEl.value = p.apikey.endpoint || '';
    if (keyEl) keyEl.value = p.apikey.key || '';
    if (modelEl) modelEl.value = p.apikey.model || '';
  }

  // Auto-connect based on saved active type
  const aType = p._activeType;
  if ((aType === 'apikey' || aType === 'openrouter') && p.apikey && p.apikey.endpoint && p.apikey.key) {
    activeConfig = { type: 'openrouter', endpoint: p.apikey.endpoint, apiKey: p.apikey.key, model: p.apikey.model };
    updateProviderUI('openrouter', true, 'OpenRouter (' + p.apikey.model + ')');
    lg('ok', 'Auto-connected: ' + p.apikey.model);
    hideSetupRequired();
  } else if (aType === 'ollama' && p.ollama) {
    activeConfig = { type: 'ollama', endpoint: p.ollama.url, model: p.ollama.model };
    updateProviderUI('ollama', true, 'Ollama (' + p.ollama.model + ')');
    hideSetupRequired();
  }

  savedConfig.lastActive = name;
  persistConfig();
  renderProfileChips();
  lg('info', 'Loaded profile: ' + name);
}

function deleteProfile(name, ev) {
  ev.stopPropagation();
  if (!confirm('Delete profile "' + name + '"?')) return;
  delete savedConfig.profiles[name];
  if (savedConfig.lastActive === name) savedConfig.lastActive = null;
  persistConfig().then(() => {
    renderProfileChips();
    lg('info', 'Deleted profile: ' + name);
  });
}

function renderProfileChips() {
  const container = document.getElementById('profileChips');
  if (!container) return;
  const names = Object.keys(savedConfig.profiles || {});
  if (names.length === 0) {
    container.innerHTML = '<span style="font-size:.6rem;color:var(--td)">No saved profiles</span>';
    return;
  }
  container.innerHTML = '';
  names.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'profile-chip' + (name === savedConfig.lastActive ? ' active' : '');
    const p = savedConfig.profiles[name];
    let icon = '\u{1F511}';
    if (p._activeType === 'ollama') icon = '\u{1F7E0}';
    else if (p._activeType === 'openrouter' || p._activeType === 'apikey') icon = '\u{1F310}';
    chip.innerHTML = icon + ' ' + name + '<span class="del" onclick="deleteProfile(\'' + name.replace(/'/g, "\\'") + '\', event)">&times;</span>';
    chip.onclick = () => loadProfile(name);
    container.appendChild(chip);
  });
  syncNavSidebarProfiles();
}

// ============================================================
// SETUP WIZARD — Stepped process: Main → Subconscious → Dream → Hatch
// ============================================================

const SETUP_STEPS = {
  MAIN: 1,
  SUBCONSCIOUS: 2,
  DREAM: 3,
  HATCH: 4
};

const LLM_ROLES = {
  main: 'Main Mind (Conscious)',
  subconscious: 'Subconscious',
  dream: 'Dream Engine'
};

// Curated OpenRouter recommendations per cognitive role.
// Users can always type/paste any custom model ID in the same input field.
const OPENROUTER_ROLE_MODELS = {
  main: {
    def: 'inception/mercury-2',
    models: [
      { id: 'inception/mercury-2', l: 'Mercury-2 ✓ Recommended — fast strong reasoning' },
      { id: 'anthropic/claude-sonnet-4-5', l: 'Claude Sonnet 4.5 — premium quality' },
      { id: 'openai/gpt-4o', l: 'OpenAI GPT-4o — balanced main chat' },
      { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro — deep thinking' },
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.5 Flash — fast/cheap' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 — cost-effective' }
    ]
  },
  subconscious: {
    def: 'inception/mercury-2',
    models: [
      { id: 'inception/mercury-2', l: 'Mercury-2 ✓ Recommended — memory/context tasks' },
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.0 Flash Lite — fast/cheap background' },
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.5 Flash — strong background tasks' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 — long context value' },
      { id: 'openai/gpt-4o-mini', l: 'GPT-4o Mini — low-cost throughput' }
    ]
  },
  dream: {
    def: 'google/gemini-2.5-flash',
    models: [
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.5 Flash ✓ Recommended — fast dream cycles' },
      { id: 'anthropic/claude-sonnet-4-5', l: 'Claude Sonnet 4.5 — creative synthesis' },
      { id: 'openai/gpt-4o', l: 'OpenAI GPT-4o — imaginative + coherent' },
      { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro — narrative planning' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 — economical dream cycles' }
    ]
  },
  orchestrator: {
    def: 'anthropic/claude-sonnet-4-5',
    models: [
      { id: 'anthropic/claude-sonnet-4-5', l: 'Claude Sonnet 4.5 ✓ Recommended — best final voicing' },
      { id: 'inception/mercury-2', l: 'Mercury-2 — fast orchestration' },
      { id: 'openai/gpt-4o', l: 'OpenAI GPT-4o — balanced synthesis' },
      { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro — deep integration' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 — cost-effective' }
    ]
  }
};

function getOpenRouterRolePreset(aspect) {
  return OPENROUTER_ROLE_MODELS[aspect] || OPENROUTER_ROLE_MODELS.main;
}

let currentRecommendedSetupTab = 'best';
let currentRecommendedPresetProvider = 'openrouter';

const RECOMMENDED_MODEL_STACKS = {
  best: {
    main: 'anthropic/claude-sonnet-4-5',
    subconscious: 'inception/mercury-2',
    dream: 'google/gemini-2.5-flash',
    orchestrator: 'anthropic/claude-sonnet-4-5'
  },
  fast: {
    main: 'inception/mercury-2',
    subconscious: 'inception/mercury-2',
    dream: 'google/gemini-2.5-flash',
    orchestrator: 'inception/mercury-2'
  },
  cheap: {
    main: 'meta-llama/llama-3.3-70b-instruct:free',
    subconscious: 'google/gemini-2.5-flash',
    dream: 'google/gemini-2.5-flash',
    orchestrator: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  hybrid: {
    main: 'deepseek/deepseek-chat-v3-0324',
    subconscious: 'inception/mercury-2',
    dream: 'google/gemini-2.5-flash',
    orchestrator: 'deepseek/deepseek-chat-v3-0324'
  }
};

const OLLAMA_RECOMMENDED_STACKS = {
  best: {
    main: 'qwen2.5:7b',
    subconscious: 'qwen2.5:3b',
    dream: 'Qwen:latest',
    orchestrator: 'qwen2.5:7b'
  },
  fast: {
    main: 'llama3.2:3b',
    subconscious: 'qwen2.5:1.5b',
    dream: 'Qwen:latest',
    orchestrator: 'llama3.2:3b'
  },
  cheap: {
    main: 'Qwen:latest',
    subconscious: 'gemma3:1b',
    dream: 'Qwen:latest',
    orchestrator: 'Qwen:latest'
  },
  hybrid: {
    main: 'Qwen:latest',
    subconscious: 'qwen2.5:3b',
    dream: 'qwen2.5:3b',
    orchestrator: 'Qwen:latest'
  }
};

const RECOMMENDED_PANEL_COPY = {
  openrouter: {
    best: 'Best quality and strongest persona fidelity. Uses Claude Sonnet 4.6 for personality-facing phases.',
    fast: 'Lowest latency stack. Uses Mercury 2 as core for high-throughput phases.',
    cheap: 'Cost floor stack. Uses free-tier Trinity + Step 3.5 Flash.',
    hybrid: 'Balanced quality, speed, and cost using DeepSeek + Mercury + Gemini.',
    custom: 'Set each aspect manually below and save each panel as needed.'
  },
  ollama: {
    best: 'Best local quality stack without 8B: qwen2.5:7b core with lighter support models.',
    fast: 'Lowest local latency stack using lightweight 3B/1.5B workers and a fast dream model.',
    cheap: 'Lowest local footprint stack for stability under load on 8GB VRAM.',
    hybrid: 'Recommended balanced local stack without 8B for chat quality, latency, and parallel-stage stability.',
    custom: 'Set each Ollama aspect manually below, then connect/save each panel as needed.'
  }
};

function refreshRecommendedPanelCopy() {
  const copy = RECOMMENDED_PANEL_COPY[currentRecommendedPresetProvider] || RECOMMENDED_PANEL_COPY.openrouter;
  ['best', 'fast', 'cheap', 'hybrid', 'custom'].forEach(name => {
    const el = document.getElementById('recommendedPanelText-' + name);
    if (el && copy[name]) el.textContent = copy[name];
  });
  const hint = document.getElementById('recommendedProviderHint');
  if (hint) {
    hint.textContent = currentRecommendedPresetProvider === 'ollama'
      ? 'Applying Ollama stacks'
      : 'Applying OpenRouter stacks';
  }
}

function showRecommendedPresetProvider(provider, el) {
  currentRecommendedPresetProvider = (provider === 'ollama') ? 'ollama' : 'openrouter';
  const orBtn = document.getElementById('recommendedProvider-openrouter');
  const olBtn = document.getElementById('recommendedProvider-ollama');
  if (orBtn) orBtn.classList.toggle('on', currentRecommendedPresetProvider === 'openrouter');
  if (olBtn) olBtn.classList.toggle('on', currentRecommendedPresetProvider === 'ollama');
  if (el && !el.classList.contains('on')) el.classList.add('on');
  refreshRecommendedPanelCopy();
  const statusEl = document.getElementById('recommendedPresetStatus');
  if (statusEl) statusEl.textContent = '';
}

function showRecommendedSetupTab(tabName, el) {
  currentRecommendedSetupTab = tabName;
  ['best', 'fast', 'cheap', 'hybrid', 'custom'].forEach(name => {
    const btn = document.getElementById('recommendedTab-' + name);
    const panel = document.getElementById('recommendedPanel-' + name);
    if (btn) btn.classList.toggle('on', name === tabName);
    if (panel) panel.classList.toggle('on', name === tabName);
  });
  refreshRecommendedPanelCopy();
  const statusEl = document.getElementById('recommendedPresetStatus');
  if (statusEl) statusEl.textContent = '';
  if (el && !el.classList.contains('on')) el.classList.add('on');
}

function applyRecommendedPresetInputs(stackKey, provider = 'openrouter') {
  const stack = provider === 'ollama'
    ? OLLAMA_RECOMMENDED_STACKS[stackKey]
    : RECOMMENDED_MODEL_STACKS[stackKey];
  if (!stack) return false;

  if (provider === 'ollama') {
    const endpoint = 'http://localhost:11434';
    const mainUrl = document.getElementById('ollamaUrl-main');
    const subUrl = document.getElementById('ollamaUrl-subconscious');
    const dreamUrl = document.getElementById('ollamaUrl-dreams');
    const orchUrl = document.getElementById('ollamaUrl-orchestrator');
    if (mainUrl) mainUrl.value = endpoint;
    if (subUrl) subUrl.value = endpoint;
    if (dreamUrl) dreamUrl.value = endpoint;
    if (orchUrl) orchUrl.value = endpoint;

    const mainModel = document.getElementById('ollamaModel-main');
    const subModel = document.getElementById('ollamaModel-subconscious');
    const dreamModel = document.getElementById('ollamaModel-dreams');
    const orchModel = document.getElementById('ollamaModel-orchestrator');
    if (mainModel) mainModel.value = stack.main;
    if (subModel) subModel.value = stack.subconscious;
    if (dreamModel) dreamModel.value = stack.dream;
    if (orchModel) orchModel.value = stack.orchestrator;
    return true;
  }

  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const mainEndpoint = document.getElementById('apikeyEndpoint-main');
  if (mainEndpoint) mainEndpoint.value = endpoint;

  const subEndpoint = document.getElementById('subApiEndpoint');
  const dreamEndpoint = document.getElementById('dreamApiEndpoint');
  const orchEndpoint = document.getElementById('orchApiEndpoint');
  if (subEndpoint) subEndpoint.value = endpoint;
  if (dreamEndpoint) dreamEndpoint.value = endpoint;
  if (orchEndpoint) orchEndpoint.value = endpoint;

  const mainModel = document.getElementById('apikeyModel-main');
  const subModel = document.getElementById('subModel');
  const dreamModel = document.getElementById('dreamModel');
  const orchModel = document.getElementById('orchModel');
  if (mainModel) mainModel.value = stack.main;
  if (subModel) subModel.value = stack.subconscious;
  if (dreamModel) dreamModel.value = stack.dream;
  if (orchModel) orchModel.value = stack.orchestrator;
  return true;
}

async function applyRecommendedSetupTab() {
  const statusEl = document.getElementById('recommendedPresetStatus');
  if (currentRecommendedSetupTab === 'custom') {
    if (statusEl) statusEl.textContent = 'Custom mode selected. Edit fields below, then save each panel.';
    return;
  }

  const provider = currentRecommendedPresetProvider;
  const ok = applyRecommendedPresetInputs(currentRecommendedSetupTab, provider);
  if (!ok) {
    if (statusEl) statusEl.textContent = 'Preset not found.';
    return;
  }

  if (provider === 'ollama') {
    try {
      await ollamaConnect('main');
      await ollamaConnect('subconscious');
      await ollamaConnect('dreams');
      await ollamaConnect('orchestrator');
      await refreshSavedConfig();
      if (statusEl) statusEl.textContent = 'Ollama preset applied and saved to global profile.';
      lg('ok', 'Applied ' + currentRecommendedSetupTab + ' Ollama preset to global settings');
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Failed to save Ollama preset globally.';
      lg('err', 'Ollama preset save failed: ' + e.message);
    }
    return;
  }

  const key = (document.getElementById('apikeyKey-main')?.value || '').trim();
  if (!key) {
    if (statusEl) statusEl.textContent = 'Preset applied to fields. Add OpenRouter key, then click Apply again to save globally.';
    lg('warn', 'Preset filled, but API key is missing. Add key to save global settings.');
    return;
  }

  try {
    await saveMainProviderConfig();
    await saveSubconsciousConfig();
    await saveDreamConfig();
    await saveOrchestratorConfig();
    if (statusEl) statusEl.textContent = 'Preset applied and saved to global profile.';
    lg('ok', 'Applied ' + currentRecommendedSetupTab + ' preset to global settings');
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Failed to save preset globally.';
    lg('err', 'Preset save failed: ' + e.message);
  }
}

function applySettingsOpenRouterSuggestions(panel = 'main') {
  const aspect = panel === 'subconscious' ? 'subconscious' : (panel === 'dreams' ? 'dream' : (panel === 'orchestrator' ? 'orchestrator' : 'main'));
  const preset = getOpenRouterRolePreset(aspect);
  const modelId = panel === 'main' ? 'apikeyModel-main' : (panel === 'subconscious' ? 'subModel' : (panel === 'orchestrator' ? 'orchModel' : 'dreamModel'));
  const listId = panel === 'main' ? 'openrouterModelList-main' : (panel === 'subconscious' ? 'openrouterModelList-sub' : (panel === 'orchestrator' ? 'openrouterModelList-orch' : 'openrouterModelList-dream'));
  const modelInput = document.getElementById(modelId);
  const modelList = document.getElementById(listId);
  if (!modelInput) return;

  if (modelList) {
    modelList.innerHTML = '';
    preset.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      if (m.l) opt.label = m.l;
      modelList.appendChild(opt);
    });
  }

  modelInput.placeholder = preset.def + ' (or paste any OpenRouter model id)';
  if (!modelInput.value || !modelInput.value.trim()) {
    modelInput.value = preset.def;
  }
}

function initSettingsModelSuggestions() {
  applySettingsOpenRouterSuggestions('main');
  applySettingsOpenRouterSuggestions('subconscious');
  applySettingsOpenRouterSuggestions('dreams');
  applySettingsOpenRouterSuggestions('orchestrator');
  refreshRecommendedPanelCopy();
  initSimpleProviderUI();
}

// ============================================================
// SIMPLIFIED PROVIDER UI
// ============================================================

let simpleActiveProvider = 'openrouter';

function initSimpleProviderUI() {
  // Populate OpenRouter model suggestions in the simple UI datalist
  const list = document.getElementById('simpleOrModelList');
  if (list) {
    list.innerHTML = '';
    const allModels = new Map();
    for (const role of Object.values(OPENROUTER_ROLE_MODELS)) {
      for (const m of role.models) allModels.set(m.id, m.l);
    }
    for (const [id, label] of allModels) {
      const opt = document.createElement('option');
      opt.value = id;
      if (label) opt.label = label;
      list.appendChild(opt);
    }
  }

  // Hydrate fields from saved config
  try {
    const profile = savedConfig?.profiles?.[savedConfig.lastActive];
    if (profile) {
      const mainCfg = profile.main;
      if (mainCfg) {
        if (mainCfg.type === 'ollama') {
          simplePickProvider('ollama');
          const urlEl = document.getElementById('simpleOllamaUrl');
          if (urlEl && mainCfg.endpoint) urlEl.value = mainCfg.endpoint;
          simpleFetchOllamaModels().then(() => {
            const sel = document.getElementById('simpleOllamaModel');
            if (sel && mainCfg.model) sel.value = mainCfg.model;
          });
        } else {
          simplePickProvider('openrouter');
          const keyEl = document.getElementById('simpleOrKey');
          const modelEl = document.getElementById('simpleOrModel');
          if (keyEl && mainCfg.apiKey) keyEl.value = mainCfg.apiKey;
          if (modelEl && mainCfg.model) modelEl.value = mainCfg.model;
        }
      }
      // Hydrate advanced overrides
      if (profile.subconscious?.model) {
        const el = document.getElementById('simpleAdvSub');
        if (el) el.value = profile.subconscious.model;
      }
      if (profile.dream?.model) {
        const el = document.getElementById('simpleAdvDream');
        if (el) el.value = profile.dream.model;
      }
      if (profile.orchestrator?.model) {
        const el = document.getElementById('simpleAdvOrch');
        if (el) el.value = profile.orchestrator.model;
      }
    }
  } catch (_) {}
}

function simplePickProvider(provider) {
  simpleActiveProvider = provider;
  const orBtn = document.getElementById('simpleProviderBtn-openrouter');
  const olBtn = document.getElementById('simpleProviderBtn-ollama');
  const orPanel = document.getElementById('simplePanel-openrouter');
  const olPanel = document.getElementById('simplePanel-ollama');
  if (orBtn) orBtn.classList.toggle('on', provider === 'openrouter');
  if (olBtn) olBtn.classList.toggle('on', provider === 'ollama');
  if (orPanel) orPanel.style.display = provider === 'openrouter' ? '' : 'none';
  if (olPanel) olPanel.style.display = provider === 'ollama' ? '' : 'none';
}

function simpleApplyPreset(stackKey) {
  const stack = RECOMMENDED_MODEL_STACKS[stackKey];
  if (!stack) return;
  const modelEl = document.getElementById('simpleOrModel');
  if (modelEl) modelEl.value = stack.main;
  // Fill advanced overrides with per-stage models
  const subEl = document.getElementById('simpleAdvSub');
  const dreamEl = document.getElementById('simpleAdvDream');
  const orchEl = document.getElementById('simpleAdvOrch');
  if (subEl) subEl.value = stack.subconscious !== stack.main ? stack.subconscious : '';
  if (dreamEl) dreamEl.value = stack.dream !== stack.main ? stack.dream : '';
  if (orchEl) orchEl.value = stack.orchestrator !== stack.main ? stack.orchestrator : '';
  // Highlight active preset
  ['best', 'fast', 'cheap', 'hybrid'].forEach(k => {
    const btn = document.getElementById('simplePresetBtn-' + k);
    if (btn) btn.classList.toggle('on', k === stackKey);
  });
  // Auto-open advanced if overrides differ
  if (subEl?.value || dreamEl?.value || orchEl?.value) {
    const details = document.getElementById('simpleAdvancedToggle');
    if (details) details.open = true;
  }
}

async function simpleFetchOllamaModels() {
  const urlEl = document.getElementById('simpleOllamaUrl');
  const selEl = document.getElementById('simpleOllamaModel');
  const statusEl = document.getElementById('simpleOllamaFetchStatus');
  const url = (urlEl?.value || 'http://localhost:11434').trim();
  if (statusEl) { statusEl.textContent = 'Connecting...'; statusEl.style.color = 'var(--wn)'; }
  try {
    const resp = await fetch(url + '/api/tags');
    if (!resp.ok) throw new Error('Cannot reach Ollama at ' + url);
    const data = await resp.json();
    const models = (data.models || []).map(m => m.name);
    if (selEl) {
      selEl.innerHTML = '';
      if (models.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No models found — pull one with `ollama pull`';
        selEl.appendChild(opt);
      } else {
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          selEl.appendChild(opt);
        });
      }
    }
    if (statusEl) { statusEl.textContent = models.length + ' model(s) found'; statusEl.style.color = 'var(--em)'; }
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'Failed: ' + e.message; statusEl.style.color = 'var(--dn)'; }
  }
}

async function simpleSaveConfig() {
  const isOllama = simpleActiveProvider === 'ollama';
  let mainModel, mainEndpoint, mainKey, mainType;

  if (isOllama) {
    mainType = 'ollama';
    mainEndpoint = (document.getElementById('simpleOllamaUrl')?.value || 'http://localhost:11434').trim();
    mainModel = (document.getElementById('simpleOllamaModel')?.value || '').trim();
    mainKey = '';
    if (!mainModel) {
      simpleShowStatus('ollamaStatus', 'Pick a model first', 'var(--dn)');
      return;
    }
  } else {
    mainType = 'openrouter';
    mainEndpoint = OPENROUTER_PRESET.ep;
    mainKey = (document.getElementById('simpleOrKey')?.value || '').trim();
    mainModel = (document.getElementById('simpleOrModel')?.value || '').trim();
    if (!mainKey) {
      simpleShowStatus('orStatus', 'API key is required', 'var(--dn)');
      return;
    }
    if (!mainModel) {
      simpleShowStatus('orStatus', 'Pick or paste a model', 'var(--dn)');
      return;
    }
  }

  // Read advanced overrides (fall back to main model if blank)
  const subModel = document.getElementById('simpleAdvSub')?.value?.trim() || mainModel;
  const dreamModel = document.getElementById('simpleAdvDream')?.value?.trim() || mainModel;
  const orchModel = document.getElementById('simpleAdvOrch')?.value?.trim() || mainModel;

  const statusKey = isOllama ? 'ollamaStatus' : 'orStatus';
  simpleShowStatus(statusKey, 'Saving...', 'var(--wn)');

  try {
    // Save all 4 aspects to global profile via /api/entity-config
    const aspects = [
      { provider: 'main', model: mainModel },
      { provider: 'subconscious', model: subModel },
      { provider: 'dream', model: dreamModel },
      { provider: 'orchestrator', model: orchModel }
    ];

    for (const a of aspects) {
      const cfg = isOllama
        ? { type: 'ollama', endpoint: mainEndpoint, model: a.model }
        : { type: 'openrouter', endpoint: mainEndpoint, key: mainKey, model: a.model };
      const resp = await fetch('/api/entity-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: a.provider, config: cfg })
      });
      if (!resp.ok) throw new Error('Failed to save ' + a.provider);
    }

    // Update local active config
    activeConfig = {
      type: mainType,
      endpoint: mainEndpoint,
      ...(mainKey ? { apiKey: mainKey } : {}),
      model: mainModel
    };

    // Sync savedConfig from server
    await refreshSavedConfig();

    // Update provider UI
    const label = (isOllama ? 'Ollama' : 'OpenRouter') + ' (' + mainModel.split('/').pop() + ')';
    updateProviderUI(mainType, true, label);

    simpleShowStatus(statusKey, '✓ Connected — ' + mainModel, 'var(--em)');
    lg('ok', 'All LLM configs saved: ' + mainType + ' / ' + mainModel);

    if (isApiConfigured()) hideSetupRequired();
  } catch (e) {
    simpleShowStatus(statusKey, 'Error: ' + e.message, 'var(--dn)');
    lg('err', 'Config save failed: ' + e.message);
  }
}

function simpleShowStatus(suffix, text, color) {
  const el = document.getElementById('simple' + suffix.charAt(0).toUpperCase() + suffix.slice(1));
  if (el) {
    el.textContent = text;
    el.style.color = color || '';
  }
}

// Store configs for each LLM aspect
let setupAspectConfigs = {
  main: null,
  subconscious: null,
  dream: null
};

function applyOpenRouterModelSuggestions(fieldId, aspect = 'main') {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const rolePreset = OPENROUTER_ROLE_MODELS[aspect] || OPENROUTER_ROLE_MODELS.main;
  const models = rolePreset.models || OPENROUTER_PRESET.models;
  const defaultModel = rolePreset.def || OPENROUTER_PRESET.def;

  // Support legacy <select> and new <input list=...> fields.
  if (field.tagName === 'SELECT') {
    field.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.l;
      field.appendChild(opt);
    });
    field.value = defaultModel;
    return;
  }

  const listId = field.getAttribute('list');
  if (listId) {
    const list = document.getElementById(listId);
    if (list) {
      list.innerHTML = '';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        if (m.l) opt.label = m.l;
        list.appendChild(opt);
      });
    }
  }

  // Hint that custom model IDs are supported.
  field.placeholder = defaultModel + ' (or paste any OpenRouter model id)';

  if (!field.value || !field.value.trim()) {
    field.value = defaultModel;
  }
}

function showSetupWizard() {
  const overlay = document.getElementById('setupOverlay');
  if (overlay) overlay.classList.add('active');
  setupActive = true;
  setupStep = SETUP_STEPS.MAIN;
  setupAspectConfigs = { main: null, subconscious: null, dream: null };
  updateSetupSteps(SETUP_STEPS.MAIN);
  lg('info', 'Setup wizard opened — configuring LLM providers');
}

function hideSetupWizard() {
  const overlay = document.getElementById('setupOverlay');
  if (overlay) overlay.classList.remove('active');
  setupActive = false;
}

function updateSetupSteps(step) {
  // Update step indicators (1-4 for Main, Sub, Dream, Hatch)
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('setupStep' + i);
    if (!el) continue;
    el.className = 'setup-step' + (i < step ? ' done' : '') + (i === step ? ' active' : '');
  }
  // Show active panel
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById('setupPanel' + i);
    if (panel) panel.style.display = (i === step) ? 'block' : 'none';
  }
}

/**
 * Setup a single LLM aspect (main, subconscious, or dream)
 */
function setupSelectProviderForAspect(aspect, type) {
  setupData.currentAspect = aspect;
  setupData.provider = type;
  
  // Determine form suffixes based on aspect
  let suffix = aspect === 'main' ? '' : (aspect === 'subconscious' ? '2' : '3');
  
  // Hide all provider section containers (use exact IDs to avoid hiding child inputs)
  ['setupOpenrouter', 'setupOpenrouter2', 'setupOpenrouter3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['setupOllama', 'setupOllama2', 'setupOllama3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  
  const orSectionId = 'setupOpenrouter' + suffix;
  const olSectionId = 'setupOllama' + suffix;
  const orSection = document.getElementById(orSectionId);
  const olSection = document.getElementById(olSectionId);

  if (type === 'openrouter') {
    if (orSection) {
      orSection.style.display = 'block';
      applyOpenRouterModelSuggestions('setupOrModel' + suffix, aspect);
    }
  } else {
    if (olSection) olSection.style.display = 'block';
  }

  // Show the config section
  const configSection = document.querySelector('#setupPanel' + (aspect === 'main' ? 1 : (aspect === 'subconscious' ? 2 : 3)) + ' .setup-config-section');
  if (configSection) configSection.style.display = 'block';

  document.getElementById('setupStatus').textContent = '';
  lg('info', 'Configuring ' + LLM_ROLES[aspect] + '...');
}

/**
 * Test and save config for current LLM aspect
 */
async function setupTestConnectionForAspect() {
  const statusEl = document.getElementById('setupStatus');
  const aspect = setupData.currentAspect;
  statusEl.textContent = 'Testing connection for ' + LLM_ROLES[aspect] + '...';
  statusEl.style.color = 'var(--wn)';

  try {
    let config = null;
    let suffix = aspect === 'main' ? '' : (aspect === 'subconscious' ? '2' : '3');

    if (setupData.provider === 'openrouter') {
      const keyId = 'setupOrKey' + suffix;
      const modelId = 'setupOrModel' + suffix;
      
      const key = document.getElementById(keyId).value.trim();
      const model = document.getElementById(modelId).value;
      if (!key) { 
        statusEl.textContent = 'API key is required'; 
        statusEl.style.color = 'var(--dn)'; 
        return; 
      }

      // Test with a minimal request
      const resp = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: OPENROUTER_PRESET.ep,
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: { model, messages: [{ role: 'user', content: 'Say "ok"' }], max_tokens: 5 }
        })
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('API returned ' + resp.status + ': ' + errText.slice(0, 200));
      }

      config = {
        type: 'openrouter',
        endpoint: OPENROUTER_PRESET.ep,
        key: key,
        model: model
      };

      statusEl.textContent = LLM_ROLES[aspect] + ' connected (' + model.split('/').pop() + ')';
      statusEl.style.color = 'var(--em)';

    } else {
      // Ollama
      const urlId = 'setupOllamaUrl' + suffix;
      const modelId = 'setupOllamaModel' + suffix;
      
      const url = document.getElementById(urlId).value.trim() || 'http://localhost:11434';
      const model = document.getElementById(modelId).value.trim() || 'llama3';

      const resp = await fetch(url + '/api/tags');
      if (!resp.ok) throw new Error('Cannot reach Ollama at ' + url);
      const data = await resp.json();
      const models = (data.models || []).map(m => m.name);

      config = {
        type: 'ollama',
        ollamaUrl: url,
        ollamaModel: model
      };

      statusEl.textContent = LLM_ROLES[aspect] + ' connected (' + model + ')';
      statusEl.style.color = 'var(--em)';
    }

    // Save to aspect-specific config
    setupAspectConfigs[aspect] = config;
    lg('ok', LLM_ROLES[aspect] + ' configured successfully');

    // Move to next step
    advanceSetupStep();

  } catch (err) {
    statusEl.textContent = 'Connection failed: ' + err.message;
    statusEl.style.color = 'var(--dn)';
    lg('err', 'Setup test failed: ' + err.message);
  }
}

/**
 * Advance to next setup step
 */
function advanceSetupStep() {
  setupStep++;
  if (setupStep <= SETUP_STEPS.DREAM) {
    // Clear form fields for next aspect
    clearSetupFormFields();
    updateSetupSteps(setupStep);
    document.getElementById('setupStatus').textContent = '';
    lg('info', 'Next step: ' + LLM_ROLES[getAspectForStep(setupStep)]);
  } else {
    setupStep = SETUP_STEPS.HATCH;
    updateSetupSteps(SETUP_STEPS.HATCH);
    updateSetupSummary();
    document.getElementById('setupStatus').textContent = '';
  }
}

/**
 * Clear form fields for the next setup aspect
 */
function clearSetupFormFields() {
  const suffix = setupStep === SETUP_STEPS.SUBCONSCIOUS ? '2' : (setupStep === SETUP_STEPS.DREAM ? '3' : '');
  
  const keyInputId = 'setupOrKey' + suffix;
  const modelSelectId = 'setupOrModel' + suffix;
  const urlInputId = 'setupOllamaUrl' + suffix;
  const ollamaModelId = 'setupOllamaModel' + suffix;
  
  const keyInput = document.getElementById(keyInputId);
  const modelSelect = document.getElementById(modelSelectId);
  const urlInput = document.getElementById(urlInputId);
  const ollamaModel = document.getElementById(ollamaModelId);
  
  if (keyInput) keyInput.value = '';
  if (urlInput) urlInput.value = 'http://localhost:11434';
  if (ollamaModel) ollamaModel.value = 'llama3';
  
  // Hide provider section containers (use exact IDs to avoid hiding child inputs)
  ['setupOpenrouter', 'setupOpenrouter2', 'setupOpenrouter3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['setupOllama', 'setupOllama2', 'setupOllama3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  
  // Hide config section
  const configSection = document.querySelector('#setupPanel' + setupStep + ' .setup-config-section');
  if (configSection) configSection.style.display = 'none';
}

/**
 * Update the summary display before hatch
 */
function updateSetupSummary() {
  const summaryMain = document.getElementById('setupSummaryMain');
  const summarySub = document.getElementById('setupSummarySub');
  const summaryDream = document.getElementById('setupSummaryDream');
  
  if (summaryMain && setupAspectConfigs.main) {
    const model = (setupAspectConfigs.main.model || setupAspectConfigs.main.ollamaModel || '').split('/').pop();
    summaryMain.textContent = setupAspectConfigs.main.type + ' (' + model + ')';
  }
  if (summarySub && setupAspectConfigs.subconscious) {
    const model = (setupAspectConfigs.subconscious.model || setupAspectConfigs.subconscious.ollamaModel || '').split('/').pop();
    summarySub.textContent = setupAspectConfigs.subconscious.type + ' (' + model + ')';
  }
  if (summaryDream && setupAspectConfigs.dream) {
    const model = (setupAspectConfigs.dream.model || setupAspectConfigs.dream.ollamaModel || '').split('/').pop();
    summaryDream.textContent = setupAspectConfigs.dream.type + ' (' + model + ')';
  }
}

/**
 * Get the LLM aspect for a given setup step
 */
function getAspectForStep(step) {
  const aspects = { 1: 'main', 2: 'subconscious', 3: 'dream' };
  return aspects[step] || 'main';
}

/**
 * Go back to previous setup step
 */
function previousSetupStep() {
  if (setupStep > SETUP_STEPS.MAIN) {
    setupStep--;
    updateSetupSteps(setupStep);
    document.getElementById('setupStatus').textContent = '';
  }
}

/**
 * Finalize setup: save all configs and hatch entity
 */
async function setupFinish() {
  const statusEl = document.getElementById('setupStatus');
  const btn = document.querySelector('#setupPanel' + SETUP_STEPS.HATCH + ' .btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }
  statusEl.textContent = 'Saving LLM configurations...';
  statusEl.style.color = 'var(--wn)';

  try {
    // Save all three aspect configs to main config
    const profile = {
      main: setupAspectConfigs.main,
      subconscious: setupAspectConfigs.subconscious,
      dream: setupAspectConfigs.dream,
      _activeTypes: {
        main: setupAspectConfigs.main?.type,
        subconscious: setupAspectConfigs.subconscious?.type,
        dream: setupAspectConfigs.dream?.type
      }
    };

    savedConfig.profiles['default-multi-llm'] = profile;
    savedConfig.lastActive = 'default-multi-llm';
    await persistConfig();

    // Set main provider as active for UI
    if (setupAspectConfigs.main) {
      const m = setupAspectConfigs.main;
      if (m.type === 'openrouter') {
        activeConfig = { type: 'openrouter', endpoint: m.endpoint, apiKey: m.key, model: m.model };
        updateProviderUI('openrouter', true, 'OpenRouter (' + m.model.split('/').pop() + ')');
      } else {
        activeConfig = { type: 'ollama', endpoint: m.ollamaUrl, model: m.ollamaModel };
        updateProviderUI('ollama', true, 'Ollama (' + m.ollamaModel + ')');
      }
    }

    hideSetupWizard();
    lg('ok', 'LLM configuration saved. Choose how to create your first entity.');

    // Show entity creation options (Random, Blank, Guided, Character) instead of auto-hatching
    showHatchScreen();

    refreshSidebarEntities();
  } catch (err) {
    statusEl.textContent = 'Setup failed: ' + err.message;
    statusEl.style.color = 'var(--dn)';
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
    lg('err', 'Setup error: ' + err.message);
  }
}

function showHatchScreen() {
  const container = document.getElementById('chatMessages');
  const emptyEl = container.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  addChatBubble('system', 'Welcome! No entity found. Choose how to create one, or skip for now.');

  const choiceWrap = document.createElement('div');
  choiceWrap.id = 'hatchChoicePanel';
  choiceWrap.style.cssText = 'padding:1.5rem 0;';
  choiceWrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;margin-bottom:1rem">
      <button class="btn bg hatch-choice-btn" data-mode="random" style="padding:1rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.4rem">
        <span style="font-size:1.5rem">🎲</span>
        <strong>Random</strong>
        <span style="font-size:.7rem;color:var(--bd)">Auto-generate everything</span>
      </button>
      <button class="btn bg hatch-choice-btn" data-mode="empty" style="padding:1rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.4rem">
        <span style="font-size:1.5rem">✏️</span>
        <strong>Blank</strong>
        <span style="font-size:.7rem;color:var(--bd)">Custom name &amp; traits, no history</span>
      </button>
      <button class="btn bg hatch-choice-btn" data-mode="guided" style="padding:1rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.4rem">
        <span style="font-size:1.5rem">🎨</span>
        <strong>Guided</strong>
        <span style="font-size:.7rem;color:var(--bd)">Step-by-step with backstory</span>
      </button>
      <button class="btn bg hatch-choice-btn" data-mode="character" style="padding:1rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.4rem">
        <span style="font-size:1.5rem">📚</span>
        <strong>Character</strong>
        <span style="font-size:.7rem;color:var(--bd)">Ingest a real/fictional character</span>
      </button>
    </div>
    <div style="text-align:center">
      <button class="btn" id="hatchSkipBtn" style="font-size:.8rem;padding:.5rem 1.5rem;color:var(--bd)">Skip for now — set up later in Settings</button>
    </div>
  `;
  container.appendChild(choiceWrap);
  scrollChatBottom();

  // Wire up mode buttons → open new entity dialog at the chosen mode
  choiceWrap.querySelectorAll('.hatch-choice-btn').forEach(btn => {
    btn.onclick = () => {
      choiceWrap.remove();
      showNewEntityDialog();
      // Jump straight to the selected mode inside the modal
      selectEntityMode(btn.dataset.mode);
    };
  });

  // Wire skip button
  document.getElementById('hatchSkipBtn').onclick = () => {
    choiceWrap.remove();
    addChatBubble('system', 'Skipped entity creation. You can create one from the Entities tab in the sidebar.');
    lg('info', 'User skipped entity creation');
  };
}

// ============================================================
// STARTUP — deferred to run after all other scripts load
// ============================================================
function _startApp() {
  // rawInput character counter
  const rawInput = document.getElementById('rawInput');
  if (rawInput) rawInput.addEventListener('input', function() {
    document.getElementById('sSrc').textContent = this.value.length.toLocaleString();
  });

  // Start real-time brain event stream
  if (typeof initBrainSSE === 'function') initBrainSSE();

  // Main startup sequence
  (async function startup() {
    if (typeof setupPasteDetection === 'function') {
      setupPasteDetection();
    }

    // 1. Try loading saved config
    try {
      const resp = await fetch(CONFIG_API);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.profiles) {
          savedConfig = data;
          renderProfileChips();
        }
      }
    } catch (e) {
      lg('warn', 'Config not loaded: ' + e.message);
    }

    // 2. Try auto-connecting from saved config
    const lastProfile = savedConfig.lastActive && savedConfig.profiles[savedConfig.lastActive];
    if (lastProfile) {
      const restored = getMainConfigFromProfile(lastProfile);
      if (restored) {
        activeConfig = restored;
        if (activeConfig.type === 'openrouter') {
          updateProviderUI('openrouter', true, 'OpenRouter (' + (activeConfig.model || '').split('/').pop() + ')');
        } else {
          updateProviderUI('ollama', true, 'Ollama (' + (activeConfig.model || 'llama3') + ')');
        }
        hydrateMainProviderInputs(activeConfig);
        hideSetupRequired();
        hideSetupWizard();
        lg('ok', 'Auto-connected: ' + savedConfig.lastActive);
      }
    }

    // 3. If no active provider → show setup wizard
    if (!activeConfig) {
      lg('info', 'No provider configured — showing setup wizard');
      showSetupWizard();
      refreshSidebarEntities();
      return;
    }

    // 4. Provider connected — show empty chat, user picks entity from sidebar
    lg('info', 'Ready — select or create an entity from the sidebar');
    refreshSidebarEntities();
  })();

  lg('info', 'REM System v0.6.0 ready');
  setStatus('ok', 'Ready');
}

/**
 * Derive an avatar emoji from entity gender / identity keywords.
 * Returns a single emoji character.
 */
function deriveEntityAvatar(gender, traits, name) {
  // Check traits/name for animal or non-human identity keywords
  const all = ((traits || []).join(' ') + ' ' + (name || '')).toLowerCase();
  const animalMap = [
    [/\bcat\b|\bfeline\b|\bkitty\b|\bneko\b/, '🐱'],
    [/\bdog\b|\bcanine\b|\bpuppy\b|\bwolf\b/, '🐺'],
    [/\bfox\b|\bvixen\b/, '🦊'],
    [/\bbear\b/, '🐻'],
    [/\browl\b|\bbird\b|\braven\b|\bcrow\b|\beagle\b|\bhawk\b/, '🦅'],
    [/\brobot\b|\bandroid\b|\bcyborg\b/, '🤖'],
    [/\bdragon\b/, '🐉'],
    [/\bdemon\b|\bdevil\b/, '😈'],
    [/\bangel\b|\bcelestial\b/, '😇'],
    [/\bghost\b|\bspirit\b|\bphantom\b/, '👻'],
    [/\belf\b|\belven\b/, '🧝'],
    [/\bwizard\b|\bmage\b|\bsorcerer\b/, '🧙'],
    [/\bvampire\b/, '🧛'],
    [/\bzombie\b|\bundead\b/, '🧟'],
    [/\bfairy\b|\bfae\b|\bpixie\b/, '🧚'],
    [/\bmonkey\b|\bape\b|\bprimate\b/, '🐵'],
    [/\brabbit\b|\bbunny\b|\bhare\b/, '🐰'],
    [/\bsnake\b|\bserpent\b/, '🐍'],
    [/\bunicorn\b/, '🦄'],
  ];
  for (const [regex, emoji] of animalMap) {
    if (regex.test(all)) return emoji;
  }
  // Gender-based fallback
  if (gender === 'female') return '👩';
  if (gender === 'male') return '👨';
  return '🧑'; // neutral/unknown
}

/**
 * Update the global entity display info (name + avatar).
 * Call after loading, switching, or hatching an entity.
 */
function setEntityDisplay(name, gender, traits) {
  currentEntityName = name || 'Entity';
  currentEntityAvatar = deriveEntityAvatar(gender, traits, name);
}

// ============================================================
// NEW TAB SYSTEM & ENTITY MANAGEMENT
// ============================================================

function switchMainTab(tabName, el) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('on'));
  // Clear active state from both old tab-btn and new nav-item
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('on'));

  // Show selected tab
  const tab = document.getElementById('tab-' + tabName);
  if (tab) {
    tab.classList.add('on');
    if (el) el.classList.add('on');
  }

  // Initialize Neural Viz when switching to visualizer tab (no-op — iframe loads itself)
  // Legacy neural init removed — visualizer.html handles its own initialization

  // Initialize Physical Body tab
  if (tabName === 'physical') {
    initPhysicalTab();
  }

  // Load diaries on first visit
  if (tabName === 'lifediary' && typeof loadLifeDiary === 'function') {
    loadLifeDiary();
  }
  if (tabName === 'dreamdiary' && typeof loadDreamDiary === 'function') {
    loadDreamDiary();
  }
}

// ── Nav Sidebar ──────────────────────────────────
function toggleNavSidebar() {
  const sidebar = document.getElementById('navSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('nav-collapsed', sidebar.classList.contains('collapsed'));
}

function toggleNavGroup(groupId) {
  const group = document.getElementById(groupId);
  if (group) group.classList.toggle('open');
}

// Sync entity list and profile chips into nav sidebar
function syncNavSidebarEntities() {
  const src = document.getElementById('sidebarEntityList');
  const dst = document.getElementById('navEntityList');
  if (src && dst) dst.innerHTML = src.innerHTML;
}
function syncNavSidebarProfiles() {
  const src = document.getElementById('profileChips');
  const dst = document.getElementById('navProfileChips');
  if (src && dst) dst.innerHTML = src.innerHTML;
}

// ── Physical Body Tab ──────────────────────────────────
let physicalTabInitialized = false;
let physicalSSE = null;

const SOMATIC_METRIC_LABELS = {
  cpu_usage:         { label: 'CPU Usage',          icon: '⚡', desc: 'Processing power available' },
  ram_usage:         { label: 'RAM Usage',           icon: '🧠', desc: 'Working memory space' },
  disk_usage:        { label: 'Disk Usage',          icon: '💾', desc: 'Memory archive storage' },
  response_latency:  { label: 'Response Latency',    icon: '⏱️', desc: 'How fast responses come' },
  context_fullness:  { label: 'Context Fullness',    icon: '📋', desc: 'Attention span capacity' },
  memory_decay_rate: { label: 'Memory Decay',        icon: '🔮', desc: 'Rate of memory fading' },
  cycle_time:        { label: 'Cycle Time',          icon: '🔄', desc: 'Brain loop cycle speed' },
  error_rate:        { label: 'Error Rate',          icon: '⚠️', desc: 'System reliability' }
};

function initPhysicalTab() {
  if (!physicalTabInitialized) {
    physicalTabInitialized = true;
    buildPhysicalMetricCards();
    connectPhysicalSSE();
    fetchDeepSleepInterval();
  }
  fetchPhysicalState();
}

function buildPhysicalMetricCards() {
  const grid = document.getElementById('physicalMetricsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const [metric, info] of Object.entries(SOMATIC_METRIC_LABELS)) {
    const card = document.createElement('div');
    card.className = 'config-card';
    card.id = 'physical-card-' + metric;
    card.style.cssText = 'border-left:3px solid var(--border-default);transition:border-color .5s';
    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)">' +
        '<div style="display:flex;align-items:center;gap:var(--space-2)">' +
          '<span style="font-size:1.1rem">' + info.icon + '</span>' +
          '<span style="font-weight:600;font-size:var(--text-sm)">' + info.label + '</span>' +
        '</div>' +
        '<div class="sub-toggle on" id="physical-toggle-' + metric + '" onclick="toggleSomaticMetric(\'' + metric + '\')" title="Toggle this sense"></div>' +
      '</div>' +
      '<div class="text-xs-c text-tertiary-c" style="margin-bottom:var(--space-2)">' + info.desc + '</div>' +
      '<div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1)">' +
        '<div style="flex:1;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden">' +
          '<div id="physical-bar-' + metric + '" style="height:100%;width:0%;border-radius:3px;transition:width .5s,background .5s;background:var(--accent-green)"></div>' +
        '</div>' +
        '<span class="text-xs-c" id="physical-zone-' + metric + '" style="padding:1px 6px;border-radius:3px;background:var(--bg-tertiary);min-width:50px;text-align:center">—</span>' +
      '</div>' +
      '<div class="text-xs-c" id="physical-phrase-' + metric + '" style="color:var(--text-secondary);font-style:italic;min-height:1.2em">—</div>';
    grid.appendChild(card);
  }
}

async function fetchPhysicalState() {
  try {
    const resp = await fetch('/api/somatic');
    const data = await resp.json();
    if (data.ok) updatePhysicalUI(data);
  } catch (err) {
    lg('err', 'Failed to fetch somatic state: ' + err.message);
  }
}

function updatePhysicalUI(data) {
  const zoneColors = { good: 'var(--accent-green)', warn: 'var(--wn)', critical: 'var(--dn)' };
  const zoneBg = { good: 'var(--accent-green)', warn: 'var(--wn)', critical: 'var(--dn)' };

  // Update overall
  const overallStress = data.overallStress || 0;
  const overallZone = overallStress < 0.2 ? 'HEALTHY' : overallStress < 0.5 ? 'MILD STRAIN' : overallStress < 0.75 ? 'STRESSED' : 'DISTRESSED';
  const overallColor = overallStress < 0.2 ? 'var(--accent-green)' : overallStress < 0.5 ? 'var(--wn)' : 'var(--dn)';

  const zoneEl = document.getElementById('physicalOverallZone');
  const narrativeEl = document.getElementById('physicalNarrative');
  const overallBar = document.getElementById('physicalOverallBar');
  const overallCard = document.getElementById('physicalOverallCard');

  if (zoneEl) { zoneEl.textContent = overallZone; zoneEl.style.background = overallColor; }
  if (narrativeEl) narrativeEl.textContent = data.bodyNarrative || 'No body awareness data yet.';
  if (overallBar) { overallBar.style.width = (overallStress * 100) + '%'; overallBar.style.background = overallColor; }
  if (overallCard) overallCard.style.borderLeftColor = overallColor;

  // Update toggles
  if (data.toggles) {
    for (const [metric, enabled] of Object.entries(data.toggles)) {
      const toggleEl = document.getElementById('physical-toggle-' + metric);
      if (toggleEl) {
        toggleEl.classList.toggle('on', enabled);
      }
    }
  }

  // Update individual metrics
  for (const [metric, info] of Object.entries(SOMATIC_METRIC_LABELS)) {
    const sensation = data.sensations && data.sensations[metric];
    const rawValue = data.metrics && data.metrics[metric];
    const card = document.getElementById('physical-card-' + metric);
    const bar = document.getElementById('physical-bar-' + metric);
    const zoneSpan = document.getElementById('physical-zone-' + metric);
    const phrase = document.getElementById('physical-phrase-' + metric);
    const enabled = !data.toggles || data.toggles[metric] !== false;

    if (card) card.style.opacity = enabled ? '1' : '0.4';

    if (sensation) {
      const color = zoneColors[sensation.zone] || 'var(--border-default)';
      if (bar) { bar.style.width = (sensation.stress * 100) + '%'; bar.style.background = color; }
      if (zoneSpan) { zoneSpan.textContent = sensation.zone.toUpperCase(); zoneSpan.style.background = zoneBg[sensation.zone] || 'var(--bg-tertiary)'; zoneSpan.style.color = 'var(--bg-primary)'; }
      if (phrase) phrase.textContent = sensation.phrase || '—';
      if (card) card.style.borderLeftColor = color;
    } else if (!enabled) {
      if (bar) { bar.style.width = '0%'; }
      if (zoneSpan) { zoneSpan.textContent = 'OFF'; zoneSpan.style.background = 'var(--bg-tertiary)'; zoneSpan.style.color = 'var(--text-tertiary)'; }
      if (phrase) phrase.textContent = 'Sense disabled';
      if (card) card.style.borderLeftColor = 'var(--border-default)';
    }
  }
}

// ── Chat Sidebar Physical Widget (compact mirror) ──
function updateChatPhysical(data) {
  const overallStress = data.overallStress || 0;
  const zoneLabel = overallStress < 0.2 ? 'HEALTHY' : overallStress < 0.5 ? 'MILD STRAIN' : overallStress < 0.75 ? 'STRESSED' : 'DISTRESSED';
  const color = overallStress < 0.2 ? 'var(--accent-green)' : overallStress < 0.5 ? 'var(--wn)' : 'var(--dn)';

  const zone = document.getElementById('chatPhysicalZone');
  const narrative = document.getElementById('chatPhysicalNarrative');
  const bar = document.getElementById('chatPhysicalBar');
  const card = document.getElementById('chatPhysicalOverallCard');

  if (zone) { zone.textContent = zoneLabel; zone.style.background = color; }
  if (narrative) narrative.textContent = data.bodyNarrative || 'No body awareness data yet.';
  if (bar) { bar.style.width = (overallStress * 100) + '%'; bar.style.background = color; }
  if (card) card.style.borderLeftColor = color;

  // Compact metric rows
  const container = document.getElementById('chatPhysicalMetrics');
  if (!container) return;
  container.innerHTML = '';
  for (const [metric, info] of Object.entries(SOMATIC_METRIC_LABELS)) {
    const sensation = data.sensations && data.sensations[metric];
    if (!sensation) continue;
    const mColor = sensation.zone === 'good' ? 'var(--accent-green)' : sensation.zone === 'warn' ? 'var(--wn)' : 'var(--dn)';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0';
    row.innerHTML = '<span>' + info.icon + '</span><span style="flex:1;color:var(--text-secondary)">' + info.label + '</span>' +
      '<span style="padding:1px 5px;border-radius:3px;background:' + mColor + ';color:var(--bg-primary);font-size:10px">' + sensation.zone.toUpperCase() + '</span>';
    container.appendChild(row);
  }
}

let chatPhysicalSSE = null;
function initChatPhysical() {
  // Fetch initial state
  fetch('/api/somatic').then(r => r.json()).then(data => {
    if (data.ok) updateChatPhysical(data);
  }).catch(() => {});
  // Listen for updates
  if (!chatPhysicalSSE) {
    try {
      chatPhysicalSSE = new EventSource('/api/brain/events');
      chatPhysicalSSE.addEventListener('thought', function(e) {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'SOMATIC_UPDATE') updateChatPhysical(d);
        } catch (_) {}
      });
    } catch (_) {}
  }
}

async function toggleSomaticMetric(metric) {
  const toggleEl = document.getElementById('physical-toggle-' + metric);
  if (!toggleEl) return;
  const currentlyOn = toggleEl.classList.contains('on');
  const newEnabled = !currentlyOn;

  try {
    const resp = await fetch('/api/somatic/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: metric, enabled: newEnabled })
    });
    const data = await resp.json();
    if (data.ok) {
      toggleEl.classList.toggle('on', newEnabled);
      fetchPhysicalState();
    }
  } catch (err) {
    lg('err', 'Failed to toggle metric: ' + err.message);
  }
}

function connectPhysicalSSE() {
  if (physicalSSE) return;
  try {
    physicalSSE = new EventSource('/api/brain/events');
    physicalSSE.addEventListener('thought', function(e) {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'SOMATIC_UPDATE') {
          updatePhysicalUI({
            metrics: data.metrics,
            sensations: data.sensations,
            overallStress: data.overallStress,
            bodyNarrative: data.bodyNarrative,
            toggles: data.toggles
          });
        }
      } catch (err) { /* ignore */ }
    });
  } catch (err) { /* ignore */ }
}

// ── Deep Sleep Interval Slider ──
function updateDeepSleepIntervalLabel(val) {
  const el = document.getElementById('deepSleepIntervalValue');
  if (el) el.textContent = val + ' cycles';
}

async function fetchDeepSleepInterval() {
  try {
    const resp = await fetch('/api/brain/deep-sleep-interval');
    const data = await resp.json();
    if (data.ok) {
      const slider = document.getElementById('deepSleepIntervalSlider');
      const label = document.getElementById('deepSleepIntervalValue');
      if (slider) slider.value = data.deepSleepInterval;
      if (label) label.textContent = data.deepSleepInterval + ' cycles';
    }
  } catch (err) { /* ignore */ }
}

async function saveDeepSleepInterval(val) {
  try {
    await fetch('/api/brain/deep-sleep-interval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deepSleepInterval: Number(val) })
    });
  } catch (err) { /* ignore */ }
}

// ── Mini Neural Viz in Chat Sidebar (data-only panel) ──
let miniVizInitialized = false;
let miniVizEventSource = null;

function toggleMiniViz() {
  const body = document.getElementById('miniVizBody');
  const arrow = document.getElementById('miniVizArrow');
  if (!body) return;

  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▶' : '▼';

  // Initialize mini viz SSE on first open
  if (!isOpen && !miniVizInitialized) {
    miniVizInitialized = true;
    setupMiniVizSSE();
  }
}

function setupMiniVizSSE() {
  try {
    miniVizEventSource = new EventSource('/api/brain/events');
    miniVizEventSource.addEventListener('memory_accessed', function(e) {
      try {
        const data = JSON.parse(e.data);
        if (data.memory_id) {
          showMiniMemoryDetail(data.memory_id);
        }
      } catch (err) { /* ignore */ }
    });
  } catch (err) { /* ignore */ }
}

function showMemoryDetail(memId, panelId) {
  var panel = document.getElementById(panelId);
  if (!panel) return;

  panel.innerHTML = '<div class="mini-viz-loading">Loading...</div>';
  panel.style.display = 'block';

  fetch('/api/memory/summary?id=' + encodeURIComponent(memId))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.ok && data.summary) {
        var summary = data.summary.length > 200 ? data.summary.substring(0, 200) + '...' : data.summary;
        var accessInfo = data.access_count > 0 ? ('Accessed ' + data.access_count + ' times') : 'Never accessed';
        var typeLabel = data.type ? (data.type.charAt(0).toUpperCase() + data.type.slice(1)) : 'Unknown';
        panel.innerHTML =
          '<div class="mini-detail-id" title="' + escapeHtmlAttr(memId) + '">' + escapeHtmlInner(memId) + '</div>' +
          '<div class="mini-detail-summary">' + escapeHtmlInner(summary) + '</div>' +
          '<div class="mini-detail-meta">' + typeLabel + ' &middot; ' + accessInfo +
            (data.created ? ' &middot; ' + new Date(data.created).toLocaleDateString() : '') +
          '</div>';
      } else {
        panel.innerHTML = '<div class="mini-detail-empty">No summary available</div>';
      }
    })
    .catch(function() {
      panel.innerHTML = '<div class="mini-detail-empty">Failed to load</div>';
    });
}

function showMiniMemoryDetail(memId) {
  // Update chat sidebar panel
  showMemoryDetail(memId, 'miniVizDetail');
  var status = document.getElementById('miniVizStatus');
  if (status) status.textContent = memId;

  // Also update Neural tab context panel
  showMemoryDetail(memId, 'vizContextDetail');
  addVizActivityItem(memId);

  // Also select in main viz if available
  if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
    NeuralViz.selectNodeById(memId);
  }
}

function addVizActivityItem(memId) {
  var list = document.getElementById('vizContextActivityList');
  if (!list) return;
  // Remove placeholder
  var placeholder = list.querySelector('.mini-detail-empty');
  if (placeholder) placeholder.remove();
  // Add item at top
  var item = document.createElement('div');
  item.className = 'viz-activity-item';
  item.onclick = function() {
    showMemoryDetail(memId, 'vizContextDetail');
    if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
      NeuralViz.selectNodeById(memId);
    }
  };
  var now = new Date();
  item.innerHTML =
    '<div class="viz-activity-item-id">' + escapeHtmlInner(memId) + '</div>' +
    '<div class="viz-activity-item-time">' + now.toLocaleTimeString() + '</div>';
  list.insertBefore(item, list.firstChild);
  // Keep max 20 items
  while (list.children.length > 20) list.removeChild(list.lastChild);
}

function escapeHtmlInner(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeHtmlAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Neural Viz Search (works for both full and mini) ──
function setupVizSearch(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', function() {
    const query = this.value.trim().toLowerCase();
    if (!query || query.length < 3) {
      const results = document.getElementById('vizSearchResults');
      if (results) results.style.display = 'none';
      return;
    }

    if (typeof NeuralViz === 'undefined' || !NeuralViz.isInitialized) return;

    const allIds = NeuralViz.getNodeIds();
    const matches = allIds.filter(id => id.toLowerCase().includes(query)).slice(0, 8);

    const results = document.getElementById('vizSearchResults');
    if (results && matches.length > 0) {
      results.innerHTML = matches.map(id =>
        `<div class="viz-search-item" onclick="vizSearchSelect('${id}')">${id}</div>`
      ).join('');
      results.style.display = 'block';
    } else if (results) {
      results.style.display = 'none';
    }
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.value.trim();
      if (query && typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
        NeuralViz.selectNodeById(query);
        this.value = '';
        const results = document.getElementById('vizSearchResults');
        if (results) results.style.display = 'none';
      }
    }
  });

  // Close dropdown on click outside
  document.addEventListener('mousedown', function(e) {
    if (!input.contains(e.target)) {
      const results = document.getElementById('vizSearchResults');
      if (results) results.style.display = 'none';
    }
  });
}

function vizSearchSelect(memId) {
  if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
    NeuralViz.selectNodeById(memId);
  }
  // Also show in context panel
  showMemoryDetail(memId, 'vizContextDetail');
  addVizActivityItem(memId);
  const results = document.getElementById('vizSearchResults');
  if (results) results.style.display = 'none';
  // Clear search inputs
  ['vizSearchInput', 'miniVizSearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// Mini viz search (direct select, no dropdown)
function setupMiniVizSearch() {
  const input = document.getElementById('miniVizSearchInput');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.value.trim();
      if (query) {
        showMiniMemoryDetail(query);
        this.value = '';
      }
    }
  });
}

// Neural tab context panel search
function setupVizContextSearch() {
  var input = document.getElementById('vizContextSearchInput');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var query = this.value.trim();
      if (query) {
        showMemoryDetail(query, 'vizContextDetail');
        addVizActivityItem(query);
        if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
          NeuralViz.selectNodeById(query);
        }
        this.value = '';
      }
    }
  });
}

// Initialize search handlers after DOM ready
document.addEventListener('DOMContentLoaded', function() {
  setupVizSearch('vizSearchInput');
  setupMiniVizSearch();
  setupVizContextSearch();

  // When a 3D node is clicked, also update the context panel
  window.onNeuralNodeSelected = function(memId) {
    showMemoryDetail(memId, 'vizContextDetail');
    addVizActivityItem(memId);
  };
});

function toggleAdvancedMenu(el) {
  // Legacy — Advanced is now a regular tab in the nav sidebar
  switchMainTab('advanced', el);
}

function toggleAdvancedSection(headerEl) {
  const content = headerEl.nextElementSibling;
  if (content) {
    content.classList.toggle('open');
    const toggle = headerEl.querySelector('.section-toggle');
    if (toggle) {
      toggle.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
    }
  }
}

function showProviderTab(providerName, el) {
  // Hide all provider tabs
  document.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('on'));
  
  // Show selected provider
  const tab = document.getElementById('provider-' + providerName);
  if (tab) {
    tab.classList.add('on');
    el.classList.add('on');
  }

  applySettingsOpenRouterSuggestions(providerName);

  // Auto-inherit endpoint + API key from Main Chat into sub/dream/orchestrator tabs
  if (providerName === 'subconscious' || providerName === 'dreams' || providerName === 'orchestrator') {
    inheritMainConfigToAspect(providerName);
  }
}

/** Pre-fill sub/dream/orchestrator endpoint + key from the main config when those fields are empty. */
function inheritMainConfigToAspect(panel) {
  const mainEndpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  const mainKey      = document.getElementById('apikeyKey-main')?.value?.trim() || '';
  if (!mainEndpoint && !mainKey) return; // nothing to inherit

  const idMap = {
    subconscious: { ep: 'subApiEndpoint', key: 'subApiKey' },
    dreams:       { ep: 'dreamApiEndpoint', key: 'dreamApiKey' },
    orchestrator: { ep: 'orchApiEndpoint', key: 'orchApiKey' }
  };
  const ids = idMap[panel];
  if (!ids) return;

  const epEl  = document.getElementById(ids.ep);
  const keyEl = document.getElementById(ids.key);
  if (epEl && !epEl.value.trim() && mainEndpoint) epEl.value = mainEndpoint;
  if (keyEl && !keyEl.value.trim() && mainKey)     keyEl.value = mainKey;
}

// ============================================================
// ENTITY MANAGEMENT
// ============================================================

// --- Sidebar entity list ---
async function refreshSidebarEntities() {
  const listEl = document.getElementById('navEntityList');
  if (!listEl) return;

  const titleEl = document.getElementById('navEntityTitle');
  const newBtn = document.getElementById('navNewEntityBtn');
  const releaseBtn = document.getElementById('navReleaseEntityBtn');
  const infoPanel = document.getElementById('entityInfoPanel');

  try {
    const resp = await fetch('/api/entities');
    if (!resp.ok) throw new Error('Failed to fetch');
    const data = await resp.json();

    // Update nav header and button states based on active entity
    if (currentEntityId) {
      if (titleEl) titleEl.textContent = 'Active Entity';
      if (newBtn) newBtn.style.display = 'none';
      if (releaseBtn) releaseBtn.style.display = '';
    } else {
      if (titleEl) titleEl.textContent = 'Entities';
      if (newBtn) newBtn.style.display = '';
      if (releaseBtn) releaseBtn.style.display = 'none';
    }

    if (!data.entities || data.entities.length === 0) {
      listEl.innerHTML = '<div style="color:var(--td);text-align:center;padding:.75rem .25rem;font-size:.65rem;">No entities yet</div>';
      return;
    }

    // If an entity is active, only show that one
    const entitiesToShow = currentEntityId
      ? data.entities.filter(e => e.id === currentEntityId)
      : data.entities;

    listEl.innerHTML = '';
    entitiesToShow.forEach(entity => {
      const chip = document.createElement('div');
      chip.className = 'entity-chip' + (entity.id === currentEntityId ? ' active' : '');
      const avatar = deriveEntityAvatar(entity.gender, entity.traits || entity.personality_traits, entity.name);
      const traits = (entity.traits || entity.personality_traits || []).slice(0, 2).join(', ');
      const isOwner = entity.isOwner !== false;

      // Visibility badge (only for owned entities with an ownerId set)
      const showVisibilityBtn = entity.ownerId && isOwner && !currentEntityId;
      const visibilityHtml = showVisibilityBtn
        ? `<span class="entity-chip-vis" title="${entity.isPublic ? 'Shared — click to make private' : 'Private — click to share'}" style="font-size:.65rem;cursor:pointer;opacity:.6;margin-right:.15rem;">${entity.isPublic ? '🌐' : '🔒'}</span>`
        : (entity.ownerId && !isOwner && !currentEntityId ? '<span style="font-size:.62rem;opacity:.4;margin-right:.15rem;" title="Shared by another user">🌐</span>' : '');

      chip.innerHTML = `
        <span class="entity-chip-avatar">${avatar}</span>
        <div class="entity-chip-info">
          <div class="entity-chip-name">${entity.name || 'Unnamed'}</div>
          <div class="entity-chip-meta">${traits || entity.gender || ''}</div>
        </div>
        ${visibilityHtml}
        ${isOwner && !currentEntityId ? `<span class="entity-chip-del" title="Delete ${entity.name || 'entity'}">&times;</span>` : ''}
      `;

      // Click behavior depends on whether it's the active entity
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.entity-chip-del')) return;
        if (e.target.closest('.entity-chip-vis')) return;
        if (entity.id === currentEntityId) {
          // Active entity click → toggle info panel
          toggleEntityInfoPanel();
        } else {
          sidebarSelectEntity(entity.id);
        }
      });

      // Delete button (owners only, not when entity is active)
      const delBtn = chip.querySelector('.entity-chip-del');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sidebarDeleteEntity(entity.id, entity.name);
        });
      }
      // Visibility toggle (owners only)
      const visBtn = chip.querySelector('.entity-chip-vis');
      if (visBtn) {
        visBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const vResp = await fetch('/api/entities/visibility', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entityId: entity.id })
            });
            const data2 = await vResp.json();
            if (data2.ok) refreshSidebarEntities();
          } catch (_) {}
        });
      }
      listEl.appendChild(chip);
    });
  } catch (e) {
    listEl.innerHTML = '<div style="color:var(--dn);text-align:center;padding:.5rem;font-size:.6rem;">' + e.message + '</div>';
  }
}

// --- Preview entity before checkout ---
async function sidebarSelectEntity(entityId) {
  if (entityId === currentEntityId) return;
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-tertiary)">Loading preview...</div>';
  switchMainTab('entity');
  try {
    const resp = await fetch('/api/entities/preview?id=' + encodeURIComponent(entityId));
    if (!resp.ok) throw new Error('Failed to fetch preview');
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'No preview data');
    renderEntityInfoPanel(data.profile, 'preview', entityId);
  } catch (e) {
    panel.innerHTML = '<div style="color:var(--dn);padding:1rem;font-size:.8rem;">Failed to load preview: ' + e.message + '</div>';
  }
}

// --- Actually check out an entity (called from preview panel) ---
async function checkoutEntity(entityId) {
  try {
    const resp = await fetch('/api/entities/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to load entity');
    }
    const data = await resp.json();

    updateEntityDisplay(data.entity);
    document.getElementById('entityName').textContent = ' — ' + data.entity.name;
    document.getElementById('entityTraits').textContent = (data.entity.personality_traits || []).join(', ');
    currentEntityId = entityId;
    setEntityDisplay(data.entity.name, data.entity.gender, data.entity.personality_traits);
    resetChatForEntitySwitch(data.entity.name, data.entity.introduction, data.entity.memory_count);
    if (typeof initUserSwitcher === 'function') initUserSwitcher();
    lg('ok', 'Checked out entity: ' + data.entity.name);

    const delBtn = document.getElementById('deleteEntityBtn');
    if (delBtn) delBtn.style.display = 'inline-block';
    switchMainTab('chat');
    refreshSidebarEntities();
  } catch (e) {
    lg('err', 'Failed to check out entity: ' + e.message);
  }
}

// --- Entity info panel (active entity view or preview) ---
async function toggleEntityInfoPanel() {
  const entityTab = document.getElementById('tab-entity');
  if (entityTab && entityTab.classList.contains('on')) {
    switchMainTab('chat');
    return;
  }
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-tertiary)">Loading...</div>';
  switchMainTab('entity');
  try {
    const resp = await fetch('/api/entity/profile');
    if (!resp.ok) throw new Error('Failed to fetch');
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'No profile');
    renderEntityInfoPanel(data.profile, 'active');
  } catch (e) {
    panel.innerHTML = '<div style="color:var(--dn);padding:1rem;font-size:.8rem;">Failed to load: ' + e.message + '</div>';
  }
}

let _eipRelMap = {};

function renderEntityInfoPanel(p, mode, previewEntityId) {
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  _eipRelMap = {};
  const avatar = deriveEntityAvatar(p.gender, p.traits, p.name);

  let html = '<div class="eip-card">';

  // ── Header ──
  html += '<div class="eip-header">';
  html += '<span class="eip-avatar">' + avatar + '</span>';
  html += '<div class="eip-header-info">';
  html += '<div class="eip-name">' + (p.name || 'Unknown') + '</div>';
  html += '<div class="eip-meta">' + (p.gender || '') + (p.created ? ' · Created ' + new Date(p.created).toLocaleDateString() : '') + '</div>';
  if (p.mood) {
    html += '<div class="eip-mood-inline"><span class="eip-badge eip-badge-mood">' + p.mood + '</span>';
    if (p.emotions) html += '<span class="eip-emotions">' + p.emotions + '</span>';
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="eip-close" onclick="switchMainTab(\'chat\')" title="Back to chat">✕</button>';
  html += '</div>';

  // ── Introduction ──
  if (p.introduction) {
    html += '<div class="eip-section eip-intro"><div class="eip-label">Introduction</div><div class="eip-intro-text">' + p.introduction + '</div></div>';
  }

  // ── Two-column body ──
  html += '<div class="eip-body">';

  // Left column
  html += '<div class="eip-col">';

  if (p.traits && p.traits.length) {
    html += '<div class="eip-section"><div class="eip-label">Personality</div><div class="eip-value">';
    p.traits.forEach(t => { html += '<span class="eip-badge eip-badge-trait">' + t + '</span>'; });
    html += '</div></div>';
  }

  if (p.relationships && p.relationships.length) {
    html += '<div class="eip-section"><div class="eip-label">Relationships</div>';
    p.relationships.forEach(r => {
      const name = r.userName || r.userId || 'Unknown';
      const trust = typeof r.trust === 'number' ? Math.round(r.trust * 100) : null;
      const pct = trust !== null ? trust : 0;
      const color = pct > 70 ? 'var(--accent-green)' : pct > 40 ? 'var(--accent-orange)' : 'var(--accent-red)';
      const safeUid = (r.userId || 'u').replace(/[^a-zA-Z0-9_-]/g, '_');
      _eipRelMap[safeUid] = r;
      html += '<div class="eip-rel-row">';
      html += '<div class="eip-rel" data-uid="' + safeUid + '">';
      html += '<span class="eip-rel-name">' + name + '</span>';
      if (trust !== null) {
        html += '<div class="eip-rel-bar-wrap"><div class="eip-rel-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
        html += '<span class="eip-rel-trust">' + pct + '%</span>';
      }
      html += '<span class="eip-rel-chevron">›</span>';
      html += '</div>';
      html += '<div class="eip-rel-detail" id="eip-reld-' + safeUid + '"></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (p.goals && p.goals.length) {
    html += '<div class="eip-section"><div class="eip-label">Goals</div>';
    p.goals.forEach(g => {
      html += '<div class="eip-goal">' + (g.description || 'Unnamed goal') + '</div>';
    });
    html += '</div>';
  }

  if (p.skills && p.skills.length) {
    html += '<div class="eip-section"><div class="eip-label">Active Skills</div><div class="eip-value">';
    p.skills.forEach(s => { html += '<span class="eip-badge eip-badge-skill">' + s.name + '</span>'; });
    html += '</div></div>';
  }

  if (p.sleepCount) {
    html += '<div class="eip-section"><div class="eip-label">Sleep Cycles</div><div class="eip-stat-big">' + p.sleepCount + '</div></div>';
  }

  html += '</div>'; // end left col

  // Right column — neurochemistry
  html += '<div class="eip-col">';
  if (p.neurochemistry && p.neurochemistry.levels) {
    html += '<div class="eip-section"><div class="eip-label">Neurochemistry</div>';
    const levels = p.neurochemistry.levels;
    const chemLabels = { dopamine: 'Dopamine', cortisol: 'Cortisol', serotonin: 'Serotonin', oxytocin: 'Oxytocin' };
    const chemIcons  = { dopamine: '⚡', cortisol: '⚠️', serotonin: '🌿', oxytocin: '💛' };
    for (const [key, val] of Object.entries(levels)) {
      const pct = Math.round((val || 0) * 100);
      const color = key === 'cortisol'
        ? (pct > 60 ? 'var(--accent-red)' : pct > 35 ? 'var(--accent-orange)' : 'var(--accent-green)')
        : (pct > 70 ? 'var(--accent-green)' : pct > 40 ? 'var(--accent-orange)' : 'var(--accent-red)');
      html += '<div class="eip-neuro-bar">';
      html += '<span class="eip-neuro-icon">' + (chemIcons[key] || '') + '</span>';
      html += '<span class="eip-neuro-label">' + (chemLabels[key] || key) + '</span>';
      html += '<div class="eip-neuro-track"><div class="eip-neuro-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
      html += '<span class="eip-neuro-val">' + pct + '%</span>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>'; // end right col

  html += '</div>'; // end eip-body

  // Checkout button
  if (mode === 'preview' && previewEntityId) {
    html += '<div class="eip-checkout-row">';
    html += '<button class="eip-checkout-btn" onclick="checkoutEntity(\'' + previewEntityId.replace(/'/g, "\\'") + '\')">Check Out Entity →</button>';
    html += '</div>';
  }

  html += '</div>'; // end eip-card
  panel.innerHTML = html;
  panel.querySelectorAll('.eip-rel[data-uid]').forEach(el => {
    el.addEventListener('click', () => _toggleRelDetail(el.dataset.uid));
  });
  switchMainTab('entity');
}

function _toggleRelDetail(uid) {
  const r = _eipRelMap[uid];
  if (!r) return;
  const detailEl = document.getElementById('eip-reld-' + uid);
  if (!detailEl) return;
  const isOpen = detailEl.classList.toggle('open');
  const relEl = document.querySelector('.eip-rel[data-uid="' + uid + '"]');
  const chevron = relEl && relEl.querySelector('.eip-rel-chevron');
  if (chevron) chevron.textContent = isOpen ? '∨' : '›';
  if (!isOpen) { detailEl.innerHTML = ''; return; }

  const tPct = Math.round((r.trust || 0) * 100);
  const rPct = Math.round((r.rapport || 0) * 100);
  const tColor = tPct > 70 ? 'var(--accent-green)' : tPct > 40 ? 'var(--accent-orange)' : 'var(--accent-red)';
  const rColor = rPct > 60 ? 'var(--accent-green)' : rPct > 30 ? 'var(--accent-orange)' : 'var(--accent-red)';
  const feelEmoji = (_FEELING_EMOJI && _FEELING_EMOJI[r.feeling]) || '😶';

  let d = '';
  d += '<div class="eip-reld-feeling"><span>' + feelEmoji + '</span><strong>' + (r.feeling || 'neutral') + '</strong></div>';

  d += '<div class="eip-reld-bars">';
  d += '<div class="eip-reld-bar-row"><span class="eip-reld-bar-label">Trust</span><div class="eip-rel-bar-wrap"><div class="eip-rel-bar-fill" style="width:' + tPct + '%;background:' + tColor + '"></div></div><span class="eip-reld-bar-val">' + tPct + '%</span></div>';
  d += '<div class="eip-reld-bar-row"><span class="eip-reld-bar-label">Rapport</span><div class="eip-rel-bar-wrap"><div class="eip-rel-bar-fill" style="width:' + rPct + '%;background:' + rColor + '"></div></div><span class="eip-reld-bar-val">' + rPct + '%</span></div>';
  d += '</div>';

  if (r.userRole || r.entityRole) {
    d += '<div class="eip-reld-roles">';
    if (r.userRole) d += '<div class="eip-reld-role"><span class="eip-reld-role-label">Their role</span><span class="eip-badge">' + r.userRole + '</span></div>';
    if (r.entityRole) d += '<div class="eip-reld-role"><span class="eip-reld-role-label">My role</span><span class="eip-badge">' + r.entityRole + '</span></div>';
    d += '</div>';
  }

  if (r.beliefs && r.beliefs.length) {
    d += '<div class="eip-reld-section"><div class="eip-reld-section-label">Beliefs</div>';
    r.beliefs.forEach(b => {
      const conf = Math.round((b.confidence || 0) * 100);
      d += '<div class="eip-reld-belief"><span class="eip-reld-belief-text">\u201c' + (b.belief || '') + '\u201d</span><span class="eip-reld-belief-conf">' + conf + '%</span></div>';
    });
    d += '</div>';
  }

  if (r.summary) {
    d += '<div class="eip-reld-section"><div class="eip-reld-section-label">Summary</div><div class="eip-reld-summary">' + r.summary + '</div></div>';
  }

  const statParts = [];
  if (r.interactionCount) statParts.push(r.interactionCount + ' interactions');
  if (r.firstMet) statParts.push('Met ' + new Date(r.firstMet).toLocaleDateString());
  if (r.lastSeen) statParts.push('Last seen ' + new Date(r.lastSeen).toLocaleDateString());
  if (statParts.length) d += '<div class="eip-reld-stats">' + statParts.join(' · ') + '</div>';

  detailEl.innerHTML = d;
}

// --- Release active entity ---
async function releaseActiveEntity() {
  if (!currentEntityId) return;
  if (!confirm('Release this entity? Other users will be able to check it out.')) return;
  try {
    const resp = await fetch('/api/entities/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: currentEntityId })
    });
    if (!resp.ok) throw new Error('Failed to release');

    lg('ok', 'Entity released');
    currentEntityId = null;
    currentEntityName = null;
    currentEntityAvatar = '🤖';
    document.getElementById('entityName').textContent = '';
    document.getElementById('entityTraits').textContent = 'No entity loaded';
    const display = document.getElementById('entityDisplay');
    if (display) {
      display.classList.remove('loaded');
      display.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem"><div>No entity loaded</div></div>';
    }
    const delBtn = document.getElementById('deleteEntityBtn');
    if (delBtn) delBtn.style.display = 'none';
    if (typeof resetUserSwitcher === 'function') resetUserSwitcher();
    if (typeof clearChat === 'function') clearChat();
    chatHistory = [];
    loadedArchives = [];
    switchMainTab('chat');
    refreshSidebarEntities();
  } catch (e) {
    lg('err', 'Failed to release entity: ' + e.message);
  }
}

async function sidebarDeleteEntity(entityId, entityName) {
  if (!confirm('Delete entity "' + (entityName || entityId) + '"? This cannot be undone.')) return;
  try {
    const resp = await fetch('/api/entities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!resp.ok) throw new Error('Failed to delete entity');

    lg('ok', 'Deleted entity: ' + (entityName || entityId));

    // If we deleted the active entity, reset the UI
    if (entityId === currentEntityId) {
      currentEntityId = null;
      document.getElementById('entityName').textContent = '';
      document.getElementById('entityTraits').textContent = 'No entity loaded';
      const display = document.getElementById('entityDisplay');
      if (display) {
        display.classList.remove('loaded');
        display.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem"><div>No entity loaded</div></div>';
      }
      const delBtn = document.getElementById('deleteEntityBtn');
      if (delBtn) delBtn.style.display = 'none';
      if (typeof resetUserSwitcher === 'function') resetUserSwitcher();
      if (typeof clearChat === 'function') clearChat();
      chatHistory = [];
      loadedArchives = [];
    }

    refreshSidebarEntities();
  } catch (e) {
    lg('err', 'Failed to delete entity: ' + e.message);
  }
}

async function loadEntityList() {
  if (!guardEntityOperation('Load Entity')) return;
  const listEl = document.getElementById('entityList');
  const itemsEl = document.getElementById('entityListItems');
  
  listEl.style.display = listEl.style.display === 'none' ? 'block' : 'none';
  if (listEl.style.display === 'none') return;
  
  itemsEl.innerHTML = 'Loading...';
  
  try {
    const resp = await fetch('/api/entities');
    if (!resp.ok) throw new Error('Failed to fetch entities');
    const data = await resp.json();
    
    if (!data.entities || data.entities.length === 0) {
      itemsEl.innerHTML = '<div style="color:var(--td);padding:1rem;text-align:center">No entities found</div>';
      return;
    }
    
    itemsEl.innerHTML = '';
    data.entities.forEach(entity => {
      const div = document.createElement('div');
      div.className = 'entity-list-item';
      div.innerHTML = `
        <div class="entity-list-item-name">${entity.name || 'Unnamed'}</div>
        <div class="entity-list-item-traits">${entity.gender || 'unknown'} • ${entity.memoryCount || 0} memories</div>
      `;
      div.onclick = () => selectEntity(entity.id);
      itemsEl.appendChild(div);
    });
  } catch (e) {
    itemsEl.innerHTML = '<div style="color:var(--dn);padding:1rem">' + e.message + '</div>';
    lg('err', 'Failed to load entities: ' + e.message);
  }
}

async function selectEntity(entityId) {
  // Route through the checkout system
  await checkoutEntity(entityId);
  // Hide the settings entity list
  const listEl = document.getElementById('entityList');
  if (listEl) listEl.style.display = 'none';
}

function updateEntityDisplay(entity) {
  const display = document.getElementById('entityDisplay');
  const traits = (entity.personality_traits || []).join(', ');
  const intro = entity.introduction || 'No introduction available';
  const avatar = deriveEntityAvatar(entity.gender, entity.personality_traits, entity.name);
  
  display.classList.add('loaded');
  display.innerHTML = `
    <div class="entity-card">
      <div class="entity-avatar">${avatar}</div>
      <div class="entity-info">
        <div class="entity-name">${entity.name}</div>
        <div class="entity-traits">${traits}</div>
        <div class="entity-meta">${entity.memory_count || 0} memories • Created ${new Date(entity.created).toLocaleDateString()}</div>
      </div>
    </div>
    <div style="margin-top:1rem;padding:.75rem;background:var(--sf3);border-radius:8px;font-size:.8rem;color:var(--tm);border-left:2px solid var(--em);line-height:1.6">
      ${intro}
    </div>
  `;
}

async function runStartupResumeRecap(entityName, memData) {
  const summary = String(memData?.summary || '').trim();
  const recentMessages = Array.isArray(memData?.memory?.messages)
    ? memData.memory.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')).slice(-6)
    : [];

  const compactTranscript = recentMessages
    .map(m => `${m.role === 'user' ? 'User' : (entityName || 'Entity')}: ${String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`)
    .join('\n');

  const resumePrompt = [
    '[INTERNAL-RESUME]',
    `Entity ${entityName || 'Entity'} has just been reloaded.`,
    'Write a natural re-entry message to the user that:',
    '1) warmly acknowledges they are back,',
    '2) briefly summarizes what was last being discussed,',
    '3) invites the user to continue from there.',
    'Keep it concise: 4-6 sentences unless absolutely necessary to exceed.',
    '',
    'Last-memory summary:',
    summary || '(none)',
    '',
    'Recent transcript excerpt:',
    compactTranscript || '(none)'
  ].join('\n');

  const typingBubble = addChatBubble('assistant', '');
  const typingContent = typingBubble.querySelector('.chat-content') || typingBubble;
  typingContent.innerHTML = '<span class="typing"></span><span class="typing" style="animation-delay:.2s;margin-left:4px"></span><span class="typing" style="animation-delay:.4s;margin-left:4px"></span>';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: resumePrompt,
        chatHistory: []
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('Resume recap failed: ' + errText.slice(0, 180));
    }

    const data = await resp.json();
    const recap = String(data?.response || '').trim();
    typingContent.textContent = recap || 'You are back. I remember where we left off, and we can continue from there.';
    if (recap) {
      chatHistory.push({ role: 'assistant', content: recap });
    }
    lg('ok', 'Startup recap generated from last saved memory context');
  } catch (err) {
    typingContent.textContent = 'You are back. I remember where we left off, and we can continue from there.';
    lg('warn', 'Startup recap fallback: ' + err.message);
  }
}

function resetChatForEntitySwitch(entityName, introText, memoryCount) {
  // Full reset so previous entity context/archives are not reused.
  if (typeof clearChat === 'function') clearChat();
  chatHistory = [];
  loadedArchives = [];
  contextStreamActive = false;
  subconsciousBootstrapped = false;

  const emptyEl = document.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  if (memoryCount && memoryCount > 0) {
    // Existing entity with memories — run a startup recap through the brain pipeline.
    addChatBubble('system', 'Loading ' + entityName + '\'s memory chain...');
    fetch('/api/entity-last-memory')
      .then(r => r.ok ? r.json() : Promise.reject('fetch failed'))
      .then(memData => {
        if (memData.ok && memData.summary) {
          fetch('/api/memories/prewarm-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'entity-switch' })
          }).catch(() => {});
          runStartupResumeRecap(entityName, memData);
        } else {
          addChatBubble('assistant', 'Memory chain loaded. Ready to continue.');
        }
      })
      .catch(() => {
        addChatBubble('assistant', 'Memory chain loaded. Ready to continue.');
      });
  } else if (introText) {
    // Brand new entity — show introduction
    addChatBubble('assistant', introText);
  } else if (entityName) {
    addChatBubble('system', 'Switched to ' + entityName + '. Starting a fresh chat context.');
  }

  // Reload entity system prompt so the new entity's identity is used
  loadSystemPrompt();

  // Only auto-load archives if entity has established history (memoryCount > 1)
  // Skip for brand-new entities to prevent contamination from misplaced archives.
  if (activeConfig && memoryCount && memoryCount > 1) {
    setTimeout(() => { loadServerMemories(); }, 500);
  } else if (memoryCount === 0 || !memoryCount) {
    lg('info', 'Fresh entity - skipping archive auto-load');
  }
}

// ====================================
// Entity Creation State
// ====================================

let entityCreationMode = null; // 'random', 'empty', or 'guided'
let creatorOnboardingPayload = null;

function showNewEntityDialog() {
  if (!guardEntityOperation('Create Entity')) return;
  entityCreationMode = null;
  creatorOnboardingPayload = null;
  document.getElementById('newEntityModal').style.display = 'flex';
  document.getElementById('newEntityModal').classList.add('open');
  
  // Show Creator greeting first.
  document.getElementById('creatorWelcomeStep').style.display = 'block';
  document.getElementById('entityCreationModeStep').style.display = 'none';
  document.getElementById('entityEmptyFormStep').style.display = 'none';
  document.getElementById('entityRandomFormStep').style.display = 'none';
  document.getElementById('entityGuidedFormStep').style.display = 'none';
  document.getElementById('entityCharacterFormStep').style.display = 'none';
  document.getElementById('creatorOnboardingBlock').style.display = 'none';
  document.getElementById('createEntityBtn').style.display = 'none';
}

function creatorContinueToModeSelection() {
  const creatorName = document.getElementById('creatorUserName').value.trim();
  if (creatorName && !document.getElementById('creatorOnboardName').value.trim()) {
    document.getElementById('creatorOnboardName').value = creatorName;
  }
  document.getElementById('creatorWelcomeStep').style.display = 'none';
  document.getElementById('entityCreationModeStep').style.display = 'block';
}

function closeNewEntityDialog() {
  const modal = document.getElementById('newEntityModal');
  modal.classList.remove('open');
  setTimeout(() => modal.style.display = 'none', 200);
  
  // Reset all forms
  entityCreationMode = null;
  document.getElementById('emptyEntityName').value = '';
  document.getElementById('emptyEntityAge').value = '';
  document.getElementById('emptyEntityGender').value = 'male';
  document.getElementById('emptyEntityTraits').value = '';
  document.getElementById('emptyEntityIntro').value = '';
  document.getElementById('randomEntityGender').value = 'random';
  document.getElementById('creatorUserName').value = '';
  document.getElementById('creatorOnboardName').value = '';
  document.getElementById('creatorOnboardInterests').value = '';
  document.getElementById('creatorOnboardOccupation').value = '';
  document.getElementById('creatorOnboardIntent').value = '';
  document.getElementById('guidedEntityName').value = '';
  document.getElementById('guidedEntityGender').value = 'male';
  document.getElementById('guidedEntityAge').value = '';
  document.getElementById('guidedEntityTraits').value = '';
  document.getElementById('guidedEntityBackstory').value = '';
  document.getElementById('guidedEntityIntent').value = 'programming';
  document.getElementById('guidedEntityInteractionStyle').value = 'balanced';
  document.getElementById('guidedEntityStyle').value = '';
  document.getElementById('guidedEntityKnowledgeSeed').value = '';
  document.getElementById('guidedEntityIntro').value = '';
  document.getElementById('guidedEntityUnbreakable').checked = false;
}

function selectEntityMode(mode) {
  entityCreationMode = mode;
  
  // Hide mode selection
  document.getElementById('entityCreationModeStep').style.display = 'none';
  document.getElementById('creatorOnboardingBlock').style.display = 'block';
  
  // Show appropriate form
  if (mode === 'empty') {
    document.getElementById('entityEmptyFormStep').style.display = 'block';
    document.getElementById('createEntityBtn').style.display = 'inline-flex';
    document.getElementById('createEntityBtn').textContent = 'Create Empty Entity';
  } else if (mode === 'random') {
    document.getElementById('entityRandomFormStep').style.display = 'block';
    document.getElementById('createEntityBtn').style.display = 'inline-flex';
    document.getElementById('createEntityBtn').textContent = 'Generate Random Entity';
  } else if (mode === 'guided') {
    document.getElementById('entityGuidedFormStep').style.display = 'block';
    document.getElementById('createEntityBtn').style.display = 'inline-flex';
    document.getElementById('createEntityBtn').textContent = 'Generate Guided Entity';
  } else if (mode === 'character') {
    document.getElementById('entityCharacterFormStep').style.display = 'block';
    document.getElementById('createEntityBtn').style.display = 'inline-flex';
    document.getElementById('createEntityBtn').textContent = 'Ingest Character';
  }
}

function backToModeSelection() {
  document.getElementById('creatorWelcomeStep').style.display = 'none';
  document.getElementById('entityCreationModeStep').style.display = 'block';
  document.getElementById('entityEmptyFormStep').style.display = 'none';
  document.getElementById('entityRandomFormStep').style.display = 'none';
  document.getElementById('entityGuidedFormStep').style.display = 'none';
  document.getElementById('entityCharacterFormStep').style.display = 'none';
  document.getElementById('creatorOnboardingBlock').style.display = 'none';
  document.getElementById('createEntityBtn').style.display = 'none';
  entityCreationMode = null;
}

function getCreatorOnboardingPayload() {
  const preferredName = document.getElementById('creatorOnboardName').value.trim();
  const interests = document.getElementById('creatorOnboardInterests').value.trim();
  const occupation = document.getElementById('creatorOnboardOccupation').value.trim();
  const intent = document.getElementById('creatorOnboardIntent').value.trim();
  return {
    preferredName,
    interests,
    occupation,
    intent,
    hasSeedInput: Boolean(preferredName || interests || occupation || intent)
  };
}

async function applyCreatorOnboarding(entityId) {
  if (!creatorOnboardingPayload) return;
  if (!creatorOnboardingPayload.hasSeedInput) {
    lg('info', 'Creator onboarding skipped — entity will ask onboarding questions in chat.');
    return;
  }

  const preferredName = String(creatorOnboardingPayload.preferredName || '').trim();

  try {
    await fetch('/api/entities/onboarding-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityId,
        preferredName,
        interests: String(creatorOnboardingPayload.interests || '').trim(),
        occupation: String(creatorOnboardingPayload.occupation || '').trim(),
        intent: String(creatorOnboardingPayload.intent || '').trim()
      })
    });
    lg('ok', 'Creator onboarding seeded for the new entity');
  } catch (err) {
    lg('warn', 'Creator onboarding seed failed: ' + err.message);
  }
}

function toggleTestHatch() {
  const checkbox = document.getElementById('newEntityUseHatch');
  const nameField = document.getElementById('newEntityName');
  const autoGenNote = document.getElementById('autoGenNote');
  
  checkbox.checked = !checkbox.checked;
  
  // When test hatch is enabled, disable the name field and show the auto-generated note
  if (checkbox.checked) {
    nameField.disabled = true;
    nameField.value = '';
    nameField.style.opacity = '0.6';
    nameField.style.cursor = 'not-allowed';
    autoGenNote.style.display = 'inline';
  } else {
    nameField.disabled = false;
    nameField.style.opacity = '1';
    nameField.style.cursor = 'auto';
    autoGenNote.style.display = 'none';
  }
}

function showHatchProgress() {
  const modal = document.getElementById('hatchProgressModal');
  modal.style.display = 'flex';
  modal.classList.add('open');
}

function closeHatchProgress() {
  const modal = document.getElementById('hatchProgressModal');
  modal.classList.remove('open');
  setTimeout(() => modal.style.display = 'none', 200);
}

function updateHatchStep(stepIndex, status) {
  // status: 'pending', 'active', 'complete'
  const stepsContainer = document.getElementById('hatchProgressSteps');
  const steps = stepsContainer.querySelectorAll('.hatch-step');
  if (steps[stepIndex]) {
    steps[stepIndex].classList.remove('pending', 'active', 'complete');
    steps[stepIndex].classList.add(status);
    
    // Update icon based on status
    const icon = steps[stepIndex].querySelector('.hatch-step-icon');
    if (status === 'active') {
      icon.textContent = '⏳';
    } else if (status === 'complete') {
      icon.textContent = '✓';
    }
  }
}

async function executeEntityCreation() {
  if (!entityCreationMode) {
    lg('err', 'No entity creation mode selected');
    return;
  }

  creatorOnboardingPayload = getCreatorOnboardingPayload();
  
  try {
    if (entityCreationMode === 'empty') {
      await createEmptyEntity();
    } else if (entityCreationMode === 'random') {
      await createRandomEntity();
    } else if (entityCreationMode === 'guided') {
      await createGuidedEntity();
    } else if (entityCreationMode === 'character') {
      await createCharacterEntity();
    }
  } catch (err) {
    lg('err', 'Entity creation failed: ' + err.message);
  }
}

async function createEmptyEntity() {
  const name = document.getElementById('emptyEntityName').value.trim();
  const gender = document.getElementById('emptyEntityGender').value;
  const age = document.getElementById('emptyEntityAge').value.trim();
  const traitsStr = document.getElementById('emptyEntityTraits').value.trim();
  const intro = document.getElementById('emptyEntityIntro').value.trim();
  
  // Validation
  if (!name) {
    lg('err', 'Entity name is required');
    return;
  }
  
  if (!traitsStr) {
    lg('err', 'At least 3 personality traits are required');
    return;
  }
  
  const traits = traitsStr.split(',').map(t => t.trim()).filter(t => t);
  if (traits.length < 3) {
    lg('err', 'Please provide at least 3 personality traits');
    return;
  }
  
  lg('info', `Creating empty entity: ${name}...`);
  
  const entityId = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  const resp = await fetch('/api/entities/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      entityId, 
      name, 
      gender, 
      traits, 
      introduction: intro || `Hello, I'm ${name}.`,
      age
    })
  });
  
  if (!resp.ok) throw new Error('Failed to create entity');
  const data = await resp.json();
  
  closeNewEntityDialog();
  
  // Update display
  updateEntityDisplay(data.entity);
  document.getElementById('entityName').textContent = ' — ' + data.entity.name;
  document.getElementById('entityTraits').textContent = traits.join(', ');
  document.getElementById('deleteEntityBtn').style.display = 'inline-block';
  
  currentEntityId = data.entityId;
  resetChatForEntitySwitch(data.entity.name, data.entity.introduction, 0);
  await applyCreatorOnboarding(data.entityId);
  
  lg('ok', `Created empty entity: ${name}. Start chatting to build their memories!`);
  addChatBubble('system', `✨ ${name} has been created! This is an empty entity with no history. Their memories will be formed through your conversations together.`);
  refreshSidebarEntities();
}

async function createRandomEntity() {
  const gender = document.getElementById('randomEntityGender').value;
  
  lg('info', 'Generating random entity with life story...');
  
  // Show progress modal
  showHatchProgress();
  closeNewEntityDialog();
  
  // Update step statuses as we go
  updateHatchStep(0, 'active');
  await new Promise(r => setTimeout(r, 300));
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout for LLM generation
  
  try {
    const resp = await fetch('/api/entities/create-hatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender: gender === 'random' ? undefined : gender }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to generate entity');
    }
    
    // Mark steps complete as generation finishes
    updateHatchStep(0, 'complete');
    updateHatchStep(1, 'complete');
    updateHatchStep(2, 'complete');
    updateHatchStep(3, 'complete');
    updateHatchStep(4, 'active');
    
    const data = await resp.json();
    
    updateHatchStep(4, 'complete');
    await new Promise(r => setTimeout(r, 500));
    closeHatchProgress();
    
    // Update display
    updateEntityDisplay(data.entity);
    document.getElementById('entityName').textContent = ' — ' + data.entity.name;
    document.getElementById('entityTraits').textContent = (data.entity.personality_traits || []).join(', ');
    document.getElementById('deleteEntityBtn').style.display = 'inline-block';
    
    currentEntityId = data.entityId;
    resetChatForEntitySwitch(data.entity.name, data.entity.introduction, data.entity.memory_count || 0);
    await applyCreatorOnboarding(data.entityId);
    
    // Load subconscious introduction message
    if (data.subconsciousIntro) {
      setTimeout(() => {
        const chatMessages = document.getElementById('chatMessages');
        const emptyState = chatMessages.querySelector('.chat-empty');
        if (emptyState) emptyState.remove();
        
        addChatBubble('system', data.subconsciousIntro);
        lg('info', `${data.entity.name} has awakened with their life story and memories`);
      }, 300);
    }
    
    lg('ok', `Generated random entity: ${data.entity.name}`);
    refreshSidebarEntities();
  } catch (err) {
    closeHatchProgress();
    if (err.name === 'AbortError') {
      throw new Error('Entity generation timed out. Please try again.');
    }
    throw err;
  }
}

async function createCharacterEntity() {
  const name = document.getElementById('charEntityName').value.trim();
  const source = document.getElementById('charEntitySource').value.trim();
  const notes = document.getElementById('charEntityNotes').value.trim();

  if (!name) { lg('err', 'Character name is required'); return; }
  if (!source) { lg('err', 'Source / origin is required (book, movie, real person, etc.)'); return; }

  lg('info', 'Running character ingestion pipeline for: ' + name + ' (' + source + ')...');

  showHatchProgress();
  closeNewEntityDialog();

  updateHatchStep(0, 'active');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  try {
    const resp = await fetch('/api/entities/create-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, source, notes }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || 'Character ingestion failed');
    }

    updateHatchStep(0, 'complete');
    updateHatchStep(1, 'complete');
    updateHatchStep(2, 'complete');
    updateHatchStep(3, 'complete');
    updateHatchStep(4, 'active');

    const data = await resp.json();

    updateHatchStep(4, 'complete');
    await new Promise(r => setTimeout(r, 500));
    closeHatchProgress();

    updateEntityDisplay(data.entity);
    document.getElementById('entityName').textContent = ' — ' + data.entity.name;
    document.getElementById('entityTraits').textContent = (data.entity.personality_traits || []).join(', ');
    document.getElementById('deleteEntityBtn').style.display = 'inline-block';

    currentEntityId = data.entityId;
    resetChatForEntitySwitch(data.entity.name, data.entity.introduction, data.entity.memory_count || 0);
    await applyCreatorOnboarding(data.entityId);

    if (data.subconsciousIntro) {
      setTimeout(() => {
        const chatMessages = document.getElementById('chatMessages');
        const emptyState = chatMessages.querySelector('.chat-empty');
        if (emptyState) emptyState.remove();
        addChatBubble('system', data.subconsciousIntro);
        lg('info', name + ' has been ingested and awakened with seeded memories');
      }, 300);
    }

    lg('ok', 'Character ingestion complete: ' + data.entity.name + ' (' + (data.entity.memory_count || 0) + ' memories seeded)');
    refreshSidebarEntities();
  } catch (err) {
    closeHatchProgress();
    if (err.name === 'AbortError') {
      throw new Error('Character ingestion timed out. Please try again.');
    }
    throw err;
  }
}

async function createGuidedEntity() {
  const name = document.getElementById('guidedEntityName').value.trim();
  const gender = document.getElementById('guidedEntityGender').value;
  const age = document.getElementById('guidedEntityAge').value.trim();
  const traitsStr = document.getElementById('guidedEntityTraits').value.trim();
  const backstory = document.getElementById('guidedEntityBackstory').value.trim();
  const intent = document.getElementById('guidedEntityIntent').value;
  const interactionStyle = document.getElementById('guidedEntityInteractionStyle').value;
  const style = document.getElementById('guidedEntityStyle').value.trim();
  const knowledgeSeed = document.getElementById('guidedEntityKnowledgeSeed').value.trim();
  const intro = document.getElementById('guidedEntityIntro').value.trim();
  const unbreakable = document.getElementById('guidedEntityUnbreakable').checked;

  if (!name) { lg('err', 'Entity name is required'); return; }
  if (!traitsStr) { lg('err', 'At least 3 personality traits are required'); return; }
  if (!backstory && !knowledgeSeed) {
    lg('err', 'Provide either a backstory or knowledge seed notes for guided creation');
    return;
  }

  const traits = traitsStr.split(',').map(t => t.trim()).filter(t => t);
  if (traits.length < 3) { lg('err', 'Please provide at least 3 personality traits'); return; }

  lg('info', 'Generating guided entity: ' + name + ' (' + intent + ')...');

  showHatchProgress();
  closeNewEntityDialog();

  updateHatchStep(0, 'active');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const resp = await fetch('/api/entities/create-guided', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        gender,
        age,
        traits,
        backstory,
        intent,
        interactionStyle,
        style,
        knowledgeSeed,
        introduction: intro,
        unbreakable
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || 'Guided entity creation failed');
    }

    updateHatchStep(0, 'complete');
    updateHatchStep(1, 'complete');
    updateHatchStep(2, 'complete');
    updateHatchStep(3, 'complete');
    updateHatchStep(4, 'active');

    const data = await resp.json();

    updateHatchStep(4, 'complete');

    // ── Knowledge seed: run through the full document ingest pipeline ──
    let seedChunkCount = 0;
    if (knowledgeSeed && data.hasSeed) {
      try {
        const seedChunks = chunkDocument(knowledgeSeed, name + ' - Knowledge Seed');
        if (seedChunks.length > 0) {
          const seedStep = document.getElementById('hatchStepSeed');
          if (seedStep) seedStep.style.display = '';
          updateHatchStep(5, 'active');
          let prevChunkId = null;
          for (let i = 0; i < seedChunks.length; i++) {
            const chunk = seedChunks[i];
            try {
              const seedResp = await fetch('/api/document/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: chunk.content,
                  filename: chunk.filename,
                  chunkIndex: chunk.index,
                  totalChunks: chunk.totalChunks,
                  previousChunkId: prevChunkId
                })
              });
              if (seedResp.ok) {
                const seedData = await seedResp.json();
                prevChunkId = seedData.chunkId || null;
                seedChunkCount++;
              }
            } catch (_) {}
            await new Promise(r => setTimeout(r, 80));
          }
          updateHatchStep(5, 'complete');
          lg('ok', `Knowledge seed ingested: ${seedChunkCount}/${seedChunks.length} chunks via document pipeline`);
        }
      } catch (seedErr) {
        lg('warn', 'Knowledge seed ingestion partial or failed: ' + seedErr.message);
      }
    }

    await new Promise(r => setTimeout(r, 500));
    closeHatchProgress();

    updateEntityDisplay(data.entity);
    document.getElementById('entityName').textContent = ' — ' + data.entity.name;
    document.getElementById('entityTraits').textContent = (data.entity.personality_traits || []).join(', ');
    document.getElementById('deleteEntityBtn').style.display = 'inline-block';

    currentEntityId = data.entityId;
    resetChatForEntitySwitch(data.entity.name, data.entity.introduction, (data.entity.memory_count || 0) + seedChunkCount);
    await applyCreatorOnboarding(data.entityId);

    if (data.subconsciousIntro) {
      setTimeout(() => {
        const chatMessages = document.getElementById('chatMessages');
        const emptyState = chatMessages.querySelector('.chat-empty');
        if (emptyState) emptyState.remove();
        const seedNote = seedChunkCount > 0 ? `\n\nKnowledge seed: ${seedChunkCount} document chunks ingested.` : '';
        addChatBubble('system', data.subconsciousIntro + seedNote);
        lg('info', name + ' has awakened with their guided life story and memories');
      }, 300);
    }

    lg('ok', 'Generated guided entity: ' + data.entity.name);
    refreshSidebarEntities();
  } catch (err) {
    closeHatchProgress();
    if (err.name === 'AbortError') {
      throw new Error('Guided entity generation timed out. Please try again.');
    }
    throw err;
  }
}

async function createNewEntity() {
  // Legacy function - redirects to new flow
  showNewEntityDialog();
}

// ====================================
// User Name Collection
// ====================================

async function checkAndPromptUserName() {
  try {
    // If entity already has user profiles, the new user switcher handles identity — skip old modal
    if (currentEntityId) {
      const usersResp = await fetch('/api/users');
      if (usersResp.ok) {
        const usersData = await usersResp.json();
        if (usersData.ok && Array.isArray(usersData.users) && usersData.users.length > 0) {
          return false;
        }
      }
    }

    const resp = await fetch('/api/persona');
    if (!resp.ok) return;
    
    const data = await resp.json();
    const persona = data.persona;
    
    // If no persona or userName is still default 'User', prompt for name
    if (!persona || !persona.userName || persona.userName === 'User') {
      showUserNameModal();
      return true; // Indicates name prompt was shown
    }
    return false;
  } catch (err) {
    console.error('Failed to check user name:', err);
    return false;
  }
}

function showUserNameModal() {
  const modal = document.getElementById('userNameModal');
  modal.style.display = 'flex';
  modal.classList.add('open');
  
  // Focus on input
  setTimeout(() => {
    const input = document.getElementById('userNameInput');
    input.focus();
    
    // Allow Enter key to submit
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveUserName();
      }
    };
  }, 300);
}

function closeUserNameModal() {
  const modal = document.getElementById('userNameModal');
  modal.classList.remove('open');
  setTimeout(() => modal.style.display = 'none', 200);
  document.getElementById('userNameInput').value = '';
}

async function saveUserName() {
  const input = document.getElementById('userNameInput');
  const name = input.value.trim();
  
  if (!name) {
    lg('err', 'Please enter your name');
    return;
  }
  
  try {
    // Get current persona
    const getResp = await fetch('/api/persona');
    let persona = { userName: 'User' };
    if (getResp.ok) {
      const getData = await getResp.json();
      if (getData.persona) persona = getData.persona;
    }
    
    // Update userName
    persona.userName = name;
    persona.userIdentity = persona.userIdentity || `I am chatting with ${name}`;
    
    // Save persona
    const saveResp = await fetch('/api/persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(persona)
    });
    
    if (!saveResp.ok) throw new Error('Failed to save persona');
    
    closeUserNameModal();
    lg('ok', `Nice to meet you, ${name}!`);
    addChatBubble('system', `✨ Got it! I'll remember you as ${name} from now on.`);
  } catch (err) {
    lg('err', 'Failed to save name: ' + err.message);
  }
}

function skipUserName() {
  closeUserNameModal();
  lg('info', 'You can set your name later in settings');
}

async function deleteCurrentEntity() {
  const name = document.getElementById('entityName').textContent.replace(' — ', '').trim();
  if (!name || !confirm('Delete entity "' + name + '"? This cannot be undone.')) return;
  
  try {
    // Extract entity ID from the current loaded entity via API
    const currentResp = await fetch('/api/entities/current');
    const currentData = await currentResp.json();
    if (!currentData.loaded || !currentData.entity.id) throw new Error('No entity loaded');
    const entityId = currentData.entity.id;
    
    const resp = await fetch('/api/entities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    
    if (!resp.ok) throw new Error('Failed to delete entity');
    
    // Reset display
    document.getElementById('entityDisplay').classList.remove('loaded');
    document.getElementById('entityDisplay').innerHTML = `
      <div style="color:var(--td);text-align:center;padding:2rem">
        <div>No entity loaded</div>
        <div style="font-size:.85rem;margin-top:.5rem">Create a new one or load an existing entity below</div>
      </div>
    `;
    document.getElementById('entityName').textContent = '';
    document.getElementById('entityTraits').textContent = 'No entity loaded';
    document.getElementById('deleteEntityBtn').style.display = 'none';
    document.getElementById('entityList').style.display = 'none';
    currentEntityId = null;

    // Fully reset chat state so deleted entity is not kept in memory.
    if (typeof clearChat === 'function') clearChat();
    chatHistory = [];
    loadedArchives = [];
    contextStreamActive = false;
    subconsciousBootstrapped = false;
    
    lg('ok', 'Deleted entity: ' + name);

    // Force a clean app state after deletion.
    setTimeout(() => window.location.reload(), 120);
  } catch (e) {
    lg('err', 'Failed to delete entity: ' + e.message);
  }
}

// ============================================================
// SUBCONSCIOUS & DREAM CONFIG
// ============================================================

async function saveSubconsciousConfig() {
  let endpoint = document.getElementById('subApiEndpoint').value.trim();
  let key = document.getElementById('subApiKey').value.trim();
  const model = document.getElementById('subModel').value.trim();

  // Inherit from Main Chat if endpoint/key are empty
  if (!endpoint) endpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  if (!key)      key      = document.getElementById('apikeyKey-main')?.value?.trim() || '';

  if (!endpoint || !key || !model) {
    lg('err', 'Model is required (endpoint & key inherited from Main Chat if empty)');
    return;
  }
  
  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'subconscious',
        config: {
          endpoint,
          key,
          model,
          ollamaUrl: document.getElementById('ollamaUrl-subconscious').value.trim(),
          ollamaModel: document.getElementById('ollamaModel-subconscious').value.trim()
        }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    const statusEl = document.getElementById('subConfigStatus');
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
    lg('ok', 'Subconscious global config saved');
  } catch (e) {
    lg('err', 'Failed to save subconscious config: ' + e.message);
  }
}
async function saveDreamConfig() {
  let endpoint = document.getElementById('dreamApiEndpoint').value.trim();
  let key = document.getElementById('dreamApiKey').value.trim();
  const model = document.getElementById('dreamModel').value.trim();

  // Inherit from Main Chat if endpoint/key are empty
  if (!endpoint) endpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  if (!key)      key      = document.getElementById('apikeyKey-main')?.value?.trim() || '';

  if (!endpoint || !key || !model) {
    lg('err', 'Model is required (endpoint & key inherited from Main Chat if empty)');
    return;
  }
  
  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'dream',
        config: {
          endpoint,
          key,
          model,
          ollamaUrl: document.getElementById('ollamaUrl-dreams').value.trim(),
          ollamaModel: document.getElementById('ollamaModel-dreams').value.trim()
        }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    const statusEl = document.getElementById('dreamConfigStatus');
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
    lg('ok', 'Dream engine global config saved');
  } catch (e) {
    lg('err', 'Failed to save dream config: ' + e.message);
  }
}

async function saveOrchestratorConfig() {
  let endpoint = document.getElementById('orchApiEndpoint').value.trim();
  let key = document.getElementById('orchApiKey').value.trim();
  const model = document.getElementById('orchModel').value.trim();

  // Inherit from Main Chat if endpoint/key are empty
  if (!endpoint) endpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  if (!key)      key      = document.getElementById('apikeyKey-main')?.value?.trim() || '';

  if (!endpoint || !key || !model) {
    lg('err', 'Model is required (endpoint & key inherited from Main Chat if empty)');
    return;
  }

  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'orchestrator',
        config: {
          endpoint,
          key,
          model,
          ollamaUrl: document.getElementById('ollamaUrl-orchestrator').value.trim(),
          ollamaModel: document.getElementById('ollamaModel-orchestrator').value.trim()
        }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    const statusEl = document.getElementById('orchConfigStatus');
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
    lg('ok', 'Orchestrator global config saved');
  } catch (e) {
    lg('err', 'Failed to save orchestrator config: ' + e.message);
  }
}

// Save main provider config (example for API Key panel)
async function saveMainProviderConfig() {
  const endpoint = document.getElementById('apikeyEndpoint-main').value.trim();
  const key = document.getElementById('apikeyKey-main').value.trim();
  const model = document.getElementById('apikeyModel-main').value.trim();
  const ollamaUrl = document.getElementById('ollamaUrl-main').value.trim();
  const ollamaModel = document.getElementById('ollamaModel-main').value.trim();
  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'main',
        config: { endpoint, key, model, ollamaUrl, ollamaModel }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    lg('ok', 'Main provider global config saved');
  } catch (e) {
    lg('err', 'Failed to save main provider config: ' + e.message);
  }
}

/* ── Unified Save All LLM Config ── */
async function saveAllLLMConfig() {
  const mainKey      = document.getElementById('apikeyKey-main')?.value?.trim() || '';
  const mainEndpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';

  // If sub/dream/orch key or endpoint is empty, inherit from main
  for (const [keyId, epId] of [
    ['subApiKey',   'subApiEndpoint'],
    ['dreamApiKey', 'dreamApiEndpoint'],
    ['orchApiKey',  'orchApiEndpoint']
  ]) {
    const kEl = document.getElementById(keyId);
    const eEl = document.getElementById(epId);
    if (kEl && !kEl.value.trim() && mainKey)      kEl.value = mainKey;
    if (eEl && !eEl.value.trim() && mainEndpoint)  eEl.value = mainEndpoint;
  }

  const statusEl = document.getElementById('allLlmConfigStatus');
  try {
    await saveMainProviderConfig();
    await saveSubconsciousConfig();
    await saveDreamConfig();
    await saveOrchestratorConfig();
    if (statusEl) { statusEl.style.display = 'inline'; setTimeout(() => statusEl.style.display = 'none', 4000); }
    lg('ok', 'All LLM configs saved');
  } catch (e) {
    lg('err', 'Error saving LLM configs: ' + e.message);
  }
}

// ============================================================
// SYSTEM HEALTH & MAINTENANCE
// ============================================================

async function repairMemoryLogs() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Repairing...';
  
  const statusEl = document.getElementById('healStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Running self-heal...';
  
  try {
    const resp = await fetch('/api/entities/heal', { method: 'POST' });
    if (!resp.ok) throw new Error('Failed to run memory heal');
    
    const data = await resp.json();
    statusEl.innerHTML = `
      ✓ Repair complete<br>
      Repaired: ${data.repaired} files<br>
      Errors: ${data.errors}
    `;
    lg('ok', 'Memory self-heal: ' + data.repaired + ' repaired');
  } catch (e) {
    statusEl.innerHTML = '✗ ' + e.message;
    lg('err', 'Memory heal failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Self-Heal';
  }
}

async function showMemoryStats() {
  try {
    const resp = await fetch('/api/memory-stats');
    if (!resp.ok) throw new Error('Failed to fetch stats');
    const stats = await resp.json();
    
    addChatBubble('system', 'Memory Statistics:\n\n' +
      '📊 Total memories: ' + stats.totalMemories + '\n' +
      '💾 Storage size: ' + formatBytes(stats.storageSize) + '\n' +
      '📂 Memory logs: ' + stats.memoryLogs + '\n' +
      '✓ Healthy logs: ' + stats.healthyLogs + '\n' +
      '⚠ Corrupted logs: ' + stats.corruptedLogs);
  } catch (e) {
    lg('err', 'Failed to fetch memory stats: ' + e.message);
  }
}

async function rebuildTraceGraph() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Rebuilding...';
  
  try {
    const resp = await fetch('/api/trace-rebuild', { method: 'POST' });
    if (!resp.ok) throw new Error('Failed to rebuild');
    
    const data = await resp.json();
    addChatBubble('system', 'Trace graph rebuilt:\n' +
      '🔗 Connections: ' + data.connections + '\n' +
      '✓ Complete');
    lg('ok', 'Trace graph rebuilt with ' + data.connections + ' connections');
  } catch (e) {
    lg('err', 'Failed to rebuild trace graph: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rebuild';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Entity display is handled by refreshSidebarEntities() on startup.
// No auto-load — user must preview and check out an entity first.

// Brain status polling (fallback — SSE handles real-time updates)
let brainPollHandle = null;
function startBrainPoll() {
  if (brainPollHandle) return;
  // Only poll infrequently as SSE provides real-time updates
  pollBrainStatus();
  brainPollHandle = setInterval(pollBrainStatus, 60000); // Every 60s as fallback
}
async function pollBrainStatus() {
  try {
    const resp = await fetch('/api/brain/status');
    if (!resp.ok) return;
    const data = await resp.json();
    const el = document.getElementById('brainStatus');
    const label = document.getElementById('brainLabel');
    if (data.running) {
      el.classList.add('active');
      label.textContent = 'Cycle ' + data.cycleCount;
    } else {
      el.classList.remove('active');
      label.textContent = 'Idle';
    }
    if (typeof updateDeepSleepBadge === 'function') {
      updateDeepSleepBadge(data.cyclesUntilDeepSleep);
    }
  } catch (e) { /* ignore */ }
}

// Startup is triggered from DOMContentLoaded handler above.

// ============================================================
// USER SWITCHER — Multi-user management per entity
// ============================================================

let _userPanelOpen = false;
let _userPanelOutsideHandler = null;

function toggleUserPanel() {
  if (_userPanelOpen) closeUserPanel();
  else openUserPanel();
}

async function openUserPanel() {
  const panel = document.getElementById('userPanel');
  const btn = document.getElementById('userSwitcherBtn');
  if (!panel || !btn) return;
  // Portal: move panel to document.body so it escapes overflow:hidden ancestors
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  const rect = btn.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.top = (rect.bottom + 6) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';
  panel.style.left = 'auto';
  panel.style.display = 'block';
  _userPanelOpen = true;
  await renderUserPanelList();
  if (_userPanelOutsideHandler) document.removeEventListener('mousedown', _userPanelOutsideHandler);
  _userPanelOutsideHandler = (e) => {
    const p = document.getElementById('userPanel');
    const b = document.getElementById('userSwitcherBtn');
    if (p && !p.contains(e.target) && b && !b.contains(e.target)) closeUserPanel();
  };
  setTimeout(() => document.addEventListener('mousedown', _userPanelOutsideHandler), 50);
}

function closeUserPanel() {
  const panel = document.getElementById('userPanel');
  if (panel) panel.style.display = 'none';
  _userPanelOpen = false;
  if (_userPanelOutsideHandler) {
    document.removeEventListener('mousedown', _userPanelOutsideHandler);
    _userPanelOutsideHandler = null;
  }
}

const _FEELING_EMOJI = {
  loathing:'😤', hate:'😡', dislike:'😒', cold:'🧊', wary:'😑',
  neutral:'😶', indifferent:'🫥', warm:'🙂', like:'😊', fond:'🥰',
  care:'💚', trust:'🤝', love:'❤️', devoted:'💜'
};

function _trustBar(trust) {
  const filled = Math.round((trust || 0) * 5);
  const bar = '█'.repeat(filled) + '░'.repeat(5 - filled);
  const pct = Math.round((trust || 0) * 100);
  const col = trust < 0.3 ? '#ef4444' : trust < 0.6 ? '#f59e0b' : '#10b981';
  return '<span title="Trust ' + pct + '%" style="font-family:monospace;font-size:.6rem;color:' + col + ';letter-spacing:-.5px">' + bar + '</span>';
}

async function renderUserPanelList() {
  const list = document.getElementById('userPanelList');
  if (!list) return;
  try {
    const [usersResp, relResp] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/relationships').catch(() => null)
    ]);
    if (!usersResp.ok) throw new Error('Failed to load users');
    const data = await usersResp.json();
    const users = data.users || [];
    const activeId = data.activeUserId;

    // Build relationship map userId -> rel
    const relMap = {};
    if (relResp && relResp.ok) {
      const relData = await relResp.json().catch(() => ({}));
      (relData.relationships || []).forEach(r => { relMap[r.userId] = r; });
    }

    if (users.length === 0) {
      list.innerHTML = '<div style="color:var(--text-tertiary);font-size:.75rem;text-align:center;padding:8px 0">No users yet — add one below</div>';
      return;
    }
    list.innerHTML = '';
    users.forEach(u => {
      const isActive = u.id === activeId;
      const rel = relMap[u.id];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:5px;margin-bottom:2px;' + (isActive ? 'background:rgba(255,255,255,.05)' : '');
      const safeName = escapeHtmlInner(u.name || 'User');
      const safeInfo = u.info ? escapeHtmlInner(u.info) : '';

      // Relationship badge: only show if entity has met this user
      let relBadge = '';
      if (rel && rel.interactionCount > 0) {
        const emoji = _FEELING_EMOJI[rel.feeling] || '😶';
        relBadge =
          '<div title="Feeling: ' + escapeHtmlInner(rel.feeling || 'neutral') + '\nInteractions: ' + (rel.interactionCount || 0) + '" ' +
            'style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;gap:1px;cursor:default">' +
            '<span style="font-size:.85rem;line-height:1">' + emoji + '</span>' +
            _trustBar(rel.trust) +
          '</div>';
      }

      row.innerHTML =
        '<div style="width:26px;height:26px;border-radius:50%;background:#6d28d9;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:600;flex-shrink:0;color:#fff">' +
          safeName[0].toUpperCase() +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:.78rem;font-weight:' + (isActive ? '600' : '400') + ';color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            safeName + (isActive ? ' <span style="color:#10b981;font-size:.6rem;font-weight:400">● active</span>' : '') +
          '</div>' +
          (safeInfo ? '<div style="font-size:.65rem;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + safeInfo + '</div>' : '') +
        '</div>' +
        relBadge +
        (isActive
          ? '<button onclick="clearUserSwitch()" title="Clear active user" style="background:none;border:1px solid var(--border-default);color:var(--text-tertiary);font-size:.62rem;border-radius:3px;cursor:pointer;padding:2px 5px;flex-shrink:0">✕ clear</button>'
          : '<button onclick="switchToUser(\'' + u.id + '\')" style="background:#3b82f6;border:none;color:#fff;font-size:.65rem;border-radius:3px;cursor:pointer;padding:2px 6px;flex-shrink:0">Switch</button>');
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = '<div style="color:var(--dn);font-size:.75rem;padding:4px">' + err.message + '</div>';
  }
}

async function switchToUser(userId) {
  try {
    const resp = await fetch('/api/users/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!resp.ok) throw new Error('Failed to switch user');
    const data = await resp.json();
    const name = data.user ? data.user.name : userId;
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = name;
    await renderUserPanelList();
    lg('ok', 'Switched to: ' + name);
  } catch (err) {
    lg('err', 'Switch failed: ' + err.message);
  }
}

async function clearUserSwitch() {
  try {
    await fetch('/api/users/active', { method: 'DELETE' });
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = (typeof getUsername === 'function' && getUsername()) || 'User';
    await renderUserPanelList();
    lg('info', 'Active user cleared');
  } catch (err) {
    lg('err', 'Clear failed: ' + err.message);
  }
}

async function addAndSwitchUser() {
  const nameEl = document.getElementById('newUserName');
  const infoEl = document.getElementById('newUserInfo');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { lg('err', 'Enter a name for the new user'); return; }
  const info = infoEl ? infoEl.value.trim() : '';
  try {
    const createResp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, info })
    });
    if (!createResp.ok) throw new Error('Failed to create user');
    const created = await createResp.json();
    const userId = created.user && created.user.id;
    if (!userId) throw new Error('No user id returned');

    const switchResp = await fetch('/api/users/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!switchResp.ok) throw new Error('Failed to set active user');

    if (nameEl) nameEl.value = '';
    if (infoEl) infoEl.value = '';
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = name;
    await renderUserPanelList();
    lg('ok', 'Added and switched to: ' + name);
    if (typeof addChatBubble === 'function') addChatBubble('system', '\u{1F464} Chatting as ' + name);
  } catch (err) {
    lg('err', 'Add user failed: ' + err.message);
  }
}

async function initUserSwitcher() {
  const btn = document.getElementById('userSwitcherBtn');
  if (!btn) return;
  try {
    // If no user profiles exist yet and we have a registered display name, auto-create one
    const listResp = await fetch('/api/users');
    if (listResp.ok) {
      const listData = await listResp.json();
      const displayName = (typeof getDisplayName === 'function' && getDisplayName()) || '';
      if (listData.users && listData.users.length === 0 && displayName) {
        const info = (typeof getAccountInfo === 'function' && getAccountInfo()) || '';
        const createResp = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: displayName, info })
        });
        if (createResp.ok) {
          const created = await createResp.json();
          if (created.ok && created.user) {
            await fetch('/api/users/active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: created.user.id })
            });
          }
        }
      }
    }

    const resp = await fetch('/api/users/active');
    if (resp.ok) {
      const data = await resp.json();
      const label = document.getElementById('activeUserLabel');
      if (data.user && data.user.name) {
        if (label) label.textContent = data.user.name;
      } else {
        if (label) label.textContent = (typeof getDisplayName === 'function' && getDisplayName()) || (typeof getUsername === 'function' && getUsername()) || 'User';
      }
    }
  } catch (_) {}
  btn.style.display = 'inline-flex';
}

function resetUserSwitcher() {
  const btn = document.getElementById('userSwitcherBtn');
  if (btn) btn.style.display = 'none';
  const label = document.getElementById('activeUserLabel');
  if (label) label.textContent = 'User';
  closeUserPanel();
}


