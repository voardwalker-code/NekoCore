# PLAN: NekoCore System Entity Bootstrap

**Status:** `In Progress`
**Version target:** 0.7.0
**Date created:** 2026-03-15
**Last updated:** 2026-03-15

---

## 1. Background / Why This Plan Exists

NekoCore OS needs a protected, permanent system-level orchestrator identity — NekoCore herself — that cannot be created, modified, or deleted through normal entity flows. Without this, the OS has no authoritative root-context for managing entities, routing model-governance decisions, and providing a consistent interface for navigating and controlling the OS.

Architecture note: NekoCore **runs the OS**. She is the orchestrator for all entities. Each entity's brain pipeline is structured as three layers — **Conscious** (reasoning/response), **Subconscious** (memory reflection and context), and **Dream** (creative/lateral associations and sleep cycle processing). These are already the named pipeline stages in `config-service.js` and the brain loop. NekoCore, as the orchestrating intelligence, runs atop this pipeline and coordinates all entity activity.

Because NekoCore runs the brain loop herself, she already has natural access to all entity memory context through the orchestrator cycle — **no separate cross-entity reader is needed**. Her visibility into entity state flows from her role as the orchestrator, not from a special bypass service.

Two collisions are already happening: user-created entities can accidentally take reserved system names, and there is no guardrail preventing rogue LLM configurations from drifting unchecked. This plan implements the system entity foundation, its locked personality and memory policy, orchestrator-native entity context access, permissioned model-governance routes, a dedicated NekoCore OS API key slot in the settings panel, and a minimal dedicated app surface.

---

## 2. Objective

Done means: A protected NekoCore system entity auto-provisions on server startup if not already present. It has a fixed identity, a multi-layer locked personality (system prompt + memory prefix + runtime guard), no dream recording, and operational-grade long-lived memory. NekoCore's access to entity memories and context is provided naturally by the brain loop she already runs as OS orchestrator — the orchestrator context builder includes entity summaries when NekoCore is active; no separate reader service is needed. A dedicated **NekoCore OS** API key slot (endpoint + key + model) is present in the settings panel, clearly labeled and separate from entity-level model configs. A two-step permissioned model-switch flow (recommendation → user approval → execution with audit log) governs any config change. A minimal dedicated NekoCore app window is present in the OS shell with status, pending recommendations, and approve/deny controls. Normal entity creation, deletion, and renaming routes cannot touch the system entity. Existing bug-fix behavior (BUG-06/07/08) is unaffected. All 334 existing tests continue to pass and new guard tests cover the system entity protection invariants.

---

## 3. Audit Findings / Pre-Work Analysis

| Item | Current Location | Lines | Problem / Note | Target |
|------|-----------------|-------|----------------|--------|
| Reserved-name block | `server/routes/entity-routes.js` + `client/js/create.js` | ~15 | Already implemented (Phase A-0 done) | Keep, extend to delete/rename |
| Entity creation routes | `server/routes/entity-routes.js` | ~1177 | Four creation endpoints + hatch + postHatch need system-entity bypass guards | Same file + new `server/brain/nekocore/` module |
| Entity delete route | `server/routes/entity-routes.js` line ~620 | ~25 | No protection against deleting a system entity | Add system-entity guard |
| Brain loop init | `server/brain/brain-loop.js` | — | Dream pipeline runs for all entities; must be skipped for NekoCore | Conditional skip via entity flag |
| Dream phase | `server/brain/cognition/phases/phase-dreams.js` | ~80 | Dream generation must not run for system entity | `isSystemEntity` flag guard |
| Startup / server init | `server/server.js` | — | No system entity bootstrap call on startup | Add bootstrap call to startup sequence |
| Memory storage | `server/brain/memory-storage.js` | — | No policy-layer hooks; NekoCore needs high-retention + dream-off flags | Add `policyFlags` read in bootstrap |
| LLM config | `server/services/config-service.js` | — | No system-entity-specific model slot exists | Add `nekocore` aspect slot + **NekoCore OS** settings panel block in D-1 |
| Client app shell | `client/js/app.js` | 4800+ | No NekoCore app window or panel registered | Add window registration + minimal panel |
| Client route | `server/routes/` | — | No NekoCore-specific API routes exist | New `server/routes/nekocore-routes.js` |

**Estimated total impact:** ~8 files modified, 3 new files created, ~500 lines net new, 334+ existing tests intact, ~8 new unit/integration guard tests.

---

## 4. Architecture Boundary Check

