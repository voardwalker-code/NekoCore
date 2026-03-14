# PLAN: NekoCore Browser Phase 0 Baseline

**Status:** `In Progress`
**Version target:** 0.6.x
**Date created:** 2026-03-14
**Last updated:** 2026-03-14

---

## 1. Background / Why This Plan Exists

NekoCore is moving from REM System core capability into the NekoCore OS phase. Browser capability is currently limited by iframe constraints and cannot reliably support blocked sites or full browser behavior. Before writing host code, we need a compliance and architecture baseline that protects open-source contributors and commercial adopters. This plan turns the browser roadmap into actionable Phase 0 execution slices.

---

## 2. Objective

Define and approve the legal, architecture, contribution, and data-handling baseline for NekoCore Browser so implementation can begin safely. Done means we have an approved Phase 0 policy package, explicit non-goals, dependency review policy, browser data policy, and contribution policy decision (DCO or CLA). This phase does not build the browser host yet; it removes ambiguity and prevents compliance drift.

---

## 3. Audit Findings / Pre-Work Analysis

| Item | Current Location | Lines | Problem / Note | Target |
|------|-----------------|-------|----------------|--------|
| Browser strategy draft | `NEKOCORE-BROWSER-ROADMAP.md` | ~320 | Roadmap exists but no executable phase plan/checklist | `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md` |
| Vision phase framing | `Documents/current/VISION-AND-ROADMAP.md` | n/a | NekoCore phase clarified, but no implementation runbook for browser kickoff | Phase 0 slice execution + WORKLOG ledger |
| Documentation policy | `WORKLOG.md` | n/a | Policy requires planned docs before coding; this enables phase-compliant start | Phase 0 in-progress ledger entry |

**Estimated total impact:** 3 to 6 documentation/policy files updated, no runtime code impact in Phase 0.

---

## 4. Architecture Boundary Check

- [x] No frontend (`client/**`) receives backend orchestration, filesystem logic, or policy logic
- [x] No backend (`server/**`) receives DOM/UI rendering concerns
- [x] New routes added to `server/routes/**`, not inlined into `server/server.js`
- [x] New data schemas and validators go into `server/contracts/**`
- [x] No new business logic added to `server/server.js` (composition only)
- [x] All new modules target <= 300 lines where practical
- [x] Any file above 1200 lines that needs changes: extraction is required in the same slice

Phase 0 is docs/policy only, but boundaries are pre-confirmed for the next implementation phase.

---

## 5. Phases

### Phase NB-0: Governance and Compliance Baseline

**Goal:** Lock browser scope, legal guardrails, and contribution policy before host implementation.
**Status:** `Done`
**Depends on:** none

#### Slice Checklist

- [x] NB-0-0: Convert roadmap intent into executable phase plan — create this plan with checklist and stop/resume state
- [x] NB-0-1: Scope lock and non-goals — confirm engine-based browser direction and prohibited bypass features
- [x] NB-0-2: Dependency and third-party notices policy — define approval and release notice rules
- [x] NB-0-3: Browser data policy — define history/cookies/extraction persistence defaults
- [x] NB-0-4: Contributor provenance policy — select DCO or CLA and document enforcement path
- [x] NB-0-5: Phase 0 exit review — mark baseline approved and unlock Phase 1 technical spike

---

### Phase NB-1: Technical Spike Preparation Gate

**Goal:** Prepare handoff criteria for WebView2 spike work.
**Status:** `Done`
**Depends on:** Phase NB-0

#### Slice Checklist

- [x] NB-1-0: Define spike acceptance checks (navigation, tab model, lifecycle, download event visibility)
- [x] NB-1-1: Define repo module boundaries for host/shared/contracts/routes
- [x] NB-1-2: Define initial bridge/API contract list for browser session and tab state

---

### Phase NB-2: Technical Spike Implementation

**Goal:** Build a minimal working WebView2 browser host that passes NB-1-0 acceptance checks, validate repo boundaries, and produce the evidence package for NB-3 handoff.
**Status:** `In Progress`
**Depends on:** Phase NB-1

#### Slice Checklist

