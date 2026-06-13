# dashboard-improvements — Implementation Phase Plan Suggestions

Draft only: suggested phase/task/validation IDs for a future canonical plan. Do not treat this file as `plan.md` or plan JSONL.

## Inputs and trace basis

- Topic artifacts: `.plan/dashboard-improvements/proposal.md`, `requirements.md`, `requirements.nodes.jsonl`, `design.md`, `design.nodes.jsonl`, `map.nodes.jsonl`, `facts.nodes.jsonl`, `context-packs.jsonl`.
- Helper summaries also used for trace: `.plan/dashboard-improvements/requirements.edges.jsonl`, `.plan/dashboard-improvements/design.edges.jsonl`.
- Context packs used: `context-pack:dashboard-improvements:proposal`, `context-pack:dashboard-improvements:requirements-design`.
- Scope gate preserved: accepted path is `proposal -> requirements delta -> design -> plan -> implement -> fold accepted deltas into docs/requirements.md`; ADR readiness remains required unless an explicit skip rationale is approved.

## Ordered suggested phases

### phase:dash-01-route-shell — Route-owned dashboard pages and history

Goal: make the shared shell and primary sections route-owned before splitting every topic surface.

Suggested tasks:
- `task:dash-route-descriptors` — Define shared route/nav descriptors for `/`, `/topics`, `/topics/$topic`, and topic-section child routes.
- `task:dash-shell-links` — Convert shell navigation from `activeSection` buttons/`scrollIntoView` to TanStack `Link`/route matches and route-derived active state.
- `task:dash-route-defaults` — Ensure `/topics/$topic` has deterministic default content/redirect and preserves router scroll restoration/history.

Suggested validations:
- `validation:dash-route-direct` → `AC-DASH-NAV-ROUTES`.
- `validation:dash-history-active-nav` → `AC-DASH-HISTORY`.

Required trace/source refs: `REQ-DASH-NAV`, `REQ-DASH-STATE`, `SCN-DASH-HISTORY`, `DD-ROUTE-IA`, `DD-ROUTE-STATE`, `CMP-ROUTES`, `CMP-SHELL`; facts `F001`, `F005`, `F006`, `F011`; sources `file:dashboard/src/App.tsx`, `symbol:dashboard/src/App.tsx#DashboardShell:62`, `file:dashboard/src/routes/__root.tsx`, `file:dashboard/src/routes/index.tsx`, `file:dashboard/src/routes/topics/$topic.tsx`, `file:dashboard/src/router.tsx`, `file:tests/dashboard/client-shell.test.tsx`.

### phase:dash-02-topic-section-pages — Route-aware topic review surfaces

Goal: replace local topic tabs with addressable topic pages while reusing existing panels and data contracts.

Suggested tasks:
- `task:dash-topic-page-frame` — Extract reusable topic page frame/context from `TopicWorkspace` and keep selected topic from route params.
- `task:dash-documents-route` — Add `/topics/$topic/documents/$kind` for proposal, requirements, design, plan, and missing-artifact states; keep preview/source mode local unless later marked shareable.
- `task:dash-record-section-routes` — Add `/facts`, `/evidence`, `/receipts`, `/health` pages from existing topic artifact panels.
- `task:dash-graph-route` — Add `/graph` page reusing `GraphExplorer`; postpone graph query/filter/node search-param ownership until the graph route is stable.

Suggested validations:
- `validation:dash-topic-deeplinks` → `SCN-DASH-DEEPLINK`, `AC-DASH-NAV-ROUTES`.
- `validation:dash-topic-refresh-missing` → `REQ-DASH-TOPIC-SECTIONS`.
- `validation:dash-route-safety` → `AC-DASH-SAFETY`.

Required trace/source refs: `REQ-DASH-TOPIC-SECTIONS`, `REQ-DASH-STATE`, `REQ-DASH-SAFETY`, `DD-ROUTE-IA`, `DD-ROUTE-STATE`, `CMP-ROUTES`, `RISK-ROUTE-CHURN`; facts `F002`, `F004`, `F005`, `F006`, `F012`; sources `file:dashboard/src/features/review-workflow.tsx`, `symbol:dashboard/src/features/review-workflow.tsx#TopicWorkspace:132`, `file:dashboard/src/features/document-viewer.tsx`, `file:dashboard/src/features/graph-explorer.tsx`, `file:dashboard/src/lib/dashboard-db.ts`, `file:dashboard/src/lib/api.ts`, `file:dashboard/src/shared/models.ts`, `file:tests/dashboard/topic-pages.test.tsx`, `file:tests/dashboard/graph-explorer.test.tsx`.

