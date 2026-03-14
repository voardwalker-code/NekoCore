# Open Items Audit — 2026-03-14

This document audits every unchecked item across all plans and checklists in the project. Each item is assessed as one of:

- **DONE** — completed, just never checked off (tracking debt)
- **PENDING** — genuinely not done yet, still relevant
- **OBSOLETE** — no longer applies to the current system

---

## 1. WORKLOG.md — Stale Tracking (Tracking Debt Only)

These items show as unchecked `[ ]` but the work is confirmed done in the Implementation Ledger. The boxes just weren't ticked when the work landed.

| Item | Assessment | Evidence |
|------|------------|---------|
| Phase C — C1: `shouldEscalateO2` returns `{ escalate, reason }` | **DONE** | Ledger entry 2026-03-11: "shouldEscalateO2 now returns `{ escalate, reason }`" |
| Phase C — C2: Wire `enforceBudgetGuard` before O2 escalation | **DONE** | Ledger: "C2 budget guard: evaluates tokenUsageSoFar before choosing model" |
| Phase C — C3: `enforceLatencyGuard` with timeout/fallback | **DONE** | Ledger: "C3 latency guard: O2 synthesis call wrapped in enforceLatencyGuard" |
| Phase C — C4: `innerDialog.artifacts.escalation` telemetry | **DONE** | Ledger: "innerDialog.artifacts.escalation populated from finalResponse._escalation" |
| Phase C — C5: Regression tests for escalation guardrails | **DONE** | Ledger: "31 regression tests in tests/unit/escalation-guardrails.test.js" |
| Phase D — D1: `worker-output-contract.js` | **DONE** | Ledger: "Worker output contract module created, validateWorkerOutput + normalizeWorkerOutput" |
| Phase D — D2: `worker-registry.js` | **DONE** | Ledger: "Worker registry created — registerWorker, unregisterWorker, getWorker, listWorkers" |
| Phase D — D3: `worker-dispatcher.js` | **DONE** | Ledger: "Worker dispatcher created — invokeWorker wraps LLM call in latency guard" |
| Phase D — D4: Wire registry into Orchestrator | **DONE** | Ledger: "workerRegistry constructor option added; contributor methods check registry first" |
| Phase D — D5: Worker bus events + `workerDiagnostics` | **DONE** | Ledger: "worker_invoked, worker_success, worker_fallback events emitted; workerDiagnostics in artifacts" |
| Phase D — D6: Worker subsystem tests | **DONE** | Ledger: "46 regression tests in tests/unit/worker-subsystem.test.js" |
| **Stop/Resume Snapshot** — shows A-Re0 as "not started" | **DONE** (stale snapshot) | All A-Re0 through A-Re6 checkboxes are ticked; all phases confirmed Done in Current Phase Snapshot |
| **Version field** — shows pre-0.6 wording | **STALE** | Current system is `0.6.0` |
| **Source-of-Truth Docs list** — references old `Documents/` paths | **STALE** | Authority is now `Documents/current/`; old paths still exist but are superseded |

**Action needed:** Keep WORKLOG and docs synchronized after each landed slice. No runtime code changes required.

---

## 2. Open-Source Release Checklist (VISION-AND-ROADMAP.md)

These are genuinely pending. None are blocking day-to-day development, but all must be completed before any public release.

### Repo Hygiene

| Item | Assessment |
|------|------------|
| Remove/sanitize local secrets, API keys, tokens | **PENDING** — run `rg -n "sk-\|api[_-]?key\|token\|secret\|password"` to verify |
| Verify `.gitignore` covers entity runtime artifacts and local config | **DONE** — runtime directories now use content-level ignore patterns with tracked `.gitkeep` placeholders |
| Ensure no personal/private test data in `entities/` or `memories/` | **PENDING** — the `entities/entity_john-*/` folder exists in the repo; review |
| Confirm no absolute local paths in docs or code | **PENDING** |
| Final sweep for `TODO`, `FIXME`, `HACK` | **PENDING** |

### Documentation Baseline

| Item | Assessment |
|------|------------|
| README Quick Start works on a fresh machine | **PENDING** — QUICKSTART.md exists but hasn't been validated on a clean clone |
| Add `What Works Today` section to README | **DONE** |
| Add `Known Limitations` section to README | **DONE** |
| Add architecture index linking `Documents/current/` | **DONE** |
| Add "Safety and Behavior" note | **DONE** — added explicit safety/copyright and behavior guidance in README |
| Add `CONTRIBUTING.md` | **PENDING** |
| Add `CODE_OF_CONDUCT.md` | **PENDING** |
| Add issue templates | **PENDING** |

### Stability Gates

