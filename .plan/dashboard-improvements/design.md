# dashboard-improvements Design

## Source and Decision Status

This topic-local design implements the accepted `dashboard-improvements` proposal and requirements delta. It is intentionally scoped to navigation, Markdown reference popovers, Mermaid rendering, usability polish, safety, and validation. It does not implement code.

## Route-Owned Information Architecture

Accept route-owned pages as the primary dashboard information architecture. The root layout should keep shared chrome, read-only/live status, and global navigation stable while page content renders through TanStack Router routes. The route set should include a dashboard overview, topic index, and topic-scoped pages for summary/document views, facts, evidence, receipts, health, and graph. `/topics/$topic` should resolve to a predictable default topic page instead of leaving the user in a hidden tab state.

Recommended route shape for implementation:

- `/` — overview/home metrics and recent health.
- `/topics` — topic index/list.
- `/topics/$topic` — topic summary/default page, with deterministic redirect or content to the default review surface.
- `/topics/$topic/documents/$kind` — proposal, requirements, design, plan, and other document-like topic artifacts when present.
- `/topics/$topic/facts` — fact/source list and linked detail targets.
- `/topics/$topic/evidence` — sanitized evidence summaries and files.
- `/topics/$topic/receipts` — receipt/validation history.
- `/topics/$topic/health` — topic health and warnings.
- `/topics/$topic/graph` — topic graph explorer.

This route shape satisfies [REQ-DASH-NAV], [REQ-DASH-TOPIC-SECTIONS], and [SCN-DASH-DEEPLINK].

## Browser History State Boundary

Use TanStack Router path params for topic and page identity, and search params only for route-visible secondary content state. Primary content navigation must not depend on `activeSection`, `selectedTab`, or `scrollIntoView`. Active sidebar/topic navigation should derive from route matches. Document preview/source mode may remain local unless design during implementation identifies it as shareable content navigation. Graph filters, search query, selected node, and source line anchors should be migrated to search/hash state only after the graph page route is stable and tests can assert round-trip behavior.

This boundary satisfies [REQ-DASH-STATE], [SCN-DASH-HISTORY], and [AC-DASH-HISTORY] while limiting scope creep.

## Markdown Reference Popover

Introduce a `ReferencePopoverLink` or similarly named component in the Markdown rendering path. The component should be used only for resolved/missing Cartographer references; ordinary external/local links keep existing safe-link behavior. The component should preserve `href`, `target`, `rel`, `data-reference`, `data-reference-status`, and `data-reference-kind`, but remove native reference-description `title` attributes. It should render a themed hover/focus popover with reference label, status, source label, safe path/href, and missing-reference message when applicable.

Use the existing `react-markdown` custom anchor override unless implementation proves a different Markdown renderer is necessary for Mermaid support. Prefer existing Radix/Tailwind theme primitives first, and only add a new Radix hover-card/popover dependency if existing Tooltip semantics cannot satisfy hover/focus and content needs.

This design satisfies [REQ-MD-REF-POPOVER], [SCN-MD-REFERENCE], and [AC-MD-REF-POPOVER].

## Official Mermaid Renderer

Add first-class Mermaid rendering for Markdown code fences with language `mermaid`. The implementation should use the official `mermaid` package/renderer and its registry rather than parsing or whitelisting diagram types manually. Mermaid should be loaded lazily or isolated so ordinary Markdown pages do not pay unnecessary cost. Rendering should produce themed, responsive SVG with clear loading and error states; invalid Mermaid source must not break the whole document.

The implementation must validate representative diagrams across Mermaid's current registry: C4, flowchart, ER, git graph, gantt, info, pie, quadrant, xy chart, requirement, sequence, class, state, journey, timeline, mindmap, kanban, sankey, packet, radar, block, architecture, and treemap. If Mermaid adds/removes registered diagram families, tests should be structured so the corpus can be updated intentionally rather than silently losing support.

Mermaid security must be explicit. Requirements call for full feature support, so the design should avoid Mermaid settings that silently disable expected features such as HTML labels, diagram links, or supported diagram syntax. If full feature support requires a permissive Mermaid security level, render in a local isolation boundary or otherwise constrain unsafe script/path effects while preserving Mermaid's documented features.

This design satisfies [REQ-MD-MERMAID], [SCN-MD-MERMAID], and [AC-MD-MERMAID-REGISTRY].

## Validation and Quality Gates

Tests should be updated in layers:

1. Router/browser tests for direct dashboard routes, topic routes, active nav state, refresh, and Back/Forward behavior.
2. Topic page tests ensuring all route pages render reusable panels and missing-artifact states.
3. Markdown viewer tests verifying reference popovers, absence of native reference title behavior, safe href handling, and keyboard focus behavior.
4. Mermaid tests covering a representative current registry corpus plus invalid source fallback.
5. Existing safety/privacy tests proving route params, Markdown references, Mermaid content, and file reads do not expose forbidden paths or writes.
6. Build/type/lint checks covering the added route files, dependency changes, and client-only Mermaid behavior.

This design satisfies [REQ-DASH-VALIDATION] and [AC-DASH-SAFETY].

## Rejected Alternatives

### Keep one giant page and improve only scroll offsets

Rejected because it leaves browser Back/Forward, refresh, direct links, and active navigation disconnected from what the user is reviewing. It does not satisfy [REQ-DASH-NAV] or [REQ-DASH-STATE].

### Render only common Mermaid diagrams

Rejected because the user explicitly requires all current Mermaid diagram types and features. Partial diagram support would fail [REQ-MD-MERMAID].

### Execute arbitrary Mermaid callbacks in the dashboard app context

Rejected as unsafe for a local read-only planning dashboard. Feature-compatible Mermaid rendering should support documented diagram syntax and safe link behavior without allowing diagram text to mutate the dashboard or escape safety boundaries.

## Risks and Mitigations

- **Route churn:** splitting the page can create many route files and duplicated loading logic. Mitigate with shared route descriptors, reusable panels, and existing TanStack DB collection hooks.
- **Deep-link regressions:** route defaults and missing-topic behavior can be inconsistent. Mitigate with explicit default routes, missing-artifact cards, and browser tests.
- **Popover clipping or inaccessible hover behavior:** Markdown preview containment and portals can interact poorly. Mitigate with a portal-backed themed component and keyboard focus tests.
- **Mermaid bundle/runtime weight:** Mermaid can be heavy. Mitigate with lazy loading, per-diagram loading state, and preserving plain code fallback during SSR.
- **Mermaid security/feature tension:** permissive settings may enable features but increase risk. Mitigate with explicit security design, local isolation, and tests for links/HTML labels without arbitrary dashboard mutation.
- **Requirement fold debt:** topic-local requirements must later fold into durable docs. Mitigate with a final implementation phase that runs requirements fold or records an approved skip receipt.