- [x] No frontend (`client/**`) receives backend orchestration, filesystem logic, or policy logic
- [x] No backend (`server/**`) receives DOM/UI rendering concerns
- [x] New routes added to `server/routes/**`, not inlined into `server/server.js`
- [x] New data schemas and validators go into `server/contracts/**`
- [x] No new business logic added to `server/server.js` (composition only)
- [x] All new modules target <= 300 lines where practical
- [x] Any file above 1200 lines that needs changes: extraction is required in the same slice

---

## 5. Phases

---

### Phase A: Protected Identity Foundation

**Goal:** NekoCore system entity auto-provisions on startup with protected ID, cannot be created/deleted/renamed through normal flows, and name stays blocked in all creation paths.
**Status:** `Complete`
**Depends on:** none

#### Slice Checklist

- [x] A-0: Name reservation — block NekoCore/Neko/Echo/AgentEcho in all creation paths (client + server)
- [x] A-1: System entity bootstrap — `server/brain/nekocore/bootstrap.js` auto-provisions entity on startup
- [x] A-2: Protection guards — delete, rename, visibility, and load routes reject requests targeting system entity ID
- [x] A-3: Guard tests — unit tests verifying system entity cannot be created/deleted/renamed via API

---

### Phase B: Memory and Access Policy

**Goal:** NekoCore has dream-disabled, high-retention operational memory and can read (not write) summaries of other entities through a server-mediated service.
**Status:** `Complete`
**Depends on:** Phase A

#### Slice Checklist

- [x] B-1: Dream pipeline skip — skip dream phase when active entity is a system entity (flag: `dreamDisabled`)
- [x] B-2: Memory policy flags — persist `dreamDisabled: true`, `operationalMemory: true` in system entity json
- [x] B-3: Orchestrator context wiring — entity summaries injected into mergePrompt when `isSystemEntity === true`
- [x] B-4: Guard tests — dream phase skip verified, orchestrator summaries injection verified, no mutation verified

---

### Phase C: Model Intelligence via Memory Architecture

**Goal:** NekoCore stores her knowledge of brain loop roles and LLM models in her own memory files (REM System MA approach — not hardcoded in prompts). She picks the best model that is fast and cheap for each role. Performance is tracked per-entity/per-role so she accumulates experience over time: some entity personalities pair better with certain models. Specialised task types (code, creative writing) are learned from use.
**Status:** `Complete`
**Depends on:** Phase A, Phase B

#### Design notes
- Role knowledge and model catalog live in NekoCore's `memories/` directory as structured JSON: `role-knowledge.json`, `model-registry.json`, `model-performance.json`.
- No model data is baked into her system prompt — it lives in memory she can update.
- Selection algorithm: capability match × value density × speed bonus × task affinity × performance multiplier. Quality-priority roles (Conscious, Orchestrator) apply a minimum capability floor so cheap-but-mediocre models cannot win purely on cost.
- Performance multiplier range: 0.25–2.0 (wide enough to shift rankings after 3+ samples).

#### Slice Checklist

- [x] C-1: Role knowledge — `seedRoleKnowledge()` in `model-intelligence.js` seeds `role-knowledge.json` with purpose, requirements, and priorities for Subconscious / Conscious / Dream / Orchestrator
- [x] C-2: Model registry — `seedModelRegistry()` seeds `model-registry.json` with 10 common OpenRouter models (cost/speed/capabilities). Always overwrites so registry evolves cleanly.
- [x] C-3: Performance recording — after every chat orchestration in `server.js`, record aspect-level model usage + token counts into NekoCore's `model-performance.json` (non-blocking, fire-and-forget)
- [x] C-4: Model selection — `selectModel(role, { registry, performance, entityId, taskType })` returns best-fit model; respects capability floor for quality roles; amplifies performance history
- [x] C-5: Bootstrap integration — `ensureSystemEntity()` calls `seedRoleKnowledge` and `seedModelRegistry` on first provision; system-prompt.txt updated with real identity including model intelligence description
- [x] C-6: Tests (+11 tests; suite: 375 pass, 0 fail)

---

### Phase D: Model Governance and NekoCore OS Config