| Item | Assessment |
|------|------------|
| Chat send/receive works end-to-end | **LIKELY DONE** — system is in active use, but not formally smoke-tested on a clean clone |
| Document ingest (select + drag-drop) works | **LIKELY DONE** — not formally verified |
| Reconstruct works for `long_term_memory` and `knowledge_memory` | **LIKELY DONE** — not formally verified |
| Shutdown from UI performs full graceful cycle | **LIKELY DONE** — not formally verified |
| Brain loop survives 20+ cycles without fatal break | **LIKELY DONE** — not formally verified |
| Entity switch + reload preserves memory continuity | **LIKELY DONE** — not formally verified |

### Contract and Schema Gates

| Item | Assessment |
|------|------------|
| Canonical response shapes for `/api/chat`, `/api/document/ingest`, `/api/memories/reconstruct` | **PENDING** — contracts defined in `CONTRACTS-AND-SCHEMAS.md` but not all are formally validated at the route level |
| Non-null fields normalized (no null/array drift) | **PENDING** |
| `memorySchemaVersion` defined and documented | **DONE** — enforced by `normalizeMemoryRecord()` in `server/contracts/memory-schema.js` |
| Legacy adapter behavior documented | **PENDING** |
| Migration strategy documented for older document chunks | **PENDING** |

### Tests and Verification

| Item | Assessment |
|------|------------|
| Smoke test script for fresh clone | **PENDING** |
| At least one test each for: memory store/retrieve, reconstruct route, shutdown path | **PENDING** — memory tests exist; reconstruct and shutdown paths are not covered |
| Run `npm test` clean and store pass count in release notes | **DONE** — 318 passing as of 2026-03-11; recorded in `Documents/current/RELEASE-NOTES.md` |
| Verify startup on a second machine/clean profile | **PENDING** |

---

## 3. Feature Milestones — Planned but Not Started

These are in the roadmap but have no implementation yet. Not blocking anything — listed for awareness.

| Milestone | Status | Notes |
|-----------|--------|-------|
| Agent Echo orchestrator | **PLANNED** | Multi-entity task routing, workforce management — core product long-term direction. Requires Worker Subsystem (done) as foundation. No implementation started. |
| Worker entity groups | **PLANNED** | Entity contact list + role assignment API. Depends on Agent Echo orchestrator planning. No implementation started. |

---

## 3A. Active NekoCore Browser Phase Status

Current browser phase status:
1. NB-0-0 completed (phase plan initialization).
2. NB-0-1 completed (scope lock and non-goals).
3. NB-0-2 completed (dependency approval and third-party notices policy).
4. NB-0-3 completed (browser data policy and persistence defaults).
5. NB-0-4 completed (contributor provenance policy decision: DCO).
6. NB-0-5 completed (Phase 0 exit review).
7. NB-1-0 completed (spike acceptance checks baseline).
8. NB-1-1 completed (repo module boundary map).
9. NB-1-2 completed (bridge/API contract baseline).
10. NB-2-0 completed (NB-1 exit review; NB-2 spike phase defined).
11. NB-2-1 completed (browser-host/ scaffold created and verified).
12. NB-1 Done. NB-2 is active; NB-2-2 is the current slice (navigation POC).

---

## 4. Summary — What Actually Needs Doing

### Immediate (housekeeping, no code)
1. **Keep docs current per slice** — update WORKLOG snapshot/ledger and source-of-truth docs in lockstep with landed changes
2. **Check `entities/` folder** — verify no personal data is committed that shouldn't be public
3. **Add and publish docs currently staged in `Documents/current/`** — source-of-truth docs now expected to travel with repo pushes
4. **Complete NB-2-2** — implement navigation POC with URL input, back/forward/refresh, and `browser.navigation.state` events

### Before any public release
1. Repo hygiene sweep (secrets scan, gitignore, absolute paths, TODO/FIXME)
2. README update (Quick Start validation, What Works Today, Known Limitations, architecture index)
3. Community files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates
4. Formal smoke test on a clean clone
5. Contract enforcement at route level for `/api/chat`, `/api/document/ingest`, `/api/memories/reconstruct`
6. Keep memory schema contract docs aligned with implementation
7. Tests for reconstruct route and shutdown path

### Future feature work (no urgency, no blocking)
- Agent Echo orchestrator design and implementation
- Worker entity groups

---

## 5. Legacy Phase Set Status

The prior seven tracked phases are confirmed Done:
1. Cleanup gate — Done
2. Live-loop refactor (parallel pipeline) — Done
3. Dream split hardening — Done
4. Escalation guardrails — Done
5. Worker subsystem pilot — Done
6. Phase A re-evaluation (server.js decomposition) — Done
7. Runtime quality hardening — Done

Current active development phase is NekoCore Browser NB-2 (technical spike implementation).
Current active slice is NB-2-2 (navigation POC).
