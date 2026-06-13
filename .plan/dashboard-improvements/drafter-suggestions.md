# dashboard-improvements drafter suggestions

Scope: proposal drafting suggestions only. No source/proposal files were edited; this note is a suggested companion draft.

## Inputs reviewed

- Proposal/artifacts: `.plan/dashboard-improvements/proposal.md`, `map.nodes.jsonl`, `map.edges.jsonl`, `facts.nodes.jsonl`, `facts.edges.jsonl`.
- Targeted files from the map: `dashboard/src/App.tsx`, `dashboard/src/features/review-workflow.tsx`, `dashboard/src/lib/markdown.tsx`, `dashboard/src/features/document-viewer.tsx`, `dashboard/src/routes/index.tsx`, `dashboard/src/routes/topics/$topic.tsx`, `dashboard/src/router.tsx`, `dashboard/src/components/ui/tooltip.tsx`, `dashboard/src/styles/globals.css`.
- Validation script reference: `package.json` scripts. No private artifacts were read.

## Suggested proposal framing

### Problem Statement

The Planning Dashboard currently behaves like one long review report: the sidebar changes React state and scrolls to sections rather than navigating to browser-history-backed pages [F001]. Topic content then adds another layer of local tabs for proposal, plan, facts, evidence, receipts, health, and graph [F002]. For reviewers, this makes common workflows harder than they need to be: pages cannot be reliably bookmarked or shared, Back/Forward does not mean “previous dashboard view,” and refreshing or opening a link cannot restore the exact section under review. The proposal should frame the page split as a user-facing review-flow improvement, not just a router cleanup.

### Goals

- Make dashboard sections addressable as separate pages/routes so Overview, Topics, topic documents, evidence/receipts/health, and Graph can be opened, shared, refreshed, and revisited through browser history [F001, F002, F005].
- Use the existing TanStack Router/Start stack and typed navigation rather than adding a second routing model [F005, F006, F011].
- Preserve the current read-only dashboard data contracts and reusable panels where possible; shared models/API already expose topic artifacts, documents, graph, files, ADRs, and overview surfaces [F012].
- Replace native Markdown reference `title` tooltips with a dashboard-themed hover/focus popover for evidence/reference context [F003, F007, F008, F009].
- Keep styling changes focused on navigation clarity, responsive behavior, focus visibility, and themed popover consistency [F009, F010].

### Non-goals / boundaries

- Do not redesign the backend API or introduce writable dashboard behavior; align with ADR-0005’s read-only TanStack Start/TanStack DB direction [F011, F012].
- Do not add a new router or markdown renderer; extend the current TanStack Router and `react-markdown` customization paths [F005, F007].
- Do not make every piece of component micro-state routable by default. Document preview/source mode and graph filters can be evaluated in design; the proposal should commit first to page-level navigability [F004, F006].
- Do not place detailed route-tree/component architecture in proposal `## Design`; reserve it for `design.md` and design graph artifacts.

## Browser-history / TanStack Router scope

Recommended proposal scope: convert primary dashboard navigation from button-driven scroll state to route-owned navigation. The current `/` and `/topics/$topic` routes already exist, and router scroll restoration is enabled [F005]. The proposal should say the implementation will extend those routes so the visible dashboard section is encoded in route params/path and, where appropriate, search params. Sidebar and topic-section controls should become links or router navigations that create browser-history entries instead of only calling `scrollIntoView` [F001, F006].

Design can decide the exact route shape, but proposal scope should cover these user outcomes:

- direct links to overview/topics/topic document views/graph;
- Back/Forward restores the previous dashboard page;
- refresh/deep-link loads the same topic/section;
- active navigation state derives from the current route;
- no separate routing dependency is introduced [F005, F011].

## Markdown evidence reference popover scope

Current Markdown reference links are resolved in `MarkdownPreview`, but reference descriptions are exposed through the browser-native `title` tooltip [F003]. The proposal should scope a replacement that wraps resolved/missing Cartographer reference links in an accessible themed hover/focus popover while preserving safe href behavior and existing `data-reference` attributes [F003, F007, F010].

Recommended scope details:

- Use the existing `react-markdown` anchor override path for reference-specific rendering [F007].
- Use or extend the existing Radix tooltip/popover styling foundation, with `bg-popover` / `text-popover-foreground` theme tokens [F008, F009].
- Show concise reference context: label/status, source label, path/href, and missing-reference message when applicable.
- Support keyboard focus as well as hover; avoid relying on native `title`, which is not themeable and can conflict with custom UI [F003, F008].
- Keep private/outside-root protections unchanged.

## Usability / styling review findings

- The shell already includes useful accessibility/styling foundations: skip link, visible focus classes, live-status tooltip, responsive sidebar, and theme tokens. The proposal should preserve these while changing navigation semantics.
- The largest usability issue is semantic mismatch: sidebar items look like navigation but are buttons that scroll within one page [F001]. Route-owned links would better match user expectations.
- Topic tabs hide important review surfaces behind local state [F002]. If each major topic surface becomes routable, tabs can remain as presentation but should reflect route state.
- The Markdown popover should render through a portal or otherwise avoid clipping, because `.markdown-preview` currently uses containment/overflow rules in `globals.css` [F009].
- Document preview/source mode is local state today [F004]. Treat it as a secondary design question unless users explicitly need shareable source-line URLs.
- Regression coverage needs to move from “click button and active tab changes” toward route/deep-link/Back/Forward behavior plus themed reference hover/focus behavior [F010].

## Scope Gate recommendation

Drafting recommendation: gate this as a scoped core dashboard workflow change, not as minor polish. The proposal should explicitly include route-owned page navigation, evidence-reference popovers, and targeted usability/test updates. It should defer detailed route tree, data-loading strategy, and component decomposition to `design.md`. ADR metadata already marks an ADR as required; keep that as “evaluate now, write after validated planning/implementation” unless the parent decides otherwise.

## Next artifact recommendation

After the proposal text is filled and approved, produce:

1. `requirements.md` plus requirements graph records for user-visible navigation/history/popover behavior.
2. `design.md` plus design graph records for the TanStack route shape, shell/page decomposition, reference popover component, and test strategy.
3. `plan.md` phases/tasks with stable validation IDs.
4. ADR options/follow-up ADR after validation, aligned with ADR-0005 [F011].

## Unresolved questions for parent/product decision

- Should every topic tab become a distinct page, or only the top-level dashboard sections plus Graph?
- Should document preview/source mode and source line anchors be URL-addressable?
- What should the default topic route do when no topic is selected or the route topic is missing?
- Should graph filters/selected inspector node live in search params?
- Should evidence reference UI be a lightweight tooltip or a richer hover card with more content?

## Validation commands to run after implementation

- `npm run typecheck`
- `npm run test:browser -- tests/dashboard/client-shell.test.tsx`
- `npx vitest run tests/dashboard/topic-pages.test.tsx tests/dashboard/markdown-viewer.test.tsx tests/dashboard/graph-explorer.test.tsx`
- `npm run dashboard:build`
