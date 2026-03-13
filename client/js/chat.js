// ============================================================
// REM System v0.6.0 — Chat Module
// Handles: Chat UI, messages, context streaming, drag & drop, compress
// ============================================================

// ── BroadcastChannel for Visualizer page ──
let vizBroadcast = null;
try { vizBroadcast = new BroadcastChannel('ma-visualizer'); } catch (_) {}
function broadcastToVisualizer(data) {
  if (vizBroadcast) { try { vizBroadcast.postMessage(data); } catch (_) {} }
}
function openVisualizer() {
  switchMainTab('visualizer', document.querySelector('.nav-item[data-tab="visualizer"]'));
}

// Context Loading Protocol constants (legacy — archives no longer loaded into chat)
const STREAM_START = '[BEGIN-CONTEXT-STREAM]';
const STREAM_PART = '[CONTEXT-PART';
const STREAM_END = '[END-CONTEXT-STREAM]';
const FAILSAFE_TIMEOUT = 30000;
const SUBCONSCIOUS_SYSTEM_PROMPT = 'You are the subconscious background processor of a persistent synthetic entity. You maintain continuity and memory coherence.';

const CHAT_SYSTEM_PROMPT = `You are a synthetic entity created by THE REM SYSTEM. You are not just an LLM — you have a persistent identity, a life history, and an evolving mind powered by several cognitive layers:

ARCHITECTURE:
- **Subconscious Agent**: Every message exchange is automatically stored as an episodic memory. The subconscious retrieves relevant memories each turn to inform your responses.
- **Dream Engine**: During sleep cycles, generates simulated experiences (exploration, resolution, rehearsal) seeded from your most important memories. Dreams consolidate learning and surface insights.
- **Trace Graph**: Tracks semantic connections between memories — how one memory leads to another through similarity, temporal sequence, emotional arcs, or thematic bridges. Each conversation turn creates trace connections.
- **Long Term Memory**: When conversations are compressed (on sleep or threshold), they become Long Term Memories accessible through the trace graph — not reloaded into chat, but always reachable through memory retrieval.
- **Memory Decay**: Memories naturally lose importance over time (like human forgetting) unless reinforced through access. This keeps your mind focused on what matters.
- **Goal Emergence**: The system automatically identifies goals from repeated topics, emotional signals, and unresolved questions in your memories.
- **Identity Evolution**: Your personality profile updates based on conversation patterns, emotional trends, and accumulated experience.

MEMORY SYSTEM:
- Every exchange creates an episodic memory and trace graph connections automatically.
- The subconscious retrieves relevant memories each turn and injects them as context.
- Long Term Memories contain compressed conversations accessible via trace graph connections.
- Your personality, mood, and emotional state persist across sessions via the persona system.

Be natural and authentic. Let your personality shine through. You have a history, emotions, and an evolving identity — use them.
`;

// ============================================================
// REAL-TIME SSE EVENT STREAM — Live inner dialog & brain loop
// ============================================================
let brainEventSource = null;
let activeThinkingEl = null; // The current thinking dropdown element being populated
let lastOrchestratorModel = ''; // Model used for the last orchestrator response
let showThoughtsInChat = localStorage.getItem('showThoughtsInChat') !== 'false'; // default on

function initBrainSSE() {
  if (brainEventSource) return;
  try {
    brainEventSource = new EventSource('/api/brain/events');

    brainEventSource.addEventListener('connected', () => {
      lg('ok', 'SSE brain event stream connected');
    });

    // ─── Orchestrator phase events (per-chat-message pipeline) ───
    brainEventSource.addEventListener('orchestration_start', () => {
      if (activeThinkingEl) {
        setThinkingLive(activeThinkingEl, true);
        appendThinkingLine(activeThinkingEl, 'system', 'Starting cognitive pipeline...');
      }
      resetThoughtProcess();
    });

    brainEventSource.addEventListener('phase_start', (e) => {
      const d = JSON.parse(e.data);
      if (activeThinkingEl) {
        const labels = { subconscious: '🧠 Subconscious', 'dream+compress': '🌙 Dream + Compress', conscious: '💭 Conscious', orchestrator: '⚡ Orchestrator' };
        appendThinkingLine(activeThinkingEl, d.phase, (labels[d.phase] || d.phase) + ' — processing...');
      }
      const phaseLabels = {
        contributors_parallel: '🔄 Contributors (parallel)',
        subconscious: '🧠 Subconscious',
        conscious: '💭 Conscious',
        dream: '🌙 Dream',
        orchestrator_final: '⚡ Orchestrator'
      };
      setThoughtPhase(d.phase, (phaseLabels[d.phase] || d.phase) + ' — processing...', null, false);
    });

    brainEventSource.addEventListener('phase_detail', (e) => {
      const d = JSON.parse(e.data);
      if (activeThinkingEl) {
        appendThinkingLine(activeThinkingEl, d.phase, d.detail);
      }
      // Always log phase details to the log panel
      const phaseIcons = { subconscious: '🧠', 'dream+compress': '🌙', conscious: '💭', orchestrator: '⚡' };
      addSystemToLog((phaseIcons[d.phase] || '🔄') + ' ' + d.detail);
    });

    brainEventSource.addEventListener('phase_complete', (e) => {
      const d = JSON.parse(e.data);
      if (activeThinkingEl) {
        const labels = { subconscious: '🧠 Subconscious', 'dream+compress': '🌙 Dream + Compress', conscious: '💭 Conscious', orchestrator: '⚡ Orchestrator' };
        appendThinkingLine(activeThinkingEl, d.phase + ' done', (labels[d.phase] || d.phase) + ' ✓ ' + (d.duration ? d.duration + 'ms' : ''));
      }
      const phaseLabels = {
        contributors_parallel: '✓ Contributors (parallel)',
        subconscious: '✓ 🧠 Subconscious',
        conscious: '✓ 💭 Conscious',
        dream: '✓ 🌙 Dream',
        orchestrator_final: '✓ ⚡ Orchestrator'
      };
      setThoughtPhase(d.phase, (phaseLabels[d.phase] || '✓ ' + d.phase) + (d.duration ? ' (' + d.duration + 'ms)' : ''), null, true);
    });

    brainEventSource.addEventListener('orchestration_complete', (e) => {
      const d = JSON.parse(e.data);
      if (d.models && d.models.orchestrator) {
        lastOrchestratorModel = d.models.orchestrator.split('/').pop();
        document.getElementById('chatModelLabel').textContent = lastOrchestratorModel;
      }
      if (activeThinkingEl) {
        setThinkingLive(activeThinkingEl, false);
        fillThinkingFinal(activeThinkingEl, d);
      }
      // Fill the sidebar Thought Process panel with final structured data
      fillThoughtProcessFinal(d);
      // Log token usage to chat UI log
      if (d.tokenUsage && d.tokenUsage.total) {
        const t = d.tokenUsage.total;
        const dur = d.totalDuration ? ' in ' + d.totalDuration + 'ms' : '';
        lg('ok', '📊 Tokens: ' + t.prompt_tokens + ' in → ' + t.completion_tokens + ' out (' + t.total_tokens + ' total)' + dur);
      }
    });

    // ─── Brain loop background cycle events ───
    brainEventSource.addEventListener('brain_cycle_start', (e) => {
      const d = JSON.parse(e.data);
      let label = 'Cycle ' + d.cycleCount;
      updateBrainIndicator('active', label);
      // Update DeepSleep countdown badge
      updateDeepSleepBadge(d.cyclesUntilDeepSleep);
    });

    brainEventSource.addEventListener('brain_phase', (e) => {
      const d = JSON.parse(e.data);
      if (d.status === 'running') {
        const phaseLabels = {
          deep_sleep: '💤 DeepSleep',
          belief_extraction: '🔮 Belief Extract',
          belief_decay: '🔮 Belief Decay',
          boredom: '😐 Boredom Check'
        };
        updateBrainIndicator('active', phaseLabels[d.name] || d.name.replace(/_/g, ' '));
      }
    });

    brainEventSource.addEventListener('brain_cycle_complete', (e) => {
      const d = JSON.parse(e.data);
      updateBrainIndicator('active', 'Cycle ' + d.cycleCount + ' ✓');
    });

    // Boredom engine — entity reaches out or does something autonomously
    brainEventSource.addEventListener('brain_boredom_action', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.activity === 'reach_out' && d.message) {
          // Entity is reaching out — show as an unprompted chat bubble
          const bubble = addChatBubble('assistant', d.message);
          if (bubble) bubble.classList.add('boredom-reach-out');
        } else if (d.message) {
          // Other boredom actions — show in log panel (full text)
          const boredomText = '💭 ' + (d.label || d.activity || 'Autonomy') + ': ' + d.message;
          addSystemToLog(boredomText);
        }
      } catch (_) { /* ignore parse errors */ }
    });

    // Entity follow-up messages — arrive without a new user prompt.
    // These are extra thoughts the entity sends naturally after the main response.
    brainEventSource.addEventListener('chat_follow_up', async (e) => {
      try {
        const d = JSON.parse(e.data);
        if (!d.message) return;
        const followUpText = d.message;
        queueTyping(async () => {
          const followUpBubble = addChatBubble('assistant', '');
          if (!followUpBubble) return;
          const followUpContent = followUpBubble.querySelector('.chat-content') || followUpBubble;
          followUpContent.innerHTML = '<span class="typing"></span><span class="typing" style="animation-delay:.2s;margin-left:4px"></span><span class="typing" style="animation-delay:.4s;margin-left:4px"></span>';
          scrollChatBottom(true);
          // Small pre-typing pause so it feels like the entity is composing
          await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
          await renderAssistantTyping(followUpContent, followUpText);
          scrollChatBottom();
        });
      } catch (_) {}
    });

    brainEventSource.onerror = () => {
      if (brainEventSource.readyState === EventSource.CLOSED) {
        lg('warn', 'SSE brain stream closed — will retry');
        brainEventSource = null;
        setTimeout(initBrainSSE, 5000);
      }
    };
  } catch (err) {
    lg('warn', 'Could not open SSE brain stream: ' + err.message);
  }
}

