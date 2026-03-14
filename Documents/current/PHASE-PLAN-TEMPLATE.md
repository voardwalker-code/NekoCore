# Phase Plan — Blueprint Template

Copy this file and fill in the blanks. Every phase-based plan in this project follows this structure. Do not skip sections.

---

## How to Use This Template

1. Copy this file. Name it clearly: `PLAN-<TOPIC>-v<N>.md`
2. Fill in every section top-to-bottom before writing any code.
3. Post the filled plan to the chat before implementation begins.
4. Keep it updated as slices complete (check boxes, update ledger, update snapshot).
5. Do not abandon a plan mid-way — either complete it or mark it `Blocked` with a reason.

---

---

# PLAN: [Short Name for This Plan]

**Status:** `Planned` | `In Progress` | `Done` | `Blocked`
**Version target:** [e.g. 0.6.0]
**Date created:** [YYYY-MM-DD]
**Last updated:** [YYYY-MM-DD]

---

## 1. Background / Why This Plan Exists

> Write 2–5 sentences. What problem is being solved? What triggered this plan? What breaks or degrades if we do not do this?

---

## 2. Objective

> One paragraph. What does "done" look like for this plan as a whole? Be concrete. Reference measurable outcomes where possible (line counts, test counts, API shape, behaviour change).

---

## 3. Audit Findings / Pre-Work Analysis

> What did you discover that informs the plan? Audit tables are preferred. Include file paths, line counts, and target locations. Skip this section only for net-new feature work where there is nothing to audit.

| Item | Current Location | Lines | Problem / Note | Target |
|------|-----------------|-------|----------------|--------|
| [function or cluster name] | [file:line range] | [N] | [what is wrong] | [target module] |

**Estimated total impact:** [e.g. ~X lines moved, Y files affected, Z tests added]

---

## 4. Architecture Boundary Check

Before proceeding, confirm all planned changes respect these hard rules. Check each:

- [ ] No frontend (`client/**`) receives backend orchestration, filesystem logic, or policy logic
- [ ] No backend (`server/**`) receives DOM/UI rendering concerns
- [ ] New routes added to `server/routes/**`, not inlined into `server/server.js`
- [ ] New data schemas and validators go into `server/contracts/**`
- [ ] No new business logic added to `server/server.js` (composition only)
- [ ] All new modules target <= 300 lines where practical
- [ ] Any file above 1200 lines that needs changes: extraction is required in the same slice

Mark each: `[BOUNDARY_OK]`, `[JS_OFFLOAD]`, or `[CONTRACT_ENFORCED]` on individual slice work items below.

---

## 5. Phases

> Each Phase groups related slices. Phases run sequentially unless explicitly marked as parallelizable.

---

### Phase [Letter/Number]: [Phase Name]

**Goal:** [One sentence — what this phase achieves]
**Status:** `Planned` | `In Progress` | `Done` | `Blocked`
**Depends on:** [prior phase, or `none`]

#### Slice Checklist

- [ ] [Letter+Number]-0: [First slice name] — [one-line description]
- [ ] [Letter+Number]-1: [Second slice name] — [one-line description]
- [ ] [Letter+Number]-2: ...

> Slice labels follow the format: `[PhaseLetter][PhaseNumber]-[SliceNumber]`
> Example: `A-Re0`, `B1`, `C3`

---

### Phase [Next Letter/Number]: [Phase Name]

**Goal:**
**Status:**
**Depends on:**

#### Slice Checklist

- [ ] ...

---

## 6. Slice Definitions

> One sub-section per slice. Each slice must be independently completable. Do not bundle unrelated changes.

---

### [Slice ID] — [Slice Name]

**Start criteria:** [What must be true/done before this slice can begin]

**Work:**
1. [Concrete step]
2. [Concrete step]
3. ...

**Boundary markers:** `[BOUNDARY_OK]` | `[JS_OFFLOAD]` | `[CONTRACT_ENFORCED]`

**End criteria:** [Specific, verifiable — what must be true for this slice to be marked done]
- Tests affected: [list test files or describe coverage]
- Files changed: [list expected files]

---

### [Next Slice ID] — [Slice Name]

**Start criteria:**

**Work:**
1. ...

**End criteria:**

---

## 7. Test Plan

> What tests need to be written or updated? Write guard tests BEFORE extracting or changing code.

