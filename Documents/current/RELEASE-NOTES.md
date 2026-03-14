# REM System — Release Notes

---

## [Unreleased — post-0.6.0]

### Summary
Current cycle focus is interface-first usability and runtime reliability.
The desktop shell and built-in browser UX were refined for easier daily use, while shutdown/runtime browser window behavior was hardened.
The browser strategy now has a documented compliance-first roadmap based on embedded browser engines rather than a custom rendering engine.

### Highlights
- **Desktop shell usability updates** — launcher categories, pinned behavior hardening, clearer power/user actions
- **Browser app UX updates** — homepage, in-app search home/results/page switching, minimized-results recovery
- **Users app logout action** — direct sign-out from Users surface
- **Dedicated WebUI window shutdown closure** — graceful shutdown closes the dedicated browser window and resets lock state
- **NekoCore Browser roadmap draft** — phased plan with legal/commercial guardrails and engine-based implementation path
- **334 passing tests** across unit and integration suites

### Current Direction
1. Prioritize interface clarity and intuitive app flows before deeper feature expansion.
2. Keep runtime/shutdown behavior predictable and safe.
3. Progress browser capability through an embedded-engine strategy with explicit copyright and safety guardrails.

### Legal and Community Safety Notes
1. Project remains MIT licensed for open and commercial use.
2. No bypass-oriented features should be implemented (DRM, paywall, CSP/frame restriction circumvention).
3. AI extraction and persistence should remain explicit and user-directed.

### Browser Dependency and Notices Policy (NB-0-2)
1. Browser dependencies now follow an approval checklist: license compatibility, maintenance/security health, required purpose, and notices readiness.
2. Third-party notice bundles are required for distributed browser artifacts.
3. Engine/runtime notice requirements must be included when using WebView2, CEF, Electron, or equivalent embedded-browser runtime.
4. Dependency additions for browser-host work must be reflected in release documentation.

### Browser Data Boundary Policy (NB-0-3)
1. Browser data and REM memory are now explicitly treated as separate stores.
2. Browser analysis defaults to ephemeral; no silent auto-ingest into REM memory.
3. Browser-to-memory writes require explicit user-directed action and confirmation.
4. Saved browser artifacts should include source attribution metadata when available.

### Browser Spike Acceptance Baseline (NB-1-0)
1. Technical acceptance checks are now defined for navigation, tab model invariants, lifecycle event visibility, and download event visibility.
2. Spike validation now requires an evidence package: pass/fail matrix, event-trace sample, and residual-risk notes.
3. Phase NB-1 remains active with NB-1-1 as the next slice (repo module boundaries).

### Breaking Changes
None. Existing entities continue to work. New features activate only when explicitly used.

---

## [0.5.2-prealpha] — 2026-03-11

### Highlights
- Parallel contributor pipeline live (1A + 1C + 1D)
- Multi-user support with user profile registry
- Per-user relationship system with 14-value feeling scale + trust/rapport tracking
- Relationship context injected into every subconscious pass

### What Is New

**Parallel Contributor Pipeline**
All three contributors — Subconscious (1A), Conscious (1C), Dream-Intuition (1D) — now run in parallel via `Promise.all`. This replaces the old serial Subconscious → Compress → Conscious flow. The Orchestrator then runs 2B refinement and a Final synthesis pass.

Pipeline per message:
```
1. 1A + 1C + 1D — parallel
2. Orchestrator 2B refinement
3. Orchestrator Final
4. [async] Memory encoding + relationship update
```

Total LLM calls: 5 synchronous + up to 2 async post-turn.

**Multi-User System**
Each entity now maintains its own registry of users it has met (`entities/<id>/memories/users/`). Episodic and semantic memories are stamped with `userId` and `userName`. Recalled memories render `[EXPERIENCE with user="X"]` in the subconscious context block.

User profile API (entity-routes.js):
```
GET/POST       /api/users
GET/POST/DELETE /api/users/active
PUT/DELETE     /api/users/:userId
```

**Per-User Relationship System**
After each chat turn, a fire-and-forget LLM call evolves the entity's relationship with the active user.

Tracked state: `feeling` (14-value scale: loathing → devoted), `trust` (0–1), `rapport` (0–1), `userRole`, `entityRole`, `beliefs[]`, `summary`, `changeReason`. Trust/rapport change bounded at ±0.08 per turn.

Context block rendered in subconscious:
```
[YOUR RELATIONSHIP WITH "Alice"]
  Feeling: warm  ████████░░  Trust: 78%
  Role: friend / companion
  Beliefs: ["Alice is curious and philosophical"]
  Summary: Three months of collaborative work. Genuinely warm.
```

