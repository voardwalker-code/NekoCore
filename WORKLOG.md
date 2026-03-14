# WORKLOG

Status: active architecture refactor tracking.
Last updated: 2026-03-15

## Session Ledger - 2026-03-15 (NekoCore Browser NB-6 LLM Mode Foundation)

Status: `Completed`

Purpose:
1. Add LLM Mode to the NekoCore Browser alongside Human Mode.
2. Enable page summarization, ask-this-page chat, and structured extraction.
3. Add research session model separate from entity chat.
4. Enforce user confirmation for all memory writes.

Completed outputs:
1. Created `browser-host/research-session.js` — research session state management.
2. Added 13 new LLM API endpoints to `server/routes/browser-routes.js`.
3. Added LLM mode client code to `client/js/browser-app.js`.
4. Added LLM panel HTML to `client/index.html`.
5. Added full CSS for LLM mode to `client/css/ui-v2.css`.
6. All 334 existing tests pass. JS syntax verified. Server loads cleanly.

## Session Ledger - 2026-03-14 (NekoCore Browser Phase 0 Kickoff)

Status: `In Progress`

Purpose:
1. Move from browser roadmap discussion to executable phase work.
2. Start NekoCore Browser in a policy-first, compliance-safe path.
3. Keep implementation aligned with Documentation Checkout Policy before host code begins.

Kickoff outputs:
1. Added `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md` as the executable phase plan.
2. Set Phase NB-0 (Governance and Compliance Baseline) to `In Progress`.
3. Marked NB-0-0 complete (phase plan initialization).
4. Set next active slice to NB-0-1 (scope lock and non-goals).

Next action:
1. Finalize scope lock and non-goals text in browser roadmap and source-of-truth docs.
2. Complete dependency/notices policy and data-boundary policy before any browser-host implementation.

Progress update:
1. Completed NB-0-1 (scope lock and non-goals).
2. Browser implementation direction is now explicitly locked to app-on-engine.
3. Completed NB-0-2 (dependency approval and third-party notices policy).
4. Completed NB-0-3 (browser data boundary and persistence defaults policy).
5. Completed NB-0-4 (contributor provenance policy, DCO selected).
6. Completed NB-0-5 (Phase 0 exit review).
7. Phase NB-1 is now active.
8. Completed NB-1-0 (technical spike acceptance checks baseline).
9. Completed NB-1-1 (repo module boundaries for host/shared/contracts/routes).
10. Completed NB-1-2 (initial bridge/API contract list for browser session and tab state).
11. Completed NB-2-0 (NB-1 exit review and NB-2 gate open).
12. NB-1 technical spike-prep gate is Done.
13. NB-2 Technical Spike Implementation phase is now active.
14. Completed NB-2-1 (browser-host/ module scaffold created; entry point verified).
15. Completed NB-2-2 through NB-2-6 (event-bus, tab-model, navigation, lifecycle, download-manager, browser-routes wired, 23/23 acceptance tests pass).
16. NB-2 Technical Spike is Done.
17. NB-3 Browser Core MVP phase started and completed in a single pass:
    - Server: history-store, bookmark-store, session-store (JSON file persistence)
    - Routes: browser-routes.js rewritten with 22+ endpoints (history, bookmarks, session, update-tab)
    - Client: browser-app.js — full multi-tab browser (tab strip, per-tab iframes, address bar navigation, bookmark toggle, downloads panel, session restore, web search)
    - HTML: browser tab replaced with multi-tab structure (tab strip, frames container, downloads panel, bookmarks/history cards)
    - CSS: tab strip, tab buttons, downloads panel, history rows, empty states, frames container
    - Old inline browser code (~280 lines) extracted from app.js to standalone browser-app.js
    - Browser init hook wired into applyWindowActivationEffects
    - Require path fix for browser-routes → browser-host
    - 23/23 spike acceptance tests still pass
18. NB-4 Shell Integration phase completed in a single pass:
    - Server: settings-store.js (homepage, search engine, session restore, external link behavior)
    - Routes: settings GET/update/reset endpoints + browser status endpoint added
    - Client: openInBrowser(url) global launch routing function
    - Client: browser settings panel in Advanced tab (homepage, search engine, session restore, external links, clear history/bookmarks)
    - Client: browser status card in Task Manager (tab count, active URL, status)
    - Client: taskbar badge showing tab count on browser pinned-app button
    - Client: graceful shutdown (browserCleanup on beforeunload, sendBeacon session save, session save on window close)
    - Client: iframe blocked-site overlay with fallback to system browser
    - Client: search engine setting wired into URL normalization (Google/DuckDuckGo/Bing)
    - CSS: blocked overlay, taskbar badge, position:relative on pinned-app buttons
    - 23/23 spike acceptance tests still pass
19. NB-5 Human Mode Completion phase completed in a single pass:
    - Server: history-store upgraded (deleteEntry, deleteByDateRange, exportAll, importEntries)
    - Server: bookmark-store upgraded (search, update, clear, exportAll, importBookmarks, getFolders)
    - Routes: 10 new endpoints (history delete/delete-range/export, bookmarks update/clear/export/import/folders, settings export)
    - Client: bookmark manager panel (search, folder filter, inline edit, add form, delete per-item)
    - Client: history manager panel (search, grouped by date, per-entry delete, delete today, clear all)
    - Client: tab context menu (right-click: duplicate, reload, pin/unpin, mute/unmute, close, close others)
    - Client: middle-click tab to close, pinned tabs (sorted first, no close button, visual indicator)
    - Client: keyboard shortcuts (Ctrl+T/W/L/R/D/H/J, Ctrl+Shift+B, Ctrl+1-9, Alt+Left/Right, F5, Escape)
    - Client: import/export bookmarks (JSON), import/export settings (JSON), export history (JSON)
    - HTML: bookmark/history manager panels, toolbar with manager buttons, shortcuts bar, import/export buttons in Advanced tab
    - CSS: context menu, manager panels, manager rows, edit inputs, action buttons, shortcuts bar, pinned tab style
    - 23/23 spike acceptance tests still pass

## Session Ledger - 2026-03-14 (NekoCore Browser Roadmap Draft)

Status: `Planned`

Purpose:
1. Define a compliant path for a real NekoCore Browser product.
2. Keep the work open-source friendly, commercial-friendly, and contributor-safe.
3. Lock a phased plan before implementation starts.

Planning outputs:
1. Added `NEKOCORE-BROWSER-ROADMAP.md` as the source-of-truth draft for browser scope, guardrails, and phased delivery.
2. Defined product position as a browser application built on an existing engine, not a custom rendering engine.
3. Documented legal and commercial guardrails for licensing, contributor provenance, third-party notices, and prohibited bypass features.
4. Broke work into seven phases:
   - governance and compliance,
   - technical spike and repo layout,
   - browser core MVP,
   - shell integration,
   - human mode,
   - LLM mode and safety,
   - packaging and community readiness.

Next recommended action:
1. Review and approve the roadmap direction.
2. Start Phase 0 decisions before any browser-host implementation begins.

## Session Ledger — 2026-03-14 (Resilience + OS Window Runtime)

Status: `Done`

Slices completed:
1. Full backup/restore feature landed (folder-based):
   - Added APIs for backup/restore in `server/routes/config-routes.js`.
   - Added manifest generation and restore safety snapshots.
   - Added Advanced tab UI controls + handlers in `client/index.html` and `client/js/app.js`.
   - Fixed safety snapshot recursion bug by storing pre-restore snapshots outside `server/data/`.

2. Startup and WebUI auto-open behavior reworked to OS-style flow:
   - Removed strict timer-driven lockout behavior.
   - Added state-based open/switch behavior via lock-state + WebUI presence tracking.
   - Added `POST /api/system/webui-presence` and client heartbeat/beacon reporting.

3. Dedicated window launch behavior implemented cross-platform:
   - Windows/macOS/Linux launcher paths now prefer dedicated app/kiosk window modes.
   - Startup logs now explicitly report dedicated window launch/focus behavior.

4. Strict runtime policy enforced per OS with hard failure:
   - Default runtime policy: Windows=`edge`, macOS=`chrome`, Linux=`chrome`.
   - Missing runtime now fails loudly (no silent fallback to normal tab open).
   - Optional override supported via `REM_UI_RUNTIME`.

5. Test coverage updates for launcher/runtime logic:
   - Updated and expanded `tests/unit/auto-open-browser.test.js` for:
     - dedicated launch command builders,
     - state-based switching behavior,
     - strict runtime missing failure behavior.

Primary files touched this session:
1. `server/routes/config-routes.js`
2. `server/services/auto-open-browser.js`
3. `server/server.js`
4. `client/index.html`
5. `client/js/app.js`
6. `tests/unit/auto-open-browser.test.js`

Verification outcome:
1. Full automated suite green (`323 pass, 0 fail`) with additional isolated and recursive sweeps.

## Test Verification — 2026-03-14

Status: `Done`

Scope:
1. Full baseline suite (`unit + integration`) via package script.
2. Explicit isolated runs for `unit` and `integration` scripts.
3. Exhaustive recursive sweep of every `tests/**/*.test.js` file.

Execution notes:
1. PowerShell policy blocked direct `npm` execution (`npm.ps1` restricted); used `cmd /c npm ...` for script invocations.
2. Test warnings about config/profile validation and mocked LLM fallback paths are expected in current fixtures and did not produce failures.

Commands and outcomes:
1. `cmd /c npm test` → `323 passed, 0 failed`.
2. `cmd /c npm run test:unit` → `246 passed, 0 failed`.
3. `cmd /c npm run test:integration` → `77 passed, 0 failed`.
4. `node --test <all recursive tests>` (from `Get-ChildItem tests -Recurse -Filter *.test.js`) → `323 passed, 0 failed`.