- [x] NB-2-0: NB-1 exit review — close NB-1 gate, create NB-2 plan section, confirm readiness for spike code
- [x] NB-2-1: Host module scaffold — create `browser-host/` directory structure, package manifest, and entry point; verify build path runs
- [ ] NB-2-2: Navigation POC — URL input, navigate, back/forward/refresh, navigation events on active tab
- [ ] NB-2-3: Tab model POC — create/switch/close with deterministic active-tab logic and state sync
- [ ] NB-2-4: Lifecycle and download events POC — host/tab lifecycle state transitions, download start/complete event emission
- [ ] NB-2-5: Backend bridge wiring — `server/routes/browser-routes.js` wired to host module, session/tab/download read endpoints functional
- [ ] NB-2-6: Spike acceptance run — execute NB-1-0 checklist against POC, produce pass/fail log, event trace, and residual-risk notes

---

## 6. Slice Definitions

### NB-0-0 — Phase 0 Plan Initialization

**Start criteria:** Browser roadmap exists and NekoCore phase framing is updated.

**Work:**
1. Create executable phase-plan document in `Documents/current/`.
2. Add clear slice checklist, dependencies, and exit criteria.
3. Add stop/resume snapshot so work can continue without drift.

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- Plan file exists and is versioned.
- Phase status set to `In Progress`.
- NB-0-0 marked complete.

Files changed:
- `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md`

---

### NB-0-1 — Scope Lock and Non-Goals

**Start criteria:** NB-0-0 done.

**Work:**
1. Explicitly confirm browser is application-on-engine, not custom rendering engine.
2. Document non-goals: no DRM/paywall/CSP/frame-header bypass features.
3. Bind scope lock to release and contribution docs.

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Scope lock text added to roadmap/source-of-truth docs.
- Non-goals listed with examples.

Files changed (expected):
- `NEKOCORE-BROWSER-ROADMAP.md`
- `Documents/current/VISION-AND-ROADMAP.md`
- `Documents/current/CHANGELOG.md`

---

### NB-0-2 — Dependency and Notices Policy

**Start criteria:** NB-0-1 done.

**Work:**
1. Define dependency approval checklist for browser-host packages.
2. Define third-party notice requirements for distribution artifacts.
3. Add policy location reference in release docs.

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Policy text in docs and release notes.
- Known candidate engines (WebView2/CEF/Electron) mapped to notice requirement.

Files changed (expected):
- `Documents/current/CONTRACTS-AND-SCHEMAS.md`
- `Documents/current/RELEASE-NOTES.md`
- `Documents/current/OPEN-ITEMS-AUDIT.md`

---

### NB-0-3 — Browser Data Policy

**Start criteria:** NB-0-2 done.

**Work:**
1. Define browser-data vs REM-memory boundary.
2. Define persistence defaults for history/cookies/extraction output.
3. Define explicit-consent requirements for LLM write actions.

**Boundary markers:** `[CONTRACT_ENFORCED]`

**End criteria:**
- Browser data policy documented and discoverable.
- Persistence defaults and consent model explicitly stated.

Files changed (expected):
- `NEKOCORE-BROWSER-ROADMAP.md`
- `Documents/current/CONTRACTS-AND-SCHEMAS.md`
- `README.md`

---

### NB-0-4 — Contributor Provenance Policy

**Start criteria:** NB-0-3 done.

**Work:**
1. Choose DCO or CLA.
2. Add contributor policy entry and enforcement method.
3. Add follow-up task for automation (bot/check) if needed.

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Policy decision is explicit.
- Public contributor guidance updated.

Files changed (expected):
- `Documents/current/VISION-AND-ROADMAP.md`
- `Documents/current/OPEN-ITEMS-AUDIT.md`
- `README.md` or `CONTRIBUTING.md` when added

---

### NB-0-5 — Phase 0 Exit Review

**Start criteria:** NB-0-1 through NB-0-4 done.

**Work:**
1. Confirm all Phase 0 checkboxes complete.
2. Update WORKLOG with done status and residual risk notes.
3. Open NB-1 spike-prep phase and set first slice in progress.

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Phase NB-0 status = `Done`.
- Phase NB-1 unlocked.

Files changed (expected):
- `WORKLOG.md`
- `Documents/current/OPEN-ITEMS-AUDIT.md`
- `Documents/current/CHANGELOG.md`

---

### NB-1-0 — Spike Acceptance Checks Baseline

**Start criteria:** NB-0-5 done and Phase NB-1 active.

**Work:**
1. Define acceptance checks for navigation behavior on an embedded-engine host.
2. Define tab model invariants for create/switch/close and active-tab continuity.
3. Define lifecycle event visibility requirements for host and tab surfaces.
4. Define download event visibility and minimum metadata requirements.
5. Define required spike evidence package for pass/fail handoff.

