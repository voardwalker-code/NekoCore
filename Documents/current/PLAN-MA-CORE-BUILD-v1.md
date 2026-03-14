# PLAN: MA (Memory Architect) — Core Open Source Build

**Status:** `Planned`
**Version target:** 1.0.0-alpha
**Date created:** 2026-03-12
**Last updated:** 2026-03-12

---

## 1. Background / Why This Plan Exists

The REM System (heading toward AgentEcho) has grown into a large, multi-faceted cognitive platform — multi-user, multi-entity, visualizer, neurochemistry, document ingestion, worker subsystem, and more. It is not the right first impression for developers who want to understand and build on the memory architecture.

**MA (Memory Architect)** is the distillation. It is the core of what makes REM meaningful: a single AI entity with a real continuous memory, a parallel reasoning pipeline, and a brain loop that consolidates experience over time. Everything else is stripped.

The goal is an MIT-licensed project that any developer can clone, configure an LLM key, and have a running memory-backed AI entity in under 5 minutes. The codebase should be small enough to fully read in an afternoon.

This project will be the foundation that AgentEcho and future systems are described as "built with MA."

---

## 2. Objective

A new standalone repository `MA-Memory-Architect` containing only the memory core and parallel pipeline from REM, with a bare-bones single-page Web GUI, a 3-phase brain loop, and simple entity creation (Name, Vibe, Job). No auth, no multi-user, no visualizer, no neurochemistry, no document digestion, no skills.

Done = clean `npm start`, entity loads, chat works end-to-end, memories form, brain loop runs, README gets a new developer from clone to running in under 5 minutes.

---

## 3. Audit Findings — Files to Copy from REM

### Keep — Copy directly (may need trimming)

| File | Notes |
|------|-------|
| `server/server.js` | Needs heavy strip — remove all cut-system routes and wiring |
| `server/routes/chat-routes.js` | Keep — is the primary endpoint |
| `server/routes/memory-routes.js` | Keep — memory read/search |
| `server/routes/brain-routes.js` | Keep — brain loop on/off/status |
| `server/routes/entity-routes.js` | Keep partial — strip user/relationship/creation wizard |
| `server/routes/config-routes.js` | Keep — LLM config management |
| `server/routes/sse-routes.js` | Keep — inner dialog stream |
| `server/routes/cognitive-routes.js` | Keep partial — sleep trigger only |
| `server/services/llm-interface.js` | Keep |
| `server/services/config-runtime.js` | Keep |
| `server/services/memory-operations.js` | Keep |
| `server/services/memory-retrieval.js` | Keep |
| `server/services/post-response-memory.js` | Keep — strip relationship update call |
| `server/services/response-postprocess.js` | Keep |
| `server/services/runtime-lifecycle.js` | Keep — strip Telegram |
| `server/services/config-service.js` | Keep |
| `server/services/llm-runtime-utils.js` | Keep |
| `server/brain/core/orchestrator.js` | Keep — strip worker subsystem wiring |
| `server/brain/core/orchestration-policy.js` | Keep — escalation guards stay |
| `server/brain/generation/context-consolidator.js` | Keep — strip neurochemistry/somatic/relationship blocks |
| `server/brain/generation/aspect-prompts.js` | Keep — strip unused aspect prompts |
| `server/brain/memory/memory-storage.js` | Keep |
| `server/brain/memory/memory-index-cache.js` | Keep |
| `server/brain/memory/memory-decay.js` | Keep |
| `server/brain/cognition/dream-intuition-adapter.js` | Keep as stub (returns empty, no LLM call) |
| `server/brain/utils/turn-signals.js` | Keep |
| `server/brain/utils/entity-manager.js` | Keep — strip multi-entity selector |
| `server/brain/brain-loop.js` | Keep — strip to 3 phases only |
| `server/brain/cognition/phases/phase-archive.js` | Keep |
| `server/brain/cognition/phases/phase-decay.js` | Keep |
| `server/brain/cognition/phases/phase-traces.js` | Keep |
| `server/brain/cognition/phases/phase-dreams.js` | Keep as stub — brain pulse slot only, no generation |
| `server/brain/cognitive-bus.js` | Keep — reduced event set |
| `server/brain/bus/thought-types.js` | Keep — trim to used events |
| `server/contracts/contributor-contracts.js` | Keep |
| `server/data/names_female.txt` | Keep — entity name generation |
| `server/data/names_male.txt` | Keep |
| `server/data/personality_traits.txt` | Keep |
| `server/integrations/web-fetch.js` | Keep — used by SSE/config |
| `Config/ma-config.example.json` | Keep — rename comment to MA |
| `package.json` | New — name `ma-memory-architect`, version `1.0.0-alpha` |
| `client/index.html` | New — bare single page (see Phase 4) |
| `client/css/theme.css` | Keep — strip unused rules |
| `client/js/chat.js` | Keep — strip pipeline timer labels, strip multi-user UI |
| `client/js/app.js` | Keep — strip all tabs except Chat and Settings |
| `client/shared/api.js` | Keep |
| `client/shared/sse.js` | Keep |
| `client/shared/notify.js` | Keep |

