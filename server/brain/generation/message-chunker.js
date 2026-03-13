// ============================================================
// Message Chunker
// Splits a response into natural conversational send-units,
// mimicking how a human sends 1-2 sentences at a time rather
// than one giant paragraph.
// ============================================================

/**
 * Split text into natural conversational chunks.
 * Each chunk is 1-2 sentences. Short responses (≤ 2 sentences)
 * are returned as-is (no split needed).
 *
 * @param {string} text - Full response text
 * @param {number} [maxChunks=6] - Hard cap on number of chunks
 * @returns {string[]} Array of chunks (always at least 1 element)
 */
function splitIntoChunks(text, maxChunks = 6) {
  const raw = (text || '').trim();
  if (!raw) return [raw];

  // Detect code blocks — don't split responses that are primarily code
  const codeBlockCount = (raw.match(/```/g) || []).length;
  if (codeBlockCount >= 2) return [raw];

  // Split on sentence endings followed by whitespace + start of new sentence
  // Handles: period, !, ? followed by space and capital letter or end
  // Uses lookbehind so the punctuation stays with the sentence
  const parts = raw.split(/(?<=[.!?])\s+(?=[A-Z"'`*#\[\-]|\d{1,2}\s)/);
  const sentences = parts.map(s => s.trim()).filter(Boolean);

  // Short responses don't need splitting
  if (sentences.length <= 2) return [raw];

  const chunks = [];
  let i = 0;

  while (i < sentences.length) {
    // If we've hit the last allowed chunk, absorb remaining sentences
    if (chunks.length >= maxChunks - 1) {
      chunks.push(sentences.slice(i).join(' '));
      break;
    }

    const a = sentences[i];
    const b = sentences[i + 1];

    // Pair two short sentences into one chunk if combined length is comfortable
    if (b && a.length < 130 && (a.length + 1 + b.length) <= 200) {
      chunks.push(a + ' ' + b);
      i += 2;
    } else {
      // Long sentence — goes in its own chunk
      chunks.push(a);
      i += 1;
    }
  }

  return chunks.length > 0 ? chunks : [raw];
}

/**
 * Calculate how long to pause before "sending" a chunk, in milliseconds.
 * Models a human composing and reviewing a short message.
 *
 * @param {string} chunk
 * @returns {number} Delay in ms
 */
function chunkDelay(chunk) {
  // Base 700ms + ~30ms per character, capped at 3800ms, plus small jitter
  const base = 700 + Math.min(chunk.length * 30, 3100);
  const jitter = Math.floor(Math.random() * 350);
  return base + jitter;
}

module.exports = { splitIntoChunks, chunkDelay };