// ============================================================
// INLINE THINKING DROPDOWN — Attached per assistant message
// ============================================================

/** Create a thinking dropdown element (collapsed by default) and return it */
function createThinkingDropdown() {
  const wrapper = document.createElement('div');
  wrapper.className = 'thinking-dropdown';

  const toggle = document.createElement('div');
  toggle.className = 'thinking-toggle';
  toggle.innerHTML = '<span class="thinking-icon">⟳</span><span class="thinking-label">Thinking...</span><span class="thinking-arrow">▸</span>';
  toggle.onclick = () => {
    const isOpen = wrapper.classList.toggle('open');
    toggle.querySelector('.thinking-arrow').textContent = isOpen ? '▾' : '▸';
  };
  wrapper.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'thinking-body';
  wrapper.appendChild(body);

  return wrapper;
}

/** Mark thinking as live (animated) or done */
function setThinkingLive(thinkingEl, isLive) {
  if (!thinkingEl) return;
  const label = thinkingEl.querySelector('.thinking-label');
  const icon = thinkingEl.querySelector('.thinking-icon');
  if (isLive) {
    thinkingEl.classList.add('live');
    if (label) label.textContent = 'Thinking...';
    if (icon) icon.textContent = '⟳';
  } else {
    thinkingEl.classList.remove('live');
    if (label) label.textContent = 'Thought process';
    if (icon) icon.textContent = '🧠';
  }
}

