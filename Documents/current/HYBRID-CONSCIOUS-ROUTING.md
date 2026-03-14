# Hybrid Conscious Routing — Future Optimization Plan

## Status
PROPOSED — not yet implemented. The current system uses the Reasoning Notes approach
(Conscious → INTENT/MEMORY/EMOTION/ANGLE → Orchestrator writes from notes).
This document describes a further optimization on top of that.

---

## The Idea

Most turns, Mercury 2 (Conscious) produces a response that's already well-grounded and
in-character. The Orchestrator (Claude Sonnet) rewrites it into the final voice — but if
Mercury 2 already nailed the tone, most of the Orchestrator call is redundant.

**Hybrid routing**: Conscious generates a prose response AND a self-assessed personality
fit score. If the score clears a threshold, the Orchestrator call is skipped entirely
and the Conscious output goes straight to the humanizer/post-process step.

---

## Current Token Cost Per Turn (baseline with Reasoning Notes arch)

| Call | Model | Approx tokens |
|------|-------|--------------|
| 1A Subconscious | Mercury 2 | ~3,500 in / ~800 out |
| 1D Dream | Gemini Flash | ~800 in / ~260 out |
| 1C Conscious (notes) | Mercury 2 | ~4,000 in / ~300 out |
| Orchestrator Final | Claude Sonnet | ~6,500 in / ~1,200 out |
| **Total per turn** | | **~17,360 tokens** |

The Orchestrator is the most expensive single call: ~6,500 input tokens on Claude Sonnet.

---

## How Hybrid Routing Works

### Phase 1 — Conscious generates prose + score
The Conscious prompt is modified to produce a **full prose response** (not notes) followed
by a single-line self-score:

```
[entity's actual voice response here]

FIT_SCORE: 0.87
```

The score means: *how well does this response embody the entity's established personality,
voice, and communication style?* Mercury 2 self-assesses against the entity identity,
persona, mood, and tone in the system prompt.

Scoring heuristics to include in the Conscious prompt:
- **0.85–1.0**: Voice, tone, and content feel strongly aligned. Response sounds exactly like this entity.
- **0.65–0.84**: Mostly aligned but something is slightly off — voice drift, generic phrasing, missed emotion signal.
- **0.0–0.64**: Significant misalignment — wrong tone, broke persona, too generic, missed key relationship context.

### Phase 2 — Routing decision in orchestrator.js

After `runConscious()` returns, extract the score:

```javascript
const FIT_SCORE_REGEX = /^FIT_SCORE:\s*([\d.]+)\s*$/im;
const fitMatch = FIT_SCORE_REGEX.exec(consciousText);
const fitScore = fitMatch ? parseFloat(fitMatch[1]) : 0;
const cleanedConsciousText = consciousText.replace(FIT_SCORE_REGEX, '').trim();

const FIT_THRESHOLD = 0.82; // start conservative

if (fitScore >= FIT_THRESHOLD && !isToolTurn && !isFirstMessage) {
  // Bypass Orchestrator — route straight to post-processing
  return {
    finalResponse: cleanedConsciousText,
    _source: 'conscious_bypass',
    _fitScore: fitScore,
    _usage: consciousUsage
  };
}
// else: fall through to normal Orchestrator path
```

### Phase 3 — When bypassed, what happens instead

The `cleanedConsciousText` (prose response with FIT_SCORE line stripped) flows directly
into the existing `postProcessResponse()` call in server.js — the same humanizer that
already runs on every Orchestrator output. No special handling needed.

---

## Expected Savings

Estimate: ~70% of conversational turns produce FIT_SCORE >= 0.82 once the entity has
a well-formed personality/relationship context (typically after 20+ interactions).

| Scenario | Token cost |
|----------|-----------|
| Bypass turn (FIT_SCORE high) | Saves ~7,700 tokens (full Orchestrator call) |
| Non-bypass turn (FIT_SCORE low) | Same as current, no change |
| Cost of scoring on bypass turns | +~900 tokens Conscious out (prose > notes) |
| **Net per bypass turn** | **~−6,800 tokens** |

On a session of 20 turns with 70% bypass rate:
- 14 bypass turns × 6,800 tokens saved = **95,200 tokens saved per session**
- Primarily on Claude Sonnet input tokens — the most expensive per-token cost

