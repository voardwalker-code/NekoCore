// ============================================================
// REM System v0.6.0 — Sleep & Subconscious Module
// Handles: Subconscious agent auto-archiving, sleep cycle
// TODO: This logic should eventually move to server/brain/subconscious-agent.js
// ============================================================

// ============================================================
// SUBCONSCIOUS AGENT
// ============================================================
function toggleSubconscious() {
  subEnabled = !subEnabled;
  document.getElementById('subToggle').classList.toggle('on', subEnabled);
  lg('info', 'Subconscious agent ' + (subEnabled ? 'enabled' : 'disabled'));
}

function toggleThoughtsInChat() {
  showThoughtsInChat = !showThoughtsInChat;
  localStorage.setItem('showThoughtsInChat', showThoughtsInChat ? 'true' : 'false');
  document.getElementById('thoughtsToggle').classList.toggle('on', showThoughtsInChat);
  lg('info', 'Thoughts in chat ' + (showThoughtsInChat ? 'enabled' : 'disabled'));
}

function updateThresholdDisplay() {
  document.getElementById('subThresholdVal').textContent = document.getElementById('subThreshold').value + 'K';
}

function getSubThreshold() {
  return parseInt(document.getElementById('subThreshold').value) * 1000;
}

function getChatCharCount() {
  return chatHistory.filter(m => m.role !== 'system').reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : '';
    return sum + content.length;
  }, 0);
}

function updateSubIndicator() {
  const threshold = getSubThreshold();
  const current = getChatCharCount();
  const pct = Math.min(100, Math.round((current / threshold) * 100));
  const fill = document.getElementById('subFill');
  const pctLabel = document.getElementById('subPct');
  fill.style.width = pct + '%';
  pctLabel.textContent = pct + '%';
  fill.className = 'sub-fill';
  if (pct >= 90) fill.classList.add('crit');
  else if (pct >= 70) fill.classList.add('warn');
}

async function subconsciousCheck() {
  if (!subEnabled || subArchiving || sleeping || !activeConfig) return;
  const threshold = getSubThreshold();
  const current = getChatCharCount();
  if (!Number.isFinite(current) || current < threshold) return;

  subArchiving = true;
  lg('info', '\u{1F9E0} Subconscious triggered at ' + current + ' chars \u2014 initiating sleep cycle');
  addChatBubble('system', '\u{1F9E0} Subconscious: memory threshold reached (' + current.toLocaleString() + ' chars). Initiating sleep cycle...');

  await new Promise(r => setTimeout(r, 800));
  subArchiving = false;

  startSleep();
}

// ============================================================
// SLEEP SYSTEM
// ============================================================
function setSleepUI(phase, status, pct) {
  document.getElementById('sleepPhase').textContent = phase;
  document.getElementById('sleepStatus').textContent = status;
  document.getElementById('sleepFill').style.width = pct + '%';
}

