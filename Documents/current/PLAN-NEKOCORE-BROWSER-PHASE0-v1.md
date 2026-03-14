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
**Status:** `In Progress`
**Depends on:** Phase NB-0

#### Slice Checklist

- [x] NB-1-0: Define spike acceptance checks (navigation, tab model, lifecycle, download event visibility)
- [ ] NB-1-1: Define repo module boundaries for host/shared/contracts/routes
- [ ] NB-1-2: Define initial bridge/API contract list for browser session and tab state

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

---

## 10. Stop / Resume Snapshot

- **Current phase:** NB-1 Technical Spike Preparation Gate
- **Current slice:** NB-1-1 — status: in progress
- **Last completed slice:** NB-1-0
- **In-progress item:** define repo module boundaries for browser host/shared/contracts/routes
- **Blocking issue (if blocked):** none
- **Next action on resume:** draft and lock module-boundary map for spike implementation files
