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
3. Write design decisions, rejected alternatives, components, risks, constraints, mitigations, and any required `Testing Strategy` in `design.md`.
4. Route graph record changes through the dedicated design wrapper/script when available. Until a dedicated wrapper exists, use a parent-owned `cartographer_jsonl({"action":"upsert", ...})` or `manage_jsonl.ts upsert` fallback for `design.nodes.jsonl` and `design.edges.jsonl`, preserving links to `REQ-*`, `SCN-*`, and fact IDs, then run `cartographer_jsonl({"action":"validate-topic", ...})` or `manage_jsonl.ts validate-topic`.
5. If new unresolved user-owned decisions appear, re-enter the `interview` skill one question at a time, then update requirements/design accordingly.
6. Validate with `cartographer_jsonl validate-topic` or `manage_jsonl.ts validate-topic`.
7. Create/update a design context pack.
8. Run the auditor semantic gate and capture a PASS receipt for `phase_id: "design"`. Auditor input MUST include Testing Strategy evidence, requirement/scenario coverage summary, deterministic validation receipt IDs, context-pack ID, unresolved-decision notes, and the parent receipt output path when a Testing Strategy is present.
9. Request and approve the `design` transition gate through `cartographer_transition` before planning begins.

## Testing Strategy

For behavior-changing topics, `design.md` MUST include a project-specific `Testing Strategy` section before planning. Keep it concise and evidence-backed; do not paste generic testing advice.

Include:

- detected language(s), app/change type, existing test tools/scripts, test directories, static checks, and CI conventions;
- related ADRs searched or listed; accepted related ADRs are binding context, and supersession requires a new ADR;
- official docs or source-backed facts used for test framework guidance;
- unit, integration, and E2E strategy, including which layers are recurring CI, one-time smoke/harness, or manual-assisted;
- at least one named E2E validation that must run at least once, or a blocker requiring `interview`/user approval;
- a requirement/scenario coverage expectation: every topic-generated `REQ-*` and `SCN-*` must map to planned validation or an explicit non-test/manual evidence exception;
- major testing-tool additions, removals, replacements, or project-wide standards as user-owned decisions and ADR evaluation/generation triggers.

Escalate instead of guessing:

- use researcher/archivist when framework docs, best practices, or project evidence are missing or stale;
- use `cartographer-compass` when trade-offs, ADR conflicts, E2E recurrence, or validation sufficiency are unclear;
- use `interview` when the remaining decision is user-owned, including tool pivots, ADR supersession, validation cost/risk, or manual-assisted E2E approval.

## Verification

Before leaving this phase:

- Design sources use `design.md#heading` anchors.
- Every design decision that satisfies behavior links to requirement IDs.
- Alternatives and risks are represented in the design graph.
- `design.nodes.jsonl` and `design.edges.jsonl` validate.
- A design auditor PASS and approved `design` transition exist.
