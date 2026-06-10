# tanstack-dashboard Proposal Serial Audit

Decision: PASS

## Reviewed

- `.plan/tanstack-dashboard/proposal.md`
- `.plan/tanstack-dashboard/map.nodes.jsonl`
- `.plan/tanstack-dashboard/map.edges.jsonl`
- `.plan/tanstack-dashboard/facts.nodes.jsonl`
- `.plan/tanstack-dashboard/facts.edges.jsonl`
- `.plan/tanstack-dashboard/context-packs.jsonl`
- `.plan/tanstack-dashboard/receipts.jsonl`

## Deterministic validation

- `receipt:proposal:validation:2026-06-10T06:04:51+00:00` passed `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic tanstack-dashboard --json`.
- `cartographer_artifacts validate-topic-summary` reported 33 map nodes, 46 map edges, 40 fact nodes, 27 fact edges, one receipt, one context pack, and zero errors/warnings after the receipt was appended.
- `cartographer_artifacts fact-citation-summary` reported proposal citations F001-F015, no missing citations, and no unsupported facts.

## Semantic audit

The proposal satisfies the requested scope: convert the dashboard to a TanStack Start single full-stack app, add TanStack DB-backed realtime dashboard state, keep Chokidar as the filesystem watcher, and preserve the local read-only/private-safe CLI and skill UX.

Required sections are present: Description, Problem Statement, Goals, Non-Goals, Background, Viability, ADR Metadata, and Design. The design is staged and calls out a runtime spike before removing the current Hono runtime, which is appropriate given package/runtime risk.

ADR metadata is appropriate: `adr_required: true` because the proposal changes the accepted dashboard platform/state-management stack in ADR-0003.

## Required corrections

None.

## Residual risks

- TanStack Start's Node runtime/build entrypoint must be proven before Hono runtime code is deleted.
- TanStack DB should start as read-only query-backed collections; any local patching from live events needs tests to prevent accidental artifact-write semantics.
- The final implementation should generate or explicitly supersede/amend ADR-0003 after validation receipts exist.

## Fallback note

The default Cartographer subagent audit could not run because the provider reported a missing OpenRouter API key. The user approved a serial current-agent audit fallback.
