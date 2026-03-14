# BugTest Notes

Purpose:
1. Keep a live queue of behavior-impacting slices that require manual bug testing.
2. Make test phases fast and repeatable by keeping one source of truth.

Rules:
1. Do not add low-risk cosmetic-only changes unless requested.
2. Add entries for behavior-impacting slices (runtime logic, memory retrieval, orchestration, routing, persistence, auth, model/runtime selection, prompt wiring).
3. Every entry must have status and a concrete test checklist.

Status values:
1. `Queued`
2. `In Test`
3. `Pass`
4. `Fail`
5. `Deferred`

## Active Queue

| ID | Date | Slice | Area | Risk | Status | Owner | Notes |
|----|------|-------|------|------|--------|-------|-------|
| BT-2026-03-13-01 | 2026-03-13 | Mem-Recall-Tuning-1 | Memory retrieval | High (context density + latency) | Queued | Voard | Verify recall relevance, latency, and no document/chatlog bleed-through |
| BT-2026-03-13-02 | 2026-03-13 | Rel-Flow-1 | Orchestrator conscious input | Medium (tone/regression) | Queued | Voard | Verify conscious output reflects relationship state without overfitting |
| BT-2026-03-13-03 | 2026-03-13 | Con-ActiveCtx-1/2 | Conscious active recall context | Medium-High (prompt quality, reduced latency risk) | Queued | Voard | Verify conscious uses recalled memories/chatlogs without context spam; confirm no duplicate retrieval latency hit |
| BT-2026-03-13-04 | 2026-03-13 | Pipeline-Reflow-F1/F3 | Orchestrator pipeline flow | High (end-to-end behavior change) | Queued | Voard | Verify 1D output visible in 1C reasoning; Orchestrator voices not re-synthesizes; entity voice is authentic; no regression in tool passthrough or task plan behavior |
| BT-2026-03-14-01 | 2026-03-14 | UI-Shell-2026-03-14 | Desktop shell launcher/taskbar | High (navigation + state) | Queued | Voard | Verify category open/close stability, pin/unpin persistence, and no auto-close race in launcher |
| BT-2026-03-14-02 | 2026-03-14 | Browser-UX-2026-03-14 | Browser app search/home/results | High (discoverability + state restore) | Queued | Voard | Verify Search Home, Search Results, Show Page transitions; confirm minimized-results recovery after navigation |
| BT-2026-03-14-03 | 2026-03-14 | Runtime-Window-2026-03-14 | Shutdown/browser lifecycle | High (runtime reliability) | Queued | Voard | Verify dedicated browser window closes on shutdown, lock state resets, and restart launches a clean dedicated window |

## Test Checklist Template

Use this checklist for each queued item.

- [ ] Reproduction setup documented (entity, user profile, config profile, prompt)
- [ ] Baseline behavior captured (before change)
- [ ] Post-change behavior captured (after change)
- [ ] Latency check recorded (if runtime/prompt affected)
- [ ] Memory relevance quality checked (if retrieval affected)
- [ ] Failure/edge cases tested
- [ ] Pass/Fail decision with short rationale
- [ ] Follow-up fix items linked

## Results Log

### BT-2026-03-13-01 - Mem-Recall-Tuning-1

Status: `Queued`

Planned checks:
1. Multi-turn conversation (5-8 turns) with memory-referential prompts.
2. Confirm up to 12 context memories are coherent and non-boilerplate.
3. Confirm up to 3 chatlogs are relevant and not `doc_*` pollution.
4. Compare average response latency against prior baseline.

### BT-2026-03-13-02 - Rel-Flow-1

Status: `Queued`

Planned checks:
1. Conversation with known relationship profile shift.
2. Confirm conscious reasoning uses relationship signal naturally.
3. Confirm no rigid repetition of relationship summary in every reply.
4. Confirm orchestrator output remains user-question-first.

### BT-2026-03-13-03 - Con-ActiveCtx-1/2

Status: `Queued`

Planned checks:
1. Multi-turn conversation (6-10 turns) with explicit callbacks to earlier topics.
2. Confirm conscious references active recalled memories/chatlogs when relevant.
3. Confirm no prompt bloat behavior (rambling, repeated ID lists, context dumping).
4. Compare latency impact against pre-change baseline and confirm no second retrieval per turn.

### BT-2026-03-14-01 - UI-Shell-2026-03-14

Status: `Queued`

Planned checks:
1. Open Apps launcher repeatedly and navigate 3+ categories without forced close.
2. Pin and unpin app(s), reload shell, verify persistence and ordering behavior.
3. Validate taskbar user/power controls remain responsive after multiple app launches.

### BT-2026-03-14-02 - Browser-UX-2026-03-14

Status: `Queued`

Planned checks:
1. Run a browser search and verify automatic transition to results view.
2. Open a result, confirm results minimize and can be restored via Show Results.
3. Return to Search Home and verify search history/chip behavior remains intact.

### BT-2026-03-14-03 - Runtime-Window-2026-03-14

Status: `Queued`

Planned checks:
1. Start server and verify dedicated browser window opens once.
2. Trigger shutdown from UI and verify dedicated window closes.
3. Restart server and verify no stale lock prevents clean reopen.
