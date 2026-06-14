# Implement Retrieval and Delegation Reference

Read when gathering phase context or asking specialists for read-only help.

## Retrieval plan

Before gathering phase context, write 5-10 targeted probes with exact identifiers:

- filenames and directories;
- scripts and commands;
- config keys;
- test names;
- validation IDs;
- error strings;
- relevant requirement/design/fact IDs.

Keep source-code retrieval separate from rationale retrieval:

- code retrieval excludes `.plan/**`;
- rationale retrieval targets `.plan/` and sanitized evidence only;
- raw `.plan/_private/**` is off limits unless the plan explicitly uses synthetic fixtures.

Prefer indexed and focused retrieval:

- `.plan/<topic>/plan.md`;
- map/fact JSONL;
- context packs and receipts;
- `cartographer_index query/read/context`;
- focused `rg`/grep;
- selective `read` calls.

## Specialist use

The parent/current agent is the default writer.

Use specialists only for narrow read-only roles:

- `cartographer-auditor`: phase/final semantic PASS/FAIL after deterministic validation.
- `cartographer-compass`: scope, dependency, repeated-failure, or plan-drift decision advice.
- `cartographer-archivist`: isolated missing research compression.

Do not use deprecated `cartographer-pathfinder` as a routine writer. Built-in `worker`, `reviewer`, `oracle`, `planner`, and `scout` are fallback/substitution paths only.

## Least privilege

Subagents receive artifact paths, summaries, receipts, and explicit output contracts. They should not mutate canonical plan/fact/design/receipt/ADR artifacts unless a narrow structured handoff explicitly grants that scope.
