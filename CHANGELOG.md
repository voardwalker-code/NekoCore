# Changelog

All notable changes to REM System will be documented in this file.
Built with MA (Memory Architect v1).

## [Unreleased]

### Changed
- Documentation sync pass for source-of-truth docs (`Documents/current/ARCHITECTURE-OVERVIEW.md`, `PIPELINE-AND-ORCHESTRATION.md`, `MEMORY-SYSTEM.md`, `CONTRACTS-AND-SCHEMAS.md`, `OPEN-ITEMS-AUDIT.md`) to reflect v0.6.0 runtime behavior
- Updated architecture deck `Documents/REM-Architecture-v0.6.0.html` to match current orchestration flow (1A+1D parallel, 1C after both, 2B inlined), route/module counts, and schema wording
- Updated README docs-governance wording to reflect tracked source-of-truth docs in `Documents/current/`

## [0.6.0] - 2026-03-13

### Added
- Turn-signal extraction helpers (`server/brain/utils/turn-signals.js`) for deterministic subject/event/emotion/tension preprocessing
- Contributor contract validators (`server/contracts/contributor-contracts.js`) for subconscious/conscious/dream-intuition outputs
- Orchestration policy router (`server/brain/core/orchestration-policy.js`) for stage-based final-pass model escalation decisions
- Live dream-intuition adapter (`server/brain/cognition/dream-intuition-adapter.js`) for abstract no-write intuition artifacts
- Shared LLM runtime helper service (`server/services/llm-runtime-utils.js`) for endpoint normalization, JSON block parsing, usage estimation, and resume-tag stripping
- Boundary cleanup guard tests (`tests/unit/boundary-cleanup-guards.test.js`) to enforce service delegation policy in server composition
- Dream maintenance selector (`server/brain/cognition/dream-maintenance-selector.js`) for deterministic memory scoring across emotion, learn tags, error markers, staleness, and graph degree
- Dream link writer (`server/brain/knowledge/dream-link-writer.js`) for dream-to-source-memory link persistence and bus event emission
- Dream split guard tests (`tests/unit/dream-split-guards.test.js`) verifying live loop no-write policy and module wiring
- Dream maintenance unit tests (`tests/unit/dream-maintenance.test.js`) with 34 tests covering selector and link writer
- `enforceLatencyGuard(callFn, maxMs)` in `orchestration-policy.js`: wraps any async call in a timeout race; rejects with `{ timedOut: true, maxMs }` on ceiling hit; defaults to 35 000 ms
- Escalation guardrail regression tests (`tests/unit/escalation-guardrails.test.js`) with 31 tests covering all reason triggers, budget cap paths, timeout rejection, and integration call-site guards
- Worker output contract (`server/contracts/worker-output-contract.js`) with `validateWorkerOutput` and `normalizeWorkerOutput`; required: `summary`, `signals`, `confidence`; optional: `memoryRefs`, `nextHints`
- Worker registry (`server/brain/core/worker-registry.js`) — in-memory aspect-key-to-entity binding with register/unregister/get/list/clear
- Worker dispatcher (`server/brain/core/worker-dispatcher.js`) — `invokeWorker` wraps worker LLM call with latency guard, contract validation, and silent fallback
- Worker subsystem regression tests (`tests/unit/worker-subsystem.test.js`) with 46 tests covering contract validation, registry CRUD, dispatcher paths, and integration guards
- Phase A Re-evaluation (A-Re1–A-Re6): extracted ~1106 lines of business logic from `server/server.js` into focused service modules:
  - `server/services/llm-interface.js` — `callLLMWithRuntime` + `callSubconsciousReranker` factory (A-Re1)
  - `server/services/config-runtime.js` — aspect runtime config helpers factory (A-Re2)
  - `server/services/memory-operations.js` — `createCoreMemory` + `createSemanticKnowledge` factory (A-Re3)
  - `server/services/memory-retrieval.js` — `getSubconsciousMemoryContext` + helpers factory (A-Re4)
  - Removed duplicate `parseJsonBlock` from `post-response-memory.js` — now imported from `llm-runtime-utils` (A-Re5)
