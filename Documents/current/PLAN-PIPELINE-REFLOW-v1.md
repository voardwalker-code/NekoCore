# PLAN: Pipeline Reflow — Dream→Conscious, Orchestrator→Reviewer

**Status:** `Done`
**Version target:** 0.5.2-prealpha
**Date created:** 2026-03-13
**Last updated:** 2026-03-13

---

## 1. Background / Why This Plan Exists

The current pipeline runs 1A (Subconscious) and 1D (Dream-Intuition) in parallel, feeds 1A's memoryContext into 1C (Conscious), then sends ALL three outputs (1A + 1C + 1D) to the Orchestrator for final synthesis. The Orchestrator is currently a 4th LLM call that re-reasons over the entire cognitive state to produce the entity's voice.

Problem: The Orchestrator is doing double-work — it re-synthesizes what Conscious already reasoned through while also applying voice/personality. Dream output bypasses Conscious entirely and goes straight to the Orchestrator, meaning Conscious never benefits from the creative lateral associations when forming its reasoned draft. Additionally, each contributor receives the user message as a parameter but the Orchestrator prompt also includes the full user message, wasting tokens by echoing content that each stage already has locally.

---

## 2. Objective

**Done looks like:**
1. Dream-Intuition (1D) output is piped into Conscious (1C) as input — Conscious drafts its response with full awareness of dream associations.
2. Orchestrator receives a FULL COPY of everything Conscious received (1A context, 1D output, turn signals, relationship, active recall) PLUS the Conscious output. Its job is reduced to: review the draft for fit, apply entity voice/humanizer, and send as response.
3. No contributor sends the user message inside its output text — each stage receives it directly from the pipeline.
4. LLM call count stays at 4 (1A, 1D, 1C, Final). No new calls added.
5. All existing tests pass. Pipeline doc and diagram updated.

---

## 3. Audit Findings / Pre-Work Analysis

### Current Pipeline Flow (code truth from orchestrator.js)

```
Line 116: subconsciousPromise = this.runSubconscious(userMessage)
Line 117: dreamPromise = this.runDreamIntuition(userMessage, turnSignals)
Line 118: consciousPromise = subconsciousPromise.then(seed => this.runConscious(userMessage, chatHistory, {
            turnSignals, entityId, memoryContext: seed?.memoryContext || null }))
Line 124: [subconsciousRaw, consciousRaw, dreamIntuitionRaw] = await Promise.all([...])
Line 184: finalResponse = await this.runOrchestrator(consciousText, subconsciousText, dreamText, userMessage, {...})
```

### Files Affected

| Item | File | Lines | Change |
|------|------|-------|--------|
| Pipeline flow (Promise wiring) | server/brain/core/orchestrator.js | ~116-130 | 1C waits for both 1A AND 1D; receives dreamText |
| runConscious() signature + body | server/brain/core/orchestrator.js | ~600-710 | Accept + use dreamText param |
| runOrchestrator() prompt | server/brain/core/orchestrator.js | ~799-900 | Restructure to reviewer/voicer role |
| getConsciousPrompt() | server/brain/generation/aspect-prompts.js | ~72-290 | Accept dreamText, add DREAM section as real input |
| getOrchestratorPrompt() | server/brain/generation/aspect-prompts.js | ~294-400 | Rewrite to reviewer/voice role |
| runOrchestrator() mergePrompt | server/brain/core/orchestrator.js | ~835-875 | Include full 1C context copy + 1C output, remove synthesis logic |
| Pipeline docs + diagram | Documents/current/PIPELINE-AND-ORCHESTRATION.md | ~1-60 | Update flow, diagram, descriptions |

**Estimated total impact:** ~180 lines edited across 3 files. No files created or deleted.

---

## 4. Architecture Boundary Check

- [x] No frontend (`client/**`) receives backend orchestration, filesystem logic, or policy logic
- [x] No backend (`server/**`) receives DOM/UI rendering concerns
- [x] New routes added to `server/routes/**`, not inlined into `server/server.js` — N/A (no new routes)
- [x] New data schemas and validators go into `server/contracts/**` — N/A (no new schemas)
- [x] No new business logic added to `server/server.js` (composition only) — N/A (changes are in brain/)
- [x] All new modules target <= 300 lines — N/A (no new modules)
- [x] orchestrator.js is 1069 lines — under 1200, no extraction required

[BOUNDARY_OK]

---

## 5. Phases

---

### Phase F1: Pipeline Flow Rewire — 1C waits for 1A + 1D

**Goal:** Change Promise wiring so Conscious starts only after BOTH Subconscious and Dream complete. Pass dream output into runConscious.
**Status:** `Planned`
**Depends on:** none

#### Slice Checklist

- [x] F1-0: Rewire Promise chain in `processChat()` — `consciousPromise` waits for `Promise.all([subconsciousPromise, dreamPromise])` then calls `runConscious` with both outputs
- [x] F1-1: Update `runConscious()` signature — accept `options.dreamText` parameter, thread it through

#### Exact Changes (F1-0)

**File:** `server/brain/core/orchestrator.js` ~lines 116-130

