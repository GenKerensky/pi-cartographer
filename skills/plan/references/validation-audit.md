# Plan Validation and Audit Reference

Read before finalizing a plan or accepting fallback validation.

## Deterministic validation

Before semantic audit:

1. Validate topic JSONL artifacts with `cartographer_jsonl validate-topic` or `manage_jsonl.ts validate-topic`.
2. Validate the plan graph with `skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic <topic> --json`.
3. Record command receipts with `cartographer_validation` and relevant validation IDs.
4. Correct failures through wrappers such as `cartographer_plan`, `cartographer_plan_status`, `cartographer_index`, `cartographer_fact`, or a receipted parent-owned fallback.

If a validator cannot run, stop or get user-approved fallback before accepting the plan. Record the attempted command/tool, failure summary, manual checks, and residual risk.

## Auditor gate

After deterministic receipts pass, capture a `cartographer-auditor` PASS through `cartographer_handoff auditor` when available.

Auditor should check:

- plan Markdown exists;
- plan graph artifacts exist and parse;
- phase IDs, task IDs, and validation IDs are unique;
- dependencies are acyclic and topologically ordered;
- each phase has objective, status, dependencies, checklist, validation, exit criteria, and risks;
- validation commands are valid or explicitly manual;
- behavior-changing validation cites Testing Strategy, requirements, scenarios, and concrete evidence;
- referenced files, indexed nodes, and fact IDs exist;
- cited facts have support edges;
- plan respects proposal goals/non-goals and preserves ADR metadata;
- unresolved decisions are listed rather than hidden.

## Fallbacks

Built-in reviewer/oracle or serial validation are substitutes only when auditor is unavailable, times out, or the user approves. Record fallback through `cartographer_handoff fallback` or `cartographer_receipt` with attempted auditor, reason, substitute reviewer, deterministic receipts, outcome, and residual risks.

`cartographer-compass` may advise on scope/dependency concerns but does not replace the final auditor gate.