- Live-loop refactor hardening:
  - Fixed `enforceBudgetGuard` wiring: cumulative contributor token usage is now tracked and passed to `runOrchestrator` so the budget cap can actually block O2 escalation
  - 14 new orchestrator integration tests covering: all 4 parallel-contributor artifact strings, escalation/workerDiagnostics/timing/tokenUsage shape, contributor total-failure isolation, and budget guard integration via direct `runOrchestrator` call
  - `server.js` reduced from 2396 → 1290 lines (−46%); all 12 boundary guards green; 308 tests pass

### Changed
- Orchestrator live loop refactored to parallel contributors under orchestrator control: subconscious (1A), conscious (1C), dream-intuition (1D)
- Added explicit orchestrator refinement artifact (2B) before final synthesis stage
- Final orchestrator stage now supports policy-driven strong-runtime escalation hooks with fallback selection
- Runtime lifecycle concerns extracted from `server/server.js` into `server/services/runtime-lifecycle.js` (Telegram startup + graceful shutdown)
- Post-response memory encoding and trace-linking extracted from `server/server.js` into `server/services/post-response-memory.js`
- Natural-chat response postprocessing extracted from `server/server.js` into `server/services/response-postprocess.js`
- Dream maintenance candidate selection replaced inline `getMostImportant` heuristic with scored `selectDreamCandidates` from selector module
- Dream generation commits now write source links and emit bus events via `dream-link-writer`
- `shouldEscalateO2` in `orchestration-policy.js` now returns `{ escalate: boolean, reason: string }` instead of bare boolean; reason vocabulary: `'high-tension'`, `'error-constraint-combo'`, `'planning-implementation-combo'`, `'user-requested-depth'`, `'none'`
- `chooseO2Runtime` updated to consume `decision.escalate` from the new decision shape
- `enforceBudgetGuard` now returns `{ ok: true, reason: null }` on success (was missing `reason` field)
- `runOrchestrator` in `orchestrator.js` now calls `enforceBudgetGuard` as a blocking pre-check before O2 model selection; over-budget forces `escalate: false` with `'budget-cap-<reason>'`
- `runOrchestrator` wraps its `callLLM` call in `enforceLatencyGuard`; on timeout, falls back to `defaultRuntime` then to conscious-output fallback string
- `innerDialog.artifacts` now includes `escalation: { reason, modelUsed, timedOut, budgetBlocked, latencyMs, tokenCost }` on every orchestration call
- Orchestrator constructor now accepts `workerRegistry` option; `runSubconscious`, `runConscious`, `runDreamIntuition` each check registry before native call and use worker output when available
- Worker contributor results tagged with `_source: 'worker'`; native results implicitly `_source: 'native'` (absent field)
- `innerDialog.artifacts.workerDiagnostics` added: per-contributor `{ used, entityId }` on every orchestration call
- Worker dispatcher emits `worker_invoked`, `worker_success`, `worker_fallback` on cognitive bus

### Planned
- Architecture correction plan documented: user-facing `main` will map to final orchestrating self, with `conscious` treated as optional internal helper
- Worker-entity subsystem plan documented: reusable worker entities as host-aspect subsystems with system-only structured LLM-to-LLM outputs when assigned
- Worker subsystem constraints captured: workers can serve multiple hosts, can be directly chatted with when selected, and will support template-driven creation
- Phase B (Dream split hardening) fully scoped and delivered: B1 no-write guard, B2 dream-maintenance-selector, B3 dream-link-writer, B4-B5 wiring, B6 tests
- Phase C (Policy and safety hardening) fully scoped and delivered: C1 escalation reason output, C2 budget guard wiring, C3 latency timeout ceiling, C4 escalation telemetry, C5 regression tests
- Phase D (Worker subsystem pilot) fully scoped: D1 worker-output-contract, D2 worker-registry, D3 worker-dispatcher, D4 orchestrator wiring, D5 diagnostics, D6 tests — grounded in code audit

### Governance
- Activated documentation checkout policy with mandatory implementation ledger updates and phase status tracking
- Added boundary and anti-bloat enforcement policy (frontend/backend separation, route/contracts ownership, script size guardrails)
- Added cleanup gate that must pass before new expansion slices proceed
- Completed cleanup gate A-phase (A1-A5) with checkbox-driven execution and stop/resume tracking

