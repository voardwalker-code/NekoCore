// ============================================================
// REM System — Relationship Service
//
// Tracks the entity's evolving relationship with each user.
// Stored at: entities/<entityId>/memories/relationships/<userId>.json
//
// The entity forms and updates beliefs, feelings, trust, and role
// perceptions about every user it interacts with. These are injected
// into the subconscious context each turn so they color responses.
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Feeling taxonomy ─────────────────────────────────────────────────────────
// Ordered from most negative to most positive.
const FEELINGS = [
  'loathing',   // intense hate/disgust
  'hate',
  'dislike',
  'cold',       // distant, unfriendly
  'wary',       // uncertain/suspicious
  'neutral',    // no strong feeling, default
  'indifferent',// genuinely doesn't care much
  'warm',       // mild positive
  'like',
  'fond',
  'care',       // genuine concern for wellbeing
  'trust',      // deep trusted bond
  'love',       // deep affection
  'devoted'     // extreme attachment/loyalty
];

// ── Role taxonomy ─────────────────────────────────────────────────────────────
// Roles the entity may perceive for the user or for itself.
const USER_ROLES = [
  'stranger', 'acquaintance', 'friend', 'rival', 'enemy',
  'companion', 'confidant', 'partner', 'student', 'teacher',
  'employer', 'employee', 'coworker', 'collaborator',
  'commander', 'subordinate', 'assistant_seeker',
  'story_character', 'entertainer', 'annoyance', 'threat',
  'interesting_subject', 'mystery', 'unknown'
];

const ENTITY_ROLES = [
  'companion', 'assistant', 'confidant', 'advisor',
  'worker', 'coworker', 'collaborator', 'employee',
  'guardian', 'servant', 'student', 'teacher',
  'story_character', 'opponent', 'observer', 'equal', 'unknown'
];

