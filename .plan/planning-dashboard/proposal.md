# planning-dashboard Proposal

## Description

Add a local, read-only web dashboard for Pi Cartographer planning files. The dashboard should be started by an installed `cartographer-dashboard` CLI, and a new packaged Pi skill should invoke that installed CLI for the user. The dashboard turns existing `.plan/` artifacts into browsable overview metrics, topic pages, rendered documents, code views, and graph exploration without replacing the filesystem artifacts as the source of truth.

The first version should have three product surfaces:

- **Installed CLI:** `cartographer-dashboard start|status|stop`, rooted at the current repository by default.
- **Pi skill:** `/skill:dashboard` that runs the installed CLI, opens the dashboard, and reports the URL/status.
- **Local dashboard:** a browser UI backed by a loopback-only read-only server that scans proposal, plan, fact, map, receipt, evidence, index, and ADR artifacts.

The UI should feel like a dark tactile planning cockpit: layered surfaces, strong affordances, immediate interaction feedback, purposeful motion, and category colors that help users distinguish proposals, plans, implementations, facts, files, validations, and ADRs [F010].

## Problem Statement

Cartographer already writes useful graph-grounded artifacts, but the human review experience is fragmented. A user must manually jump between `.plan/<topic>/proposal.md`, `.plan/<topic>/plan.md`, JSONL graph files, receipts, context packs, sanitized evidence, source files, and ADR records. That is workable for agents and scripts, but slow for a person trying to answer:

- Which proposals, plans, implementations, and ADRs are active, in progress, complete, stale, or superseded?
- Which topics exist in this repository, and which ones have proposals, plans, evidence, receipts, or ADRs?
- What does a proposal claim, what fact/source supports it, and where does that source point?
- How do topic map, fact, plan, implementation, and ADR relationships connect?
- When a JSONL node references a file or URL, how can the user open it immediately?
- Can Markdown and source files be read with rich syntax highlighting instead of raw terminal output?

The underlying model is already graph-shaped: Cartographer writes node/edge JSONL artifacts and validates citations, lifecycle state, and relationship resolution [F007] [F011]. The missing piece is a local, pleasant, human-first visual interface over those artifacts.

## Goals

1. **Start from the installed package.** Add a package-exposed `cartographer-dashboard` CLI and a Pi skill that uses that CLI instead of embedding dashboard logic in the skill [F005] [F006].
2. **Stay read-only by default.** The v1 dashboard may scan, render, link, validate, and inspect planning files, but it must not edit `.plan/`, ADRs, index/cache files, or source files.
3. **Show at-a-glance metrics.** The overview should summarize active, in-progress, and finished proposals, plans, implementations, and ADRs using existing lifecycle, receipt, validation, and ADR semantics [F008] [F009] [F011].
4. **List every topic.** A Plans/Topics page should list `.plan/<topic>/` directories with proposal/plan presence, lifecycle/status, current phase, validation health, graph counts, receipts, evidence, and ADR links.
5. **Render topic workspaces.** Clicking a topic should show proposal, plan, research/facts, evidence, receipts, validation, graphs, related ADRs, and referenced files in one workspace.
6. **Hyperlink JSONL references.** Rendered Markdown should turn fact citations such as `[F001]`, and unambiguous short forms such as `F01`, into links to fact/source detail. Map node IDs, plan IDs, ADR IDs, and file references should also resolve to the correct dashboard target [F011].
7. **Explore topic graphs.** Users should be able to browse map/fact/plan/ADR graphs, inspect relationships, filter layers/types, and click nodes or edges to open files, URLs, detail drawers, or warning states [F002] [F004].
8. **Provide a rich document/code viewer.** Render Markdown with code fences and show referenced source files with line numbers, line anchors, copy affordances, and high-quality Shiki syntax highlighting [F003].
9. **Follow the taste profile.** Treat the dark tactile UI system as an acceptance criterion, not optional polish [F010].

## Non-Goals

