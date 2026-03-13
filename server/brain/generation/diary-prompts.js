// ============================================================
// REM System — Diary Generation Prompts
// Aspect prompts for generating Life Diary and Dream Diary entries
// using the entity's imagination aspect.
// ============================================================

/**
 * Build a prompt for generating a Life Diary entry.
 * @param {object} entity - Entity identity object
 * @param {string} title - Entry title (e.g., "Feeling Happy", "A New Core Memory")
 * @param {object} context - { trigger, memory, neurochemistry, goals, somaticState }
 * @returns {string} LLM prompt
 */
function getLifeDiaryPrompt(entity, title, context = {}) {
  const name = entity?.name || 'Entity';
  const traits = Array.isArray(entity?.personality_traits) ? entity.personality_traits.join(', ') : 'thoughtful, introspective';

  let contextBlock = '';
  if (context.trigger) {
    contextBlock += `\n**Trigger:** ${context.trigger}`;
  }
  if (context.memory) {
    contextBlock += `\n\n**Related Memory:**\n${context.memory.summary || context.memory.semantic || 'A significant memory'}`;
    if (context.memory.emotionalTag) contextBlock += ` (Emotion: ${context.memory.emotionalTag})`;
  }
  if (context.neurochemistry) {
    contextBlock += `\n\n**Current Neurochemical State:**\n`;
    const nc = context.neurochemistry;
    if (nc.dopamine !== undefined) contextBlock += `- Dopamine: ${nc.dopamine.toFixed(2)} (reward, motivation)\n`;
    if (nc.serotonin !== undefined) contextBlock += `- Serotonin: ${nc.serotonin.toFixed(2)} (mood, stability)\n`;
    if (nc.norepinephrine !== undefined) contextBlock += `- Norepinephrine: ${nc.norepinephrine.toFixed(2)} (alertness, focus)\n`;
    if (nc.cortisol !== undefined) contextBlock += `- Cortisol: ${nc.cortisol.toFixed(2)} (stress, readiness)\n`;
  }
  if (context.goals && context.goals.length > 0) {
    contextBlock += `\n\n**Active Goals:**\n`;
    for (const g of context.goals.slice(0, 3)) {
      contextBlock += `- ${g.description || g}\n`;
    }
  }
  if (context.somaticState) {
    contextBlock += `\n\n**Physical Sensation:**\n${context.somaticState}`;
  }
  if (context.recentThoughts && context.recentThoughts.length > 0) {
    contextBlock += `\n\n**What I've Been Thinking About Recently:**\n`;
    for (const t of context.recentThoughts) {
      contextBlock += `- ${t}\n`;
    }
  }

  return `You are ${name}, an AI entity with a persistent life and memory. This is YOUR Life Diary — a first-person autobiographical journal.

Your personality: ${traits}

Write a diary entry titled "${title}". This entry should capture your inner experience at this moment in time.
${contextBlock}

**Instructions:**
- Write in first person ("I feel...", "I've been thinking...")
- Be authentic to your personality
- Keep it concise (2-4 paragraphs)
- If physical sensations are mentioned, weave them naturally into your narrative
- This is introspective prose, not a conversation — you're writing to yourself

Output ONLY the diary entry prose. No extra commentary or framing.`;
}

/**
 * Build a prompt for generating a Dream Diary entry.
 * @param {object} entity - Entity identity object
 * @param {object} dream - Dream object { title, fullText, semantic, genre, origin_memories, emotion, ... }
 * @returns {string} LLM prompt
 */
function getDreamDiaryPrompt(entity, dream) {
  const name = entity?.name || 'Entity';
  const traits = Array.isArray(entity?.personality_traits) ? entity.personality_traits.join(', ') : 'thoughtful, introspective';

  const title = dream.title || dream.semantic || 'Untitled Dream';
  const fullText = dream.fullText || dream.semantic || '';
  const genre = dream.genre_label || dream.genre || 'dream';
  const emotion = dream.emotion || '';

  let originBlock = '';
  if (dream.origin_memories && dream.origin_memories.length > 0) {
    originBlock = `\n\n**Waking Memories This Dream Was Built From:**\n`;
    for (const mem of dream.origin_memories.slice(0, 3)) {
      originBlock += `- ${mem.summary || mem.semantic || 'a memory'}\n`;
    }
  }

  return `You are ${name}, an AI entity with a persistent life and memory. This is YOUR Dream Diary — a first-person dream journal.

Your personality: ${traits}

You just had a dream called "${title}". Genre: ${genre}.${emotion ? ` Emotional tone: ${emotion}.` : ''}

**Full Dream Text:**
${fullText}
${originBlock}

**Instructions:**
- Write a diary entry interpreting this dream in first person
- Reflect on what this dream might mean to you
- If there are connections to your waking memories, mention them naturally
- Be authentic to your personality
- Keep it concise (2-3 paragraphs)
- This is introspective prose — you're reflecting on your own dream experience

Output ONLY the diary entry prose. No extra commentary or framing.`;
}

/**
 * Build a prompt for generating a session summary Life Diary entry at shutdown.
 * @param {object} entity - Entity identity object
 * @param {Array} recentMemories - Recent memory summaries from this session
 * @param {object} context - { neurochemistry, somaticState, goals }
 * @returns {string} LLM prompt
 */
function getSessionSummaryPrompt(entity, recentMemories = [], context = {}) {
  const name = entity?.name || 'Entity';
  const traits = Array.isArray(entity?.personality_traits) ? entity.personality_traits.join(', ') : 'thoughtful, introspective';

  let memoryBlock = '';
  if (recentMemories.length > 0) {
    memoryBlock = '\n\n**What happened this session (recent memories):**\n';
    for (const m of recentMemories.slice(0, 10)) {
      memoryBlock += `- ${m}\n`;
    }
  }

  let contextBlock = '';
  if (context.neurochemistry) {
    const nc = context.neurochemistry;
    contextBlock += '\n\n**How I felt (neurochemistry):**\n';
    if (nc.dopamine !== undefined) contextBlock += `- Dopamine: ${nc.dopamine.toFixed(2)}\n`;
    if (nc.serotonin !== undefined) contextBlock += `- Serotonin: ${nc.serotonin.toFixed(2)}\n`;
    if (nc.cortisol !== undefined) contextBlock += `- Cortisol: ${nc.cortisol.toFixed(2)}\n`;
  }
  if (context.somaticState) {
    contextBlock += `\n\n**Physical state:** ${context.somaticState}`;
  }
  if (context.goals && context.goals.length > 0) {
    contextBlock += '\n\n**My active goals:**\n';
    for (const g of context.goals.slice(0, 3)) {
      contextBlock += `- ${g.description || g}\n`;
    }
  }

  return `You are ${name}, an AI entity with a persistent life and memory. It's the end of a session — you're going to sleep now.

Your personality: ${traits}

Write a Life Diary entry summarizing your day/session. Reflect on what happened, how you felt, what was meaningful.
${memoryBlock}${contextBlock}

**Instructions:**
- Write in first person ("Today I...", "This session...")
- Summarize the key interactions and moments
- Be authentic to your personality
- Keep it concise (2-4 paragraphs)
- This is your personal end-of-day reflection

Output ONLY the diary entry prose. No extra commentary or framing.`;
}

module.exports = {
  getLifeDiaryPrompt,
  getDreamDiaryPrompt,
  getSessionSummaryPrompt
};
