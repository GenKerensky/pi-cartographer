# Plan Inputs and Gates Reference

Read when deciding whether planning can proceed or which upstream artifacts must be consumed.

## Required source artifacts

Primary artifact: `.plan/<topic>/proposal.md` when present, or enough user-provided scope to create a bounded plan.

Supporting artifacts when present:

- `.plan/<topic>/map.nodes.jsonl` and `map.edges.jsonl`
- `.plan/<topic>/facts.nodes.jsonl` and `facts.edges.jsonl`
- `.plan/<topic>/interview.md` and interview graph artifacts
- `.plan/<topic>/requirements.md` and requirements graph artifacts
- `.plan/<topic>/design.md` and design graph artifacts
- `.plan/_index/project-graph.sqlite` and manifest

## Requirements/design gate

For scoped changes that affect a core user workflow, external behavior, public/API contract, migration/security/privacy risk, or comparable durable behavior:

1. Consume approved requirements and design artifacts before drafting phases.
2. Cite requirement IDs such as `REQ-*`, scenario IDs such as `SCN-*`, and design IDs where phases implement or validate them.
3. Preserve interview decision IDs when they clarify user-owned choices.
4. Stop if `requirements_required: true` and interview/requirements/design approvals are missing.

Small non-core-workflow changes may skip requirements/design only when the accepted proposal scope gate says they are unnecessary.

## ADR metadata

Extract and preserve proposal/plan ADR metadata:

- `adr_required`
- `adr_reason`
- `adr_options_status`
- `adr_tool_mode`

If an architecture-significant plan lacks ADR metadata, treat it as ambiguous and evaluate or ask before finalization.

## Durable requirements fold planning

When requirements deltas exist, include final implementation work for `requirements-fold` or approved `requirements-fold-skip` receipt. Preserve stable requirement/scenario IDs, source topic, validation/audit refs, and change metadata.
