# REM System — Architecture Overview

Version: 0.6.0
Last updated: 2026-03-13

---

## What REM Is

REM (Recursive Echo Memory) is a zero-dependency Node.js cognitive architecture that sits between a user interface and one or more LLM providers. It gives AI language model instances a persistent, evolving inner life — continuous memory, emotional baseline, belief formation, dreaming, and per-user relationship tracking that all survive across sessions.

Core design conviction: an entity should be shaped by what it has experienced, not only by what it was told on day one.

---

## Subsystem Map

| Subsystem | Key Files | What It Does |
|-----------|-----------|--------------|
| **Cognitive Pipeline** | server/brain/core/orchestrator.js | Runs 1A + 1D in parallel, then 1C, then Final orchestrator pass (2B inlined) |
| **Orchestration Policy** | server/brain/core/orchestration-policy.js | Budget guard, latency guard, O2 escalation decision |
| **Worker Subsystem** | server/brain/core/worker-registry.js, worker-dispatcher.js | Plugin-style worker slots that override contributor phases |
| **Memory Retrieval** | server/services/memory-retrieval.js | Subconscious context block assembly, chatlog recall, doc_* filtering |
| **Memory Operations** | server/services/memory-operations.js | createCoreMemory, createSemanticKnowledge |
| **Memory Storage** | server/brain/memory/memory-storage.js | Atomic read/write for episodic/semantic/ltm |
| **Memory Index** | server/brain/memory/memory-index-cache.js | O(1) lookups, divergence detection and repair |
| **Memory Lifecycle** | server/brain/cognition/phases/phase-decay.js + server/brain/memory/memory-storage.js | Decay tick orchestration + decayMemories implementation |
| **Context Consolidation** | server/brain/generation/context-consolidator.js | Builds context.md for every entity before each LLM call |
| **Belief Graph** | server/brain/knowledge/beliefGraph.js, server/beliefs/ | Emergent beliefs from memory cross-reference |
| **Dream Intuition** | server/brain/cognition/dream-intuition-adapter.js | Live-loop abstract association contributor (1D) |
| **Dream Maintenance** | server/brain/cognition/dream-maintenance-selector.js, server/brain/knowledge/dream-link-writer.js | Offline sleep-cycle dream processing |
| **Brain Loop** | server/brain/brain-loop.js | Background cognition ticker |
| **Entity Runtime** | server/services/entity-runtime.js | Entity state lifecycle per active entity |
| **Context Assembly** | server/brain/generation/aspect-prompts.js | System prompts for each contributor phase |
| **User Profiles** | server/services/user-profiles.js | Per-entity registry of users the entity has met |
| **Relationship Service** | server/services/relationship-service.js | Per-user feeling/trust/rapport/beliefs, LLM-updated |
| **Entity Checkout** | server/services/entity-checkout.js | Multi-user checkout ownership and idle-release guard |
| **Post-Response Memory** | server/services/post-response-memory.js | Async memory encoding + relationship update after each response |
| **Authentication** | server/services/auth-service.js, server/routes/auth-routes.js | Login, session management, account registry |
| **LLM Interface** | server/services/llm-interface.js | callLLMWithRuntime, callSubconsciousReranker |
| **Config Runtime** | server/services/config-runtime.js | Profile/aspect config resolution for multi-LLM routing |
| **Response Postprocess** | server/services/response-postprocess.js | Strips tool tags, formats final output |
| **Runtime Lifecycle** | server/services/runtime-lifecycle.js | Server startup/shutdown orchestration |
| **Skills** | skills/ | Pluggable tools (web search, file ops, memory tools) |
| **SSE / Diagnostics** | server/routes/sse-routes.js | Real-time streaming diagnostics and cognitive bus events |

---

## Key Design Principles

### Evolution Over Origin
Entities are not frozen snapshots. The origin story (backstory, starting traits) is placed LAST in the LLM context, after current emotional state and accumulated memories. The entity's lived experience takes precedence over its starting description.

The one exception: **Unbreakable Mode** (opt-in at creation) locks the origin story as permanently authoritative, for NPCs and fixed characters that must never drift.

### Parallel Contributors
Subconscious (1A) and Dream-Intuition (1D) run in parallel via `Promise.all`. Conscious (1C) starts after both complete so it can reason with full memory + dream context. Final Orchestrator pass voices/reviews with refinement inlined.

### Modular Decomposition
`server/server.js` is a composition/bootstrap file only. Business logic lives in dedicated service and brain modules. No module above 800 lines should receive new feature blocks without an extraction plan.

### Contracts and Schema Governance
Critical boundaries are guarded by explicit contracts. Memory records have a versioned schema. Worker outputs have a validated contract. Contributor outputs have a defined shape.

### Persistent Identity Across Sessions
Entity state is disk-persisted. Every conversation is encoded into memory. Sleep cycles consolidate and reprocess. The entity that wakes up after a sleep cycle is the same one that went to sleep — with new memories integrated.

---

## Server Routing Structure

```
server/routes/
  auth-routes.js         — login, logout, session check
  chat-routes.js         — main conversation endpoint
  entity-routes.js       — entity CRUD, user profiles, relationships, guided/character creation
  memory-routes.js       — memory read/write/search
  brain-routes.js        — brain loop control
  cognitive-routes.js    — sleep, dream, archive triggers
  document-routes.js     — document ingestion pipeline
  config-routes.js       — runtime config management
  sse-routes.js          — real-time event streaming
  skills-routes.js       — skill invocation surface
```

---

## Entity Folder Layout

```
entities/
  entity_<name>-<timestamp>/
    entity.json          — id, name, traits, creation_mode, unbreakable flag
    brain-loop-state.json
    onboarding-state.json
    beliefs/             — belief graph persistence
    index/               — memory index files
    memories/
      context.md         — assembled LLM context (rebuilt on server start and memory update)
      system-prompt.txt  — identity foundation and backstory
      persona.json       — live emotional state (mood, tone, llmPersonality, etc.)
      users/             — per-user profile files + _active.json
      episodic/          — episodic memory folders
      semantic/          — semantic knowledge folders
      ltm/               — long-term compressed chatlog chunks
    quarantine/
    skills/
```

---

## Document Index (this folder)

| File | Contents |
|------|----------|
| ARCHITECTURE-OVERVIEW.md | This file — system map and design principles |
| PIPELINE-AND-ORCHESTRATION.md | Cognitive pipeline, orchestrator, worker subsystem, escalation |
| MEMORY-SYSTEM.md | All memory subsystems — storage, retrieval, decay, belief graph, context assembly |
| ENTITY-AND-IDENTITY.md | Entity creation, identity modes, context consolidation |
| DREAM-SYSTEM.md | Dream intuition (live) and dream maintenance (offline sleep) |
| SERVER-MODULE-MAP.md | Every server file explained — post-decomposition reference |
| AUTH-AND-USERS.md | Authentication, user profiles, relationship service |
| CONTRACTS-AND-SCHEMAS.md | Memory schema, worker output contract, contributor contracts |
| MODEL-RECOMMENDATIONS.md | OpenRouter + Ollama model picks for each pipeline stage |
| RELEASE-NOTES.md | Versioned release notes (including 0.6.0) |
| VISION-AND-ROADMAP.md | Long-term product vision and open-source release plan |
| CHANGELOG.md | Chronological log of all changes |