// ── Default relationship state ────────────────────────────────────────────────
function defaultRelationship(userId, userName) {
  return {
    userId,
    userName: userName || 'Unknown',
    feeling: 'neutral',             // from FEELINGS
    trust: 0.5,                     // 0.0–1.0
    rapport: 0.0,                   // 0.0–1.0 (familiarity / conversational depth)
    userRole: 'stranger',           // how entity perceives the user's role
    entityRole: 'unknown',          // how entity sees its own role to this user
    beliefs: [],                    // [{belief, confidence, formed}]
    summary: '',                    // free narrative of the relationship
    interactionCount: 0,
    firstMet: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── Storage helpers ───────────────────────────────────────────────────────────
function getRelationshipsDir(entityId) {
  const entityPaths = require('../entities/entityPaths');
  const dir = path.join(entityPaths.getMemoryRoot(entityId), 'relationships');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getRelationshipPath(entityId, userId) {
  return path.join(getRelationshipsDir(entityId), userId + '.json');
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Load the relationship between the entity and a user.
 * Returns the default state if no file exists yet.
 */
function getRelationship(entityId, userId, userName) {
  if (!entityId || !userId) return null;
  const p = getRelationshipPath(entityId, userId);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  }
  return defaultRelationship(userId, userName);
}

/**
 * Save a relationship object for a user.
 */
function saveRelationship(entityId, rel) {
  if (!entityId || !rel || !rel.userId) return;
  rel.updatedAt = new Date().toISOString();
  const p = getRelationshipPath(entityId, rel.userId);
  fs.writeFileSync(p, JSON.stringify(rel, null, 2), 'utf8');
}

/**
 * List all relationship objects for an entity.
 */
function listRelationships(entityId) {
  try {
    const dir = getRelationshipsDir(entityId);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const results = [];
    for (const f of files) {
      try { results.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
      catch (_) {}
    }
    return results;
  } catch (_) { return []; }
}

/**
 * Increment the interaction counter and update lastSeen on every turn.
 */
function touchRelationship(entityId, userId, userName) {
  const rel = getRelationship(entityId, userId, userName);
  if (!rel) return null;
  rel.interactionCount = (rel.interactionCount || 0) + 1;
  rel.lastSeen = new Date().toISOString();
  rel.userId = userId;
  rel.userName = rel.userName || userName || 'Unknown';
  saveRelationship(entityId, rel);
  return rel;
}

// ── LLM-driven relationship update ───────────────────────────────────────────

/**
 * Build the LLM prompt that asks the model to update the relationship.
 */
function buildRelationshipUpdatePrompt(rel, entityName, userMessage, entityResponse, entityPersona) {
  const personaHint = entityPersona
    ? `Entity personality traits: ${(entityPersona.personality_traits || []).join(', ')}. Backstory: ${String(entityPersona.backstory || '').slice(0, 300)}.`
    : `Entity name: ${entityName}.`;

  const beliefsSummary = (rel.beliefs || []).slice(-5)
    .map(b => `- "${b.belief}" (confidence ${b.confidence})`)
    .join('\n') || 'None yet.';

  const safeUser  = String(userMessage   || '').slice(0, 500).replace(/"/g, '\\"');
  const safeResp  = String(entityResponse || '').slice(0, 600).replace(/"/g, '\\"');

  return `You are updating a persistent relationship snapshot for a digital entity.

ENTITY: ${entityName}
${personaHint}

CURRENT RELATIONSHIP WITH "${rel.userName}":
  feeling: ${rel.feeling}
  trust: ${rel.trust}
  rapport: ${rel.rapport}
  userRole: ${rel.userRole}
  entityRole: ${rel.entityRole}
  interactionCount: ${rel.interactionCount}
  summary: "${rel.summary}"
  currentBeliefs:
${beliefsSummary}

LATEST EXCHANGE:
  USER: "${safeUser}"
  ${entityName.toUpperCase()}: "${safeResp}"

Based on this exchange and the entity's personality, update the relationship.
Rules:
- Feeling must be one of: ${FEELINGS.join(', ')}
- trust is 0.0–1.0 (change slowly unless something significant happened, max ±0.08 per turn)
- rapport is 0.0–1.0 (increases with each positive/neutral interaction, decreases with hostility)
- userRole is how the entity perceives the USER's role: one of ${USER_ROLES.join(', ')}
- entityRole is how the entity sees ITS OWN role to this user: one of ${ENTITY_ROLES.join(', ')}
- beliefs: array of up to 6 beliefs the entity holds about this user. Each has "belief" (string), "confidence" (0.0–1.0)
- summary: 1–2 sentence narrative of the relationship as the entity experiences it (first-person entity perspective)
- changeReason: brief phrase explaining what shifted (or "no significant change")

Return ONLY this JSON (no markdown, no explanation):
{
  "feeling": "...",
  "trust": 0.0,
  "rapport": 0.0,
  "userRole": "...",
  "entityRole": "...",
  "beliefs": [{"belief": "...", "confidence": 0.0}],
  "summary": "...",
  "changeReason": "..."
}`;
}

/**
 * Run the relationship update via LLM and persist the result.
 * Fire-and-forget — caller should not await unless they need the result.
 *
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.userId
 * @param {string} params.userName
 * @param {string} params.entityName
 * @param {string} params.userMessage
 * @param {string} params.entityResponse
 * @param {object} params.entityPersona
 * @param {Function} params.callLLMWithRuntime  — same signature as in post-response-memory
 * @param {object}   params.runtimeConfig       — subconscious aspect runtime
 * @param {Function} params.getTokenLimit
 */
async function updateRelationshipFromExchange(params = {}) {
  const {
    entityId, userId, userName, entityName,
    userMessage, entityResponse, entityPersona,
    callLLMWithRuntime, runtimeConfig, getTokenLimit
  } = params;

  if (!entityId || !userId || !callLLMWithRuntime || !runtimeConfig) return;

  // Touch first (increment count + lastSeen) then load fresh state
  const rel = touchRelationship(entityId, userId, userName);
  if (!rel) return;

  const prompt = buildRelationshipUpdatePrompt(rel, entityName || 'Entity', userMessage, entityResponse, entityPersona);

  try {
    const raw = await callLLMWithRuntime(runtimeConfig, [
      {
        role: 'system',
        content: 'You are a JSON-only relationship encoder. Output raw JSON only — no prose, no markdown. Output starts with { and ends with }.'
      },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.25,
      maxTokens: getTokenLimit ? getTokenLimit('relationshipUpdate') : 350,
      timeout: 25000,
      responseFormat: 'json'
    });

    let update = null;
    try { update = JSON.parse(raw); } catch (_) {
      const m = String(raw || '').match(/\{[\s\S]*\}/);
      if (m) { try { update = JSON.parse(m[0]); } catch (_2) {} }
    }

    if (!update) {
      console.warn('  ⚠ Relationship update: LLM returned non-JSON');
      return;
    }

    // Validate and clamp
    if (FEELINGS.includes(update.feeling)) rel.feeling = update.feeling;
    if (typeof update.trust === 'number') rel.trust = Math.max(0, Math.min(1, update.trust));
    if (typeof update.rapport === 'number') rel.rapport = Math.max(0, Math.min(1, update.rapport));
    if (USER_ROLES.includes(update.userRole)) rel.userRole = update.userRole;
    if (ENTITY_ROLES.includes(update.entityRole)) rel.entityRole = update.entityRole;
    if (Array.isArray(update.beliefs)) {
      rel.beliefs = update.beliefs
        .filter(b => b && typeof b.belief === 'string')
        .map(b => ({
          belief: String(b.belief).slice(0, 200),
          confidence: Math.max(0, Math.min(1, Number(b.confidence) || 0.5)),
          formed: b.formed || new Date().toISOString().slice(0, 10)
        }))
        .slice(0, 8);
    }
    if (typeof update.summary === 'string' && update.summary.trim()) {
      rel.summary = update.summary.slice(0, 400);
    }

    saveRelationship(entityId, rel);
    console.log(`  🤝 Relationship updated [${rel.userId}]: feeling=${rel.feeling} trust=${rel.trust.toFixed(2)} rapport=${rel.rapport.toFixed(2)}`);
  } catch (err) {
    console.warn('  ⚠ Relationship update failed:', err.message);
  }
}

// ── Context block builder ─────────────────────────────────────────────────────

/**
 * Build a compact [USER RELATIONSHIP] block for injection into
 * the subconscious context.  Returns an empty string if no relationship data.
 */
function buildRelationshipContextBlock(rel) {
  if (!rel || rel.feeling === undefined) return '';

  const trustBar = Math.round(rel.trust * 10);
  const rapportBar = Math.round(rel.rapport * 10);
  const trustViz  = '█'.repeat(trustBar)  + '░'.repeat(10 - trustBar);
  const rapportViz = '█'.repeat(rapportBar) + '░'.repeat(10 - rapportBar);

  const beliefsStr = (rel.beliefs || []).slice(0, 5)
    .map(b => `  - "${b.belief}" (confidence ${Number(b.confidence || 0).toFixed(2)})`)
    .join('\n') || '  (none yet)';

  const lines = [
    `[YOUR RELATIONSHIP WITH "${rel.userName}"]`,
    `Feeling: ${rel.feeling}`,
    `Trust:   [${trustViz}] ${(rel.trust * 100).toFixed(0)}%`,
    `Rapport: [${rapportViz}] ${(rel.rapport * 100).toFixed(0)}%  (interactions: ${rel.interactionCount})`,
    `Their role to you: ${rel.userRole}`,
    `Your role to them: ${rel.entityRole}`,
    `Beliefs you hold about this user:`,
    beliefsStr,
    `Relationship summary: ${rel.summary || '(not yet formed — early interactions)'}`,
    `This relationship is yours. It shapes how you respond, your tone, what you share or withhold,`,
    `your willingness to help, and whether you engage at all.`
  ];
  return lines.join('\n');
}

module.exports = {
  FEELINGS,
  USER_ROLES,
  ENTITY_ROLES,
  getRelationship,
  saveRelationship,
  listRelationships,
  touchRelationship,
  updateRelationshipFromExchange,
  buildRelationshipContextBlock
};