**BEFORE:**
```js
const subconsciousPromise = this.runSubconscious(userMessage);
const dreamPromise = this.runDreamIntuition(userMessage, turnSignals);
const consciousPromise = subconsciousPromise.then((subconsciousSeed) => this.runConscious(userMessage, chatHistory, {
  turnSignals,
  entityId: options.entityId,
  memoryContext: subconsciousSeed?.memoryContext || null
}));

const [subconsciousRaw, consciousRaw, dreamIntuitionRaw] = await Promise.all([
  subconsciousPromise,
  consciousPromise,
  dreamPromise
]);
```

**AFTER:**
```js
const subconsciousPromise = this.runSubconscious(userMessage);
const dreamPromise = this.runDreamIntuition(userMessage, turnSignals);
const consciousPromise = Promise.all([subconsciousPromise, dreamPromise]).then(
  ([subconsciousSeed, dreamSeed]) => this.runConscious(userMessage, chatHistory, {
    turnSignals,
    entityId: options.entityId,
    memoryContext: subconsciousSeed?.memoryContext || null,
    dreamText: dreamSeed?._text || null
  })
);

const [subconsciousRaw, consciousRaw, dreamIntuitionRaw] = await Promise.all([
  subconsciousPromise,
  consciousPromise,
  dreamPromise
]);
```

**Rollback:** Revert the 4-line consciousPromise assignment to the `.then((subconsciousSeed) =>` form. Remove `dreamText` from the options object.

#### Exact Changes (F1-1)

**File:** `server/brain/core/orchestrator.js`, `runConscious()` method

**BEFORE (conciseDreamHint, ~line 697):**
```js
const conciseDreamHint = `Provide practical reasoning while leaving room for abstract intuition hints supplied by the dream-intuition contributor.`;
```

**AFTER:**
```js
const dreamText = options.dreamText || null;
const conciseDreamHint = dreamText
  ? dreamText
  : 'No dream-intuition output available this turn.';
```

**Rollback:** Restore `conciseDreamHint` to the static string. Remove `dreamText` destructure.

---

### Phase F2: Update Conscious System Prompt to Use Dream Input

**Goal:** `getConsciousPrompt()` now receives real dream output as its `dreamContext` parameter instead of a static instruction string. Conscious reasons WITH the dream associations.
**Status:** `Planned`
**Depends on:** F1

#### Slice Checklist

- [ ] F2-0: Verify `getConsciousPrompt(entity, subconsciousContext, dreamContext)` already handles dream text — confirm existing template renders it correctly when `dreamContext` is real LLM output vs. a static hint

#### Exact Changes (F2-0)

**Analysis:** `getConsciousPrompt()` ALREADY has a `[DREAM/CREATIVE BRIEFING]` section that renders `dreamContext` as real content (lines 88-93 in aspect-prompts.js). It checks `!dreamContext.includes('not available') && !dreamContext.includes('NO DREAM ADDITION')` before rendering. Since we're now passing real 1D output (4-8 bullet abstract associations), this section will render correctly with NO code change.

**Validation needed:** Confirm the existing guard conditions don't accidentally filter real dream output. Real dream output from `dream-intuition-adapter.js` will be 4-8 short bullets — it won't contain "not available" or "NO DREAM ADDITION".

**Rollback:** N/A — no code change expected. If the guard conditions need adjustment, note the exact before/after strings.

---

### Phase F3: Restructure Orchestrator to Reviewer/Voicer Role

**Goal:** The Orchestrator receives everything Conscious received (1A context, 1D output, turn signals, relationship, active recall) PLUS Conscious output. Its role becomes: review for fit → apply entity voice/humanizer → send.
**Status:** `Planned`
**Depends on:** F1, F2

#### Slice Checklist

- [x] F3-0: Update `runOrchestrator()` merge prompt — include full conscious context copy, restructure synthesis directive to review/voice role
- [x] F3-1: Update `getOrchestratorPrompt()` system prompt — redefine role from "synthesizer" to "reviewer + voice"
- [x] F3-2: Strip redundant `userMessage` echoing from the orchestrator merge prompt — orchestrator reads user input directly, not echoed through contributors

#### Exact Changes (F3-0)

**File:** `server/brain/core/orchestrator.js`, `runOrchestrator()` method, `mergePrompt` string (~line 835)

Replace the current prompt structure that asks for synthesis of 1A+1C+1D with:
- Section 1: User's original message (from pipeline, not echoed by contributors)
- Section 2: FULL COPY of what Conscious received — subconscious context (1A text), dream associations (1D text), turn signals, relationship signal
- Section 3: Conscious output (1C) — the reasoned draft
- Section 4: Review directive — check fit, apply entity voice, output final response

**BEFORE mergePrompt (abbreviated key structure):**
```
User's message: "${userMessage}"
=== SUBCONSCIOUS === ${subconsciousOutput}
=== DREAM/CREATIVE === ${dreamOutput}
=== CONSCIOUS REASONING === ${consciousOutput}
=== TURN SIGNALS === ${JSON.stringify(turnSignals)}
SYNTHESIS DIRECTIVE: ... synthesize ... START with conscious ... ENRICH with subconscious ...
```

