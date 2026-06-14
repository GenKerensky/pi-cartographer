# P1 Implement Skill Dry-Run Evidence

## Scope

Manual/static dry-run after compacting `skills/implement/SKILL.md`.

## Checks

- Activation path remains in kernel: use when implementing `.plan/<topic>/plan.md`.
- Source of truth remains in kernel: plan Markdown/JSONL, receipts, context packs, and state files.
- Wrapper sequence remains discoverable:
  - `cartographer_implement start`
  - `cartographer_implement step`
  - `cartographer_plan_status`
  - `cartographer_state`
  - `cartographer_validation`
  - `cartographer_handoff auditor`
  - `cartographer_implement record`
  - `cartographer_implement compact`
- Stop conditions remain discoverable: unrelated changes, missing plan, open questions, validation/auditor failures, ADR/fold handling.
- Specialist policy remains discoverable: parent is writer; auditor/compass/archivist are read-only roles; pathfinder is not routine writer.
- Required details are reachable through named one-level references:
  - `references/execution-loop.md`
  - `references/validation-gates.md`
  - `references/state-compaction.md`
  - `references/retrieval-delegation.md`
  - `references/finalization-adr.md`

## Result

PASS: the compact kernel identifies the next wrapper action and required references without loading the legacy full skill body. The relocation ledger records the new home for moved rule families.