### phase:dash-03-markdown-reference-popovers — Themed reference hover/focus details

Goal: replace native `title` reference descriptions with themed, keyboard-accessible popovers while preserving safe links and existing data attributes.

Suggested tasks:
- `task:dash-reference-popover-link` — Introduce `ReferencePopoverLink` in the Markdown anchor override for resolved/missing Cartographer references only.
- `task:dash-reference-attrs-safety` — Preserve `href`, `target`, `rel`, `data-reference`, `data-reference-status`, `data-reference-kind`; remove reference-description `title` attributes.
- `task:dash-reference-popover-theme` — Use existing tooltip/popover tokens first; add Hover Card only if Tooltip cannot satisfy richer hover/focus content.
- `task:dash-reference-tests` — Update Markdown tests for hover/focus content, missing refs, blocked/private paths, and ordinary link behavior.

Suggested validations:
- `validation:dash-reference-popover` → `AC-MD-REF-POPOVER`, `SCN-MD-REFERENCE`.
- `validation:dash-reference-safety` → `AC-DASH-SAFETY`.

Required trace/source refs: `REQ-MD-REF-POPOVER`, `REQ-DASH-SAFETY`, `DD-MD-REF-POPOVER`, `CMP-REFERENCE-POPOVER`; facts `F003`, `F007`, `F008`, `F009`, `F010`; sources `file:dashboard/src/lib/markdown.tsx`, `symbol:dashboard/src/lib/markdown.tsx#MarkdownPreview:200`, `file:dashboard/src/lib/reference-resolver.ts`, `file:dashboard/src/components/ui/tooltip.tsx`, `file:dashboard/src/styles/globals.css`, `file:tests/dashboard/markdown-viewer.test.tsx`.

### phase:dash-04-official-mermaid-rendering — Complete Mermaid diagram support

Goal: render `mermaid` code fences through the official Mermaid renderer and validate the current diagram registry rather than adding a partial parser.

Suggested tasks:
- `task:dash-mermaid-dependency` — Declare/verify the official `mermaid` package and lazy/client-safe import path.
- `task:dash-mermaid-component` — Add `MermaidDiagram` with one-time initialization, themed responsive SVG output, loading state, and per-diagram error fallback.
- `task:dash-mermaid-code-fence` — Route only `language-mermaid` fences to Mermaid; keep Shiki/plain fallback for other code and SSR-safe rendering.
- `task:dash-mermaid-security` — Implement explicit feature-compatible security/isolation policy; do not execute arbitrary callbacks in app context.
- `task:dash-mermaid-corpus` — Add representative samples for C4, flowchart, ER, git graph, gantt, info, pie, quadrant, xy chart, requirement, sequence, class, state, journey, timeline, mindmap, kanban, sankey, packet, radar, block, architecture, and treemap.

Suggested validations:
- `validation:dash-mermaid-registry` → `AC-MD-MERMAID-REGISTRY`, `SCN-MD-MERMAID`.
- `validation:dash-mermaid-invalid-fallback` → invalid diagram does not break the document.
- `validation:dash-mermaid-safety` → `AC-DASH-SAFETY`.

Required trace/source refs: `REQ-MD-MERMAID`, `REQ-DASH-SAFETY`, `DD-MERMAID-OFFICIAL`, `CMP-MERMAID-DIAGRAM`, `CMP-TEST-CORPUS`, `RISK-MERMAID-SECURITY`; facts `F013`, `F014`, `F015`; sources `file:dashboard/src/lib/markdown.tsx`, `dependency:npm:mermaid`, `package.json`, `file:tests/dashboard/markdown-viewer.test.tsx`.

### phase:dash-05-usability-polish — Route clarity, accessibility, and responsive finish

Goal: polish the navigable app feel after routes, topic pages, popovers, and Mermaid are functionally in place.

