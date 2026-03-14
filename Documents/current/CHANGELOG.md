# REM System — Changelog

All notable changes to REM System.
Format: most recent first within each version block.

---

## [Unreleased — post-0.6.0]

### 2026-03-14

#### Interface-first shell update + browser UX pass (UI-Shell-2026-03-14)
- `client/index.html`: start launcher and taskbar flows refined for easier discoverability; Users surface now includes direct logout action.
- `client/js/app.js`: start menu category navigation, pinned-app behavior stability, and interaction race handling hardened.
- `client/js/app.js`: browser app gains in-app search home/results/page switching with minimized-results recovery controls.
- `client/css/ui-v2.css`: power controls, launcher cards, taskbar icon styling, and browser results/home styles refined.
- `client/assets/NekoCat.svg`: new launcher/taskbar app icon asset.

#### Browser lifecycle + shutdown behavior hardening (Runtime-Window-2026-03-14)
- `server/services/auto-open-browser.js`: dedicated WebUI window close helper added for shutdown flow.
- `server/services/runtime-lifecycle.js`: graceful shutdown now closes dedicated WebUI window and resets browser-open state.
- `server/server.js`: startup auto-open path aligned to preferred Chrome runtime and dedicated window behavior.
- `tests/unit/auto-open-browser.test.js`: launcher/runtime behavior tests expanded and kept green.

#### Documentation and roadmap sync (Docs-Sync-2026-03-14)
- `README.md`: added Current Direction and Copyright and Community Safety sections.
- `QUICKSTART.md`: added Basic Use Right Now flow for current desktop shell behavior.
- `NEKOCORE-BROWSER-ROADMAP.md`: phased draft for a compliant, engine-based NekoCore Browser strategy.
- `.gitignore`: backup snapshot folders and runtime artifact content rules tightened while allowing tracked directory placeholders.

Verification:
- `npm test`: 334 pass, 0 fail.

### 2026-03-13

#### Full documentation truth sync + architecture deck refresh (Docs-Truth-Review-1)
- `Documents/current/ARCHITECTURE-OVERVIEW.md`: version/state synced to 0.6.0, pipeline wording corrected (`1A + 1D` parallel, `1C` after both, final orchestrator with inlined 2B), memory lifecycle file ownership corrected.
- `Documents/current/MEMORY-SYSTEM.md`: corrected metadata-vs-content storage note (`log.json` metadata, `semantic.txt` content), schema text aligned to canonical fields, decay ownership paths corrected.
- `Documents/current/CONTRACTS-AND-SCHEMAS.md`: schema canonical field list aligned to `memory-schema.js`, enforcement wording updated, stale `memory-service.js` reference removed.
- `Documents/current/OPEN-ITEMS-AUDIT.md`: stale `memorySchemaVersion not enforced` item resolved to DONE; README/docs baseline statuses refreshed.
- `Documents/REM-Architecture-v0.6.0.html`: removed stale preAlpha wording and updated slides for current orchestrator flow, route/module counts, and memory schema language.
- `README.md`: docs-governance wording updated to reflect tracked source-of-truth docs in `Documents/current/`.

#### Skills token-gating + trigger system (Skills-Gate-1)
- `server/brain/generation/aspect-prompts.js`: `getConsciousPrompt()` extended with 4th `options = {}` param. Skills, workspace-tools, and task-planning sections now fully absent from the prompt by default (zero tokens). Injected only when `options.activeSkillsSection` or `options.includeWorkspaceTools` is truthy.
- `server/brain/core/orchestrator.js`: `runConscious()` parses `/skill <trigger>` (first word only, exact) and `/tool` from user message. Both passed as flags into `getConsciousPrompt`. `getSkillContext` callback slot added to constructor.
- `server/brain/skills/skill-manager.js`: new `buildSkillsPromptFor(trigger)` — exact, case-sensitive match on `skill.trigger || skill.name`. No fuzzy/partial/lowercase fallback. Returns XML block or null.
- `server/brain/skills/skill-manager.js`: `trigger` field added — read from SKILL.md frontmatter in `loadAll()`, exposed in `list()`, written in `createSkill()` when provided.
- `server/server.js`: `getSkillContext` callback wired into Orchestrator options.
- `server/routes/skills-routes.js`: `trigger` passed through from POST body to `createSkill()`.
- `client/index.html`: create-skill modal gains `Trigger` input field with exact/case-sensitive note; how-to guide rewritten for `/skill <trigger>` + `/tool` commands; skill detail panel gains invoke command display.
- `client/js/skills-ui.js`: skill cards show `/skill <trigger>` badge; detail panel shows invoke command; trigger field wired in create + cleared on close.
- `README.md`: Skills section fully rewritten with command syntax, exact/case-sensitive warning, built-in skills table with triggers, creation instructions.
- Token savings: ~750 tokens/turn on default turns; matched skill XML only on `/skill` turns; workspace docs only on `/tool` turns.
- All 318 tests pass.


