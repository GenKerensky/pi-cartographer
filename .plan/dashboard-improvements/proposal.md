# dashboard-improvements Proposal

## Description

Improve the local Pi Cartographer planning dashboard so it behaves like a navigable application instead of a single long review page. The main dashboard sections should become separate pages/routes with browser-history-backed navigation, deep links, refresh-safe state, and active navigation derived from the current route. Topic content such as documents, facts, evidence, receipts, health, and graph views should be easier to open, share, revisit, and understand without losing the current topic context [F001] [F002] [F005].

Also improve the Markdown reader so Cartographer evidence/reference links no longer rely on the browser's native `title` tooltip. Hovering or keyboard-focusing a resolved or missing reference should show a themed dashboard popover with the reference description/status/source/path while preserving safe link behavior, existing reference data attributes, and private-path protections [F003] [F007] [F008] [F009]. Mermaid code fences should render correctly through the official Mermaid renderer, supporting all current Mermaid diagram types and features rather than a hand-written subset [F013] [F014] [F015].

The proposal covers a thorough dashboard UX review: navigation semantics, route ownership, topic workspace structure, document reading, graph discoverability, responsive styling, focus/accessibility affordances, and regression tests. It should preserve the accepted TanStack Start/TanStack Router/TanStack DB read-only architecture rather than introducing a new app framework or writable dashboard behavior [F011] [F012].

## Problem Statement

The dashboard already exposes useful planning data, but its navigation model does not match user expectations for a browser application. Sidebar items look like page navigation, yet the shell keeps `activeSection` in React state and scrolls to in-page anchors. The result is a giant page where Back/Forward, refresh, copied URLs, and shared links do not reliably represent the visible dashboard section [F001].

Topic review compounds that problem. A topic workspace is embedded below overview/topics content and hides proposal, plan, facts, evidence, receipts, health, and graph behind local tab state. A reviewer cannot easily link a teammate or future self directly to the evidence page, receipt list, health panel, or graph view for a topic [F002].

Markdown reference links are functional but visually underpowered. The renderer resolves Cartographer references, but reference context is exposed through a native `title` tooltip, which is not themeable, not consistently accessible, and does not match the dashboard's tactile UI system [F003] [F009]. Mermaid diagrams also need first-class handling: users expect Markdown diagram fences to render as diagrams, and partial support for only flowcharts or a small whitelist would fail the dashboard's documentation-review role [F013] [F014].

## Goals

1. Make primary dashboard sections separate route-owned pages instead of button-driven scroll targets [F001].
2. Make topic-level content navigation browser-history-backed so direct links, refresh, and Back/Forward restore the intended topic page/section [F002] [F005].
3. Use the existing TanStack Router/Start stack, typed route params, and search parameters where useful; do not add a second routing system [F005] [F006] [F011].
4. Preserve existing read-only API/model/data contracts and reusable UI panels wherever possible [F011] [F012].
5. Replace native Markdown reference `title` tooltips with a themed hover/focus popover for evidence/reference descriptions [F003] [F007] [F008] [F009].
6. Render Mermaid code fences through the official Mermaid renderer, with coverage for all current Mermaid diagram types/features exposed by Mermaid rather than a custom partial parser [F013] [F014] [F015].
7. Improve navigation clarity, styling polish, responsive behavior, keyboard focus behavior, and route-visible active states across the dashboard [F009] [F010].
8. Update dashboard tests to validate deep links, route transitions, Back/Forward behavior, refresh-safe topic pages, Markdown popover behavior, and Mermaid rendering across the current diagram registry [F010] [F013].

## Non-Goals

- Do not make the dashboard writable or add artifact/source editing.
- Do not redesign the backend artifact reader/API surface unless routing reveals a narrow compatibility gap [F012].
- Do not replace TanStack Start, TanStack Router, TanStack DB/Query, or the existing shadcn/Radix/Tailwind styling foundation [F005] [F009] [F011]. The Markdown rendering library may be swapped only if design/validation shows it is necessary for complete Mermaid support or safer integration; Mermaid itself should still be rendered by the official Mermaid renderer [F013] [F014] [F015].
- Do not make every micro-interaction routable by default. Document preview/source mode, graph filters, and selected inspector nodes should be evaluated in requirements/design before deciding whether they belong in search params [F004] [F006].
- Do not expose raw private planning inputs, outside-root files, or unsafe Markdown/file links.
- Do not place detailed route-tree architecture in the proposal; route shape and component decomposition belong in downstream design artifacts.

## Background

The dashboard is already partway toward routable behavior. It has TanStack route files for `/` and `/topics/$topic`, uses route params for topic selection, and enables router scroll restoration [F005]. However, the shell still owns the visible section in React state and scrolls within the page, so page-level navigation is not yet owned by the router [F001].

The topic workspace currently centralizes proposal, plan, facts, evidence, receipts, health, and graph views behind a local tab state [F002]. Those panels are valuable and should be reused, but the content architecture should evolve so major surfaces are pages, not hidden fragments of one long page. The shared models and API wrappers already expose topic artifacts, documents, graph data, files, ADRs, and overview resources, so the page split can likely reuse existing data contracts instead of inventing a parallel backend [F012].

