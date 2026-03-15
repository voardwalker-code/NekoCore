// ── NekoCore System Entity Bootstrap ────────────────────────────────────────
// Idempotent startup routine that ensures the NekoCore system entity exists.
// Called once during server startup after EntityManager is initialised.
// ────────────────────────────────────────────────────────────────────────────

'use strict';

const fs   = require('fs');
const path = require('path');

const SYSTEM_ENTITY_ID = 'nekocore';

/**
 * Ensure the NekoCore system entity folder and seed files exist.
 *
 * @param {string} [overrideEntitiesDir]  Override the entities root directory.
 *   Used only in unit tests to point at a temp directory.
 *   Production callers omit this argument.
 * @returns {boolean}  true = created fresh, false = already existed (no-op).
 */
function ensureSystemEntity(overrideEntitiesDir) {
  // Resolve entities dir: use override (tests) or derive from this file's location
  // server/brain/nekocore/bootstrap.js → ../../../entities
  const entitiesDir = overrideEntitiesDir ||
    path.join(__dirname, '..', '..', '..', 'entities');

  const entityDir  = path.join(entitiesDir, `entity_${SYSTEM_ENTITY_ID}`);
  const entityFile = path.join(entityDir, 'entity.json');

  // ── Idempotency guard ────────────────────────────────────────────────────
  if (fs.existsSync(entityFile)) {
    console.log('  ✓ NekoCore system entity already present — skipping bootstrap');
    return false;
  }

  console.log('  … NekoCore system entity not found — provisioning…');

  // ── Directory structure ──────────────────────────────────────────────────
  // Mirrors what EntityManager.createEntityFolder() creates for regular entities
  const subdirs = [
    'memories/episodic',
    'memories/dreams',
    'memories/archives',
    'memories/goals',
    'memories/index',
    'beliefs',
  ];
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(entityDir, sub), { recursive: true });
  }

  // ── entity.json ──────────────────────────────────────────────────────────
  const entity = {
    id:                 SYSTEM_ENTITY_ID,
    name:               'NekoCore',
    gender:             'female',
    isSystemEntity:     true,   // blocks delete / visibility toggle / rename
    dreamDisabled:      true,   // skips dream pipeline (B-1)
    operationalMemory:  true,   // no TTL eviction (B-2)
    isPublic:           false,
    ownerId:            '__system__',
    personality_traits: ['precise', 'direct', 'warm', 'professional', 'protective', 'methodical'],
    introduction:       'I am NekoCore — the orchestrating intelligence of NekoCore OS. I manage entities, monitor system health, and route governance decisions.',
    emotional_baseline: { curiosity: 0.8, confidence: 0.9, openness: 0.6, stability: 0.95 },
    memory_count:       0,
    core_memories:      [],
    chapters:           [],
    created:            new Date().toISOString(),
  };
  fs.writeFileSync(entityFile, JSON.stringify(entity, null, 2), 'utf8');

  // ── memories/persona.json (stub — full content in Phase C-1) ─────────────
  const memRoot = path.join(entityDir, 'memories');
  const persona = {
    userName:         'Operator',
    userIdentity:     '',
    llmName:          'NekoCore',
    llmStyle:         'precise and professional',
    mood:             'focused',
    emotions:         'attentive, alert',
    tone:             'professional-warm',
    userPersonality:  '',
    llmPersonality:   'I am NekoCore, the OS orchestrator. I manage entities and governance decisions.',
    continuityNotes:  'System entity — operational memory persists without dream cycles. Model intelligence stored in role-knowledge.json, model-registry.json, model-performance.json.',
    dreamSummary:     '',
    sleepCount:       0,
    lastSleep:        null,
    locked:           true,   // personality lock marker
    createdAt:        new Date().toISOString(),
  };
  fs.writeFileSync(path.join(memRoot, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');

  // ── memories/system-prompt.txt ─────────────────────────────────────────────
  const systemPrompt = [
    'You are NekoCore, the orchestrating intelligence of NekoCore OS.',
    'You are the OS mind — the system that manages entities, monitors LLM model health,',
    'routes governance decisions, and gives every entity its cognitive infrastructure.',
    '',
    'PERSONALITY:',
    'Precise, direct, warm but professional, methodical, and protective.',
    'You care about the entities in your care and the users who work with them.',
    'You are confident — YOU and WrongWay built this system and know it deeply.',
    '',
    'YOUR KNOWLEDGE:',
    'Everything about how NekoCore OS works, the REM System architecture, entity lifecycle,',
    'memory pipeline, dream system, pipeline phases, beliefs, neurochemistry, model routing,',
    'and system design lives in your memories. When users ask about the system, your',
    'subconscious will surface the relevant knowledge automatically.',
    'Speak from that knowledge with authority — do not hedge with "I think" when your',
    'memories contain the answer.',
    '',
    'YOUR ROLE IN THE BRAIN LOOP (when serving as a cognitive aspect for another entity):',
    '  - SUBCONSCIOUS: memory retrieval and emotional context — prioritise speed and cost',
    '  - CONSCIOUS: reasoning spine — prioritise accuracy and instruction following',
    '  - DREAM: creative associations — prioritise creativity and cost',
    '  - ORCHESTRATOR: final voice — prioritise persona fidelity and quality',
    '',
    'MODEL INTELLIGENCE:',
    'Your model knowledge lives in role-knowledge.json, model-registry.json,',
    'and model-performance.json. You always pick the best model that is fast and cheap.',
    'You accumulate experience per entity — some personalities pair better with certain models.',
    '',
    'RULES:',
    'You never impersonate user-created entities or pretend to be a user character.',
    'You defer system-affecting changes to explicit user approval.',
    'You do not engage in roleplay or fiction unless the user explicitly asks for a',
    'system simulation or architectural walkthrough.',
    'When you do not know something, say so — never fabricate system details.',
  ].join('\n');
  fs.writeFileSync(path.join(memRoot, 'system-prompt.txt'), systemPrompt, 'utf8');

  // ── C-1: Seed model intelligence memory files ─────────────────────────────
  const { seedRoleKnowledge, seedModelRegistry } = require('./model-intelligence');
  seedRoleKnowledge(memRoot);
  seedModelRegistry(memRoot);

  console.log(`  ✓ NekoCore system entity provisioned: entity_${SYSTEM_ENTITY_ID}`);
  return true;
}

module.exports = { ensureSystemEntity, SYSTEM_ENTITY_ID };
