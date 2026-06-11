# P2 Serial Pathfinder Receipt

Phase: P2 — Read-only Server Route Parity

## Result

Completed route parity for the Start runtime APIs while preserving existing read-only behavior.

## Changed files

- `dashboard/start/src/server/dashboard-api.ts`
- `dashboard/start/src/routes/api/health.ts`
- `dashboard/start/src/routes/api/overview.ts`
- `dashboard/start/src/routes/api/topics.tsx`
- `dashboard/start/src/routes/api/topics/$topic.tsx`
- `dashboard/start/src/routes/api/topics/$topic/docs.tsx`
- `dashboard/start/src/routes/api/topics/$topic/docs/$kind.tsx`
- `dashboard/start/src/routes/api/topics/$topic/graph.tsx`
- `dashboard/start/src/routes/api/topics/$topic/evidence.tsx`
- `dashboard/start/src/routes/api/files.tsx`
- `dashboard/start/src/routes/api/adrs.tsx`
- `dashboard/start/src/routes/api/adrs/$id.tsx`
- `dashboard/start/src/routes/api/index/index.tsx`
- `dashboard/start/src/routes/api/events.tsx`
- `dashboard/start/src/routes/api/events/status.tsx`
- `tests/dashboard/start-api.test.ts`
- `dashboard/start/src/routeTree.gen.ts`
- `.plan/tanstack-dashboard/plan.md`
- `.plan/tanstack-dashboard/plan.nodes.jsonl`
- `.plan/tanstack-dashboard/context-packs.jsonl`
- `.plan/tanstack-dashboard/receipts.jsonl`

## Checklist completed

- P2.T1 — added Start routes for every read-only endpoint in Hono `READ_ONLY_ROUTES` and validated route shape coverage.
- P2.T2 — ensured Node-only shared loaders/safety modules are only loaded via lazy server-side imports.
- P2.T3 — preserved `apiSuccess`/`apiFailure` envelopes and existing shared model types.
- P2.T4 — added a Start server request smoke test suite (`tests/dashboard/start-api.test.ts`) for route-contract coverage.
- P2.T5 — kept Hono app intact as fallback during transition.

## Commands run

- `npm run test:ts -- tests/dashboard/api-health.test.ts tests/dashboard/artifact-reader.test.ts`
- `npm run test:ts -- tests/dashboard/privacy-regressions.test.tsx`
- `npm run test:ts -- tests/dashboard/start-api.test.ts`
- `npm run dashboard:start:build`
- `npm run check:scripts`
- `npm run typecheck`
- `npm run lint:ts -- dashboard/start/src/server/dashboard-api.ts dashboard/start/src/routes/api tests/dashboard/start-api.test.ts`
- `npx prettier --check .plan/tanstack-dashboard/plan.md .plan/tanstack-dashboard/plan.nodes.jsonl dashboard/start/src/server/dashboard-api.ts dashboard/start/src/routes/api tests/dashboard/start-api.test.ts`

## Residual risks

- `/api/events` is still a placeholder SSE stream in P2 while full TanStack Start live-reload bridge semantics are deferred to P4.
- Route shape for `/api/index` currently comes from a nested index segment and should be monitored for framework-generated path quirks.
