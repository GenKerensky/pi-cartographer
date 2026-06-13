---
adr_id: ADR-0008
title: Add post-research interview gate to Cartographer workflow
status: accepted
decision_date: 2026-06-12
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits: []
validation_receipts:
  - receipt:P5:validation:2026-06-12T22:18:06+00:00
  - receipt:P5:validation:2026-06-12T22:18:11+00:00
  - receipt:P5:validation:2026-06-12T22:18:20+00:00
domains:
  - workflow
  - planning
  - requirements
  - design
keywords:
  - interview
  - post-research
  - requirements
  - design
  - cartographer
decision_kind: workflow-lifecycle
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0008: Add post-research interview gate to Cartographer workflow

## Status

Accepted on 2026-06-12.

## Decision

Cartographer will support an optional post-research interview gate for scoped/core workflow changes when relevant research is exhausted and unresolved user-owned decisions remain. Interview decisions are recorded in topic-local interview.md, interview.nodes.jsonl, and interview.edges.jsonl, then copied or cited into requirements/design artifacts before planning and implementation.

## Context

The interview-process implementation changes the durable Cartographer lifecycle by adding a clarification step between accepted proposal research and requirements/design work, with possible re-entry from requirements/design when new user-owned ambiguity appears. Existing proposal, requirements, design, plan, validation receipts, and implementation commits establish the behavior and guardrails.

## Considered Options

- No interview gate; continue directly from proposal to requirements/design
- Immediate interview before research
- Post-research interview gate with hybrid interview artifacts
- Persistent dashboard mockup/interview editor

## Why This Decision

The post-research gate avoids asking users questions that code, docs, prior art, or best practices can answer, while still capturing decisions that only the user can make. Hybrid interview artifacts preserve the decision trail without making chat transcript state authoritative, and requirements/design artifacts remain the implementation source of truth. Preview-first mockup guidance supports UI decisions without introducing a persistent editor in v1.

## Consequences

- Agents must exhaust relevant research before asking interview questions.
- Interview artifacts are optional and topic-local but validated when present.
- Requirements/design remain authoritative for implementation behavior and design decisions.
- Specialists consume interview summaries read-only.
- Persistent editor/dashboard authoring remains deferred.

## How to Use This Decision

Use this ADR when changing Cartographer lifecycle gates, interview artifact schemas, requirements/design handoff behavior, or future dashboard authoring support for interviews.

## Validation

Implemented and validated by receipts receipt:P5:validation:2026-06-12T22:18:06+00:00, receipt:P5:validation:2026-06-12T22:18:11+00:00, receipt:P5:validation:2026-06-12T22:18:20+00:00, and prior phase audit receipts through P4.
