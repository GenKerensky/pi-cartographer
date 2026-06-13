# dashboard-improvements Requirements Delta

## Source and Status

- Source proposal: `.plan/dashboard-improvements/proposal.md`
- Status: accepted proposal; user approved moving to planning.
- Scope: topic-local requirements delta for dashboard navigation, Markdown reference popovers, and Mermaid rendering.
- Durable fold target after implementation: `docs/requirements.md`.

## Requirements

### REQ-DASH-NAV — Route-owned dashboard navigation

The dashboard MUST expose primary dashboard sections as browser-history-backed pages/routes instead of button-only controls that mutate React section state and scroll one long page [REQ-DASH-NAV]. Users MUST be able to deep-link, refresh, and use Back/Forward for overview, topic index, selected topic, topic document sections, topic graph, evidence, receipts, and health views.

### REQ-DASH-STATE — Route-derived active content state

The dashboard MUST derive selected topic, active major section, active document kind, and route-visible navigation state from TanStack Router path/search state rather than component-only section/tab state [REQ-DASH-STATE]. Secondary state such as document preview/source mode, graph filters, selected graph node, and source line anchors SHOULD be assigned to search params or hash state only when the design marks that state as content navigation rather than ephemeral UI control.

### REQ-DASH-TOPIC-SECTIONS — Addressable topic review surfaces

Each major topic review surface MUST be addressable without requiring users to scroll through unrelated content [REQ-DASH-TOPIC-SECTIONS]. Proposal, plan, requirements/design when present, facts, evidence, receipts, health, and graph views MUST preserve selected topic context and provide sensible missing-artifact states.

### REQ-MD-REF-POPOVER — Themed evidence/reference popovers

Rendered Markdown reference links MUST show a themed dashboard hover/focus popover with resolved or missing reference details instead of relying on the native browser `title` tooltip [REQ-MD-REF-POPOVER]. The popover MUST preserve safe href behavior, existing `data-reference` attributes used by tests, keyboard focus access, and read-only/private-safe link handling.

### REQ-MD-MERMAID — Complete Mermaid rendering

Rendered Markdown MUST render `mermaid` code fences through the official Mermaid renderer, supporting all current Mermaid diagram types and features exposed by Mermaid rather than a hand-written subset [REQ-MD-MERMAID]. Requirements/design MUST define a security configuration or isolation approach that preserves feature support while protecting the local read-only dashboard from unsafe script/path behavior.

### REQ-DASH-SAFETY — Preserve read-only and private-safe guarantees

Dashboard navigation, Markdown reference popovers, and Mermaid rendering MUST remain read-only and MUST NOT expose raw private planning inputs, outside-root files, unsafe file URLs, or dashboard mutation paths [REQ-DASH-SAFETY].

### REQ-DASH-VALIDATION — Regression coverage for navigation and Markdown UX

Implementation MUST add or update tests for route deep links, Back/Forward behavior, refresh-safe topic pages, active route state, Markdown reference popovers, Mermaid rendering across the current Mermaid diagram registry, type safety, and dashboard build/runtime behavior [REQ-DASH-VALIDATION].

## Scenarios

### SCN-DASH-DEEPLINK — Reviewer opens a topic graph directly

Given a reviewer receives a link to a topic graph page, when they open or refresh it, then the dashboard loads the same topic graph without requiring navigation through overview and topic tabs.

### SCN-DASH-HISTORY — Back and Forward restore previous dashboard pages

Given a reviewer navigates from overview to topic evidence and then graph, when they use browser Back/Forward, then each previous dashboard page and topic context is restored.

### SCN-MD-REFERENCE — Keyboard user inspects an evidence reference

Given a keyboard user focuses a Markdown evidence/reference link, when the link receives focus, then the themed popover exposes the reference label/status/source/path or missing-reference message without relying on native title text.

### SCN-MD-MERMAID — Documentation page contains multiple Mermaid diagram types

Given a proposal, design, or plan contains Mermaid fences for current Mermaid diagram types, when the dashboard renders the Markdown preview, then each valid diagram renders through Mermaid or reports a clear per-diagram error without breaking the document.

## Acceptance Checks

- **AC-DASH-NAV-ROUTES:** Navigate to every major dashboard/topic route directly and verify the correct content is shown without in-page scroll setup.
- **AC-DASH-HISTORY:** In a browser test, navigate across at least three dashboard pages and verify Back/Forward restores each route and active nav state.
- **AC-MD-REF-POPOVER:** Render a Markdown document with resolved and missing references, verify no native `title` attribute is used for reference context, and verify themed popover content appears on hover/focus.
- **AC-MD-MERMAID-REGISTRY:** Render a representative Mermaid corpus covering the current official diagram registry and verify SVG output or a clear error state per invalid sample.
- **AC-DASH-SAFETY:** Verify private/outside-root path blocking still passes for files, references, Mermaid content, and route params.
