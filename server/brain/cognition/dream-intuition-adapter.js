function buildDreamIntuitionInput(turnSignals = {}, userMessage = '') {
  return {
    userMessage: String(userMessage || '').slice(0, 1200),
    subjects: Array.isArray(turnSignals.subjects) ? turnSignals.subjects.slice(0, 10) : [],
    events: Array.isArray(turnSignals.events) ? turnSignals.events.slice(0, 8) : [],
    emotion: turnSignals.emotion || { label: 'neutral', score: 0 },
    tension: Number(turnSignals.tension || 0),
    intentHints: Array.isArray(turnSignals.intentHints) ? turnSignals.intentHints.slice(0, 6) : []
  };
}

function toDreamIntuitionArtifact(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return 'No intuition links.';
  return text;
}

async function runDreamIntuition(runtime, input, callLLM, maxTokens = 260) {
  if (!runtime || typeof callLLM !== 'function') {
    return { _text: 'No dream-intuition runtime configured.', _usage: null };
  }

  const system = 'You are the Dream-Intuition contributor in a cognitive pipeline. Return concise abstract links only. No user-facing prose. No memory writes. Keep output to 4-8 short bullets.';
  const user = `Turn signals:\n${JSON.stringify(input, null, 2)}\n\nProduce abstract connections that could help the orchestrator synthesize a better final response.`;

  const result = await callLLM(runtime, [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { temperature: 0.65, maxTokens, returnUsage: true });

  const content = typeof result === 'object' && result.content !== undefined ? result.content : result;
  const usage = typeof result === 'object' && result.usage ? result.usage : null;
  const artifact = toDreamIntuitionArtifact(content);

  return { _text: artifact, _usage: usage, toString() { return artifact; } };
}

module.exports = {
  buildDreamIntuitionInput,
  runDreamIntuition,
  toDreamIntuitionArtifact
};
