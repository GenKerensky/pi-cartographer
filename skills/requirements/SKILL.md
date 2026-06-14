---
name: "requirements"
description: "Cartographer requirements phase: resolve post-research interview decisions and create scope-gated topic-local requirements deltas before design and planning."
version: 1
updated: "2026-06-12"
---

# Pi Cartographer Requirements

## When to Use

Use this skill after a proposal is accepted when `.plan/<topic>/proposal.md` says `requirements_required: true`, or when the change affects externally visible agent/user behavior, a core user workflow, durable behavior, a public/API contract, migration/security/privacy risk, or comparable product contract.

Requirements capture testable behavior contracts. A change may require requirements even when it does **not** require an ADR; ADRs are for architecture-significant decisions, while requirements are for externally observable behavior and acceptance scenarios.

This phase happens **before design and plan**. It must not be skipped by going directly from proposal to plan.

## Inputs

- `.plan/<topic>/proposal.md`
- `.plan/<topic>/map.nodes.jsonl` / `map.edges.jsonl`
- `.plan/<topic>/facts.nodes.jsonl` / `facts.edges.jsonl`
- Optional `.plan/<topic>/interview.md` / `interview.nodes.jsonl` / `interview.edges.jsonl`

## Outputs

- `.plan/<topic>/requirements.md`
- `.plan/<topic>/requirements.nodes.jsonl`
- `.plan/<topic>/requirements.edges.jsonl`
- validation receipt(s), context pack, auditor PASS, and an approved `requirements` transition gate

## Procedure

1. Confirm the accepted proposal scope gate requires requirements/design artifacts.
2. Exhaust project/research context first. If unresolved user-owned decisions remain, use the `interview` skill one question at a time before finalizing requirements.
3. If no interview is needed, record an explicit interview no-op/skip decision after research exhaustion.
4. Write topic-local requirement deltas, scenarios, acceptance checks, source/fact references, and durable requirement fold targets when known.
5. Validate with `cartographer_jsonl validate-topic` or `manage_jsonl.ts validate-topic`.
6. Create/update a requirements context pack.
7. Run the auditor semantic gate and capture a PASS receipt for `phase_id: "requirements"`.
8. Request and approve the `requirements` transition gate through `cartographer_transition` before design begins.

## Verification

Before leaving this phase:

- Requirement IDs are stable, for example `REQ-*` and `SCN-*`.
- Every durable requirement fact/source claim is supported by fact/source graph edges.
- `requirements.nodes.jsonl` and `requirements.edges.jsonl` validate.
- Interview decisions, when present, are cited into affected requirements.
- A requirements auditor PASS and approved `requirements` transition exist.
