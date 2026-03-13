function asText(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload._text === 'string') return payload._text.trim();
  if (typeof payload.text === 'string') return payload.text.trim();
  return String(payload).trim();
}

function normalizeContributorOutputs(outputs = {}) {
  return {
    subconscious: asText(outputs.subconscious),
    conscious: asText(outputs.conscious),
    dreamIntuition: asText(outputs.dreamIntuition),
    refinement: asText(outputs.refinement)
  };
}

function validateSubconsciousOutput(payload) {
  const text = asText(payload);
  if (!text) return { ok: false, reason: 'empty-subconscious-output', value: '' };
  return { ok: true, value: text };
}

function validateConsciousOutput(payload) {
  const text = asText(payload);
  if (!text) return { ok: false, reason: 'empty-conscious-output', value: '' };
  return { ok: true, value: text };
}

function validateDreamIntuitionOutput(payload) {
  const text = asText(payload);
  if (!text) return { ok: false, reason: 'empty-dream-intuition-output', value: '' };
  return { ok: true, value: text };
}

module.exports = {
  normalizeContributorOutputs,
  validateSubconsciousOutput,
  validateConsciousOutput,
  validateDreamIntuitionOutput
};
