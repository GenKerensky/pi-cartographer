# P0 Serial Pathfinder Receipt

Phase: P0 — TanStack Runtime Spike and Dependency Baseline

## Result

Completed P0 in serial fallback mode.

## Changed files

- `.gitignore`
- `package.json`
- `package-lock.json`
- `dashboard/start/vite.config.ts`
- `dashboard/start/src/router.tsx`
- `dashboard/start/src/routeTree.gen.ts`
- `dashboard/start/src/routes/__root.tsx`
- `dashboard/start/src/routes/index.tsx`
- `dashboard/start/src/routes/topics/$topic.tsx`
- `dashboard/start/docs/runtime-spike.md`
- `.plan/tanstack-dashboard/plan.md`
- `.plan/tanstack-dashboard/plan.nodes.jsonl`
- `.plan/tanstack-dashboard/context-packs.jsonl`
- `.plan/tanstack-dashboard/receipts.jsonl`

## Checklist completed

- P0.T1 — dependency baseline and lockfile.
- P0.T2 — Start-compatible app entry and Vite config.
- P0.T3 — minimal `/` and `/topics/$topic` route tree.
- P0.T4 — production Start build launched from Node source checkout.
- P0.T5 — compatibility notes documented.

## Commands run

- `npm install @tanstack/react-start@latest @tanstack/react-router@latest @tanstack/react-db@latest @tanstack/query-db-collection@latest @tanstack/react-query@latest`
- `npm install -D nitro@npm:nitro-nightly@latest`
- `npm run dashboard:start:build`
- `npm run typecheck`
- `npm run lint:ts -- dashboard/start/**/*.ts dashboard/start/**/*.tsx`
- `PORT=41741 HOST=127.0.0.1 node dashboard/start/.output/server/index.mjs` plus curl checks for `/` and `/topics/demo`
- `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic tanstack-dashboard --json`
- `python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic tanstack-dashboard --json`

## Residual risks

- P1 must adapt the CLI runtime to launch `dashboard/start/.output/server/index.mjs` or a Start handler equivalent.
- `dashboard/start/.output/` and `dashboard/start/node_modules/` are generated/ignored and not committed.