Conclusion:
1. Automated test suite is green across baseline, isolated layers, and recursive exhaustive run.

## Documentation Checkout Policy

Purpose:
1. Keep docs synchronized with architecture/code changes in real time.
2. Prevent implementation drift from planned design.

Required workflow:
1. Before coding:
   - update planned flow/contracts in docs
   - mark phase as `Planned`
2. During coding:
   - log landed slices with date, scope, and files changed
   - mark status `In Progress` or `Done`
3. After coding slice:
   - update `CHANGELOG.md` under `Unreleased`
   - record next-phase actions and residual risks
4. No new feature slice may start if the active cleanup gate is open.

## BugTest Notes Loop

Purpose:
1. Keep a live queue of behavior-impacting slices that require manual bug testing.
2. Make testing phases deterministic by tracking what to validate, what passed, and what regressed.

Operating rules:
1. Bug testing is required for behavior-impacting slices (runtime logic, retrieval, orchestration, routing, persistence, auth, prompt wiring).
2. Bug testing is optional for low-risk cosmetic or text-only changes unless explicitly requested.
3. For required slices, add/update an entry in `Documents/current/BUGTEST-NOTES.md` in the same slice.
4. At test time, move entry status through `Queued` → `In Test` → `Pass`/`Fail`/`Deferred`.
5. If `Fail`, link follow-up fix slice IDs and keep the BugTest item open until revalidated.

Status labels:
1. `Planned`
2. `In Progress`
3. `Done`
4. `Blocked`

## Architecture Boundary and Script Bloat Policy

Purpose:
1. Prevent oversized scripts and mixed-layer logic.
2. Enforce separation of frontend, backend, routes, and contracts.

Hard boundaries:
1. Frontend (`client/**`) must not contain backend orchestration, file system logic, or server-side policy logic.
2. Backend (`server/**`) must not contain DOM/UI rendering concerns.
3. API routing belongs in `server/routes/**`; avoid plugging new route logic into `server/server.js`.
4. Data schemas and output validators belong in contracts modules (`server/contracts/**`).
5. `server/server.js` acts as composition/bootstrap only; new business logic should be extracted to modules.

Size and complexity guardrails:
1. New modules should target <= 300 lines when practical.
2. Any file above 800 lines is considered high-risk and must not receive large new feature blocks.
3. If a file above 1200 lines needs changes, refactor extraction is required in the same slice.

Required implementation markers in tickets/notes:
1. `[BOUNDARY_OK]` confirms layer placement is correct.
2. `[JS_OFFLOAD]` confirms deterministic logic is script-owned.
3. `[CONTRACT_ENFORCED]` confirms contributor output/input contract is validated.

## Cleanup Gate (Must Complete Before New Feature Expansion)

Status: `Done`

Rule:
1. Do not start new feature expansion until the cleanup gate is marked `Done`.

Gate checklist:
1. Extract recently added orchestration helper logic out of overloaded files where required.
2. Move any route/business logic still living in `server/server.js` into `server/routes/**` or `server/brain/**` modules.
3. Add/confirm contracts for new contributor artifacts and worker outputs.
4. Document file ownership boundaries in source-of-truth docs.
5. Add regression checks for boundary violations.

## Cleanup Evaluation and Execution Policy

Purpose:
1. Ensure cleanup is measurable, phased, and resumable.
2. Ensure we can always answer: where we stopped, what was in progress, and what is next.

Required operating rules:
1. Every cleanup slice must have explicit Start, End, and Done criteria.
2. Every slice completion must update checkbox state and ledger entry.
3. Work may not jump ahead if previous required slice criteria are unmet.
4. At pause/stop, update the Stop/Resume Snapshot before ending the session.

## Phase A Re-evaluation — Cleanup Remediation Plan

Status: `Planned`

### Background

Phase A (A1-A5) was marked `Done` but a post-`D` full code audit reveals the cleanup was incomplete.
`server/server.js` is 2396 lines — **double the 1200-line extraction threshold**.
**~1050 lines (44%) are inlined business logic** that violates the composition-only policy.

The four A1-A4 extractions that were done are wired correctly (no duplicate definitions, no dead imports).
The problem is that large clusters of business logic were **never added to the original A-phase scope** and therefore were never extracted.

There is also one confirmed code duplication: `parseJsonBlock` exists as a private copy in `server/services/post-response-memory.js` AND as the canonical version in `server/services/llm-runtime-utils.js`.

---

### Audit Findings Summary

| Cluster | Location | Lines | Target Module |
|---------|----------|-------|---------------|
| `callLLMWithRuntime` + `callSubconsciousReranker` | server.js L1573-L1810 | ~210 | `server/services/llm-interface.js` |
| `normalizeSubconsciousRuntimeConfig`, `normalizeAspectRuntimeConfig`, `mapAspectKey`, `loadAspectRuntimeConfig`, `resolveProfileAspectConfigs` | server.js L1396-L1570 | ~209 | `server/services/config-runtime.js` |
| `createCoreMemory` + `createSemanticKnowledge` | server.js L749-L1006 | ~258 | `server/services/memory-operations.js` |
| `getSubconsciousMemoryContext` + helpers (`extractSubconsciousTopics`, `getSemanticPreview`, `getChatlogContent`, `buildSubconsciousContextBlock`) | server.js L680-L1391 | ~365 | `server/services/memory-retrieval.js` |
| `parseJsonBlock` duplicate | post-response-memory.js L1-17 | ~17 | Remove — import from llm-runtime-utils instead |

**Total extractable lines**: ~1059 lines (~44% of file)
**Expected server.js line count after cleanup**: ~1100-1200 lines (still large but within policy range for composition file)

---

### Re-evaluation Slice Checklist

- [x] A-Re0: Extend `tests/unit/boundary-cleanup-guards.test.js` with guards for all clusters below (write guard tests BEFORE extracting, to lock in expected state after extraction)
- [x] A-Re1: Extract `callLLMWithRuntime` + `callSubconsciousReranker` → `server/services/llm-interface.js`
- [x] A-Re2: Extract config runtime cluster → `server/services/config-runtime.js`
- [x] A-Re3: Extract memory operations (`createCoreMemory`, `createSemanticKnowledge`) → `server/services/memory-operations.js`
- [x] A-Re4: Extract memory retrieval (`getSubconsciousMemoryContext` + helpers) → `server/services/memory-retrieval.js`
- [x] A-Re5: Fix `parseJsonBlock` duplication — remove local copy from `post-response-memory.js`, import from `llm-runtime-utils`
- [x] A-Re6: Run full test suite. Verify no regressions. Confirm server.js drops below 1400 lines.

---

### Slice Definitions

#### A-Re0 — Boundary Guard Tests (write first)

Start criteria: Phase D done (current state).

Work:
1. In `tests/unit/boundary-cleanup-guards.test.js`, add source-scan assertions:
   - `callLLMWithRuntime` function definition must NOT appear in server.js
   - `callSubconsciousReranker` must NOT appear in server.js
   - `loadAspectRuntimeConfig` must NOT appear in server.js
   - `normalizeAspectRuntimeConfig` must NOT appear in server.js
   - `createCoreMemory` must NOT appear in server.js
   - `createSemanticKnowledge` must NOT appear in server.js
   - `getSubconsciousMemoryContext` must NOT appear in server.js
   - `parseJsonBlock` must NOT be defined (only imported) in post-response-memory.js
2. These tests will FAIL until each extraction slice completes — that is expected.

End criteria: Guards written. Tests fail (expected). Existing passing tests unaffected.

#### A-Re1 — LLM Interface Extraction

Start criteria: A-Re0 guards written.

Work:
1. Create `server/services/llm-interface.js`.
2. Move `callLLMWithRuntime(runtime, messages, opts, somaticAwareness)` from server.js (L1573-L1722).
3. Move `callSubconsciousReranker(candidates, userMessage, runtime)` from server.js (L1750-L1810).
4. Export both functions.
5. In server.js, replace definitions with `const { callLLMWithRuntime, callSubconsciousReranker } = require('./services/llm-interface')`.
6. Verify all internal call sites resolve correctly.

End criteria: Definitions removed from server.js. A-Re0 callLLMWithRuntime+callSubconsciousReranker guards pass. Full suite passes.

#### A-Re2 — Config Runtime Extraction

Start criteria: A-Re0 guards written (can parallel with A-Re1).

Work:
1. Create `server/services/config-runtime.js`.
2. Move `normalizeSubconsciousRuntimeConfig`, `normalizeAspectRuntimeConfig`, `mapAspectKey`, `loadAspectRuntimeConfig`, `resolveProfileAspectConfigs` from server.js (L1396-L1570).
3. Export all five.
4. In server.js, replace with require import.
5. All call sites of these functions must be verified (they are used throughout the chat pipeline).

End criteria: Definitions removed from server.js. A-Re0 guards for loadAspectRuntimeConfig + normalizeAspectRuntimeConfig pass. Full suite passes.

#### A-Re3 — Memory Operations Extraction

Start criteria: A-Re0 guards written (can parallel with A-Re1 and A-Re2).

Work:
1. Create `server/services/memory-operations.js`.
2. Move `createCoreMemory(entityId, memStorage, graphStorage, timelineLogger, text, opts)` from server.js (L749-L882).
3. Move `createSemanticKnowledge(entityId, memStorage, graphStorage, sourceMemId, text, language, opts)` from server.js (L884-L1006).
4. These functions receive their dependencies as parameters — no closed-over server.js globals allowed.
5. Export both. In server.js, replace definitions with require import.
6. In `server/services/post-response-memory.js`, update the call sites to use the imported versions.

End criteria: Definitions removed from server.js. A-Re0 guards for createCoreMemory + createSemanticKnowledge pass. Full suite passes.

#### A-Re4 — Memory Retrieval Extraction (largest)