- Do not build a writable planning editor in v1.
- Do not replace `.plan/` Markdown/JSONL artifacts with a new authoritative database.
- Do not expose or traverse raw `.plan/_private/**` files; only sanitized evidence under topic evidence directories may be displayed [F011].
- Do not build hosted collaboration, authentication, telemetry, comments, or remote sharing in v1.
- Do not add a full IDE: no editing, LSP, debugging, terminals, or file creation in the initial code viewer.
- Do not invent new lifecycle/ADR/validation schemas where existing helpers already define semantics [F008] [F009] [F011].
- Do not make a Pi extension command/tool required for v1. A future extension can wrap `status` or `open`, but the requested skill-plus-CLI surface is enough initially [F012].
- Do not rely on Graphviz-only output for the interactive graph view; `jsonl-graph` is inspiration for JSONL shape, while the dashboard needs browser interactivity [F002] [F004].

## Background

Cartographer already writes the dashboard’s core data model. Topic directories can contain proposals, plans, map/fact JSONL, plan graph JSONL, receipts, context packs, and sanitized evidence [F007]. The current workflows define how these artifacts are created and consumed: `file:skills/proposal/SKILL.md` creates proposal/map/fact artifacts, `file:skills/plan/SKILL.md` creates phase plans and plan graphs, and `file:skills/implement/SKILL.md` updates phase state and validation receipts during implementation.

Several existing helpers should become server-side semantic references rather than ad hoc reimplementations:

- `file:skills/plan/scripts/manage_jsonl.ts` validates JSONL records, fact citations, lifecycle states, supported-by edges, and private-path safety [F011].
- `file:skills/plan/scripts/workflow_benchmark.py` computes topic metrics from phase nodes, receipts, validation receipts, context packs, commands, and optional session summaries [F008].
- `file:skills/plan/scripts/adr_records.py` defines ADR graph files, statuses, edge types, required fields, currentness, and validation [F009].
- `file:skills/index-project/scripts/index_project.py` and `.plan/_index/project-graph.sqlite` can help resolve indexed file/node references when available.

The proposed frontend stack is viable. Vite exposes a programmatic server API useful for dashboard development and integration tests [F001]. React Flow supports interactive node/edge canvases with controls, minimaps, backgrounds, custom nodes/edges, and fit-to-view behavior [F002]. Shiki can render source code and Markdown code blocks with VS Code-style highlighting and themes [F003]. `jsonl-graph` demonstrates the simple JSONL graph convention of nodes with `id` and edges with `from`/`to`, which matches Cartographer’s graph artifacts [F004].

## Viability

This is a moderate but well-bounded package feature. The hard data-model work is mostly present: planning artifacts, validation helpers, metric helpers, ADR graph helpers, and project index files already exist [F007] [F008] [F009] [F011]. The first dashboard can stay read-only and avoid changing workflow semantics.

The launch model is feasible. A Node CLI can be exposed from `package.json`, while the Pi skill can remain a thin wrapper around the installed CLI [F005] [F006]. In development, Vite can power the frontend dev server; in installed runtime mode, the CLI should serve prebuilt assets plus the local read-only API rather than requiring a Vite dev server in normal user sessions [F001].

The UI requirements are also feasible. React Flow fits the interactive graph explorer [F002]. Shiki fits Markdown code blocks and read-only source viewing without forcing a Monaco-sized editor into v1 [F003]. The JSONL graph model is simple enough to normalize map, fact, plan, and ADR records while preserving original IDs and edge types [F004].

Primary risks and mitigations:

| Risk | Mitigation |
|---|---|
| Private data leak | Block `.plan/_private/**`, reject path traversal, display sanitized evidence only [F011]. |
| Schema drift | Reuse/mirror existing validators and helpers as the semantic source of truth [F008] [F009] [F011]. |
| Dashboard becomes an editor | Keep all v1 endpoints read-only and omit mutating UI affordances. |
| Graph noise | Start topic-scoped, add layer/type filters, search, minimap, and lazy detail drawers. |
| Installed package complexity | Serve prebuilt assets at runtime; reserve Vite dev server for development/build. |
| UI polish slips | Encode the tactile dark design system as acceptance criteria [F010]. |

## Design

### 1. Package the installed dashboard CLI

Add a package `bin` entry for `cartographer-dashboard` and include dashboard runtime assets/dependencies in `file:package.json` [F006]. The CLI should own process lifecycle, port selection, browser opening, JSON output, and root selection.

Minimal v1 contract:

```text
cartographer-dashboard start [--root <path>] [--topic <topic>] [--host 127.0.0.1] [--port <port>] [--open] [--json]
cartographer-dashboard status [--root <path>] [--json]
cartographer-dashboard stop [--root <path>] [--json]
```

Default behavior:

- `--root` defaults to `$PWD`.
- `--host` defaults to loopback.
- `start` starts a read-only local server and reports `ok`, `url`, `root`, `topic`, `pid`, `mode: "read-only"`, and warnings when `--json` is used.
- `--topic` deep-links to a topic detail route.
- Runtime mode serves prebuilt client assets plus the local API.
- Development mode may use Vite’s programmatic server API for fast frontend iteration [F001].

### 2. Add a thin Pi dashboard skill

Add `skills/dashboard/SKILL.md` with a description specific enough to load when users ask to open, view, start, stop, or inspect the planning dashboard. The skill should use the installed CLI and not duplicate server logic [F005].

Suggested skill behavior:

```text
/skill:dashboard
  -> cartographer-dashboard start --root "$PWD" --open --json

/skill:dashboard <topic>
  -> cartographer-dashboard start --root "$PWD" --topic <topic> --open --json

/skill:dashboard status
  -> cartographer-dashboard status --root "$PWD" --json

/skill:dashboard stop
  -> cartographer-dashboard stop --root "$PWD" --json
```

If `cartographer-dashboard` is missing from `PATH`, the skill can try the package-relative CLI path. If neither works, it should report that the package install is incomplete. It should always mention that v1 is read-only.

### 3. Build a read-only server/API

Implement a loopback-only server that scans safe paths under the selected repository root. The server should read:

- `.plan/<topic>/proposal.md`
- `.plan/<topic>/plan.md`
- `.plan/<topic>/map.nodes.jsonl` / `map.edges.jsonl`
- `.plan/<topic>/facts.nodes.jsonl` / `facts.edges.jsonl`
- `.plan/<topic>/plan.nodes.jsonl` / `plan.edges.jsonl`
- `.plan/<topic>/receipts.jsonl`
- `.plan/<topic>/context-packs.jsonl`
- `.plan/<topic>/evidence/**` sanitized evidence only
- ADR Markdown and ADR `_graph/*.jsonl` where present [F009]
- `.plan/_index/project-graph-manifest.json` and SQLite/index references when useful

It must reject raw `.plan/_private/**`, paths outside the selected root, and path traversal attempts [F011].

