# NekoCore Browser Roadmap Draft

Status: In Progress
Last updated: 2026-03-14
Owner: NekoCore core project

## Purpose

Build a real NekoCore Browser product that is:

1. Open source and safe for community contribution.
2. Commercial-friendly for paid projects.
3. Editable and extensible by downstream users.
4. Safe by design for both human browsing and LLM-assisted browsing.

## Product Position

NekoCore Browser is a browser application built on top of an existing browser engine.

It is not a new rendering engine.
It is not a DRM or paywall bypass tool.
It is not a system for defeating site security headers.

## Scope Lock (NB-0-1 Completed)

This scope lock is binding for NekoCore Browser work.

In-scope:

1. Build a browser application layer on top of an embedded browser engine.
2. Keep NekoCore-owned UX, policy, and LLM workflow layers.
3. Support Human and LLM modes over one browser surface.

Out-of-scope:

1. Building a custom rendering engine.
2. Any feature designed to bypass DRM, paywalls, CSP, X-Frame-Options, or equivalent security controls.
3. Hidden persistence of page content without explicit user intent.

Enforcement:

1. Features violating out-of-scope rules are rejected.
2. Browser route/policy changes must preserve this scope lock.
3. Future contributor docs must mirror this section.

## Recommended Foundation

Primary recommendation for the first implementation:

1. Windows-first browser host using WebView2.
2. NekoCore-owned browser UI and workflow layer.
3. LLM features layered on top of normal browsing, not fused into the engine.

Why this path:

1. Lowest engineering cost for a real browser surface.
2. Strongest path to a usable MVP inside the current Windows-heavy workflow.
3. Keeps NekoCore code open and modifiable without taking on browser-engine maintenance.

## Legal and Commercial Guardrails

These rules must remain true in every phase.

1. Keep NekoCore-owned code under a permissive license.
   Current repo state is MIT. That is acceptable for paid and open use.
2. Track all third-party components and licenses in a dedicated notices file.
3. Do not implement features whose purpose is bypassing DRM, paywalls, CSP, frame restrictions, or site security controls.
4. Keep page analysis and LLM extraction user-directed and transparent.
5. Require explicit user action before saving page content into memory or project artifacts.
6. Keep AI actions confirmable, auditable, and reversible where practical.
7. Require contributor provenance for submitted code.
   Recommended: DCO or CLA before broad external contribution ramps up.

## Dependency Approval and Third-Party Notices Policy (NB-0-2 Completed)

This policy applies to all browser-related additions.

### Dependency approval checklist

A browser dependency may be added only if all checks pass:

1. License is compatible with MIT distribution and paid-project use.
2. Package is actively maintained and has no unresolved critical advisories.
3. The dependency is required for browser capability, not convenience-only duplication.
4. Security and update path are documented before merge.
5. Dependency is recorded in release notes and notices tracking.

### Blocked dependency classes

Do not approve:

1. Packages primarily intended for bypassing paywalls, DRM, or site security controls.
2. Packages with unknown or incompatible licensing terms.
3. Unmaintained packages with unresolved critical vulnerabilities.

### Notices and attribution requirements

For every distributed browser build:

1. Include third-party notice bundle with license names and source links.
2. Include engine/runtime notice requirements (WebView2, CEF, Electron, or equivalent if used).
3. Include browser-host dependency list and versions used in the build.
4. Keep notice bundle aligned with the exact shipped artifact version.

### Candidate engine notice mapping

1. WebView2: include Microsoft WebView2 redistribution and runtime notice requirements where applicable.
2. CEF: include Chromium/CEF notices and bundled third-party attributions.
3. Electron: include Electron and Chromium/Node notice requirements for packaged releases.

## Browser Data Policy (NB-0-3 Completed)

This policy defines how browser data and REM memory data are separated.

### Data boundary definitions

1. Browser data:
   - navigation history
   - cookies and site storage
   - tab/session state
   - downloads and temporary browser cache