Relationship API (entity-routes.js):
```
GET /api/relationships
GET /api/relationships/active
GET /api/relationships/:userId
```

**Architecture**
- New: `server/brain/cognition/dream-intuition-adapter.js` — live 1D contributor (no memory writes)
- New: `server/brain/utils/turn-signals.js` — deterministic turn signal extraction
- New: `server/contracts/contributor-contracts.js` — output shape validators
- New: `server/brain/core/orchestration-policy.js` — initial escalation policy
- New: `server/services/user-profiles.js` — user registry management
- New: `server/services/relationship-service.js` — relationship state + LLM update
- New: `server/services/post-response-memory.js` — async post-turn side effects extracted
- New: `server/services/response-postprocess.js` — response cleanup extracted
- New: `server/services/runtime-lifecycle.js` — startup/shutdown extracted
- New: `tests/integration/orchestrator.test.js` — initial orchestrator integration suite
- New: `WORKLOG.md` — structured work tracking (phase checklists, ledger, stop/resume)

**Breaking Changes:** None. Existing entities work unchanged. New features activate only with a user profile set active.

---

## [0.5.1-prealpha] — 2026-03-10

### Highlights
- Timeline logger and playback in neural visualizer
- Memory write safety (atomic write strategy)
- Memory index divergence audit and rebuild tooling
- Brain-loop health counters and circuit-breaker diagnostics

### What Is New

**Timeline Logger**
`server/services/timeline-logger.js` records all cognitive events (thoughts, chat, memory, traces) as chronological NDJSON.
- `GET /api/timeline` — retrieve recorded events
- `GET /api/timeline/stream` — live event stream

**Timeline Playback**
New panel in the neural visualizer with transport controls: play/pause/stop, step, rewind/fast-forward, speed control, live mode. Space key toggles play/pause when Timeline tab is active.

**Memory Write Safety**
Atomic write strategy applied to core memory and index persistence paths:
1. Write payload to temporary file
2. Rename to target file
Reduces partial-write corruption risk on interruption.

**Memory Index Divergence**
`auditIndex()` compares disk state vs cached index state and reports: diskCount, indexCount, missingInIndex, staleInIndex, diverged. `rebuildFromDisk()` reconstructs index from actual filesystem state.

**Brain Loop Diagnostics**
Health counters and circuit-breaker status now tracked in `brain-loop-state.json`. Loop can self-detect hung states and surface diagnostics via API.

**Browser Auto-Open Guard**
`server/services/auto-open-browser.js` prevents duplicate browser windows on quick server restarts.

---

## [0.5.0-prealpha] — 2026-03-09

### Highlights
- Pixel art generation from dream/memory narratives
- Dream Gallery UI tab
- Boredom Engine (autonomous activity when understimulated)
- Neural Visualizer standalone 3D page
- Belief Graph, Neurochemistry Engine, Somatic Awareness Engine

### What Is New

**Neko-Pixel-Pro Pixel Art Engine**
Generates 64×64 pixel art from dream and memory narratives. Maps keywords to a handcrafted vocabulary of 85+ terms and 200+ synonyms, renders shape-based scenes with emotion-driven palettes. Compiled into animated GIFs per dream cycle. Optional dependency (`@napi-rs/canvas`, `gif-encoder-2`).

**Dream Gallery**
New UI tab displaying all dream visualization cycles. Refresh, manual generation trigger, per-dream modal viewer.

**Boredom Engine**
Detects understimulation (idle time + low dopamine/oxytocin) and triggers autonomous activity: creative writing, workspace organization, self-reflection, reaching out to user, goal review. Weight-based selection with history tracking avoids repetition.

**Belief Graph**
`server/beliefs/beliefGraph.js` — beliefs form from 3+ semantic memories on a shared topic. Confidence rises (+0.05) with reinforcement and falls (−0.10) with contradiction. Active beliefs boost retrieval scores for related topics (+0.20 × confidence).

**Neurochemistry Engine**
Simulates dopamine, cortisol, serotonin, oxytocin. Drifts toward baseline, nudged by 20+ cognitive bus events. Drives emotional tagging, Hebbian co-activation reinforcement, weak connection pruning.

**Somatic Awareness Engine**
Maps hardware metrics (CPU, RAM, disk) and cognitive metrics (latency, context fullness, decay rate, error rate) into natural-language felt sensations and neurochemical influence vectors.

**Neural Visualizer**
Standalone `client/visualizer.html` with Three.js 3D memory graph, orbit controls, chat panel, memory browser, and diagnostics.

---

## [0.4.0-prealpha] — 2026-03-09

Rebranded from Memory Architect to REM System (Recursive Echo Memory for AI minds).