Start criteria: A-Re3 done (memory operations must be separated first).

Work:
1. Create `server/services/memory-retrieval.js`.
2. Move the following from server.js:
   - `extractSubconsciousTopics(text, limit)` (L680-L704)
   - `getSemanticPreview(entityId, memStorage, memId)` (L706-L720)
   - `getChatlogContent(entityId, ltmStorage, ltmId)` (L722-L743)
   - `buildSubconsciousContextBlock(connections, chatlogContext)` (L981-L1040)
   - `getSubconsciousMemoryContext(entityId, memStorage, ..., userMessage)` (L1041-L1395)
3. These helpers are exclusively used by `getSubconsciousMemoryContext` — keep them in the same module file (not re-exported unless needed).
4. Export only `getSubconsciousMemoryContext`.
5. In server.js, replace definition with require import.
6. `getSubconsciousMemoryContext` uses `callSubconsciousReranker` (from A-Re1) and reads graph/index/storage via passed parameters.

End criteria: Definitions removed from server.js. A-Re0 getSubconsciousMemoryContext guard passes. Full suite passes. server.js drops to ~1100-1300 lines.

#### A-Re5 — parseJsonBlock Deduplication

Start criteria: A-Re1 done (llm-runtime-utils is canonical source).

Work:
1. In `server/services/post-response-memory.js`, remove the local `parseJsonBlock` definition (lines 1-17).
2. Add `const { parseJsonBlock } = require('./llm-runtime-utils');` at the top of the file.
3. Verify no behavioural difference (llm-runtime-utils version is strictly more robust).

End criteria: Single definition of parseJsonBlock in codebase. A-Re0 parseJsonBlock guard passes. Full suite passes.

#### A-Re6 — Final Verification

Start criteria: All A-Re0 through A-Re5 done.

Work:
1. Run full test suite — all A-Re0 boundary guards now pass.
2. Verify server.js line count is below 1400. If not, identify remaining extraction candidates and add to backlog.
3. Update WORKLOG ledger, CHANGELOG, and A-phases checklist.

End criteria: Full suite passes. server.js < 1400 lines. All A-Re0 guards green. Docs updated.

---

### Risk Notes

1. **`getSubconsciousMemoryContext` (A-Re4) is server.js' most complex function** — 346 lines with multi-step async logic, LLM calls, graph lookups, and trace writes. Extract it last (after A-Re1 and A-Re3 remove its dependencies) to keep each slice independently testable.
2. **`callLLMWithRuntime` is the hottest call path** — every LLM call in the system goes through it. A-Re1 must not change its signature or behaviour. Move only, no refactoring.
3. **Config runtime (A-Re2) is deeply tangled** — `loadAspectRuntimeConfig` reads from the request body AND global config. It uses `mapAspectKey` and `resolveProfileAspectConfigs` internally. All must move together.
4. **`createCoreMemory` is called from post-response-memory.js** — after A-Re3, update the import in that service too.

---

### Stop/Resume Snapshot (Required)

- Current phase: `UI Navigation Overhaul`
- Current slice: `Nav-2 (chat layout restructure)`
- Last completed slice: `Nav-2 — chat layout restructure (Advanced, Visualizer, sidebar Physical+Logs)`
- In-progress item: `none`
- Next action on resume: `Browser-verify all 6 changes; check Physical widget + Log in chat sidebar render correctly`

### Planned Queue Additions

Status: `Planned`

1. **Media Cost-Safe Test Ladder**
    - Goal: Minimize image/video generation spend during prompt/style experimentation.
    - Scope:
       - Add a documented draft-to-final ladder (low-res image drafts -> shortlist -> single short video render).
       - Define default test settings (smaller resolution, lower fps, shorter duration, fixed seed).
       - Add optional per-session soft budget guidance for creator workflow notes.
    - Outcome target: predictable low-cost iteration before paid final renders.

## A-Cleanup Phased Checklist (Source of Execution Truth)

Phase objective:
1. Decompose overloaded backend composition areas and enforce strict boundaries.

Slice checklist:
- [x] A1: Extract runtime lifecycle concerns from `server/server.js`.
- [x] A2: Extract post-response memory encoding and trace-linking from `server/server.js`.
- [x] A3: Extract response postprocessing from `server/server.js`.
- [x] A4: Extract remaining general-purpose helper blocks from `server/server.js` into dedicated util/service modules.
- [x] A5: Add boundary regression checks and close cleanup gate.

### A4 Definition (Planned)

Start criteria:
1. A1-A3 completed and documented.
2. Cleanup gate remains `In Progress`.

Work in-between:
1. Identify remaining helper candidates in `server/server.js` that are not composition concerns.
2. Extract helpers to module-owned targets.
3. Rewire call sites and preserve behavior.
4. Run full tests.
5. Update ledger + changelog.

End criteria:
1. Target helper cluster extracted.
2. No new boundary violations introduced.
3. Tests pass.
4. Ledger and checkbox updated.

## Version Tracking Policy

Purpose:
1. Keep release/version references consistent across code and docs.

Current working version:
1. `0.5.2-prealpha`

When version changes, update all of the following in the same slice:
1. `package.json` version field
2. `README.md` version banner/snapshot references
3. `CHANGELOG.md` section headers and release notes
4. `WORKLOG.md` current working version line
5. Any architecture/plan docs that explicitly mention version context

Required verification checklist before marking a version bump `Done`:
1. Search confirms no stale previous version strings in active docs
2. `CHANGELOG.md` has a matching release section
3. `README.md` headline/version text matches `package.json`
4. Worklog snapshot updated

Status labels for version work:
1. `Version-Planned`
2. `Version-In-Progress`
3. `Version-Done`

## Phase E — Runtime Quality Hardening

Status: `In Progress`

### Background

First live-system test exposed four bugs in the memory retrieval and UI pipeline:

1. **`doc_*` noise in subconscious context** — Document-ingestion chunk memories (IDs prefixed `doc_`) scored 0.965 for a simple conversational message and appeared in `[SUBCONSCIOUS MEMORY CONTEXT]` as EXPERIENCE memories, flooding the LLM context with irrelevant book content.
2. **`doc_*` entries in chatlog recall** — Document chunks stored in `ltm/` were being scanned as conversation archives and included in `[CONVERSATION RECALL]`, triggering an extra LLM chatlog-reconstruction pass and adding ~2s latency per turn.
3. **Corrupted memory summary leaking into conscious output** — A `user_profile_*` memory had `semantic` = `"User profile: Subconscious turn context for this user message only: [SUBCONSCIOUS MEMORY CONTEXT]"`. When displayed in the context block, the conscious LLM echoed back the system boilerplate string, causing the conscious output to begin with `[SUBCONSCIOUS MEMORY CONTEXT]`.
4. **Stale timing UI labels** — The `Sub` and `Conscious` labels both displayed the same value (the full parallel contributor batch wall-clock). This is a relic of the old serial pipeline — the new parallel architecture needs consolidated labels.

### Slice Checklist

- [x] E1: Filter `doc_*` entries from `contextConnections` (prevents doc chunks appearing as EXPERIENCE memories). Add boilerplate-summary guard to same filter (prevents corrupt user_profile echoing).
- [x] E2: Filter `doc_*` from chatlog recall topic collection and from `ltmFolders` directory scan (prevents doc chunks appearing in `[CONVERSATION RECALL]` and being reconstructed).
- [x] E3: Add boilerplate guard to `post-response-memory.js` — reject memory creation if `semantic` contains system boilerplate markers.
- [x] E4: Fix timing UI labels in `client/js/chat.js` — replace stale Sub/Conscious per-contributor labels with accurate parallel-phase and pipeline-stage labels.

### Implementation Ledger Entry

Status: `Done`

Scope delivered:
1. **E1** — `server/services/memory-retrieval.js`: After computing `contextConnections`, filter out all `doc_*` ID entries and any entry whose `semantic` summary contains system boilerplate markers (`[SUBCONSCIOUS MEMORY CONTEXT]`, `Subconscious turn context for this user message`). Fallback revised to skip corrupt/doc entries.
2. **E2** — Same file: Chatlog recall topic collection now excludes `doc_*` IDs (`!c.id.startsWith('doc_')`). `ltmFolders` directory scan now pre-filters `doc_*` named folders before stat check.
3. **E3** — `server/services/post-response-memory.js`: Before `createCoreMemory`, validate that `episodic.semantic` does not contain `[SUBCONSCIOUS MEMORY CONTEXT]`, `[CONVERSATION RECALL]`, `[INTERNAL-RESUME]`, or similar boilerplate — if so, skip memory creation with a warning.
4. **E4** — `client/js/chat.js`: Timing display now uses `contributors_parallel_ms` / `refinement_ms` / `orchestrator_final_ms` keys with correct labels (`Contributors (∥)`, `Refinement (2B)`, `Final`) instead of the stale `Sub/Dream/Conscious/Merge` labels from the old serial pipeline.

Files changed:
1. `server/services/memory-retrieval.js`
2. `server/services/post-response-memory.js`
3. `client/js/chat.js`

Validation:
1. Full test suite: 318 pass, 0 fail.

Root causes addressed:
- `doc_*` memories score 0.965 in subconscious retrieval because document ingestion stores chunks with high importance (1.0) and decay (1.0). They now never appear in the [SUBCONSCIOUS MEMORY CONTEXT] prompt block.
- `doc_*` folders in `ltm/` (where document ingestion stores chunks) are excluded from chatlog recall scan — eliminating the spurious V4-chatlog-reconstruction LLM call that added ~2s latency per turn.
- Corrupted `user_profile_*` memory (whose semantic summary accidentally captured the system context block) is now filtered from display AND future creation of such entries is blocked.
- Timing UI was showing `Sub: 11886ms · Conscious: 11886ms` (identical values) because both used the same `contributors_parallel_ms`. Labels now reflect the actual pipeline stages.