2. REM memory data:
   - explicit user-approved summaries, notes, or extracted artifacts
   - entity memory records written through REM memory services

Rule:
1. Browser data is not REM memory by default.
2. Nothing enters REM memory unless user action explicitly requests it.

### Persistence defaults

Default behavior for NekoCore Browser:

1. Browser analysis outputs are ephemeral unless user saves them.
2. Auto-ingest of page content into REM memory is disabled.
3. Session/browser state persistence is local to browser runtime storage.
4. Cross-entity memory writes from browser actions are disallowed by default.

### Consent and write controls

Any write action to REM memory requires:

1. Clear action intent (save/export/create memory).
2. User confirmation before write.
3. Source traceability metadata in stored output (origin URL/title/time when available).

### Prohibited behavior

1. Silent background harvesting of page text into REM memory.
2. Hidden long-term storage of browser content without explicit user instruction.
3. Implicit write actions triggered only by viewing a page.

## Contributor Provenance Policy (NB-0-4 Completed)

Decision:
1. NekoCore Browser adopts DCO (Developer Certificate of Origin) for contribution provenance.

Why DCO for this phase:
1. Lower friction for open-source contributors than CLA in early growth stage.
2. Clear contributor attestation per commit.
3. Good alignment with MIT-licensed collaborative development.

Contribution requirement:
1. Contributors sign commits with DCO sign-off line.
2. Sign-off format:
   - Signed-off-by: Name <email@example.com>
3. Maintainers should reject browser-related PRs without required sign-offs.

Enforcement path:
1. Add DCO guidance in contributor-facing docs.
2. Add automated DCO check in CI as follow-up implementation work.

## Core Product Modes

NekoCore Browser should support two top-level modes over the same browser surface.

1. Human Mode
   Standard browsing with tabs, history, downloads, bookmarks, settings, profiles.
2. LLM Mode
   Page summarization, ask-this-page, extract structured data, multi-page comparison, research sessions, safe task execution.

## Architecture Principles

1. Engine layer and AI layer stay separate.
2. Browser host code stays isolated from REM cognitive pipeline code.
3. Human browsing must work even if all LLM features are disabled.
4. LLM actions must declare what page data they read and what outputs they store.
5. Extension points must be documented so downstream users can replace models, prompts, policies, and UI pieces.

## Phase Plan

### Phase 0 - Governance, Scope, and Compliance Baseline

Goal:
Lock the legal, architectural, and contribution rules before code expansion.

Steps:

1. Confirm the browser will be an app built on an embedded engine, not a custom engine.
2. Confirm Windows-first delivery and WebView2 as the initial host target.
3. Create a dependency approval policy for browser-related additions.
4. Create a third-party notices process for runtime and packaged artifacts.
5. Decide contributor provenance workflow.
   Recommended default: DCO for all PRs.
6. Define prohibited feature classes.
   Examples: DRM bypass, anti-paywall tooling, hidden scraping persistence, silent agent actions.
7. Define privacy defaults for history, cookies, saved content, and LLM memory writes.
8. Define what counts as browser data versus NekoCore memory data.

Exit criteria:

1. Governance rules documented.
2. Browser scope and non-goals approved.
3. Contribution policy chosen.

Estimated effort:
1 to 3 days.

Status update:
1. Phase 0 baseline is complete (NB-0-0 through NB-0-5).
2. Active work has moved to Phase 1 spike-prep criteria.

### Phase 1 - Technical Spike and Repo Layout

Goal:
Prove the host stack and establish file boundaries before feature work.

Steps:

1. Build a minimal WebView2 proof of concept outside the current iframe path.
2. Validate navigation, address bar input, back, forward, refresh, new window handling, and download events.
3. Decide whether the browser host lives as:
   - a companion desktop app, or
   - a dedicated runtime module launched by the current server.
