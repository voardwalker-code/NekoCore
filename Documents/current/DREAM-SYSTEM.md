# REM System — Dream System

Last updated: 2026-03-14

Covers: live dream intuition (chat pipeline), offline dream maintenance (sleep cycle), maintenance selector, dream-link writer, and the split between the two.

---

## Two Completely Separate Dream Pipelines

This is the most important thing to understand about the dream system:

| | Dream Intuition | Dream Maintenance |
|---|---|---|
| When | Live, during every chat turn | Offline, during sleep cycles only |
| What it does | Generates abstract associations and lateral links as a cognitive contributor | Processes accumulated memories — narrative synthesis, belief integration, pattern extraction |
| Memory writes | NONE — purely generative, no persistence | YES — this is where dream content becomes permanent |
| Pipeline stage | Contributor 1D (parallel with 1A and 1C) | Separate brain-loop phase, never triggered during live chat |
| Output | Abstract metaphors, creative links, lateral associations fed to orchestrator | Dream narratives committed to memory, linked to source memories |

---

## Dream Intuition (Live Pipeline)

File: `server/brain/cognition/dream-intuition-adapter.js`

The dream intuition adapter is the 1D contributor in the parallel pipeline. It:
1. Receives turn signals (subject, event, emotion, tension — extracted deterministically from user message)
2. Asks the LLM to generate abstract associations, lateral links, and creative metaphors related to the ongoing exchange
3. Returns the output as a structured artifact for the Orchestrator to incorporate in the 2B synthesis pass
4. **Writes nothing to disk** — this is explicitly enforced by the guard tests in `dream-split-guards.test.js`

The intuition layer adds creative depth to responses without the overhead of the maintenance pipeline. You can think of it as "what comes to mind immediately" vs "what gets processed overnight."

---

## Dream Maintenance (Offline — Sleep Cycles)

Files:
- `server/brain/cognition/dream-maintenance-selector.js` — chooses which memories to dream about
- `server/brain/knowledge/dream-link-writer.js` — persists dream outputs and links them to source memories
- `server/brain/cognition/phases/phase-dreams.js` — coordinates the maintenance pipeline

### Candidate Selection (dream-maintenance-selector.js)

Replaces the old inline `getMostImportant` heuristic with a multi-dimensional scoring system.

Each memory candidate is scored across five dimensions:

| Dimension | What it measures |
|-----------|-----------------|
| Emotion | Does the memory have a significant emotional tag? |
| Learn tags | Is the memory tagged as a learning event or insight? |
| Error markers | Does the memory involve an error, failure, or correction? |
| Staleness | Has this memory not been dreamed about recently? |
| Graph degree | How many belief graph connections does this memory have? |

The combined score determines which memories are selected for dream processing this cycle. This multi-factor approach prevents the dream system from repeatedly processing the same high-importance memories and ignoring others.

### Dream Processing
The selected candidates each go through a LLM synthesis pass that:
- Generates a dream narrative connecting the memory to related experiences
- Extracts patterns, themes, and insights
- Produces a structured output for belief integration

### Dream Link Writer (dream-link-writer.js)
After each dream commit:
1. Writes a link from the dream output to the original source memory
2. Emits a cognitive bus event (`dream_linked`, `dream_commit`) so the SSE diagnostics stream can show dream activity in real time
3. The dream result is stored in the entity's memory structure

---

## Sleep Cycle Sequence

A complete sleep cycle (triggered by the brain loop's sleep timer or manually):

```
1. Dream Maintenance
   — select candidates via dream-maintenance-selector.js
   — run LLM dream narratives for each
   — commit dreams + write source links via dream-link-writer.js

2. Memory Consolidation
   — re-score decayed memories
   — integrate dream insights into belief graph

3. Persona Update
   — update mood, emotions, continuity notes in persona.json
   — optionally regenerate llmPersonality if it has evolved

4. Context Rebuild
   — context-consolidator.js rebuilds context.md
   — entity wakes up with integrated experience
```

---

## Guard Tests (dream-split-guards.test.js)

Tests that enforce the live/offline split:
- `dream-intuition-adapter.js` must have no memory write call sites; it is read-only
- `phase-dreams.js` must use the selector module (not inline getMostImportant)
- `phase-dreams.js` must invoke the link writer after each commit

These tests will fail if someone accidentally adds persistence to the live intuition adapter or removes the selector/link-writer wiring.

---

## Relevant Files

| File | Role |
|------|------|
| server/brain/cognition/dream-intuition-adapter.js | Live 1D contributor — no writes |
| server/brain/cognition/dream-maintenance-selector.js | Multi-factor candidate scoring for offline dreams |
| server/brain/knowledge/dream-link-writer.js | Dream-to-source link persistence + bus events |
| server/brain/cognition/phases/phase-dreams.js | Offline dream execution coordinator |
| tests/unit/dream-split-guards.test.js | Enforces live/offline separation |
| tests/unit/dream-maintenance.test.js | 34 tests for selector + link writer |
