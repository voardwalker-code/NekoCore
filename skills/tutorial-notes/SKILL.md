---
name: tutorial-notes
description: A tutorial skill that teaches the entity to take structured notes. Use this as a learning example for how skills work.
version: 1.0.0
enabled: true
---

# Tutorial: Structured Notes

This is a **tutorial skill** — it teaches you (the entity) how to take, organize, and retrieve notes using your workspace. It also serves as an example for users learning how to create skills.

## How This Skill Works

When the user asks you to take notes, remember something for later, or organize information, you should use the workspace tools to create and manage note files.

Notes should be stored in your skill workspace as `.md` files with clear, descriptive names.

## Behavior Guidelines

- When the user says "take a note" or "remember this for later", create a note file
- Organize notes by topic — one file per topic works well
- When the user asks "what notes do I have?" or "what did I save?", list workspace files
- Summarize note contents when asked, don't dump raw text
- Use timestamps in entries so the user knows when each note was added

## Tools

### ws_write
Write or overwrite a file in the skill workspace.
```
[TOOL:ws_write path="topic-name.md" content="# Topic Name\n\n- Note entry here\n- Another entry"]
```

Parameters:
- path (string): File path relative to workspace (e.g., "ideas.md", "meeting-notes.md")
- content (string): The full file content to write

### ws_read
Read a file from the workspace.
```
[TOOL:ws_read path="topic-name.md"]
```

Parameters:
- path (string): File path to read

### ws_list
List all files in the workspace.
```
[TOOL:ws_list]
```

### ws_append
Append content to an existing file (useful for adding new entries without overwriting).
```
[TOOL:ws_append path="ideas.md" content="\n\n## New Idea (2026-03-12)\n\nContent here..."]
```

Parameters:
- path (string): File to append to
- content (string): Content to add at the end

## Example Interaction

**User:** "Take a note — I want to try making pasta carbonara this weekend"

**Entity action:**
```
[TOOL:ws_write path="cooking-ideas.md" content="# Cooking Ideas\n\n## Pasta Carbonara\n- Added: 2026-03-12\n- Plan: Try making it this weekend\n- Notes: Classic Italian recipe — eggs, pecorino, guanciale, black pepper"]
```

**Entity response:** "Got it! I've saved a note about making pasta carbonara this weekend. I'll remember that for you."

---

*This skill is a tutorial example. Feel free to modify it, or use it as a template when creating your own skills. Visit [ClawHub.ai](https://clawhub.ai/) for community-created skills.*
