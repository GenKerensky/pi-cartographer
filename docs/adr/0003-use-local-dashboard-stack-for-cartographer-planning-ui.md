---
adr_id: ADR-0003
title: Use local dashboard stack for Cartographer planning UI
status: accepted
decision_date: 2026-06-10
generated_from_topic: planning-dashboard
adr_required_source: proposal
legacy_import: false
source_commits:
  - 50a38d2
  - 48c59ed
  - 32b9367
  - 0aff16d
  - 2bfb393
  - 8085d86
  - 5d6572d
validation_receipts:
  - receipt:planning-dashboard:validation:2026-06-08T06:13:31+00:00
  - receipt:plan:validation:2026-06-09T04:20:31+00:00
  - receipt:plan:validation:2026-06-09T04:20:38+00:00
  - receipt:plan:validation:2026-06-09T04:25:38+00:00
  - receipt:plan:validation:2026-06-09T04:25:44+00:00
  - receipt:plan:validation:2026-06-09T04:39:23+00:00
  - receipt:plan:validation:2026-06-09T04:39:31+00:00
  - receipt:P0:validation:2026-06-09T05:35:11+00:00
  - receipt:P1:validation:2026-06-09T12:32:07+00:00
  - receipt:P2:validation:2026-06-09T12:52:01+00:00
  - receipt:P3:validation:2026-06-09T13:20:44+00:00
  - receipt:P4:validation:2026-06-10T02:19:21+00:00
  - receipt:P5:validation:2026-06-10T02:30:36+00:00
  - receipt:P6:validation:2026-06-10T02:33:51+00:00
  - receipt:P7:validation:2026-06-10T02:43:26+00:00
  - receipt:P7:validation:2026-06-10T02:43:59+00:00
  - receipt:P7:validation:2026-06-10T02:44:11+00:00
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
confidence: high
---

# ADR-0003: Use local dashboard stack for Cartographer planning UI

## Status

Accepted on 2026-06-10 after implementation validation receipts for P0-P7 passed.

## Decision

Use a local read-only dashboard stack composed of Hono on Node.js for the API/runtime server, Chokidar for .plan live reload, a top-level dashboard/ source layout, strict full-repo ESLint/typescript-eslint/Prettier quality gates, shadcn/ui with Tailwind CSS for React UI, React Flow for graph exploration, Shiki for document/code rendering, and Vitest Browser Mode plus Playwright smoke tests for UI validation.

## Context

The planning-dashboard proposal introduced a packaged local web dashboard for Pi Cartographer planning artifacts. It needs a small loopback-only server, static runtime asset serving, SSE live reload, a substantial TypeScript/React client, graph and code/document views, and strong read-only/private-path safety. During planning, the user selected Hono, Chokidar, top-level dashboard layout, strict full-repo TypeScript quality tooling, and browser-plus-smoke UI tests. Implementation validation confirmed those choices across API, CLI, live reload, React/Tailwind/shadcn UI, Shiki viewer, React Flow graph explorer, dashboard skill, package asset, privacy, and smoke tests.

## Considered Options

- Hono + Chokidar + top-level dashboard layout with strict TS quality tooling and browser/smoke tests
- Fastify or Express server with alternate watcher/test stack
- Node built-ins with minimal dependencies
- Defer ADR until after implementation

## Why This Decision

The selected stack balances low dependency weight, TypeScript-first development, explicit live-reload support, packageable Vite assets, accessible customizable React components, and validation coverage for a TS-heavy dashboard. Final validation receipts show the stack works as a local read-only packaged dashboard and did not require material divergence from the planned architecture.

## Consequences

- Implementation should add Hono and Chokidar dependencies when the relevant phases are implemented.
- Dashboard code should be organized under dashboard/server, dashboard/client, and dashboard/shared, with bin/cartographer-dashboard.js as the package CLI entrypoint.
- Quality gates should include strict full-repo ESLint/typescript-eslint and Prettier checks before large TS/TSX changes proceed.
- Final ADR acceptance should cite implementation validation receipts and may adjust details if implementation evidence changes these decisions.

## How to Use This Decision

Future dashboard work should keep this stack as the default unless a new ADR supersedes it. In particular, preserve loopback-only/read-only guarantees, the top-level `dashboard/` layout, the CLI boundary, and shared viewer/graph safety semantics unless explicitly redesigned.

## Validation

Planning validation passed for proposal/plan/fact/map graph artifacts. Implementation validation receipts now cover P0-P7: read-only artifact APIs, CLI runtime, live reload, React/Tailwind/shadcn shell, overview/topic/document viewer, React Flow graph explorer, dashboard skill, package assets, privacy/path traversal regressions, Playwright smoke flow, topic JSONL validation, planning graph validation, and full `npm run check`.
