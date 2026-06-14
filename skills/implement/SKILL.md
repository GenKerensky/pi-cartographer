---
name: "implement"
description: "Pi Cartographer implementation workflow: execute .plan/<topic>/plan.md phase-by-phase with a single parent writer, minimal .cartographer state, milestone compaction, deterministic receipts, read-only specialist gates, and conventional commits."
version: 7
created: "2026-06-06"
updated: "2026-06-14"
---

# Pi Cartographer Implement

## When to Use

Use when the user asks to implement an existing `.plan/<topic>/plan.md` plan.
Do not improvise a missing plan; use the `plan` workflow first.

The parent/current agent is the default writer. Specialists are read-only reviewers
or advisors unless the user explicitly approves a narrow fallback handoff.

Core loop:

```text
Orient → Select → Narrow → Inspect → Act → Validate → Record → Compact → Continue
```

## Inputs

Primary source of truth:

- `.plan/<topic>/plan.md`
- `.plan/<topic>/plan.nodes.jsonl`
- `.plan/<topic>/plan.edges.jsonl`
- `.plan/<topic>/receipts.jsonl`
- `.plan/<topic>/context-packs.jsonl`

Supporting context when present:

- proposal, interview, requirements, design, map, and fact artifacts under `.plan/<topic>/`
- `.cartographer/<topic>/state.json`
- `.cartographer/<topic>/journal.jsonl`
- `.cartographer/current.json` as a non-authoritative local hint only
- `.plan/_index/project-graph.sqlite` and manifest for indexed retrieval

## Hard Rules

- Work one dependency-unblocked phase at a time.
- Use wrapper tools for lifecycle/status/receipt/state mutations.
- Do not hand-edit plan checkboxes/status when `cartographer_plan_status` can do it.
- Do not manually append lifecycle receipts when a wrapper exists.
- Do not create duplicate task graphs such as `plan.json` or generated `status.md`.
- Do not read raw `.plan/_private/**` inputs unless the phase explicitly uses synthetic fixtures.
- Do not use retired `cartographer-pathfinder` as a routine implementation writer.
- Do not mark tasks or validations complete without evidence.
- Do not skip auditor review after deterministic validation.
- Do not skip ADR or requirements-fold handling when the plan requires it.
- Keep `.cartographer/current.json` non-authoritative and ignored.

## Reference Files

Read only when needed:

- `references/execution-loop.md` — detailed phase loop, checklist/status, commits.
- `references/validation-gates.md` — validation, auditor gates, fallbacks, final checks.
- `references/state-compaction.md` — state mutation, journal, compaction/resume.
- `references/retrieval-delegation.md` — retrieval plans, specialists, least privilege.
- `references/finalization-adr.md` — requirements fold, ADR, final implementation gate.

## Procedure

### 1. Start and preflight

1. Derive the topic and locate `.plan/<topic>/plan.md`.
2. Read the plan and identify phases, dependencies, open questions, validation items,
   and ADR metadata.
3. Run `subagent({action:"list"})` before any specialist handoff.
4. Check `git status --short`, branch, and commit SHA.
5. Stop if unrelated user changes are present.
6. Refresh the index with `cartographer_index ensure` when stale.
7. Start/resume with `cartographer_implement start`.

### 2. Select the next phase

1. Validate or initialize state with `cartographer_state` / `cartographer_implement`.
2. Use `cartographer_implement step` before edits.
3. Select the first incomplete phase whose dependencies are complete.
4. Mark it `in-progress` with `cartographer_plan_status`.
5. Set one `next_action` and a narrow `working_set` with `cartographer_state`.
6. If resuming after compaction, read `resume-primer` first, use `state-resume`
   only for expanded context, and respond with current phase, next action, and
   files to inspect.

Read `references/state-compaction.md` if state/resume details are unclear.

### 3. Gather focused context

Write a short retrieval plan with exact probes before broad reading. Prefer plan,
map/fact graphs, context packs, receipts, `cartographer_index`, focused `rg`, and
selective `read` calls. Keep code retrieval separate from `.plan/` rationale.

Read `references/retrieval-delegation.md` for specialist or retrieval edge cases.

### 4. Execute phase tasks

For each task:

1. Re-open active files from disk.
2. Apply one scoped parent-owned patch.
3. Run the narrowest useful check.
4. Record validation receipts with `cartographer_validation` or an approved wrapper.
5. Check off task/validation IDs with `cartographer_plan_status` only after evidence.
6. Record validation refs with `cartographer_implement record`.

Read `references/execution-loop.md` for detailed loop and commit discipline.

### 5. Validate and audit the phase

1. Run all phase validation items until green.
2. Run topic validation when plan/graph artifacts change.
3. Create/update the phase context pack.
4. Request read-only `cartographer-auditor` review after deterministic receipts pass.
5. Capture PASS/FAIL with `cartographer_handoff auditor`.
6. On FAIL, fix narrowly, rerun checks, record wrapper receipts/state refs, and re-audit.

Read `references/validation-gates.md` for fallback and final validation details.

### 6. Complete the phase and continue

1. Mark the phase complete with `cartographer_plan_status`.
2. Run `cartographer_implement record` with validation/audit receipt IDs.
3. Run `cartographer_implement compact` for phase-end state.
4. Call `cartographer_compact_context` when available to request actual Pi compaction.
5. Commit intended files with a Conventional Commit message.
6. Re-orient and continue to the next phase unless blocked by a human gate,
   unresolved risk, unrelated changes, or explicit user stop instruction.

### 7. Finalize implementation

After all phases complete:

1. Run full topic and project validation.
2. Capture final auditor PASS.
3. Resolve requirements fold and ADR handling.
4. Run `cartographer_implement finalize`.

Read `references/finalization-adr.md` before finalization.

## Specialist Roles

- `cartographer-auditor`: default read-only semantic gate after deterministic validation.
- `cartographer-compass`: scope/dependency/repeated-failure/plan-drift advice.
- `cartographer-archivist`: isolated missing research compression.

Fallback reviewers/oracles require explicit receipted fallback rationale. Routine writer
handoff is not the default.

## Validation Checklist

Before reporting completion, verify:

- Plan and plan graph statuses match.
- State validates or absence is intentionally receipted.
- Journal contains only durable lessons, not routine logs.
- Every validation item has command, auditor, or approved manual evidence.
- Final auditor PASS exists.
- ADR intent and requirements-fold handling are resolved.
