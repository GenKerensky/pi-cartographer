---
adr_id: ADR-0007
title: Split Cartographer proposal design and requirements workflow
status: accepted
decision_date: 2026-06-11
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits:
  - 2ff3963
  - eff968c
  - 25d5198
  - e4dff53
  - caf0f3c
  - f9a2adc
validation_receipts:
  - receipt:P6:validation:2026-06-11T13:52:16+00:00
  - receipt:P6:validation:2026-06-11T13:52:24+00:00
domains:
  - cartographer-workflow
  - requirements
  - design
  - planning
keywords:
  - proposal
  - requirements
  - design
  - OpenSpec
  - docs/requirements
  - scope gate
decision_kind: workflow-architecture
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0007: Split Cartographer proposal design and requirements workflow

## Status

Accepted on 2026-06-11.

## Decision

Adopt a Cartographer-native proposal lifecycle that keeps proposals lightweight and non-design-focused, adds scope-gated topic-local requirements deltas and graph-backed design artifacts before planning, and folds accepted requirement deltas into durable docs/requirements.md or split durable requirements docs without adding a hard OpenSpec runtime dependency.

## Context

The existing proposal workflow overloaded proposal.md with detailed design/architecture content. The accepted proposal-design-split plan requires preserving proposal sections such as Description, Problem Statement, Goals, Non-Goals, Background, Viability, risks, and ADR metadata while moving detailed behavioral requirements and design decisions into dedicated artifacts. Topic-local requirements should map conceptually to OpenSpec changes, remain Cartographer-native first, and fold into durable requirements documentation after acceptance.

## Considered Options

- Keep detailed design inside proposal.md
- Adopt Cartographer-native requirements.md/design.md plus graph JSONL artifacts
- Adopt OpenSpec as a runtime dependency and primary workflow

## Why This Decision

The selected Cartographer-native split preserves lightweight proposal review, gives requirements and design durable graph-backed traceability, supports small-change scope gating, and keeps future OpenSpec import/export possible without coupling the runtime workflow to OpenSpec. Validation receipts show requirements/design validators, workflow skills, fold helper, dashboard/index/reference surfaces, and broad project checks passing.

## Consequences

- Proposals remain focused on problem, goals, viability, risk, scope gate, and ADR metadata rather than detailed architecture.
- Core user workflow or comparable-risk changes can add requirements.nodes/edges and design.nodes/edges before planning.
- Accepted requirement deltas can fold into docs/requirements.md or docs/requirements/<domain>.md with receipts.
- Future OpenSpec adapters remain possible but are not part of the runtime dependency surface.
- Strict-present behavior for requirements/design artifacts is primarily covered by temp/mock-root tests in this implementation topic.

## How to Use This Decision

Use this ADR when changing Cartographer proposal, plan, implementation, requirements, design, fold, dashboard, or indexing workflows. Preserve the scope gate: small non-core-workflow changes may skip requirements/design artifacts, while core workflow or comparable-risk changes should use requirements/design deltas before planning.

## Validation

Validation receipts: receipt:P6:validation:2026-06-11T13:52:16+00:00 (npm run check passed), receipt:P6:validation:2026-06-11T13:52:24+00:00 (topic/planning graph validation and OpenSpec dependency grep passed), final auditor report .plan/proposal-design-split/P6-final-auditor-pass.md.
