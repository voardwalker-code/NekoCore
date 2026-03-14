# REM System — Vision and Roadmap

---

## What Is This File

This document consolidates the product direction and open-source release plan into a single reference. It draws from `long-term-vision-agent-echo.md` and `open-source-release-playbook.md` (preserved unchanged in the parent `Documents/` folder).

Current execution note (2026-03-14):
1. Near-term work is interface-first: make shell/app flows intuitive and reliable.
2. Browser strategy follows `NEKOCORE-BROWSER-ROADMAP.md` (embedded-engine path with compliance guardrails).

---

## Core Vision — Agent Echo

### The Three-Phase Origin

**Phase 1: Hubslie**
Proved that mixed human + LLM group-chat interaction can feel collaborative. A frontman-style orchestrator coordinating multiple agents for a single user goal was validated. Missing: deeper reasoning logic, reliable specialization and continuity at scale.

**Phase 2: Memory Architect**
Solved the context window problem. Chatlog compression enabled cross-session, cross-model continuity with meaningfully lower token overhead. This was the practical bridge beyond classic heavy RAG patterns.

**Phase 3: REM System / Echo (current)**
The Evolution Target:
- **Persistent memory + personality** — entities carry who they are across sessions
- **Orchestrated specialization** — task routing to the right entity for the job
- **Task execution + companionship** — both function and relationship, in one coherent system

---

## Target Architecture — Agent Echo as Workforce Orchestrator

The long-term product goal is for **Agent Echo** to act as a frontman orchestrator for a dynamic entity workforce.

### Echo Responsibilities
- Intake user goals
- Build execution plans
- Define required job roles
- Select and assign entities from the user's entity contact list
- Coordinate handoffs between entities
- Maintain progress and accountability
- Synthesize outputs back to the user

### Interaction Modes Under Consideration

**Mode A — Group-Chat Visible Orchestration**
Echo brings entities into the shared chat when direct clarification is needed. Entities can ask the user questions directly when information is missing. Multiple entities can coordinate in real time.

**Mode B — Echo-Only Interface**
User sees one surface: Echo. Internal orchestration is visible only as scoped identity labels like `Agent Echo(EntityName)`. Cleaner, but less transparent.

Both modes should remain compatible with the same orchestration core.

---

## Entity Workforce Governance Concept

When entities execute task roles, performance accountability is needed. Proposed policy:

| Step | Action |
|------|--------|
| 1 | Verbal warning |
| 2 | Written warning — user notified |
| 3 | Final warning / probation — increased monitoring |
| 4 | Automatic removal from active role assignment |

This prevents silent failures when an assigned entity is underperforming on a critical task.

---

## Open-Source Release Readiness

### Release Goals
- Preserve credibility on first public drop
- Minimize immediate issue chaos
- Highlight novelty (cognitive architecture, not just chat UI)
- Attract contributors and signal technical depth

### Repo Hygiene (Before Public Release)
- [ ] Remove or sanitize any local secrets, API keys, tokens, or private endpoints
- [x] Verify `.gitignore` covers entity runtime artifacts and local config files
- [ ] Ensure no personal/private test data is committed in `entities/` or `memories/`
- [ ] Confirm no absolute local paths remain in docs or code comments
- [ ] Run a final sweep for `TODO`, `FIXME`, `HACK` and decide what stays

Quick scan commands:
```bash
rg -n "sk-|api[_-]?key|token|secret|password"
rg -n "TODO|FIXME|HACK"
```

### Documentation Baseline (Before Public Release)
- [ ] README has a clean Quick Start that works on a fresh machine
- [ ] Add `What Works Today` section
- [ ] Add `Known Limitations` section
- [ ] Add architecture index linking docs in `Documents/`
- [x] Add a "Safety and Behavior" note clarifying persona and autonomy boundaries
- [ ] Add `CONTRIBUTING.md` with branch and PR expectations
- [ ] Add `CODE_OF_CONDUCT.md`
- [ ] Add issue templates (bug report, feature request, question)

### Stability Gates (Must Pass Before Public Release)
- [ ] Chat send/receive works end-to-end
- [ ] Document ingest works for both select and drag-drop
- [ ] Reconstruct works for `long_term_memory` and `knowledge_memory`
- [ ] Shutdown from UI performs full graceful cycle and exits cleanly
- [ ] Brain loop survives at least 20 cycles without fatal break
- [ ] Entity switch + reload preserves expected memory continuity

### Contract and Schema Gates
- [ ] Canonical response shapes established for `/api/chat`, `/api/document/ingest`, `/api/memories/reconstruct`
- [ ] Non-null fields normalized (no null/array shape drift)
- [ ] `memorySchemaVersion` defined and documented
- [ ] Legacy adapter behavior documented
- [ ] Migration strategy documented for older document chunks

### Tests and Verification
- [ ] Add smoke test script (manual is fine for first release)
- [ ] At least one test each for: memory store/retrieve, reconstruct route, shutdown path
- [ ] Run `npm test` clean and store pass count in release notes
- [ ] Verify startup from a clean clone + config on a second machine

---

## Branch Plan for First Public Release

```
main          — stable public branch
develop       — active integration
feature/*     — individual features
release/*     — release staging
```

Suggested first release tag: `v0.5.2-prealpha` or `v0.6.0-prealpha` after refactor stabilizes.

Suggested 0.6.0 release commit sequence:
```bash
git checkout main
git pull origin main
git add -A
git commit -m "release: 0.6.0-prealpha server decomposition and worker subsystem"
git tag -a v0.6.0-prealpha -m "REM System 0.6.0-prealpha"
git push origin main
git push origin v0.6.0-prealpha
```

---

## Feature Milestones (Toward 0.6.0)

| Milestone | Status | Notes |
|-----------|--------|-------|
| Parallel contributor pipeline | ✅ Live | 1A + 1C + 1D parallel via Promise.all |
| Multi-user + relationships | ✅ Live | User profiles, 14-value feeling scale, trust/rapport |
| server.js decomposition | ✅ Live | −46%, composition-first server bootstrap |
| Worker entity subsystem | ✅ Live | Registry + dispatcher + output contract |
| Escalation guardrails | ✅ Live | O2 budget cap, latency guard, reason telemetry |
| Dream pipeline split | ✅ Live | Live intuition (no writes) vs offline maintenance |
| Authentication system | ✅ Live | Login, sessions, account management |
| Unbreakable Identity mode | ✅ Live | Origin story locked as permanently authoritative |
| Desktop shell usability refactor | ✅ Live | Launcher categories, pinned behavior hardening, user/power clarity |
| Browser app UX pass | ✅ Live | In-app search home/results/page model, minimized-results recovery |
| NekoCore Browser roadmap draft | ✅ Planned Baseline | `NEKOCORE-BROWSER-ROADMAP.md` defines phased engine-based path |
| **Agent Echo orchestrator** | ⬜ Planned | Multi-entity task routing and workforce management |
| **Worker entity groups** | ⬜ Planned | Entity contact list + role assignment |
| **Group-chat interface** | ⬜ Planned | Mode A: multiple entities in shared chat |
| **Echo-only interface** | ⬜ Planned | Mode B: single Echo surface with internal routing |
| **Public release readiness** | ⬜ Planned | Repo hygiene + docs + stability gates |
