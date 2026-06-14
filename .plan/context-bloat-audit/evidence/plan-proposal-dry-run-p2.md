# P2 Plan/Proposal Skill Dry-Run Evidence

## Scope

Manual/static dry-run after compacting `skills/plan/SKILL.md` and `skills/proposal/SKILL.md`.

## Plan skill checks

- Activation path remains in kernel: use for `.plan/<topic>/plan.md` delivery/execution plans, not implementation.
- Source of truth remains in kernel: `plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`, and upstream proposal/map/fact/requirements/design artifacts.
- Wrapper sequence remains discoverable:
  - `cartographer_plan generate-graph`
  - `cartographer_plan_status` / validation completion wrappers where applicable
  - topic JSONL validation
  - planning graph validation
  - `cartographer_handoff auditor`
  - `cartographer_plan finalize`
- Required gates remain discoverable: requirements/design approval, Testing Strategy trace, ADR metadata preservation, deterministic validation, auditor PASS, and approved fallback only when necessary.
- References are one level deep:
  - `references/inputs-gates.md`
  - `references/drafting-graph.md`
  - `references/validation-audit.md`
  - `references/retrieval-delegation.md`
  - `references/context-inventory.md`

## Proposal skill checks

- Activation path remains in kernel: use for `.plan/<topic>/proposal.md` proposals.
- Source of truth remains in kernel: proposal, map/fact JSONL, sanitized evidence, and shared index artifacts.
- Wrapper sequence remains discoverable:
  - `cartographer_proposal init`
  - `cartographer_evidence import` for private inputs
  - `cartographer_adr evaluate`
  - `cartographer_fact` source/fact/support calls
  - topic JSONL validation
  - `cartographer_handoff auditor`
  - `cartographer_proposal adr-sync` / `finalize`
- Required gates remain discoverable: private evidence preflight, fact support, scope gate, ADR metadata, deterministic validation, auditor PASS, and serial/fallback approval.
- References are one level deep:
  - `references/intake-private-adr.md`
  - `references/mapping-facts.md`
  - `references/scope-next-artifacts.md`
  - `references/validation-audit.md`
  - `references/retrieval-delegation.md`

## Result

PASS: both compact kernels identify workflow activation, wrapper sequence, validation/auditor gates, human/fallback gates, fact/private safety, requirements/design scope gates, ADR handling, and one-level references without loading the legacy full skill bodies.