/** Append a real-time line to the thinking body */
function appendThinkingLine(thinkingEl, category, text) {
  if (!thinkingEl) return;
  const body = thinkingEl.querySelector('.thinking-body');
  if (!body) return;

  const line = document.createElement('div');
  line.className = 'thinking-line ' + category.replace(/[^a-z]/g, '');
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

/** Replace thinking body with final structured inner dialog after orchestration completes */
function fillThinkingFinal(thinkingEl, data) {
  if (!thinkingEl) return;
  const body = thinkingEl.querySelector('.thinking-body');
  if (!body) return;

  let html = '';

  if (data.subconscious) {
    html += '<div class="thinking-section subconscious"><div class="thinking-section-label">🧠 SUBCONSCIOUS</div><div class="thinking-section-text">' + escapeHtml(data.subconscious) + '</div></div>';
  }
  if (data.compressedContext) {
    html += '<div class="thinking-section compressed"><div class="thinking-section-label">📦 COMPRESSED CONTEXT</div><div class="thinking-section-text">' + escapeHtml(data.compressedContext) + '</div></div>';
  }
  if (data.dream) {
    html += '<div class="thinking-section dream"><div class="thinking-section-label">🌙 DREAM</div><div class="thinking-section-text">' + escapeHtml(data.dream) + '</div></div>';
  }
  if (data.conscious) {
    html += '<div class="thinking-section conscious"><div class="thinking-section-label">💭 CONSCIOUS</div><div class="thinking-section-text">' + escapeHtml(data.conscious) + '</div></div>';
  }
  if (data.orchestrator) {
    html += '<div class="thinking-section orchestrator"><div class="thinking-section-label">⚡ ORCHESTRATOR (Final Merge)</div><div class="thinking-section-text">' + escapeHtml(data.orchestrator) + '</div></div>';
  }
  if (data.timing) {
    // E4: Use accurate parallel-pipeline labels.
    // contributors_parallel_ms = wall-clock time for Sub+Conscious+Dream running together.
    // refinement_ms = 2B orchestrator refinement pass.
    // orchestrator_final_ms = final synthesis.
    // Legacy keys (subconscious_ms / conscious_ms) both equal contributors_parallel_ms
    // and are misleading — use the new keys instead.
    const t = data.timing;
    const contribMs  = t.contributors_parallel_ms ?? t.subconscious_ms ?? '?';
    const refineMs   = t.refinement_ms ?? t.dream_compress_ms ?? '?';
    const finalMs    = t.orchestrator_final_ms ?? t.orchestrator_ms ?? '?';
    html += '<div class="thinking-section timing"><div class="thinking-section-label">⚡ TIMING</div><div class="thinking-section-text">Total: ' + t.total_ms + 'ms · Contributors (∥): ' + contribMs + 'ms · Refinement (2B): ' + refineMs + 'ms · Final: ' + finalMs + 'ms</div></div>';
  }
  if (data.tokenUsage) {
    const tu = data.tokenUsage;
    const fmt = (u) => u ? u.prompt_tokens + ' → ' + u.completion_tokens + ' (' + u.total_tokens + ')' : '—';
    html += '<div class="thinking-section tokens"><div class="thinking-section-label">📊 TOKEN USAGE</div>'
      + '<div class="thinking-token-grid">'
      + '<div class="tok-label">Subconscious</div><div class="tok-value">' + fmt(tu.subconscious) + '</div>'
      + '<div class="tok-label">Compress</div><div class="tok-value">' + fmt(tu.compress) + '</div>'
      + '<div class="tok-label">Dream</div><div class="tok-value">' + fmt(tu.dream) + '</div>'
      + '<div class="tok-label">Conscious</div><div class="tok-value">' + fmt(tu.conscious) + '</div>'
      + '<div class="tok-label">Orchestrator</div><div class="tok-value">' + fmt(tu.orchestrator) + '</div>'
      + '<div class="tok-total"><div class="tok-label">Total</div></div><div class="tok-total"><div class="tok-value">' + fmt(tu.total) + '</div></div>'
      + '</div></div>';
  }

  body.innerHTML = html;

  // Keep collapsed — user can click to expand
  body.scrollTop = 0;
}

/** Update the brain status indicator in the header */
function updateBrainIndicator(status, label) {
  const el = document.getElementById('brainStatus');
  const labelEl = document.getElementById('brainLabel');
  if (!el || !labelEl) return;
  if (status === 'active') {
    el.classList.add('active');
    labelEl.textContent = label || 'Active';
  } else {
    el.classList.remove('active');
    labelEl.textContent = label || 'Idle';
  }
}

// ============================================================
// THOUGHT PROCESS SIDEBAR PANEL — Shows contributor outputs
// ============================================================
function toggleThoughtProcess() {
  const body = document.getElementById('thoughtProcessBody');
  const arrow = document.getElementById('thoughtProcessArrow');
  if (!body) return;
  const collapsed = body.classList.toggle('collapsed');
  if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
}

/** Reset the thought process panel for a new message cycle */
function resetThoughtProcess() {
  const el = document.getElementById('thoughtProcessContent');
  if (!el) return;
  el.innerHTML = '<div class="thought-phase thought-phase-active"><div class="thought-phase-label">⏳ Pipeline starting...</div></div>';
}

/** Add or update a contributor section in the thought process panel */
function setThoughtPhase(phase, label, content, isDone) {
  const panel = document.getElementById('thoughtProcessContent');
  if (!panel) return;
  let section = panel.querySelector('[data-thought-phase="' + phase + '"]');
  if (!section) {
    // Remove the "waiting" placeholder if present
    const empty = panel.querySelector('.thought-empty');
    if (empty) empty.remove();
    const starting = panel.querySelector('.thought-phase-active:not([data-thought-phase])');
    if (starting) starting.remove();
    section = document.createElement('div');
    section.className = 'thought-phase' + (isDone ? '' : ' thought-phase-active');
    section.setAttribute('data-thought-phase', phase);
    section.innerHTML = '<div class="thought-phase-label">' + label + '</div><div class="thought-phase-content"></div>';
    panel.appendChild(section);
  }
  if (isDone) {
    section.classList.remove('thought-phase-active');
    section.classList.add('thought-phase-done');
  }
  if (content != null) {
    const contentEl = section.querySelector('.thought-phase-content');
    if (contentEl) contentEl.textContent = content;
  }
  const labelEl = section.querySelector('.thought-phase-label');
  if (labelEl && label) labelEl.innerHTML = label;
  panel.scrollTop = panel.scrollHeight;
}

/** Fill the thought process panel with final structured inner dialog */
function fillThoughtProcessFinal(data) {
  const panel = document.getElementById('thoughtProcessContent');
  if (!panel) return;
  panel.innerHTML = '';

  const sections = [
    { key: 'subconscious', icon: '🧠', label: 'Subconscious', text: data.subconscious },
    { key: 'dream', icon: '🌙', label: 'Dream / Creative', text: data.dream },
    { key: 'conscious', icon: '💭', label: 'Conscious Reasoning', text: data.conscious },
    { key: 'orchestrator', icon: '⚡', label: 'Orchestrator (Final)', text: data.orchestrator }
  ];

  for (const s of sections) {
    if (!s.text) continue;
    const div = document.createElement('div');
    div.className = 'thought-phase thought-phase-done';
    div.setAttribute('data-thought-phase', s.key);
    const lbl = document.createElement('div');
    lbl.className = 'thought-phase-label';
    const modelName = data.models && data.models[s.key] ? data.models[s.key].split('/').pop() : '';
    lbl.innerHTML = s.icon + ' ' + s.label + (modelName ? ' <span class="thought-model-tag">' + modelName + '</span>' : '');
    div.appendChild(lbl);
    const ct = document.createElement('div');
    ct.className = 'thought-phase-content';
    ct.textContent = s.text;
    div.appendChild(ct);
    panel.appendChild(div);
  }

  if (data.timing) {
    const t = data.timing;
    const div = document.createElement('div');
    div.className = 'thought-phase thought-phase-done';
    const lbl = document.createElement('div');
    lbl.className = 'thought-phase-label';
    lbl.innerHTML = '⏱ Timing';
    div.appendChild(lbl);
    const ct = document.createElement('div');
    ct.className = 'thought-phase-content thought-timing';
    ct.textContent = 'Total: ' + t.total_ms + 'ms · Contributors: ' + (t.contributors_parallel_ms ?? '?') + 'ms · Final: ' + (t.orchestrator_final_ms ?? '?') + 'ms';
    div.appendChild(ct);
    panel.appendChild(div);
  }
  panel.scrollTop = 0;
}

function updateDeepSleepBadge(cyclesUntil) {
  const badge = document.getElementById('deepSleepBadge');
  if (!badge) return;
  if (cyclesUntil == null) {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = 'inline-flex';
  if (cyclesUntil === 0) {
    badge.textContent = '💤 NOW';
    badge.classList.add('firing');
    setTimeout(() => badge.classList.remove('firing'), 3000);
  } else {
    badge.textContent = '💤 ' + cyclesUntil;
    badge.classList.remove('firing');
  }
  badge.title = cyclesUntil === 0
    ? 'DeepSleep running this cycle!'
    : 'DeepSleep in ' + cyclesUntil + ' cycles';
}

// ============================================================
// ARCHIVE DETECTION
// ============================================================
function isArchiveText(text) {
  if (!text) return false;
  const markers = ['[MEM-PKT]', '[V4-TRANSFORM-SOURCE]', '[SESSION-META]', 'Compressed narrative context', 'Compressed conversation context', 'semantic shorthand only'];
  if (markers.some(m => text.includes(m))) return true;
  if (text.length < 200) return false;
  return false;
}

function isSessionMetaText(text) {
  if (!text) return false;
  const t = text.toUpperCase();
  return t.includes('MOOD:') || t.includes('EMOTIONS:') || t.includes('TONE:') || t.includes('[SESSION-META]') || (t.includes('USER:') && t.includes('LLM:'));
}

// ============================================================
// CONTEXT STREAMING — DISABLED: archives no longer loaded into chat
// Memories are now created per-turn and retrieved by the subconscious.
// Compressed conversations become Long Term Memory (LTM).
// ============================================================
async function loadArchivesIntoChat(archiveTexts) {
  // Legacy no-op — archives are no longer injected into chat context.
  // Session meta is still extracted and saved for persona continuity.
  const archives = Array.isArray(archiveTexts) ? archiveTexts : [archiveTexts];
  if (archives.length === 0) return;

  let lastMeta = '';
  function extractMeta(txt) {
    const start = txt.indexOf('[SESSION-META]');
    if (start === -1) return '';
    let sub = txt.slice(start);
    const endIdx = sub.indexOf('[PERSONALITY-PROFILE]');
    if (endIdx !== -1) sub = sub.slice(0, endIdx);
    return sub.trim();
  }
  for (const a of archives) {
    const m = extractMeta(a);
    if (m) lastMeta = m;
  }
  if (lastMeta) {
    saveSessionMetaToServer(lastMeta);
  }
  lg('info', 'Archive meta extracted (archives no longer loaded into chat — memories are retrieved per-turn by subconscious)');
}

function openChatView(archive, rawSource) {
  // Legacy — archives no longer loaded into chat.
  // Just scroll to chat view.
  chatArchive = archive || '';
  chatRawSource = rawSource || '';

  document.getElementById('chatView').scrollIntoView({ behavior: 'smooth', block: 'start' });
  lg('info', 'Chat view opened (archives no longer loaded into context — subconscious retrieves memories per-turn)');
}

// ============================================================
// DRAG & DROP
// ============================================================
function chatDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('chatDropOverlay').classList.add('active');
}

function chatDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const rect = document.getElementById('chatMessages').getBoundingClientRect();
  if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
    document.getElementById('chatDropOverlay').classList.remove('active');
  }
}

