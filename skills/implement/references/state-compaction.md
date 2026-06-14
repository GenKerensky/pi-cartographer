# Implement State and Compaction Reference

Read when resuming implementation, changing phase state, or compacting context.

## State boundaries

- `.cartographer/<topic>/state.json` is compact execution/resume state only.
- `.cartographer/<topic>/journal.jsonl` is for durable lessons, gotchas, constraints, and phase summaries only.
- `.cartographer/current.json` is an ignored local hint and never authoritative.
- `.plan/<topic>/plan.md`, plan JSONL, receipts, and context packs remain authoritative for plan/checkoff/validation history.

## State mutations

Use semantic commands/tools rather than direct JSON edits:

- `cartographer_state state-init`
- `cartographer_state state-validate`
- `cartographer_state state-set-next`
- `cartographer_state state-set-working-set`
- `cartographer_state state-record-validation-ref`
- `cartographer_state journal-append`
- `cartographer_state current-set`
- `cartographer_state compact-generate`
- `cartographer_state state-resume`

Direct edits are an escape hatch only; run state validation immediately afterward.

## Journal rules

Append only high-value durable records:

- phase summaries;
- important constraints;
- surprising gotchas;
- decisions that affect future resume.

Do not store raw logs, full command output, transcripts, routine receipts, or private content.

## Compaction flow

At phase end or major milestone:

1. Record validation refs with `cartographer_implement record`.
2. Run `cartographer_implement compact` or `cartographer_state compact-generate`.
3. Use `cartographer_compact_context` when available to request actual Pi transcript compaction.
4. Include topic, phase, next action, working set, validation refs, blockers, and compact summary.
5. Re-orient from `state-resume` after compaction.

`compact-generate` writes Cartographer resume state; it is not the same as Pi transcript compaction.
