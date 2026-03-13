// ============================================================
// REM System — Topic Utilities
// Normalization, stemming & synonym expansion for topic indexing.
// Zero external dependencies — lightweight suffix rules only.
// ============================================================

// ── Synonym Map ────────────────────────────────────────────
// Maps canonical form → [aliases]. All entries are lowercase.
// Both directions are indexed at init for O(1) lookup.
const SYNONYM_GROUPS = [
  ['architecture', 'system design', 'system architecture', 'software architecture', 'design pattern'],
  ['memory', 'memories', 'remembrance', 'recollection', 'recall'],
  ['emotion', 'feeling', 'sentiment', 'mood', 'affect'],
  ['learn', 'learning', 'education', 'study', 'knowledge acquisition'],
  ['goal', 'goals', 'objective', 'objectives', 'target', 'targets', 'aim'],
  ['identity', 'self', 'self-concept', 'self-awareness', 'selfhood'],
  ['relationship', 'relationships', 'connection', 'connections', 'bond', 'bonds'],
  ['problem', 'issue', 'challenge', 'difficulty'],
  ['problem-solving', 'problem solving', 'troubleshooting', 'debugging'],
  ['creative', 'creativity', 'imagination', 'inventive', 'innovation'],
  ['think', 'thinking', 'thought', 'thoughts', 'reasoning', 'cognition', 'cognitive'],
  ['communicate', 'communication', 'conversation', 'dialogue', 'dialog', 'chat'],
  ['curious', 'curiosity', 'wonder', 'inquisitive'],
  ['empathy', 'empathetic', 'compassion', 'compassionate', 'understanding'],
  ['growth', 'development', 'progress', 'evolving', 'evolution', 'maturity'],
  ['plan', 'planning', 'strategy', 'strategic'],
  ['analyze', 'analysis', 'analytical', 'data analysis', 'examine'],
  ['adapt', 'adaptability', 'flexible', 'flexibility', 'versatile'],
  ['collaborate', 'collaboration', 'teamwork', 'cooperate', 'cooperation'],
  ['personality', 'persona', 'character', 'temperament', 'traits'],
  ['dream', 'dreams', 'dreaming', 'subconscious'],
  ['happy', 'happiness', 'joy', 'joyful', 'content', 'contentment'],
  ['sad', 'sadness', 'sorrow', 'melancholy', 'grief'],
  ['fear', 'afraid', 'anxiety', 'anxious', 'worry', 'worried'],
  ['trust', 'trustworthy', 'reliable', 'reliability', 'dependable'],
  ['purpose', 'meaning', 'meaningful', 'significance'],
  ['code', 'coding', 'programming', 'software', 'development'],
  ['help', 'helping', 'assist', 'assistance', 'support'],
  ['balance', 'equilibrium', 'harmony', 'stability'],
  ['intuition', 'instinct', 'gut feeling', 'hunch'],
];

// Build bidirectional lookup: word → canonical (first in group)
const _synonymToCanonical = {};
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const word of group) {
    _synonymToCanonical[word] = canonical;
  }
}

// ── Stemming Rules ─────────────────────────────────────────
// Lightweight English suffix stripping — covers ~80% of cases
// without a full Porter stemmer. Order matters (longest first).

const STEM_RULES = [
  // Gerund / progressive
  { suffix: 'izing',  min: 6, replace: 'ize' },
  { suffix: 'ising',  min: 6, replace: 'ise' },
  { suffix: 'ating',  min: 6, replace: 'ate' },
  { suffix: 'ting',   min: 5, replace: 't',   guard: /[aeiou]t$/ },
  { suffix: 'ning',   min: 5, replace: 'n',   guard: /[aeiou]n$/ },
  { suffix: 'ring',   min: 5, replace: 'r',   guard: /[aeiou]r$/ },
  { suffix: 'ling',   min: 5, replace: 'l',   guard: /[aeiou]l$/ },
  { suffix: 'ing',    min: 5, replace: '' },

  // Past tense
  { suffix: 'ated',   min: 6, replace: 'ate' },
  { suffix: 'ized',   min: 6, replace: 'ize' },
  { suffix: 'ised',   min: 6, replace: 'ise' },
  { suffix: 'lled',   min: 5, replace: 'll' },
  { suffix: 'rred',   min: 5, replace: 'r' },
  { suffix: 'tted',   min: 5, replace: 't' },
  { suffix: 'ied',    min: 5, replace: 'y' },
  { suffix: 'ed',     min: 4, replace: '' },

  // Plurals
  { suffix: 'ies',    min: 4, replace: 'y' },
  { suffix: 'ves',    min: 4, replace: 'f' },
  { suffix: 'ches',   min: 5, replace: 'ch' },
  { suffix: 'shes',   min: 5, replace: 'sh' },
  { suffix: 'sses',   min: 5, replace: 'ss' },
  { suffix: 'xes',    min: 4, replace: 'x' },
  { suffix: 'zes',    min: 4, replace: 'z' },
  { suffix: 'ses',    min: 4, replace: 'se' },
  { suffix: 's',      min: 4, replace: '',   guard: /[^su]$/ },

  // Adverbs / adjective forms
  { suffix: 'fully',  min: 6, replace: 'ful' },
  { suffix: 'lessly', min: 7, replace: 'less' },
  { suffix: 'ness',   min: 5, replace: '' },
  { suffix: 'ment',   min: 5, replace: '' },
  { suffix: 'tion',   min: 5, replace: 'te' },
  { suffix: 'sion',   min: 5, replace: 'de' },
  { suffix: 'ity',    min: 5, replace: '' },
  { suffix: 'ous',    min: 5, replace: '' },
  { suffix: 'ive',    min: 5, replace: '' },
  { suffix: 'able',   min: 6, replace: '' },
  { suffix: 'ible',   min: 6, replace: '' },
  { suffix: 'ful',    min: 5, replace: '' },
  { suffix: 'less',   min: 5, replace: '' },
  { suffix: 'ly',     min: 5, replace: '' },
  { suffix: 'al',     min: 5, replace: '' },
  { suffix: 'er',     min: 4, replace: '',   guard: /[^aeiou]er$/ },
];