## [0.5.1-prealpha] - 2026-03-10

### Added
- Timeline logger service (`server/services/timeline-logger.js`) with chronological NDJSON records for thought/chat/memory/trace activity
- Timeline APIs: `GET /api/timeline` and `GET /api/timeline/stream` for playback and live diagnostics
- Timeline Playback panel in neural visualizer with transport controls (play/pause/stop, step, rewind/fast-forward, speed controls, live mode)
- Space-key play/pause shortcut for timeline playback when Timeline tab is active
- Browser auto-open guard service (`server/services/auto-open-browser.js`) and unit tests (`tests/unit/auto-open-browser.test.js`) to prevent duplicate window opens on quick restarts

### Changed
- Completed Phase 15 hardening and stabilization: atomic memory writes, memory index divergence audit/rebuild tooling, and brain-loop health counters with circuit-breaker diagnostics
- Updated project version references to `0.5.1-prealpha`
- Subconscious retrieval path upgraded with pulse-backed trace hinting/indexing and reinforcement-aware best-path handling
- Decay phase now emits explicit memory-decay tick telemetry with sampled per-memory deltas for visual replay

## [0.5.0-prealpha] - 2026-03-09

### Added
- **Neko-Pixel-Pro Pixel Art Engine** (`pixel-art-engine.js`) — Generates 64×64 pixel art from dream and memory narratives. Extracts keywords via LLM or regex fallback, maps them to a handcrafted visual vocabulary of 85+ keywords and 200+ synonyms, and renders shape-based scenes with emotion-driven palettes. Outputs upscaled PNGs via `@napi-rs/canvas`
- **Dream Visualizer** (`dream-visualizer.js`) — Composites pixel art frames into animated GIFs for each dream cycle, with smooth color interpolation between frames. Supports three image generation modes: built-in pixel art (`pixel`), external image API (`api`, OpenAI DALL-E compatible), or disabled (`off`). Configurable frame delay and transition frames
- **Dream Gallery** (`dream-gallery.js`, UI tab) — New Dream Gallery tab in the browser UI displaying all dream visualization cycles as an image grid. Refresh button, manual generation trigger, and per-dream modal viewer
- **Image Generation Settings** — Configurable image generation mode in Dream Gallery settings panel. Users can choose built-in pixel art (no API key needed), connect an external image API (endpoint, API key, model), or disable image generation entirely. Settings persist in config and apply at runtime
- **Boredom Engine** (`boredom-engine.js`) — Detects understimulation via idle time tracking and neurochemistry (low dopamine/oxytocin) and triggers autonomous self-directed activities: creative writing, making things, workspace organization, self-reflection, reaching out to user, goal review, and curiosity exploration. Activity selection is weight-based with history tracking to avoid repetition
- **UI Enhancements** — `ui-enhance.css` with refined landing page (radial gradients, backdrop blur), `visualizer-enhance.css` with enhanced neural visualizer styling (glow effects, header refinements)
- **New API Endpoints** — `GET /api/brain/pixel-art` (list dream art), `GET /api/brain/pixel-art/:cycleId/:filename` (serve art files), `POST /api/brain/pixel-art/generate` (manual generation), `GET /api/sleep/config` and `POST /api/sleep/config` (sleep and image gen configuration)

### Changed
- **Brain Loop** — Integrated pixel art generation into dream cycles; dream phases now produce visual art alongside narratives
- **Sleep Configuration** — Extended to include image generation mode, API endpoint, API key, and model settings
- **Image Generation Default** — Image generation starts disabled (`off`); built-in pixel art requires optional `npm install @napi-rs/canvas gif-encoder-2`; UI prompts user to install when selecting pixel mode
- **Zero Dependencies Preserved** — `@napi-rs/canvas` and `gif-encoder-2` moved to `optionalDependencies`; server runs without them; lazy-loaded only when pixel art mode is enabled

## [0.4.0-prealpha] - 2026-03-09