### Stop/Resume Snapshot

- Current phase: Documentation Truth Sync
- Current slice: Docs-Truth-Review-1 (complete)
- Last completed slice: Docs-Truth-Review-1 — full code-vs-doc review, source-of-truth docs refreshed, REM-Architecture-v0.6.0.html aligned to runtime
- In-progress item: none
- Next action on resume: Continue WebGUI artifact cleanup and queue any remaining doc drift into next docs slice

---

## Current Phase Snapshot

1. Cleanup gate (boundary + bloat clampdown): `Done`
2. Architecture correction live-loop refactor: `Done`
3. Dream split hardening (live intuition vs maintenance pipeline): `Done`
4. Policy and safety hardening (O2 escalation controls): `Done`
5. Worker subsystem pilot (main-role binding): `Done`
6. Phase A re-evaluation and remediation: `Done`
7. Runtime quality hardening: `Done`
8. Pipeline reflow — Dream→Conscious, Orchestrator→Reviewer: `Done` (plan: `Documents/current/PLAN-PIPELINE-REFLOW-v1.md`)

## Implementation Ledger

### 2026-03-13 - Full Documentation Truth Sync + Architecture Deck Refresh (Docs-Truth-Review-1)

Status: `Done`

Scope delivered:
1. **Full code-vs-doc review** over core runtime modules (`orchestrator`, contracts, services, routes) against source-of-truth docs.
2. **Source-of-truth docs updated**:
   - `Documents/current/ARCHITECTURE-OVERVIEW.md`
   - `Documents/current/MEMORY-SYSTEM.md`
   - `Documents/current/CONTRACTS-AND-SCHEMAS.md`
   - `Documents/current/OPEN-ITEMS-AUDIT.md`
   - `README.md`
3. **Architecture deck updated** (`Documents/REM-Architecture-v0.6.0.html`):
   - removed stale preAlpha wording
   - corrected orchestrator flow to `1A + 1D → 1C → Final (2B inlined)`
   - corrected route/module count and key route examples
   - corrected memory schema wording and document-ingest retrieval behavior notes
4. **Internal source comments updated** (`server/brain/core/orchestrator.js`) to match real pipeline execution order.

Validation:
1. Drift verification via targeted search and source reads completed.
2. No runtime behavior changes introduced; documentation and comments only.

[BOUNDARY_OK] — Documentation/comment synchronization only; no cross-layer logic migration required.

### 2026-03-13 - Version 0.6.0 Release (Version-0.6.0)

Status: `Done`

Scope delivered:
1. **Version bump across all files** — `package.json`, all `client/js/*.js` headers, `client/css/*.css` comment headers, `client/index.html` UI badge, `server/server.js` startup banner, `server/brain/generation/aspect-prompts.js` and `core-life-generator.js` entity self-awareness strings all updated from `v0.4.0-pre` / `v0.5.2-prealpha` to `v0.6.0`.
2. **Chat message font bug fixed** (`client/js/chat.js`, `client/js/app.js`, `client/js/sleep.js`) — content span now given `chat-content` class; all `querySelector('span:last-child')` sites updated to `.chat-content`. Prevents assistant messages after first response from rendering in the JetBrains Mono model-tag pill font.
3. **CHANGELOG promoted** — `[Unreleased]` section promoted to `[0.6.0] - 2026-03-13`; fresh `[Unreleased]` section added above.
4. **README updated** — version badge, Release Snapshot heading and bullet list updated to reflect 0.6.0 scope; Known Limitations cleaned of "prealpha research system" language.
5. **Pushed to main.**

Files changed:
1. `package.json`
2. `client/index.html`
3. `client/js/app.js`, `chat.js`, `pipeline.js`, `auth.js`, `memory-ui.js`, `sleep.js`, `skills-ui.js`
4. `client/css/ui.css`, `ui-v2.css`, `theme.css`, `icons.css`
5. `server/server.js`
6. `server/brain/generation/aspect-prompts.js`, `core-life-generator.js`
7. `CHANGELOG.md`
8. `README.md`
9. `WORKLOG.md`

[BOUNDARY_OK] — Version bump and docs only; no business logic modified.

### 2026-03-13 - Skills Token-Gating + Trigger System (Skills-Gate-1)

Status: `Done`

Scope delivered:
1. **Skills/tools docs gated behind explicit commands** (`server/brain/generation/aspect-prompts.js`): `getConsciousPrompt()` extended with a 4th `options = {}` parameter. Skills, workspace-tools, and task-planning sections are omitted from the prompt by default (zero tokens). They are only included when `options.activeSkillsSection` or `options.includeWorkspaceTools` is truthy.
2. **Command detection in Orchestrator** (`server/brain/core/orchestrator.js`): `runConscious()` now parses `/skill <trigger>` (captures first word after `/skill`, command part case-insensitive) and `/tool` from the user message. Both flags are passed to `getConsciousPrompt` as options. Added `this.getSkillContext` callback slot to constructor.
3. **Exact case-sensitive trigger dispatch** (`server/brain/skills/skill-manager.js`): `buildSkillsPromptFor(trigger)` new method — exact string comparison on `skill.trigger || skill.name`, no fuzzy/partial/lowercase fallback. Returns XML block or null.
4. **Trigger field on skills** (`server/brain/skills/skill-manager.js`): `loadAll()` reads `trigger` from SKILL.md frontmatter; `list()` exposes it; `createSkill()` accepts `options.trigger` and writes it to frontmatter. Recommended: no spaces, use hyphens.
5. **Server wired** (`server/server.js`): `getSkillContext: (skillName) => skillManager ? skillManager.buildSkillsPromptFor(skillName) : null` passed into Orchestrator constructor options.
6. **Skills routes passthrough** (`server/routes/skills-routes.js`): `trigger` destructured from POST body and passed to `sm.createSkill()`.
7. **WebGUI create modal** (`client/index.html`): Trigger input field added (`id="newSkillTrigger"`) with explanation and note about exact/case-sensitive matching. How-to guide completely rewritten to explain `/skill <trigger>` and `/tool` commands.
8. **Skill detail trigger display** (`client/index.html`): `<code id="skillDetailTrigger">` added to skill detail panel status badges row showing the `/skill <trigger>` invoke command.
9. **Skills UI wired** (`client/js/skills-ui.js`): Skill cards show a monospace `/skill <trigger>` badge. Detail panel populates `skillDetailTrigger`. `executeCreateSkill()` reads and POSTs trigger field; clears it on success.
10. **README skills section** (`README.md`): Fully rewritten — explains `/skill <trigger>` invocation, exact/case-sensitive warning, `/tool` command, built-in skills table with trigger column, creating a skill with trigger field.

Token savings:
- Default turn: ~750 tokens removed per turn (skills + workspace tools + task-planning sections no longer injected unless commanded).
- `/skill <trigger>` turn: only the matching skill XML block injected (~50-300 tokens depending on skill size).
- `/tool` turn: workspace tools docs only (~500 tokens), strictly on demand.

Files changed:
1. `server/brain/generation/aspect-prompts.js`
2. `server/brain/core/orchestrator.js`
3. `server/brain/skills/skill-manager.js`
4. `server/routes/skills-routes.js`
5. `server/server.js`
6. `client/index.html`
7. `client/js/skills-ui.js`
8. `README.md`

Validation:
1. Full test suite: 318 pass, 0 fail.

[BOUNDARY_OK] — Backend changes in `server/brain/**`, `server/routes/**`, `server/server.js` (composition only). Client changes in `client/**`. No layer violations.

### 2026-03-13 - Pipeline Reflow (Pipeline-Reflow-F1/F3)

Status: `Done`

Scope delivered:
1. **Promise chain rewired** (`server/brain/core/orchestrator.js`): `consciousPromise` now does `Promise.all([subconsciousPromise, dreamPromise]).then(...)` — Conscious starts only after both 1A and 1D complete.
2. **Dream output piped into Conscious** (`server/brain/core/orchestrator.js`): `runConscious()` receives `options.dreamText` from the resolved 1D output; `conciseDreamHint` is now real 1D content (not a static instruction string). `null` is passed when unavailable, which the prompt template handles by suppressing the dream section.
3. **Orchestrator merge prompt restructured** (`server/brain/core/orchestrator.js`): Orchestrator now receives Conscious draft as primary input + full copy of what Conscious had (1A context, 1D output, turn signals). REVIEW DIRECTIVE replaces SYNTHESIS DIRECTIVE — Orchestrator shapes HOW it is said, not WHAT.
4. **Orchestrator system prompt rewritten** (`server/brain/generation/aspect-prompts.js`): `getOrchestratorPrompt()` defines reviewer/voicer role explicitly. Removed "synthesize the inner processing" language; added "The Conscious reasoning is the answer — voice it authentically, do not re-derive it."
5. **Dream-split guard test updated** (`tests/unit/dream-split-guards.test.js`): Updated guard regex to match new code structure (`runDreamIntuition` upstream of `Promise.all`). Guard intent preserved — verifies `runDreamIntuition` is the live-loop contributor.
6. **Pipeline docs updated** (`Documents/current/PIPELINE-AND-ORCHESTRATION.md`): Overview, diagram, and contributor phase descriptions updated to match new flow.
7. **BugTest entry added** (`Documents/current/BUGTEST-NOTES.md`): BT-2026-03-13-04 queued for manual smoke testing.

Files changed:
1. `server/brain/core/orchestrator.js`
2. `server/brain/generation/aspect-prompts.js`
3. `tests/unit/dream-split-guards.test.js`
4. `Documents/current/PIPELINE-AND-ORCHESTRATION.md`
5. `Documents/current/BUGTEST-NOTES.md`
6. `Documents/current/CHANGELOG.md`