| Test File | Slice | What It Verifies |
|-----------|-------|-----------------|
| `tests/unit/[name].test.js` | [Slice ID] | [Description] |
| `tests/integration/[name].test.js` | [Slice ID] | [Description] |

**Test-first rule:** If a slice changes existing behaviour or moves a function, write the guard test in the first slice of the phase (slice -0 or equivalent) so that failures are caught immediately.

---

## 8. Risk Notes

> List anything that could go wrong, cause regressions, or block a slice. Be specific.

1. **[Risk name]** — [Description and mitigation]
2. **[Risk name]** — [Description and mitigation]

---

## 9. Completion Ledger

> Log each slice as it completes. One line per entry. Never delete entries.

| Date | Slice | Outcome | Notes |
|------|-------|---------|-------|
| [YYYY-MM-DD] | [Slice ID] | Done | [brief note] |

---

## 10. Stop / Resume Snapshot

> Update this section every time work is paused. This is what we read to resume.

- **Current phase:** [Phase name]
- **Current slice:** [Slice ID] — [status: not started / in progress / blocked]
- **Last completed slice:** [Slice ID]
- **In-progress item:** [specific task within slice, or `none`]
- **Blocking issue (if blocked):** [description, or `none`]
- **Next action on resume:** [exact first step to take]

---

---

# Quick Reference: Status Labels

| Label | Meaning |
|-------|---------|
| `Planned` | Plan written, no code touched yet |
| `In Progress` | At least one slice started |
| `Done` | All slices complete, ledger updated, snapshot final |
| `Blocked` | Cannot proceed — reason documented in snapshot |

---

# Quick Reference: Required Markers

| Marker | Meaning |
|--------|---------|
| `[BOUNDARY_OK]` | Layer placement is correct (frontend/backend/routes/contracts separation confirmed) |
| `[JS_OFFLOAD]` | Deterministic logic is owned by a script/module, not inlined in server.js |
| `[CONTRACT_ENFORCED]` | Contributor output/input contract is validated |

---

# Quick Reference: Slice ID Format

```
[PhaseLetter][Number]-[SliceNumber]

Examples:
  A1       — Phase A, slice 1
  A-Re0    — Phase A Re-evaluation, slice 0
  B3       — Phase B, slice 3
  C-Fix1   — Phase C hotfix, slice 1
```

Slice -0 (zero) is always reserved for: **write guard tests / pre-flight checks first**.

---

# Filled Example (Condensed)

```
# PLAN: Auth System Extraction

Status: Done
Version target: 0.6.0
Date created: 2026-03-11

## 2. Objective
Extract authentication logic from server.js into auth-service.js and auth-routes.js.
Done = auth logic not present in server.js, login/session endpoints functional, 
all existing entity tests still pass.

## 3. Audit Findings
| Item | Current Location | Lines | Problem | Target |
|------|-----------------|-------|---------|--------|
| verifySession, createSession | server.js L200-L310 | 110 | mixed into routing | server/services/auth-service.js |
| POST /api/login, GET /api/logout | server.js L312-L398 | 86 | route logic inline | server/routes/auth-routes.js |

## 5. Phases

### Phase AUTH-1: Extraction
Status: Done
Depends on: none

#### Slice Checklist
- [x] AUTH-1-0: Write boundary guard tests for auth functions in server.js
- [x] AUTH-1-1: Create auth-service.js, move verifySession + createSession
- [x] AUTH-1-2: Create auth-routes.js, move login/logout routes
- [x] AUTH-1-3: Wire into server.js, remove original definitions

## 9. Ledger
| Date | Slice | Outcome | Notes |
|------|-------|---------|-------|
| 2026-03-11 | AUTH-1-0 | Done | 4 guard tests written, all fail as expected |
| 2026-03-11 | AUTH-1-1 | Done | auth-service.js created, 112 lines |
| 2026-03-11 | AUTH-1-2 | Done | auth-routes.js created, 94 lines |
| 2026-03-11 | AUTH-1-3 | Done | server.js -196 lines, full suite passes |

## 10. Stop/Resume Snapshot
- Current phase: AUTH-1
- Current slice: AUTH-1-3 — Done
- Last completed slice: AUTH-1-3
- In-progress item: none
- Next action on resume: N/A — plan complete
```
