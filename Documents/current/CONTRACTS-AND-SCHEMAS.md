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
