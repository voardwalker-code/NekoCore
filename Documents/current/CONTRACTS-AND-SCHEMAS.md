# REM System — Contracts and Schemas

Last updated: 2026-03-14

Covers: memory schema governance, contributor contracts, worker output contract, turn signals, and how contracts enforce boundaries.

---

## Why Contracts Exist

REM System is a multi-LLM pipeline with many independently-running modules writing to disk. Without explicit contracts:
- A refactor in one module silently breaks another's expectations
- LLM outputs with unexpected shapes propagate failures through the pipeline
- Memory records written in one format can't be read back correctly after a schema change

Contracts enforce shapes at boundaries and let refactors happen safely inside a module as long as the boundary shape is preserved.

---

## Browser Dependency Governance Contract (NB-0-2)

NekoCore Browser dependencies must pass this contract before merge.

Required checks:
1. License compatibility with MIT distribution and paid-project downstream use.
2. Security review: no unresolved critical advisories.
3. Maintenance review: active release cadence or clearly justified pin.
4. Purpose review: dependency has clear browser-host requirement.
5. Notices readiness: attribution requirements identified before release.

Disallowed classes:
1. Bypass-oriented tooling (DRM/paywall/security-header circumvention intent).
2. Unknown, incompatible, or non-redistributable license terms.
3. Unmaintained critical-risk dependencies.

Release contract:
1. Browser distributions must ship third-party notices for engine/runtime and bundled dependencies.
2. Notices must map to exact released versions.
3. Dependency additions must be reflected in release notes.

---

## Browser Data Boundary Contract (NB-0-3)

This contract governs how browser-originated information may enter REM memory.

Boundary rules:
1. Browser data and REM memory are separate stores by default.
2. Page visits, render events, and passive browsing must not create REM memories.
3. REM writes require explicit user-directed save action.

Required write fields for browser-to-REM save actions:
1. Source URL (when available)
2. Source title or page label (when available)
3. Capture timestamp
4. User action reason (summary, note, extract, compare, etc.)

Default persistence behavior:
1. Browser analysis output is ephemeral unless saved.
2. Auto-ingest and silent persistence are disallowed.
3. Cross-entity writes are blocked unless explicitly approved by policy.

---

## Browser Spike Acceptance Contract (NB-1-0)

This contract defines the minimum technical acceptance checks before browser-host spike work can be considered valid for handoff.

Required acceptance groups:
1. Navigation behavior on active tab (URL input, back, forward, refresh, explicit failure signal).
2. Tab model invariants (unique id creation, deterministic active-tab switch/close behavior, state sync on tab switch).
3. Lifecycle visibility (host and tab transition events, explicit crash/error signal).
4. Download event visibility (start/complete/failure events with correlatable id and source metadata when available).
5. Evidence package (timestamped pass/fail matrix, event trace sample, residual-risk note).

Contract rules:
1. A spike run is not accepted if any required acceptance group lacks evidence.
2. Silent failure paths are not acceptable; every failed navigation/download/lifecycle path must expose a detectable event or error state.
3. Acceptance checks validate technical observability and control flow only; UI polish is out of scope for NB-1-0.

Required output artifacts for NB-1 handoff:
1. Spike acceptance report (checklist + results).
2. Event trace sample for one successful run and one failure-path run.
3. Open-risks list tagged for NB-1 follow-up slices.

---

## Browser Module Boundary Contract (NB-1-1)

This contract defines ownership boundaries for browser-host spike implementation modules.

Ownership matrix:
1. `browser-host/**` owns embedded-engine lifecycle, navigation execution, tab primitives, and host-side events.
2. `browser-shared/**` owns serializable schema contracts and shared type definitions.
3. `server/routes/browser-routes.js` owns request/response routing only.
4. `server/services/browser/**` owns backend browser orchestration, command handlers, and policy checks.
5. `client/js/browser/**` owns browser shell presentation state and user interaction flow.
6. `server/server.js` owns composition/bootstrap wiring only.

