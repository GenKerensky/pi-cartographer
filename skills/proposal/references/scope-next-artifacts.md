# Proposal Scope Gate and Next Artifacts Reference

Read when deciding whether a proposal needs interview, requirements, design, or lightweight planning.

## Proposal section boundaries

Keep `proposal.md` focused on problem framing and viability:

- Description
- Problem Statement
- Goals
- Non-Goals
- Background
- Viability
- Risks when useful
- ADR Metadata
- Scope Gate
- Next Artifacts

Do not put detailed architecture or implementation design in proposal prose for scoped changes. Requirements and design details belong in downstream artifacts.

## Requirements/design scope gate

Set `requirements_required: true` when the change affects:

- a core user workflow;
- externally visible agent/user behavior;
- durable product behavior;
- public/API contract;
- migration, security, or privacy risk;
- comparable behavior/contract risk.

Set `requirements_required: false` only for small changes without external behavior, core workflow, public contract, or comparable risk signal.

The requirements gate is independent of ADR metadata. A behavior change may require requirements/design even when `adr_required: false`.

## Next Artifacts paths

Use one of these paths:

- Scoped path: `proposal -> research -> interview gate -> requirements gate -> design gate -> plan -> implement -> requirements fold`.
- Scoped no-interview path: `proposal -> research -> interview skip decision -> requirements gate -> design gate -> plan -> implement -> requirements fold` when research leaves no unresolved user-owned decisions.
- Lightweight path: `proposal -> plan -> implement` with a clear reason interview and requirements/design are unnecessary.

Interview runs only after relevant project/research context is exhausted and unresolved user-owned decisions remain. Requirements authors may re-enter interview one question at a time if new user-owned decisions appear.

Topic-local requirements are deltas for the current change and later fold into durable requirements docs when accepted.
