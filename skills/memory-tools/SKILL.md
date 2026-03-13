---
name: memory-tools
description: Advanced memory management tools. Create, search, and organize entity memories with fine-grained control.
enabled: true
---

# Memory Tools

Advanced memory management skill that provides fine-grained control over the entity's memory system.

## Available Tools

### Search Memories
Search across all stored memories (episodic, semantic, core, chatlogs) by keyword or topic. Returns scored results and related compressed chatlog context.

```
[TOOL:mem_search query="your search terms here"]
```

Example:
```
[TOOL:mem_search query="conversation about neural visualization"]
```

### Create Core Memory
Create an important memory that persists with high importance.

```
[TOOL:mem_create semantic="The fact or experience to remember" importance="0.9" emotion="joy" topics="topic1, topic2"]
```

- `semantic` (required): The content of the memory
- `importance`: 0.0–1.0, default 0.8
- `emotion`: Primary emotion label (e.g. joy, curiosity, frustration)
- `topics`: Comma-separated topic keywords

### Working Notes
Use workspace tools (`ws_write`, `ws_read`) to keep working notes in the skill workspace for multi-step research or projects.

## Behavior Guidelines

- Use `mem_search` to find past conversations and memories relevant to the current topic
- Use `mem_create` for facts the entity should never forget
- Working notes in the workspace are useful for multi-step research or projects
- Chatlog results from `mem_search` are compressed — reconstruct the narrative before referencing them