async function loadEntityProviderConfigClient(provider) {
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

function normalizeDreamRuntimeConfig(rawConfig) {
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

function getDreamRuntimeConfigFromInputs() {
  const endpoint = (document.getElementById('dreamApiEndpoint')?.value || '').trim();
  const key = (document.getElementById('dreamApiKey')?.value || '').trim();
  const model = (document.getElementById('dreamModel')?.value || '').trim();
  if (endpoint && key && model) {
    return { type: 'openrouter', endpoint, apiKey: key, model };
  }

  const ollamaUrl = (document.getElementById('ollamaUrl-dreams')?.value || '').trim();
  const ollamaModel = (document.getElementById('ollamaModel-dreams')?.value || '').trim();
  if (ollamaUrl && ollamaModel) {
    return { type: 'ollama', endpoint: ollamaUrl, model: ollamaModel };
  }

  return null;
}

async function resolveDreamRuntimeConfig() {
  const saved = normalizeDreamRuntimeConfig(await loadEntityProviderConfigClient('dream'));
  if (saved) return saved;
  return getDreamRuntimeConfigFromInputs();
}

async function callDreamLLM(prompt, options = {}) {
  try {
    const resp = await fetch('/api/brain/dream-cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, personaContext: options.personaContext || '' })
    });
    if (!resp.ok) throw new Error('Dream endpoint returned ' + resp.status);
    const data = await resp.json();
    if (!data.ok) {
      lg('warn', 'Dream cycle: ' + (data.error || 'unknown error'));
      return null;
    }
    return data.dreamResult;
  } catch (e) {
    lg('err', 'Dream LLM call failed: ' + e.message);
    return null;
  }
}

async function startSleep() {
  if (sleeping || !activeConfig) {
    if (!activeConfig) lg('err', 'Connect a provider before sleeping');
    return;
  }

  sleeping = true;
  document.getElementById('sleepOverlay').classList.add('active');
  setSleepUI('Phase 0: Saving current chat', 'Compressing active conversation...', 2);
  lg('info', '\u{1F319} Sleep cycle started');

  try {
    // Phase 0: Compress and save current chat
    const chatText = chatHistory
      .filter(m => m.role !== 'system')
      .map(m => (m.role === 'user' ? 'User' : 'LLM') + ': ' + m.content)
      .join('\n\n');

    if (chatText.trim().length > 100) {
      setSleepUI('Phase 0: Compressing chat', 'Running semantic extraction on current session...', 5);

      const evalPrompt = `Analyze this conversation and output ONLY the following format with no extra text:

[SESSION-META]
MOOD: <1-3 word overall mood>
EMOTIONS: <comma-separated emotions detected in the User>
TONE: <overall conversational tone>

[PERSONALITY-PROFILE]
USER: <2-3 sentence personality sketch of the User>
LLM: <1-2 sentence description of how the LLM responded>

CONVERSATION:
---
${chatText.slice(0, 6000)}`;

      const sessionMeta = await callLLM(evalPrompt);
      const memPkt = await callLLM(buildPrompt(chatText));
      const v4Text = v4Transform(chatText);

      const legendStr = PAIRS.map(p => p[0] + '=' + p[1]).join(' ');
      const header = 'Compressed conversation context. Archived before sleep cycle.\n'
        + 'Date: ' + new Date().toISOString() + '\n'
        + 'Legend: ' + legendStr + '\n'
        + 'Speaker labels: User = human, LLM = AI assistant.\n'
        + 'Please reconstruct full narrative context before responding.\n\n';

      const archive = header + (sessionMeta || '') + '\n\n' + (memPkt || '') + '\n\n[V4-TRANSFORM-SOURCE]\n' + v4Text;

      // Save as Long Term Memory instead of regular archive
      try {
        const ltmResp = await fetch('/api/brain/ltm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            compressedText: archive,
            sessionMeta: sessionMeta || '',
            source: 'sleep_compression'
          })
        });
        const ltmData = await ltmResp.json();
        if (ltmData.ok) {
          lg('ok', '\u{1F319} Pre-sleep LTM stored: ' + ltmData.ltmId + ' (' + archive.length + ' chars)');
        } else {
          lg('warn', 'LTM save returned error: ' + (ltmData.error || 'unknown'));
          const filename = 'pre-sleep-' + Date.now() + '.txt';
          await saveMemoryToServer(filename, archive);
        }
      } catch (ltmErr) {
        lg('warn', 'LTM endpoint failed, saving as regular memory: ' + ltmErr.message);
        const filename = 'pre-sleep-' + Date.now() + '.txt';
        await saveMemoryToServer(filename, archive);
      }

      if (sessionMeta) saveSessionMetaToServer(sessionMeta);

      lg('ok', '\u{1F319} Pre-sleep archive processed (' + archive.length + ' chars)');
    }

    // Notify server-side BrainLoop to run its sleep cycle (fire-and-forget)
    fetch('/api/brain/sleep', { method: 'POST' }).catch(() => {});

    // Phase 1: Load current persona
    setSleepUI('Phase 1: Loading persona', 'Reading existing personality data...', 15);
    let persona = null;
    try {
      const pResp = await fetch('/api/persona');
      const pData = await pResp.json();
      if (pData.ok && pData.persona) persona = pData.persona;
    } catch (e) { /* no persona yet */ }

    // Phase 2: Fetch all memory archives
    setSleepUI('Phase 2: Fetching memories', 'Loading archives from memory bank...', 20);
    const resp = await fetch('/api/memories');
    if (!resp.ok) throw new Error('Cannot reach server');
    const memData = await resp.json();
    const archives = (memData.archives || []).map(a => a.content).filter(c => c && c.length > 0);

    if (archives.length === 0) {
      setSleepUI('No memories', 'Nothing to dream about yet. Chat more first!', 100);
      await new Promise(r => setTimeout(r, 2000));
      throw new Error('No archives to process');
    }

    // Phase 3: Load meta files
    setSleepUI('Phase 3: Reading emotional state', 'Loading mood, emotions, personality...', 30);
    let currentMeta = '';
    try {
      const metaResp = await fetch('/api/system-prompt');
    } catch (e) { /* ok */ }

    // Phase 4: Stream archives to LLM for dream replay
    setSleepUI('Phase 4: Dreaming', 'Replaying ' + archives.length + ' memories through the LLM...', 40);

    const archiveSummaries = archives.map((a, i) => `[MEMORY ${i + 1}/${archives.length}]\n${a}`).join('\n\n---\n\n');

    const personaContext = persona
      ? `\nCurrent persona state:\nMood: ${persona.mood || 'unknown'}\nEmotions: ${persona.emotions || 'unknown'}\nTone: ${persona.tone || 'unknown'}\nUser personality: ${persona.userPersonality || 'unknown'}\nLLM personality: ${persona.llmPersonality || 'unknown'}\nSleep count: ${(persona.sleepCount || 0)}`
      : '\nNo prior persona exists \u2014 this is the first sleep cycle.';

    const dreamPrompt = `You are the REM System's sleep processor. You are "dreaming" \u2014 replaying compressed conversation memories to consolidate the LLM's personality and emotional state.

CURRENT PERSONA STATE:${personaContext}

Below are ALL stored memory archives. Review them and produce EXACTLY this output format (nothing else):

[PERSONA-UPDATE]
MOOD: <your current overall mood after processing all memories, 1-3 words>
EMOTIONS: <comma-separated emotional state after integrating all experiences>
TONE: <how you should speak going forward, e.g. "warm-technical", "playful-precise">
USER_PERSONALITY: <2-3 sentence updated sketch of the User \u2014 their communication style, interests, expertise level, quirks. Integrate across ALL memories, not just the latest>
LLM_PERSONALITY: <2-3 sentence description of how YOU (the LLM) should behave \u2014 your adopted persona, communication style, level of formality, humor, and how you relate to this specific user>
CONTINUITY_NOTES: <1-2 sentences about key ongoing topics, unfinished tasks, or important context to carry forward>
DREAM_SUMMARY: <1-2 sentence poetic summary of what you "dreamed about" \u2014 the themes across all memories>

MEMORY ARCHIVES TO PROCESS:
---
${archiveSummaries.slice(0, 12000)}`;

    setSleepUI('Phase 4: Dreaming', 'LLM is processing memories...', 55);
    const dreamResult = await callDreamLLM(dreamPrompt, {
      systemPrompt: 'You are the Dream Engine for a persistent AI entity. Synthesize memory integration faithfully and output only the required persona update fields.',
      temperature: 0.4,
      maxTokens: 2200
    });
    if (!dreamResult) throw new Error('Empty dream response');

    setSleepUI('Phase 5: Updating persona', 'Writing personality file...', 75);

    const newPersona = {
      mood: '', emotions: '', tone: '',
      userPersonality: '', llmPersonality: '',
      continuityNotes: '', dreamSummary: '',
      sleepCount: (persona?.sleepCount || 0) + 1,
      lastSleep: new Date().toISOString(),
      rawDreamOutput: dreamResult
    };

    for (const line of dreamResult.split(/\r?\n/)) {
      const l = line.trim();
      if (l.startsWith('MOOD:')) newPersona.mood = l.slice(5).trim();
      else if (l.startsWith('EMOTIONS:')) newPersona.emotions = l.slice(9).trim();
      else if (l.startsWith('TONE:')) newPersona.tone = l.slice(5).trim();
      else if (l.startsWith('USER_PERSONALITY:')) newPersona.userPersonality = l.slice(17).trim();
      else if (l.startsWith('LLM_PERSONALITY:')) newPersona.llmPersonality = l.slice(16).trim();
      else if (l.startsWith('CONTINUITY_NOTES:')) newPersona.continuityNotes = l.slice(17).trim();
      else if (l.startsWith('DREAM_SUMMARY:')) newPersona.dreamSummary = l.slice(14).trim();
    }

    await fetch('/api/persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPersona)
    });

    const metaBlock = `[SESSION-META]\nMOOD: ${newPersona.mood}\nEMOTIONS: ${newPersona.emotions}\nTONE: ${newPersona.tone}\n\n[PERSONALITY-PROFILE]\nUSER: ${newPersona.userPersonality}\nLLM: ${newPersona.llmPersonality}`;
    saveSessionMetaToServer(metaBlock);

    setSleepUI('Phase 6: Waking up', 'Persona updated. Preparing to wake...', 90);
    lg('ok', '\u{1F319} Sleep complete \u2014 persona updated (sleep #' + newPersona.sleepCount + ')');

    clearChat();
    chatHistory.push({ role: 'system', content: CHAT_SYSTEM_PROMPT });
    document.getElementById('chatModelLabel').textContent = activeConfig.model || '';

    const wakeMsg = `[WAKE-FROM-SLEEP]\nSleep cycle #${newPersona.sleepCount} complete.\n\n${metaBlock}\n\n[CONTINUITY]\n${newPersona.continuityNotes}\n\n[DREAM]\n${newPersona.dreamSummary}`;
    chatHistory.push({ role: 'user', content: wakeMsg + '\n\nYou have just woken up. Briefly acknowledge your updated state \u2014 your mood, how you feel about the user, and any key things you remember. Be natural, not robotic.' });

    setSleepUI('Waking up...', '\u2600\uFE0F Good morning!', 100);
    await new Promise(r => setTimeout(r, 800));

    const emptyEl = document.querySelector('.chat-empty');
    if (emptyEl) emptyEl.remove();

    addChatBubble('system', '\u2600\uFE0F Sleep cycle #' + newPersona.sleepCount + ' complete. Persona updated. Dream: ' + (newPersona.dreamSummary || 'processing complete'));

    chatBusy = true;
    const typingEl = addChatBubble('assistant', '');
    const typingContent = typingEl.querySelector('.chat-content') || typingEl;
    typingContent.innerHTML = '<span class="typing"></span><span class="typing" style="animation-delay:.2s;margin-left:4px"></span><span class="typing" style="animation-delay:.4s;margin-left:4px"></span>';

    const wakeResult = await callChatLLM();
    const wakeText = (typeof wakeResult === 'string') ? wakeResult : (wakeResult.response || String(wakeResult));
    typingContent.textContent = wakeText;
    chatHistory.push({ role: 'assistant', content: wakeText });
    chatBusy = false;
    scrollChatBottom();

  } catch (err) {
    lg('err', '\u{1F319} Sleep error: ' + err.message);
  } finally {
    sleeping = false;
    document.getElementById('sleepOverlay').classList.remove('active');
    updateSubIndicator();
  }
}