/**
 * Lightweight stem — strips one suffix layer.
 * Returns the stemmed word or the original if no rule matches.
 */
function stemWord(word) {
  if (!word || word.length < 4) return word;
  for (const rule of STEM_RULES) {
    if (word.length >= rule.min && word.endsWith(rule.suffix)) {
      const stemmed = word.slice(0, -rule.suffix.length) + rule.replace;
      if (rule.guard && !rule.guard.test(stemmed)) continue;
      if (stemmed.length >= 3) return stemmed;
    }
  }
  return word;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Normalize a single topic string.
 * - lowercase
 * - trim whitespace
 * - collapse multiple spaces / replace hyphens with spaces
 * - strip trailing punctuation
 */
function normalizeTopic(topic) {
  if (!topic || typeof topic !== 'string') return '';
  return topic
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, ' ')      // hyphens/underscores → spaces
    .replace(/\s+/g, ' ')        // collapse whitespace
    .replace(/[^a-z0-9 ]/g, '')  // strip non-alphanumeric (keep spaces)
    .trim();
}

/**
 * Stem a topic (may be multi-word).
 * Stems each word individually, then rejoins.
 */
function stemTopic(topic) {
  if (!topic) return '';
  return topic.split(' ').map(stemWord).join(' ');
}

/**
 * Get the canonical synonym for a topic, or the topic itself if no synonym.
 */
function getCanonical(topic) {
  return _synonymToCanonical[topic] || topic;
}

/**
 * Expand a single topic into all synonyms that share its group.
 * Returns array including the original topic.
 */
function expandSynonyms(topic) {
  const canonical = _synonymToCanonical[topic];
  if (!canonical) return [topic];
  const group = SYNONYM_GROUPS.find(g => g[0] === canonical);
  return group || [topic];
}

/**
 * Full normalization pipeline for a single topic string.
 * Returns the canonical normalized+stemmed form.
 *
 * Pipeline: raw → normalize → synonym canonical → stem
 */
function canonicalizeTopic(raw) {
  const normalized = normalizeTopic(raw);
  if (!normalized) return '';
  const canonical = getCanonical(normalized);
  return stemTopic(canonical);
}

/**
 * Process an array of topics through the full pipeline.
 * Returns deduplicated array of canonical forms.
 */
function normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];
  const seen = new Set();
  const result = [];
  for (const t of topics) {
    const canonical = canonicalizeTopic(t);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
}

/**
 * Expand a query topic into a set of search keys.
 * Used on the retrieval side to find all related index entries.
 *
 * Returns: Set of normalized/stemmed variants + synonym expansions
 */
function expandQueryTopic(raw) {
  const normalized = normalizeTopic(raw);
  if (!normalized) return new Set();

  const keys = new Set();

  // Add the normalized form
  keys.add(normalized);

  // Add stemmed form
  const stemmed = stemTopic(normalized);
  if (stemmed) keys.add(stemmed);

  // Add canonical synonym
  const canonical = getCanonical(normalized);
  if (canonical !== normalized) {
    keys.add(canonical);
    keys.add(stemTopic(canonical));
  }

  // Add all synonyms (normalized + stemmed)
  const synonyms = expandSynonyms(normalized);
  for (const syn of synonyms) {
    keys.add(syn);
    keys.add(stemTopic(syn));
  }

  // Also try synonym lookup on the stemmed form
  const stemCanonical = getCanonical(stemmed);
  if (stemCanonical !== stemmed) {
    const stemSynonyms = expandSynonyms(stemmed);
    for (const syn of stemSynonyms) {
      keys.add(syn);
      keys.add(stemTopic(syn));
    }
  }

  return keys;
}

module.exports = {
  normalizeTopic,
  stemTopic,
  stemWord,
  getCanonical,
  expandSynonyms,
  canonicalizeTopic,
  normalizeTopics,
  expandQueryTopic
};
