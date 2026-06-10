---
adr_id: ADR-0004
title: Use single-writer Cartographer implementation state
status: accepted
decision_date: 2026-06-10
generated_from_topic: sunset-pathfinder
adr_required_source: proposal
legacy_import: false
source_commits: []
validation_receipts:
  - receipt:P0:validation:2026-06-10T06:42:43+00:00
  - receipt:P1:validation:2026-06-10T06:42:48+00:00
  - receipt:P3:validation:2026-06-10T06:42:55+00:00
  - receipt:P3:validation:2026-06-10T06:43:04+00:00
  - receipt:P3:validation:2026-06-10T06:43:12+00:00
  - receipt:P5:validation:2026-06-10T06:43:35+00:00
domains:
  - implementation-workflow
  - subagent-orchestration
  - agent-state
  - validation
keywords:
  - single-writer
  - cartographer-state
  - compaction
  - resume-context
  - pathfinder
  - auditor-gate
decision_kind: workflow-architecture
supersedes:
  - ADR-0002
related: []
precursors: []
children: []
confidence: high
---

# ADR-0004: Use single-writer Cartographer implementation state

## Status

Accepted on 2026-06-10.

## Decision

Cartographer implementation will use the parent/current agent as the default long-horizon writer, supported by minimal .cartographer state, curated journal memory, milestone compaction, controlled resume context rendering, deterministic validation receipts, and read-only specialist gates. The cartographer-pathfinder writer subagent is retired from the default implementation path and retained only as an explicitly opted-in deprecated legacy path.

## Context

The sunset-pathfinder proposal and plan found that the default writer subagent added latency, error surface, and handoff overhead while the parent still had to finish implementation. Long-horizon reliability is better served by externalizing durable execution state to disk while keeping .plan authoritative for planning, receipts, and context packs.

## Considered Options

- Keep cartographer-pathfinder as the default writer subagent under ADR-0002.
- Adopt a single-writer parent implementation loop with .cartographer state/journal, compaction, controlled resume context, and read-only specialists.
- Use a hybrid default where pathfinder remains routine but parent may take over after failures.

## Why This Decision

This keeps one writer in control of the working set, reduces handoff drift, preserves deterministic validation receipts and read-only auditor PASS from ADR-0002, and gives compaction/resume durable state without duplicating the .plan plan graph.

## Consequences

- skills/implement/SKILL.md documents parent/current-agent single-writer execution by default.
- cartographer_state manages state.json, journal.jsonl, current.json, compact-generate, and state-resume through semantic commands.
- cartographer-pathfinder is deprecated from the default path and can only be used as explicit legacy opt-in.
- .plan remains authoritative for plan graph, receipts, and context packs; .cartographer state is execution/resume state only.

## How to Use This Decision

Use this decision when changing Cartographer implementation workflows, state/resume tooling, subagent roles, validation gates, and documentation. Retain deterministic receipts and read-only auditor gates for phase/final acceptance.

## Validation

Validated by receipts receipt:P0:validation:2026-06-10T06:42:43+00:00, receipt:P1:validation:2026-06-10T06:42:48+00:00, receipt:P3:validation:2026-06-10T06:42:55+00:00, receipt:P3:validation:2026-06-10T06:43:04+00:00, receipt:P3:validation:2026-06-10T06:43:12+00:00, and receipt:P5:validation:2026-06-10T06:43:35+00:00.