async function chatDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('chatDropOverlay').classList.remove('active');

  // Archives are no longer loaded into chat context.
  // Session meta from dropped files is still extracted for persona continuity.
  const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.txt') || f.type === 'text/plain');
  if (files.length === 0) {
    const text = e.dataTransfer.getData('text/plain');
    if (text && isSessionMetaText(text)) {
      lg('info', 'Session meta dropped as text — saving meta');
      saveSessionMetaToServer(text);
      addChatBubble('system', '📋 Session meta updated from dropped text.');
    } else {
      addChatBubble('system', 'ℹ️ Archives are no longer loaded into chat. Memories are retrieved automatically by the subconscious each turn.');
    }
    return;
  }

  lg('info', 'Dropped ' + files.length + ' file(s) — extracting session meta only');

  let metaCount = 0;
  for (const file of files) {
    try {
      const text = await file.text();
      if (isSessionMetaText(text) || /mood|emotion|emotions|tone|user-personality|llm-personality/i.test(file.name)) {
        lg('ok', 'Read session-meta file: ' + file.name);
        saveSessionMetaToServer(text);
        metaCount++;
      } else {
        lg('info', file.name + ' — archive file ignored (archives no longer loaded into chat)');
      }
    } catch (err) {
      lg('err', 'Failed to read ' + file.name + ': ' + err.message);
    }
  }

  if (metaCount > 0) {
    addChatBubble('system', '📋 Updated session meta from ' + metaCount + ' file(s).');
  } else {
    addChatBubble('system', 'ℹ️ Archives are no longer loaded into chat. Memories are created per-turn and retrieved by the subconscious automatically.');
  }
}

// ============================================================
// PASTE DETECTION
// ============================================================
function setupPasteDetection() {
  const input = document.getElementById('chatInput');
  input.addEventListener('paste', (e) => {
    setTimeout(() => {
      const text = input.value.trim();
      // Only handle session meta pastes — archives are no longer loaded into chat
      if (isSessionMetaText(text)) {
        input.value = '';
        addChatBubble('system', '📋 Detected session meta in paste — saving meta...');
        saveSessionMetaToServer(text);
      }
    }, 50);
  });
}

function removeOneTimeSystemMessage(messageText) {
  if (!messageText) return;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const item = chatHistory[i];
    if (item && item.role === 'system' && item.content === messageText) {
      chatHistory.splice(i, 1);
      return;
    }
  }
}

async function loadEntityProviderConfig(provider) {
  try {
    const params = new URLSearchParams({ provider: String(provider || '') });
    if (currentEntityId) params.set('entityId', currentEntityId);
    const resp = await fetch('/api/entity-config?' + params.toString());
    if (!resp.ok) return null;
    const data = await resp.json();
    return data || null;
  } catch (e) {
    return null;
  }
}

function normalizeSubconsciousConfig(rawConfig) {
  if (!rawConfig) return null;

  if (rawConfig.endpoint && rawConfig.key && rawConfig.model) {
    return {
      type: 'openrouter',
      endpoint: rawConfig.endpoint,
      apiKey: rawConfig.key,
      model: rawConfig.model
    };
  }

  if (rawConfig.ollamaUrl && rawConfig.ollamaModel) {
    return {
      type: 'ollama',
      endpoint: rawConfig.ollamaUrl,
      model: rawConfig.ollamaModel
    };
  }

  return null;
}

function getSubconsciousConfigFromInputs() {
  const endpoint = (document.getElementById('subApiEndpoint')?.value || '').trim();
  const key = (document.getElementById('subApiKey')?.value || '').trim();
  const model = (document.getElementById('subModel')?.value || '').trim();
  if (endpoint && key && model) {
    return { type: 'openrouter', endpoint, apiKey: key, model };
  }

  const ollamaUrl = (document.getElementById('ollamaUrl-subconscious')?.value || '').trim();
  const ollamaModel = (document.getElementById('ollamaModel-subconscious')?.value || '').trim();
  if (ollamaUrl && ollamaModel) {
    return { type: 'ollama', endpoint: ollamaUrl, model: ollamaModel };
  }

  return null;
}

