PASS

I could not write `/var/home/falco/code/pi-cartographer/feat-tanstack-conversion/.plan/tanstack-dashboard/auditor-full-dashboard-migration-report.md` because this `cartographer-auditor` role is read-only and must not mutate files. Parent can record/copy this report there.

## Required corrections

None.

## Findings

- Dashboard source layout matches the migration request:
  - `dashboard/client`, `dashboard/server`, `dashboard/shared`, and `dashboard/start` are removed in the working tree.
  - Active app/source tree is under `dashboard/src`.
  - Covered by `tests/dashboard/package-assets.test.ts:7-16`.

- TanStack Start is now the dashboard build/runtime path:
  - Scripts use `cd dashboard && vite build`, `vite dev`, and Start/Nitro output at `dashboard/.output/server/index.mjs`: `package.json:104-108`.
  - CLI runtime starts the built TanStack Start server and sets `CARTOGRAPHER_DASHBOARD_ROOT`: `dashboard/src/server/runtime.ts:375-389`.
  - Missing build output fails clearly: `dashboard/src/server/runtime.ts:458-468`.

- Dashboard is not a dummy shell:
  - `DashboardShell` retains overview/topics/documents/graph surfaces and read-only/local live badge behavior: `dashboard/src/App.tsx:25-44`, `dashboard/src/App.tsx:70-143`.
  - Playwright smoke verifies shell, topic route, graph, documents, references, mobile width, live reload, and clean stop: `tests/dashboard/smoke.test.ts:119-198`.

- Read-only API route parity is preserved:
  - Start routes expose GET-only handlers for health, overview, topics, docs, graph, evidence, files, ADRs, index, and events under `dashboard/src/routes/api/**`.
  - Central route contract lists only GET endpoints: `dashboard/src/server/dashboard-api.ts:16-32`.
  - Privacy/read-only regression test asserts no mutating routes: `tests/dashboard/privacy-regressions.test.tsx:28-40`.
  - Start API smoke covers endpoint payloads and private-file blocking: `tests/dashboard/start-api.test.ts:184-280`.

- Chokidar/SSE live reload remains:
  - Private paths are ignored, `_index` is summarized, topic events are debounced and emitted: `dashboard/src/server/live-reload.ts:66-85`, `dashboard/src/server/live-reload.ts:151-188`.
  - SSE stream emits status, reload, and heartbeat events: `dashboard/src/server/live-reload.ts:212-230`.
  - Tests cover private watch filtering and SSE reload behavior: `tests/dashboard/private-watch.test.ts:35-66`, `tests/dashboard/start-api.test.ts:253-273`.

- TanStack DB state is present and read-only:
  - Collections use TanStack DB/query collection and React Query: `dashboard/src/lib/dashboard-db.ts:1-19`.
  - Mutating collection utilities are overridden to throw: `dashboard/src/lib/dashboard-db.ts:55-78`.
  - Live status/latest reload event are written into DB-backed query state: `dashboard/src/lib/dashboard-db.ts:275-284`.

- Safety/private-path behavior remains:
  - Safety layer blocks `.plan/_private` lexically and after realpath resolution: `dashboard/src/server/safety.ts:80-137`.
  - UI/API/privacy regressions cover private content non-disclosure: `tests/dashboard/privacy-regressions.test.tsx:28-88`.

## Validation receipts and helper summaries reviewed

- `receipt:P6:validation:2026-06-11T06:08:12+00:00` — `npm run check` PASS.
- `receipt:P6:validation:2026-06-11T06:08:21+00:00` — topic JSONL + planning graph PASS.
- `receipt:P6:adr:2026-06-11T05:06:30+00:00` — `cartographer_adr validate` passed; ADR-0005 supersedes ADR-0003.
- `validate-topic-summary` for `tanstack-dashboard`: ok, no errors/warnings.
- `context-pack-summary`: reviewed P6 context pack.
- `fact-citation-summary`: supported facts, no missing/unsupported citations.
- `phase-summary` P6: complete.

## Deterministic receipt/report path for parent recording

`/var/home/falco/code/pi-cartographer/feat-tanstack-conversion/.plan/tanstack-dashboard/auditor-full-dashboard-migration-report.md`

## Residual risks

- Smoke/package asset tests are skipped if built Start output is absent, though `npm run check` runs `dashboard:build` first, so the provided PASS receipt covers the intended path.
- Packaged/runtime startup depends on committed or packaged `dashboard/.output/server/index.mjs`; source checkout users must run `npm run dashboard:build` first.