Validation:
1. Full test suite: 318 pass, 0 fail.

[BOUNDARY_OK] — All changes in `server/brain/**` and `tests/**`; no route/client boundary violations.

### 2026-03-13 - Pipeline Diagram Flow Sync (Docs-Flow-Sync-1)

Status: `Done`

Scope delivered:
1. **Pipeline docs synced** (`Documents/current/PIPELINE-AND-ORCHESTRATION.md`): updated stage diagram and text to match current orchestrator flow (`1A + 1D` parallel, `1C` after `1A` with reused memoryContext, final synthesis with inlined refinement).
2. **README diagram synced** (`README.md`): per-message pipeline block updated to same runtime flow ordering.

Files changed:
1. `Documents/current/PIPELINE-AND-ORCHESTRATION.md`
2. `README.md`

Validation:
1. Manual code-vs-doc check against `server/brain/core/orchestrator.js` confirms ordering and stage descriptions are now aligned.

[BOUNDARY_OK] — Documentation-only change; no runtime behavior modified.

### 2026-03-13 - Conscious Active Context Reuse (Con-ActiveCtx-2)

Status: `Done`

Scope delivered:
1. **Removed duplicate retrieval** (`server/brain/core/orchestrator.js`): conscious no longer calls `getMemoryContext(userMessage)` directly.
2. **Reused same-turn subconscious context** (`server/brain/core/orchestrator.js`): orchestrator now passes `subconsciousRaw.memoryContext` into `runConscious(...)` as `options.memoryContext`.
3. **Active context feed preserved** (`server/brain/core/orchestrator.js`): conscious still receives bounded active recall hints (top memories/chatlogs), now sourced from reused subconscious context.

Files changed:
1. `server/brain/core/orchestrator.js`

Validation:
1. Diagnostics check: no errors in `server/brain/core/orchestrator.js`.

[BOUNDARY_OK] — Backend orchestration/prompt wiring in `server/**`; no route/client boundary violations.

### 2026-03-13 - Conscious Active Recall Context (Con-ActiveCtx-1)

Status: `Done`

Scope delivered:
1. **Conscious active recall feed added** (`server/brain/core/orchestrator.js`): `runConscious()` now fetches current recall context via `getMemoryContext(userMessage)` and builds a bounded `[ACTIVE RECALL CONTEXT]` section.
2. **Memory and chatlog context piped into conscious briefing** (`server/brain/core/orchestrator.js`): concise top recalled memory lines (up to 6) and related chatlog snippets (up to 3) are appended to the conscious-side briefing input.
3. **Existing relationship feed preserved** (`server/brain/core/orchestrator.js`): active relationship signal remains in the same conscious briefing payload.

Files changed:
1. `server/brain/core/orchestrator.js`

Validation:
1. Diagnostics check: no errors in `server/brain/core/orchestrator.js`.

[BOUNDARY_OK] — Backend orchestration/prompt wiring in `server/**`; no route/client boundary violations.

### 2026-03-13 - BugTest Loop Introduction (BugTest-Loop-1)

Status: `Done`

Scope delivered:
1. **New active BugTest notes doc** (`Documents/current/BUGTEST-NOTES.md`): created a live queue, status model, checklist template, and initial queued items for `Rel-Flow-1` and `Mem-Recall-Tuning-1`.
2. **WORKLOG policy update** (`WORKLOG.md`): added `BugTest Notes Loop` section defining when bug testing is required vs optional and making queue updates part of slice workflow.

Files changed:
1. `Documents/current/BUGTEST-NOTES.md`
2. `WORKLOG.md`

Validation:
1. BugTest notes file exists and includes active queue entries for current high-impact slices.

[BOUNDARY_OK] — Process/documentation-only change; no runtime behavior altered.

### 2026-03-13 - Memory Recall Cap Tuning (Mem-Recall-Tuning-1)

Status: `Done`

Scope delivered:
1. **Pull max raised** (`server/services/memory-retrieval.js`): `getSubconsciousMemoryContext(userMessage, limit = 36)` (was 24).
2. **Prompt context cap raised** (`server/services/memory-retrieval.js`): `contextConnections` cap increased to 12 (was 8) before context block build.
3. **Chatlog recall cap raised** (`server/services/memory-retrieval.js`): top relevant `ltm` chatlogs included increased to 3 (was 1).

Files changed:
1. `server/services/memory-retrieval.js`

Validation:
1. Diagnostics check: no errors in `server/services/memory-retrieval.js`.

[BOUNDARY_OK] — Backend retrieval tuning confined to `server/**`; no route/client boundary violations.

### 2026-03-13 - Conscious Relationship Context Plumbing (Rel-Flow-1)

Status: `Done`

Scope delivered:
1. **Conscious input now includes relationship state** (`server/brain/core/orchestrator.js`): `orchestrate()` now passes `entityId` into `runConscious(...)` so conscious has deterministic access to active entity relationship data.
2. **Compact relationship signal injected into conscious briefing** (`server/brain/core/orchestrator.js`): `runConscious()` now loads active-user relationship state via `relationship-service` and appends a bounded `[RELATIONSHIP SIGNAL]` block (feeling, trust, rapport, roles, top beliefs, summary) into the concise briefing used by `getConsciousPrompt(...)`.
3. **No pipeline order change**: Subconscious, Conscious, and Dream still run in parallel; this slice only closes the missing context path into conscious composition.

Files changed:
1. `server/brain/core/orchestrator.js`

Validation:
1. Diagnostics check: no errors in `server/brain/core/orchestrator.js`.

[BOUNDARY_OK] — Backend orchestration change in `server/**`; no route placement or client boundary violations.

### 2026-03-12 - Chat Layout Restructure (Nav-2)

Status: `Done`

Scope delivered:
1. **Advanced as regular nav item** (`client/index.html`): Replaced the collapsible `nav-group` (toggle + arrow + nested item) with a simple `nav-item` button. Uses a gear icon and "Sleep & Tokens" label. Opens as a full page tab like everything else — no dropdown.
2. **Neural replaced with Visualizer** (`client/index.html`): Changed the Neural nav-item to "Visualizer" with `data-tab="visualizer"`. Replaced the old `tab-neural` Three.js container with a new `tab-visualizer` that embeds `/visualizer.html` in an iframe. No more popup window.
3. **openVisualizer redirect** (`client/js/chat.js`): Changed `openVisualizer()` from `window.open` popup to `switchMainTab('visualizer')`.
4. **Workspace + Activity moved to nav sidebar** (`client/index.html`): Added Workspace and Entity Activity as top-level nav-items. Created corresponding `tab-workspace` and `tab-activity` tab-content panels with the content that was previously in the chat sidebar.
5. **Physical nav removed from sidebar**: Physical tab no longer in nav — its compact widget is now always visible in chat right panel.
6. **Chat right panel: Physical + Logs** (`client/index.html`): Replaced the old chat-sidebar (Workspace/Activity/Neural View) with: (a) Physical body compact widget — always visible, shows overall state + per-metric rows, (b) Pipeline Log — collapsed by default, uses `sidebar-section` pattern.
7. **Pipeline log relocated** (`client/index.html`, `client/js/app.js`, `client/js/chat.js`): Moved from `chat-main` (`.lp` block) to `chat-sidebar` as a collapsible sidebar section. Updated `lg()`, `toggleLog()`, `autoOpenLog()`, `addSystemToLog()`, and `resetAll()` to target `sidebarLogContent` instead of `lgB`.
8. **Chat Physical widget** (`client/js/app.js`): Added `updateChatPhysical()` and `initChatPhysical()` functions. Fetches somatic state on load, listens for SSE `SOMATIC_UPDATE` events. Shows overall status + per-metric compact rows.
9. **All dropdowns start closed**: Log starts with `collapsed` class. Physical is always visible (no toggle needed). No nav-groups remain.

Files changed:
1. `client/index.html` (nav sidebar, chat layout, tab panels)
2. `client/css/ui-v2.css` (no changes needed — existing styles support new structure)
3. `client/js/app.js` (log functions, physical widget, init)
4. `client/js/chat.js` (openVisualizer, lgB→sidebarLogContent)

Validation:
1. Full test suite: 318 pass, 0 fail.

[BOUNDARY_OK] — Client-only change; no server logic modified.

### 2026-03-12 - Collapsible Nav Sidebar (Nav-1)

Status: `Done`

Scope delivered:
1. **Nav sidebar** (`client/index.html`): Replaced the horizontal tab bar (9 tabs + Advanced dropdown) and the old model-sidebar with a single collapsible vertical sidebar. Contains: entity/profile zone at top, main nav items (Chat, Skills, Settings, Neural, Physical, Dreams, Life Diary, Dream Diary, Documents), and an expandable Advanced group (Sleep & Tokens).
2. **Advanced panel** (`client/index.html`): Converted the `advancedMenu` floating dropdown into a regular `tab-content` panel (`tab-advanced`), so it shows in the main content area when clicked from the sidebar.
3. **CSS** (`client/css/ui-v2.css`): Added `.nav-sidebar` styles with collapsed/expanded states (220px → 52px). Added `body.nav-collapsed` rules for `.app` and `.hdr` padding transitions. Updated `.hdr` to offset for sidebar. Hidden old `.tab-navigation` and `.model-sidebar` via `display: none !important`. Updated responsive breakpoint to auto-collapse.
4. **JS** (`client/js/app.js`): Added `toggleNavSidebar()`, `toggleNavGroup()`, `syncNavSidebarEntities()`, `syncNavSidebarProfiles()`. Updated `switchMainTab` to clear `.nav-item` active states. Updated `toggleAdvancedMenu` to redirect to `switchMainTab('advanced')`.

