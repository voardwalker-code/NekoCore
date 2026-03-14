# REM System — Cognitive Pipeline and Orchestration

Last updated: 2026-03-13

---

## Overview

The live-chat pipeline runs Subconscious (1A) and Dream-Intuition (1D) in parallel. Once both complete, Conscious (1C) runs with full access to 1A's memory context AND 1D's creative associations — it reasons with everything. The Orchestrator then acts as a reviewer and voicer: it receives a full copy of what Conscious had plus the Conscious draft, reviews for fit, and delivers the response in the entity's authentic voice. Post-turn side effects (memory encoding, relationship update) run asynchronously after the response is sent.

This architecture replaced an older serial pipeline (Subconscious → Compress → Conscious) as of v0.5.2-prealpha.

---

## Pipeline Stages

```
                          User Input
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 v                         v
    ┌────────────────────┐    ┌────────────────────────┐
    │  Subconscious (1A) │    │  Dream-Intuition (1D)  │
    │  Memory retrieval  │    │  Turn signal extract.  │
    │  Relationship ctx  │    │  Abstract/lateral links│
    │  Topic + emotion   │    │  Creative metaphors    │
    └─────────┬──────────┘    └────────────┬───────────┘
              │                            │
              │  memoryContext + dreamText │
              └────────────┬───────────────┘
                           │ (both complete)
                           v
              ┌────────────────────────┐
              │     Conscious (1C)     │
              │  Reasons with 1A + 1D  │
              │  Produces full draft   │
              └────────────┬───────────┘
                           │
                           v
              ┌────────────────────────┐
              │  Orchestrator (Final)  │
              │  Reviewer + Voicer     │
              │  Full copy of 1C ctx  │
              │  → entity response     │
              └────────────┬───────────┘
                           │
                  ┌────────┴────────┐
                  v                 v
              (async)           (async)
          Memory Encoding   Relationship Update
```

**Total LLM calls per message:** 4 synchronous base (1A, 1D, 1C, Final) + optional chatlog reconstruction call(s) inside 1A + up to 2 async post-turn.

---

## Contributor Phases

### 1A — Subconscious
- Runs memory retrieval: scores activated memories by `relevanceScore = baseWeight × (0.35 + importance × decay)`
- Assembles subconscious context block: `[ACTIVATED MEMORIES]` + `[CONVERSATION RECALL]` + `[YOUR RELATIONSHIP WITH "X"]`
- Filters out `doc_*` entries (document ingestion chunks — these are not experiential memories)
- Filters entries where semantic content contains system boilerplate markers
- Outputs: emotion signals, topic signals, memory activation observations

### 1D — Dream-Intuition
- Receives turn signals (subject, event, emotion, tension extracted deterministically — on-device, no LLM)
- Generates abstract associations, lateral links, creative metaphors — live creativity layer
- Runs in parallel with 1A; both must complete before Conscious starts
- **Has no memory write access** — intuition only, no persistence (contrast with offline Dream Maintenance)
- Source is tagged `_source: 'native'` (or `'worker'` if a Worker Entity is bound to this aspect)

### 1C — Conscious
- Waits for BOTH 1A and 1D to complete
- Receives: turn signals + relationship signal + active recall context (from 1A `memoryContext`) + dream associations (from 1D output)
- Has full cognitive context — memories, relationships, and creative associations — when forming its response draft
- Produces the primary reasoned response draft
- Can request tool invocations via `[TOOL: ...]` tags
- MUST NOT generate `[TASK_PLAN]` when a single `[TOOL:]` call is sufficient (mutual exclusivity rule)

---

## Orchestrator Stages

### Final Pass — Reviewer and Voicer
- Receives: user message + full copy of what Conscious had (1A context, 1D output, turn signals) + Conscious draft (1C)
- Role: review the Conscious draft for coherence and fit, then deliver it in the entity's authentic voice
- Does NOT re-synthesize — Conscious already reasoned with all context. The Orchestrator shapes HOW it is said, not WHAT.
- Supports `[CONTINUE]` multi-bubble output
- Passes through `[TOOL:...]` tags and `[TASK_PLAN]` blocks unchanged
- Subject to optional model escalation (see Escalation Policy below)

---

## Orchestration Policy

File: `server/brain/core/orchestration-policy.js`

### O2 Escalation (shouldEscalateO2)
Returns `{ escalate: boolean, reason: string }`. Reason vocabulary:
- `high-tension` — emotional intensity or safety criticality above threshold
- `error-constraint-combo` — error state combined with hard constraints
- `planning-implementation-combo` — complex multi-step planning required
- `user-requested-depth` — user explicitly requested highest quality
- `none` — default, no escalation

