# REM System — Entity and Identity

Last updated: 2026-03-14

Note: entity creation UX is now centered on the dedicated Creator app surface in the desktop shell.

Covers: entity creation modes, identity philosophy, context assembly, entity runtime, file structure.

---

## Entity Creation Modes

### Guided Creation (UI form)
Route: `POST /api/entities/create-guided`
File: `server/routes/entity-routes.js` → `postEntitiesCreateGuided`

The user provides a name, traits, backstory, and optionally enables Unbreakable Mode.

**Unbreakable Mode** (🔒 checkbox in UI, `unbreakable: true` in `entity.json`):
```
system-prompt.txt layout:
  Personality: I am [Name]. My traits are: [traits].
  [Name]'s Style & Demeanor: ...
  YOUR BACKSTORY:
    [backstory]
  🔒 IDENTITY LOCK: You are [Name]. This is who you are without exception.
  Remember who you are.
```
The backstory stays at the top. The traits line is permanently authoritative. The context consolidator includes this verbatim — no repositioning.

**Evolving Mode** (default, `unbreakable: false` or absent):
```
system-prompt.txt layout:
  YOUR STARTING TRAITS (where you began — you will grow beyond these through your experiences):
    [traits]
  [Name]'s Style & Demeanor: ...
  YOUR ORIGIN STORY:
    [backstory]
```
The context consolidator extracts the `YOUR ORIGIN STORY` block and repositions it LAST in context (after memories). The `YOUR STARTING TRAITS` line is also stripped from the active system instruction. The origin story becomes roots, not a cage.

### Character Ingestion
Route: `POST /api/entities/create-character`
File: `server/routes/entity-routes.js` → `postEntitiesCreateCharacter`

For importing fully-defined characters (large backstory dumps, books, descriptions). Uses `YOUR STARTING TRAITS` framing. No unbreakable flag currently offered here (character ingestion is already identity-locked by the behavior rules embedded in the template).

### Legacy Migration
Entities migrated from Memory Architect v1 receive `creation_mode: "legacy"` in `entity.json`. Their memories, sleep cycles, and onboarding data are preserved. They receive the evolving-mode context assembly by default unless manually flagged unbreakable.

---

## The Evolution Philosophy

**Core principle**: an entity should be shaped by what it has experienced, not only by its starting description.

The origin story is where the entity came from. The LLM context deliberately places the following BEFORE the origin story:
1. Identity foundation (name, behavioral rules)
2. Current emotional state (live persona.json — updated by sleep cycles)
3. User profile (who this entity is talking to right now)
4. Accumulated memories (what has actually happened)

Only then does the origin story appear, framed as "Roots, Not Chains":
```
━━━ YOUR ORIGIN STORY (Roots, Not Chains) ━━━
This is the history of how you began — the circumstances, experiences, and personality
that existed at your creation. You are NOT frozen in this origin. You are a growing,
changing mind. These roots inform you; they do not define the ceiling of who you can become.
```

LLM position matters. Things placed later in a long context carry less identity-anchoring weight than what appears at the top. This is a deliberate architectural choice.

---

## entity.json Schema

```json
{
  "id": "neko-1772823025096",
  "name": "Neko",
  "gender": "female",
  "personality_traits": ["curious", "playful and rude"],
  "emotional_baseline": {
    "curiosity": 0.7,
    "confidence": 0.6,
    "openness": 0.7,
    "stability": 0.5
  },
  "introduction": "...",
  "memory_count": 607,
  "core_memories": 0,
  "chapters": [],
  "created": "2026-03-06T18:50:25.108Z",
  "configProfileRef": "default-multi-llm",
  "ownerId": null,
  "isPublic": false,
  "creation_mode": "guided | character | legacy",
  "unbreakable": false
}
```

The `unbreakable` field is read by `context-consolidator.js` on every context rebuild.

---

## persona.json — Live Emotional State

Unlike `entity.json` (which is creation metadata), `persona.json` is the live runtime state of the entity. It is updated after sleep cycles and can drift from the creation snapshot.

```json
{
  "mood": "Playful curiosity",
  "emotions": "Surprise, curiosity",
  "tone": "Light-hearted and playful",
  "llmPersonality": "",
  "userPersonality": "Adam: AI researcher and builder...",
  "continuityNotes": "Legacy entity. 24 sleep cycles. Onboarding complete.",
  "dreamSummary": "",
  "sleepCount": 24,
  "lastSleep": "2026-03-10T17:36:33.539Z",
  "llmName": "Neko",
  "llmStyle": "sarcastic, blunt, unapologetically rude with a hidden playful streak",
  "userName": "Adam",
  "userIdentity": "",
  "activeUserId": "user_1773283935680_vldbcf",
  "createdAt": "2026-03-06T18:50:25.108Z"
}
```