Files changed:
1. `client/index.html` (nav sidebar + advanced panel conversion)
2. `client/css/ui-v2.css` (sidebar styles, .app/.hdr offsets, responsive)
3. `client/js/app.js` (sidebar toggle, tab switching, entity/profile sync)

Validation:
1. Full test suite: 318 pass, 0 fail.
2. HTML div balance verified: 487 opens, 487 closes.

[BOUNDARY_OK] — Client-only change; no server logic modified.

### 2026-03-12 - Settings UI Simplification (Settings-1)

Status: `Done`

Scope delivered:
1. **HTML overhaul** (`client/index.html`): Replaced the entire LLM Provider Section (4 provider tabs × 2 sub-tabs each + 5 preset tabs + 5 connect buttons + inheritance logic) with a simple two-panel UI. OpenRouter: enter API key → pick/paste model. Ollama: enter address → fetch models → pick from dropdown. Preset buttons (Best/Fast/Cheap/Balanced) auto-fill the model. Advanced per-aspect overrides collapsed in a `<details>` toggle.
2. **JS functions** (`client/js/app.js`): Added `simplePickProvider`, `simpleApplyPreset`, `simpleFetchOllamaModels`, `simpleSaveConfig`, `simpleShowStatus`, `initSimpleProviderUI`. Config hydration reads from `savedConfig` on page load. Saves all 4 aspects via existing `/api/entity-config` endpoint (no server changes needed).

Root cause of change:
- Old per-aspect settings UI was confusing and produced invalid configs (e.g. type:"ollama" with openrouter endpoint), leading to 401 auth errors.

Files changed:
1. `client/index.html` (LLM Provider Section replaced ~lines 886-970)
2. `client/js/app.js` (6 new functions added after `initSettingsModelSuggestions`)

Validation:
1. Full test suite: 318 pass, 0 fail.
2. Server API compatibility: `simpleSaveConfig` uses existing `/api/entity-config` + `normalizeIncomingRuntimeConfig` — no server changes required.

[BOUNDARY_OK] — Client-only change; no server logic modified.

### 2026-03-12 - Namespace Deduplication: Root memories/ Isolation

Status: `Done`

Scope delivered:
1. **Timeline logger resolver** (`server.js`): Stopped returning `rootDir: MEM_DIR` when no entity is active or when entity path resolution fails. System events now write to `memories/logs/timeline-system.ndjson` (clearly namespaced), and entity events always target `entities/entity_<id>/memories/logs/timeline.ndjson`.
2. **Memory routes** (`server/routes/memory-routes.js`): Removed all `ctx.MEM_DIR` fallback paths for entity-type data. Write operations (`postMemory`, `postSessionMeta`, `postPersona`) now return HTTP 409 when no entity is active instead of writing orphaned data to root `memories/`. Read operations (`getStatus`, `getMemories`, `getPersona`, `getMemoryHeal`, `getMemoryStats`) return empty/defaults when no entity is active. Only `getSystemPrompt` retains a root `memories/system-prompt.txt` fallback as an explicit default template.
3. **MEM_DIR documentation** (`server.js`): Updated comments to clarify root `memories/` is for system-level defaults only (default prompt template, system timeline logs). Entity-specific data lives exclusively in `entities/entity_<id>/memories/`.

Root cause:
- `MEM_DIR` (root `memories/`) was serving as a fallback for all entity-level operations, creating a "ghost entity" namespace that duplicated the structure inside `entities/entity_*/memories/`. This caused confusion with files like `timeline.ndjson`, `persona.json`, `mood.txt`, etc. appearing in both locations.

Files changed:
1. `server/server.js` (entity resolver, MEM_DIR comments)
2. `server/routes/memory-routes.js` (9 MEM_DIR fallback removal edits)

Validation:
1. Full test suite: 318 pass, 0 fail.

[BOUNDARY_OK] — entity data stays in `entities/`, system defaults stay in root `memories/`.

### 2026-03-11 - Server Config Ghost Dir Removal

Status: `Done`

Scope delivered:
1. Identified two `Config/` directories in the project: `<root>/Config/` (canonical, used by `server.js`) and `<root>/server/Config/` (orphan, never referenced, empty).
2. Removed `server/Config/` entirely.

Active config path (unchanged): `<root>/Config/ma-config.json`
Legacy migration path (unchanged): `<root>/ma-config.json` → auto-copied to `Config/` on first load.

Files changed:
1. `server/Config/` (deleted — empty directory, dead code path)

Validation:
1. Server starts without errors. No references to `server/Config/` exist in any source file.

### 2026-03-11 - Startup ReferenceError Fix (getSemanticPreview / getChatlogContent)

Status: `Done`

Scope delivered:
1. `server.js` `ctx` object referenced `getSemanticPreview` and `getChatlogContent` as bare names after Phase A Re-evaluation extracted them into `server/services/memory-retrieval.js`.
2. Added both names to the `createMemoryRetrieval` destructure so they are bound before the `ctx` object is constructed.

Files changed:
1. `server/server.js` — `createMemoryRetrieval` destructure extended from 2 to 4 names.

Validation:
1. Server starts without `ReferenceError`. All prior tests remain 318 pass, 0 fail.

### 2026-03-11 - Live-Loop Refactor Hardening

Status: `Done`

Scope delivered:
1. Fixed budget guard wiring: cumulative contributor token usage (subconscious + conscious + dream + refinement) is now passed to `runOrchestrator` as `tokenUsageSoFar`, enabling `enforceBudgetGuard` to correctly block O2 escalation when the pipeline has already consumed its budget.
2. Added H2 artifact shape tests to `tests/integration/orchestrator.test.js`: all parallel contributor artifacts (`oneA`, `oneC`, `oneD`, `twoB`), `turnSignals`, `escalation` key structure, `workerDiagnostics` key structure, `timing` keys, `tokenUsage` keys.
3. Added H3 contributor failure isolation tests: `orchestrate()` completes without throwing and returns valid fallback strings for all 4 artifacts when `callLLM` always throws.
4. Added H4 budget guard integration tests: direct `runOrchestrator` call with over-budget `tokenUsageSoFar` sets `_escalation.budgetBlocked = true` and reason contains `'budget-cap'`; under-budget usage sets `budgetBlocked = false`.

Files changed:
1. `server/brain/core/orchestrator.js` (budget-guard wiring fix — 10 lines added to `orchestrate()`)
2. `tests/integration/orchestrator.test.js` (14 new tests added: H2 ×6, H3 ×2, H4 ×2, plus existing 14 = 28 total)

Validation:
1. Full test suite: 318 pass, 0 fail.

### 2026-03-11 - Phase D (Worker Subsystem Pilot)

Status: `Done`

Scope delivered:
1. Worker output contract module (`server/contracts/worker-output-contract.js`) with `validateWorkerOutput` and `normalizeWorkerOutput`. Required fields: `summary`, `signals`, `confidence`. Optional: `memoryRefs`, `nextHints`.
2. Worker registry (`server/brain/core/worker-registry.js`) — in-memory Map with `registerWorker`, `unregisterWorker`, `getWorker`, `listWorkers`, `clearRegistry`.
3. Worker dispatcher (`server/brain/core/worker-dispatcher.js`) — `invokeWorker` wraps worker LLM call in latency guard, validates contract, emits D5 diagnostics bus events (`worker_invoked`, `worker_success`, `worker_fallback`), returns null on any failure.
4. Orchestrator wiring: `workerRegistry` constructor option added; `runSubconscious`, `runConscious`, `runDreamIntuition` each check registry first and early-return worker output (tagged `_source: 'worker'`) if available.
5. `innerDialog.artifacts.workerDiagnostics` added: per-contributor `{ used, entityId }` object present on every orchestration call.
6. 46 regression tests in `tests/unit/worker-subsystem.test.js` covering contract validation, normalisation, registry CRUD, dispatcher valid/fallback/timeout/bus-event paths, and integration guards.

Files changed:
1. `server/contracts/worker-output-contract.js` (new)
2. `server/brain/core/worker-registry.js` (new)
3. `server/brain/core/worker-dispatcher.js` (new)
4. `server/brain/core/orchestrator.js` (updated — require, constructor, 3 contributor method injections, innerDialog.artifacts)
5. `tests/unit/worker-subsystem.test.js` (new)

Validation:
1. Full test suite passed (`300 pass, 0 fail`).

### 2026-03-11 - Phase C (Escalation Guardrails)

Status: `Done`

Scope delivered:
1. `shouldEscalateO2` now returns `{ escalate: boolean, reason: string }` instead of a bare boolean. Reason vocabulary: `'high-tension'`, `'error-constraint-combo'`, `'planning-implementation-combo'`, `'user-requested-depth'`, `'none'`.
2. `chooseO2Runtime` updated to consume `decision.escalate` from the new shape.
3. `enforceBudgetGuard` now returns `{ ok: true, reason: null }` (previously omitted `reason` field on success).
4. New `enforceLatencyGuard(callFn, maxMs)` function in `orchestration-policy.js`: wraps any async call in a timeout race; rejects with `{ timedOut: true, maxMs }` on ceiling hit; defaults to 35 000 ms.
5. `runOrchestrator` in `orchestrator.js` wired with all three guardrails:
   - **C2 budget guard**: evaluates `tokenUsageSoFar` before choosing model; over-budget forces reason `'budget-cap-<…>'` and blocks escalation.
   - **C3 latency guard**: O2 synthesis call wrapped in `enforceLatencyGuard`; on timeout, falls back to `defaultRuntime` then to conscious output.
   - **C4 telemetry**: returns `_escalation: { reason, modelUsed, timedOut, budgetBlocked, latencyMs, tokenCost }` from `runOrchestrator`.
6. `innerDialog.artifacts.escalation` populated from `finalResponse._escalation` so all call sites receive the telemetry.
7. 31 regression tests in `tests/unit/escalation-guardrails.test.js`: reason coverage for all triggers, budget cap paths, latency timeout path, fallback error pass-through, integration call-site guards.

