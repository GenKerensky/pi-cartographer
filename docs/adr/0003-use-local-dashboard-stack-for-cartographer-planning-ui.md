---
adr_id: ADR-0003
title: Use local dashboard stack for Cartographer planning UI
status: draft
decision_date: 2026-06-09
generated_from_topic: planning-dashboard
adr_required_source: proposal
legacy_import: false
source_commits: []
validation_receipts:
  - receipt:planning-dashboard:validation:2026-06-08T06:13:31+00:00
  - receipt:plan:validation:2026-06-09T04:20:31+00:00
  - receipt:plan:validation:2026-06-09T04:20:38+00:00
  - receipt:plan:validation:2026-06-09T04:25:38+00:00
  - receipt:plan:validation:2026-06-09T04:25:44+00:00
  - receipt:plan:validation:2026-06-09T04:39:23+00:00
  - receipt:plan:validation:2026-06-09T04:39:31+00:00
domains:
  - dashboard
  - tooling
  - typescript
  - planning-ui
keywords:
  - dashboard
  - hono
  - chokidar
  - typescript-eslint
  - prettier
  - shadcn
  - tailwind
  - playwright
decision_kind: technology-stack
supersedes: []
related: []
precursors: []
children: []
confidence: medium
---

# ADR-0003: Use local dashboard stack for Cartographer planning UI

## Status

Draft on 2026-06-09.

## Decision

Use a local read-only dashboard stack composed of Hono on Node.js for the API/runtime server, Chokidar for .plan live reload, a top-level dashboard/ source layout, strict full-repo ESLint/typescript-eslint/Prettier quality gates, shadcn/ui with Tailwind CSS for React UI, React Flow for graph exploration, Shiki for document/code rendering, and Vitest Browser Mode plus Playwright smoke tests for UI validation.

## Context

The planning-dashboard proposal introduces a packaged local web dashboard for Pi Cartographer planning artifacts. It needs a small loopback-only server, static runtime asset serving, SSE live reload, a substantial TypeScript/React client, graph and code/document views, and strong read-only/private-path safety. During planning, the user selected Hono, Chokidar, top-level dashboard layout, strict full-repo TypeScript quality tooling, and browser-plus-smoke UI tests.

## Considered Options

- Hono + Chokidar + top-level dashboard layout with strict TS quality tooling and browser/smoke tests
- Fastify or Express server with alternate watcher/test stack
- Node built-ins with minimal dependencies
- Defer ADR until after implementation

## Why This Decision

The selected stack balances low dependency weight, TypeScript-first development, explicit live-reload support, packageable Vite assets, accessible customizable React components, and validation coverage for a TS-heavy dashboard. Drafting now records user-approved stack decisions while final ADR acceptance should wait for implementation validation receipts.

## Consequences

- Implementation should add Hono and Chokidar dependencies when the relevant phases are implemented.
- Dashboard code should be organized under dashboard/server, dashboard/client, and dashboard/shared, with bin/cartographer-dashboard.js as the package CLI entrypoint.
- Quality gates should include strict full-repo ESLint/typescript-eslint and Prettier checks before large TS/TSX changes proceed.
- Final ADR acceptance should cite implementation validation receipts and may adjust details if implementation evidence changes these decisions.

## How to Use This Decision

Implementation agents should treat this ADR as draft guidance. At finalization, run cartographer_adr with validation receipts to accept, update, or supersede this draft based on actual implementation evidence.

## Validation

Planning validation has passed for proposal/plan/fact/map graph artifacts. Implementation validation receipts do not yet exist, so this ADR should remain draft until implementation finalization.