### Changed
- Rebranded from Memory Architect to REM System (Recursive Echo Memory for AI minds)
- Updated all version references to v0.4.0 (pre)Alpha
- Added "Built with MA (Memory Architect v1)" credit throughout

## [0.3.0-alpha] - 2026-03-08

### Added
- **Neurochemistry Engine** (`neurochemistry.js`) — Simulates four neuromodulators (dopamine, cortisol, serotonin, oxytocin) that drift toward baseline and are nudged by 20+ cognitive bus events; drives emotional tagging, emotion-similarity scoring, Hebbian co-activation reinforcement, weak connection pruning, and consolidation scoring for DeepSleep
- **Somatic Awareness Engine** (`somatic-awareness.js`) — Maps real hardware metrics (CPU, RAM, disk) and cognitive metrics (response latency, context fullness, memory decay rate, cycle time, error rate) into natural-language felt sensations and neurochemical influence vectors; gives the entity embodied self-awareness
- **Belief Graph** (`server/beliefs/beliefGraph.js`) — Persistent knowledge graph of entity beliefs; beliefs form from repeated semantic memory patterns, connect to source memories and to each other, carry confidence scores, and guide attention during memory retrieval; per-entity storage in `beliefs/` directory
- **Neural Visualizer** (`client/visualizer.html`) — Standalone 3D visualization page powered by Three.js; real-time memory graph rendering with orbit controls, chat panel, memory browser, and diagnostics; dedicated CSS (`visualizer.css`) and JS (`visualizer.js`, `neural-viz.js`)
- **Pipeline Debug View** (`client/js/pipeline.js`) — Real-time cognitive pipeline visualization showing per-message timing, token usage, and processing stages
- **Workspace Skills** — `ws_mkdir` (create directories) and `ws_move` (move/rename files) skills for entity workspace management

### Changed
- **Attention System** — Updated scoring to integrate neurochemistry-aware activation and belief graph influence
- **Memory Graph Builder** — Enhanced graph construction with belief-aware linking
- **Orchestrator** — Integrated neurochemistry and belief graph into the cognitive pipeline
- **Brain Loop** — Added neurochemistry tick, Hebbian reinforcement, and connection pruning to background cycle
- **Entity Manager** — Extended to initialize belief graph and neurochemistry per entity
- **Memory Storage** — Emotional tags now include neurochemical snapshot at time of storage
- **Thought Types** — Added new event types for neurochemistry, beliefs, and somatic awareness
- **Server** — New API endpoints for belief graph and visualizer; entity last-memory endpoint
- **Client UI** — Updated CSS, chat, auth, and app modules for new features

## [0.2.0-alpha] - 2026-03-07

### Added
- **Geist-inspired dark theme** — New design system with `theme.css` (design tokens), `ui-v2.css` (full stylesheet), and `icons.css` (SVG icon base classes)
- **Auto-open browser** — Server automatically opens `http://localhost:3847` in your default browser on startup (cross-platform)
- **Stop Server button** — Red power button in the header to gracefully shut down the server from the UI (`POST /api/shutdown`)
- **UTF-8 charset headers** — All text MIME types now include `charset=utf-8` for proper encoding
- `api-entity-last-memory.js` server module

### Fixed
- **Tab switching broken** — Skills, Settings, and Advanced tabs were nested inside the Chat tab due to a missing `</div>`, making them invisible when switching tabs
- **Emoji/icon rendering** — Fixed double-encoded UTF-8 emoji (CP1252 mojibake) causing garbled text instead of icons throughout the UI

## [0.1.0-alpha] - 2026-03-06

### Added
- Initial release of REM System
- Persistent entity system with evolving identity and memory
- Multi-provider LLM support (OpenRouter, Ollama)
- Brain loop with conscious engine, subconscious agent, and dream engine
- Cognitive architecture: attention system, memory graph, curiosity engine, thought stream
- Orchestrator for multi-aspect inner dialog
- Skills system with workspace file management
- Web search and fetch integration
- Telegram bot integration
- Sleep cycle with memory consolidation and dreaming
- Entity creation: random, empty, guided, and character ingestion modes
- Chat with auto-archive and subconscious compression
- Memory self-healing and trace graph rebuilding
