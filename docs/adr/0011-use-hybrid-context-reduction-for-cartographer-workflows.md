---
adr_id: ADR-0011
title: Use Hybrid Context Reduction for Cartographer Workflows
status: accepted
decision_date: 2026-06-14
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits:
  - fbce6ae
  - 2afc663
  - 117697e
  - e4fd1fd
  - 7cf0b1c
  - 05817b5
validation_receipts:
  - receipt:P4:validation:2026-06-14T16:35:03+00:00
  - receipt:context-bloat-audit:audit:2026-06-14T16:37:04Z
  - receipt:P5:validation:2026-06-14T16:42:15+00:00
  - receipt:context-bloat-audit:audit:2026-06-14T16:47:00Z
  - receipt:P6:validation:2026-06-14T16:48:32+00:00
domains:
  - cartographer-context
  - agent-workflow
  - skill-packaging
  - tool-schema
keywords:
  - context-bloat
  - resume-primer
  - skill-kernel
  - AGENTS.md
  - tool-schema
  - Cartographer
decision_kind: architecture
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0011: Use Hybrid Context Reduction for Cartographer Workflows

## Status

Accepted on 2026-06-14.

## Decision

Use a hybrid context-reduction architecture for Cartographer workflows: deterministic context inventory, compact high-use skill kernels with one-level references, scoped AGENTS.md locality, bounded state-aware resume primers, and measurement-gated tool/schema reduction.

## Context

The context-bloat-audit topic found significant context load from high-use workflow skills, scoped instruction files, compaction/resume narrative, and Cartographer extension tool schemas. The implementation completed phases P0-P5 with validation receipts and auditor PASS gates showing measurable reductions while preserving wrapper, validation, privacy, and lifecycle guardrails.

## Considered Options

- Keep existing large skills and rely on transcript compaction
- Split skills only and leave resume/tool schema behavior unchanged
- Aggressively hide or defer tool schemas before measurement
- Adopt the implemented hybrid phased migration

## Why This Decision

The hybrid approach addresses all observed bloat families while reducing risk through inventory-first measurement, one-level references, deterministic resume-primer tooling, scoped instruction ownership, guardrail-preserving schema text reductions, validation receipts, and auditor gates. Deeper active-tool profiles are deferred because P5 measurements show full schemas dominate overhead and hiding wrappers could reduce auditability without a separate design/ADR.

## Consequences

- High-use skills should remain compact kernels and place low-frequency detail in one-level references.
- Future skill-packaging changes should update context inventory budgets and keep skill kernels/references executable without historical bookkeeping.
- Post-compaction implementation should use cartographer_state resume-primer before reading expanded state-resume context.
- Tool/schema reductions must preserve wrapper visibility unless a follow-up design/ADR validates active-tool profiles or deferred discovery.
- Durable requirements for context inventory, scoped instructions, resume primers, and behavior-preserving migration are folded into docs/requirements.md.

## How to Use This Decision

Use this ADR when changing Cartographer skill packaging, scoped instruction ownership, implementation resume behavior, or extension tool-loading/schema strategy.

## Validation

Validated by context-bloat-audit receipts through P5, including final inventory, P1/P2/P3/P4/P5 auditor PASS reports, resume-primer tests/smoke evidence, tool inventory evidence, and topic validation receipts.