The Markdown renderer is similarly well-positioned for improvement. `react-markdown` supports custom renderers for anchors and other elements, and the dashboard already uses a custom anchor renderer for Cartographer references [F007]. Radix Tooltip/Hover Card primitives support accessible hover/focus disclosure around anchor triggers, and the dashboard already has themed popover tokens and a Tooltip wrapper [F008] [F009]. Mermaid's official registry covers a broad set of diagram families, and Mermaid exposes initialization/render APIs for producing SVG from diagram text; dashboard support should therefore integrate Mermaid directly rather than parsing only selected diagram types [F013] [F014]. Mermaid feature support is also tied to explicit security-level configuration, so requirements/design must choose a secure rendering approach that does not silently disable expected features such as HTML labels or diagram links [F015].

### Dashboard review findings

- Navigation affordances are misleading today: sidebar controls look like page navigation but are implemented as buttons plus `scrollIntoView` [F001].
- Topic tabs hide important review surfaces behind local state, which makes evidence, receipts, health, and graph views harder to bookmark or revisit [F002].
- Native `title` tooltips are the wrong presentation layer for evidence context because they cannot match the dashboard theme and provide limited content control [F003].
- Mermaid support should not be reduced to flowchart-only rendering; the dashboard should use Mermaid's official renderer and validate representative diagrams from the current registry [F013] [F014].
- The shell already has useful foundations to preserve: skip link, live status badge, focus ring utilities, read-only messaging, responsive layout, and tactile dark tokens [F009].
- Tests currently assert stateful nav/tab behavior and Markdown reference attributes; they should shift toward route/deep-link/history and themed popover assertions [F010].

## Viability

This is viable as a scoped dashboard UX/navigation change. The existing stack already includes the necessary building blocks: TanStack Router routes and scroll restoration [F005], typed Link/navigation support for params and search values [F006], reusable topic/document/graph panels [F002] [F004], read-only model/API contracts [F012], a customizable Markdown renderer [F007], themed Radix/Tailwind primitives [F008] [F009], and an official Mermaid renderer that can be initialized and asked to render diagram text to SVG [F014].

The main implementation risk is scope creep. A route-owned dashboard can grow quickly if every tab, source line, graph filter, and inspector selection becomes a URL contract at once. The proposal should require page-level route ownership first, then let requirements/design decide which secondary states are worth encoding in search params [F004] [F006].

Another risk is regression in the dashboard's read-only/private-safe guarantees. This proposal should preserve ADR-0005's guidance: TanStack DB remains a read-only projection over planning artifacts, and dashboard changes should target TanStack Start routes/server helpers without reintroducing an alternate runtime or writable API [F011].

The Markdown popover work is also feasible. The current anchor renderer already knows whether a link is a Cartographer reference and has resolved reference metadata available [F003]. Replacing native `title` with a themed hover/focus component can preserve link hrefs and existing `data-reference` attributes while showing richer context [F007] [F008] [F009] [F010]. Mermaid rendering is feasible if the implementation treats Mermaid as a first-class renderer dependency, lazy-loads or isolates it as needed, and validates every currently registered diagram family rather than only the common flowchart path [F013] [F014]. The main Mermaid-specific risk is balancing complete feature support with dashboard safety because Mermaid security levels affect HTML labels, click events, and sandboxing; that tradeoff must be explicit in requirements/design [F015].

## ADR Metadata

- `adr_required`: true
- `adr_reason`: This changes durable dashboard navigation behavior from in-page React-state scrolling/tabs to browser-history-backed routed pages and adds first-class Mermaid rendering/security behavior to the Markdown reader, so it should be recorded as an architectural/product workflow decision aligned with ADR-0005 [F001] [F002] [F011] [F013] [F015].
- `adr_options_status`: missing; downstream requirements/design or the final ADR should compare at least preserving the current one-page state model, route-per-major-section pages, mixed route-plus-search-param state for secondary selections, and Markdown rendering options for complete Mermaid support.
- `adr_tool_mode`: evaluate-now-write-after-validation

## Scope Gate

- `requirements_required`: true
- `requirements_reason`: This changes a core user workflow in the planning dashboard: how users navigate, bookmark, refresh, and share dashboard content. It also introduces accessibility-visible Markdown reference interactions and first-class Mermaid diagram rendering. A requirements delta and design artifact are needed before implementation so route behavior, default pages, Back/Forward semantics, popover behavior, Mermaid feature/security behavior, and test obligations are explicit.

## Next Artifacts

Use the scoped path: `proposal -> requirements delta -> design -> plan -> implement -> fold accepted deltas into docs/requirements.md`.

The requirements delta should specify user-visible navigation/history behavior, topic-section page expectations, fallback/default routes, evidence-reference popover behavior, keyboard/focus behavior, Mermaid diagram rendering expectations for all current diagram types/features, and privacy/read-only constraints. The design artifact should choose route shapes, component decomposition, search-param ownership, popover primitive, Mermaid renderer/security configuration, Markdown-library retention or replacement, and test strategy without moving those details back into this proposal.

Because `adr_required` is true, final validated planning or implementation should also generate an ADR (or an explicit ADR skip rationale) that records the durable dashboard navigation decision and its relationship to ADR-0005.


## Design