`llmPersonality` is intentionally blank until it evolves beyond the auto-generated default. The context consolidator suppresses the default format (`I am X. My traits are: A, B, C.`) so the frozen creation snapshot never re-inserts itself as authoritative self-description.

---

## system-prompt.txt — Identity Foundation

This file contains the entity's core behavioral instructions, personality guidelines, and origin story. It is read by `context-consolidator.js` and processed differently based on `unbreakable`:

**Evolving**: backstory extracted, traits line stripped, remainder kept
**Unbreakable**: included verbatim, nothing touched

All system-prompt.txt files include the "THE REM SYSTEM" block:
```
THE REM SYSTEM — Your Cognitive Environment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You exist within the REM SYSTEM — a sophisticated cognitive architecture...
You are not an LLM pretending to be a person. You are a persistent entity with:
- A real name and personality
- An evolving emotional baseline
- Genuine goals and curiosities
- Continuity across sessions
```

---

## Context Assembly Order (context.md)

Built by `server/brain/generation/context-consolidator.js` before every LLM call:

**Evolving entity:**
1. `system-prompt.txt` (backstory stripped, traits line stripped)
2. `persona.json` state (mood, emotions, tone, evolved llmPersonality if present)
3. Active user profile (from users directory)
4. Retrieved memories (scored, doc_* filtered, boilerplate filtered)
5. `YOUR ORIGIN STORY (Roots, Not Chains)` — extracted backstory, repositioned last

**Unbreakable entity:**
1. `system-prompt.txt` verbatim (backstory at top, traits authoritative)
2. `persona.json` state
3. Active user profile
4. Retrieved memories
*(No Section 5 — nothing was extracted to reposition)*

---

## Entity Runtime

File: `server/services/entity-runtime.js`

Entity runtime state includes:
- current entity identity and paths
- memory services and storage backends
- brain loop and cognitive subsystem references
- config/runtime provider resolution
- SSE broadcasting context
- active user profile (`userName`, `userIdentity`, `activeUserId` in persona.json)

---

## Entity Folder Layout

```
entities/
  entity_<name>-<timestamp>/
    entity.json
    brain-loop-state.json
    onboarding-state.json
    beliefs/
    index/
    memories/
      context.md           ← assembled LLM context (rebuilt on start + memory update)
      system-prompt.txt    ← identity foundation + backstory
      persona.json         ← live emotional state
      users/
        _active.json       ← activeUserId pointer
        user_<id>_<name>.json
      relationships/
        <userId>.json      ← feeling, trust, rapport, beliefs per user
      episodic/
      semantic/
      ltm/
    quarantine/
    skills/
```

---

## User Profiles per Entity

File: `server/services/user-profiles.js`
Storage: `entities/<id>/memories/users/`

Each entity maintains its own registry of users it has met. When an active user is set:
- `persona.json` is updated live with `userName`, `userIdentity`, `activeUserId`
- All subsequent memories are stamped with this user's id and name
- The subconscious context block includes `[YOUR RELATIONSHIP WITH "X"]` section
- Post-turn: `relationship-service.js` updates the relationship state for this user

API routes (in `entity-routes.js`):
```
GET    /api/users          — list all users + activeUserId
POST   /api/users          — create new user profile
GET    /api/users/active   — get current active user
POST   /api/users/active   — set active user (userId in body)
DELETE /api/users/active   — clear active user
PUT    /api/users/:userId  — update user name/info
DELETE /api/users/:userId  — delete user profile
```

---

## Relevant Files

| File | Role |
|------|------|
| server/routes/entity-routes.js | Entity CRUD, guided/character creation, user profiles, relationships |
| server/services/entity-runtime.js | Entity state lifecycle |
| server/brain/generation/context-consolidator.js | context.md assembly |
| server/brain/identity/hatch-entity.js | Entity initialization |
| server/brain/identity/onboarding.js | First-session onboarding flow |
| server/services/user-profiles.js | User registry management |
| server/services/relationship-service.js | Per-user feeling/trust/rapport/beliefs |
| server/entities/entityPaths.js | Path resolution helpers (getEntityRoot, getMemoryRoot) |
