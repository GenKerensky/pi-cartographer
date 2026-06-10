# tanstack-dashboard Proposal

## Description

Convert the existing Cartographer dashboard from a split Hono API plus separately built Vite React client into a single TanStack Start full-stack app. The installed `cartographer-dashboard` CLI and `/skill:dashboard` user experience should remain, but the implementation should feel like one app: file routes, server routes/functions, loaders, and client UI live in the TanStack Start structure instead of a separately managed server/frontend pair.

Use TanStack DB as the dashboard's realtime client-state layer. Planning artifact data should be loaded into typed collections, rendered through live queries, and refreshed from the existing Chokidar-driven live-reload signal. Chokidar remains the filesystem boundary; TanStack DB becomes the reactive state boundary.

## Problem Statement

The dashboard already works, but the architecture now has two surfaces to reason about: a Hono server/runtime in `dashboard/server/**` and a Vite React client in `dashboard/client/**` [F001]. The UI then manually keeps overview, selected topic, ADR, error, and active-section state in React hooks and refetches API data when an SSE event arrives [F004]. That creates avoidable coordination code for exactly the sort of server/client state flow TanStack Start and TanStack DB are meant to simplify.

The user wants the ergonomics of a single full-stack app with TanStack features, while preserving the dashboard's local, read-only, private-safe operating model [F012]. The core problem is therefore not just swapping dependencies; it is reshaping the dashboard so route ownership, server artifact reads, live filesystem events, and client rendering share one coherent full-stack data model.

## Goals

1. **Adopt TanStack Start for one full-stack dashboard app.** Replace the separate Hono app plus standalone dashboard Vite client boundary with a TanStack Start application that owns browser routes, server routes/functions, SSR/loaders where useful, and production build output [F006] [F007].
2. **Preserve the user-facing CLI and skill contract.** `cartographer-dashboard start|status|stop` and `/skill:dashboard` should keep working, including loopback defaults, topic deep links, JSON output, runtime metadata, and package installation behavior [F001] [F012].
3. **Use TanStack DB for realtime dashboard state.** Model overview, topics, topic artifacts, documents, graphs, ADRs, health, live status, and live events as typed collections consumed through `useLiveQuery` or equivalent collection-backed selectors [F008] [F009].
4. **Wire Chokidar into the state layer.** Keep Chokidar watching safe `.plan/**` paths, ignore `.plan/_private/**`, coalesce filesystem events, and bridge those events into TanStack Query/TanStack DB invalidation or collection updates [F003] [F005] [F010].
5. **Keep the dashboard read-only.** TanStack DB is a reactive cache/state model, not a new source of truth. `.plan/` Markdown/JSONL, ADRs, and index artifacts remain authoritative, and no mutating dashboard UI or API should be introduced [F012].
6. **Retain existing dashboard product surfaces.** The overview, topic workspace, graph explorer, document/code viewer, evidence/receipt/health panels, and ADR visibility should survive the migration rather than being redesigned from scratch.
7. **Update dependencies, scripts, and validation intentionally.** Add the required TanStack packages, update build/check scripts, adapt browser/API/live-reload tests, and preserve temporary-fixture test discipline [F013] [F014] [F015].
8. **Produce an ADR after validated implementation.** This is an architecture-significant replacement or amendment of the accepted dashboard stack in ADR-0003 [F011].

## Non-Goals

- Do not build a writable planning editor, artifact mutation API, or source-code editing workflow.
- Do not replace `.plan/` files, ADR Markdown, receipts, evidence docs, or the SQLite index with TanStack DB as the authoritative data store.
- Do not expose raw `.plan/_private/**` data or weaken path traversal protections.
- Do not require users to run a separate frontend dev server for ordinary dashboard use.
- Do not add hosted deployment, authentication, collaboration, telemetry, comments, or remote sharing.
- Do not rewrite unrelated Cartographer workflows, proposal/plan schemas, ADR tooling, or validation helpers.
- Do not remove the existing dashboard UI capabilities merely because the app shell changes.
- Do not finalize a new ADR until implementation evidence verifies the TanStack Start runtime, package build, and tests.

## Background

The current dashboard stack was intentionally local and read-only. It is launched by a package bin, runs a Hono Node runtime, serves a separately built React/Tailwind/shadcn Vite client, and watches `.plan` through Chokidar [F001] [F003]. The current Hono app centralizes read-only GET routes for health, overview, topics, documents, graph data, evidence, files, ADRs, the index manifest, and live events [F002].

Live reload is already well factored. `dashboard/server/live-reload.ts` watches the repository's `.plan` directory, rejects private paths, classifies topic/global/index changes, debounces events, and publishes shared `LiveReloadEvent` records over SSE [F003] [F005]. The client currently consumes those events through an `EventSource` hook and decides which visible resources to refetch [F004].