### Cut — Do Not Copy

| Cut | Reason |
|-----|--------|
| `server/services/auth-service.js` | No auth in MA |
| `server/routes/auth-routes.js` | No auth |
| `client/js/login.js` | No auth |
| `server/services/user-profiles.js` | Single user, no registry |
| `server/services/relationship-service.js` | No relationship tracking |
| `server/brain/core/worker-registry.js` | No worker subsystem |
| `server/brain/core/worker-dispatcher.js` | No worker subsystem |
| `server/contracts/worker-output-contract.js` | No worker subsystem |
| `server/brain/cognition/dream-maintenance-selector.js` | No dream engine |
| `server/brain/knowledge/dream-link-writer.js` | No dream engine |
| `server/beliefs/beliefGraph.js` | Belief graph is v2 territory |
| All `server/brain/cognition/phases/` except archive, decay, traces, dreams-stub | Cut |
| `server/routes/document-routes.js` | No document ingestion |
| Document-related services | No document ingestion |
| `server/integrations/telegram.js` | No Telegram |
| `client/visualizer.html` | No visualizer |
| `client/js/visualizer.js` | No visualizer |
| `client/js/neural-viz.js` | No visualizer |
| `client/js/neural-viz/` | No visualizer |
| `client/js/diary.js` | No diary |
| `client/js/dream-gallery.js` | No dream gallery |
| `client/js/document-digest.js` | No document ingestion |
| `client/js/sleep.js` | Consolidated into main chat UI |
| `client/js/memory-ui.js` | Stripped — basic memory view only |
| `client/css/visualizer*.css` | No visualizer |
| `client/css/ui-enhance.css` | Strip to what remains |
| `server/services/timeline-logger.js` | No timeline |
| `tests/unit/worker-subsystem.test.js` | Not copied |
| `tests/unit/dream-maintenance.test.js` | Not copied |

---

## 4. Architecture Boundary Check

- [x] No frontend receives backend orchestration or filesystem logic
- [x] No backend receives DOM/UI concerns
- [x] Routes in `server/routes/**` only
- [x] No business logic in `server.js`
- [x] All new modules target <= 300 lines
- [x] No files above 1200 lines will be accepted in the new repo

---

## 5. Phases

---

### Phase 1: Scaffold New Repo

**Goal:** New `MA-Memory-Architect` repo exists, server starts, nothing crashes on load.
**Status:** `Planned`
**Depends on:** nothing

#### Slice Checklist
- [ ] 1-0: Create new repo folder, `package.json`, `README.md` stub, `LICENSE` (MIT), `.gitignore`
- [ ] 1-1: Copy and install only the kept server files; stub out all removed imports
- [ ] 1-2: Strip `server.js` to only wire the kept routes; remove all cut-system requires
- [ ] 1-3: Strip `runtime-lifecycle.js` — remove Telegram startup
- [ ] 1-4: Verify `npm start` — server boots without errors; all kept routes respond

---

### Phase 2: Entity Simplification

**Goal:** Entity creation is Name + Vibe + Job. Single entity loaded from config. No entity selector UI.
**Status:** `Planned`
**Depends on:** Phase 1

#### Slice Checklist
- [ ] 2-0: Write guard tests for single-entity invariants (no multi-entity loader, no user registry calls)
- [ ] 2-1: Simplify `entity-manager.js` — remove multi-entity selector; load one entity from config or create on first run
- [ ] 2-2: Replace entity creation wizard with 3-field form: Name, Vibe (personality summary, 1–2 sentences), Job/Role
- [ ] 2-3: Strip `entity.json` schema to: `id`, `name`, `vibe`, `job`, `created_at`, `creation_mode: "simple"`, `unbreakable: false`
- [ ] 2-4: Strip `context-consolidator.js` — remove neurochemistry block, somatic block, relationship block, user block; keep origin story + memories + persona mood
- [ ] 2-5: Strip `aspect-prompts.js` — keep only the prompts used by 1A (subconscious), 1C (conscious), 1D (dream-stub), 2B (refinement), Final

---

### Phase 3: Brain Loop Strip

**Goal:** Brain loop runs exactly 3 active phases. Dream slot is a no-op stub. No hebbian, pruning, goals, beliefs, diary, boredom, somatic, neurochemistry.
**Status:** `Planned`
**Depends on:** Phase 2