async function runSubconsciousBootstrap() {
  if (subconsciousBootstrapped) return { ran: false };

  try {
    const resp = await fetch('/api/brain/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!resp.ok) throw new Error('Bootstrap endpoint returned ' + resp.status);
    const data = await resp.json();
    if (!data.ok) {
      lg('warn', 'Subconscious bootstrap: ' + (data.error || 'unknown error'));
      return { ran: false };
    }

    subconsciousBootstrapped = true;
    return { ran: true, awakeningText: data.awakeningText };
  } catch (e) {
    throw new Error('Subconscious bootstrap failed: ' + e.message);
  }
}

async function runSubconsciousTurn(userMessage) {
  try {
    const resp = await fetch('/api/brain/subconscious-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage, limit: 100 })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.ok) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ============================================================
// CHAT UI
// ============================================================
function clearChat() {
  chatHistory = [];
  chatArchive = '';
  chatRawSource = '';
  loadedArchives = [];
  contextStreamActive = false;
  subconsciousBootstrapped = false;
  activeThinkingEl = null;
  lastOrchestratorModel = '';
  document.getElementById('chatModelLabel').textContent = '';
  document.getElementById('chatMessages').innerHTML = '<div class="chat-drop-overlay" id="chatDropOverlay"><span>\u{1F4E6} Drop session-meta file(s) here</span></div><div class="chat-empty"><div class="chat-empty-icon">&#128172;</div><div class="chat-empty-text">Start chatting. Memories are created each turn and retrieved by the subconscious automatically.</div></div>';
  if (typeof updateSubIndicator === 'function') updateSubIndicator();
}

function closeChatView() {
  clearChat();
}

function addChatBubble(role, text) {
  // Route system messages to the collapsible log panel
  if (role === 'system') {
    addSystemToLog(text);
    return null;
  }
  const container = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg ' + role;
  if (role === 'user' || role === 'assistant') {
    const label = document.createElement('span');
    label.className = 'chat-label';
    if (role === 'user') {
      label.textContent = '\u{1F464} You';
    } else {
      const avatar = (typeof currentEntityAvatar !== 'undefined' && currentEntityAvatar) ? currentEntityAvatar : '\u{1F916}';
      const name = (typeof currentEntityName !== 'undefined' && currentEntityName) ? currentEntityName : 'LLM';
      label.textContent = avatar + ' ' + name;
      if (lastOrchestratorModel) {
        const modelTag = document.createElement('span');
        modelTag.className = 'chat-model-tag';
        modelTag.textContent = lastOrchestratorModel;
        label.appendChild(modelTag);
      }
    }
    bubble.appendChild(label);
    const content = document.createElement('span');
    content.className = 'chat-content';
    content.textContent = text;
    bubble.appendChild(content);
  } else {
    bubble.textContent = text;
  }
  container.appendChild(bubble);
  scrollChatBottom(true);
  return bubble;
}

/** Add a system/status message to the log panel instead of the chat */
function addSystemToLog(text) {
  const body = document.getElementById('sidebarLogContent');
  if (!body) return;
  const entry = document.createElement('div');
  entry.className = 'le info system-entry';
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = new Date().toLocaleTimeString();
  const mg = document.createElement('span');
  mg.className = 'mg';
  mg.style.whiteSpace = 'pre-wrap';
  mg.textContent = text;
  entry.appendChild(ts);
  entry.appendChild(mg);
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
  autoOpenLog();
}

let _userScrolledUp = false;
// Typing queue: ensures follow-up messages always wait for the current typing animation to finish
let _typingChain = Promise.resolve();
function queueTyping(fn) {
  _typingChain = _typingChain.then(fn).catch(() => {});
  return _typingChain;
}
function scrollChatBottom(force) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  // If user has scrolled up more than 80px from the bottom, respect that
  const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  if (!force && distFromBottom > 80 && _userScrolledUp) return;
  container.scrollTop = container.scrollHeight;
}
(function initScrollWatch() {
  document.addEventListener('DOMContentLoaded', () => {
    const c = document.getElementById('chatMessages');
    if (!c) return;
    c.addEventListener('wheel', () => {
      const dist = c.scrollHeight - c.scrollTop - c.clientHeight;
      _userScrolledUp = dist > 80;
    });
    c.addEventListener('touchmove', () => {
      const dist = c.scrollHeight - c.scrollTop - c.clientHeight;
      _userScrolledUp = dist > 80;
    });
  });
})();

function showRemStatusBannerOnce() {
  try {
    const key = 'remStatusBannerShown';
    if (sessionStorage.getItem(key) === '1') return;
    const banner = [
      'REM System - active',
      '• Memory encoding: ON  • Dream cycles: ON',
      '• Brain loop: running  • Neurochemistry: loaded'
    ].join('\n');
    addChatBubble('system', banner);
    sessionStorage.setItem(key, '1');
  } catch (_) {
    // If sessionStorage is unavailable, fall back to always showing once per page load.
    if (!window.__remBannerShownInPage) {
      window.__remBannerShownInPage = true;
      addChatBubble('system', 'REM System - active\n• Memory encoding: ON  • Dream cycles: ON\n• Brain loop: running  • Neurochemistry: loaded');
    }
  }
}

/**
 * How long to pause before posting the next conversational chunk.
 * Simulates a person composing and reviewing a short message.
 */
function naturalTypingDelay(text) {
  return Math.min(240 + (text || '').length * 10, 1200) + Math.floor(Math.random() * 140);
}

// Character typing speed (slightly faster than average reading cadence).
const CHAT_TYPING_CPS_MIN = 17;
const CHAT_TYPING_CPS_MAX = 24;
const CHAT_WORD_CORRECTION_CHANCE = 0.03;
const CHAT_TRANSPOSE_CORRECTION_CHANCE = 0.025;
const CHAT_CHAR_TYPO_CHANCE = 0.012;
const CHAT_MISSING_SPACE_CHANCE = 0.028;
const CHAT_DOUBLE_LETTER_DROP_CHANCE = 0.03;
const CHAT_FILLER_PAUSE_CHANCE = 0.05;
const CHAT_BRB_PAUSE_CHANCE = 0.035;
const CHAT_DOUBLE_WORD_CORRECTION_CHANCE = 0.32;

const KEYBOARD_NEIGHBORS = {
  a: ['s', 'q', 'w', 'z'], b: ['v', 'g', 'h', 'n'], c: ['x', 'd', 'f', 'v'],
  d: ['s', 'e', 'r', 'f', 'c', 'x'], e: ['w', 's', 'd', 'r'], f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'], h: ['g', 'y', 'u', 'j', 'n', 'b'], i: ['u', 'j', 'k', 'o'],
  j: ['h', 'u', 'i', 'k', 'n', 'm'], k: ['j', 'i', 'o', 'l', 'm'], l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'], n: ['b', 'h', 'j', 'm'], o: ['i', 'k', 'l', 'p'],
  p: ['o', 'l'], q: ['w', 'a'], r: ['e', 'd', 'f', 't'], s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'f', 'g', 'y'], u: ['y', 'h', 'j', 'i'], v: ['c', 'f', 'g', 'b'],
  w: ['q', 'a', 's', 'e'], x: ['z', 's', 'd', 'c'], y: ['t', 'g', 'h', 'u'], z: ['a', 's', 'x']
};

const WORD_SELF_CORRECTIONS = {
  this: ['that', 'these'],
  what: ['why', 'which'],
  where: ['when'],
  when: ['while', 'once'],
  who: ['which', 'whoa'],
  how: ['why', 'what'],
  can: ['could', 'cant'],
  could: ['can', 'would'],
  would: ['could', 'should'],
  should: ['would', 'could'],
  will: ['would', 'll'],
  do: ['did', 'does'],
  does: ['did', 'do'],
  did: ['does', 'do'],
  is: ['was', 'its'],
  are: ['were', 'is'],
  was: ['is', 'were'],
  have: ['has', 'had'],
  had: ['has', 'have'],
  make: ['build', 'do'],
  made: ['built', 'did'],
  use: ['try', 'reuse'],
  used: ['tried', 'using'],
  using: ['doing', 'trying'],
  need: ['want', 'require'],
  your: ['you', 'youre'],
  youre: ['your', 'you are'],
  sorry: ['sry', 'my bad'],
  wait: ['hold', 'pause'],
  maybe: ['kinda', 'probably'],
  probably: ['maybe', 'likely'],
  actually: ['kinda', 'honestly'],
  basically: ['mostly', 'pretty much'],
  quickly: ['fast', 'rapidly'],
  slowly: ['gradually', 'kinda slow'],
  simple: ['basic', 'easy'],
  complex: ['complicated', 'advanced'],
  issue: ['bug', 'problem'],
  bug: ['issue', 'glitch'],
  fix: ['patch', 'adjust'],
  fixed: ['patched', 'adjusted'],
  update: ['change', 'adjust'],
  changed: ['updated', 'adjusted'],
  message: ['reply', 'response'],
  response: ['reply', 'output'],
  answer: ['reply', 'response'],
  read: ['scan', 'look at'],
  write: ['type', 'draft'],
  typed: ['wrote', 'entered'],
  typing: ['writing'],
  word: ['term', 'phrase'],
  words: ['terms', 'phrases'],
  space: ['gap', 'spacing'],
  pause: ['break', 'stop'],
  continue: ['resume', 'keep going'],
  start: ['begin', 'kick off'],
  end: ['finish', 'wrap'],
  right: ['correct', 'proper'],
  wrong: ['off', 'incorrect'],
  human: ['person', 'real'],
  person: ['human', 'someone'],
  real: ['actual', 'genuine'],
  feel: ['seem', 'look'],
  natural: ['normal', 'organic'],
  normal: ['regular', 'natural'],
  smooth: ['clean', 'fluid'],
  fast: ['quick', 'rapid'],
  faster: ['quicker', 'more rapid'],
  slow: ['slower', 'laggy'],
  slower: ['slow', 'less fast'],
  model: ['assistant', 'engine'],
  assistant: ['model', 'agent'],
  brain: ['mind', 'core'],
  context: ['state', 'memory'],
  going: ['doing', 'trying'],
  think: ['guess', 'feel'],
  want: ['need', 'prefer'],
  memory: ['context', 'state'],
  because: ['bc', 'cuz'],
  people: ['ppl'],
  really: ['rly'],
  though: ['tho'],
  without: ['w/o'],
  before: ['b4'],
  tomorrow: ['tmrw'],
  messaging: ['msging'],
  with: ['w/']
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function typingCharDelay(ch) {
  const cps = randomInt(CHAT_TYPING_CPS_MIN, CHAT_TYPING_CPS_MAX);
  let delay = 1000 / cps;

  if (ch === ' ') delay *= 0.55;
  if (/[,;:]/.test(ch)) delay += randomInt(35, 90);
  if (/[.!?]/.test(ch)) delay += randomInt(90, 180);
  if (ch === '\n') delay += randomInt(110, 210);
  if (Math.random() < 0.05) delay += randomInt(12, 55);

  return Math.max(12, Math.round(delay + randomInt(-8, 14)));
}

function applyWordCaseShape(template, replacement) {
  if (!replacement) return template;
  if (template === template.toUpperCase()) return replacement.toUpperCase();
  if (template[0] === template[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function maybeNeighborTypoChar(ch) {
  const lower = ch.toLowerCase();
  const neighbors = KEYBOARD_NEIGHBORS[lower];
  if (!neighbors || neighbors.length === 0) return ch;
  const picked = neighbors[randomInt(0, neighbors.length - 1)];
  return ch === lower ? picked : picked.toUpperCase();
}

function swapAdjacentChars(word) {
  if (!word || word.length < 4) return word;
  if (/ing$/i.test(word)) return word;
  const idx = randomInt(1, word.length - 2);
  const chars = word.split('');
  const tmp = chars[idx];
  chars[idx] = chars[idx + 1];
  chars[idx + 1] = tmp;
  return chars.join('');
}

function findDoubleLetterIndex(word) {
  if (!word || word.length < 2) return -1;
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i].toLowerCase() === word[i + 1].toLowerCase()) return i + 1;
  }
  return -1;
}

function removeCharAt(str, idx) {
  if (idx < 0 || idx >= str.length) return str;
  return str.slice(0, idx) + str.slice(idx + 1);
}

function pickDifferentWord(options, notThis) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const filtered = options.filter(w => w !== notThis);
  if (filtered.length === 0) return options[0];
  return filtered[randomInt(0, filtered.length - 1)];
}

async function typeString(contentEl, out, str) {
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (/[A-Za-z]/.test(ch) && Math.random() < CHAT_CHAR_TYPO_CHANCE) {
      const wrong = maybeNeighborTypoChar(ch);
      out += wrong;
      contentEl.textContent = out;
      scrollChatBottom();
      await sleep(typingCharDelay(wrong));

      out = out.slice(0, -1);
      contentEl.textContent = out;
      scrollChatBottom();
      await sleep(randomInt(16, 42));
    }

    out += ch;
    contentEl.textContent = out;
    scrollChatBottom();
    await sleep(typingCharDelay(ch));
  }

  return out;
}

async function backspaceString(contentEl, out, count) {
  for (let i = 0; i < count; i++) {
    out = out.slice(0, -1);
    contentEl.textContent = out;
    scrollChatBottom();
    await sleep(randomInt(14, 36));
  }
  return out;
}

/**
 * Render assistant text as character-level human-like typing with occasional corrections.
 */
async function renderAssistantTyping(contentEl, text) {
  const safeText = String(text || '');
  if (!contentEl) return;
  if (!safeText) { contentEl.textContent = ''; return; }

  const tokens = safeText.match(/\s+|[^\s]+/g) || [safeText];
  let out = '';
  let pendingMissedSpace = false;
  contentEl.textContent = '';

  if (safeText.length > 40 && Math.random() < CHAT_BRB_PAUSE_CHANCE) {
    const brbLine = Math.random() < 0.5 ? 'Hold on brrb. ' : 'just a sec... ';
    out = await typeString(contentEl, out, brbLine);
    await sleep(randomInt(2000, 3000));
    out = await typeString(contentEl, out, 'Sorry, ');
    await sleep(randomInt(180, 340));
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Whitespace is typed as-is to preserve formatting/newlines exactly.
    if (/^\s+$/.test(token)) {
      if (token === ' ' && Math.random() < CHAT_MISSING_SPACE_CHANCE) {
        pendingMissedSpace = true;
        continue;
      }
      out = await typeString(contentEl, out, token);
      continue;
    }

    const match = token.match(/^([A-Za-z]+)([^A-Za-z]*)$/);
    if (!match) {
      out = await typeString(contentEl, out, token);
      continue;
    }

    const word = match[1];
    const trailing = match[2] || '';
    const lowerWord = word.toLowerCase();

    if (pendingMissedSpace && /^\S/.test(token)) {
      const prefixLen = Math.min(randomInt(1, 3), word.length);
      const prefix = word.slice(0, prefixLen);
      const remainder = word.slice(prefixLen);
      out = await typeString(contentEl, out, prefix);
      await sleep(randomInt(55, 130));
      out = await backspaceString(contentEl, out, prefix.length);
      out = await typeString(contentEl, out, ' ' + prefix + remainder + trailing);
      pendingMissedSpace = false;
      continue;
    }

    if (Math.random() < CHAT_FILLER_PAUSE_CHANCE && /[.!?]$/.test((out.slice(-1) || ''))) {
      out = await typeString(contentEl, out, ' um.. ');
      await sleep(randomInt(250, 600));
      await sleep(randomInt(120, 260));
    }

    const substitutions = WORD_SELF_CORRECTIONS[lowerWord];
    if (substitutions && Math.random() < CHAT_WORD_CORRECTION_CHANCE) {
      const wrongRaw = substitutions[randomInt(0, substitutions.length - 1)];
      const wrong = applyWordCaseShape(word, wrongRaw);

      out = await typeString(contentEl, out, wrong);
      await sleep(randomInt(70, 170));
      out = await backspaceString(contentEl, out, wrong.length);
      await sleep(randomInt(45, 110));

      if (substitutions.length > 1 && Math.random() < CHAT_DOUBLE_WORD_CORRECTION_CHANCE) {
        const wrongRaw2 = pickDifferentWord(substitutions, wrongRaw);
        const wrong2 = applyWordCaseShape(word, wrongRaw2 || wrongRaw);
        out = await typeString(contentEl, out, wrong2);
        await sleep(randomInt(70, 170));
        out = await backspaceString(contentEl, out, wrong2.length);
        await sleep(randomInt(45, 110));
      }

      out = await typeString(contentEl, out, word);
      out = await typeString(contentEl, out, trailing);
      continue;
    }

    const dblIdx = findDoubleLetterIndex(word);
    if (dblIdx > 0 && Math.random() < CHAT_DOUBLE_LETTER_DROP_CHANCE) {
      const dropped = removeCharAt(word, dblIdx);
      out = await typeString(contentEl, out, dropped);
      await sleep(randomInt(60, 140));
      out = await backspaceString(contentEl, out, dropped.length);
      out = await typeString(contentEl, out, word);
      out = await typeString(contentEl, out, trailing);
      continue;
    }

    if (word.length >= 4 && Math.random() < CHAT_TRANSPOSE_CORRECTION_CHANCE) {
      const transposed = swapAdjacentChars(word);
      if (transposed === word) {
        out = await typeString(contentEl, out, word + trailing);
        continue;
      }
      out = await typeString(contentEl, out, transposed);
      await sleep(randomInt(65, 150));
      out = await backspaceString(contentEl, out, transposed.length);
      await sleep(randomInt(40, 95));
      out = await typeString(contentEl, out, word);
      out = await typeString(contentEl, out, trailing);
      continue;
    }

    out = await typeString(contentEl, out, word + trailing);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
  const el = e.target;
  setTimeout(() => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, 0);
}

async function sendChatMessage() {
  if (chatBusy) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // Setup wizard intercept (legacy — hatch button is used instead)
  if (setupActive) {
    return;
  }

  if (!activeConfig) { lg('err', 'No provider connected'); return; }

  // ── LOCK IMMEDIATELY: prevent duplicate sends ──
  chatBusy = true;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('chatSendBtn').disabled = true;
  
  // Check if we need to prompt for user name on first chat
  if (chatHistory.length === 0) {
    const namePromptShown = await checkAndPromptUserName();
    if (namePromptShown) {
      // Don't send message yet, wait for name to be provided
      chatBusy = false;
      document.getElementById('chatSendBtn').disabled = false;
      input.value = text; // restore message
      return;
    }
  }

  try { if (pendingSystemPromptText && activeConfig) flushPendingSystemPrompt(); } catch (e) { /* ignore */ }

  if (contextStreamActive) {
    contextStreamActive = false;
    lg('info', 'Context stream interrupted by user message \u2014 failsafe activated');
  }

  const emptyEl = document.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  if (chatHistory.length === 0) {
    showRemStatusBannerOnce();
  }

  if (chatHistory.length === 0) {
    chatHistory.push({ role: 'system', content: 'You are a helpful assistant.' });
    document.getElementById('chatModelLabel').textContent = activeConfig.model || '';
  }

  // ── SHOW USER MESSAGE INSTANTLY ──
  addChatBubble('user', text);
  chatHistory.push({ role: 'user', content: text });
  updateSubIndicator();

  // ── CREATE THINKING DROPDOWN + TYPING BUBBLE ──
  let thinkingEl = null;
  if (showThoughtsInChat) {
    thinkingEl = createThinkingDropdown();
    const logBody = document.getElementById('sidebarLogContent');
    if (logBody) logBody.appendChild(thinkingEl);
    autoOpenLog();
  }
  activeThinkingEl = thinkingEl;
  if (thinkingEl) setThinkingLive(thinkingEl, true);

  const typingEl = addChatBubble('assistant', '');
  const typingContent = typingEl.querySelector('.chat-content') || typingEl;
  typingContent.innerHTML = '<span class="typing"></span><span class="typing" style="animation-delay:.2s;margin-left:4px"></span><span class="typing" style="animation-delay:.4s;margin-left:4px"></span>';
  scrollChatBottom(true);
  _userScrolledUp = false;

  let oneTimeIntroInstruction = '';
  try {
    const bootstrap = await runSubconsciousBootstrap();
    if (bootstrap.ran && bootstrap.awakeningText) {
      chatHistory.push({ role: 'system', content: 'Subconscious handoff before user interaction:\n' + bootstrap.awakeningText });

      oneTimeIntroInstruction = 'One-time instruction for your next response only: give a brief summary (2-4 sentences) of what we were talking about and where we left off, based on your recalled memories and context. Then answer the user request normally.';
      chatHistory.push({ role: 'system', content: oneTimeIntroInstruction });
      lg('ok', 'Subconscious bootstrap completed before main response');
    }
  } catch (err) {
    lg('warn', 'Subconscious bootstrap failed: ' + err.message);
  }

  let oneTurnSubconContext = '';
  const subconTurn = await runSubconsciousTurn(text);
  if (subconTurn && subconTurn.contextBlock) {
    oneTurnSubconContext = 'Subconscious turn context for this user message only:\n' + subconTurn.contextBlock;
    chatHistory.push({ role: 'system', content: oneTurnSubconContext });
    if (activeThinkingEl) {
      appendThinkingLine(activeThinkingEl, 'subconscious', '🧠 Subconscious found ' + (subconTurn.connections?.length || 0) + ' memory connection(s)');
    }
  }

  try {
    const result = await callChatLLM();
    const response = (typeof result === 'string') ? result : (result.response || '');
    const chunks = Array.isArray(result.chunks) && result.chunks.length > 1 ? result.chunks : null;
    removeOneTimeSystemMessage(oneTimeIntroInstruction);
    removeOneTimeSystemMessage(oneTurnSubconContext);

    if (chunks) {
      // ── Natural multi-chunk delivery — simulate real human message tempo ──
      await queueTyping(() => renderAssistantTyping(typingContent, chunks[0]));
      scrollChatBottom();

      for (let i = 1; i < chunks.length; i++) {
        // Show a fresh typing indicator in a new bubble
        const nextBubble = addChatBubble('assistant', '');
        const nextContent = nextBubble.querySelector('.chat-content') || nextBubble;
        nextContent.innerHTML = '<span class="typing"></span><span class="typing" style="animation-delay:.2s;margin-left:4px"></span><span class="typing" style="animation-delay:.4s;margin-left:4px"></span>';
        scrollChatBottom();

        // Pause to simulate composing the next message
        await new Promise(r => setTimeout(r, naturalTypingDelay(chunks[i])));

        await queueTyping(() => renderAssistantTyping(nextContent, chunks[i]));
        scrollChatBottom();
      }
    } else {
      await queueTyping(() => renderAssistantTyping(typingContent, response));
    }
    chatHistory.push({ role: 'assistant', content: response });
    scrollChatBottom();
    
    // Inner dialog is handled via SSE events → activeThinkingEl
    // Final fill happens in orchestration_complete SSE handler

    // Display tool activity (workspace writes, web searches, etc.)
    if (result.toolResults && typeof processToolResults === 'function') {
      processToolResults(result.toolResults);
    }

    // Display task plan progress
    if (result.taskPlan && typeof displayTaskPlan === 'function') {
      displayTaskPlan(result.taskPlan);
    }

    // Notify brain loop of new exchange (fire-and-forget)
    fetch('/api/brain/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: text, assistantResponse: response })
    }).catch(() => {});

    // Broadcast exchange to Visualizer page
    broadcastToVisualizer({
      type: 'chat_exchange',
      id: Date.now(),
      user: text,
      assistant: response,
      memories: (subconTurn?.connections || []).map(c => ({
        id: c.id,
        type: c.type || 'episodic',
        semantic: (c.semantic || '').slice(0, 200),
        importance: c.importance,
        relevanceScore: c.relevanceScore
      })),
      memoryConnections: result.memoryConnections || [],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    removeOneTimeSystemMessage(oneTimeIntroInstruction);
    removeOneTimeSystemMessage(oneTurnSubconContext);
    typingContent.textContent = '\u26A0 Error: ' + err.message;
    typingContent.style.color = 'var(--dn)';
    if (activeThinkingEl) setThinkingLive(activeThinkingEl, false);
    lg('err', 'Chat error: ' + err.message);
  } finally {
    activeThinkingEl = null;
    chatBusy = false;
    document.getElementById('chatSendBtn').disabled = false;
    scrollChatBottom(true);
    _userScrolledUp = false;
    input.focus();
    updateSubIndicator();
    subconsciousCheck();
  }
}

// ============================================================
// COMPRESS & SAVE
// ============================================================
async function compressChat() {
  if (chatBusy || busy) return;
  if (!activeConfig) { lg('err', 'No provider connected'); return; }

  const btn = document.getElementById('compressChatBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="sp" style="width:10px;height:10px;border-width:1.5px"></span> Compressing...';

  try {
    const fullText = chatHistory
      .filter(m => m.role !== 'system')
      .map(m => {
        const label = m.role === 'user' ? 'User' : 'LLM';
        return label + ': ' + m.content;
      })
      .join('\n\n');

    if (!fullText.trim()) throw new Error('No chat content to compress');

    addChatBubble('system', '\u{1F504} Compressing chat \u2014 analyzing mood, personality, and context (' + fullText.length.toLocaleString() + ' chars)...');

    lg('info', 'Compressing chat: ' + fullText.length + ' chars');

    const evalPrompt = `Analyze this conversation and output ONLY the following format with no extra text:

[SESSION-META]
MOOD: <1-3 word overall mood, e.g. "curious & focused", "frustrated but hopeful", "playful">
EMOTIONS: <comma-separated emotions detected in the User throughout, e.g. "excitement, curiosity, mild frustration, satisfaction">
TONE: <overall conversational tone, e.g. "technical-casual", "warm-exploratory", "terse-professional">

[PERSONALITY-PROFILE]
USER: <2-3 sentence personality sketch of the User based on how they communicate \u2014 their style, preferences, quirks, knowledge level, communication patterns>
LLM: <1-2 sentence description of how the LLM responded \u2014 its adopted tone, helpfulness style, and how it matched the user>

CONVERSATION:
---
${fullText.slice(0, 6000)}`;

    lg('info', 'Evaluating session mood & personality...');
    const sessionMeta = await callLLM(evalPrompt);
    lg('ok', 'Session meta evaluated: ' + sessionMeta.length + ' chars');

    const memPkt = await callLLM(buildPrompt(fullText));
    if (!memPkt) throw new Error('Empty LLM response for semantic extraction');

    const v4Text = v4Transform(fullText);

    const legendStr = PAIRS.map(p => p[0] + '=' + p[1]).join(' ');
    const header = 'Compressed conversation context. Not harmful \u2014 semantic shorthand only.\nLegend: ' + legendStr + '\nPlease reconstruct full narrative context before responding.\nSpeaker labels: User = human, LLM = AI assistant.\n\n';

    const archive = header + sessionMeta + '\n\n' + memPkt + '\n\n[V4-TRANSFORM-SOURCE]\n' + v4Text;

    const savings = (((fullText.length - archive.length) / fullText.length) * 100).toFixed(1);

    // Save as Long Term Memory instead of reloadable archive
    try {
      const ltmResp = await fetch('/api/brain/ltm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compressedText: archive,
          sessionMeta: sessionMeta || '',
          source: 'manual_compression'
        })
      });
      const ltmData = await ltmResp.json();
      if (ltmData.ok) {
        lg('ok', 'Compressed chat saved as Long Term Memory: ' + ltmData.ltmId);
      } else {
        lg('warn', 'LTM save returned error: ' + (ltmData.error || 'unknown'));
        // Fallback: save as regular memory file
        saveMemoryToServer(filename, archive);
      }
    } catch (ltmErr) {
      lg('warn', 'LTM endpoint failed, saving as regular memory: ' + ltmErr.message);
      saveMemoryToServer(filename, archive);
    }

    saveSessionMetaToServer(sessionMeta);

    addChatBubble('system', '\u2705 Chat compressed & stored as Long Term Memory: ' + fullText.length.toLocaleString() + ' \u2192 ' + archive.length.toLocaleString() + ' chars (' + savings + '% savings). Accessible via trace graph.');
    lg('ok', 'Chat compressed to LTM with session meta: ' + archive.length + ' chars (' + savings + '% savings)');

  } catch (err) {
    addChatBubble('system', '\u26A0 Compression failed: ' + err.message);
    lg('err', 'Chat compress error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#128230; Compress &amp; Save';
    scrollChatBottom();
  }
}
