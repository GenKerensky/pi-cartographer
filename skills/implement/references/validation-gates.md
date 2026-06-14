# Implement Validation and Gates Reference

Read when preparing phase validation, auditor handoff, fallback review, or final implementation validation.

## Deterministic validation

- Run narrow checks first, then broader checks when needed.
- Prefer existing project commands from `package.json`, plan validation items, and phase notes.
- Record command checks with `cartographer_validation` and phase-specific validation IDs.
- If a command fails, summarize the first useful failure, fix narrowly, rerun the failed command and dependent checks, and record new receipts.
- Limit routine repair loops to three scoped attempts per distinct failing command; after that, call `cartographer-compass` or stop for user direction.

## Phase auditor gate

After deterministic validation passes:

1. Create/update a phase context pack.
2. Launch read-only `cartographer-auditor` or capture through `cartographer_handoff auditor`.
3. Provide phase text, current diff/stat, changed files, validation receipts, checked items, relevant requirements/design IDs, and context-pack ID.
4. Require PASS/FAIL with required corrections.
5. On FAIL, fix narrowly, rerun affected checks, update receipts/state, and re-audit.

## Fallbacks

- Use built-in reviewer/oracle or serial review only if `cartographer-auditor` is unavailable, times out, or the user approves substitution.
- Record fallback through `cartographer_handoff fallback` or `cartographer_receipt` with attempted tool/agent, reason, substitute reviewer, outcome, and residual risk.
- Do not treat `cartographer-compass` as the semantic auditor; compass is for scope/dependency/repeated-failure advice.

## Final validation

Before final implementation completion:

- Run topic validation with `manage_jsonl.ts validate-topic`.
- Run planning graph validation with `validate_planning_graph.py`.
- Run full project validation such as `npm run check` when feasible.
- Capture final auditor PASS.
- Complete ADR and requirements-fold handling when required by the plan.
