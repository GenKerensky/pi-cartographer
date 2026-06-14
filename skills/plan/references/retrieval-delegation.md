# Plan Retrieval and Delegation Reference

Read when gathering planning context or using specialists.

## Retrieval plan

Before broad reading or optional scout, write 5-10 targeted probes with exact identifiers:

- filenames and directories;
- tests and scripts;
- commands and config keys;
- generated artifacts;
- error strings;
- requirement/design/fact IDs;
- constrained generic terms.

Keep scopes separate:

- code retrieval excludes `.plan/**`;
- rationale retrieval targets `.plan/` and sanitized evidence only;
- raw `.plan/_private/**` is off limits.

Prefer deterministic context:

- `.plan/<topic>/proposal.md`;
- map/fact JSONL;
- requirements/design graphs;
- `cartographer_index query/read/context`;
- focused `rg`/grep;
- selective `read` calls.

Treat retrieved rationale as historical evidence requiring freshness checks.

## Specialist roles

Call `subagent({action:"list"})` before delegation.

Preferred roles:

- `cartographer-drafter`: phase planning from compact proposal/map/fact/context-pack inputs.
- `cartographer-auditor`: final semantic plan review after deterministic validation.
- `cartographer-compass`: phase dependency, scope, or decision-consistency conflicts.
- `cartographer-archivist`: isolated missing research compression.

Built-in `scout`, `planner`, `oracle`, `reviewer`, and `researcher` are fallback/substitution choices, not defaults.

If no executable subagents are available, ask whether to continue serially before proceeding beyond artifact inspection. If an exact preferred agent is unavailable, ask before substituting.

## Least privilege

The parent owns canonical plan graph, receipt, fact, and ADR decisions. Give children artifact paths, helper summaries, deterministic receipts, and explicit output contracts. Use `outputMode: file-only` for large draft/review outputs.

Do not grant broad mutable JSONL, private artifact, ADR write, or receipt authority by default.