### Budget Guard (enforceBudgetGuard)
- Receives `tokenUsageSoFar` (cumulative from 1A + 1C + 1D before final synthesis)
- If total exceeds cap, forces `escalate: false` with reason `'budget-cap-<reason>'`
- Returns `{ ok: boolean, reason: string | null }`

### Latency Guard (enforceLatencyGuard)
- Wraps the Final/O2 synthesis call in a 35,000ms timeout race
- On timeout: falls back to `defaultRuntime`, then to Conscious output string if all else fails
- Rejects with `{ timedOut: true, maxMs: 35000 }`

### Escalation Telemetry
Every `runOrchestrator` call returns `_escalation: { reason, modelUsed, timedOut, budgetBlocked, latencyMs, tokenCost }` in `innerDialog.artifacts.escalation`.

---

## Worker Entity Subsystem Mode

Any contributor aspect (Subconscious, Conscious, Dream-Intuition) can be bound to a separate Worker Entity operating in subsystem mode.

Files:
- `server/brain/core/worker-registry.js` — in-memory Map; register/unregister/get/list/clear by aspect key
- `server/brain/core/worker-dispatcher.js` — `invokeWorker(aspectKey, payload)` wraps the call in a latency guard, validates the output against the worker contract, emits cognitive bus events (`worker_invoked`, `worker_success`, `worker_fallback`), returns `null` on failure
- `server/contracts/worker-output-contract.js` — `validateWorkerOutput` + `normalizeWorkerOutput`; required fields: `summary`, `signals`, `confidence`

Worker results are tagged `_source: 'worker'`. On any failure (timeout, invalid contract), the native contributor runs transparently as fallback.

`innerDialog.artifacts.workerDiagnostics` contains `{ used: boolean, entityId: string | null }` per contributor on every orchestration call.

---

## Tool Execution (from Conscious phase)

When the Conscious draft contains `[TOOL: ...]` tags:
1. Server parses and executes the tool call
2. Sets `result._toolsHandled = true`
3. Task plan detection step is skipped (mutual exclusivity — tools already ran)
4. Safety-net strip removes any lingering `[TASK_PLAN]...[/TASK_PLAN]` or orphan `[TOOL:...]` from the final response before postProcessResponse

When the Conscious draft contains `[TASK_PLAN]` AND a `[TOOL:]` simultaneously, the `[TOOL:]` takes priority and the task plan is stripped.

---

## Post-Turn Processing (async, fire-and-forget)

Both of these run after the response is sent — they do not block the user.

### Memory Encoding
- `server/services/post-response-memory.js` calls `createCoreMemory` and `createSemanticKnowledge`
- Episodic records are stamped with `userId` / `userName` of the active user
- Boilerplate guard: if `episodic.semantic` contains system context markers (`[SUBCONSCIOUS MEMORY CONTEXT]`, etc.), the memory is NOT created and a warning is logged

### Relationship Update
- `updateRelationshipFromExchange()` from `server/services/relationship-service.js`
- Receives: user message, entity response, current relationship state
- LLM returns a JSON delta: `feeling`, `trust`, `rapport`, `userRole`, `entityRole`, `beliefs[]`, `summary`, `changeReason`
- Trust change capped at ±0.08 per turn to prevent swings
- Result persisted to `entities/<id>/memories/relationships/<userId>.json`

---

## Subconscious Context Block Format

```
[ENTITY MEMORY CONTEXT]
  [ACTIVATED MEMORIES]
    mem_xxx — importance:0.8 decay:0.95 — "What happened..."
    ...
  [CONVERSATION RECALL]
    <reconstructed chatlog, last N turns, deduplicated>
  [YOUR RELATIONSHIP WITH "UserName"]
    Feeling: warm — Trust: ████░░░░░░ 0.42
    Beliefs: [...], Summary: "...", Role: ...
```

`doc_*` entries (book chunks from document ingestion) are excluded from all sections. They are stored but never appear in live subconscious context.

---

## Relevant Files

| File | Role |
|------|------|
| server/brain/core/orchestrator.js | Pipeline runner, all stages |
| server/brain/core/orchestration-policy.js | Escalation, budget, latency guards |
| server/brain/core/worker-registry.js | Worker binding registry |
| server/brain/core/worker-dispatcher.js | Worker invocation with failsafe |
| server/brain/generation/aspect-prompts.js | System prompts for each contributor phase |
| server/brain/utils/turn-signals.js | Deterministic turn signal extraction |
| server/contracts/contributor-contracts.js | Contributor output shape validators |
| server/contracts/worker-output-contract.js | Worker contract validation |
| server/services/llm-interface.js | callLLMWithRuntime, callSubconsciousReranker |
| server/services/config-runtime.js | Multi-LLM profile/aspect config resolution |
| server/services/post-response-memory.js | Async memory encoding + relationship update |
| server/services/response-postprocess.js | Final output cleanup |
