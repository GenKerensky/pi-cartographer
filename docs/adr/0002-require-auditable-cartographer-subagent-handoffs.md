---
adr_id: ADR-0002
title: Require auditable Cartographer subagent handoffs
status: accepted
decision_date: 2026-06-08
generated_from_topic: subagent-reliability
adr_required_source: proposal
legacy_import: false
source_commits:
  - 7eebdf2
  - 561050a
  - b0e79b0
  - 59909ff
  - d06ae21
  - 67ef824
  - 82e2739
validation_receipts:
  - receipt:subagent-reliability:validate-topic:2026-06-08T14:14:00Z
  - receipt:subagent-reliability:validate-topic-tooling-update:2026-06-08T15:00:00Z
  - receipt:subagent-reliability:plan-validation:2026-06-08T15:30:00Z
  - receipt:subagent-reliability:P0-validation:2026-06-08T18:05:00Z
  - receipt:subagent-reliability:P1-validation:2026-06-08T18:25:00Z
  - receipt:subagent-reliability:P1-validation-complete:2026-06-08T18:32:00Z
  - receipt:subagent-reliability:P2-validation:2026-06-08T18:45:00Z
  - receipt:subagent-reliability:P3-validation:2026-06-08T19:05:00Z
  - receipt:subagent-reliability:P4-validation:2026-06-08T19:30:00Z
  - receipt:P5:validation:2026-06-08T21:48:07+00:00
  - receipt:P5:validation:2026-06-08T21:48:14+00:00
  - receipt:subagent-reliability:P5-validate-topic:2026-06-08T21:49:00Z
  - receipt:P5:validation:2026-06-08T21:54:23+00:00
  - receipt:P5:validation:2026-06-08T21:54:31+00:00
  - receipt:subagent-reliability:P5-validate-topic:2026-06-08T21:55:00Z
  - receipt:P5:validation:2026-06-08T21:59:29+00:00
  - receipt:P5:validation:2026-06-08T21:59:36+00:00
  - receipt:subagent-reliability:P5-final-validate-topic:2026-06-08T22:10:00Z
  - receipt:P5:validation:2026-06-08T22:02:11+00:00
  - receipt:P5:validation:2026-06-08T22:02:12+00:00
  - receipt:subagent-reliability:P5-final-validate-topic:2026-06-08T22:15:00Z
domains:
  - subagent-orchestration
  - workflow-validation
  - planning-artifacts
keywords:
  - subagents
  - auditor-gate
  - structured-acceptance
  - least-privilege
  - validation-receipts
decision_kind: workflow-architecture
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0002: Require auditable Cartographer subagent handoffs

## Status

Accepted on 2026-06-08.

## Decision

Cartographer workflows will treat delegated subagent work as provisional until parent-owned deterministic validation receipts and a read-only cartographer-auditor PASS exist, with least-privilege helper access, structured acceptance contracts, bounded timeout/control handling, and sanitized evidence boundaries.

## Context

The subagent reliability work responded to sanitized session evidence showing subagent errors, long-running child calls, sparse structured acceptance, and missing timeout/control receipts. The workflow needed durable policy for when child work can be trusted, which tools children may use, and how parent sessions preserve validation evidence without exposing raw private artifacts.

## Considered Options

- Adopt explicit auditor gates with structured pathfinder acceptance, read-only artifact summaries, validation receipts, and fallback/timeout receipts.
- Keep relying on worker-authored summaries and ad hoc parent judgment without deterministic receipts.
- Grant broad mutable JSONL/private/ADR authority to every Cartographer child agent.

## Why This Decision

The accepted option preserves parent authority for canonical checkoff, receipts, ADRs, private intake, staging, and commits while giving children enough read-only context to produce useful work. It directly addresses sanitized reliability findings, keeps private raw artifacts out of committed records, and makes failure/timeout fallbacks auditable.

## Consequences

- Phase handoffs must include context packs, acceptance criteria, evidence requirements, validation IDs, and stop rules.
- Read-only roles remain read-only; mutable JSONL, private evidence import, ADR writes, canonical receipt writes, staging, and commits stay parent-owned unless narrowly scoped.
- Timeouts, unavailable helper tools, repeated unusable child outputs, and fallback substitutions require compact receipts and, when repeated, decision advice before broad parent takeover.
- Validation wrapper receipts are compatibility evidence only and do not replace semantic auditor review or cryptographic signed receipts.

## How to Use This Decision

Use this decision when changing Cartographer proposal, planning, implementation, validation, or subagent prompt workflows. New child tools should default to read-only summaries and require explicit justification before gaining mutation/private/ADR authority.

## Validation

Validated by final P5 receipts for full npm checks (`receipt:P5:validation:2026-06-08T22:02:11+00:00`), planning graph validation (`receipt:P5:validation:2026-06-08T22:02:12+00:00`), topic validation (`receipt:subagent-reliability:P5-final-validate-topic:2026-06-08T22:15:00Z`), and cartographer-auditor PASS (`receipt:subagent-reliability:P5-auditor-pass:2026-06-08T22:00:00Z`). Raw private artifacts were not cited; sanitized evidence docs and receipts are the durable evidence.
