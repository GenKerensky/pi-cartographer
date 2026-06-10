# P1 Serial Pathfinder Receipt

Phase: P1 — Start App Shell and CLI Bridge

## Result

Completed P1 in serial fallback mode.

## Changed files

- `dashboard/server/runtime.ts`
- `tests/dashboard/cli.test.ts`
- `.plan/tanstack-dashboard/plan.md`
- `.plan/tanstack-dashboard/plan.nodes.jsonl`
- `.plan/tanstack-dashboard/context-packs.jsonl`
- `.plan/tanstack-dashboard/receipts.jsonl`

## Checklist completed

- P1.T1 — runtime startup launches built TanStack Start output when present.
- P1.T2 — status/stop metadata semantics preserved outside `.plan`.
- P1.T3 — `--topic` maps to `/topics/$topic` topic URLs.
- P1.T4 — source-checkout execution continues through the existing CLI wrapper; Start output is launched as Node output when built.
- P1.T5 — old Hono runtime remains as fallback when Start output is absent.

## Commands run

- `npm run test:ts -- tests/dashboard/cli.test.ts`
- bounded `node bin/cartographer-dashboard.js start/status/stop` smoke against a temp root and runtime dir
- `npm run check:scripts && npm run typecheck`
- `npx prettier --check dashboard/server/runtime.ts tests/dashboard/cli.test.ts package.json`
- `npm run lint:ts -- dashboard/server/runtime.ts tests/dashboard/cli.test.ts`

## Residual risks

- P2 must port API route parity into Start. Until then, built Start output serves the shell/topic routes while Hono remains as fallback for old API semantics when the Start output is absent.
