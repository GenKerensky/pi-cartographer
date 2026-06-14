---
name: "plan"
description: "Pi Cartographer planning workflow: generate .plan/<topic>/plan.md from a proposal plus index-project, map, and research graphs with ordered phases, dependencies, checklists, and validation criteria."
version: 6
updated: "2026-06-14"
---

# Pi Cartographer Plan

## When to Use

Use when the user asks for a plan, delivery plan, execution plan, or task breakdown that should live at `.plan/<topic>/plan.md`.

This workflow creates a plan only. Do not implement code unless the user explicitly asks to start implementation afterward.

## Outputs

Wrapper-managed primary artifacts:

- `.plan/<topic>/plan.md`
- `.plan/<topic>/plan.nodes.jsonl`
- `.plan/<topic>/plan.edges.jsonl`

Supporting inputs when present:

- `.plan/_index/project-graph.sqlite` and manifest
- proposal, interview, requirements, design, map, and fact artifacts under `.plan/<topic>/`

Do not create `.cartographer/` execution state during planning. Plans may describe implementation state, but `.plan/<topic>/plan.md` and plan graph artifacts remain authoritative.

## Hard Rules

- Use deterministic wrappers for plan graph, status, validation, context pack, handoff, and finalization steps.
- Do not manually sync plan status, validation checkoffs, or lifecycle receipts when wrappers exist.
- Do not overwrite an existing plan without preserving useful content and stable IDs.
- Do not implement source changes while planning.
- Do not cite fact IDs unless they exist as fact nodes and cited source-backed facts have support edges.
- Do not cite raw `.plan/_private/**` paths or contents.
- Do not hide unresolved decisions; record them under Open Questions or stop for user input.
- Preserve ADR metadata from the proposal.
- For behavior-changing work, validation must trace to accepted requirements/design Testing Strategy or an explicit exception.
- Plans become ready only after deterministic validation and auditor PASS or approved fallback.

## Reference Files

Read only when needed:

- `references/inputs-gates.md` — proposal/requirements/design/ADR inputs and gates.
- `references/drafting-graph.md` — plan structure, phase rules, testing trace, graph generation.
- `references/validation-audit.md` — JSONL/planning-graph validation, auditor gate, fallbacks.
- `references/retrieval-delegation.md` — retrieval plan, specialist roles, least privilege.
- `references/context-inventory.md` — context inventory script usage.

## Procedure

### 1. Derive topic and inspect artifacts

1. Summarize the topic in 3 words or less, filesystem-safe kebab-case.
2. Locate/create `.plan/<topic>/`.
3. Inspect existing proposal, map, fact, requirements, design, and plan artifacts.
4. If an existing plan is present, preserve stable IDs and reconcile rather than replacing blindly.
5. If scope is too vague and no proposal exists, ask one clarifying question.
6. Extract phases, dependencies, open questions, requirements/design gate status, Testing Strategy, and ADR metadata from upstream artifacts.

Read `references/inputs-gates.md` when requirements/design or ADR handling is unclear.

### 2. Inspect subagents

Call `subagent({action:"list"})` before delegation when the tool is available.

Preferred roles:

- `cartographer-drafter` for phase planning from compact artifacts.
- `cartographer-auditor` for final semantic review.
- `cartographer-compass` for scope/dependency/decision consistency.
- `cartographer-archivist` for isolated missing research compression.

Ask before serial mode or fallback substitution when preferred agents are unavailable.

### 3. Refresh index and gather context

1. Use the `index-project` workflow or `cartographer_index ensure`.
2. Ensure `.plan/_index/` is ignored and do not commit generated index/cache artifacts unless requested.
3. If map artifacts are missing/thin, prefer `cartographer_index slice-jsonl` or the index script starter export.
4. Create a bounded retrieval plan with exact probes before broad context gathering.
5. Keep code retrieval separate from `.plan/` rationale retrieval.
6. Verify high-impact indexed/map references with focused `rg`/grep or selective reads.

Read `references/retrieval-delegation.md` for detailed retrieval and specialist policy.

### 4. Draft the phase plan

Draft `.plan/<topic>/plan.md` with:

- Source Artifacts
- Planning Assumptions
- Phase Dependency Graph
- Phase Summary
- Phases
- Cross-Phase Validation
- Open Questions
- Handoff Guidance

Each phase needs stable ID, status, dependencies, objective, scope, checklist IDs, validation IDs, Testing Strategy Trace when applicable, exit criteria, risks, and execution notes.

Dependencies must be acyclic and topologically ordered. Prefer coherent reviewable phases over vague milestones.

Read `references/drafting-graph.md` for exact structure and graph expectations.

### 5. Generate plan graph artifacts

Use `cartographer_plan generate-graph` or the CLI `plan-generate-graph` fallback after Markdown is ready. Treat plan graph JSONL as derived wrapper/script output.

Expected graph coverage:

- root plan;
- phases;
- tasks;
- validations and cross-phase checks;
- contains/depends/unlocks/validates/references edges where applicable.

### 6. Validate and audit

1. Run topic JSONL validation.
2. Run `skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic <topic> --json`.
3. Record deterministic receipts with `cartographer_validation`.
4. Create/update a context pack when useful for handoff.
5. Capture `cartographer-auditor` PASS through `cartographer_handoff auditor`.
6. On FAIL, correct narrowly, rerun affected checks, and re-audit.
7. Use `cartographer_plan finalize` only after deterministic validation and auditor PASS or approved fallback.

Read `references/validation-audit.md` for full criteria and fallback handling.

### 7. Final response

Report:

- topic;
- updated plan paths;
- source artifacts used;
- phase count/dependency shape;
- validation coverage summary;
- unresolved questions or residual risks.

## Verification Checklist

Before finalizing, verify:

- plan Markdown exists;
- plan graph artifacts exist and parse;
- index exists or indexing failure was approved;
- map/fact artifacts were read or intentionally regenerated;
- phases have IDs, status, dependencies, checklist, validation, exit criteria, and risks;
- dependencies are acyclic and ordered;
- referenced files/facts/nodes exist;
- behavior-changing validation covers requirements/scenarios or justified exceptions;
- ADR intent is preserved;
- final auditor PASS or approved fallback receipt exists.