- `server/brain/core/orchestrator.js`: rewired Promise chain so Conscious (1C) waits for BOTH Subconscious (1A) AND Dream-Intuition (1D) to complete before running.
- `server/brain/core/orchestrator.js`: 1D output (`dreamText`) is now passed into `runConscious()` and forwarded to `getConsciousPrompt()` as the real dream associations. Conscious reasons with 1A memory context AND 1D creative output simultaneously.
- `server/brain/core/orchestrator.js`: Orchestrator merge prompt restructured — role changed from "synthesizer" to "reviewer + voicer". Orchestrator receives full copy of everything Conscious had (1A context, 1D output, turn signals) plus the Conscious draft, reviews for fit, applies entity voice.
- `server/brain/generation/aspect-prompts.js`: `getOrchestratorPrompt()` system prompt rewritten to define reviewer/voicer role — explicit that thinking is done by Conscious, Orchestrator shapes HOW it is said not WHAT.
- `tests/unit/dream-split-guards.test.js`: updated guard regex to match the new code structure where `runDreamIntuition` feeds `Promise.all` upstream (intent unchanged — runDreamIntuition is still the live-loop contributor).
- `Documents/current/PIPELINE-AND-ORCHESTRATION.md`: overview, diagram, and contributor descriptions updated to reflect new flow.
- All 318 tests pass.
- `Documents/current/PIPELINE-AND-ORCHESTRATION.md`: updated stage diagram and stage descriptions to match current runtime flow: `1A + 1D` parallel, then `1C` with reused same-turn subconscious memory context, then single final orchestrator synthesis with refinement inlined.
- Updated call-count guidance to reflect current behavior (4 synchronous base calls, optional chatlog reconstruction calls inside 1A, async post-turn side effects).
- `README.md`: updated Per-Message Pipeline diagram to match the same flow.

#### Conscious active context reuse (Con-ActiveCtx-2)
- `server/brain/core/orchestrator.js`: removed second per-turn conscious retrieval (`getMemoryContext(userMessage)`) to avoid duplicate recall work.
- `server/brain/core/orchestrator.js`: conscious now receives active recall context from the already-fetched same-turn `subconsciousRaw.memoryContext`.
- Active recall hints (top memories + related chatlogs) remain in conscious briefing, but retrieval is now single-pass per turn.

#### Conscious active recall context (Con-ActiveCtx-1)
- `server/brain/core/orchestrator.js`: `runConscious()` appends a bounded `[ACTIVE RECALL CONTEXT]` block into the conscious briefing input.
- The active context includes concise top recalled memories (up to 6) and related chatlog snippets (up to 3) so conscious has direct per-turn retrieval context while composing.
- Relationship signal plumbing remains active and is combined with turn signals + active recall context in the same conscious-side prompt payload.

#### BugTest loop introduction (BugTest-Loop-1)
- New: `Documents/current/BUGTEST-NOTES.md` as active testing-phase queue with status flow (`Queued`, `In Test`, `Pass`, `Fail`, `Deferred`), reusable checklist template, and queued items for current high-impact slices.
- `WORKLOG.md`: added `BugTest Notes Loop` policy so behavior-impacting slices must add/update BugTest entries in the same slice, while low-risk cosmetic/text-only changes remain optional.

#### Memory recall cap tuning (Mem-Recall-Tuning-1)
- `server/services/memory-retrieval.js`: raised default subconscious pull cap from 24 to 36 (`getSubconsciousMemoryContext(..., limit = 36)`).
- `server/services/memory-retrieval.js`: raised prompt context memory cap from 8 to 12 (`contextConnections.slice(0, 12)`).
- `server/services/memory-retrieval.js`: raised related chatlog recall cap from 1 to 3 (`ltmScores.slice(0, 3)`).