#### Slice Checklist
- [ ] 3-0: Write guard test — brain loop phase list must be exactly `['archive', 'decay', 'traces', 'dream-stub']`
- [ ] 3-1: Rewrite `brain-loop.js` with exactly 4 phase entries (archive, decay, traces, dream-stub); remove all other phase imports
- [ ] 3-2: Create `phase-dreams-stub.js` — returns immediately, logs `dream-stub: skipped` to bus, no LLM call, no writes
- [ ] 3-3: Verify brain loop runs 20 cycles without errors; full test suite passes

---

### Phase 4: Web GUI — Bare Single Page

**Goal:** A single web page with: chat input, response area, SSE inner-dialog stream panel, and an inline settings link. No tabs. No visualizer.
**Status:** `Planned`
**Depends on:** Phase 1

#### Slice Checklist
- [ ] 4-0: New `client/index.html` — single page layout, no tab structure
- [ ] 4-1: Chat panel: message input, send button, conversation history, SSE inner-dialog stream (collapsible)
- [ ] 4-2: Settings panel (inline modal or separate `/settings` page): LLM provider + model selector per aspect, entity name display
- [ ] 4-3: Strip `app.js` to only what the single page needs; remove all tab-switching, diary, gallery, visualizer, document digest, sleep tab, pipeline tab
- [ ] 4-4: Strip `chat.js` to core send/receive/SSE; remove multi-user UI, relationship panel, pipeline timing display
- [ ] 4-5: Strip `theme.css` — remove unused CSS for cut UI components; keep dark theme base

---

### Phase 5: Verification + Open Source Polish

**Goal:** Clean `npm test`, README quick start works on a fresh clone, no secrets, MIT license confirmed.
**Status:** `Planned`
**Depends on:** Phases 1–4

#### Slice Checklist
- [ ] 5-0: Run `rg -n "sk-|api[_-]?key|token|secret|password"` — confirm zero hits in source
- [ ] 5-1: Run `rg -n "TODO|FIXME|HACK"` — review each and decide keep/remove
- [ ] 5-2: Write or verify `Config/ma-config.example.json` is complete and self-documenting
- [ ] 5-3: Write `tests/unit/core-pipeline.test.js` — guard tests for: memory store/retrieve, trace graph creation, brain loop phase list, entity load, chat route shape
- [ ] 5-4: Run `npm test` clean; record pass count
- [ ] 5-5: Write final `README.md` — what MA is, quick start (5 steps), LLM config guide, what the brain loop does, project structure
- [ ] 5-6: Add `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`
- [ ] 5-7: Final `git status` check — confirm no runtime data, no secrets, no personal entity files are staged
- [ ] 5-8: Tag `v1.0.0-alpha` and push

---

## 6. Slice Definitions

---

### 1-0 — New Repo Scaffold

**Start criteria:** This plan written and reviewed.

**Work:**
1. Create new folder `MA-Memory-Architect/` (separate from REM repo)
2. `package.json` — name `ma-memory-architect`, version `1.0.0-alpha`, scripts `start`, `test`
3. `LICENSE` — MIT, copyright `Adam (Voard)`
4. `.gitignore` — same rules as REM: `node_modules/`, `Config/ma-config.json`, `entities/`, `memories/`, `Documents/`, `server/data/accounts.json`
5. `README.md` stub — title, one-paragraph description, "Quick Start coming soon"
6. Init git repo, first commit

**End criteria:** Folder exists, git initialized, `npm install` runs without error.

---

### 1-1 — Copy and Stub Server Files

**Start criteria:** 1-0 done.

**Work:**
1. Copy all "Keep" server files from REM into matching paths in MA
2. For every import of a cut system (auth, workers, relationship, visualizer, document, telegram, belief graph, neurochemistry, somatic, diary, boredom, goals, curiosity, skills), replace with a comment: `// [CUT: <system>]`
3. Do not remove the import lines yet — just stub them so the server can be audited before stripping

**End criteria:** All kept files copied. No import resolves to a missing file.

---

### 1-2 — Strip server.js

**Start criteria:** 1-1 done.

**Work:**
1. Remove all `require` statements for cut systems
2. Remove all `app.use()` calls for cut routes
3. Remove any startup logic specific to cut systems (Telegram bot init, user registry load, auth seed, etc.)
4. `server.js` should wire: chat, memory, brain, entity, config, sse, cognitive routes + `runtime-lifecycle`
5. Confirm line count is under 300

**End criteria:** `server.js` < 300 lines. Only kept routes are wired. `[BOUNDARY_OK]`

---

### 2-2 — Simple Entity Creation Form

**Start criteria:** 2-1 done.

