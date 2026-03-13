const { humanizeResponse, quickClean } = require('../brain/generation/humanize-filter');
const { splitIntoChunks } = require('../brain/generation/message-chunker');

function isLongFormRequested(userMsg = '') {
  const t = String(userMsg || '').toLowerCase();
  const signals = [
    'deep dive', 'in depth', 'detailed', 'full detail', 'thorough',
    'step by step', 'walk me through', 'comprehensive', 'long form',
    'expand', 'elaborate', 'explain fully'
  ];
  return signals.some((s) => t.includes(s));
}

function enforceSentenceCap(text, maxSentences = 6) {
  const src = String(text || '').trim();
  if (!src) return src;

  const chunks = src.match(/[^.!?\n]+[.!?]?/g) || [src];
  const sentences = chunks.map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= maxSentences) return src;

  let out = sentences.slice(0, maxSentences).join(' ').trim();
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
}

async function postProcessResponse(params = {}) {
  const {
    finalResponse,
    effectiveUserMessage,
    entity,
    aspectConfigs,
    loadConfig,
    callLLMWithRuntime
  } = params;

  const cfg = loadConfig();
  const naturalChatEnabled = cfg.naturalChat?.enabled !== false;
  const humanizeEnabled = cfg.naturalChat?.humanize !== false;

  if (!naturalChatEnabled) {
    return { finalResponse, chunks: null };
  }

  try {
    let polished = String(finalResponse || '');

    // The orchestrator already writes in the entity's voice — a second LLM
    // "humanize" pass through a weaker model was causing the free model to
    // output meta-instructions ("We need to rewrite...") instead of following
    // them.  quickClean (regex-only, no LLM) still strips AI openers/closers.
    polished = quickClean(polished);

    const shouldCapSentences = !isLongFormRequested(effectiveUserMessage);
    if (shouldCapSentences) {
      polished = enforceSentenceCap(polished, 6);
    }

    return {
      finalResponse: polished,
      chunks: splitIntoChunks(polished)
    };
  } catch (err) {
    return {
      finalResponse,
      chunks: null,
      error: err
    };
  }
}

module.exports = {
  postProcessResponse,
  enforceSentenceCap,
  isLongFormRequested
};