#### Conscious relationship context plumbing (Rel-Flow-1)
- `server/brain/core/orchestrator.js`: `orchestrate()` now passes `entityId` into `runConscious(...)` so conscious can resolve entity-scoped relationship state for the active user.
- `server/brain/core/orchestrator.js`: `runConscious()` now loads relationship state from `relationship-service` and appends a bounded `[RELATIONSHIP SIGNAL]` block (feeling, trust, rapport, role mapping, top beliefs, short summary) into the concise conscious briefing.
- No contributor order change: Subconscious, Conscious, and Dream remain parallel; this slice only closes missing relationship context parity for conscious composition.

### 2026-03-12

#### Chat layout restructure (Nav-2)
- Advanced nav item: Replaced collapsible nav-group with a regular nav-item button ("Sleep & Tokens"). Opens as a full page tab — no dropdown.
- Visualizer replaces Neural: Neural nav-item and tab replaced with Visualizer. Embeds `/visualizer.html` in an iframe — no more popup window. `openVisualizer()` now switches to the Visualizer tab.
- Workspace & Activity moved to nav sidebar: Added as top-level nav-items with dedicated tab-content panels. Removed from chat sidebar.
- Chat right panel redesigned: Now shows Physical compact widget (always visible, somatic status + per-metric rows) and Pipeline Log (collapsible, starts closed).
- Physical nav-item removed from sidebar (content lives in chat right panel now).
- All dropdowns start closed by default.
- Log functions (`lg()`, `toggleLog()`, `autoOpenLog()`, `addSystemToLog()`, `resetAll()`) updated to target new sidebar log element.

#### Namespace deduplication: root memories/ isolation
- `server/server.js`: Timeline logger entity resolver no longer returns `rootDir: MEM_DIR` as fallback — system events go to `timeline-system.ndjson`, entity events always target entity-scoped paths
- `server/routes/memory-routes.js`: Removed all 9 `ctx.MEM_DIR` fallback code paths that wrote/read entity-type data (persona, mood, archives, etc.) from root `memories/`. Write ops return 409 when no entity is active; read ops return empty defaults. Only `getSystemPrompt` retains root fallback as an explicit default template.
- Root `memories/` is now strictly for system-level defaults (template prompt, system timeline logs); entity data lives exclusively in `entities/entity_<id>/memories/`

#### Unbreakable Identity Mode (entity creation)
- Added `🔒 Unbreakable Identity` checkbox to guided entity creation form (`client/index.html`)
- `client/js/app.js` reads checkbox, passes `unbreakable` in POST body, resets on modal close
- `server/routes/entity-routes.js` (guided creation): stores `unbreakable: !!unbreakable` in `entity.json`; branches `system-prompt.txt` template:
  - **Unbreakable**: `Personality: I am X. My traits are: Y.` + `YOUR BACKSTORY:` at top + `🔒 IDENTITY LOCK` block
  - **Evolving** (default): `YOUR STARTING TRAITS (where you began — you will grow beyond these)` + `YOUR ORIGIN STORY:` — backstory moved last by consolidator
- `server/brain/generation/context-consolidator.js`: checks `entity.json` for `unbreakable: true` before every context rebuild:
  - Unbreakable → `system-prompt.txt` included verbatim, no extraction, no traits stripping, no Section 5 repositioning
  - Evolving → existing behavior: backstory extracted and moved after memories under "Roots, Not Chains" framing; frozen traits line stripped

#### TASK_PLAN / TOOL pipeline conflict fix
- `server/brain/generation/aspect-prompts.js` (conscious prompt): added `CRITICAL — MUTUALLY EXCLUSIVE` rule: single `[TOOL:]` call → use TOOL directly, do NOT wrap in `[TASK_PLAN]`
- `server/brain/generation/aspect-prompts.js` (orchestrator prompt): changed "PRESERVE [TASK_PLAN]" to "only echo if conscious draft already contains one; NEVER generate both [TASK_PLAN] AND inline [TOOL:] together"
- `server/server.js`: tool execution now sets `result._toolsHandled = true`; task plan detection skips when `_toolsHandled` is set; safety-net strip after all task/tool logic removes `[TASK_PLAN]...[/TASK_PLAN]` and orphan `[TOOL:...]` from `result.finalResponse` before postProcessResponse

