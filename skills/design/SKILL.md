---
name: "design"
description: "Cartographer design phase: create graph-backed design decisions and alternatives after requirements, before plan generation."
version: 1
created: "2026-06-12"
updated: "2026-06-12"
---

# Pi Cartographer Design

## When to Use

Use this skill after requirements are approved for a scoped Cartographer topic. The design phase is a dedicated pre-plan gate, not content to remove or silently fold back into proposal/plan.

## Inputs

- `.plan/<topic>/proposal.md`
- `.plan/<topic>/requirements.md`
- `.plan/<topic>/requirements.nodes.jsonl` / `requirements.edges.jsonl`
- Optional `.plan/<topic>/interview.md` / `interview.nodes.jsonl` / `interview.edges.jsonl`
- `.plan/<topic>/map.nodes.jsonl` / `map.edges.jsonl`
- `.plan/<topic>/facts.nodes.jsonl` / `facts.edges.jsonl`

## Outputs

- `.plan/<topic>/design.md`
- `.plan/<topic>/design.nodes.jsonl`
- `.plan/<topic>/design.edges.jsonl`
- validation receipt(s), context pack, auditor PASS, and an approved `design` transition gate

## Procedure

1. Confirm the `requirements` transition gate is approved, or stop and complete the requirements phase first.
2. Use requirements and accepted interview decisions as the behavioral contract.
3. Write design decisions, rejected alternatives, components, risks, constraints, and mitigations in `design.md`.
4. Route graph record changes through the dedicated design wrapper/script when available. Until a dedicated wrapper exists, use a parent-owned `cartographer_jsonl({"action":"upsert", ...})` or `manage_jsonl.ts upsert` fallback for `design.nodes.jsonl` and `design.edges.jsonl`, preserving links to `REQ-*`, `SCN-*`, and fact IDs, then run `cartographer_jsonl({"action":"validate-topic", ...})` or `manage_jsonl.ts validate-topic`.
5. If new unresolved user-owned decisions appear, re-enter the `interview` skill one question at a time, then update requirements/design accordingly.
6. Validate with `cartographer_jsonl validate-topic` or `manage_jsonl.ts validate-topic`.
7. Create/update a design context pack.
8. Run the auditor semantic gate and capture a PASS receipt for `phase_id: "design"`.
9. Request and approve the `design` transition gate through `cartographer_transition` before planning begins.

## Verification

Before leaving this phase:

- Design sources use `design.md#heading` anchors.
- Every design decision that satisfies behavior links to requirement IDs.
- Alternatives and risks are represented in the design graph.
- `design.nodes.jsonl` and `design.edges.jsonl` validate.
- A design auditor PASS and approved `design` transition exist.
