# Proposal Intake, Private Evidence, and ADR Reference

Read when initializing a proposal, handling private inputs, or evaluating ADR intent.

## Topic/init

- Derive a filesystem-safe topic in 3 words or less.
- Ask one concise clarification when topic or scope is ambiguous.
- Initialize with `cartographer_proposal init` or the CLI fallback.
- Preserve useful existing artifacts and stable IDs; do not truncate existing work blindly.

Proposal skeleton sections:

- Description
- Problem Statement
- Goals
- Non-Goals
- Background
- Viability
- ADR Metadata
- Scope Gate
- Next Artifacts

## Private evidence preflight

Trigger when the request includes logs, transcripts, screenshots, exports, private docs, or attachments.

1. Derive/confirm topic before raw access.
2. Import authorized files with `cartographer_evidence import` or the private-artifacts CLI.
3. Store raw inputs only under ignored `.plan/_private/<topic>/` or inbox staging.
4. Do not read, grep, summarize, index, quote, or paste raw private contents in the parent session.
5. Use redactor-only analysis to produce sanitized `.plan/<topic>/evidence/` docs.
6. Facts derived from private evidence cite sanitized evidence paths, never `.plan/_private/**`.

If a referenced sensitive file is tracked by git, stop and ask before moving or rewriting it.

## ADR intent

Evaluate ADR intent early with `cartographer_adr evaluate` or CLI fallback once scope is sketched.

ADR-worthy signals include durable choices about architecture, dependencies, platform, identity/auth provider, data store, deployment topology, or public/API contract architecture.

Do not mark `adr_required: true` merely because behavior or validation policy changes unless a durable technical direction is chosen.

Record:

- `adr_required`
- `adr_reason`
- `adr_options_status`
- `adr_tool_mode`

Directed architecture choices need alternatives or user-provided rationale before proposal readiness; ask if missing.
