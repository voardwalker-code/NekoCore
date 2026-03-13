---
name: web-search
description: Browse the web, fetch pages, and extract content. Gives the entity the ability to search and read web content.
enabled: true
---

# Web Search & Browse

This skill enables the entity to search the web and fetch page content.

## Capabilities

When this skill is active, the entity can:
1. **Web Search** — Search the web using a query and get summarized results
2. **Fetch URL** — Fetch and extract readable content from any URL
3. **Save Research** — Store research findings in the skill workspace for later reference

## Usage

The entity should use the `/api/skills/web-search/search` endpoint (via tool calls) for web searches,
and `/api/skills/web-search/fetch` to retrieve full page content.

Results can be saved to the workspace directory for persistent research notes.

## Behavior Guidelines

- When the user asks about current events, news, or facts you're unsure of, use web search.
- Prefer searching before guessing when accuracy matters.
- Summarize fetched content — don't dump raw HTML.
- Save important research findings to workspace files for future reference.
- Always cite your sources with URLs.
