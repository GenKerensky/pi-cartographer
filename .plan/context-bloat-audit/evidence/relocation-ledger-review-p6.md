# P6 Relocation Ledger Review

## Scope

Reviewed relocation ledgers for the high-use skill kernel splits:

- `skills/implement/rule-relocation-ledger.md`
- `skills/plan/rule-relocation-ledger.md`
- `skills/proposal/rule-relocation-ledger.md`

## Result

PASS.

Each ledger records original rule areas, the new home, and rationale. The ledgers explicitly state that no safety, privacy, wrapper, validation, ADR, fact-support, requirements/design gate, or human-gate rule was intentionally deleted without a new home.

## Coverage notes

- Implement split: state/source boundaries, single-writer execution, wrapper lifecycle, validation/auditor gates, compaction, requirements fold, ADR, retrieval, and commit/status discipline are mapped to the kernel or one-level references.
- Plan split: activation boundary, requirements/design gates, testing strategy, wrapper sequence, graph validation, auditor criteria, retrieval/delegation, and lifecycle/fact/ADR rules are mapped.
- Proposal split: private evidence, ADR evaluation, index/map/fact support, scope gate, deterministic validation/auditor gate, and delegation rules are mapped.

## Residual risk

Ledger review is a static completeness check. P1/P2 dry-runs, check-language validation, and auditor PASS receipts provide the behavioral evidence that required rules remain reachable.
