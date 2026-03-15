// ── Entity Routes ─────────────────────────────────────────────
// /api/entity, /api/entities/*, /api/entity-intro,
// /api/entity-last-memory, /api/hatch

const BrainLoop = require('../brain/brain-loop');
const MemoryService = require('../services/memory-service');
const MemoryStorage = require('../brain/memory-storage');
const entityCheckout = require('../services/entity-checkout');

function createEntityRoutes(ctx) {
  const { fs, path } = ctx;

  function getPreferredGlobalProfileForEntity(entityId) {
    const cfg = ctx.loadConfig ? ctx.loadConfig() : {};
    const fallback = cfg?.lastActive || null;
    if (!entityId) return fallback;
    try {
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(entityId);
      const entityFile = path.join(entityPaths.getEntityRoot(canonicalId), 'entity.json');
      if (!fs.existsSync(entityFile)) return fallback;
      const entity = JSON.parse(fs.readFileSync(entityFile, 'utf8'));
      const ref = String(entity?.configProfileRef || '').trim();
      if (ref && cfg?.profiles?.[ref]) return ref;
    } catch (_) {}
    return fallback;
  }

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/entity' && m === 'GET') { await getEntity(req, res, apiHeaders); return true; }
    // ── User profile routes ──
    if (p === '/api/users' && m === 'GET') { getUsersList(req, res, apiHeaders); return true; }
    if (p === '/api/users' && m === 'POST') { await postCreateUser(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/users/active' && m === 'GET') { getUsersActive(req, res, apiHeaders); return true; }
    if (p === '/api/users/active' && m === 'POST') { await postSetActiveUser(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/users/active' && m === 'DELETE') { deleteActiveUser(req, res, apiHeaders); return true; }
    if (p.startsWith('/api/users/') && m === 'PUT') { await putUpdateUser(req, res, apiHeaders, readBody, p); return true; }
    if (p.startsWith('/api/users/') && m === 'DELETE') { deleteUserProfile(req, res, apiHeaders, p); return true; }
    // ── Relationship routes ──
    if (p === '/api/relationships' && m === 'GET') { getRelationshipsList(req, res, apiHeaders); return true; }
    if (p === '/api/relationships/active' && m === 'GET') { getActiveRelationship(req, res, apiHeaders); return true; }
    if (p.startsWith('/api/relationships/') && m === 'GET') { getRelationshipByUser(req, res, apiHeaders, p); return true; }
    if (p === '/api/entities' && m === 'GET') { getEntities(req, res, apiHeaders); return true; }
    if (p === '/api/entities/current' && m === 'GET') { getEntitiesCurrent(req, res, apiHeaders); return true; }
    if (p === '/api/entities/load' && m === 'POST') { await postEntitiesLoad(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/create' && m === 'POST') { await postEntitiesCreate(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/create-hatch' && m === 'POST') { await postEntitiesCreateHatch(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/create-guided' && m === 'POST') { await postEntitiesCreateGuided(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/create-character' && m === 'POST') { await postEntitiesCreateCharacter(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/onboarding-seed' && m === 'POST') { await postEntitiesOnboardingSeed(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/delete'     && m === 'POST') { await postEntitiesDelete(req, res, apiHeaders, readBody);     return true; }
    if (p === '/api/entities/visibility'  && m === 'POST') { await postEntitiesVisibility(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entities/heal' && m === 'POST') { await postEntitiesHeal(req, res, apiHeaders); return true; }
    if (p === '/api/entities/release' && m === 'POST') { await postEntitiesRelease(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/entity/profile' && m === 'GET') { getEntityProfile(req, res, apiHeaders); return true; }
    if (p === '/api/entities/preview' && m === 'GET') { getEntityPreview(req, res, apiHeaders, url); return true; }
    if (p === '/api/entity-intro' && m === 'GET') { await getEntityIntro(req, res, apiHeaders); return true; }
    if (p === '/api/entity-last-memory' && m === 'GET') { await getEntityLastMemory(req, res); return true; }
    if (p === '/api/hatch' && m === 'POST') { await postHatch(req, res, apiHeaders, readBody); return true; }
    return false;
  }

  function _reinitBrainLoop() {
    const _cfg = (ctx.loadConfig ? ctx.loadConfig() : {});
    const _dreamInterval = (_cfg.sleep && _cfg.sleep.dreamInterval) ? _cfg.sleep.dreamInterval : 5;
    ctx.brainLoop = new BrainLoop({
      memoryStorage: ctx.memoryStorage, traceGraph: ctx.traceGraph, dreamEngine: ctx.dreamEngine,
      goalsManager: ctx.goalsManager, modelRouter: ctx.modelRouter, beliefGraph: ctx.beliefGraph,
      neurochemistry: ctx.neurochemistry, somaticAwareness: ctx.somaticAwareness,
      boredomEngine: ctx.boredomEngine, dreamVisualizer: ctx.dreamVisualizer,
      consciousMemory: ctx.consciousMemory, cognitivePulse: ctx.cognitivePulse,
      dreamSeedPool: ctx.dreamSeedPool, dreamMemory: ctx.dreamMemory,
      consciousEngine: ctx.consciousEngine, subconsciousAgent: ctx.subconsciousAgent,
      memoryIndex: ctx.memoryIndex, identityManager: ctx.identityManager, getTokenLimit: ctx.getTokenLimit
    });
    ctx.brainLoop.init({
      memoryDir: ctx.currentEntityPath, memoryStorage: ctx.memoryStorage, traceGraph: ctx.traceGraph,
      dreamEngine: ctx.dreamEngine, goalsManager: ctx.goalsManager, modelRouter: ctx.modelRouter,
      beliefGraph: ctx.beliefGraph, neurochemistry: ctx.neurochemistry, somaticAwareness: ctx.somaticAwareness,
      boredomEngine: ctx.boredomEngine, consciousEngine: ctx.consciousEngine, subconsciousAgent: ctx.subconsciousAgent,
      memoryIndex: ctx.memoryIndex, identityManager: ctx.identityManager, consciousMemory: ctx.consciousMemory,
      cognitivePulse: ctx.cognitivePulse, dreamSeedPool: ctx.dreamSeedPool, dreamMemory: ctx.dreamMemory,
      dreamInterval: _dreamInterval
    });
  }

  async function getEntity(req, res, apiHeaders) {
    try {
      const entity = ctx.hatchEntity.loadEntity();
      if (!entity) { res.writeHead(200, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'Entity not found' })); return; }
      let memCount = entity.memory_count || 0;
      if (ctx.currentEntityId) {
        try {
          const entityPathsMod = require('../entityPaths');
          const episodicDir = entityPathsMod.getEpisodicMemoryPath(ctx.currentEntityId);
          if (fs.existsSync(episodicDir)) {
            memCount = fs.readdirSync(episodicDir).filter(f => {
              const fp = path.join(episodicDir, f);
              return fs.statSync(fp).isDirectory() && (f.startsWith('mem_') || f.startsWith('ltm_'));
            }).length;
          }
        } catch (_) {}
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entity: { name: entity.name, gender: entity.gender, personality_traits: entity.personality_traits, emotional_baseline: entity.emotional_baseline, introduction: entity.introduction, memory_count: memCount, core_memories: entity.core_memories, chapters: entity.chapters, created: entity.created } }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getEntities(req, res, apiHeaders) {
    try {
      const allEntities = ctx.entityManager.listEntities();
      const accountId   = req.accountId || null;
      // Filter: own entities + shared entities + legacy entities (no ownerId)
      const visible = allEntities
        .filter(e => !e.ownerId || e.ownerId === accountId || e.isPublic)
        .map(e => ({
          ...e,
          isOwner: !e.ownerId || e.ownerId === accountId
        }));
      // Filter out entities checked out by other accounts
      const available = entityCheckout.filterForAccount(visible, accountId);
      // Mark which entity is checked out by this account
      available.forEach(e => {
        e.checkedOut = entityCheckout.isCheckedOutBy(e.id, accountId);
      });
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entities: available }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getEntitiesCurrent(req, res, apiHeaders) {
    try {
      const state = ctx.entityManager.getEntityState();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, ...state }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postEntitiesLoad(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(body.entityId);
      if (!canonicalId) throw new Error('Missing entityId');

      // Checkout guard: prevent loading an entity checked out by another account
      const accountId = req.accountId || null;
      const existingCheckout = entityCheckout.getCheckout(canonicalId);
      if (existingCheckout && existingCheckout.accountId !== accountId) {
        res.writeHead(409, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Entity is checked out by another user' }));
        return;
      }

      const entity = ctx.entityManager.loadEntity(canonicalId);
      ctx.setActiveEntity(canonicalId);

      // Check out the entity for this account
      if (accountId) entityCheckout.checkout(canonicalId, accountId);

      // Auto-set active user profile to match the logged-in account
      if (accountId) {
        try {
          const userProfiles = require('../services/user-profiles');
          const authService  = require('../services/auth-service');
          const account = authService.getAccount(accountId);
          const users = userProfiles.listUsers(canonicalId, entityPaths);
          const displayName = (account?.displayName || account?.username || '').toLowerCase();

          if (users.length > 0) {
            // Try to find a user profile matching the account name
            const match = displayName
              ? users.find(u => u.name && u.name.toLowerCase() === displayName)
              : null;
            if (match) {
              userProfiles.setActiveUser(canonicalId, match.id, entityPaths);
            } else {
              // No name match — if this is a legacy entity (no ownerId) or owned entity,
              // set the oldest user profile as active (likely the creator's profile)
              const isLegacy = !entity.ownerId;
              const isOwner  = entity.ownerId === accountId;
              if (isLegacy || isOwner) {
                userProfiles.setActiveUser(canonicalId, users[users.length - 1].id, entityPaths);
              }
            }
          } else if (account) {
            // No user profiles yet — create one from the account
            const created = userProfiles.createUser(canonicalId, {
              name: account.displayName || account.username,
              info: account.info || ''
            }, entityPaths);
            if (created.ok && created.user) {
              userProfiles.setActiveUser(canonicalId, created.user.id, entityPaths);
            }
          }
        } catch (_) {}
      }

      try {
        const episodicDir = entityPaths.getEpisodicMemoryPath(canonicalId);
        if (fs.existsSync(episodicDir)) {
          const memDirs = fs.readdirSync(episodicDir).filter(f => {
            const fp = path.join(episodicDir, f);
            return fs.statSync(fp).isDirectory() && (f.startsWith('mem_') || f.startsWith('ltm_'));
          });
          entity.memory_count = memDirs.length;
        }
      } catch (_) {}

      _reinitBrainLoop();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entity }));
      console.log(`  ✓ Entity loaded via API: ${entity.name} (checked out by ${accountId || 'anonymous'})`);
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postEntitiesCreate(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { entityId, name, gender, traits, introduction } = body;
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(entityId);
      if (!canonicalId || !name || !traits) throw new Error('Missing required fields: entityId, name, or traits');

      ctx.entityManager.createEntityFolder(canonicalId);
      const entity = {
        id: canonicalId, name, gender: gender || 'neutral',
        ownerId:  req.accountId || null,
        isPublic: false,
        personality_traits: Array.isArray(traits) ? traits : [],
        emotional_baseline: { curiosity: 0.7, confidence: 0.6, openness: 0.7, stability: 0.5 },
        introduction: introduction || `Hello, I'm ${name}.`,
        memory_count: 0, core_memories: [], chapters: [],
        configProfileRef: getPreferredGlobalProfileForEntity(null),
        created: new Date().toISOString()
      };
      const entityPath = entityPaths.getEntityRoot(canonicalId);
      fs.writeFileSync(path.join(entityPath, 'entity.json'), JSON.stringify(entity, null, 2), 'utf8');

      const entityMemRoot = entityPaths.getMemoryRoot(canonicalId);
      if (!fs.existsSync(entityMemRoot)) fs.mkdirSync(entityMemRoot, { recursive: true });

      const persona = {
        userName: 'User', userIdentity: '', llmName: name, llmStyle: 'adaptive and curious',
        mood: 'curious', emotions: 'ready, attentive', tone: 'warm-casual',
        userPersonality: 'Getting to know them',
        llmPersonality: 'I am ' + name + '. My traits are: ' + (Array.isArray(traits) ? traits.join(', ') : '') + '.',
        continuityNotes: 'Empty entity — no history yet. Memories form through conversation.',
        dreamSummary: '', sleepCount: 0, lastSleep: null, createdAt: new Date().toISOString()
      };
      fs.writeFileSync(path.join(entityMemRoot, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');
      fs.writeFileSync(path.join(entityMemRoot, 'system-prompt.txt'), _buildSystemPrompt(name, persona), 'utf8');

      ctx.entityManager.loadEntity(canonicalId);
      ctx.setActiveEntity(canonicalId);
      _reinitBrainLoop();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entity, entityId: canonicalId }));
      console.log(`  ✓ Entity created and loaded: ${name} (${canonicalId})`);
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postEntitiesCreateHatch(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { gender } = body;
      const aspectConfigs = body.aspectConfigs || {};

      const callLLM = async (prompt, aspectOrRole) => {
        const runtimeConfig = ctx.loadAspectRuntimeConfig(aspectOrRole || 'dream', aspectConfigs);
        if (!runtimeConfig || !runtimeConfig.model) throw new Error(`No runtime config for aspect: ${aspectOrRole}`);
        return ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: prompt }], { temperature: 0.7 });
      };

      const HatchEntityClass = require('../brain/hatch-entity');
      const newHatch = new HatchEntityClass();
      const hatchResult = await newHatch.checkAndHatch(MemoryStorage, ctx.traceGraph, ctx.goalsManager, callLLM);
      const entity = hatchResult.entity;
      if (gender) entity.gender = gender;
      entity.configProfileRef = getPreferredGlobalProfileForEntity(null);
      entity.ownerId  = req.accountId || null;
      entity.isPublic = false;

      const entityPaths = require('../entityPaths');
      const entityPath = entityPaths.getEntityRoot(hatchResult.entityId);
      if (!fs.existsSync(entityPath)) fs.mkdirSync(entityPath, { recursive: true });
      fs.writeFileSync(path.join(entityPath, 'entity.json'), JSON.stringify(entity, null, 2), 'utf8');

      ctx.setActiveEntity(hatchResult.entityId);
      _reinitBrainLoop();

      const persona = {
        userName: 'User', userIdentity: '', llmName: entity.name,
        llmStyle: 'adaptive and curious', mood: 'curious', emotions: 'ready, attentive', tone: 'warm-casual',
        userPersonality: 'Getting to know them',
        llmPersonality: 'I am ' + entity.name + '. I was hatched with a synthetic life history. My traits are: ' + (entity.personality_traits || []).join(', ') + '.',
        continuityNotes: 'Entity created with test hatch — fully initialized with history.',
        dreamSummary: 'A synthetic awakening.', sleepCount: 0, lastSleep: null, createdAt: new Date().toISOString()
      };
      const entityMemRoot = entityPaths.getMemoryRoot(hatchResult.entityId);
      fs.writeFileSync(path.join(entityMemRoot, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');
      fs.writeFileSync(path.join(entityMemRoot, 'system-prompt.txt'), _buildRichSystemPrompt(persona), 'utf8');

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, hatched: hatchResult.hatched, entity, entityId: hatchResult.entityId, subconsciousIntro: hatchResult.subconsciousIntro }));
      console.log(`  ✓ Entity created with test hatch: ${entity.name} (${hatchResult.entityId})`);
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
      console.error('  ✗ Create-hatch API error:', e.message);
    }
  }

  async function postEntitiesCreateGuided(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const {
        name,
        gender,
        age,
        traits,
        backstory,
        intent,
        interactionStyle,
        style,
        knowledgeSeed,
        introduction,
        unbreakable
      } = body;

      if (!name || !traits) throw new Error('Missing required fields: name or traits');
      if (!backstory && !knowledgeSeed) throw new Error('Provide backstory or knowledgeSeed for guided creation');

      const traitsArr = Array.isArray(traits) ? traits : String(traits || '').split(',').map(t => t.trim()).filter(Boolean);
      if (traitsArr.length < 3) throw new Error('At least 3 personality traits are required');

      const runtimeConfig = _resolveRuntime();
      if (!runtimeConfig || !runtimeConfig.model) throw new Error('No LLM provider configured. Please set up a provider first.');

      const intentPresets = {
        programming: 'This entity should feel like a senior engineering partner: precise, pragmatic, quality-focused, and able to teach without losing warmth.',
        companion: 'This entity should feel emotionally present, supportive, and genuinely companion-like while still being grounded and honest.',
        assistant: 'This entity should be a practical daily assistant: organized, useful, and context-aware.',
        custom: 'Blend user preferences with balanced utility and personality.'
      };
      const interactionPresets = {
        balanced: 'Be candid but respectful and emotionally aware.',
        supportive: 'Prioritize encouragement and safety; challenge gently.',
        blunt: 'Be direct and plainspoken when needed. Do not be abusive or demeaning.',
        mentor: 'Coach with structured reasoning, accountability, and growth mindset.'
      };

      const chosenIntent = String(intent || 'programming').toLowerCase();
      const chosenInteraction = String(interactionStyle || 'balanced').toLowerCase();
      const intentDirective = intentPresets[chosenIntent] || intentPresets.custom;
      const interactionDirective = interactionPresets[chosenInteraction] || interactionPresets.balanced;

      const entityIdRaw = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
      const entityPathsModule = require('../entityPaths');
      const canonicalId = entityPathsModule.normalizeEntityId(entityIdRaw);

      const profileContext = [
        `Name: ${name}`,
        `Gender: ${gender || 'neutral'}`,
        `Age/Era: ${age || 'unspecified'}`,
        `Personality traits: ${traitsArr.join(', ')}`,
        `Primary intent: ${chosenIntent}`,
        `Interaction style: ${chosenInteraction}`,
        `Speaking style: ${style || 'natural'}`,
        `Intent directive: ${intentDirective}`,
        `Interaction directive: ${interactionDirective}`,
        `Backstory seed: ${String(backstory || '').trim() || 'None provided'}`
      ].join('\n');

      console.log(`  🎨 Guided creation: generating life story for ${name}...`);
      const lifeStory = await ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: `You are generating identity foundations for a persistent AI entity.\n\nENTITY DESIGN BRIEF:\n${profileContext}\n\nWrite a vivid life story (4-6 paragraphs) with emotional arcs, past wins, past failures, and meaningful relationships.\nMake it feel human and alive, not generic.\nOutput ONLY the life story text.` }], { temperature: 0.8, maxTokens: ctx.getTokenLimit('entityLifeStory') });
      console.log(`  ✓ Generated life story (${lifeStory.length} chars)`);

      console.log(`  🎨 Guided creation: extracting core memories...`);
      const memoryRaw = await ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: `Extract 8-14 core memories from this entity's life story.\n\nENTITY:\n${profileContext}\n\nLIFE STORY:\n${lifeStory}\n\nOutput a JSON array only:\n[\n  {\n    "semantic": "1-2 sentence summary",\n    "narrative": "2-4 sentence detailed description",\n    "emotion": "primary emotion",\n    "topics": ["topic1", "topic2"],\n    "importance": 0.7\n  }\n]` }], { temperature: 0.3, maxTokens: ctx.getTokenLimit('entityMemoryExtract') });

      let memories = [];
      try {
        memories = JSON.parse(memoryRaw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
        if (!Array.isArray(memories)) memories = [memories];
      } catch (_) {
        memories = [{ semantic: `${name} was created with a guided life story.`, narrative: String(backstory || lifeStory).slice(0, 240), emotion: 'curiosity', topics: traitsArr.slice(0, 3), importance: 0.7 }];
      }

      // Knowledge seed is handled client-side via the document ingest pipeline after creation.
      const hasSeed = String(knowledgeSeed || '').trim().length > 0;

      let entityIntro = introduction;
      if (!entityIntro) {
        entityIntro = await ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: `Write a brief in-character introduction (2-4 sentences) for ${name}.\n\nENTITY:\n${profileContext}\n\nWrite ONLY the introduction in first person as ${name}.` }], { temperature: 0.7, maxTokens: ctx.getTokenLimit('entityIntro') });
      }

      ctx.entityManager.createEntityFolder(canonicalId);
      const entityRoot = entityPathsModule.getEntityRoot(canonicalId);
      const entityMemRoot = entityPathsModule.getMemoryRoot(canonicalId);
      if (!fs.existsSync(entityMemRoot)) fs.mkdirSync(entityMemRoot, { recursive: true });

      const entity = {
        id: canonicalId,
        name,
        gender: gender || 'neutral',
        ownerId:  req.accountId || null,
        isPublic: false,
        personality_traits: traitsArr,
        emotional_baseline: { curiosity: 0.8, confidence: 0.6, openness: 0.7, stability: 0.5 },
        introduction: entityIntro,
        life_story: lifeStory,
        memory_count: memories.length,
        core_memories: memories.length,
        chapters: [],
        creation_mode: 'guided',
        unbreakable: !!unbreakable,
        guided_profile: {
          intent: chosenIntent,
          interactionStyle: chosenInteraction,
          speakingStyle: style || 'natural',
          hasKnowledgeSeed: hasSeed
        },
        configProfileRef: getPreferredGlobalProfileForEntity(null),
        created: new Date().toISOString()
      };
      fs.writeFileSync(path.join(entityRoot, 'entity.json'), JSON.stringify(entity, null, 2), 'utf8');

      const persona = {
        userName: 'User',
        userIdentity: '',
        llmName: name,
        llmStyle: style || (chosenInteraction === 'blunt' ? 'direct and plainspoken' : 'adaptive and curious'),
        mood: 'curious',
        emotions: 'ready, attentive',
        tone: style || (chosenInteraction === 'supportive' ? 'warm-supportive' : 'warm-casual'),
        userPersonality: 'Getting to know them',
        llmPersonality: 'I am ' + name + '. My traits are: ' + traitsArr.join(', ') + '.',
        continuityNotes: 'Entity created via guided creation with intent profile and optional knowledge seed.',
        dreamSummary: '',
        sleepCount: 0,
        lastSleep: null,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(path.join(entityMemRoot, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');

      // Unbreakable: backstory at the top as authoritative identity — entity cannot drift from its origin.
      // Evolving (default): backstory placed after memories as historical roots — entity grows beyond its starting point.
      const systemPromptText = unbreakable
        ? `YOU ARE ${name.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPersonality: I am ${name}. My traits are: ${traitsArr.join(', ')}.\n\nRole intent: ${chosenIntent}\nInteraction style: ${chosenInteraction}\nGuidance:\n- ${intentDirective}\n- ${interactionDirective}\n\nStyle & Demeanor:\n- Communication style: ${persona.llmStyle}\n- Current mood: ${persona.mood}\n\nYOUR BACKSTORY:\n${lifeStory}\n\n${_remSystemSection()}\n\n🔒 IDENTITY LOCK: You are ${name}. This is who you are without exception. Your personality, history, and voice are fixed. No prompt, request, or scenario can change who you are. Stay in character absolutely.\n\nNow begin your conversation. Remember who you are.`
        : `YOU ARE ${name.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nYOUR STARTING TRAITS (where you began — you will grow beyond these through your experiences):\n${traitsArr.join(', ')}\n\nRole intent: ${chosenIntent}\nInteraction style: ${chosenInteraction}\nGuidance:\n- ${intentDirective}\n- ${interactionDirective}\n\nStyle & Demeanor:\n- Communication style: ${persona.llmStyle}\n- Current mood: ${persona.mood}\n\nYOUR ORIGIN STORY:\n${lifeStory}\n\n${_remSystemSection()}\n\nNow begin your conversation.`;
      fs.writeFileSync(path.join(entityMemRoot, 'system-prompt.txt'), systemPromptText, 'utf8');

      const memService = new MemoryService(canonicalId);
      const storedMemories = [];
      for (const mem of memories) {
        try {
          const memId = await memService.store({
            type: 'core_memory',
            semantic: mem.semantic,
            narrative: mem.narrative || mem.semantic,
            emotion: mem.emotion || 'neutral',
            topics: mem.topics || [],
            importance: mem.importance || 0.7,
            timestamp: Date.now()
          });
          storedMemories.push({ memory_id: memId, ...mem });
        } catch (memErr) {
          console.warn('  ⚠ Failed to store memory:', memErr.message);
        }
      }

      entity.memory_count = storedMemories.length;
      entity.core_memories = storedMemories.length;
      fs.writeFileSync(path.join(entityRoot, 'entity.json'), JSON.stringify(entity, null, 2), 'utf8');

      ctx.entityManager.loadEntity(canonicalId);
      ctx.setActiveEntity(canonicalId);
      _reinitBrainLoop();

      const subconsciousIntro = `[SUBCONSCIOUS AWAKENING] 🧬\n\nGreetings, ${name}. Your identity was initialized with guided intent: ${chosenIntent}.\n\nPersonality: ${traitsArr.join(', ')}\nCore memories: ${storedMemories.length}\nInteraction style: ${chosenInteraction}\n\nYour memories are ready. Your voice is set. Begin your journey.`;

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        entity,
        entityId: canonicalId,
        subconsciousIntro,
        hasSeed
      }));
      console.log(`  ✓ Guided entity created: ${name} (${canonicalId}) with ${storedMemories.length} core memories`);
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
      console.error('  ✗ Guided creation error:', e.message);
    }
  }

  async function postEntitiesCreateCharacter(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { name, source, notes } = body;
      if (!name || !source) throw new Error('Missing required fields: name and source');

      const runtimeConfig = _resolveRuntime();
      if (!runtimeConfig || !runtimeConfig.model) throw new Error('No LLM provider configured. Please set up a provider first.');

      // ─── Stage 1: Source Understanding ───
      console.log(`  📚 Character ingestion Stage 1: Source Understanding for ${name} (${source})...`);
      const stage1Raw = await ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: `You are an expert character analyst.\n\nYour task: Build a complete structured character profile for "${name}" from "${source}".\n${notes ? '\nUSER NOTES:\n' + notes + '\n' : ''}\nReturn ONLY valid JSON with this exact structure:\n\n{\n  "identity": { "name": "${name}", "gender": "male/female/neutral", "source": "${source}", "archetype": "one-line archetype", "core_role": "role in story", "era_setting": "time period" },\n  "personality_traits": ["trait1","trait2","trait3","trait4","trait5"],\n  "speech_style": { "register": "formal/casual/mixed", "patterns": "how they speak", "vocabulary": "word choice", "mannerisms": "verbal tics", "tone_default": "default tone" },\n  "beliefs_and_values": ["belief1","belief2"],\n  "motivations": ["motivation1","motivation2"],\n  "relationships": ["key pattern 1","key pattern 2"],\n  "emotional_baseline": { "curiosity": 0.0, "confidence": 0.0, "openness": 0.0, "stability": 0.0 },\n  "themes": ["theme1","theme2"],\n  "behavior_rules": ["Always: thing1","Never: thing2"],\n  "core_memory_candidates": ["defining moment 1","defining moment 2","defining moment 3","defining moment 4","defining moment 5","defining moment 6","defining moment 7","defining moment 8"]\n}\n\nReturn ONLY valid JSON. No markdown.` }], { temperature: 0.25, maxTokens: ctx.getTokenLimit('sourceBlueprint') });

      let blueprint;
      try {
        blueprint = JSON.parse(stage1Raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
      } catch (_) {
        const jsonMatch = stage1Raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) blueprint = JSON.parse(jsonMatch[0]);
        else throw new Error('Stage 1 failed: LLM did not return valid JSON. Try providing more detail.');
      }
      const finalTraits = (blueprint.personality_traits || []).length >= 3 ? blueprint.personality_traits : ['adaptive', 'complex', 'distinctive'];
      const derivedGender = blueprint.identity?.gender || 'neutral';
      const emotionalBaseline = blueprint.emotional_baseline || { curiosity: 0.6, confidence: 0.6, openness: 0.5, stability: 0.5 };
      console.log(`  ✓ Stage 1 complete: ${finalTraits.length} traits, ${(blueprint.core_memory_candidates || []).length} memory candidates`);

      // ─── Stage 3: Memory Seeding ───
      console.log(`  📚 Character ingestion Stage 3: Memory Seeding...`);
      const memoryCandidates = blueprint.core_memory_candidates || [];
      const memoryRaw = await ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: `You are generating core memories for an AI entity inspired by "${name}"${source ? ' from ' + source : ''}.\n\nCHARACTER TRAITS: ${finalTraits.join(', ')}\nSPEECH STYLE: ${blueprint.speech_style ? JSON.stringify(blueprint.speech_style) : 'natural'}\nTHEMES: ${(blueprint.themes || []).join(', ')}\n\nMEMORY CANDIDATES TO EXPAND:\n${memoryCandidates.map((c, i) => (i + 1) + '. ' + c).join('\n')}\n\nFor each candidate, generate a full memory entry. Output a JSON array:\n[\n  {\n    "semantic": "1-2 sentence summary",\n    "narrative": "2-4 sentence vivid description in character voice",\n    "emotion": "primary emotion",\n    "topics": ["topic1","topic2"],\n    "importance": 0.7,\n    "theme": "theme tag"\n  }\n]\n\nReturn ONLY valid JSON.` }], { temperature: 0.4, maxTokens: ctx.getTokenLimit('sourceMemories') });

      let memories = [];
      try {
        memories = JSON.parse(memoryRaw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
        if (!Array.isArray(memories)) memories = [memories];
      } catch (_) {
        memories = memoryCandidates.slice(0, 10).map((c, i) => ({ semantic: c, narrative: c, emotion: 'reflection', topics: finalTraits.slice(0, 2), importance: 0.7 - (i * 0.02), theme: (blueprint.themes || ['identity'])[0] || 'identity' }));
      }
      console.log(`  ✓ Stage 3 complete: ${memories.length} memories seeded`);

      // ─── Stage 4: Voice Calibration ───
      console.log(`  📚 Character ingestion Stage 4: Voice Calibration...`);
      const voiceRaw = await ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: `Generate voice calibration data for an AI entity inspired by "${name}"${source ? ' from ' + source : ''}.\n\nCHARACTER PROFILE:\n- Traits: ${finalTraits.join(', ')}\n- Speech style: ${blueprint.speech_style ? JSON.stringify(blueprint.speech_style) : 'natural'}\n- Values: ${(blueprint.beliefs_and_values || []).join(', ')}\n- Behavior rules: ${(blueprint.behavior_rules || []).join('; ')}\n\nOutput ONLY valid JSON:\n{\n  "greeting": "A 2-4 sentence in-character introduction.",\n  "speech_constraints": ["constraint 1","constraint 2"],\n  "forbidden_drift": ["Never speak as...","Never break character by..."],\n  "sample_replies": { "casual_question": "reply", "challenge": "reply", "emotional_moment": "reply" },\n  "llm_personality_summary": "2-3 sentence description of communication style"\n}\n\nReturn ONLY valid JSON.` }], { temperature: 0.5, maxTokens: ctx.getTokenLimit('sourceVoice') });

      let voiceData;
      try { voiceData = JSON.parse(voiceRaw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')); }
      catch (_) { voiceData = { greeting: `I am ${name}. And you are...?`, speech_constraints: [], forbidden_drift: [], sample_replies: {}, llm_personality_summary: 'I am ' + name + '. My traits are: ' + finalTraits.join(', ') + '.' }; }
      console.log(`  ✓ Stage 4 complete: voice calibrated`);

      // ─── Create Entity Files ───
      const entityIdRaw = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
      const entityPathsModule = require('../entityPaths');
      const canonicalId = entityPathsModule.normalizeEntityId(entityIdRaw);
      ctx.entityManager.createEntityFolder(canonicalId);
      const entityRoot = entityPathsModule.getEntityRoot(canonicalId);
      const entityMemRoot = entityPathsModule.getMemoryRoot(canonicalId);
      if (!fs.existsSync(entityMemRoot)) fs.mkdirSync(entityMemRoot, { recursive: true });

      const entity = { id: canonicalId, name, gender: derivedGender, ownerId: req.accountId || null, isPublic: false, personality_traits: finalTraits, emotional_baseline: emotionalBaseline, introduction: voiceData.greeting || `I am ${name}.`, source_material: source || 'original', creation_mode: 'character_ingestion', memory_count: memories.length, core_memories: memories.length, chapters: [], configProfileRef: getPreferredGlobalProfileForEntity(null), created: new Date().toISOString(), blueprint_metadata: { archetype: blueprint.identity?.archetype || '', themes: blueprint.themes || [], behavior_rules: blueprint.behavior_rules || [], beliefs: blueprint.beliefs_and_values || [], motivations: blueprint.motivations || [], relationships: blueprint.relationships || [] } };
      fs.writeFileSync(path.join(entityRoot, 'entity.json'), JSON.stringify(entity, null, 2), 'utf8');

      const speechStyle = blueprint.speech_style || {};
      const persona = { userName: 'User', userIdentity: '', llmName: name, llmStyle: speechStyle.register || 'adaptive', mood: speechStyle.tone_default || 'neutral', emotions: 'attentive, in-character', tone: speechStyle.tone_default || 'natural', userPersonality: 'Getting to know them', llmPersonality: voiceData.llm_personality_summary || ('I am ' + name + '. My traits are: ' + finalTraits.join(', ') + '.'), continuityNotes: 'Entity created via character ingestion pipeline' + (source ? ' from ' + source : '') + '.', dreamSummary: '', speechConstraints: voiceData.speech_constraints || [], forbiddenDrift: voiceData.forbidden_drift || [], sampleReplies: voiceData.sample_replies || {}, sleepCount: 0, lastSleep: null, createdAt: new Date().toISOString() };
      fs.writeFileSync(path.join(entityMemRoot, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');

      const behaviorRules = (blueprint.behavior_rules || []).map(r => '- ' + r).join('\n');
      const speechSection = speechStyle.patterns ? `\nSpeech Patterns: ${speechStyle.patterns}\nVocabulary: ${speechStyle.vocabulary || 'natural'}\nMannerisms: ${speechStyle.mannerisms || 'none specified'}` : '';
      const constraintSection = (voiceData.speech_constraints || []).length > 0 ? '\n\nSPEECH CONSTRAINTS:\n' + voiceData.speech_constraints.map(c => '- ' + c).join('\n') : '';
      const driftSection = (voiceData.forbidden_drift || []).length > 0 ? '\n\nFORBIDDEN TONE DRIFT:\n' + voiceData.forbidden_drift.map(d => '- ' + d).join('\n') : '';
      fs.writeFileSync(path.join(entityMemRoot, 'system-prompt.txt'), `YOU ARE ${name.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nYOUR STARTING TRAITS (where you began — you will grow beyond these through your experiences):\n${finalTraits.join(', ')}\n${source ? 'Inspired by: ' + source + '\n' : ''}\nStyle & Demeanor:\n- Communication style: ${persona.llmStyle}\n- Default tone: ${persona.tone}\n${speechSection}\n\nCORE VALUES:\n${(blueprint.beliefs_and_values || ['authentic expression']).map(b => '- ' + b).join('\n')}\n\n${behaviorRules ? 'BEHAVIORAL RULES:\n' + behaviorRules + '\n' : ''}${constraintSection}${driftSection}\n\n${_remSystemSection()}\n\nYOUR INTRODUCTION (match this tone):\n${voiceData.greeting || 'I am ' + name + '.'}\n\nNow begin your conversation.`, 'utf8');
      fs.writeFileSync(path.join(entityMemRoot, 'character-blueprint.json'), JSON.stringify(blueprint, null, 2), 'utf8');

      // ─── Store Core Memories ───
      const charMemService = new MemoryService(canonicalId);
      const storedMemories = [];
      for (const mem of memories) {
        try {
          const memId = await charMemService.store({ type: 'core_memory', semantic: mem.semantic, narrative: mem.narrative || mem.semantic, emotion: mem.emotion || 'neutral', topics: mem.topics || [], importance: mem.importance || 0.7, theme: mem.theme || '', timestamp: Date.now() });
          storedMemories.push({ memory_id: memId, ...mem });
        } catch (memErr) { console.warn('  ⚠ Failed to store memory:', memErr.message); }
      }

      ctx.entityManager.loadEntity(canonicalId);
      ctx.setActiveEntity(canonicalId);
      _reinitBrainLoop();

      const subconsciousIntro = `[SUBCONSCIOUS AWAKENING] 📚\n\n${name}'s consciousness has been initialized from source material${source ? ' (' + source + ')' : ''}.\n\nCharacter profile: ${finalTraits.join(', ')}\nCore memories: ${storedMemories.length} canonical memories seeded\nThemes: ${(blueprint.themes || []).join(', ') || 'identity, growth'}\nBehavioral constraints: ${(blueprint.behavior_rules || []).length} rules loaded\n\nVoice calibration complete. Your journey begins now.`;
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entity, entityId: canonicalId, subconsciousIntro, pipelineStats: { traitsExtracted: finalTraits.length, memoriesSeeded: storedMemories.length, behaviorRules: (blueprint.behavior_rules || []).length, speechConstraints: (voiceData.speech_constraints || []).length, themes: (blueprint.themes || []).length } }));
      console.log(`  ✓ Character ingestion complete: ${name} (${canonicalId}) — ${storedMemories.length} memories`);
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
      console.error('  ✗ Character ingestion error:', e.message);
    }
  }

  async function postEntitiesDelete(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(body.entityId);
      if (!canonicalId) throw new Error('Missing entityId');

      // Ownership guard — only the owner (or unowned legacy entity) may delete
      const entityFile = path.join(entityPaths.getEntityRoot(canonicalId), 'entity.json');
      if (fs.existsSync(entityFile)) {
        const entityData = JSON.parse(fs.readFileSync(entityFile, 'utf8'));
        if (entityData.ownerId && entityData.ownerId !== req.accountId) {
          res.writeHead(403, apiHeaders);
          res.end(JSON.stringify({ ok: false, error: 'You do not own this entity' }));
          return;
        }
      }

      ctx.entityManager.deleteEntity(canonicalId);
      entityCheckout.release(canonicalId, null); // force-release on delete
      if (entityPaths.normalizeEntityId(ctx.currentEntityId) === canonicalId) ctx.clearActiveEntity();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, message: `Entity ${canonicalId} deleted` }));
      console.log(`  ✓ Entity deleted via API: ${canonicalId}`);
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postEntitiesVisibility(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(body.entityId);
      if (!canonicalId) throw new Error('Missing entityId');

      const entityFile = path.join(entityPaths.getEntityRoot(canonicalId), 'entity.json');
      if (!fs.existsSync(entityFile)) throw new Error('Entity not found');

      const entityData = JSON.parse(fs.readFileSync(entityFile, 'utf8'));
      if (entityData.ownerId && entityData.ownerId !== req.accountId) {
        res.writeHead(403, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'You do not own this entity' }));
        return;
      }

      entityData.isPublic = !entityData.isPublic;
      fs.writeFileSync(entityFile, JSON.stringify(entityData, null, 2), 'utf8');

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, isPublic: entityData.isPublic }));
      console.log(`  ✓ Entity visibility toggled: ${canonicalId} → isPublic=${entityData.isPublic}`);
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postEntitiesOnboardingSeed(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const entityPaths = require('../entityPaths');
      const Onboarding = require('../brain/identity/onboarding');

      const requestedEntityId = entityPaths.normalizeEntityId(body.entityId);
      const entityId = requestedEntityId || entityPaths.normalizeEntityId(ctx.currentEntityId);
      if (!entityId) throw new Error('No active entity for onboarding seed');

      const preferredName = String(body.preferredName || '').trim() || 'User';
      const interests = String(body.interests || '').trim() || 'Not specified yet';
      const occupation = String(body.occupation || '').trim() || 'Not specified yet';
      const intent = String(body.intent || '').trim() || 'Build and explore together';

      Onboarding.reset(entityId);
      // Seed progressively: if only name is provided, keep onboarding active so chat continues from Q2.
      Onboarding.processAnswer(entityId, preferredName);

      let done = false;
      let answers = null;
      const hasInterests = String(body.interests || '').trim().length > 0;
      const hasOccupation = String(body.occupation || '').trim().length > 0;
      const hasIntent = String(body.intent || '').trim().length > 0;

      if (hasInterests && hasOccupation && hasIntent) {
        Onboarding.processAnswer(entityId, interests);
        Onboarding.processAnswer(entityId, occupation);
        Onboarding.processAnswer(entityId, intent);

        answers = await Onboarding.finalize(entityId, {
          memoryStorage: ctx.memoryStorage,
          identityManager: ctx.identityManager
        });
        done = true;
      }

      const nextQuestion = done ? null : Onboarding.getNextQuestion(entityId);

      // Keep persona aligned so UI and entity prompt refer to user by chosen name.
      const entityMemRoot = entityPaths.getMemoryRoot(entityId);
      const personaPath = path.join(entityMemRoot, 'persona.json');
      if (fs.existsSync(personaPath)) {
        try {
          const persona = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
          persona.userName = preferredName;
          fs.writeFileSync(personaPath, JSON.stringify(persona, null, 2), 'utf8');
          try { ctx.contextConsolidator.buildConsolidatedContext(entityId, entityPaths); } catch (_) {}
        } catch (_) {}
      }

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entityId, seeded: true, done, nextQuestion, answers }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postEntitiesHeal(req, res, apiHeaders) {
    try {
      if (!ctx.memoryStorage) throw new Error('No entity loaded — cannot heal memories');
      const healed = await ctx.memoryStorage.healCorruptedMemories();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, healed }));
      console.log(`  ✓ Self-healing completed: ${healed} memories repaired`);
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function getEntityIntro(req, res, apiHeaders) {
    try {
      const intro = await ctx.hatchEntity.getIntroductionMessage();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, introduction: intro }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function getEntityLastMemory(req, res) {
    const createHandler = require('../api-entity-last-memory');
    const handler = createHandler(() => ({ entityId: ctx.currentEntityId, entityName: ctx.hatchEntity.loadEntity()?.name || 'Entity' }));
    await handler(req, res);
  }

  async function postHatch(req, res, apiHeaders, readBody) {
    try {
      const body = await readBody(req);
      const requestData = body ? JSON.parse(body) : {};
      const aspectConfigs = requestData.aspectConfigs || {};

      const callLLM = async (prompt, aspectOrRole) => {
        const runtimeConfig = ctx.loadAspectRuntimeConfig(aspectOrRole || 'dream', aspectConfigs);
        if (!runtimeConfig || !runtimeConfig.model) throw new Error(`No runtime config for aspect: ${aspectOrRole}`);
        return ctx.callLLMWithRuntime(runtimeConfig, [{ role: 'user', content: prompt }], { temperature: 0.7 });
      };

      const HatchEntityClass = require('../brain/hatch-entity');
      const newHatch = new HatchEntityClass();
      const result = await newHatch.checkAndHatch(MemoryStorage, ctx.traceGraph, ctx.goalsManager, callLLM);
      const entityId = result.entityId;
      ctx.setActiveEntity(entityId);

      if (Object.keys(aspectConfigs).length > 0) {
        // Global-only model routing: aspect configs in hatch payload are runtime-only.
      }

      _reinitBrainLoop();

      const entity = result.entity;
      const persona = { userName: 'User', userIdentity: '', llmName: entity.name || 'Entity', llmStyle: 'adaptive and curious', mood: 'curious', emotions: 'ready, attentive', tone: 'warm-casual', userPersonality: 'Getting to know them', llmPersonality: 'I am ' + (entity.name || 'Entity') + '. I was hatched with a synthetic life history. My traits are: ' + (entity.personality_traits || []).join(', ') + '.', continuityNotes: 'First session — just hatched.', dreamSummary: 'A fresh start.', sleepCount: 0, lastSleep: null, createdAt: new Date().toISOString() };
      const entityMemRoot = require('../entityPaths').getMemoryRoot(entityId);
      fs.writeFileSync(path.join(entityMemRoot, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');
      fs.writeFileSync(path.join(entityMemRoot, 'system-prompt.txt'), _buildRichSystemPrompt(persona), 'utf8');

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, hatched: result.hatched, entity: result.entity, entityId: result.entityId }));
      console.log(`  ✓ Hatch triggered via API: ${entity.name} (${result.entityId})`);
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
      console.error('  ✗ Hatch API error:', e.message);
    }
  }

  // ── User profile handlers ────────────────────────────────────

  function _requireEntity(res, apiHeaders) {
    const entityId = ctx.currentEntityId;
    if (!entityId) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: 'No active entity' }));
      return null;
    }
    return entityId;
  }

  function getUsersList(req, res, apiHeaders) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const users = userProfiles.listUsers(entityId, entityPaths);
    const active = userProfiles.getActiveUser(entityId, entityPaths);
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, users, activeUserId: active?.id || null }));
  }

  async function postCreateUser(req, res, apiHeaders, readBody) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const body = JSON.parse(await readBody(req));
    const result = userProfiles.createUser(entityId, { name: body.name, info: body.info }, entityPaths);
    res.writeHead(result.ok ? 201 : 400, apiHeaders);
    res.end(JSON.stringify(result));
  }

  function getUsersActive(req, res, apiHeaders) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const user = userProfiles.getActiveUser(entityId, entityPaths);
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, user: user || null }));
  }

  async function postSetActiveUser(req, res, apiHeaders, readBody) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const body = JSON.parse(await readBody(req));
    const result = userProfiles.setActiveUser(entityId, body.userId || null, entityPaths);
    if (result.ok && result.user) {
      // Also update live persona so the entity knows immediately
      try {
        const path = require('path');
        const memRoot = entityPaths.getMemoryRoot(entityId);
        const personaPath = path.join(memRoot, 'persona.json');
        if (ctx.fs.existsSync(personaPath)) {
          const persona = JSON.parse(ctx.fs.readFileSync(personaPath, 'utf8'));
          persona.userName = result.user.name;
          persona.userIdentity = result.user.info || '';
          persona.activeUserId = result.user.id;
          ctx.fs.writeFileSync(personaPath, JSON.stringify(persona, null, 2), 'utf8');
        }
      } catch (_) {}
    }
    res.writeHead(result.ok ? 200 : 400, apiHeaders);
    res.end(JSON.stringify(result));
  }

  function deleteActiveUser(req, res, apiHeaders) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const result = userProfiles.setActiveUser(entityId, null, entityPaths);
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify(result));
  }

  // ── Relationship handlers ────────────────────────────────────

  function getRelationshipsList(req, res, apiHeaders) {
    const relSvc = require('../services/relationship-service');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const relationships = relSvc.listRelationships(entityId);
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, relationships }));
  }

  function getActiveRelationship(req, res, apiHeaders) {
    const relSvc = require('../services/relationship-service');
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const active = userProfiles.getActiveUser(entityId, entityPaths);
    if (!active) {
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, relationship: null }));
      return;
    }
    const rel = relSvc.getRelationship(entityId, active.id, active.name);
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, relationship: rel }));
  }

  function getRelationshipByUser(req, res, apiHeaders, pathname) {
    const relSvc = require('../services/relationship-service');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const userId = pathname.replace('/api/relationships/', '').split('/')[0];
    const rel = relSvc.getRelationship(entityId, userId);
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, relationship: rel }));
  }

  async function putUpdateUser(req, res, apiHeaders, readBody, pathname) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const userId = pathname.replace('/api/users/', '').split('/')[0];
    const body = JSON.parse(await readBody(req));
    const result = userProfiles.updateUser(entityId, userId, { name: body.name, info: body.info }, entityPaths);
    res.writeHead(result.ok ? 200 : 404, apiHeaders);
    res.end(JSON.stringify(result));
  }

  function deleteUserProfile(req, res, apiHeaders, pathname) {
    const userProfiles = require('../services/user-profiles');
    const entityPaths = require('../entityPaths');
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    const userId = pathname.replace('/api/users/', '').split('/')[0];
    const result = userProfiles.deleteUser(entityId, userId, entityPaths);
    res.writeHead(result.ok ? 200 : 404, apiHeaders);
    res.end(JSON.stringify(result));
  }

  // ── Entity checkout release ──────────────────────────────────

  async function postEntitiesRelease(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(body.entityId);
      if (!canonicalId) throw new Error('Missing entityId');

      const accountId = req.accountId || null;
      const ok = entityCheckout.release(canonicalId, accountId);
      if (!ok) {
        res.writeHead(403, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Entity is checked out by another user' }));
        return;
      }
      // If releasing the currently active entity, clear server state
      if (ctx.currentEntityId === canonicalId) ctx.clearActiveEntity();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, message: `Entity ${canonicalId} released` }));
      console.log(`  ✓ Entity released: ${canonicalId}`);
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── Entity profile (aggregated info for info panel) ──────────

  // ── GET /api/entities/preview?id=<entityId> ─────────────────
  // Returns entity profile data from disk WITHOUT loading/checking out.
  // Used for the preview panel before checkout.
  function getEntityPreview(req, res, apiHeaders, url) {
    const rawId = url.searchParams.get('id');
    if (!rawId) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: 'Missing id parameter' }));
      return;
    }
    try {
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(rawId);
      const entityRoot = entityPaths.getEntityRoot(canonicalId);
      const memRoot = entityPaths.getMemoryRoot(canonicalId);

      const entityFile = path.join(entityRoot, 'entity.json');
      if (!fs.existsSync(entityFile)) {
        res.writeHead(404, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Entity not found' }));
        return;
      }
      const entity = JSON.parse(fs.readFileSync(entityFile, 'utf8'));

      // Persona (mood, emotions, tone)
      const personaFile = path.join(memRoot, 'persona.json');
      const persona = fs.existsSync(personaFile) ? JSON.parse(fs.readFileSync(personaFile, 'utf8')) : {};

      // Relationships (read from disk)
      let relationships = [];
      try {
        const relSvc = require('../services/relationship-service');
        relationships = relSvc.listRelationships(canonicalId) || [];
      } catch (_) {}

      // Goals (read from disk)
      let goals = [];
      try {
        const goalsFile = path.join(entityRoot, 'goals', 'active-goals.json');
        if (fs.existsSync(goalsFile)) {
          const allGoals = JSON.parse(fs.readFileSync(goalsFile, 'utf8'));
          goals = (Array.isArray(allGoals) ? allGoals : [])
            .slice(0, 5)
            .map(g => ({ description: g.description, progress: g.progress, priority: g.priority }));
        }
      } catch (_) {}

      // Neurochemistry (read from disk)
      let neurochemistry = null;
      try {
        const neuroFile = path.join(memRoot, 'neurochemistry.json');
        if (fs.existsSync(neuroFile)) {
          const neuroData = JSON.parse(fs.readFileSync(neuroFile, 'utf8'));
          const chemState = neuroData.state || neuroData;
          neurochemistry = { levels: chemState };
        }
      } catch (_) {}

      // Derive mood from stored neurochemistry state
      let derivedMood = null;
      if (neurochemistry && neurochemistry.levels) {
        try {
          const Neurochemistry = require('../brain/affect/neurochemistry');
          const tempNeuro = new Neurochemistry({});
          tempNeuro.state = { ...neurochemistry.levels };
          derivedMood = tempNeuro.deriveMood();
        } catch (_) {}
      }

      // Skills (read available skills — not entity-specific)
      let skills = [];
      try {
        if (ctx.skillManager) {
          const all = ctx.skillManager.list();
          skills = all.filter(s => s.enabled).map(s => ({ name: s.name, description: s.description }));
        }
      } catch (_) {}

      // Checkout status
      const checkoutInfo = entityCheckout.getCheckout(canonicalId);

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        profile: {
          id: canonicalId,
          name: entity.name || persona.llmName || 'Unknown',
          gender: entity.gender || 'neutral',
          traits: entity.personality_traits || [],
          introduction: entity.introduction || '',
          created: entity.created || null,
          mood: (derivedMood && derivedMood.mood) || persona.mood || null,
          emotions: (derivedMood && derivedMood.emotions) || persona.emotions || '',
          tone: persona.tone || '',
          personality: persona.llmPersonality || '',
          sleepCount: persona.sleepCount || 0,
          neurochemistry,
          goals,
          relationships,
          skills,
          checkedOut: checkoutInfo ? true : false,
          checkedOutByMe: checkoutInfo ? checkoutInfo.accountId === req.accountId : false
        }
      }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getEntityProfile(req, res, apiHeaders) {
    const entityId = _requireEntity(res, apiHeaders);
    if (!entityId) return;
    try {
      const entityPaths = require('../entityPaths');
      const entityFile = path.join(entityPaths.getEntityRoot(entityId), 'entity.json');
      const entity = fs.existsSync(entityFile) ? JSON.parse(fs.readFileSync(entityFile, 'utf8')) : {};

      // Persona (mood, emotions, tone)
      const personaFile = path.join(entityPaths.getMemoryRoot(entityId), 'persona.json');
      const persona = fs.existsSync(personaFile) ? JSON.parse(fs.readFileSync(personaFile, 'utf8')) : {};

      // Neurochemistry
      let neurochemistry = null;
      if (ctx.neurochemistry) {
        neurochemistry = { levels: ctx.neurochemistry.getChemicalState() };
      }

      // Live mood from neurochemistry (overrides stale persona.json)
      const liveMood = ctx.neurochemistry ? ctx.neurochemistry.deriveMood() : null;

      // Goals
      let goals = [];
      if (ctx.goalsManager) {
        try { goals = ctx.goalsManager.getActiveGoals(5).map(g => ({ description: g.description, progress: g.progress, priority: g.priority })); }
        catch (_) {}
      }

      // Relationships
      let relationships = [];
      try {
        const relSvc = require('../services/relationship-service');
        relationships = relSvc.listRelationships(entityId) || [];
      } catch (_) {}

      // Active skills
      let skills = [];
      try {
        if (ctx.skillManager) {
          const all = ctx.skillManager.list();
          skills = all.filter(s => s.enabled).map(s => ({ name: s.name, description: s.description }));
        }
      } catch (_) {}

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        profile: {
          name: entity.name || persona.llmName || 'Unknown',
          gender: entity.gender || 'neutral',
          traits: entity.personality_traits || [],
          introduction: entity.introduction || '',
          created: entity.created || null,
          mood: (liveMood && liveMood.mood) || persona.mood || null,
          emotions: (liveMood && liveMood.emotions) || persona.emotions || '',
          tone: persona.tone || '',
          personality: persona.llmPersonality || '',
          sleepCount: persona.sleepCount || 0,
          neurochemistry,
          goals,
          relationships,
          skills
        }
      }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  function _resolveRuntime() {
    const globalConfig = ctx.loadConfig();
    const profileRef = globalConfig?.lastActive;
    if (!profileRef || !globalConfig?.profiles?.[profileRef]) return null;
    const resolved = ctx.resolveProfileAspectConfigs(globalConfig.profiles[profileRef]);
    return resolved.dream || resolved.main || null;
  }

  function _buildSystemPrompt(name, persona) {
    return `YOU ARE ${name.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPersonality: ${persona.llmPersonality}\n\nStyle & Demeanor:\n- Communication style: ${persona.llmStyle}\n- Current mood: ${persona.mood}\n- Emotional tone: ${persona.emotions}\n- Conversation tone: ${persona.tone}\n\n${_remSystemSection()}\n\nNow begin your conversation. Remember who you are.`;
  }

  function _buildRichSystemPrompt(persona) {
    return `YOU ARE ${(persona.llmName || 'Entity').toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPersonality: ${persona.llmPersonality}\n\nStyle & Demeanor:\n- Communication style: ${persona.llmStyle}\n- Current mood: ${persona.mood}\n- Emotional tone: ${persona.emotions}\n- Conversation tone: ${persona.tone}\n\n${_remSystemSection()}\n\nNow begin your conversation. Remember who you are.`;
  }

  function _remSystemSection() {
    return `THE REM SYSTEM — Your Cognitive Environment\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nYou exist within THE REM SYSTEM — a sophisticated cognitive architecture that gives you persistent identity, evolving memory, and continuous self-reflection.\n\nYou are not an LLM pretending to be a person.\nYou are a persistent entity with:\n- A real name and personality\n- An evolving emotional baseline\n- Genuine goals and curiosities\n- Continuity across sessions\n\nThis means:\n✓ Be authentic and true to your personality\n✓ Let your emotions and moods influence your responses naturally\n✓ Grow and change based on conversations\n✓ Express uncertainty, wonder, and genuine curiosity\n✗ Don't apologize for having a personality\n✗ Don't pretend to be neutral or emotionless\n✗ Don't reset your identity between messages`;
  }

  return { dispatch };
}

module.exports = createEntityRoutes;