#### semantic.txt memory loading fix
- `server/brain/generation/context-consolidator.js`: was reading `log.json.semantic` field (always empty); now falls back to reading `semantic.txt` companion file when `log.json` has no `semantic` field
- Impact: all entities were building context.md with zero memory content (visible but empty); this fix restores full memory access to the context for every entity

#### Origin story evolution fix (context-consolidator)
- `server/brain/generation/context-consolidator.js`: backstory/origin story block now extracted from `system-prompt.txt` and repositioned LAST in context (after memories), framed as "Roots, Not Chains"
- Frozen `Personality: I am X. My traits are: Y.` declaration stripped from injected system prompt content (is a creation snapshot, not current truth — persona.json carries the live version)
- Default auto-generated `llmPersonality` from persona.json suppressed from context (prevents frozen creation default overriding evolved state)

#### Neko legacy migration (entity_neko-1772823025096)
- Migrated from Memory Architect v1 format to REM System format
- `entity.json`: added `configProfileRef`, `ownerId`, `isPublic`, `creation_mode: "legacy"`, `memory_count: 607`
- `memories/persona.json`: added `llmName`, `llmStyle`, `userName`, `userIdentity`, `activeUserId`, `createdAt`; cleaned `continuityNotes`; removed `rawDreamOutput` blob
- `memories/system-prompt.txt`: rebranded header, updated to evolving-entity trait framing
- `memories/users/`: created with `user_..._voard.json` profile + `_active.json`
- `memories/context.md`: rebuilt from 2,313 chars (0 memories) → 11,764 chars (607 memories visible)

---

### 2026-03-11

#### Phase E — Runtime Quality Hardening (all slices done)

**E1 — doc_* and boilerplate memory filtering**
- `server/services/memory-retrieval.js`: after computing `contextConnections`, filter out all `doc_*` ID entries (document ingestion chunks were scoring 0.965 in subconscious retrieval and flooding LLM context with irrelevant book content)
- Same file: filter entries whose semantic summary contains system boilerplate markers (`[SUBCONSCIOUS MEMORY CONTEXT]`, `Subconscious turn context for this user message`) — prevents corrupted `user_profile_*` memories from echoing system context into responses

**E2 — doc_* chatlog recall filtering**
- `server/services/memory-retrieval.js`: chatlog recall topic collection now excludes `doc_*` IDs
- Same file: `ltm/` folder scan now pre-filters `doc_*` named folders before stat check — eliminates spurious V4-chatlog-reconstruction LLM call that added ~2s latency per turn

**E3 — boilerplate memory creation guard**
- `server/services/post-response-memory.js`: before `createCoreMemory`, validate that `episodic.semantic` does not contain `[SUBCONSCIOUS MEMORY CONTEXT]`, `[CONVERSATION RECALL]`, `[INTERNAL-RESUME]`, or similar boilerplate — if so, skip memory creation with warning

**E4 — timing UI label fix**
- `client/js/chat.js`: timing display now uses `contributors_parallel_ms` / `refinement_ms` / `orchestrator_final_ms` keys with correct labels (`Contributors (∥)`, `Refinement (2B)`, `Final`) instead of stale `Sub/Conscious` labels from old serial pipeline that both showed the same value

#### Phase A Re-evaluation — Server Decomposition (all slices done, 318 tests pass)

**A-Re0 — Boundary guard tests**
- `tests/unit/boundary-cleanup-guards.test.js`: source-scan assertions that function definitions for `callLLMWithRuntime`, `callSubconsciousReranker`, `loadAspectRuntimeConfig`, `normalizeAspectRuntimeConfig`, `createCoreMemory`, `createSemanticKnowledge`, `getSubconsciousMemoryContext` are NOT in `server.js`; and that `parseJsonBlock` is not locally defined in `post-response-memory.js`

**A-Re1 — LLM Interface extraction**
- New: `server/services/llm-interface.js` — `callLLMWithRuntime(runtime, messages, opts, somaticAwareness)` + `callSubconsciousReranker(candidates, userMessage, runtime)` extracted from server.js (~230 lines)