Files changed:
1. `server/brain/core/orchestration-policy.js` (updated — `shouldEscalateO2`, `chooseO2Runtime`, `enforceBudgetGuard`, `enforceLatencyGuard` new, exports updated)
2. `server/brain/core/orchestrator.js` (updated — imports, `runOrchestrator` full body, `innerDialog.artifacts.escalation`)
3. `tests/unit/escalation-guardrails.test.js` (new)

Validation:
1. Full test suite passed (`254 pass, 0 fail`).

### 2026-03-11 - Phase B (Dream Split Hardening)

Status: `Done`

Scope delivered:
1. Guard tests confirming live orchestrator loop uses `runDreamIntuition()` only and adapter has no memory-write call sites.
2. Created `dream-maintenance-selector.js` with deterministic candidate scoring across emotion, learn tags, error markers, staleness, and graph degree dimensions.
3. Created `dream-link-writer.js` with dream-to-source link persistence and cognitive bus event emission.
4. Wired selector into `phase-dreams.js` replacing inline `getMostImportant` heuristic.
5. Wired link writer into `phase-dreams.js` after each dream commit.
6. 34 unit tests covering selector scoring, selection filtering, bucketing, and link writer paths.

Files changed:
1. `tests/unit/dream-split-guards.test.js` (new)
2. `tests/unit/dream-maintenance.test.js` (new)
3. `server/brain/cognition/dream-maintenance-selector.js` (new)
4. `server/brain/knowledge/dream-link-writer.js` (new)
5. `server/brain/cognition/phases/phase-dreams.js` (updated — selector + link writer wired)

Validation:
1. Full test suite passed (`224 pass, 0 fail`).

### 2026-03-11 - Slice A5

Status: `Done`

Scope delivered:
1. Added boundary regression tests enforcing service delegation patterns in `server/server.js`.
2. Verified cleanup boundary guardrails with test coverage.

Files changed:
1. `tests/unit/boundary-cleanup-guards.test.js` (new)

Validation:
1. Full tests passed (`190 pass, 0 fail`).

Cleanup gate impact:
1. Boundary regression checks now exist and pass.
2. Cleanup gate closure criteria satisfied.

### 2026-03-11 - Slice A4

Status: `Done`

Scope delivered:
1. Extracted remaining shared LLM runtime helper cluster from `server/server.js` into dedicated service module.
2. Rewired server runtime path to consume service-owned helpers.

Files changed:
1. `server/services/llm-runtime-utils.js` (new)
2. `server/server.js` (updated)

Validation:
1. Full tests passed (`190 pass, 0 fail`).

Cleanup gate impact:
1. Reduced helper bloat in `server/server.js`.
2. Improved composition-only server ownership boundaries.

### 2026-03-11 - Slice A3

Status: `Done`

Scope delivered:
1. Extracted natural-chat response postprocessing out of `server/server.js`.
2. Moved humanize/quick-clean/sentence-cap/chunking behavior into dedicated service.

Files changed:
1. `server/services/response-postprocess.js` (new)
2. `server/server.js` (updated wiring + removed inline natural-chat postprocessing block)

Validation:
1. Full tests passed (`186 pass, 0 fail`).

Cleanup gate impact:
1. Reduced backend composition-layer bloat further.
2. Strengthened boundary between orchestration flow and response postprocessing concerns.

### 2026-03-11 - Slice A2

Status: `Done`

Scope delivered:
1. Extracted post-response memory encoding and trace-linking pipeline out of `server/server.js`.
2. Moved dual memory encoding, fallback repair, semantic memory creation, and trace-link updates into dedicated service.

Files changed:
1. `server/services/post-response-memory.js` (new)
2. `server/server.js` (updated wiring + removed inlined memory encoding block)

Validation:
1. Full tests passed (`186 pass, 0 fail`).

Cleanup gate impact:
1. Further reduced backend business logic bloat in server composition layer.
2. Improved boundary alignment for cognition-memory post-processing.

### 2026-03-11 - Slice A1

Status: `Done`

Scope delivered:
1. Extracted runtime lifecycle concerns out of `server/server.js` into a dedicated service module.
2. Moved Telegram startup flow and graceful shutdown flow behind service boundaries.
3. Reduced direct lifecycle/business bloat in server composition layer.

Files changed:
1. `server/services/runtime-lifecycle.js` (new)
2. `server/server.js` (updated wiring + removed inlined lifecycle implementations)

Validation:
1. Full tests passed (`186 pass, 0 fail`).

Cleanup gate impact:
1. Route/composition boundary direction improved (`server/server.js` as composition shell).
2. Additional extraction passes still required for full gate closure.

### 2026-03-11 - Slice A

Status: `Done`

Scope delivered:
1. Added turn-signal JS extraction module.
2. Added contributor output validation contracts.
3. Added orchestration policy router for stage-based model escalation decisions.
4. Added live dream-intuition adapter.
5. Refactored orchestrator live loop to parallel contributors with artifacts `1A`, `1C`, `1D`, `2B`.

Files changed:
1. `server/brain/utils/turn-signals.js`
2. `server/contracts/contributor-contracts.js`
3. `server/brain/core/orchestration-policy.js`
4. `server/brain/cognition/dream-intuition-adapter.js`
5. `server/brain/core/orchestrator.js`

Validation:
1. Full tests passed (`186 pass, 0 fail`).

## Next Planned Slices

### Slice A1 - Boundary Cleanup and Decomposition

Status: `In Progress`

1. Enforce route/business logic split (`server/server.js` -> modular targets). (partial: runtime lifecycle extracted)
   - additional progress: post-response memory encoding extracted to service module
2. Enforce frontend/backend boundary checks for new additions.
3. Add missing contracts and validators where contributor outputs are consumed.
4. Keep large-file touch minimal unless extraction happens in the same slice.

### Slice A4 - Remaining Helper Extraction

Status: `Planned`

1. Extract remaining non-composition helper blocks from `server/server.js`.
2. Keep `server/server.js` focused on wiring/composition/dispatch.
3. Validate no behavior regressions with full tests.
4. Update checkboxes and ledger immediately upon completion.

## Remaining Cleanup Plan (Execution View)

This is the active plan for everything left before cleanup gate closure.

### A4 - Remaining Helper Extraction

Status: `Planned`

Scope:
1. Extract one remaining non-composition helper cluster from `server/server.js` into service/util module(s).
2. Keep behavior parity and wiring-only responsibility in `server/server.js`.

Deliverables:
1. New module(s) under `server/services/**` or `server/brain/**` (as ownership requires).
2. Updated `server/server.js` call sites.
3. Ledger + changelog updates.
4. Test pass confirmation.

Exit criteria:
1. Target cluster fully extracted.
2. Full tests pass.
3. A4 checkbox marked `[x]`.
4. Stop/Resume Snapshot updated.

### A5 - Boundary Regression and Gate Closure

Status: `Planned`

Scope:
1. Add boundary regression checks for the cleanup policy.
2. Verify contributor contract enforcement points.
3. Confirm no active cleanup checklist blockers remain.

Deliverables:
1. Regression check coverage for boundary violations.
2. Updated cleanup gate checklist with objective pass/fail notes.
3. Final `Cleanup gate` status moved to `Done` (if criteria met).

Exit criteria:
1. Gate checklist items all satisfied.
2. A5 checkbox marked `[x]`.
3. Current Phase Snapshot updated to show cleanup gate closure.

### Resume Pointer

1. Last completed slice: `A3`
2. Current next slice: `A4`
3. Immediate next action: `identify A4 helper cluster target in server/server.js and start extraction`

### Slice B - Dream Split Hardening

Status: `Done`

Context (code audit 2026-03-11):
1. Live loop already calls `runDreamIntuition()` from `dream-intuition-adapter.js`. Correct. But `runDream()` (heavier, legacy) is also defined on Orchestrator and could be accidentally re-wired.
2. `dream-maintenance-selector.js` does not exist. Candidate selection is an inline heuristic inside `dream-engine.js`.
3. `dream-link-writer.js` does not exist. Dream-to-source link persistence is not formally owned.

Slice checklist:
- [x] B1: Guard test proving live loop uses `runDreamIntuition()` only. Adapter contains no write call sites.
- [x] B2: Create `server/brain/cognition/dream-maintenance-selector.js` with `scoreDreamCandidate`, `selectDreamCandidates`, `bucketDreamCandidates`.
- [x] B3: Create `server/brain/knowledge/dream-link-writer.js` with `writeDreamSourceLinks`, `emitDreamLinkEvents`.
- [x] B4: Wire selector into `phase-dreams.js`, replace inline candidate scoring.
- [x] B5: Wire link writer into `phase-dreams.js` after dream generation commit.
- [x] B6: Unit tests for selector, link writer, and integration guard for no-write path.

Start criteria: Phase A gate `Done` (already met).
End criteria: All B checkboxes `[x]`. Full suite passes. Ledger + changelog updated.

Stop/Resume: Current B pointer — done. Next: Phase C.

### Slice C - Escalation Guardrails

Status: `Done`

Context (code audit 2026-03-11):
1. `shouldEscalateO2` returns bare `bool`. Reason for decision is lost.
2. `enforceBudgetGuard` exists but is NOT called in orchestrator before O2 fires.
3. No timeout ceiling around O2 final synthesis LLM call.
4. No escalation telemetry in `innerDialog`.

