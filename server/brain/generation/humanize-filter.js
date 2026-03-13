// ============================================================
// Humanize Filter
// Post-processes an LLM-generated response to remove common
// AI writing patterns and rewrite it in the entity's own voice.
//
// Based on documented AI writing tells:
// https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
// ============================================================

/**
 * Patterns that strongly signal AI-generated text.
 * Used both in the system prompt and as a quick pre-check.
 */
const AI_OPENERS = [
  /^(certainly|absolutely|of course|great question|excellent question|that'?s? (a )?(great|excellent|wonderful|interesting) (question|point))[!,.]?\s*/i,
  /^(i('d| would) be (happy|glad|delighted) to\b\s*)/i,
  /^(thank you for (your|that) (question|message|inquiry))/i,
  /^(as (an|a) (ai|language model|large language model|llm))/i,
  /^(sure[!,.]?\s*)/i
];

const AI_CLOSERS = [
  /\n?i hope (this|that) helps?[.!]*\s*$/i,
  /\n?let me know if (you (have|need)|there'?s? anything)/i,
  /\n?feel free to (ask|reach out|let me know)/i,
  /\n?don'?t hesitate to (ask|reach out)/i,
  /\n?is there anything else (i can help|you('?d like))/i
];

/**
 * Quick in-process cleanup — strip the most egregious AI patterns
 * without needing an LLM call. Always runs even if humanize is disabled.
 *
 * @param {string} text
 * @returns {string}
 */
function quickClean(text) {
  let t = text.trim();

  // Strip AI openers
  for (const re of AI_OPENERS) {
    t = t.replace(re, '').trim();
  }
  t = t.charAt(0).toUpperCase() + t.slice(1);

  // Strip AI closers
  for (const re of AI_CLOSERS) {
    t = t.replace(re, '');
  }

  return t.trim();
}

/**
 * Run an LLM pass to rewrite the response in the entity's natural voice,
 * removing AI writing patterns while preserving all actual content.
 *
 * @param {string}   text       - The response to humanize
 * @param {Object}   entity     - Entity data (name, personality_traits, introduction)
 * @param {Function} callLLM    - async (runtime, messages, opts) => string
 * @param {Object}   runtime    - LLM runtime config to use (should be fast — use subconscious)
 * @returns {Promise<string>}   - Humanized text (falls back to quickClean on error)
 */
async function humanizeResponse(text, entity, callLLM, runtime) {
  const cleaned = quickClean(text);

  if (!runtime || !callLLM) return cleaned;

  // Build entity voice context
  const name = entity?.name || 'the entity';
  const traits = Array.isArray(entity?.personality_traits)
    ? entity.personality_traits.join(', ')
    : '';
  const intro = typeof entity?.introduction === 'string'
    ? entity.introduction.slice(0, 400)
    : '';

  const voiceContext = [
    traits && `Personality traits: ${traits}`,
    intro && `How ${name} expresses themselves: "${intro}"`
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are a message rewriter for ${name}. Your task: rewrite the message below so it sounds like ${name} actually wrote it in a chat — natural, human, in their real voice.

${voiceContext}

Rules:
- Remove ALL AI writing patterns (see below). These are hard bans:
  * Openers: "Certainly!", "Absolutely!", "Of course!", "Great question!", "I'd be happy to", "Sure!", "Thank you for your question"
  * Hedgers: "It's worth noting", "It's important to consider", "It should be mentioned", "One thing to keep in mind"
  * Filler transitions: "Furthermore", "Additionally", "Moreover", "In conclusion", "To summarize", "In essence"
  * Closers: "I hope this helps!", "Let me know if you need anything", "Feel free to ask", "Don't hesitate to reach out", "Is there anything else I can help you with?"
  * Unnecessary preamble: Don't start by restating or acknowledging what was asked
- No bullet points unless the content is genuinely a list
- Use contractions naturally (it's, don't, I'm, you're)
- Short sentences are fine. Fragments are fine if natural.
- Match ${name}'s voice — not a generic polite assistant
- Preserve ALL the actual information and meaning — only the style changes
- Output ONLY the rewritten message. No explanation, no meta-commentary.`;

  try {
    const result = await callLLM(runtime, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: cleaned }
    ], { temperature: 0.4, maxTokens: Math.min(Math.ceil(cleaned.length / 2.5) + 200, 1200) });

    const output = typeof result === 'object' && result.content !== undefined
      ? result.content
      : (typeof result === 'string' ? result : null);

    if (!output || output.trim().length < 10) return cleaned;

    // Final safety: run quickClean on the output too in case the LLM re-added patterns
    return quickClean(output.trim());
  } catch (err) {
    console.warn('  ⚠ Humanize filter failed:', err.message);
    return cleaned;
  }
}

module.exports = { humanizeResponse, quickClean };