**Boundary markers:** `[BOUNDARY_OK]` `[CONTRACT_ENFORCED]`

**Acceptance checks (must all pass):**

1. Navigation checks
	- Can navigate to explicit `https://` URL input.
	- Back/forward/refresh commands operate on the active tab.
	- Navigation failures produce explicit error state (not silent no-op).
2. Tab model checks
	- New tab creates a unique tab id and sets active tab deterministically.
	- Close-tab updates active tab deterministically (next, else previous, else none).
	- Switching tabs updates address/title/loading indicators to selected tab state.
3. Lifecycle checks
	- Host emits lifecycle states: `host_starting`, `host_ready`, `host_closing`.
	- Tab emits lifecycle states: `tab_created`, `tab_navigating`, `tab_ready`, `tab_closed`.
	- Unexpected termination/crash path emits explicit error event with reason.
4. Download visibility checks
	- Download start event is emitted with download id, source URL, and suggested filename when available.
	- Download completion/failure events are emitted and correlated to the same id.
	- Download events are visible to shell/task surfaces (telemetry visibility), even before final UI polish.
5. Evidence package checks
	- Spike run log with timestamped pass/fail per acceptance check.
	- Event trace sample showing navigation/tab/lifecycle/download events.
	- Short residual-risk note for any partial behavior accepted for NB-1.

**End criteria:**
- Acceptance checks are documented and approved in source-of-truth docs.
- NB-1-0 marked complete.
- NB-1-1 becomes active.

Files changed (expected):
- `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md`
- `NEKOCORE-BROWSER-ROADMAP.md`
- `Documents/current/CONTRACTS-AND-SCHEMAS.md`
- `Documents/current/RELEASE-NOTES.md`

---

### NB-1-1 — Repo Module Boundary Map

**Start criteria:** NB-1-0 done.