Useful endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/overview` | Proposal/plan/implementation/ADR counts, health, recent activity. |
| `GET /api/topics` | Topic cards/table data. |
| `GET /api/topics/:topic` | Topic summary and artifact availability. |
| `GET /api/topics/:topic/docs/:kind` | Proposal, plan, evidence, receipts, or Markdown payloads. |
| `GET /api/topics/:topic/graph?layers=map,facts,plan,adr` | Normalized graph records preserving original IDs. |
| `GET /api/files?path=<path>&line=<line>` | Safe file read for code/document viewer. |
| `GET /api/adrs` / `GET /api/adrs/:id` | ADR metrics, currentness, and relationships [F009]. |
| `GET /api/health` | Broken refs, stale index hints, private-reference warnings, validator summaries. |

### 4. Create the dashboard information architecture

The dashboard should have these main routes:

| Area | Question answered | Key content |
|---|---|---|
| Overview | “What is happening?” | Active/in-progress/finished metrics, recent receipts, validation health, broken refs. |
| Topics / Plans | “What topics exist?” | Topic list with proposal/plan status, current phase, validations, graph counts, ADR links. |
| Topic Detail | “What does this topic say and prove?” | Summary, Proposal, Plan, Facts, Evidence, Receipts, Graph, Files tabs. |
| Graph Explorer | “How is this connected?” | Layered map/fact/plan/ADR graph, filters, search, minimap, relationship inspector. |
| ADRs | “What decisions constrain this work?” | ADR counts, current/superseded status, relationship graph, related topics [F009]. |
| File / Document Viewer | “What is the referenced artifact?” | Markdown rendering, source view, line anchors, syntax highlighting [F003]. |

Topic detail should be the center of gravity: left topic rail, middle document/graph pane, and right inspector drawer for selected facts, sources, files, edges, phases, receipts, or ADRs.

### 5. Resolve Markdown and JSONL references into links

The renderer should parse Markdown into a safe render tree and apply a shared reference resolver:

- Fact citations matching the existing fact citation semantics should resolve to fact nodes [F011]. Canonical examples in generated proposal prose should use IDs such as [F001].
- If a document contains a short-form fact reference like `F01`, normalize it only when the resolver can unambiguously map it to an existing canonical fact node.
- Fact links open a drawer with claim, evidence, confidence, supporting source, and connected graph edges.
- Source nodes open URLs or local file references when safe.
- File references open the code/document viewer at the referenced line.
- Map, plan, validation, and ADR node IDs open the graph/detail inspector.
- Broken or ambiguous links render visibly and appear in topic health.
- Markdown code fences use Shiki highlighting [F003].

The graph explorer and Markdown renderer should use the same resolver so links behave consistently across documents and graphs.

### 6. Implement the interactive topic graph explorer

Normalize map, fact, plan, implementation, and ADR records into a graph view while preserving the original JSONL records and IDs. The graph should be inspired by the `jsonl-graph` convention of `id`, `from`, and `to` records [F004], and rendered interactively with React Flow [F002].

Core behavior:

- Layer toggles for map, facts, sources, plan, receipts, implementation, and ADRs.
- Type filters for topic, file, source, fact, phase, task, validation, receipt, ADR, and proposed artifact.
- Relationship filters for `supported_by`, `relevant_to`, `contains`, `depends_on`, `validates`, `supersedes`, `related_to`, and other discovered edge types.
- Search by ID, title, path, status, edge type, or text.
- Minimap, zoom controls, fit-to-view, and background grid [F002].
- Node click opens file, URL, rendered document, or inspector drawer.
- Edge click shows relationship type, evidence, source path, and validation warnings.
- Highlight chains such as proposal claim → fact → source, or phase → files → validations → receipts.
- Render unresolved endpoints as health warnings instead of silently dropping them.

### 7. Build the Markdown/code viewer

The viewer should optimize for reading and navigation:

- Shiki syntax highlighting for source files and Markdown code blocks [F003].
- Dark theme aligned to the tactile UI tokens [F010].
- Line numbers, line anchors, selected-line highlighting, copy path/link actions.
- Markdown preview/source toggle.
- Side-by-side document plus fact/graph inspector when opened from a citation.
- Clear blocked-state UI for private, missing, outside-root, or unresolved paths [F011].

This satisfies the “lightweight VS Code” requirement without making v1 a full editor.

### 8. Apply the tactile dark UI system

Design tokens and components should be defined before page polish begins:

- Dark neutral base surfaces with layered panels, inset wells, raised cards, soft shadows, and edge highlights.
- Pressed, hovered, focused, loading, copied, selected, and expanded states for every interactive control.
- Category colors: proposal purple, plan blue, implementation green, fact/source teal, file slate, ADR amber, validation success/warning/danger.
- Motion that explains state: drawer slides, graph focus transitions, card lift/press, filter chip toggles, and copy/open feedback.
- Reduced-motion support, visible focus rings, contrast checks, and icons/labels so status does not rely on color alone [F010].

### 9. Validate with temporary projects and existing checks

Testing must use temporary/mock repositories for commands that create `.plan/`, index, or generated artifacts, consistent with `file:AGENTS.md`.

Validation should cover:

- CLI lifecycle on ephemeral ports with temp roots.
- Server path-safety and `.plan/_private/**` blocking.
- JSONL parsing, broken-ref detection, and citation linkification.
- Overview/topic metrics from fixture proposal/plan/receipt/ADR data [F008] [F009].
- Graph node/edge rendering and node-click routing [F002].
- Markdown/code rendering with Shiki and line anchors [F003].
- Package checks from `file:package.json`, plus existing JSONL/topic validation helpers [F011].

A practical implementation sequence is: safe artifact reader/API, frontend build/dev setup, installed CLI/runtime server, overview/topics/topic detail APIs, Markdown/code rendering, graph explorer, dashboard skill, then polish and validation hardening. A Pi extension command/tool remains a post-v1 option unless the user explicitly asks for deeper Pi-native controls.