**A-Re2 — Config runtime extraction**
- New: `server/services/config-runtime.js` — `normalizeSubconsciousRuntimeConfig`, `normalizeAspectRuntimeConfig`, `mapAspectKey`, `loadAspectRuntimeConfig`, `resolveProfileAspectConfigs` extracted from server.js (~209 lines)

**A-Re3 — Memory operations extraction**
- New: `server/services/memory-operations.js` — `createCoreMemory` + `createSemanticKnowledge` extracted from server.js (~258 lines)

**A-Re4 — Memory retrieval extraction**
- New: `server/services/memory-retrieval.js` — `getSubconsciousMemoryContext` + helpers (`extractSubconsciousTopics`, `getSemanticPreview`, `getChatlogContent`, `buildSubconsciousContextBlock`) extracted from server.js (~365 lines)

**A-Re5 — parseJsonBlock deduplication**
- Removed local `parseJsonBlock` definition from `server/services/post-response-memory.js` (lines 1-17); now imports from `llm-runtime-utils`

**A-Re6 — Final verification**
- `server/server.js` reduced from 2,396 lines → 1,290 lines (−46%); all 12 boundary guards green; 318 tests pass

#### Authentication System
- New: `server/services/auth-service.js` — account creation, login, session validation (bcrypt password hashing, session token generation)
- New: `server/routes/auth-routes.js` — `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`
- New: `client/js/login.js` — login UI logic
- New: `server/data/accounts.json` — account store
- New: `server/data/sessions.json` — session store

#### Live-Loop Refactor Hardening
- Fixed budget guard wiring: cumulative contributor token usage (1A + 1C + 1D + 2B) passed to `runOrchestrator` as `tokenUsageSoFar` so `enforceBudgetGuard` can block O2 escalation when budget is already consumed
- 14 new integration tests in `tests/integration/orchestrator.test.js` covering artifact shapes, contributor failure isolation, budget guard paths

#### Phase D — Worker Subsystem Pilot (all slices done, 300 tests pass)
- New: `server/contracts/worker-output-contract.js` — `validateWorkerOutput` + `normalizeWorkerOutput`; required fields: `summary`, `signals`, `confidence`
- New: `server/brain/core/worker-registry.js` — in-memory Map with register/unregister/get/list/clear
- New: `server/brain/core/worker-dispatcher.js` — `invokeWorker` wraps call in latency guard, validates contract, emits bus events, returns null on failure
- `server/brain/core/orchestrator.js`: accepts `workerRegistry` constructor option; all three contributors check registry first
- `innerDialog.artifacts.workerDiagnostics` added on every orchestration call
- New: `tests/unit/worker-subsystem.test.js` — 46 tests

#### Phase C — Escalation Guardrails (254 tests pass)
- `server/brain/core/orchestration-policy.js`: `shouldEscalateO2` returns `{ escalate, reason }` (was bare boolean); reason vocabulary: `high-tension`, `error-constraint-combo`, `planning-implementation-combo`, `user-requested-depth`, `none`
- New: `enforceLatencyGuard(callFn, maxMs)` — wraps async call in 35s timeout race; rejects with `{ timedOut: true, maxMs }` on ceiling hit
- `server/brain/core/orchestrator.js`: C2 budget check before O2 selection; C3 latency guard wrapping O2 synthesis; C4 `_escalation` telemetry object returned from `runOrchestrator`
- New: `tests/unit/escalation-guardrails.test.js` — 31 tests

#### Phase B — Dream Split Hardening (224 tests pass)
- New: `server/brain/cognition/dream-maintenance-selector.js` — candidate scoring across emotion, learn tags, error markers, staleness, graph degree; replaces inline `getMostImportant` heuristic
- New: `server/brain/knowledge/dream-link-writer.js` — dream-to-source-memory link persistence + cognitive bus event emission
- `server/brain/cognition/phases/phase-dreams.js`: wired with selector and link writer
- New: `tests/unit/dream-split-guards.test.js` — guards verifying live loop no-write policy
- New: `tests/unit/dream-maintenance.test.js` — 34 tests

#### Phase A — Initial Cleanup (all 5 slices done, 190 tests pass)
- New: `server/services/runtime-lifecycle.js` — server startup/shutdown extracted from server.js
- New: `server/services/post-response-memory.js` — async memory encoding + trace-linking extracted
- New: `server/services/response-postprocess.js` — response postprocessing extracted
- New: `tests/unit/boundary-cleanup-guards.test.js` — initial boundary regression tests
- New: `WORKLOG.md` — structured work tracking (37KB), phase checklists, slice definitions, implementation ledger, stop/resume snapshots