**Work:**
1. Define browser host ownership boundary and runtime responsibilities.
2. Define shared contract/schema boundary for host-backend state exchange.
3. Define backend route boundary for browser-facing APIs.
4. Define policy boundary to prevent browser feature logic from leaking into composition/bootstrap modules.

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]` `[CONTRACT_ENFORCED]`

**Boundary map (authoritative for NB-1):**

1. `browser-host/**` (new module root)
	- Owns embedded-engine runtime lifecycle, window/tab primitives, navigation execution, and host event emission.
	- Must not contain REM memory writes, entity orchestration logic, or route handlers.
2. `browser-shared/**` (new module root)
	- Owns serializable contracts for tab/session/download/lifecycle events and request payload schemas.
	- Must remain engine-agnostic and UI-agnostic.
3. `server/routes/browser-routes.js` (new route module)
	- Owns HTTP API surface for browser state queries and explicit command requests.
	- Must delegate business behavior to service modules; no embedded host logic.
4. `server/services/browser/**` (new service area)
	- Owns backend-side browser orchestration adapters and policy checks.
	- Must not render UI and must not become route/controller code.
5. `client/js/browser/**` (new UI area)
	- Owns browser shell UI state and user interaction wiring.
	- Must not contain filesystem logic, host process management, or backend business policy.
6. `server/server.js`
	- Composition/bootstrap only; may register browser routes and initialize browser service wiring.
	- Must not host browser business logic blocks.

**End criteria:**
- Module boundary map documented in source-of-truth docs.
- Ownership and non-ownership rules are explicit for each layer.
- NB-1-1 marked complete.
- NB-1-2 becomes active.

Files changed (expected):
- `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md`
- `NEKOCORE-BROWSER-ROADMAP.md`
- `Documents/current/CONTRACTS-AND-SCHEMAS.md`
- `Documents/current/SERVER-MODULE-MAP.md`

---

### NB-1-2 — Bridge/API Contract List Baseline

**Start criteria:** NB-1-1 done.

**Work:**
1. Define initial HTTP bridge endpoints for browser session and tab state.
2. Define command payload contracts for navigate, tab create/switch/close, and refresh actions.
3. Define event contracts for host lifecycle, tab lifecycle, navigation state, and download state.
4. Define minimum error envelope contract for bridge/API failures.

**Boundary markers:** `[BOUNDARY_OK]` `[CONTRACT_ENFORCED]`

**Initial contract list (NB-1 baseline):**

1. Read endpoints
	- `GET /api/browser/session`: returns active session summary (host status, active tab id, tab count).
	- `GET /api/browser/tabs`: returns ordered tab array with per-tab state.
	- `GET /api/browser/downloads`: returns current download records and terminal states.
2. Command endpoints
	- `POST /api/browser/command/navigate`: body `{ tabId, url, source }`.
	- `POST /api/browser/command/tab-create`: body `{ openerTabId?, makeActive }`.
	- `POST /api/browser/command/tab-activate`: body `{ tabId }`.
	- `POST /api/browser/command/tab-close`: body `{ tabId }`.
	- `POST /api/browser/command/reload`: body `{ tabId, hard }`.
3. Event channels
	- `browser.host.lifecycle`: `{ state, timestamp, reason? }`.
	- `browser.tab.lifecycle`: `{ tabId, state, timestamp, url?, title? }`.
	- `browser.navigation.state`: `{ tabId, url, loading, canGoBack, canGoForward, timestamp }`.
	- `browser.download.state`: `{ downloadId, state, timestamp, url?, suggestedFilename?, bytesReceived?, totalBytes? }`.
4. Error envelope
	- HTTP/API errors return `{ ok: false, code, message, requestId, retryable }`.
	- Bridge event errors include `{ scope, code, message, requestId?, timestamp }`.

**End criteria:**
- Initial bridge/API contract list documented in source-of-truth docs.
- Core request, state, event, and error shapes are explicit for NB-2 implementation.
- NB-1-2 marked complete.

Files changed (expected):
- `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md`
- `NEKOCORE-BROWSER-ROADMAP.md`
- `Documents/current/CONTRACTS-AND-SCHEMAS.md`
- `Documents/current/RELEASE-NOTES.md`

---

### NB-2-0 — NB-1 Exit Review and NB-2 Gate Open

**Start criteria:** NB-1-2 done and NB-1 slice set complete.

**Work:**
1. Confirm NB-1-0 through NB-1-2 are all complete and contracts are in source-of-truth docs.
2. Mark NB-1 status `Done`.
3. Add Phase NB-2 slice structure to plan with acceptance handoff criteria.
4. Set NB-2-1 as the first active implementation slice.

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- NB-2-0 marked complete.
- NB-2-1 becomes active.

Files changed (expected):
- `Documents/current/PLAN-NEKOCORE-BROWSER-PHASE0-v1.md`
- `WORKLOG.md`
- `Documents/current/OPEN-ITEMS-AUDIT.md`
- `Documents/current/CHANGELOG.md`

---

### NB-2-1 — Host Module Scaffold

**Start criteria:** NB-2-0 done.

**Work:**
1. Create `browser-host/` module root with `package.json` declaring correct name, version, and entry point.
2. Create minimal entry point that can be required/imported without error.
3. Verify build path runs on the target platform.

**Boundary markers:** `[BOUNDARY_OK]` `[JS_OFFLOAD]`

**End criteria:**
- `browser-host/` directory exists with working scaffold.
- Entry point loads without error.
- NB-2-1 marked complete.

---

### NB-2-2 — Navigation POC

**Start criteria:** NB-2-1 done.

**Work:**
1. Implement URL input → navigate on active tab.
2. Implement back, forward, and refresh commands against active tab.
3. Emit `browser.navigation.state` events with required fields.
4. Produce explicit error state on navigation failure.

**Boundary markers:** `[BOUNDARY_OK]` `[CONTRACT_ENFORCED]`

**End criteria:**
- Navigation acceptance checks from NB-1-0 pass for this group.
- NB-2-2 marked complete.

---

### NB-2-3 — Tab Model POC

**Start criteria:** NB-2-2 done.

**Work:**
1. Implement tab create with unique id and deterministic active-tab set.
2. Implement tab switch that updates address/title/loading state.
3. Implement tab close with deterministic active-tab fallback (next → previous → none).
4. Emit `browser.tab.lifecycle` events.

**Boundary markers:** `[BOUNDARY_OK]` `[CONTRACT_ENFORCED]`

**End criteria:**
- Tab model acceptance checks from NB-1-0 pass for this group.
- NB-2-3 marked complete.

---

### NB-2-4 — Lifecycle and Download Events POC

**Start criteria:** NB-2-3 done.

**Work:**
1. Emit `browser.host.lifecycle` states: `host_starting`, `host_ready`, `host_closing`.
2. Emit `browser.tab.lifecycle` states for each tab transition.
3. Emit explicit crash/error event path.
4. Emit `browser.download.state` events with required fields on start/complete/failure.

**Boundary markers:** `[BOUNDARY_OK]` `[CONTRACT_ENFORCED]`

**End criteria:**
- Lifecycle and download acceptance checks from NB-1-0 pass for this group.
- NB-2-4 marked complete.

---

### NB-2-5 — Backend Bridge Wiring

**Start criteria:** NB-2-4 done.

**Work:**
1. Create `server/routes/browser-routes.js` and register in `server/server.js`.
2. Wire `GET /api/browser/session`, `GET /api/browser/tabs`, and `GET /api/browser/downloads` through to host state.
3. Wire at least one command endpoint (`POST /api/browser/command/navigate`) end to end.

**Boundary markers:** `[BOUNDARY_OK]` `[CONTRACT_ENFORCED]`

**End criteria:**
- Read endpoints return contract-compliant shapes.
- Navigate command reaches the host and triggers navigation.
- NB-2-5 marked complete.

---

### NB-2-6 — Spike Acceptance Run

**Start criteria:** NB-2-5 done.

**Work:**
1. Run NB-1-0 acceptance checklist against latest POC build; record pass/fail per check.
2. Capture event trace sample (one success run, one failure-path run).
3. Write residual-risk note for any partial behavior accepted.
4. Mark evidence package complete.

**Boundary markers:** `[BOUNDARY_OK]`

**End criteria:**
- Acceptance report complete with all checks attempted.
- Evidence package present and committed.
- NB-2-6 marked complete.
- NB-3 (Browser Core MVP) gate opened.

---

## 7. Test Plan

| Test File | Slice | What It Verifies |
|-----------|-------|------------------|
| n/a (docs phase) | NB-0-* | Policy and scope baseline finalized before code |

**Test-first rule:** For the next code phase (NB-1), create guard checks for module boundaries and integration seams before host implementation begins.

---

## 8. Risk Notes

1. **Scope creep risk** — Browser feature implementation could begin before policy lock. Mitigation: block Phase NB-1 until NB-0-5 is done.
2. **Legal ambiguity risk** — Contributors may implement bypass-style features without explicit non-goals. Mitigation: enforce non-goals in roadmap and release docs.
3. **Data boundary risk** — Browser extraction could silently leak into REM memory. Mitigation: explicit consent rules and policy-defined persistence defaults.

---

## 9. Completion Ledger

| Date | Slice | Outcome | Notes |
|------|-------|---------|-------|
| 2026-03-14 | NB-0-0 | Done | Phase 0 executable plan created and set in progress |
| 2026-03-14 | NB-0-1 | Done | Scope lock and non-goals documented in roadmap and source-of-truth docs |
| 2026-03-14 | NB-0-2 | Done | Dependency approval checklist and third-party notices policy documented |
| 2026-03-14 | NB-0-3 | Done | Browser data boundary, persistence defaults, and consent model documented |
| 2026-03-14 | NB-0-4 | Done | Contributor provenance policy selected as DCO and documented |
| 2026-03-14 | NB-0-5 | Done | Phase 0 exit review completed; NB-1 unlocked and marked active |
| 2026-03-14 | NB-1-0 | Done | Spike acceptance checks defined for navigation, tabs, lifecycle, and download visibility |
| 2026-03-14 | NB-1-1 | Done | Repo module boundary map defined for browser host/shared/contracts/routes separation |
| 2026-03-14 | NB-1-2 | Done | Initial bridge/API contract list defined for session, tabs, commands, events, and error envelopes |
| 2026-03-14 | NB-2-0 | Done | NB-1 exit review complete; Phase NB-2 spike defined with NB-2-1 through NB-2-6 slice structure |
| 2026-03-14 | NB-2-1 | Done | browser-host/ scaffold created with package.json and entry point; verified load on target platform |

---

## 10. Stop / Resume Snapshot

- **Current phase:** NB-2 Technical Spike Implementation
- **Current slice:** NB-2-2 — status: not started
- **Last completed slice:** NB-2-1
- **In-progress item:** none
- **Blocking issue (if blocked):** none
- **Next action on resume:** implement navigation POC on active tab with URL input, back/forward/refresh, and event emission
