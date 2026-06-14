# Proposal Validation and Audit Reference

Read before accepting/finalizing a proposal or accepting a fallback review.

## Deterministic validation

Before semantic audit, validate topic JSONL artifacts:

```bash
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic <topic> --json
```

Record command results with `cartographer_validation` or approved wrapper receipts. Correct deterministic failures before auditor review.

Validation should cover:

- required proposal sections exist;
- map/fact graph artifacts parse;
- map references resolve to files or indexed nodes;
- proposal fact citations exist as fact nodes;
- cited source-backed facts have `supported_by` edges;
- private-derived facts cite sanitized evidence and redaction status;
- proposal respects goals and non-goals;
- ADR metadata exists and fits evidence;
- scope gate and next-artifact path are explicit.

## Auditor gate

After deterministic validation passes, capture `cartographer-auditor` PASS through `cartographer_handoff auditor` when available.

Provide the auditor:

- proposal path;
- map/fact summaries;
- fact citation summary;
- sanitized evidence summaries when relevant;
- deterministic validation receipt IDs;
- acceptance criteria;
- residual risks.

Auditor returns PASS/FAIL with required corrections. On FAIL, correct narrowly through wrappers, rerun deterministic validation, and re-audit.

## Fallbacks

Built-in reviewer/oracle or serial validation are substitutes only when auditor is unavailable, times out, or the user approves. Record fallback through `cartographer_handoff fallback` or `cartographer_receipt` with attempted auditor, reason, substitute reviewer, deterministic receipts, outcome, and residual risks.

If validators cannot run, stop or get user-approved manual fallback before accepting the proposal.
