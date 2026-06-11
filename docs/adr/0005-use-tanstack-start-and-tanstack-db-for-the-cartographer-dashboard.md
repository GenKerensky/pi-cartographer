---
adr_id: ADR-0005
title: Use TanStack Start and TanStack DB for the Cartographer dashboard
status: accepted
decision_date: 2026-06-11
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits:
  - 3ff29fad4dfe073c091f2423957409383e0333ec
  - d1d9c0132a3191a0083e537a847a1946c544386b
  - 2daa2c4bfb0790da1634ab0b5b782f9ff556ecf5
  - a3459174ab321e98d79078d00fc1443f8e11a140
  - 47f9225a47c6559009aafda2cec3790adddc6c35
validation_receipts:
  - receipt:P5:validation:2026-06-11T03:14:53+00:00
  - receipt:P5:semantic-audit:2026-06-11T03:16:55+00:00
  - receipt:P6:validation:2026-06-11T05:02:54+00:00
  - receipt:P6:validation:2026-06-11T05:03:04+00:00
  - receipt:P6:validation:2026-06-11T05:06:03+00:00
  - receipt:P6:validation:2026-06-11T05:06:07+00:00
  - receipt:P6:validation:2026-06-11T05:06:14+00:00
  - receipt:P6:validation:2026-06-11T06:08:12+00:00
  - receipt:P6:validation:2026-06-11T06:08:21+00:00
  - receipt:P6:semantic-audit:2026-06-11T06:09:00+00:00
  - receipt:P6:validation:2026-06-11T06:12:18+00:00
  - receipt:P6:validation:2026-06-11T06:12:26+00:00
domains:
  - dashboard
  - tooling
  - typescript
  - planning-ui
keywords:
  - dashboard
  - tanstack-start
  - tanstack-db
  - chokidar
  - read-only

decision_kind: technology-stack
supersedes:
  - ADR-0003
related: []
precursors: []
children: []
confidence: high
---

# ADR-0005: Use TanStack Start and TanStack DB for the Cartographer dashboard

## Status

Accepted on 2026-06-11.

## Decision

Adopt TanStack Start as the full-stack runtime for the local Cartographer planning dashboard and TanStack DB/TanStack Query as read-only reactive projections for dashboard artifact state. Remove the old Hono server/app/assets path entirely so API routes, live events, and UI routing live in the TanStack app.

## Context

The tanstack-dashboard implementation validated route parity, collection-backed dashboard state, Chokidar/SSE live reload integration, route-driven UI navigation, package/smoke behavior, and full project checks. ADR-0003 selected a Hono plus standalone Vite React dashboard stack; the new implementation changes the normal runtime and client state architecture while preserving loopback-only, read-only, private-path filtering, Chokidar live reload, shadcn/Tailwind UI, Shiki document rendering, and React Flow graph exploration.

## Considered Options

- Supersede ADR-0003 completely with TanStack Start and remove all Hono fallback code.
- Amend/supersede ADR-0003 for the normal runtime while retaining Hono modules as a compatibility fallback and route-contract test harness.
- Keep ADR-0003 current and treat TanStack Start as an experiment only.

## Why This Decision

Validated implementation evidence shows the Start runtime can serve the full dashboard through cartographer-dashboard, package/smoke tests pass against Start output, and TanStack DB/Query removes manual fetch/refetch state while preserving read-only semantics. Removing the Hono fallback makes the runtime boundary simpler: Start owns HTTP routing, server handlers, live events, and UI delivery.

## Consequences

- Normal dashboard startup depends on built dashboard/.output/server/index.mjs and package checks assert that output is packed.
- Package-level dashboard scripts delegate to TanStack Start defaults from `dashboard`: `vite dev`, `vite build`, `node .output/server/index.mjs`, and `vite preview`.
- Dashboard UI, routes, server helpers, shared models, and CLI runtime helpers are consolidated under `dashboard/src/**`; the old `dashboard/client`, `dashboard/server`, `dashboard/shared`, and `dashboard/start` source trees are removed.
- TanStack DB is a read-only reactive cache/projection over planning artifacts, not a write-capable dashboard database.
- Hono dependencies and modules are removed; route-contract tests target TanStack Start server helpers and route behavior instead.

## How to Use This Decision

Dashboard changes should target TanStack Start routes/server helpers and TanStack DB collection hooks. Do not reintroduce a parallel Hono dashboard server unless a new ADR establishes a clear need.

## Validation

Implementation receipts include P5 route migration validation, P6 dashboard:check/package-smoke/full-check/topic/graph validation receipts, and the final full-dashboard migration auditor PASS for tanstack-dashboard.