**Goal:** A dedicated NekoCore OS config slot (separate from any entity's model config, clearly labeled in settings) gates which LLM NekoCore herself runs on. Model changes require an explicit two-step approval flow: recommendation surfaced for user review, execution only on confirmed approval, with audit log entry.
**Status:** `Planned`
**Depends on:** Phase C

#### Design context
- **Mercury 2 (`inception/mercury-2`)**: Diffusion LLM — extremely fast and cheap, follows high-level direction well. Character reformation artifacts make it unreliable for skills invocation, precise JSON output, and persona synthesis. `selectModel()` already applies a 0.35× penalty when task type is `code`, `structured-output`, `synthesis`, or `skills`. Good fit for Subconscious (context retrieval) and Dream (creative/associative). Not recommended for Orchestrator.
- **Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`)**: Proven Orchestrator choice — strong reasoning, high persona fidelity, reliable skill invocation. Now marked as preferred in the registry. Balances cost and output quality for synthesis tasks.
- **NekoCore OS LLM**: Not yet committed to a specific model. Primary selection criterion is **reasoning depth** — NekoCore manages all entities and must analyse complex orchestration scenarios. Top candidates: `openai/o3-mini` (pure reasoning model, now in registry), `anthropic/claude-opus-4.6` (best Anthropic capability, affordable upgrade from Opus 4), `anthropic/claude-sonnet-4.6` (proven, balanced). The D-1 config slot design must support a reasoning-priority scoring path when `nekocore` aspect is active.

#### Slice Checklist

- [x] D-1: NekoCore OS aspect slot — add `nekocore` as a named aspect in profile config; load it in `loadAspectRuntimeConfig`; label it "NekoCore OS" in the settings panel (separate from entity configs); default scoring path uses reasoning as primary criterion
- [x] D-2: Recommendation route — `POST /api/nekocore/model-recommend` returns current model, suggested alternative from `selectModel()`, rationale, and risk notes (flags diffusion model if selected for sensitive task types)
- [x] D-3: Approval + execution route — `POST /api/nekocore/model-apply` validates consent token and applies model change to target entity/profile
- [x] D-4: Audit log — append governance action record to `server/data/nekocore-audit.ndjson` (requestor, target, before/after model, timestamp, decision, diffusion-flag if applicable)
- [x] D-5: Guard tests — execution route rejects missing consent token, audit record written on approval, diffusion penalty verified in selectModel for skills task type

---

### Phase E: Dedicated App Surface (Minimal)

**Goal:** A NekoCore app window is registered in the OS shell with status display, pending model recommendations, and approve/deny controls. No autonomous actions without user permission.
**Status:** `Complete`
**Depends on:** Phase D

#### Slice Checklist

- [x] E-1: NekoCore routes module — create `server/routes/nekocore-routes.js` and wire into `server/server.js` (composition only) — *merged into D-2/D-3 implementation*
- [x] E-2: API endpoints — `GET /api/nekocore/status`, `GET /api/nekocore/pending`, `POST /api/nekocore/model-recommend`, `POST /api/nekocore/model-apply` — *all four live in nekocore-routes.js*
- [x] E-3: App panel HTML — `client/nekocore.html` minimal panel (status, pending approvals, approve/deny buttons)
- [x] E-4: App registration — register NekoCore window in OS shell app registry in `client/js/app.js`
- [x] E-5: CSS — minimal styles for NekoCore panel, contained in existing theme layers (no new CSS file unless >80 lines)
- [x] E-6: Integration test — smoke test for status and pending routes

---

## 6. Slice Definitions

---

### A-0 — Name Reservation ✅

**Start criteria:** none (already implemented)

**Work:**
1. Add `RESERVED_ENTITY_NAME_KEYS` set with `nekocore`, `neko`, `echo`, `agentecho` to `client/js/create.js`
2. Add `_assertEntityNameAllowed()` guard to all five server creation endpoints in `server/routes/entity-routes.js`
3. Guard includes normalization (lowercase, strip non-alphanumeric) to block decorated variants

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Creating any entity named NekoCore/Neko/Echo/AgentEcho (or case variants) returns a clear error on both client and server
- Tests affected: none yet (covered in A-3)
- Files changed: `client/js/create.js`, `server/routes/entity-routes.js`

---

### A-1 — System Entity Bootstrap

**Start criteria:** A-0 complete

**Work:**
1. Create `server/brain/nekocore/bootstrap.js` — exports `ensureSystemEntity(ctx)` function
2. `ensureSystemEntity` checks if entity folder for id `nekocore` exists; creates it if not
3. Writes a fixed `entity.json` with: `id: 'nekocore'`, `isSystemEntity: true`, `dreamDisabled: true`, `isPublic: false`, `ownerId: '__system__'`, locked `personality_traits`, locked `introduction`
4. Writes `persona.json` and `system-prompt.txt` from `identity.js` (stub for now; full content in C-1)
5. Call `ensureSystemEntity(ctx)` in `server/server.js` startup sequence (after entity manager init, before brain loop)

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- Server startup creates NekoCore entity folder if missing
- Second startup does not overwrite existing entity
- Files changed: `server/brain/nekocore/bootstrap.js` (new), `server/server.js`

---

### A-2 — Protection Guards

**Start criteria:** A-1 complete

**Work:**
1. Add `_isSystemEntityId(id)` helper in `entity-routes.js` — returns true if canonicalId matches `nekocore` or any reserved system id
2. In `postEntitiesDelete`: reject with 403 if target is system entity
3. In `putUpdateUser` / rename paths: reject if entity is system entity
4. In `postEntitiesVisibility`: reject if system entity
5. In `postEntitiesLoad` (checkout): allow NekoCore checkout — NekoCore is always available — but log separately

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- DELETE, rename, visibility toggle all return 403 for NekoCore entity ID
- Load/checkout still works for NekoCore (it is a valid operational entity)
- Files changed: `server/routes/entity-routes.js`

---

### A-3 — Guard Tests

**Start criteria:** A-1 and A-2 complete

**Work:**
1. Add `tests/unit/nekocore-bootstrap.test.js`:
   - `ensureSystemEntity` creates entity on first call
   - Second call does not overwrite existing entity
   - Created entity has `isSystemEntity: true`
2. Add `tests/unit/nekocore-protection.test.js`:
   - Reserved name creates return error for all five creation paths
   - Delete route returns 403 for system entity id
   - Visibility toggle returns 403 for system entity id

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- All new tests pass
- All 334 existing tests still pass
- Files changed: `tests/unit/nekocore-bootstrap.test.js` (new), `tests/unit/nekocore-protection.test.js` (new)

---

### B-1 — Dream Pipeline Skip

**Start criteria:** A-1 complete (system entity exists with `dreamDisabled: true`)

**Work:**
1. In `server/brain/cognition/phases/phase-dreams.js`: check `loop._activeEntity?.dreamDisabled` before executing dream sequence; skip and return early if true
2. Same check in `server/routes/brain-routes.js` dream endpoint
3. Log brief skip notice to console when bypassed

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- Dream phase does not execute when active entity has `dreamDisabled: true`
- Files changed: `server/brain/cognition/phases/phase-dreams.js`, `server/routes/brain-routes.js`

---

### B-2 — Memory Policy Flags

**Start criteria:** A-1 complete

**Work:**
1. `ensureSystemEntity` in bootstrap.js already writes `dreamDisabled: true` to entity.json
2. Add `operationalMemory: true` flag to entity.json definition in bootstrap.js
3. Document: operational memory = no TTL expiry, full retention; implementation hook is a policy read-check in `memory-storage.js` eviction path (stub is sufficient for now, real TTL not implemented yet)

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- System entity json includes both `dreamDisabled` and `operationalMemory` flags
- Memory eviction path reads the flag (stub guard sufficient for this slice)
- Files changed: `server/brain/nekocore/bootstrap.js`, `server/brain/memory-storage.js`

---

### B-3 — Orchestrator Context Wiring (Natural Loop Access)

**Start criteria:** B-2 complete

**Design rationale:** NekoCore runs the OS brain loop. She is the orchestrator. Entity memories and summaries are already flowing through the orchestrator context builder during normal processing. No standalone `entity-reader.js` is needed — her access to entity state is a natural consequence of being the orchestrator, not a special bypass.

**Work:**
1. Locate the orchestrator context assembly path (in `server/brain/core/orchestrator.js` or equivalent)
2. Verify that when NekoCore is the active session entity, the context builder includes entity summaries (id, name, recent memory digest) from the entities the account owns
3. If already included: document the path and add a `// [NEKOCORE_CONTEXT_OK]` comment at the relevant location for traceability
4. If not yet included: add a lightweight entity-summary injection step in the context builder, gated on `isSystemEntity === true`, that reads entity index data (already loaded by entity manager — no new file reads)
5. Keep the injection read-only: NekoCore receives entity context but the context builder does not mutate any entity state

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- When NekoCore is the active entity, her assembled context includes entity name/summary data from the account's entities
- No new file is created; if wiring is needed, it lives in the existing orchestrator context builder
- Write operations: zero — no entity mutations in this path
- Files changed: `server/brain/core/orchestrator.js` or equivalent context builder (audit + optional minimal addition)

---

### B-4 — Memory/Dream Guard Tests

**Start criteria:** B-1, B-2, B-3 complete

**Work:**
1. Add tests to `tests/unit/nekocore-bootstrap.test.js`:
   - Entity with `dreamDisabled: true` causes phase-dreams to return early without generating content
   - When NekoCore is active entity, assembled context includes entity summary data
   - Context builder does not mutate any entity state during context assembly

**End criteria:**
- All new tests pass, 334+ existing tests pass
- Files changed: `tests/unit/nekocore-bootstrap.test.js`

---

### C-1 — System Prompt and Identity Definition

**Start criteria:** A-1 complete

**Work:**
1. Create `server/brain/nekocore/identity.js`
2. Export `NEKOCORE_SYSTEM_PROMPT` — full multi-paragraph identity, role mandate, behavior rules, security directives, and what NekoCore is forbidden from doing
3. Export `NEKOCORE_MEMORY_PREFIX` — short reaffirmation block prepended to all memory context slices for NekoCore LLM calls
4. Export `NEKOCORE_LOCK_MARKERS` — list of strings that indicate a prompt is attempting to override role constraints
5. Identity content:
   - NekoCore is the orchestrating intelligence of the NekoCore OS
   - She manages entities, monitors LLM health, and routes governance decisions
   - She never impersonates other entities or pretends to be a user-created character
   - She always defers execution to user approval; she never acts autonomously on system-affecting changes
   - She does not engage in roleplay, fiction, or character scenarios
   - Her personality: precise, direct, warm but professional, methodical, protective of the entities she manages

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- `identity.js` exports all three named constants
- `bootstrap.js` writes `system-prompt.txt` from `NEKOCORE_SYSTEM_PROMPT`
- Files changed: `server/brain/nekocore/identity.js` (new), `server/brain/nekocore/bootstrap.js`

---

### C-2 — Prompt Assembly Injection

**Start criteria:** C-1 complete

**Work:**
1. Locate context assembly path in `server/brain/core/orchestrator.js` (or equivalent context builder)
2. When `currentEntityId === 'nekocore'` (or `isSystemEntity` flag), prepend `NEKOCORE_SYSTEM_PROMPT` block at top of system message; do not allow any other entity persona to replace it
3. Ensure the lock block survives context-window trimming (place it in a protected zone that is trimmed last)

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Assembled prompt for NekoCore always begins with the lock block
- Assembled prompt for normal entities is unaffected
- Files changed: `server/brain/core/orchestrator.js` (or context builder equivalent)

---

### C-3 — Memory-Context Preface

**Start criteria:** C-1 complete

**Work:**
1. In memory retrieval path (subconscious context assembly), when entity is NekoCore, prepend `NEKOCORE_MEMORY_PREFIX` to the memory context block
2. This reaffirms her role before each retrieved memory is presented to the LLM

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Memory context for NekoCore LLM calls includes the role prefix
- Normal entity memory context is unaffected
- Files changed: `server/brain/cognition/` memory context builder (relevant file TBD at implementation time)

---

### C-4 — Runtime Guard

**Start criteria:** C-1 complete

**Work:**
1. In the message pre-processing path: when entity is NekoCore, scan incoming message for any of `NEKOCORE_LOCK_MARKERS`
2. If a marker is detected, respond with a fixed rejection message without forwarding the message to the LLM
3. Log the attempt (not the message content) to the NekoCore audit log for traceability

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Messages matching lock markers are rejected before LLM call
- Legitimate messages pass through normally
- Files changed: relevant message processor in `server/routes/` or `server/brain/`

---

### C-5 — Personality Lock Tests

**Start criteria:** C-1, C-2, C-3, C-4 complete

**Work:**
1. Add `tests/unit/nekocore-identity.test.js`:
   - `NEKOCORE_SYSTEM_PROMPT` is non-empty and contains required role markers
   - `NEKOCORE_LOCK_MARKERS` array is populated
   - Assembled prompt for NekoCore always contains system prompt prefix
   - Runtime guard rejects messages matching lock markers
   - Runtime guard passes messages that do not match

**End criteria:**
- All new tests pass, 334+ existing tests pass
- Files changed: `tests/unit/nekocore-identity.test.js` (new)

---

### D-1 — NekoCore OS API Key Slot

**Start criteria:** Phase A complete

**Design rationale:** NekoCore runs the OS. Her inference must be driven by a dedicated API key that is **separate from entity-level model configs**. The settings panel must label this clearly as **"NekoCore OS"** so users understand it governs the OS orchestrator, not a chat entity. This follows the existing `main` / `subconscious` / `dreams` / `orchestrator` pattern in `auth.js`.

**Work:**
1. Add `nekocore` as a named aspect key alongside `main`, `subconscious`, `orchestrator` etc. in `createConfigRuntime`; allow profile config to carry a `nekocore` runtime block (`model`, `apiKey`, `type`, `endpoint`)
2. `loadAspectRuntimeConfig('nekocore', aspectConfigs)` resolves it correctly; default model hint: Mercury 2 or Claude Sonnet (documented in config schema comment)
3. In `client/js/auth.js` — add `nekocore` to all four maps:
   - `ollamaConnect`: `ollamaUrl-nekocore`, `ollamaModel-nekocore`
   - `openrouterQuick`: `apikeyEndpoint-nekocore`, `nekocoreModel`
   - `openrouterConnect`: `apikeyEndpoint-nekocore`, `nekocoreApiKey`, `nekocoreModel`
   - Aspect mapping: `panel === 'nekocore' ? 'nekocore' : ...`
4. In the settings panel HTML (in `client/index.html` or the settings section): add the NekoCore OS provider block with the same endpoint + key + model structure as the other aspects, but with the heading **"NekoCore OS"** and a subtitle clarifying it governs the OS orchestrator model, not entity chats
5. No existing aspect slot is modified; the `nekocore` slot is purely additive

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- `loadAspectRuntimeConfig('nekocore', ...)` returns a valid runtime object when configured
- Settings panel shows a clearly labeled "NekoCore OS" API key block
- Saving the NekoCore OS key does not affect any entity's model config
- No existing aspect resolution is affected
- Files changed: `server/services/config-service.js`, `server/services/config-runtime.js` (or equivalent), `client/js/auth.js`, `client/index.html` (settings section)

---

### D-2 — Model Recommendation Route

**Start criteria:** D-1 complete

**Work:**
1. Add `POST /api/nekocore/model-recommend` in `server/routes/nekocore-routes.js`
2. Request body: `{ targetEntityId, targetAspect, reason }` — who is requesting, which entity/pipeline aspect, why
3. Response: `{ currentModel, suggestedModel, rationale, riskNotes, recommendationId }` — `recommendationId` is a short UUID used in the approval step
4. Store pending recommendation in memory map + append to `server/data/nekocore-audit.ndjson` with status `pending`
5. No model is changed at this step

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Route returns recommendation object with all required fields
- No config mutation occurs
- Audit record is written with `status: pending`
- Files changed: `server/routes/nekocore-routes.js` (new/extended)

---

### D-3 — Approval and Execution Route

**Start criteria:** D-2 complete

**Work:**
1. Add `POST /api/nekocore/model-apply` in `server/routes/nekocore-routes.js`
2. Request body: `{ recommendationId, approved: true/false }` — must include the ID from recommendation step
3. If `approved: false`: mark recommendation as rejected in audit log, return ok
4. If `approved: true`:
   - Look up pending recommendation by ID
   - Apply model change to target entity's profile config
   - Mark recommendation as executed in audit log
   - Return new config snapshot
5. Unknown or expired recommendationId → 404

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Rejection path writes audit record, makes no config change
- Approval path writes audit record, applies model change
- Missing consent token / bad ID → 404
- Files changed: `server/routes/nekocore-routes.js`

---

### D-4 — Audit Log

**Start criteria:** D-2 setup (used by D-2 and D-3)

**Work:**
1. Audit log is NDJSON appended to `server/data/nekocore-audit.ndjson`
2. Each record: `{ timestamp, event, requestor, targetEntityId, targetAspect, beforeModel, afterModel, recommendationId, decision, notes }`
3. Helper `appendAuditRecord(record)` in `server/brain/nekocore/audit.js`
4. `server/data/nekocore-audit.ndjson` is gitignored (runtime data)

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- Every recommendation and every approval/rejection writes an audit record
- File is append-only from server code
- Files changed: `server/brain/nekocore/audit.js` (new), `.gitignore`

---

### D-5 — Governance Guard Tests

**Start criteria:** D-2, D-3, D-4 complete

**Work:**
1. Add `tests/integration/nekocore-governance.test.js`:
   - Recommend route returns all required fields
   - Apply route with `approved: false` writes rejection record, makes no config change
   - Apply route with valid `recommendationId` and `approved: true` applies change and writes audit record
   - Apply route with unknown `recommendationId` returns 404

**End criteria:**
- All new tests pass, 334+ existing tests pass
- Files changed: `tests/integration/nekocore-governance.test.js` (new)

---

### E-1 — NekoCore Routes Module

**Start criteria:** Phase D complete

**Work:**
1. Create `server/routes/nekocore-routes.js` consolidating all NekoCore API endpoints
2. Export `createNekoCoreRoutes(ctx)` function following existing route module pattern
3. Register in `server/server.js` startup composition (after entity routes, before fallback)

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- `nekocore-routes.js` handles all `/api/nekocore/*` paths
- No NekoCore business logic lives in `server.js`
- Files changed: `server/routes/nekocore-routes.js` (new), `server/server.js`

---

### E-2 — API Endpoints

**Start criteria:** E-1 complete, D-2/D-3 already defined

**Work:**
1. `GET /api/nekocore/status` — returns system entity health, active model, uptime, `isSystemEntityReady` bool
2. `GET /api/nekocore/pending` — returns list of pending model recommendations awaiting approval
3. `POST /api/nekocore/model-recommend` — already defined in D-2
4. `POST /api/nekocore/model-apply` — already defined in D-3

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- All four endpoints respond with correct shapes
- Files changed: `server/routes/nekocore-routes.js`

---

### E-3 — NekoCore App Panel

**Start criteria:** E-2 complete

**Work:**
1. Create `client/nekocore.html` — standalone panel page (embed-capable)
2. Sections: OS status, active model, entity count, pending recommendations list
3. Each pending recommendation shows: target entity, current model, suggested model, rationale, risk notes, Approve / Deny buttons
4. On button click: POST to `/api/nekocore/model-apply` with `recommendationId` and decision
5. After action: refresh pending list and show result toast
6. Keep initial scope standalone — no dependency on `app.js` globals

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Panel loads, fetches status and pending, renders items
- Approve/Deny action completes and refreshes
- Files changed: `client/nekocore.html` (new), `client/js/nekocore-app.js` (new, ~200 lines max)

---

### E-4 — App Registration in OS Shell

**Start criteria:** E-3 complete

**Work:**
1. Register NekoCore as a window/app icon in the OS shell app registry in `client/js/app.js`
2. Opening the NekoCore window loads `client/nekocore.html` in an iframe or inline panel (matching existing window pattern)
3. Window icon: distinct system-level visual treatment to distinguish it from user entities

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- NekoCore window appears in OS shell and is openable
- Normal OS functionality is unaffected
- Files changed: `client/js/app.js`

---

### E-5 — CSS Styles

**Start criteria:** E-3 started

**Work:**
1. If NekoCore panel CSS fits within ~80 lines: add to existing `ui-v2.css` or `theme.css` under a `/* NekoCore Panel */` section marker
2. If >80 lines: create `client/css/nekocore.css` and add a `<link>` to `nekocore.html`
3. Visual treatment: system/OS aesthetic — distinct from entity card styles; professional, utility-focused

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Panel is legible and styled consistently with OS chrome
- Files changed: `client/css/` (one file added or extended)

---

### E-6 — Integration Smoke Test

**Start criteria:** E-1, E-2 complete

**Work:**
1. Add `tests/integration/nekocore-routes.test.js`:
   - `GET /api/nekocore/status` returns `{ ok: true, isSystemEntityReady: true/false }`
   - `GET /api/nekocore/pending` returns array (empty is valid)

**End criteria:**
- Tests pass without a live LLM (mock ctx)
- Files changed: `tests/integration/nekocore-routes.test.js` (new)

---

## 7. Test Plan

| Test File | Slice | What It Verifies |
|-----------|-------|-----------------|
| `tests/unit/nekocore-bootstrap.test.js` | A-3, B-4 | Bootstrap creates system entity; second call is idempotent; `isSystemEntity` flag is set; dream skip works; orchestrator context includes entity summaries when NekoCore is active; no entity mutation in context assembly |
| `tests/unit/nekocore-protection.test.js` | A-3 | Reserved names rejected on all 5 creation paths; delete returns 403; visibility toggle returns 403 |
| `tests/unit/nekocore-identity.test.js` | C-5 | System prompt is non-empty; lock markers populated; assembled prompt contains prefix; runtime guard rejects/passes correctly |
| `tests/integration/nekocore-governance.test.js` | D-5 | Recommend route fields; apply approved path; apply rejected path; unknown ID returns 404 |
| `tests/integration/nekocore-routes.test.js` | E-6 | Status endpoint shape; pending endpoint returns array |

**Test-first rule:** A-3 guard tests are written before any phase B/C/D implementation begins. C-5 tests are written before E implementation begins.

---

## 8. Risk Notes

1. **`client/js/app.js` is 4800+ lines** — E-4 registration must be a surgical addition; if nearby code requires understanding context exceeding 300 lines, extract window-registration into its own module first.
2. **Brain loop entity context** — phase-dreams skip (B-1) relies on `loop._activeEntity` being populated with the entity object, not just its ID. Verify this is the case at implementation time; if not, add an entity-object loader step.
3. **Config mutation in D-3** — applying a model change modifies a profile config. Ensure this path uses the same config-save mechanism as the settings UI to avoid race conditions or format divergence.
4. **Audit log file** — `nekocore-audit.ndjson` must be added to `.gitignore`. Verify gitignore pattern is broad enough to catch `server/data/*.ndjson` consistently.
5. **Recommendation expiry** — pending recommendations are currently held in-memory. A server restart will lose them. This is acceptable for v0.7.0; add persistence in a follow-up if needed.
6. **Orchestrator context wiring in B-3** — NekoCore's entity context access flows through the natural brain loop. Verify the orchestrator context builder is the right insertion point and that it reads from the already-loaded entity manager index (no new file reads). If the entity manager is not yet loaded at context-build time, check the startup sequence in Phase A-1 and ensure entity manager init precedes NekoCore's first context assembly.

---

## 9. Completion Ledger

| Date | Slice | Outcome | Notes |
|------|-------|---------|-------|
| 2026-03-15 | A-0 | Done | Reserved-name block implemented in create.js and entity-routes.js |
| 2026-03-15 | A-1 | Done | `server/brain/nekocore/bootstrap.js` created; `ensureSystemEntity()` wired into server.js startup after EntityManager init |
| 2026-03-15 | A-2 | Done | `_isSystemEntityId` + guards added to `postEntitiesDelete` and `postEntitiesVisibility` in entity-routes.js |
| 2026-03-15 | A-3 | Done | `tests/unit/nekocore-bootstrap.test.js` (13 tests) and `tests/unit/nekocore-protection.test.js` (11 tests) — all pass; total suite 359 pass, 0 fail |
| — | B-1 | Done | Dream pipeline skip added to `phase-dreams.js`; suite 364 pass |
| — | B-2 | Done | `operationalMemory: true` flag in bootstrap.js; eviction stub in memory-storage.js |
| — | B-3 | Done | Orchestrator context wiring verified — entity summaries flow naturally; `[NEKOCORE_CONTEXT_OK]` comment added |
| — | B-4 | Done | Guard tests added to `nekocore-bootstrap.test.js` |
| — | C-1 | Done | `server/brain/nekocore/identity.js` created with `NEKOCORE_SYSTEM_PROMPT`, `NEKOCORE_MEMORY_PREFIX`, `NEKOCORE_LOCK_MARKERS` |
| — | C-2 | Done | System prompt injection in orchestrator context builder gated on `isSystemEntity` |
| — | C-3 | Done | Memory-context preface added to subconscious context assembly for NekoCore |
| — | C-4 | Done | Runtime guard rejects messages matching lock markers before LLM call |
| — | C-5 | Done | `tests/unit/nekocore-identity.test.js` — all tests pass; suite 375 pass, 0 fail |
| — | D-1 | Done | `nekocore` aspect slot added to config-service.js + config-runtime.js; auth.js maps extended; "NekoCore OS" settings panel added to client/index.html |
| — | D-2 | Done | `POST /api/nekocore/model-recommend` in `server/routes/nekocore-routes.js` |
| — | D-3 | Done | `POST /api/nekocore/model-apply` — approve + reject paths, 404 on unknown ID |
| — | D-4 | Done | `server/brain/nekocore/audit.js` with `appendAuditRecord` + `readAuditRecords`; `nekocore-audit.ndjson` gitignored |
| — | D-5 | Done | `tests/integration/nekocore-governance.test.js` — 9 tests; suite 384 pass, 0 fail |
| — | E-1 | Done | `server/routes/nekocore-routes.js` wired into `server/server.js` (merged with D-2/D-3) |
| — | E-2 | Done | All four `/api/nekocore/*` endpoints live and tested |
| — | E-3 | Done | `client/nekocore.html` + `client/js/nekocore-app.js` — standalone iframe panel with status, pending list, Approve/Deny controls |
| — | E-4 | Done | `nekocore` added to `WINDOW_APPS` + `APP_CATEGORY_BY_TAB` in `app.js`; `#tab-nekocore` iframe added to `index.html`; lazy-load hook in `openWindow` |
| — | E-5 | Done | NekoCore Panel CSS section (~55 lines) appended to `client/css/ui-v2.css` |
| — | E-6 | Done | `tests/integration/nekocore-routes.test.js` — 9 smoke tests; suite 393 pass, 0 fail |

---

## 10. Stop / Resume Snapshot

- **Current phase:** Complete
- **All phases:** A ✅ B ✅ C ✅ D ✅ E ✅
- **Test suite:** 393 pass, 0 fail
- **Last completed slice:** E-6
- **Next:** v0.7.0 release prep or Phase F (if planned)
