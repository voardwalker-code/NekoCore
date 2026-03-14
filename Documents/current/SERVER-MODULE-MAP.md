# REM System — Server Module Map

Last updated: 2026-03-14

Reference for every server-side file and what it owns. Reflects the state after the Phase A Re-evaluation decomposition that reduced `server.js` from 2,396 lines to 1,290 lines (−46%).

---

## Architecture Boundary Policy

From `WORKLOG.md`:

| Boundary | Rule |
|----------|------|
| `client/**` | Front-end only — no backend orchestration, file system logic, or server-side policy |
| `server/**` | Back-end only — no DOM/UI rendering |
| `server/routes/**` | API routing only — no business logic |
| `server/contracts/**` | Data schemas and output validators |
| `server/server.js` | Composition/bootstrap ONLY — no business logic |

Size guardrails:
- New modules target ≤ 300 lines
- Files above 800 lines are high-risk — no new feature blocks without extraction plan
- Files above 1,200 lines require refactor extraction in the same slice

Markers used in notes/tickets:
- `[BOUNDARY_OK]` — layer placement correct
- `[JS_OFFLOAD]` — deterministic logic is script-owned
- `[CONTRACT_ENFORCED]` — contributor output/input contract validated

---

## Browser Module Boundary Map (NB-1-1)

This section governs the upcoming browser host spike layout.

| Module area | Ownership | Must NOT own |
|-------------|-----------|--------------|
| `browser-host/**` | Embedded-engine runtime lifecycle, navigation execution, tab/window primitives, host events | REM memory writes, API route logic, shell rendering |
| `browser-shared/**` | Engine-agnostic contracts for tab/session/download/lifecycle payloads | Engine SDK bindings, UI rendering, route handlers |
| `server/routes/browser-routes.js` | Browser HTTP endpoints (request validation, response shaping) | Embedded host process control internals, UI logic |
| `server/services/browser/**` | Backend browser orchestration adapters and policy checks | Route declarations, DOM/UI rendering |
| `client/js/browser/**` | Browser shell UI state, interaction handlers, telemetry display wiring | Filesystem/process control, backend business policy |
| `server/server.js` | Composition/bootstrap wiring of browser modules | Browser business logic blocks |

---

## server/server.js

**Role: Composition and bootstrap only.**
Wires all services, registers route modules, starts the HTTP server, initializes the cognitive engine.
No business logic should live here.

After Phase A Re-evaluation: ~1,290 lines (was 2,396).

---

## server/services/

| File | What it owns |
|------|-------------|
| `auth-service.js` | Account creation, login, session validation (bcrypt hashing, token generation) |
| `auto-open-browser.js` | Browser runtime selection, dedicated launch/focus behavior, browser-open lock state, and dedicated window close helper |
| `config-runtime.js` | `normalizeAspectRuntimeConfig`, `loadAspectRuntimeConfig`, `resolveProfileAspectConfigs`, `mapAspectKey`, `normalizeSubconsciousRuntimeConfig` — aspect/profile config resolution for multi-LLM routing |
| `config-service.js` | Reading and writing `Config/ma-config.json`; default config generation |
| `entity-runtime.js` | Entity state lifecycle — paths, storage backends, brain loop refs, SSE context, active user |
| `llm-interface.js` | `callLLMWithRuntime(runtime, messages, opts, somaticAwareness)` — all LLM API calls go through here; `callSubconsciousReranker(candidates, userMessage, runtime)` |
| `llm-runtime-utils.js` | Shared utilities: `parseJsonBlock`, endpoint normalization, usage estimation, resume-tag stripping |
| `memory-operations.js` | `createCoreMemory`, `createSemanticKnowledge` — episodic and semantic memory creation |
| `memory-retrieval.js` | `getSubconsciousMemoryContext` + helpers (`extractSubconsciousTopics`, `getSemanticPreview`, `getChatlogContent`, `buildSubconsciousContextBlock`) — subconscious context block assembly |
| `memory-service.js` | High-level memory service facade |
| `post-response-memory.js` | Async fire-and-forget after each response: memory encoding + relationship update |
| `relationship-service.js` | Per-user relationship state (feeling/trust/rapport/beliefs), LLM-updated post-turn |
| `response-postprocess.js` | Strips tool tags and formats final response text |
| `runtime-lifecycle.js` | Server startup sequence, graceful shutdown, dedicated WebUI window close + browser-open state reset |
| `user-profiles.js` | Per-entity user registry: create/read/update/delete/set-active user profiles |

---

## server/routes/

| File | Routes |
|------|--------|
| `auth-routes.js` | `POST /auth/login`, `POST /auth/logout`, `GET /auth/session` |
| `brain-routes.js` | Brain loop start/stop/status |
| `chat-routes.js` | `POST /api/chat` — main conversation endpoint |
| `cognitive-routes.js` | Sleep trigger, dream trigger, archive trigger |
| `config-routes.js` | Runtime config read/write + backup/restore endpoints |
| `document-routes.js` | Document ingestion pipeline |
| `entity-routes.js` | Entity CRUD, guided/character creation, user profiles, relationships |
| `memory-routes.js` | Memory read/search/delete |
| `skills-routes.js` | Skill invocation surface |
| `sse-routes.js` | Real-time cognitive event streaming |