TanStack Start is a plausible replacement for the split server/client boundary because its route files can colocate React components with server HTTP handlers, and its docs cover full-stack server routes and Vite plugin setup [F006] [F007]. TanStack DB is a plausible replacement for ad hoc React state/refetch coordination because it provides collections and live queries, and it can load collection data through query-backed `queryFn`/`getKey` definitions [F008] [F009].

The architectural weight is real. ADR-0003 currently accepts the Hono + Chokidar + Vite/React dashboard stack and says future dashboard work should preserve the loopback/read-only CLI boundary unless explicitly redesigned [F011]. This proposal is that explicit redesign: keep Chokidar, safety, CLI, and UI semantics, but move the app framework and state model to TanStack Start + TanStack DB.

## Viability

This is viable but should be treated as a staged migration, not a one-shot rewrite. The reusable server-side domain logic is already separated into artifact readers, safety checks, JSONL handling, shared models, and tests. TanStack Start can initially wrap those modules behind server routes/functions while preserving the current endpoint shape [F002] [F006]. The React UI is already componentized enough that `DashboardShell`, review workflow panels, graph explorer, document viewer, API wrappers, and live-event utilities can be migrated incrementally into file routes and collection modules [F004].

The lowest-risk path is to keep Chokidar as the server-side source of filesystem truth and use TanStack DB on the client as a reactive projection of server data. Chokidar supports the required event and cleanup primitives, and the project already validates live reload behavior with fixture roots [F010] [F013]. TanStack DB query collections can start by refetching existing read-only API resources on event-driven invalidation, then later become more granular if the collection model proves stable [F008] [F009].

The biggest risks are packaging and maturity boundaries. Current package metadata does not yet declare the TanStack Start/Router/DB/Query packages [F015]. TanStack Start's generated routes, server entrypoint, Node runtime integration, and build output need a spike against the `cartographer-dashboard` CLI before deleting Hono-specific runtime code. TanStack DB's local collection update semantics must also be tested carefully so event-driven refresh remains read-only from the dashboard's perspective [F008] [F009] [F012].

| Risk | Mitigation |
|---|---|
| Start runtime does not map cleanly to the installed CLI | Spike a minimal Start build served by `cartographer-dashboard` before migrating all routes. |
| TanStack DB introduces accidental write semantics | Use read-only query collections first; no dashboard mutation handlers that write `.plan` or source files. |
| Chokidar/SSE event behavior regresses | Keep current watcher tests and add collection-update assertions around live events [F013]. |
| Private/safety boundary weakens during route migration | Port existing read-only and private-path tests before deleting old routes [F012] [F013]. |
| ADR-0003 becomes stale or contradictory | Generate a validated follow-up ADR that supersedes or amends ADR-0003 after implementation [F011]. |

## ADR Metadata

- `adr_required`: true
- `adr_reason`: This changes the accepted dashboard technology stack from Hono + standalone Vite React to TanStack Start and adds TanStack DB as the cross-cutting realtime state layer; it likely supersedes or amends ADR-0003 [F011].
- `adr_options_status`: user-directed-choice-with-rationale; implementation ADR should compare at least (1) keep Hono + Vite + manual state, (2) TanStack Start + TanStack DB, and (3) TanStack DB-only atop the existing Hono/Vite split.
- `adr_tool_mode`: evaluate-now/write-after-validation

## Design

### 1. Prove the TanStack Start runtime boundary

Start with a small runtime spike before moving the dashboard surface. Add the minimum TanStack Start app scaffold under the dashboard tree and verify:

- the Start Vite plugin is configured before the React plugin [F007];
- a production build emits server/client assets that can be launched by `bin/cartographer-dashboard.js`;
- the process remains loopback-only and stores runtime metadata outside `.plan/`;
- a topic deep link such as `/topics/<topic>` works without a separate Vite dev server;
- the package still supports source-checkout execution and installed package execution.

Relevant files: `file:package.json`, `file:bin/cartographer-dashboard.js`, `file:dashboard/server/cli.ts`, `file:dashboard/server/runtime.ts`, and `file:dashboard/client/vite.config.ts`.

### 2. Reshape the dashboard source layout around Start routes

Create a TanStack Start route tree for the existing dashboard areas:

| Start route | Existing surface | Notes |
|---|---|---|
| `/` | Overview/dashboard shell | Load overview, health, ADR summary, and initial topic. |
| `/topics/$topic` | Topic detail route | Deep link selected topic without manual `history.pushState`. |
| `/documents/$` or nested topic route | Document/code viewer | Preserve safe file/document references. |
| `/graph/$topic` or topic tab | Graph explorer | Keep React Flow UI, feed it collection-backed topic graph state. |
| `/api/*` server routes | Hono API routes | Preserve response envelopes while migrating server handlers. |
| `/api/events` server route | SSE live reload | Keep EventSource-compatible stream for Chokidar events. |

Server-only modules such as `dashboard/server/artifact-reader.ts`, `dashboard/server/safety.ts`, and JSONL readers should be imported by server routes/functions, not bundled into the browser. Client UI modules should move or re-export into a Start-friendly structure without changing behavior first.