4. Define repo boundaries for:
   - browser host,
   - shared contracts,
   - UI shell,
   - LLM tools,
   - persistence.
5. Write contracts for browser session state, tab state, history records, and action requests.
6. Define IPC or bridge rules between browser host and NekoCore backend.
7. Decide how existing web UI apps map into the browser shell.

NB-1-0 acceptance baseline (completed):

1. Navigation must pass active-tab controls for URL input, back, forward, and refresh with explicit failure signaling.
2. Tab model must guarantee deterministic active-tab behavior on create/switch/close.
3. Lifecycle event visibility must include host and tab state transitions plus explicit crash/error signal.
4. Download pipeline must emit observable start/complete/failure events with correlatable ids and source metadata.
5. Spike handoff must include pass/fail log, event trace sample, and residual-risk notes.

NB-1-1 module boundary map (completed):

1. `browser-host/**` owns embedded-engine runtime and event emission; no REM memory or route logic.
2. `browser-shared/**` owns engine-agnostic contracts for tab/session/download/lifecycle payloads.
3. `server/routes/browser-routes.js` owns browser HTTP surface only; business behavior delegated to services.
4. `server/services/browser/**` owns backend browser orchestration and policy checks.
5. `client/js/browser/**` owns browser shell UI state and interaction flow only.
6. `server/server.js` remains composition-only and may only wire browser modules.

Suggested repo target:

1. `browser-host/` for native or host runtime code.
2. `browser-shared/` for contracts and state schemas.
3. `client/js/browser/` for browser-app UI logic if reused in web shell.
4. `server/routes/browser-routes.js` for browser-specific APIs.

Exit criteria:

1. Host spike runs locally.
2. Repo layout approved.
3. Contracts list defined.

Estimated effort:
3 to 7 days.

### Phase 2 - Browser Core MVP

Goal:
Ship a real browser core that replaces the iframe limitation for the MVP path.

Steps:

1. Implement browser window creation and lifecycle.
2. Implement tab model and active-tab switching.
3. Implement address bar, navigation controls, reload, stop, and home.
4. Implement page title, favicon, loading state, and navigation events.
5. Implement basic history persistence.
6. Implement basic bookmarks persistence.
7. Implement download event handling and a visible download panel.
8. Implement blocked-popup and permission prompts.
9. Implement crash-safe session restore for open tabs.
10. Add a clean fallback path when embedded browsing fails.

Exit criteria:

1. Browser can navigate normal sites as a real browser surface.
2. Session survives restart at a basic level.
3. No dependency violates project licensing policy.

Estimated effort:
4 to 8 weeks.

### Phase 3 - NekoCore Shell Integration

Goal:
Make the browser feel native to the NekoCore desktop shell and runtime.

Steps:

1. Replace or retire the iframe-based browser app path for supported environments.
2. Add launch routing from the current shell into the new browser host.
3. Preserve taskbar, windowing, and app-launch patterns already established in the shell.
4. Add browser settings surfaces into Control Panel or Browser Settings.
5. Expose browser status to telemetry and task manager surfaces.
6. Add graceful shutdown hooks so browser state closes or restores predictably.
7. Keep unsupported environments on a clear fallback path.

Exit criteria:

1. Browser launches from the existing NekoCore UX.
2. Shutdown and restore behavior are predictable.
3. Existing shell conventions remain intact.

Estimated effort:
2 to 4 weeks.

### Phase 4 - Human Mode Completion

Goal:
Make the browser usable as a real daily driver before adding heavy AI behavior.

Steps:

1. Add multi-tab UX polish.
2. Add profile support and per-profile storage boundaries.
3. Add bookmark manager.
4. Add history manager with delete controls.
5. Add download manager.
6. Add site permissions UI.
7. Add search-engine settings and startup behavior settings.
8. Add import and export for bookmarks and settings where practical.
9. Add keyboard shortcuts and accessibility pass.

Exit criteria:

1. Human Mode works without any LLM dependency.
2. Storage and profile boundaries are clear.
3. Basic browser settings are manageable by the user.

Estimated effort:
4 to 8 weeks.

### Phase 5 - LLM Mode Foundation

Goal:
Layer safe AI features on top of the browser without compromising normal browsing.

Steps:

1. Add explicit mode switch between Human Mode and LLM Mode.
2. Add page summarization for the active page.
3. Add ask-this-page chat grounded only in visible page content and declared extracted content.
4. Add source citation and source preview in every browser-generated answer.
5. Add user confirmation for any write action.
   Examples: save notes, create memories, export snippets, run follow-up automation.
6. Add a browser research session model separate from normal chat.
7. Add structured extraction tools for tables, entities, links, and outlines.
8. Add domain-aware policies for whether page content may be stored persistently.
9. Add clear user controls for ephemeral analysis versus saved analysis.

Exit criteria:

1. LLM Mode is useful without being opaque.
2. Stored outputs are intentional and attributable.
3. User can understand what data the AI used.

Estimated effort:
4 to 8 weeks.

### Phase 6 - Agent Browser Actions and Safety Layer

Goal:
Support higher-power browser actions without turning the system into unsafe automation.

Steps:

1. Define browser action contracts.
   Examples: click, fill, open tab, extract, compare, save.
2. Add confirmation checkpoints for impactful actions.
3. Add allowlist and denylist policy hooks.
4. Add action log and audit trail per session.
5. Add rate limiting and runaway loop protection.
6. Add user-visible previews before multi-step execution.
7. Add scoped permissions for credentials, downloads, and file access.
8. Add a kill switch for active agent actions.

Exit criteria:

1. Agent actions are inspectable and stoppable.
2. Risky actions require explicit approval.
3. Audit logs are available for debugging and trust.

Estimated effort:
3 to 6 weeks.

### Phase 7 - Packaging, Distribution, and Community Readiness

Goal:
Make the browser safe to distribute, fork, and adopt commercially.

Steps:

1. Add release packaging for the supported target platforms.
2. Add third-party notices bundle to release artifacts.
3. Add browser-specific README and contributor guide.
4. Add architecture diagrams and public extension points.
5. Add automated tests for browser contracts, persistence, and action policy layers.
6. Add a compatibility matrix for supported platforms and fallback behavior.
7. Add issue templates for browser bugs, security reports, and extension requests.
8. Add sample integrations that show how downstream users can customize prompts and tools without modifying the core browser host.

Exit criteria:

1. Community can build and run the browser.
2. Commercial users can evaluate licensing and dependencies clearly.
3. Extension points are documented.

Estimated effort:
2 to 4 weeks for initial release hardening.

## Cross-Phase Guardrails

These checks apply in every implementation slice.

1. No new browser slice starts without updated docs and scope status.
2. New dependencies require license review before merge.
3. Browser host code must stay out of overloaded files.
4. Browser APIs belong in dedicated route and contract modules.
5. LLM features must be optional and disableable.
6. Persistent storage defaults must be conservative.
7. High-impact browser actions must be tested manually and logged in bug-test notes.

## Rough Delivery Shape

If executed in sequence by one strong contributor, a realistic Windows-first path is roughly:

1. Planning and spike: 1 to 2 weeks.
2. Core browser MVP: 1 to 2 months.
3. Shell integration and Human Mode polish: 1 to 2 months.
4. LLM Mode and safety systems: 1 to 2 months.

Total realistic path to a serious Windows-first NekoCore Browser:
3 to 6 months.

Cross-platform and production-grade polish would extend beyond that.

## Recommended Immediate Next Steps

1. Approve this roadmap direction and non-goals.
2. Decide whether to keep MIT as-is or introduce a DCO or CLA process for future contributors.
3. Start Phase 0 with governance and dependency rules.
4. Start Phase 1 with a Windows-only WebView2 spike in an isolated browser-host module.