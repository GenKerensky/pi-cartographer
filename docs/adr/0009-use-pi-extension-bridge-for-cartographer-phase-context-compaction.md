---
adr_id: ADR-0009
title: Use Pi extension bridge for Cartographer phase context compaction
status: accepted
decision_date: 2026-06-12
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits: []
validation_receipts:
  - receipt:P3:validation:2026-06-12T21:50:05+00:00
  - receipt:P3:validation:2026-06-12T21:50:03+00:00
  - receipt:P3:validation:2026-06-12T21:50:04+00:00
  - receipt:P3:validation-jsonl:2026-06-12T21:50:11+00:00
  - receipt:P3:validation-graph:2026-06-12T21:50:11+00:00
  - receipt:P3:validation:2026-06-12T21:52:10+00:00
domains:
  - workflow
  - pi-extension
  - compaction
keywords:
  - ctx.compact
  - cartographer_compact_context
  - compact-generate
  - state-resume
  - context threshold
decision_kind: workflow-runtime-policy
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0009: Use Pi extension bridge for Cartographer phase context compaction

## Status

Accepted on 2026-06-12.

## Decision

Cartographer will bridge phase-end and threshold context management to Pi's real context compaction by adding a package extension tool/hook that calls ctx.compact() with bounded Cartographer customInstructions after durable state snapshots are written.

## Context

Cartographer compact-generate creates resume state but does not prune Pi transcript context. Prior session evidence showed phase snapshots did not prevent near-limit context usage. Pi's extension API exposes ctx.compact(), ctx.getContextUsage().percent, and compaction lifecycle events, allowing a package-level bridge without modifying Pi core.

## Considered Options

- Explicit cartographer_compact_context tool plus threshold hook
- Only observe cartographer_state compact-generate results
- Only use threshold-based turn_end compaction
- Replace Pi's compaction summarizer through session_before_compact

## Why This Decision

The hybrid explicit tool plus threshold hook preserves parent workflow control at phase boundaries while still catching unusually long phases. Additive customInstructions keep Pi's default summarizer and inject bounded state-resume/implement-skill continuation context without directly editing session JSONL.

## Consequences

- Implementation workflows must call cartographer_compact_context after phase-end state snapshots when available.
- Threshold compaction is gated by active Cartographer state and cooldown to avoid surprise loops.
- compact-generate remains a state snapshot, not a transcript compaction mechanism.
- Future tuning may adjust the default 60 percent threshold based on observed workflow disruption.

## How to Use This Decision

Use this ADR when changing Cartographer implementation compaction behavior, extension hooks, or summary prompts. Keep state snapshot and transcript compaction concepts distinct.

## Validation

Validated by receipts receipt:P3:validation:2026-06-12T21:50:05+00:00, receipt:P3:validation:2026-06-12T21:50:03+00:00, receipt:P3:validation:2026-06-12T21:50:04+00:00, receipt:P3:validation-jsonl:2026-06-12T21:50:11+00:00, receipt:P3:validation-graph:2026-06-12T21:50:11+00:00, and receipt:P3:validation:2026-06-12T21:52:10+00:00.