### 3. Migrate read-only API handlers to Start server routes/functions

Port the current `READ_ONLY_ROUTES` surface from `dashboard/server/app.ts` into TanStack Start server routes or server functions [F002] [F006]. Preserve the `ApiResponse<T>` envelope and shared models so the client and tests can migrate incrementally.

Initial route parity should include:

- health and overview;
- topics and topic detail;
- proposal/plan documents;
- topic graph data;
- sanitized evidence summaries;
- safe file reads;
- ADR collection and ADR detail;
- index manifest;
- live reload stream and status.

Keep the old Hono app only as a temporary compatibility layer during migration. Once Start routes pass equivalent tests, remove the duplicate Hono-specific route registry and `@hono/node-server` dependency if no longer needed.

### 4. Define TanStack DB collections for dashboard state

Introduce a dashboard state module that defines typed collections for the current API resources:

| Collection | Key | Source | Primary consumers |
|---|---|---|---|
| `overviewCollection` | root or singleton | `/api/overview` | overview metrics, topic rail |
| `topicsCollection` | topic id | `/api/topics` or overview topics | topic list/search |
| `topicArtifactsCollection` | topic id | `/api/topics/:topic` | topic workspace |
| `documentsCollection` | topic + kind/path | docs/file routes | document viewer |
| `topicGraphCollection` | topic id | `/api/topics/:topic/graph` | graph explorer |
| `adrCollection` | ADR id | `/api/adrs` | ADR panel/routes |
| `liveStatusCollection` | singleton | `/api/events/status` | live badge |
| `liveEventCollection` | event id | `/api/events` stream | transient event history/debug |

Use TanStack DB live queries for UI selectors such as active topic, graph layer filters, unresolved warnings, and recent events [F008]. Use query-backed collections first so existing API functions can populate collection state with minimal server churn [F009]. Because the dashboard is read-only, mutation handlers should either be omitted or explicitly reject writes until a future proposal approves editing.

### 5. Bridge Chokidar events into collection refresh

Keep the existing Chokidar service semantics: watch safe `.plan/**`, ignore `.plan/_private/**`, summarize `.plan/_index/**` as stale-index, debounce rapid writes, and publish shared event payloads [F003] [F005] [F010]. The client bridge should translate each event into targeted collection refresh:

```mermaid
flowchart LR
  FS[.plan file change] --> CK[Chokidar watcher]
  CK --> SSE[/api/events SSE]
  SSE --> BR[client event bridge]
  BR --> QI[TanStack Query invalidation]
  QI --> DB[TanStack DB query collections]
  DB --> LQ[useLiveQuery components]
```

The first implementation should prefer invalidating/refetching affected query collections over hand-patching complex graph/document objects. Granular local updates can be added later only after tests prove they preserve consistency and private-path safety.

### 6. Convert UI components to route/live-query consumers

Migrate components in thin slices:

1. Move the shell and layout into the root Start route.
2. Replace manual `useState` ownership of overview/topic/ADR data with live-query selectors [F004] [F008].
3. Replace manual `history.pushState` topic navigation with TanStack Router navigation.
4. Keep review workflow, graph explorer, Markdown/code viewer, and shadcn/Tailwind styling intact while changing data sources.
5. Keep the live connection badge, but derive it from `liveStatusCollection` and latest live event state.

The goal is to make data flow more explicit, not to redesign the cockpit UI.

### 7. Update package scripts, dependency declarations, and docs

Update `package.json` to declare the required TanStack packages and remove Hono dependencies only when the Start routes/runtime fully replace them [F015]. Update scripts such as `dashboard:build`, `dashboard:check`, `check:scripts`, and browser test configs to use the Start build/test entrypoints instead of the current standalone Vite client config [F001] [F007].

Documentation updates should cover:

- same `cartographer-dashboard start/status/stop` commands;
- no separate frontend server required for ordinary use;
- read-only and private-path guarantees remain unchanged;
- TanStack DB is a client reactive state/cache layer, not the artifact source of truth.

### 8. Validate with fixture roots and ADR follow-through

Validation should adapt existing tests rather than discard them:

- API parity tests for each migrated Start server route [F002];
- CLI lifecycle tests for ephemeral ports and topic deep links [F001];
- live reload tests proving Chokidar events refresh the relevant collections [F003] [F013];
- privacy regression tests for `.plan/_private/**`, outside-root paths, and GET-only/read-only behavior [F012] [F013];
- browser tests for shell navigation, topic routes, graph explorer, document viewer, live badge, and collection-driven UI [F004] [F008];
- package smoke tests for built assets and installed CLI execution;
- full `npm run check` after migration.

All tests that create planning files must use temporary/mock project roots, never this repository's real `.plan/` directory [F014]. After the migration validates, write an ADR that records whether TanStack Start + TanStack DB supersedes ADR-0003 or amends it with retained Chokidar/read-only constraints [F011].