Slice checklist:
- [x] C1: Update `shouldEscalateO2` to return `{ escalate: bool, reason: string }`. Update call sites.
- [x] C2: Wire `enforceBudgetGuard` as blocking pre-check before O2 escalation. Over-budget → force fallback + log reason.
- [x] C3: Add `enforceLatencyGuard(callFn, maxMs)` to `orchestration-policy.js`. Wrap O2 synthesis call with it. On timeout, fallback to default model.
- [x] C4: Add `innerDialog.artifacts.escalation` telemetry: `{ reason, modelUsed, timedOut, budgetBlocked, latencyMs, tokenCost }`.
- [x] C5: Regression tests: shouldEscalateO2 reasons, budget cap blocks escalation, timeout fires fallback.

Start criteria: Phase B done.
End criteria: All C checkboxes `[x]`. Full suite passes. Ledger + changelog updated.

Stop/Resume: Phase C complete. All C1–C5 delivered. See Implementation Ledger 2026-03-11.

### Slice D - Worker Pilot

Status: `Done`

Context (code audit 2026-03-11):
1. No worker entity infrastructure exists at all.
2. `EntityRuntime` manages a single entity. No registry, dispatcher, or output contract.
3. Architecture spec: subsystem mode = worker entity acts as hidden role for host orchestration.
4. Contract: `{ summary, signals, confidence, memoryRefs?, nextHints? }`. On invalid/timeout → silent fallback to native aspect.

Slice checklist:
- [x] D1: Create `server/contracts/worker-output-contract.js` with `validateWorkerOutput`, `normalizeWorkerOutput`.
- [x] D2: Create `server/brain/core/worker-registry.js` with `registerWorker`, `unregisterWorker`, `getWorker`, `listWorkers`.
- [x] D3: Create `server/brain/core/worker-dispatcher.js` with `invokeWorker(binding, input, callLLM, opts)`. Silent fallback on failure/timeout.
- [x] D4: Wire registry check into Orchestrator constructor + contributor methods. Try worker first, fall back to native if null.
- [x] D5: Emit `worker_invoked`, `worker_success`, `worker_fallback` events on bus. Add `workerDiagnostics` to `innerDialog.artifacts`.
- [x] D6: Tests: contract validation paths, registry bind/unbind, dispatcher valid/invalid/timeout paths, orchestrator integration guard.

Start criteria: Phase C done.
End criteria: All D checkboxes `[x]`. Full suite passes. Ledger + changelog updated.

Stop/Resume: Phase D complete. All D1–D6 delivered. See Implementation Ledger 2026-03-11.

## Source-of-Truth Docs

1. `Documents/current/ARCHITECTURE-OVERVIEW.md`
2. `Documents/current/PIPELINE-AND-ORCHESTRATION.md`
3. `Documents/current/MEMORY-SYSTEM.md`
4. `Documents/current/CONTRACTS-AND-SCHEMAS.md`
5. `Documents/current/OPEN-ITEMS-AUDIT.md`
6. `CHANGELOG.md`
7. `package.json`

## Implementation Ledger (2026-03-14)

### UI Shell - Creator Extraction and Window App Integration

Status: `Done`

Scope:
1. Move entity creation flow out of inline modal into a dedicated creator app surface.
2. Make Creator a first-class window app in the desktop shell.
3. Remove `+ New` creation actions from Entity app surfaces.

Landed slices:
1. Added standalone creator app files:
   - `client/create.html`
   - `client/js/create.js`
2. Added shell app integration for Creator:
   - Added `creator` entry to `WINDOW_APPS` in `client/js/app.js`.
   - Added `tab-creator` iframe pane in `client/index.html`.
3. Rewired creation entry points to Creator app:
   - `showNewEntityDialog()` now routes to Creator window.
   - setup hatch route now routes to Creator window.
4. Removed inline entity-creation modal/progress markup from `client/index.html`.

Exit criteria:
1. Creator runs as its own resizable app window.
2. Entity app no longer owns `+ New` creation controls.

### UI Shell - Release/Checkout Controls Hardening

Status: `Done`

Scope:
1. Ensure entities can always be released after checkout.
2. Surface release controls in all key user paths.

Landed slices:
1. Release visibility now uses server-synced active entity state in `refreshSidebarEntities()`.
2. `releaseActiveEntity()` now resolves active entity from `/api/entities/current` if local state is stale.
3. Release controls added/wired in:
   - nav entity actions
   - start menu entity actions
   - chat toolbar
   - entity profile view action row

Exit criteria:
1. User can check out and release/check-in without UI dead-end.

### UI Shell - Users App + Power Controls

Status: `Done`

Scope:
1. Add first-class Users app window for profile management.
2. Add visible server power controls in requested locations.

Landed slices:
1. Added `users` app to shell window registry and new `tab-users` view in `client/index.html`.
2. Added users app handlers in `client/js/app.js`:
   - `usersAppRefresh`
   - `usersAppCreateUser`
   - `usersAppSetActive`
   - `usersAppClearActive`
   - `usersAppDelete`
3. Power control placement:
   - Start/Apps menu quick actions (`⏻ Power`)
   - left-bottom nav sidebar (`Power Off Server`)

Exit criteria:
1. Users app is launchable and functional against existing `/api/users*` routes.
2. Power button visible in both requested locations.

## Stop/Resume Snapshot

- Current phase: `UI Shell Consolidation`
- Current slice: `Post-integration UX verification`
- Last completed slice: `Users app + release control hardening + power controls`
- In-progress item: `none`
- Next action on resume: `Run browser validation pass for Creator/Users/Release/Power controls and update CHANGELOG if missing entries`

## Documentation Audit Note (2026-03-14)

Status: `Done`

1. Requested git comparison could not be executed in this workspace because `c:\Users\voard\Desktop\NekoCore-main` has no `.git` metadata.
2. Fallback used: reconcile docs against concrete in-workspace file changes and live implemented features.
3. Changelog updated under `Unreleased` to capture Creator extraction, release/check-in controls, Users app, and power-control placement.
4. If repository metadata is restored, run a follow-up true git diff audit and append any missing deltas.

## Session Stop Checkpoint (2026-03-14)

Status: `Paused`

1. Attempted to pull missing `Documents/` from `https://github.com/voardwalker-code/NekoCore.git`.
2. Remote clone succeeded, but no `Documents/` (or `docs/`) directory exists on `origin/main`.
3. User confirmed newer docs are available on another laptop/git source; docs import deferred.
4. Resume action: import docs from alternate source, then run a docs truth-sync pass against current Creator/Users/Release/Power changes.

### 2026-03-14 - entityPaths Module Relocation (Path-Hygiene-1)

Status: `Done`

Scope delivered:
1. Moved canonical path module from `server/entities/entityPaths.js` to `server/entityPaths.js` to avoid confusion with top-level runtime data folder.
2. Updated server and tests imports to the new module location.
3. Removed obsolete `server/entities/` directory after migration.
4. Kept root runtime data folder (`entities/`) as the canonical per-entity storage target.

Validation:
1. `node --test tests/unit/entity-paths.test.js` => 12 pass, 0 fail.

## Manual Test Notes Queue (2026-03-14)

Status: `Queued`

1. Dream memory regression check:
   - Symptom to verify: `Dream Memory not found` appears unexpectedly.
2. Physical self UI verification:
   - Symptom to verify: `Physical Self` display/layout appears visually off.

### 2026-03-14 - Personal Data Sweep (Pre-Push)

Status: `Done`

Scope delivered:
1. Cleared runtime auth/user state files to empty objects:
   - `server/data/accounts.json`
   - `server/data/sessions.json`
   - `server/data/checkouts.json`
2. Cleared system timeline log file:
   - `memories/logs/timeline-system.ndjson`
3. Ensured root runtime folder exists as required:
   - `entities/`

Push status:
1. Push could not be executed from this workspace: no `.git` metadata is present (`fatal: not a git repository`).

### 2026-03-14 - NekoCore Browser Phase NB-2 Technical Spike (Complete)

Status: `Done`

Scope delivered (NB-2-2 through NB-2-6 in one pass):

1. **NB-2-2 — Navigation POC:**
   - Created `browser-host/navigation.js` with navigate/back/forward/reload.
   - Per-tab history stacks (back + forward) with URL validation and protocol whitelisting.
   - Emits `browser.navigation.state` events with contract fields.

2. **NB-2-3 — Tab Model POC:**
   - Created `browser-host/tab-model.js` with create/switch/close.
   - Deterministic active-tab fallback: next → previous → null.
   - Emits `browser.tab.lifecycle` events on create/close.

3. **NB-2-4 — Lifecycle and Download POC:**
   - Created `browser-host/lifecycle.js` with host state machine (host_starting → host_ready → host_closing).
   - Created `browser-host/download-manager.js` with start/complete/failure and correlatable IDs.
   - Both emit contract events through shared event bus.

4. **NB-2-5 — Backend Bridge Wiring:**
   - Created `server/routes/browser-routes.js` following existing route factory pattern.
   - Endpoints: GET session/tabs/downloads; POST navigate/tab-create/tab-activate/tab-close/reload/go-back/go-forward.
   - SSE relay: all `browser.*` events forwarded to SSE clients via `broadcastSSE`.
   - Registered in `server/server.js` dispatcher array.

5. **NB-2-6 — Spike Acceptance Run:**
   - Created `tests/unit/browser-spike-acceptance.js` with 23 tests.
   - Result: 23/23 pass — all NB-1-0 acceptance criteria met.
   - Categories: host lifecycle (3), tab model (6), navigation (8), downloads (4), event shape (2).

6. **Supporting infrastructure:**
   - Created `browser-host/event-bus.js` — lightweight EventEmitter with auto-timestamp and wildcard relay.
   - Updated `browser-host/index.js` entry point to re-export all submodules.

Validation:
1. `node tests/unit/browser-spike-acceptance.js` => 23 pass, 0 fail.
2. `require('./browser-host')` loads cleanly with all 5 submodules.
3. Plan checklist NB-2-2 through NB-2-6 checked done; phase status set to Done.
4. Ledger, stop/resume snapshot, CHANGELOG updated.
