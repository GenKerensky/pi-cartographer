---
adr_id: ADR-0010
title: Use user-configurable model routing and deterministic fallback setup for Cartographer
status: accepted
decision_date: 2026-06-13
generated_from_topic: ""
adr_required_source: manual
legacy_import: false
source_commits: []
validation_receipts:
  - receipt:model-optimization:validation:2026-06-13T18:31:54Z
  - receipt:model-optimization:audit:2026-06-13T18:31:49Z
domains:
  - workflow
  - subagents
  - model-routing
  - configuration
keywords:
  - model routing
  - OpenAI Codex
  - fallback
  - subagents
  - settings
  - reasoning
  - xhigh
decision_kind: workflow-policy
supersedes: []
related: []
precursors: []
children: []
confidence: high
---

# ADR-0010: Use user-configurable model routing and deterministic fallback setup for Cartographer

## Status

Accepted on 2026-06-13.

## Decision

Cartographer will use user-scope settings for model routing and fallback preferences, provide an interactive setup workflow that recommends provider/model choices, route settings writes through a deterministic JSON Schema and available-model validated writer, and implement bounded fallback behavior for Cartographer-controlled model calls with explicit cross-provider approval.

## Context

Cartographer's OpenAI Codex subscription model usage needs to be optimized so GPT-5.5 is reserved for high-reasoning tasks, GPT-5.3-Codex-Spark is used for drafting, and expensive high/xhigh usage is not inherited accidentally by every subagent. The accepted model-optimization proposal, requirements, design, and plan establish that provider/subscription preferences are user-owned, that missing config must trigger an interactive setup workflow, and that all config writes must be deterministic and validated. Existing ADRs require auditable subagent handoffs, parent single-writer implementation state, and deterministic workflow wrappers.

## Considered Options

- User-scope settings with interactive setup workflow and deterministic settings writer (accepted)
- Project .pi/settings.json as primary config
- Agent frontmatter pins as primary config
- No automatic fallback / manual resume only
- Pi core parent-model fallback instead of Cartographer workflow wrapper

## Why This Decision

User-scope settings avoid committing personal subscription/provider choices and surprise costs to the repository. An interactive setup skill lets the user choose providers while still receiving role-specific recommendations based on cost, speed, thinking capability, context, modality, and safety. A deterministic writer prevents malformed settings or hallucinated model IDs by validating JSON Schema and available models before atomic writes. Bounded fallback with receipts keeps Cartographer workflows resilient while preserving auditability and cross-provider cost approval.

## Consequences

- Cartographer implementation must add deterministic settings validation/writing rather than direct LLM edits to user settings.
- Cartographer implementation must add or document an interactive model-config setup skill/workflow.
- Subagent routing defaults become explicit user-configurable policy rather than implicit parent-model inheritance.
- Cross-provider fallback remains approval-gated to avoid surprise API cost.
- Live smoke validation must use cheap/free model paths when available and stop for approval otherwise.
- Runtime fallback scope remains Cartographer-controlled calls; it does not hot-swap Pi's active parent model mid-response.

## How to Use This Decision

Future Cartographer model-routing, setup, and fallback work must preserve user-owned provider preferences, deterministic settings writes, no xhigh defaults, explicit cross-provider approval, and auditable fallback receipts. New model/provider recommendations should flow through the setup workflow and deterministic writer rather than direct settings edits.

## Validation

Accepted topic artifacts: .plan/model-optimization/proposal.md, requirements.md, design.md, plan.md. Validation receipts include topic/graph validation and auditor PASS receipts through the model-optimization workflow.