**Work:**
1. New `POST /api/entity/create-simple` route accepting `{ name, vibe, job }`
2. `vibe` = 1–2 sentence personality summary (replaces guided wizard and Big Five)
3. `job` = role/occupation descriptor ("philosopher", "assistant", "creative writer", etc.)
4. Writes `entity.json` with minimal schema
5. Generates `system-prompt.txt` from template: name + vibe + job interpolated into a short identity foundation
6. No LLM call required for creation — pure template generation

**End criteria:** Entity created in under 1 second. `entity.json` contains only defined minimal fields. No wizard UI. `[BOUNDARY_OK]`

---

### 3-1 — Brain Loop 4-Phase Rewrite

**Start criteria:** 3-0 guard test written.

**Work:**
1. Rewrite `brain-loop.js` phase array to exactly: `[archive, decay, traces, dreamStub]`
2. Remove imports for: goals, identity, beliefs, deep-sleep, neurochemistry, somatic, hebbian, pruning, consolidation, boredom, conscious-stm, curiosity, diary
3. Cycle interval: 30s (unchanged)
4. Deep sleep interval: removed entirely

**Boundary markers:** `[JS_OFFLOAD]` — phase list is deterministic, owned by this file only

**End criteria:** Guard test passes. Loop runs with exactly 4 phases. All removed phase files not present in repo.

---

### 4-0 — Single Page HTML

**Start criteria:** Phase 1 done.

**Work:**
1. Single `index.html` page — no iframes, no tab navigation
2. Layout: header (entity name), main content (chat + inner dialog stream side by side or stacked), footer (status bar)
3. Settings accessible via gear icon → modal (not a separate page)
4. All client JS in `client/js/` — no inline scripts
5. References: `theme.css`, `chat.js`, `app.js`, `api.js`, `sse.js`, `notify.js`

**End criteria:** Page loads, chat input is visible, no console errors on load.

---

### 5-5 — Final README

**Start criteria:** Phases 1–4 complete, tests passing.

**Work — README must contain:**
1. One-paragraph "What is MA" description (cognitive memory architecture, not a chatbot wrapper)
2. Quick Start — exactly 5 steps: clone, copy config, add LLM key, `npm start`, open browser
3. LLM config guide — `Config/ma-config.example.json` annotated, explains `subconscious` / `conscious` / `dream` aspect keys
4. "How It Works" — 3 paragraphs max: memory lifecycle, parallel pipeline, brain loop
5. Project structure table — server/routes, server/services, server/brain, client
6. "Built With MA" note — links to AgentEcho (REM System) as an example of a system built on this foundation
7. License: MIT

**End criteria:** README reviewed on a fresh clone. New developer can reach a running system in under 5 minutes following the README only.

---

## 7. Test Plan

| Test File | Slice | What It Verifies |
|-----------|-------|-----------------|
| `tests/unit/core-pipeline.test.js` | 5-3 | Memory store/retrieve, trace creation, chat route response shape |
| `tests/unit/brain-loop-phases.test.js` | 3-0 | Brain loop phase list is exactly `['archive', 'decay', 'traces', 'dream-stub']` |
| `tests/unit/entity-simple.test.js` | 2-0 | Single entity invariants, no user registry, no multi-entity loader |
| `tests/unit/boundary-guards.test.js` | 1-2 | server.js does not contain auth/worker/neurochemistry/relationship references |

**Test-first rule:** 3-0 and 2-0 guards written before any stripping work begins in their respective phases.

---

## 8. Risk Notes

1. **Context consolidator dependencies** — `context-consolidator.js` currently builds blocks for neurochemistry, somatic, relationship, and users. Removing those blocks must be done carefully — the remaining output must still be a valid, coherent system prompt. Test with a real chat turn after each removal.
2. **aspect-prompts.js references removed systems** — Some prompts reference neurochemical state or relationship context. These must be rewritten to be self-contained. Simple is fine here — entity identity, current mood (from `persona.json`), task.
3. **post-response-memory.js calls relationship update** — The async fire-and-forget at the end of every turn must have that call removed. Otherwise it throws on missing `relationship-service`.
4. **brain-loop phase removal may break cognitive bus subscribers** — Some bus events (like `NEUROCHEMICAL_SHIFT`) are subscribed to by removed systems. Removing the phase is fine; confirm no remaining code expects those events.
5. **Single-entity simplification deletes the entity selector** — The client `app.js` currently has entity switching logic. Removing it means on first load the single entity is always active. Need to handle the "no entity exists yet" case (show creation form instead of chat).

---

## 9. Completion Ledger

| Date | Slice | Outcome | Notes |
|------|-------|---------|-------|

---

## 10. Stop / Resume Snapshot

- **Current phase:** Pre-start
- **Current slice:** none — plan written, not started
- **Last completed slice:** none
- **In-progress item:** none
- **Blocking issue:** none
- **Next action on resume:** Begin Phase 1 — create new `MA-Memory-Architect/` folder, run 1-0