Boundary prohibitions:
1. Browser business logic must not be added to `server/server.js`.
2. Route modules must not contain host-process control implementations.
3. UI modules must not contain filesystem access or backend orchestration.
4. Shared contracts must not import engine-specific host SDK code.

Acceptance rule:
1. NB-1 implementation slices fail boundary review if ownership or prohibition rules are violated without same-slice extraction/remediation.

---

## Browser Bridge/API Contract Baseline (NB-1-2)

This contract defines the initial browser bridge and API payload list for spike implementation.

### Read endpoints

1. `GET /api/browser/session`
  - Response shape:
  - `{ ok, requestId, session: { hostState, activeTabId, tabCount, updatedAt } }`
2. `GET /api/browser/tabs`
  - Response shape:
  - `{ ok, requestId, tabs: [{ tabId, index, url, title, loading, canGoBack, canGoForward, lastEventAt }] }`
3. `GET /api/browser/downloads`
  - Response shape:
  - `{ ok, requestId, downloads: [{ downloadId, state, url, suggestedFilename, bytesReceived, totalBytes, startedAt, endedAt? }] }`

### Command endpoints

1. `POST /api/browser/command/navigate`
  - Request shape: `{ tabId, url, source }`
2. `POST /api/browser/command/tab-create`
  - Request shape: `{ openerTabId?, makeActive }`
3. `POST /api/browser/command/tab-activate`
  - Request shape: `{ tabId }`
4. `POST /api/browser/command/tab-close`
  - Request shape: `{ tabId }`
5. `POST /api/browser/command/reload`
  - Request shape: `{ tabId, hard }`

### Event channels

1. `browser.host.lifecycle`
  - Event shape: `{ state, timestamp, reason? }`
2. `browser.tab.lifecycle`
  - Event shape: `{ tabId, state, timestamp, url?, title? }`
3. `browser.navigation.state`
  - Event shape: `{ tabId, url, loading, canGoBack, canGoForward, timestamp }`
4. `browser.download.state`
  - Event shape: `{ downloadId, state, timestamp, url?, suggestedFilename?, bytesReceived?, totalBytes? }`

### Error envelopes

1. API failure shape:
  - `{ ok: false, code, message, requestId, retryable }`
2. Bridge/event failure shape:
  - `{ scope, code, message, requestId?, timestamp }`

Contract rules:
1. All browser command endpoints must return a request-scoped id for traceability.
2. Event payloads must be additive-safe; new optional fields may be added without removing existing required fields.
3. Unknown command or state values must return structured error envelopes, not plain strings.

---

## Memory Schema (version 1)

File: `server/contracts/memory-schema.js`
Function: `normalizeMemoryRecord(input, options)`

Every memory record written to disk is normalized through this function before persistence. This guarantees a consistent shape regardless of which code path created it.

### Canonical Fields

```
memorySchemaVersion   always 1
memory_id             unique identifier string
type                  episodic | semantic | ltm | core
created               ISO timestamp
last_accessed         ISO timestamp
access_count          integer
access_events         array of access timestamps
decay                 float 0.0–1.0 (1.0 = fully fresh)
importance            float 0.0–1.0
topics                string array
emotionalTag          string | null
```

`memorySchemaVersion` is actively enforced through `normalizeMemoryRecord(...)` and currently resolves to version `1` when missing.

---

## Contributor Output Contracts

File: `server/contracts/contributor-contracts.js`

Validates the output shape of each parallel contributor before it reaches the Orchestrator. If output fails validation, the Orchestrator substitutes a safe fallback string for that aspect rather than crashing the pipeline.

| Validator | Phase | What it checks |
|-----------|-------|---------------|
| `validateSubconsciousOutput(text)` | 1A | Non-empty string, not boilerplate |
| `validateConsciousOutput(text)` | 1C | Non-empty string, not a bare error message |
| `validateDreamIntuitionOutput(text)` | 1D | Non-empty string |

---

## Worker Output Contract

File: `server/contracts/worker-output-contract.js`

