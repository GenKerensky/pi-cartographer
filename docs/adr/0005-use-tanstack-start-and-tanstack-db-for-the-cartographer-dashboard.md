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
validation_receipts:
  - receipt:P5:validation:2026-06-11T03:14:53+00:00
  - receipt:P5:semantic-audit:2026-06-11T03:16:55+00:00
  - receipt:P6:validation:2026-06-11T05:02:54+00:00
  - receipt:P6:validation:2026-06-11T05:03:04+00:00
  - receipt:P6:validation:2026-06-11T05:06:03+00:00
  - receipt:P6:validation:2026-06-11T05:06:07+00:00
  - receipt:P6:validation:2026-06-11T05:06:14+00:00
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
  - hono-compatibility
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

Adopt TanStack Start as the normal full-stack runtime for the local Cartographer planning dashboard and TanStack DB/TanStack Query as read-only reactive projections for dashboard artifact state, while retaining the existing Hono server/app modules only as a documented source-checkout compatibility fallback and shared route contract during transition.

## Context

The tanstack-dashboard implementation validated route parity, collection-backed dashboard state, Chokidar/SSE live reload integration, route-driven UI navigation, package/smoke behavior, and full project checks. ADR-0003 selected a Hono plus standalone Vite React dashboard stack; the new implementation changes the normal runtime and client state architecture while preserving loopback-only, read-only, private-path filtering, Chokidar live reload, shadcn/Tailwind UI, Shiki document rendering, and React Flow graph exploration.

## Considered Options

- Supersede ADR-0003 completely with TanStack Start and remove all Hono fallback code immediately.
- Amend/supersede ADR-0003 for the normal runtime while retaining Hono modules as a compatibility fallback and route-contract test harness.
- Keep ADR-0003 current and treat TanStack Start as an experiment only.

## Why This Decision

Validated implementation evidence shows the Start runtime can serve the full dashboard through cartographer-dashboard, package/smoke tests pass against Start output, and TanStack DB/Query removes manual fetch/refetch state while preserving read-only semantics. Keeping Hono modules temporarily reduces source-checkout and route-contract risk until a future cleanup can remove fallback code safely.

## Consequences

- Normal dashboard startup depends on built dashboard/start/.output/server/index.mjs and package checks assert that output is packed.
- TanStack DB is a read-only reactive cache/projection over planning artifacts, not a write-capable dashboard database.
- Hono dependencies and modules remain only for documented compatibility fallback and shared route-contract tests, not as the primary runtime.
- Future cleanup may remove Hono once Start source-checkout behavior and API test coverage no longer need it.

## How to Use This Decision

Dashboard changes should target TanStack Start routes/server helpers and TanStack DB collection hooks first. Any retained Hono code must stay loopback-only/read-only and documented as compatibility-only until removed by a later ADR or cleanup plan.

## Validation

Implementation receipts include P5 route migration validation and P6 dashboard:check/package-smoke/full-check/topic/graph validation receipts for tanstack-dashboard.