---

## Implementation Plan

### Files to change

**`server/brain/generation/aspect-prompts.js` — `getConsciousPrompt`**
- Re-enable prose output (remove REASONING NOTES format)
- Add FIT_SCORE instruction after the response rules:
  ```
  After your response, on a new line, write: FIT_SCORE: [0.0–1.0]
  Score how well this response matches [name]'s established personality and voice.
  0.85+ = strongly in-character. Below 0.65 = something feels off.
  ```
- Token limit: restore `consciousResponse` to 1200 (prose needs more tokens than notes)

**`server/brain/core/orchestrator.js` — `orchestrate()` method**
- After `consciousPromise` resolves, extract FIT_SCORE
- If score >= threshold AND not a tool turn AND not first message → return early with bypass result
- Route the bypass result (cleanedConsciousText) back through the normal `runOrchestrator` return shape

**`server/brain/core/orchestrator.js` — `runOrchestrator()`**
- No change needed — only called when bypass threshold is NOT met

**`server/server.js` — `TOKEN_LIMIT_DEFAULTS`**
- Add new key: `consciousBypass: { value: 1200, label: '...', desc: '...' }` (used when scoring is enabled)
- Keep `consciousResponse` at 600 for the Reasoning Notes fallback mode

**`Config/ma-config.json`**
- Add: `"fitScoreThreshold": 0.82` under a new `"routing": {}` block
- Add: `"hybridRoutingEnabled": false` (off by default — feature flag)

### New feature flag in config

```json
"routing": {
  "hybridEnabled": false,
  "fitThreshold": 0.82,
  "logBypassRate": true
}
```

`hybridEnabled: false` keeps current Reasoning Notes behaviour. Flip to `true` to test bypass routing. `logBypassRate: true` logs bypass vs orchestrator decisions to console so you can tune the threshold.

---

## Cases That Must Always Use the Orchestrator (never bypass)

| Case | Reason |
|------|--------|
| Turn contains `/tool` or active skill | Orchestrator must pass tool tags through; Mercury 2 tool output needs Sonnet review |
| First message after entity load | Establishing initial tone — high stakes |
| Onboarding active | Character formation in progress |
| Low trust (relationship.trust < 0.3) | Entity should be more measured — Orchestrator keeps it careful |
| FIT_SCORE regex absent (LLM forgot to score) | Default to Orchestrator, treat as 0 |
| Dream escalation (userRequestedDepth = true) | User explicitly asked for depth — use Sonnet |

These conditions are checked before the threshold comparison. If any are true, bypass is blocked.

---

## Risk and Mitigation

| Risk | Mitigation |
|------|-----------|
| Mercury 2 over-scores itself (always returns 0.9+) | Start threshold at 0.82, log bypass rate, tune down if needed |
| Bypassed responses feel generic | Score rewards *specificity* — include in scoring criteria: "references a specific memory" |
| First-session quality drop | Block bypass for first 5 interactions per entity (low interactionCount) |
| Tool calls reaching humanizer unprocessed | Hard-block tool turns from bypass (checked by isToolTurn flag) |

---

## Relationship to Current Architecture

```
Current (Reasoning Notes):
  1C Conscious → INTENT/MEMORY/EMOTION/ANGLE notes → Orchestrator writes response
  Every turn: 2 model calls (Mercury 2 + Claude Sonnet)

Proposed (Hybrid Routing ON TOP):
  1C Conscious → prose response + FIT_SCORE
  
  If FIT_SCORE >= threshold:
    → humanizer → send  (1 model call, Mercury 2 only)
  
  If FIT_SCORE < threshold:
    → Orchestrator writes from prose → humanizer → send  (2 model calls)
```

Note: if Hybrid is enabled, Conscious returns to prose output (1200 tokens), not notes (600 tokens).
The hybrid is strictly an Orchestrator bypass — it doesn't combine with Reasoning Notes mode.
The two optimizations are mutually exclusive per turn.

---

## Suggested Rollout

1. Implement behind `hybridEnabled: false` feature flag
2. Enable on a test entity, run 50 turns, log bypass rate and review bypassed responses
3. If bypass rate is 60–80% and quality holds → ship
4. If Mercury 2 over-scores → lower threshold to 0.85 or add specificity criteria to scoring prompt
