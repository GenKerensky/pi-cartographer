# Proposal Retrieval and Delegation Reference

Read when gathering proposal context or using specialists.

## Retrieval plan

Before map generation, optional scouting, or broad reading, write 5-10 targeted probes with exact identifiers:

- filenames/directories;
- commands, tests, scripts, and config keys;
- error strings;
- dependencies/tools;
- related proposal/plan/fact IDs;
- constrained generic terms.

Keep scopes separate:

- code retrieval excludes `.plan/**`;
- rationale retrieval targets `.plan/` and sanitized evidence only;
- raw `.plan/_private/**` is off limits except redactor-only raw intake.

Prefer `cartographer_index query/read/context`, map/fact summaries, focused `rg`/grep, and selective reads. Treat index/map results as candidates until verified by read/search/validation.

## Specialist roles

Call `subagent({action:"list"})` before delegation.

Preferred roles:

- `cartographer-archivist`: missing research compression.
- `cartographer-drafter`: proposal or next-artifact synthesis.
- `cartographer-compass`: scope, dependency, and consistency checks.
- `cartographer-auditor`: final semantic gate after deterministic validation.
- `cartographer-redactor`: raw private artifact analysis only.

Built-in `scout`, `researcher`, `planner`, `oracle`, and `reviewer` are fallback/substitution choices, not defaults.

If no executable subagents are available, ask whether to continue serially before proceeding beyond initialization. Serial mode still performs distinct scope, mapping, research, planner, compass/oracle, and validation passes.

## Least privilege

The parent owns canonical proposal/map/fact writes, receipt decisions, ADR evaluation, and raw private intake. Children receive artifact paths, helper summaries, deterministic receipts, sanitized evidence, and explicit output contracts.

Use `outputMode: file-only` for large child outputs. Do not grant broad mutable JSONL, private artifact, ADR write, or receipt authority by default.