Worker Entities acting as aspect subsystems must return outputs matching this contract. The dispatcher validates before handing the result to the Orchestrator.

### Required fields
```
summary      string   — condensed output for the Orchestrator to use
signals      object   — structured signals (emotion, topic, etc.)
confidence   float    — 0.0–1.0 confidence in the output quality
```

### Optional fields
```
memoryRefs   string[] — memory IDs this output drew from
nextHints    string[] — hints for the next turn
```

### Functions
- `validateWorkerOutput(output)` — returns `{ valid: boolean, errors: string[] }`
- `normalizeWorkerOutput(output)` — fills missing optional fields with safe defaults; throws if required fields are missing

---

## Turn Signal Contract

File: `server/brain/utils/turn-signals.js`

Turn signals are extracted deterministically from the user message before the parallel contributor phase starts. They provide a structured, non-LLM preprocessing layer that all contributors can rely on.

```
{
  subject    string   — primary subject of the message
  event      string   — what is happening or being requested
  emotion    string   — detected emotional tone (neutral if none)
  tension    float    — 0.0–1.0 tension level
  raw        string   — original message text
}
```

Turn signals are passed to Dream-Intuition (1D) for abstract association generation and are available to all phases.

---

## Escalation Decision Shape

`shouldEscalateO2()` in `server/brain/core/orchestration-policy.js` returns:
```
{
  escalate   boolean
  reason     string   — one of: high-tension | error-constraint-combo |
                         planning-implementation-combo | user-requested-depth | none
}
```

`enforceBudgetGuard()` returns:
```
{
  ok         boolean
  reason     string | null
}
```

`enforceLatencyGuard(callFn, maxMs)` rejects with:
```
{
  timedOut   true
  maxMs      number
}
```

---

## innerDialog.artifacts Shape

Every `runOrchestrator` call populates `innerDialog.artifacts`:
```
{
  oneA        string   — subconscious (1A) output
  oneC        string   — conscious (1C) output
  oneD        string   — dream-intuition (1D) output
  twoB        string   — orchestrator refinement (2B) output
  turnSignals object   — extracted turn signals
  escalation  {
    reason        string
    modelUsed     string
    timedOut      boolean
    budgetBlocked boolean
    latencyMs     number
    tokenCost     object
  }
  workerDiagnostics {
    subconscious  { used: boolean, entityId: string | null }
    conscious     { used: boolean, entityId: string | null }
    dreamIntuition { used: boolean, entityId: string | null }
  }
  timing {
    contributors_parallel_ms   number
    refinement_ms              number
    orchestrator_final_ms      number
  }
  tokenUsage {
    subconscious   object
    conscious      object
    dreamIntuition object
    refinement     object
    final          object
    total          object
  }
}
```

---

## Where Contracts Are Enforced

| Contract | Enforcement point |
|----------|------------------|
| Memory schema | `memory-storage.js` write path + `memory-schema.js` normalization |
| Contributor output | `orchestrator.js` after each parallel call completes |
| Worker output | `worker-dispatcher.js` before returning to orchestrator |
| Turn signals | `turn-signals.js` extraction (deterministic, no LLM) |
| Budget guard | `orchestrator.js` before O2 model selection |
| Latency guard | `orchestrator.js` wrapping Final pass call |

---

## Boundary Guard Tests

`tests/unit/boundary-cleanup-guards.test.js` scans source files to ensure:
- `callLLMWithRuntime` is NOT defined in `server/server.js`
- `callSubconsciousReranker` is NOT defined in `server/server.js`
- `loadAspectRuntimeConfig` is NOT defined in `server/server.js`
- `normalizeAspectRuntimeConfig` is NOT defined in `server/server.js`
- `createCoreMemory` is NOT defined in `server/server.js`
- `createSemanticKnowledge` is NOT defined in `server/server.js`
- `getSubconsciousMemoryContext` is NOT defined in `server/server.js`
- `parseJsonBlock` is NOT locally defined in `post-response-memory.js` (must be imported)

These tests will fail immediately if business logic leaks back into `server.js` during future changes.
