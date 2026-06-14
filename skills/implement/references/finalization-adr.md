# Implement Finalization, Requirements Fold, and ADR Reference

Read during final implementation phases or when ADR/requirements fold handling is due.

## Requirements fold

Topic-local requirements are deltas. When the plan requires a durable fold:

1. Preserve stable requirement and scenario IDs.
2. Cite source topic, validation receipts, and audit receipts.
3. Fold accepted deltas into `docs/requirements.md` or the approved durable requirements location.
4. Record a `requirements-fold` receipt, or an approved `requirements-fold-skip` receipt when folding is intentionally deferred/skipped.

If the durable requirements container is absent and the plan requires it, initialize with:

```bash
python skills/plan/scripts/requirements_records.py init --root "$PWD" --json
```

## ADR handling

Honor ADR metadata from proposal/plan/design.

- If `adr_required: true`, use `cartographer_adr` after deterministic validation and cite receipt IDs/source commits.
- If no ADR is required, record the reason with a receipt when applicable.
- ADRs must cite sanitized evidence docs and validation receipts, never raw `.plan/_private/**` paths or raw transcript content.

## Final implementation gate

Before reporting implemented:

1. Ensure all phases are complete in `plan.md` and `plan.nodes.jsonl`.
2. Run topic validation and planning graph validation.
3. Run full project validation or record an approved scoped-check rationale.
4. Capture final read-only auditor PASS.
5. Resolve ADR and requirements-fold handling.
6. Run `cartographer_implement finalize`.