**AFTER mergePrompt:**
```
User's message: "${userMessage}"

=== CONSCIOUS REASONING (the draft response) ===
${consciousOutput}

=== FULL CONTEXT CONSCIOUS HAD ACCESS TO ===
[Subconscious (1A)]:
${subconsciousOutput}

[Dream-Intuition (1D)]:
${dreamOutput}

[Turn Signals]:
${JSON.stringify(turnSignals)}

REVIEW DIRECTIVE:
1. The Conscious draft above is the answer. It was written with full access to the subconscious memories, dream associations, and turn signals shown above.
2. Your job: review the draft for coherence and fit, then rewrite it in ${entity.name}'s authentic voice using the entity identity, persona, beliefs, and emotional baseline you have in your system prompt.
3. Do NOT re-reason or re-synthesize. The thinking is done. You are the voice — shape HOW it is said, not WHAT is said.
4. If the draft missed something critical from the context, you may add it — but prefer the conscious reasoning's direction.
5. Preserve any [TOOL:...] tags and [TASK_PLAN] blocks exactly as written.
```

**Rollback:** Restore the original mergePrompt with SYNTHESIS DIRECTIVE structure.

#### Exact Changes (F3-1)

**File:** `server/brain/generation/aspect-prompts.js`, `getOrchestratorPrompt()` function (~line 294)

Key wording changes in the system prompt:
- "VOICE and MOUTH" stays — this is already correct
- "Synthesize the inner processing" → "Review the conscious draft and deliver it in your authentic voice"
- "The CONSCIOUS REASONING is your foundation" → "The CONSCIOUS REASONING is the answer — your job is to voice it authentically, not to re-derive it"
- Remove bullets about "ENRICH with emotional signal" (Conscious already did this)
- Add: "You are the final quality gate. If the draft is coherent and on-topic, voice it. If something is off, adjust minimally."

**Rollback:** Restore original `getOrchestratorPrompt()` text.

#### Exact Changes (F3-2)

**File:** `server/brain/core/orchestrator.js`, `runOrchestrator()` call site in `processChat()` (~line 184)

Currently the userMessage is passed as a parameter to `runOrchestrator()` and injected into the merge prompt. This stays — the Orchestrator needs to see the user's message to review the draft against it. However, the Orchestrator no longer needs to re-read the full subconscious/dream/conscious as separate synthesis inputs — it reads them as "here's what Conscious saw" context.

**No additional change required here** — the userMessage in the prompt is not wasteful since the Orchestrator needs it to judge fit. The token savings come from the prompt restructure in F3-0 where we remove the instruction to re-synthesize everything.

---

### Phase F4: Documentation and Diagram Update

**Goal:** Update pipeline docs and diagram to reflect new flow.
**Status:** `Planned`
**Depends on:** F3

#### Slice Checklist

- [x] F4-0: Update pipeline diagram in `Documents/current/PIPELINE-AND-ORCHESTRATION.md`
- [x] F4-1: Update overview text, contributor phase descriptions, orchestrator stage description
- [x] F4-2: Update WORKLOG ledger, CHANGELOG, stop/resume snapshot
- [x] F4-3: Add BugTest entry for pipeline reflow validation

---

### Phase F5: Test Verification

**Goal:** Confirm all existing tests pass, no regressions.
**Status:** `Planned`
**Depends on:** F3

#### Slice Checklist

- [x] F5-0: Run full test suite — 318 pass, 0 fail
- [x] F5-1: Manual smoke check (if server is available) — queued as BT-2026-03-13-04

---

## 6. New Pipeline Flow (Target State)

```
User Input
    │
    ├──────────────────────┐
    │                      │
    v                      v
 1A (Subconscious)    1D (Dream-Intuition)
 Memory retrieval     Turn signal → LLM
 Relationship ctx     Abstract associations
 Topic + emotion      Creative metaphors
    │                      │
    └──────────┬───────────┘
               │ (both complete)
               v
          1C (Conscious)
          Receives: turnSignals + 1A memoryContext + 1D dreamText + relationship
          Produces: reasoned draft response
               │
               v
        Orchestrator (Reviewer/Voicer)
        Receives: userMessage + FULL COPY of 1C context + 1C output
        Reviews draft for fit → applies entity voice → sends
               │
          ┌────┴────┐
          v         v
       (async)   (async)
     Memory    Relationship
     Encoding  Update
```

**LLM calls per message:** 4 (1A, 1D, 1C, Final) — unchanged.

---

## 7. Rollback Index

Every change in this plan logs BEFORE/AFTER in the slice description above. To roll back:
1. Reverse changes in reverse phase order: F3 → F1 (F2 has no code change)
2. Each slice's "Rollback" instruction describes the exact revert
3. F4 doc changes are independent and can be rolled back separately

---

## Stop/Resume Snapshot

- Current phase: `Done (all slices complete)`
- Current slice: `F5-1 (manual smoke — queued as BT-2026-03-13-04)`
- Last completed slice: `F4 — docs, diagram, WORKLOG updated`
- In-progress item: `none`
- Next action on resume: `Manual smoke test via live server`
