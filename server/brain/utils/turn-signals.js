function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function uniqueCap(items, cap = 12) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const v = String(item || '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

function extractSubjects(text) {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'those', 'these',
    'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'it', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'i', 'you', 'we', 'they', 'he', 'she', 'them', 'my', 'your', 'our', 'their',
    'me', 'us', 'do', 'does', 'did', 'done', 'can', 'could', 'should', 'would', 'will', 'just', 'about'
  ]);
  const tokens = tokenize(text).filter((t) => t.length >= 4 && !stop.has(t));
  return uniqueCap(tokens, 10);
}

function extractEventCues(text) {
  const t = String(text || '').toLowerCase();
  const cues = [];
  if (t.includes('?')) cues.push('question');
  if (/\b(help|fix|debug|implement|build|create|update|change|review|plan)\b/.test(t)) cues.push('task_request');
  if (/\b(error|failed|broken|issue|bug|problem|not working)\b/.test(t)) cues.push('error_report');
  if (/\b(should|must|need to|have to|required)\b/.test(t)) cues.push('constraint');
  if (/\b(idea|think|maybe|what if)\b/.test(t)) cues.push('exploration');
  return uniqueCap(cues, 8);
}

function detectLightEmotion(text) {
  const t = String(text || '').toLowerCase();
  const negative = ['frustrated', 'angry', 'annoyed', 'upset', 'broken', 'problem', 'issue', 'stuck'];
  const positive = ['great', 'good', 'awesome', 'perfect', 'nice', 'love'];
  const urgency = ['now', 'asap', 'urgent', 'immediately'];

  const negHits = negative.filter((w) => t.includes(w)).length;
  const posHits = positive.filter((w) => t.includes(w)).length;
  const urgHits = urgency.filter((w) => t.includes(w)).length;

  let label = 'neutral';
  if (negHits > posHits) label = 'concern';
  if (posHits > negHits) label = 'positive';
  if (urgHits > 0 && label === 'neutral') label = 'urgent';

  const score = Math.max(0, Math.min(1, (Math.max(negHits, posHits) * 0.25) + (urgHits * 0.15)));
  return { label, score };
}

function detectTensionMarkers(text) {
  const t = String(text || '').toLowerCase();
  let score = 0;
  if (/\b(frustrated|angry|annoyed|upset|wtf|fuck|shit)\b/.test(t)) score += 0.45;
  if (/\b(error|failed|broken|not working|stuck)\b/.test(t)) score += 0.3;
  if (/\b(urgent|asap|now|immediately)\b/.test(t)) score += 0.2;
  if (t.includes('!')) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

function extractIntentHints(text) {
  const t = String(text || '').toLowerCase();
  const hints = [];
  if (/\b(plan|design|architecture|strategy)\b/.test(t)) hints.push('planning');
  if (/\bfix|bug|error|broken|not working\b/.test(t)) hints.push('debugging');
  if (/\bimplement|build|code|create\b/.test(t)) hints.push('implementation');
  if (/\bdocument|docs|readme|changelog\b/.test(t)) hints.push('documentation');
  if (/\bexplain|how|why\b/.test(t)) hints.push('explanation');
  return uniqueCap(hints, 6);
}

function extractTurnSignals(userMessage, chatHistory = []) {
  const message = String(userMessage || '');
  return {
    subjects: extractSubjects(message),
    events: extractEventCues(message),
    emotion: detectLightEmotion(message),
    tension: detectTensionMarkers(message),
    intentHints: extractIntentHints(message),
    hasQuestion: message.includes('?'),
    chatHistoryCount: Array.isArray(chatHistory) ? chatHistory.length : 0,
    generatedAt: Date.now()
  };
}

module.exports = {
  extractTurnSignals,
  extractSubjects,
  extractEventCues,
  detectLightEmotion,
  detectTensionMarkers,
  extractIntentHints
};