Suggested tasks:
- `task:dash-route-ux-copy` — Add/adjust headings, breadcrumbs or page labels, active nav indicators, and empty/missing states per route.
- `task:dash-focus-responsive` — Verify skip link, focus rings, keyboard order, popover focus behavior, responsive sidebar/topic nav, graph/static fallback, and reduced-motion behavior.
- `task:dash-loading-error-states` — Make route loading/API failure/private-safe states clear without adding write paths.

Suggested validations:
- `validation:dash-usability-keyboard` → keyboard/focus and popover accessibility smoke.
- `validation:dash-responsive-smoke` → responsive dashboard shell/topic pages.
- `validation:dash-readonly-private-smoke` → `AC-DASH-SAFETY`.

Required trace/source refs: `REQ-DASH-VALIDATION`, `REQ-DASH-SAFETY`, `DD-VALIDATION-GATES`, `CMP-SHELL`, `CMP-REFERENCE-POPOVER`, `CMP-MERMAID-DIAGRAM`; facts `F009`, `F010`, `F011`; sources `file:dashboard/src/App.tsx`, `file:dashboard/src/styles/globals.css`, `file:dashboard/src/features/document-viewer.tsx`, `file:dashboard/src/features/graph-explorer.tsx`, `file:tests/dashboard/client-shell.test.tsx`.

### phase:dash-06-validation-docs-adr-readiness — Final gates, requirements fold, ADR package

Goal: prove the implementation, then prepare durable documentation/ADR artifacts without hand-mutating canonical receipts.

Suggested tasks:
- `task:dash-validation-matrix` — Run/update route browser tests, topic page tests, Markdown popover tests, Mermaid corpus tests, safety tests, type/lint/build checks.
- `task:dash-requirements-fold` — After validation, fold accepted topic-local requirements into `docs/requirements.md` or record an approved skip rationale.
- `task:dash-adr-readiness` — Prepare ADR content or explicit ADR skip rationale covering route-owned navigation, Mermaid security/isolation, and relationship to ADR-0005.
- `task:dash-trace-review` — Verify all accepted requirements/design nodes have validation evidence and no private-path exposure.

Suggested validations:
- `validation:dash-final-test-suite` → `REQ-DASH-VALIDATION`.
- `validation:dash-requirements-fold-ready` → folds-into edges for `REQ-DASH-*` / `REQ-MD-*`.
- `validation:dash-adr-ready` → proposal ADR metadata and `doc:docs/adr/0005-use-tanstack-start-and-tanstack-db-for-the-cartographer-dashboard.md`.

Required trace/source refs: `REQ-DASH-VALIDATION`, all acceptance checks `AC-DASH-NAV-ROUTES`, `AC-DASH-HISTORY`, `AC-MD-REF-POPOVER`, `AC-MD-MERMAID-REGISTRY`, `AC-DASH-SAFETY`; `DD-VALIDATION-GATES`; facts `F010`, `F011`, `F013`, `F015`; sources `doc:docs/adr/0005-use-tanstack-start-and-tanstack-db-for-the-cartographer-dashboard.md`, `docs/requirements.md#REQ-DASH-NAV`, `docs/requirements.md#REQ-DASH-STATE`, `docs/requirements.md#REQ-DASH-TOPIC-SECTIONS`, `docs/requirements.md#REQ-MD-REF-POPOVER`, `docs/requirements.md#REQ-MD-MERMAID`, `docs/requirements.md#REQ-DASH-SAFETY`, `docs/requirements.md#REQ-DASH-VALIDATION`, `package.json`.

## Suggested validation commands after implementation

- `npm run typecheck`
- `npm run lint:ts`
- `npm run test:browser -- tests/dashboard/client-shell.test.tsx`
- `npx vitest run tests/dashboard/topic-pages.test.tsx tests/dashboard/markdown-viewer.test.tsx tests/dashboard/graph-explorer.test.tsx`
- `npm run dashboard:build`
- Final/full gate when ready: `npm run check`

## Unresolved questions

None blocking for planning. Non-blocking decisions to confirm during implementation/ADR: exact route default behavior for `/topics/$topic`, Tooltip vs Hover Card for rich reference content, and Mermaid security/isolation configuration that preserves documented feature support while maintaining dashboard safety.
