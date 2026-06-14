---
name: "proposal"
description: "Pi Cartographer proposal workflow: create .plan/<topic>/proposal.md using the index-project SQLite/FTS graph plus delegated scope, mapping, research, design, compass checks, deterministic validation, and cartographer-auditor gates."
version: 19
created: "2026-06-05"
updated: "2026-06-14"
---

# Pi Cartographer Proposal

## When to Use

Use when the user asks for a project proposal, implementation proposal, or planning artifact that should live under `.plan/<topic>/`.

The parent/current agent orchestrates deterministic index/map/fact validation and canonical artifact changes. Specialists are narrow advisors, drafters, redactors, or reviewers.

## Outputs

Wrapper-managed artifacts:

- `.plan/_index/project-graph.sqlite`
- `.plan/_index/project-graph-manifest.json`
- `.plan/<topic>/proposal.md`
- `.plan/<topic>/map.nodes.jsonl`
- `.plan/<topic>/map.edges.jsonl`
- `.plan/<topic>/facts.nodes.jsonl`
- `.plan/<topic>/facts.edges.jsonl`
- `.plan/<topic>/evidence/` for sanitized private-artifact analysis when used

Ignored private inputs, only when explicitly provided:

- `.plan/_private/<topic>/`
- `.plan/_private/_inbox/<id>/`

Do not create `.cartographer/` execution state during proposal writing.

## Hard Rules

- Use deterministic wrappers for proposal init/finalize, facts, evidence, ADR sync, receipts, handoffs, and validation when available.
- Do not manually cross proposal lifecycle gates or rely on prose-only validation when wrappers exist.
- Do not blindly truncate existing topic artifacts; preserve useful content and stable IDs.
- Do not read, quote, index, or cite raw `.plan/_private/**` content in parent context.
- Private-derived facts cite sanitized evidence docs only.
- Every source-backed claim in proposal prose needs a fact node, source node, and support edge.
- Do not let map artifacts become a flat grep dump; keep a curated graph grounded in the shared index and verified evidence.
- Do not put detailed architecture or implementation design in proposal prose for scoped changes.
- Do not omit ADR Metadata or Scope Gate.
- Do not use ADR metadata as a substitute for requirements/design gating.
- Do not proceed automatically when no executable subagents exist; ask before serial mode.
- Proposal acceptance requires deterministic validation plus auditor PASS or approved fallback.

## Reference Files

Read only when needed:

- `references/intake-private-adr.md` — topic init, private evidence preflight, ADR intent.
- `references/mapping-facts.md` — index/map generation, verification, source-backed facts.
- `references/scope-next-artifacts.md` — requirements/design scope gate and next artifacts.
- `references/validation-audit.md` — deterministic validation, auditor gate, fallbacks.
- `references/retrieval-delegation.md` — retrieval plan, specialist roles, least privilege.

## Procedure

### 1. Derive topic and initialize

1. Summarize the topic in 3 words or less, filesystem-safe kebab-case.
2. Ask one concise clarification if topic or scope is ambiguous.
3. Initialize with `cartographer_proposal init` or CLI fallback.
4. Preserve existing useful content and stable IDs.
5. If private artifacts are provided, run private evidence preflight before raw access.
6. Evaluate ADR intent with `cartographer_adr evaluate` or CLI fallback once scope is sketched.

Proposal sections:

- Description
- Problem Statement
- Goals
- Non-Goals
- Background
- Viability
- ADR Metadata
- Scope Gate
- Next Artifacts

Read `references/intake-private-adr.md` for private input and ADR details.

### 2. Inspect subagents and choose mode

Call `subagent({action:"list"})` before delegation when available.

Preferred roles:

- `cartographer-archivist` for missing research compression.
- `cartographer-drafter` for proposal/next-artifact synthesis.
- `cartographer-compass` for scope/dependency/consistency checks.
- `cartographer-auditor` for final semantic review after deterministic validation.
- `cartographer-redactor` for raw private artifact analysis only.

Built-in `scout`, `researcher`, `planner`, `oracle`, and `reviewer` are fallback/substitution choices, not defaults. Ask before serial mode or fallback substitution.

Read `references/retrieval-delegation.md` for least-privilege handoff details.

### 3. Refresh index and map context

1. Use `index-project` or `cartographer_index ensure` to refresh the shared index when stale.
2. Ensure `.plan/_index/` and `.plan/_private/` are ignored.
3. Create a bounded retrieval plan with exact probes before broad reading.
4. Use deterministic map generation when map artifacts are missing/thin.
5. Verify high-impact file/symbol/test/script/command references with focused `rg`/grep or selective reads.
6. Use scout only when deterministic tools plus lexical checks are insufficient or the user requests it.

Read `references/mapping-facts.md` for map graph expectations.

### 4. Define scope sections

Write/update:

- Description
- Problem Statement
- Goals
- Non-Goals

Keep these problem-centered and outcome-focused. Use project/index context as background, not as a technology shopping list.

### 5. Add background and viability facts

Seed/reuse existing facts first. Research only missing, stale, or insufficient facts about tools, docs, examples, constraints, risks, or validation choices.

Use `cartographer_fact` wrappers for source/fact/support records. If unavailable, use a narrow parent-owned fallback, validate topic artifacts, and record fallback evidence.

Write Background and Viability prose with fact citations such as `[F003]`.

### 6. Decide Scope Gate and Next Artifacts

Evaluate whether requirements/design are required using behavior/contract risk, not ADR status.

Use the scoped path, scoped no-interview path, or lightweight path. Interview runs only after relevant research is exhausted and unresolved user-owned decisions remain.

Read `references/scope-next-artifacts.md` for criteria and exact paths.

### 7. Validate and audit

1. Run topic JSONL validation and record a deterministic receipt.
2. Correct validation failures before semantic review.
3. Capture `cartographer-auditor` PASS through `cartographer_handoff auditor` when available.
4. On FAIL, correct narrowly through wrappers, rerun deterministic validation, and re-audit.
5. Use `cartographer_proposal adr-sync` and `cartographer_proposal finalize` when prerequisites are met.

Read `references/validation-audit.md` for full criteria and fallback handling.

### 8. Final response

Report:

- topic;
- created/updated proposal, map, fact, index, and evidence paths;
- role contributions or serial passes;
- residual risks/unresolved decisions;
- ADR expectation and reason.

## Verification Checklist

Before finalizing, verify:

- index and manifest exist or approved fallback is recorded;
- proposal contains required sections;
- map/fact artifacts parse and references resolve;
- every proposal fact citation exists and cited source-backed facts have support edges;
- private-derived facts cite sanitized evidence with redaction status;
- Scope Gate and Next Artifacts are explicit;
- ADR Metadata includes `adr_required`, reason, options status, and tool mode;
- directed architecture choices include alternatives/rationale or are not ready;
- final auditor PASS or approved fallback receipt exists.
