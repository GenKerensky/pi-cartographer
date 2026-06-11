---
adr_id: ADR-0006
title: Use deterministic Cartographer workflow wrappers for lifecycle gates
status: accepted
decision_date: 2026-06-11
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits:
  - 0567193
  - 865d6a4
validation_receipts:
  - receipt:P7:validation:2026-06-11T14:12:11+00:00
domains:
  - workflow
  - planning
  - implementation
  - subagents
keywords:
  - cartographer
  - workflow-wrappers
  - lifecycle-gates
  - human-approval
  - subagent-handoff
decision_kind: architecture
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0006: Use deterministic Cartographer workflow wrappers for lifecycle gates

## Status

Accepted on 2026-06-11.

## Decision

Use deterministic Cartographer workflow wrappers for proposal, planning, implementation, handoff, transition, validation, state, and ADR lifecycle gates instead of prose-only artifact mutation.

## Context

The harness-implement-loop work hardens Pi Cartographer workflows so proposal, plan, implementation phase, final implementation, subagent handoff, and ADR decisions are auditable and resumable. Prior workflows relied on skill prose and manual JSONL/status/receipt edits, which made lifecycle gates hard to validate, easy to skip, and brittle under context compaction. The implementation added wrapper commands/tools, validation receipts, context packs, semantic handoff capture, automatic phase advancement rules, and explicit human approval receipts for major gates.

## Considered Options

- Keep prose-only skill procedures with manual JSONL/status/receipt edits
- Use deterministic wrappers around existing JSONL/state/validation/transition helpers
- Build a new Cartographer-native subagent runner before hardening wrappers

## Why This Decision

Wrappers preserve the existing artifact model while making lifecycle transitions deterministic, testable, receipt-backed, and compatible with parent-owned single-writer implementation. This approach also lets Cartographer evaluate generic subagent reliability through captured handoff outputs and fallback metrics before considering a larger native runner.

## Consequences

- Proposal, plan, implementation, handoff, transition, validation, and ADR mutations must route through wrapper tools when available.
- Automatic implementation phase advancement is the default after validation receipts, captured auditor PASS, checkoff/status synchronization, and commit; human approval is required for proposal-to-plan, plan-to-implementation, explicitly human-gated phases, and final implementation approval.
- Subagent review remains read-only by default and is captured through deterministic PASS/FAIL/decision schemas with fallback receipts when unavailable or unusable.
- Documentation and tests must reject prose-only lifecycle/status/finalization gates unless an explicit fallback receipt records the substitute checks.

## How to Use This Decision

Future Cartographer skills and agents should call cartographer_proposal, cartographer_fact, cartographer_plan, cartographer_plan_status, cartographer_validation, cartographer_implement, cartographer_handoff, cartographer_transition, cartographer_state, and cartographer_adr before falling back to manual edits. Manual fallback requires a receipt with validation evidence and residual risk.

## Validation

Validated in topic harness-implement-loop with npm run check receipt:P7:validation:2026-06-11T14:12:11+00:00 and phase receipts/context packs for P1-P6. Final topic, graph, and ADR validation are recorded in .plan/harness-implement-loop/receipts.jsonl.