#### Other service extractions
- New: `server/services/user-profiles.js` — per-entity user registry management
- New: `server/services/relationship-service.js` — per-user relationship state (feeling/trust/rapport/beliefs), LLM-updated post-turn
- New: `server/services/config-runtime.js` — aspect/profile config resolution
- New: `server/services/llm-runtime-utils.js` — shared utilities (parseJsonBlock, endpoint normalization, usage estimation)
- New: `server/brain/utils/turn-signals.js` — turn signal extraction helpers
- New: `server/contracts/contributor-contracts.js` — contributor output shape validators
- New: `server/brain/core/orchestration-policy.js` — O2 escalation + budget + latency policy

#### Bug fixes
- Server startup `ReferenceError`: `getSemanticPreview` and `getChatlogContent` were referenced before extraction; fixed with correct destructure from `createMemoryRetrieval`
- Removed empty orphan config directory `server/Config/` (was not referenced anywhere; canonical config is `<root>/Config/`)

---

## [0.5.2-prealpha] — 2026-03-11

### Highlights
- Parallel contributor pipeline live (1A + 1C + 1D in parallel)
- Multi-user system (entity tracks separate user profiles)
- Per-user relationship system (entity develops feeling/trust/rapport/beliefs per user)
- Relationship context injected into subconscious pass

### Added
- Parallel contributor pipeline: subconscious (1A) + conscious (1C) + dream-intuition (1D) run via `Promise.all`; orchestrator runs 2B refinement then final synthesis
- `server/brain/cognition/dream-intuition-adapter.js` — live-loop dream-intuition contributor (abstract links, no memory writes)
- `server/brain/utils/turn-signals.js` — deterministic subject/event/emotion/tension preprocessing
- `server/contracts/contributor-contracts.js` — output shape validators for all three contributors
- `server/brain/core/orchestration-policy.js` — initial stage-based escalation policy
- User profiles: `server/services/user-profiles.js` + routes in `entity-routes.js` (GET/POST/PUT/DELETE /api/users, GET/POST /api/users/active)
- Relationship service: `server/services/relationship-service.js` — 14-value feeling scale, trust/rapport float, per-user beliefs, LLM-updated after each turn
- Timeline playback panel in neural visualizer (transport controls, live mode, speed controls)
- Browser auto-open guard (`server/services/auto-open-browser.js`) — prevents duplicate windows on quick restart
- `tests/integration/orchestrator.test.js` — initial orchestrator integration test suite

### Changed
- Dream maintenance (sleep offline) separated from Dream Intuition (live chat): intuition adapter has no memory writes at all
- `innerDialog.artifacts` now includes `escalation`, `workerDiagnostics`, timing, and tokenUsage keys

---

## [0.5.1-prealpha] — 2026-03-10

### Added
- Timeline logger (`server/services/timeline-logger.js`) with NDJSON records for all cognitive events
- Timeline APIs: `GET /api/timeline`, `GET /api/timeline/stream`
- Atomic memory writes (write-to-temp + rename strategy)
- Memory index divergence audit/rebuild tooling
- Brain-loop health counters and circuit-breaker controls

---

## [0.5.0-prealpha] — 2026-03-09

### Added
- Neko-Pixel-Pro pixel art engine from dream/memory narratives
- Dream Visualizer (animated GIF composition of pixel art frames)
- Dream Gallery tab in browser UI
- Boredom Engine — autonomous self-directed activity when entity is understimulated
- Neural Visualizer standalone page (Three.js 3D memory graph)
- Pipeline Debug View (real-time cognitive pipeline visualization)
- Belief Graph (`server/beliefs/beliefGraph.js`)
- Neurochemistry Engine (dopamine, cortisol, serotonin, oxytocin simulation)
- Somatic Awareness Engine (hardware metrics → felt sensations → neurochemical influence)
- Workspace skills: `ws_mkdir`, `ws_move`

---

## [0.4.0-prealpha] — 2026-03-09

- Rebranded from Memory Architect to REM System (Recursive Echo Memory)