---

## server/brain/core/

| File | What it owns |
|------|-------------|
| `orchestrator.js` | Full pipeline runner: parallel contributors → 2B refinement → Final; escalation + budget + latency guards; worker subsystem injection |
| `orchestration-policy.js` | `shouldEscalateO2` (returns `{ escalate, reason }`), `chooseO2Runtime`, `enforceBudgetGuard`, `enforceLatencyGuard` |
| `worker-registry.js` | In-memory Map of aspect-key → worker entity binding; register/unregister/get/list/clear |
| `worker-dispatcher.js` | `invokeWorker(aspectKey, payload)` — latency guard, contract validation, bus events, null-on-failure |

---

## server/brain/generation/

| File | What it owns |
|------|-------------|
| `aspect-prompts.js` | System prompt strings for each contributor phase (subconscious, conscious, orchestrator-2B, orchestrator-final) |
| `context-consolidator.js` | Builds `context.md` per entity — reads all persona/memory/user data, assembles in the correct order, respects unbreakable flag |
| `message-chunker.js` | Splits long responses into `[CONTINUE]`-delimited bubbles |

---

## server/brain/memory/

| File | What it owns |
|------|-------------|
| `memory-decay.js` | Decay tick logic (importance shielding formula) |
| `memory-index-cache.js` | O(1) index lookups; atomic writes; divergence audit (`auditIndex`) and rebuild (`rebuildFromDisk`) |
| `memory-storage.js` | Atomic read/write for episodic/semantic/ltm folders |

---

## server/brain/cognition/

| File | What it owns |
|------|-------------|
| `dream-intuition-adapter.js` | Live 1D contributor — abstract associations only, NO memory writes |
| `dream-maintenance-selector.js` | Multi-factor candidate scoring for offline dream selection |
| `phases/phase-dreams.js` | Offline dream execution: runs selector, LLM synthesis, link writer |
| `phases/phase-sleep.js` | Sleep cycle coordinator |
| Other phase files | `phase-archive.js`, `phase-emergence.js`, etc. — brain loop phase handlers |

---

## server/brain/knowledge/

| File | What it owns |
|------|-------------|
| `beliefGraph.js` | Belief graph query and persistence |
| `dream-link-writer.js` | Dream-to-source-memory link persistence + cognitive bus events |

---

## server/brain/identity/

| File | What it owns |
|------|-------------|
| `hatch-entity.js` | Entity creation/initialization (with entity paths) |
| `onboarding.js` | First-session onboarding flow |
| `context.js` | Entity context helpers |

---

## server/brain/utils/

| File | What it owns |
|------|-------------|
| `entity-manager.js` | Entity create/rename/delete filesystem operations |
| `turn-signals.js` | Deterministic turn signal extraction (subject, event, emotion, tension) |

---

## server/contracts/

| File | What it owns |
|------|-------------|
| `memory-schema.js` | Canonical memory schema v1 + `normalizeMemoryRecord` |
| `contributor-contracts.js` | Output shape validators for subconscious/conscious/dream-intuition |
| `worker-output-contract.js` | `validateWorkerOutput` + `normalizeWorkerOutput`; required: `summary`, `signals`, `confidence` |

---

## server/entities/

| File | What it owns |
|------|-------------|
| `entityPaths.js` | Path helpers: `getEntityRoot(entityId)`, `getMemoryRoot(entityId)`, `getNeurochemistryPath(entityId)` |

---

## server/beliefs/

| File | What it owns |
|------|-------------|
| `beliefGraph.js` | Original belief graph module (the version in `server/brain/knowledge/` is the active runtime version) |

---

## server/integrations/

External service integrations (Telegram, etc.).

---

## server/tools/

Migration and maintenance scripts (run manually, not at runtime).

---

## server/data/

| File | Contents |
|------|---------|
| `accounts.json` | User accounts (hashed passwords) |
| `sessions.json` | Active session tokens |

---

## Tests

| File | Coverage |
|------|---------|
| `tests/unit/boundary-cleanup-guards.test.js` | Source-scan assertions that business logic is NOT in server.js |
| `tests/unit/worker-subsystem.test.js` | 46 tests: contract validation, registry, dispatcher, integration |
| `tests/unit/escalation-guardrails.test.js` | 31 tests: all escalation reason paths, budget cap, latency timeout |
| `tests/unit/dream-maintenance.test.js` | 34 tests: selector scoring, link writer |
| `tests/unit/dream-split-guards.test.js` | Guard tests for live/offline dream separation |
| `tests/integration/orchestrator.test.js` | 28 tests: artifact shapes, failure isolation, budget guard integration |
| `tests/unit/entity-paths.test.js` | Entity path helper coverage |
