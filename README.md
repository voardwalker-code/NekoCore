# NekoCore

**Built on REM System (Recursive Echo Memory) — v0.6.0**

NekoCore is a living AI cognitive architecture built on the REM System engine. It gives AI language model instances a persistent, evolving inner life — continuous memory, emotional baseline, belief formation, dreaming, and per-user relationship tracking that all survive across sessions.

> Core design conviction: an entity should be shaped by what it has experienced, not only by what it was told on day one.

---

## What It Does

NekoCore sits between a user interface and one or more LLM providers. Rather than stateless prompt-response cycles, every conversation is encoded into memory, sleep cycles consolidate and reprocess experiences, and the entity that wakes up after a sleep cycle is the same one that went to sleep — with new memories integrated.

- **Episodic + Semantic Memory** — every interaction is stored, indexed, and retrieved by relevance
- **Belief Graph** — emergent beliefs form from memory cross-reference over time
- **Dream System** — live dream-intuition during conversation + offline sleep-cycle dream processing
- **Neurochemistry** — dopamine, cortisol, serotonin, oxytocin modulate response tone in real time
- **Per-User Relationships** — the entity tracks feeling, trust, and rapport with each individual user
- **Multi-LLM Routing** — route each pipeline phase to a different model (Ollama, OpenRouter, etc.)
- **Skills** — pluggable tool layer for web search, file operations, memory tools, and more
- **Zero External Dependencies** — file-system JSON persistence, no database required

---

## Architecture

See [NekoCore.html](NekoCore.html) for the full interactive architecture deck (14 slides).

### Cognitive Pipeline

```
Subconscious (1A) ─┐
                   ├── Promise.all ──► Conscious (1C) ──► Final Orchestrator (2B inlined)
Dream-Intuition (1D)┘
```

1A and 1D run in parallel. 1C starts after both complete so it can reason with full memory + dream context. The final orchestrator pass voices and reviews the response with refinement inlined.

### Subsystem Map

| Subsystem | What It Does |
|-----------|--------------|
| Cognitive Pipeline | Orchestrates 1A + 1D parallel → 1C → Final pass |
| Memory Retrieval | Subconscious context block assembly, chatlog recall |
| Memory Storage | Atomic read/write for episodic / semantic / long-term |
| Memory Index | O(1) lookups, divergence detection and repair |
| Belief Graph | Emergent beliefs from memory cross-reference |
| Dream Intuition | Live abstract association contributor (1D) |
| Dream Maintenance | Offline sleep-cycle dream processing |
| Brain Loop | Background cognition ticker |
| Entity Runtime | Entity state lifecycle per active entity |
| User Profiles | Per-entity registry of users the entity has met |
| Relationship Service | Per-user feeling / trust / rapport / beliefs |
| Post-Response Memory | Async memory encoding + relationship update after each response |
| Skills | Pluggable tools surface |
| SSE / Diagnostics | Real-time streaming diagnostics and cognitive bus events |

### Entity Folder Layout

```
entities/
  entity_<name>-<timestamp>/
    entity.json              — id, name, traits, creation_mode
    memories/
      context.md             — assembled LLM context (rebuilt on each memory update)
      system-prompt.txt      — identity foundation and backstory
      persona.json           — live emotional state
      users/                 — per-user profile files
      episodic/
      semantic/
      ltm/                   — long-term compressed chatlog chunks
    beliefs/
    index/
    skills/
```

---

## Key Design Principles

### Evolution Over Origin
The entity's lived experience takes precedence over its starting description. Origin story is placed *last* in LLM context, after current emotional state and accumulated memories.

The one exception: **Unbreakable Mode** (opt-in at creation) locks the origin story as permanently authoritative — for NPCs and fixed characters that must never drift.

### Modular Decomposition
`server/server.js` is composition/bootstrap only. Business logic lives in dedicated service and brain modules. 10 route modules, each with a single concern.

### Contracts and Schema Governance
Memory records have a versioned schema enforced on every write (`normalizeMemoryRecord()`). Worker outputs and contributor outputs have explicit validated contracts.

---

## Tech Stack

- **Runtime**: Node.js 18+
- **3D Visualizer**: Three.js (WebGL)
- **LLM Support**: OpenRouter, Ollama (any OpenAI-compatible endpoint)
- **Persistence**: File-system JSON (no database)
- **Tests**: 318 passing

---

## Status

`v0.6.0` — active development. Public release in progress.
