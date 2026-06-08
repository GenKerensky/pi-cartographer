---
adr_id: ADR-0001
title: Record ADR management workflow
status: accepted
decision_date: 2026-06-08
generated_from_topic: adr-feature
adr_required_source: proposal
legacy_import: false
source_commits:
  - 74a8647
  - 0bbb48a
  - 455cbae
  - e2464c0
  - 6d0ef36
  - 64736d1
  - efa4c78
validation_receipts:
  - receipt:planning:validation:2026-06-08T03:30:00Z
  - receipt:planning:auditor-repair:2026-06-08T03:45:00Z
  - receipt:planning:auditor-repair:2026-06-08T04:00:00Z
  - receipt:P0:validation:2026-06-08T04:20:00Z
  - receipt:P0:auditor-repair:2026-06-08T04:35:00Z
  - receipt:P1:validation:2026-06-08T05:20:00Z
  - receipt:P1:auditor-repair:2026-06-08T05:35:00Z
  - receipt:P2:validation:2026-06-08T06:05:00Z
  - receipt:P2:auditor-repair:2026-06-08T06:25:00Z
  - receipt:P3:implementation:2026-06-08T01:51:00Z
  - receipt:P4:implementation:2026-06-08T02:02:00Z
  - receipt:P5:implementation:2026-06-08T02:08:00Z
  - receipt:P6:implementation:2026-06-08T02:13:00Z
domains:
  - architecture-records
  - workflow
keywords:
  - adr
  - cartographer
  - decision-records
decision_kind: feature-architecture
supersedes: []
related: []
precursors: []
children: []
confidence: ""
---

# ADR-0001: Record ADR management workflow

## Status

Accepted on 2026-06-08.

## Decision

Add metadata-gated ADR management to Cartographer workflows.

## Context

Cartographer now needs a durable way to evaluate, create, validate, search, relate, and import Architecture Decision Records after proposal and implementation validation.

## Considered Options

- Metadata-gated ADR workflow
- Keep ADR generation out of scope
- Manual-only ADR files

## Why This Decision

A metadata-gated workflow preserves minimalism while creating durable decision records only when proposals require them and validation evidence exists.

## Consequences

- Proposal and plan workflows carry adr_required metadata.
- Implementation finalization writes ADRs or explicit skip receipts after validation.
- ADR Markdown is searchable as documentation while graph currentness is handled by cartographer_adr.

## How to Use This Decision

Use cartographer_adr for future ADR evaluation, creation, lookup, relationship, import, and validation workflows.

## Validation

Validated by npm run check, topic JSONL validation, planning graph validation, and adr_records.py validate.
