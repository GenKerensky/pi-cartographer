---
name: "implement"
description: "Pi Cartographer implementation workflow: execute .plan/<topic>/plan.md phase-by-phase with a single parent writer, minimal .cartographer state, milestone compaction, deterministic receipts, read-only specialist gates, and conventional commits."
version: 6
created: "2026-06-06"
updated: "2026-06-10"
---

# Pi Cartographer Implement

## When to Use

Use this skill when the user asks to implement an existing `.plan/{topic}/plan.md` plan, especially one produced by the `plan` skill.

This skill executes the plan phase-by-phase. The **current/parent agent is the default writer**. It may ask read-only specialists for review or decision advice, but it does not delegate routine phase edits to `cartographer-pathfinder`.

The implementation loop is:

```text
Orient → Select → Narrow → Inspect → Act → Validate → Record → Compact → Continue
```

## Required Input

Primary input:

- `.plan/{topic}/plan.md`

Supporting artifacts, when present:

- `.plan/{topic}/plan.nodes.jsonl`
- `.plan/{topic}/plan.edges.jsonl`
- `.plan/{topic}/proposal.md`
- `.plan/{topic}/map.nodes.jsonl`
- `.plan/{topic}/map.edges.jsonl`
- `.plan/{topic}/facts.nodes.jsonl`
- `.plan/{topic}/facts.edges.jsonl`
- `.plan/{topic}/receipts.jsonl`
- `.plan/{topic}/context-packs.jsonl`
- `.cartographer/{topic}/state.json`
- `.cartographer/{topic}/journal.jsonl`
- `.cartographer/current.json` as an optional ignored local hint only
- `.plan/_index/project-graph.sqlite`
- `.plan/_index/project-graph-manifest.json`

If the plan is missing, ask the user whether to generate it first with the `plan` skill. Do not improvise a phase plan silently.

## Core Rules

### Source-of-truth boundaries

- `.plan/{topic}/plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`, `receipts.jsonl`, and `context-packs.jsonl` remain authoritative for planning, checkoff, validation history, and implementation handoff context.
- `.cartographer/{topic}/state.json` is only compact execution/resume state.
- `.cartographer/{topic}/journal.jsonl` is only a curated durable lessons journal.
- `.cartographer/current.json` is git-ignored, local, non-authoritative, and safe to ignore when stale.
- Do not introduce a duplicate `plan.json` task graph or generated human Markdown state views such as `status.md`.

### Single-writer execution

- Work one phase at a time in dependency order.
- The current/parent agent writes code/docs/tests by default.
- Do not launch `cartographer-pathfinder` as the routine implementation writer. If a legacy writer handoff is explicitly requested by the user, record it as an opt-in fallback/legacy path with scope, stop rules, evidence requirements, and a fallback receipt.
- Use `cartographer-auditor` as the default read-only phase semantic gate after deterministic validation receipts pass.
- Use `cartographer-compass` for decision-level scope/dependency/repeated-failure questions, not routine code review.
- Use `cartographer-archivist` only for isolated missing research compression.

### Wrapper-first lifecycle contract

- Use `cartographer_implement start`/`implement-start` to initialize or resume implementation state, set the active phase, and enforce plan approval prerequisites.
- Use `cartographer_implement step`/`implement-step` to select the next executable phase and keep the working set narrow.
- Use `cartographer_implement record`/`implement-record` to record validation refs and phase evidence, `cartographer_implement compact`/`implement-compact` for milestone compaction, and `cartographer_implement finalize`/`implement-finalize` for final prerequisite checks.
- Use `cartographer_transition` for proposal/plan/final implementation approval gates and for explicitly human-gated phases; approval gates require a human approver label in non-interactive/CI contexts.
- Automatic phase advancement is the default after validation receipts, `cartographer_handoff auditor` PASS capture, plan/checklist status updates, and commit complete the current phase. Stop for user approval only when the plan or transition metadata marks a human-gated phase, a scope/product decision is unresolved, or a fallback receipt says approval is required.
- Do not manually append lifecycle receipts, manually cross approval gates, or manually advance phase state as a prose-only step unless the wrapper is unavailable and an explicit fallback receipt documents the substitute checks.

### State and journal mutation

- Agents may read `.cartographer/{topic}/state.json`, `.cartographer/{topic}/journal.jsonl`, and `.cartographer/current.json` directly.
- Mutate state through `cartographer_state` / `cartographer_state.ts` semantic commands when available:
  - `state-init`
  - `state-validate`
  - `state-set-next`
  - `state-set-working-set`
  - `state-record-validation-ref`
  - `journal-append`
  - `current-set`
  - `compact-generate`
  - `state-resume`
- Direct edits to state files are an escape hatch only. After any direct edit, run `cartographer state validate` or the helper equivalent before trusting the result.
- Append `journal.jsonl` records only for important lessons/gotchas/constraints that would otherwise be rediscovered after compaction. Do not store routine tool calls, raw logs, full command output, validation history already captured in receipts, transcripts, or ADR-worthy decisions.

### Validation and gates

- Run all relevant quality tools until green: format/check, typecheck, lint, tests, build, and phase-specific validation.
- Record deterministic validation receipts before semantic review.
- `cartographer-auditor` must review the code/artifact diff and validation evidence; a PASS is the **default phase semantic gate**.
- The final implementation uses a **final `cartographer-auditor` semantic gate** after broad validation receipts pass.
- If validation or auditor review fails, apply a scoped fix, rerun affected checks, and request auditor review again.
- Stop and ask the user when a product/scope/dependency decision is not covered by the plan.

## Procedure

### 1. Derive topic and locate the plan

- Summarize the requested plan topic in 3 words or less.
- Locate `.plan/{topic}/plan.md`.
- If no exact topic path exists, search `.plan/*/plan.md` for likely matches and confirm with the user if ambiguous.
- Read the plan completely.
- Read supporting proposal/map/fact/index artifacts when available.
- Identify:
  - phases and phase IDs;
  - phase statuses;
  - phase dependencies;
  - unchecked checklist items;
  - unchecked validation items;
  - cross-phase validation commands;
  - open questions;
  - ADR metadata (`adr_required`, `adr_reason`, `adr_options_status`, and `adr_tool_mode`) from the accepted proposal/plan when present.
- If open questions block implementation, ask the user before proceeding.
- If ADR metadata is missing for an architecture-significant plan, treat it as ambiguous and ask whether to evaluate with `cartographer_adr` before finalization.

### 2. Inspect subagents and choose specialist mode

Call the subagent list action before delegating whenever the subagent tool is available.

Preferred Cartographer agents:

| Agent                    | Role                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `cartographer-auditor`   | Read-only semantic review after deterministic validation receipts pass. |
| `cartographer-compass`   | Decision advice for scope, dependency, repeated failure, or plan drift. |
| `cartographer-archivist` | Isolated missing research compression only.                             |

`cartographer-pathfinder` is retired/deprecated from the default implementation path. Built-in `worker`, `reviewer`, `oracle`, `planner`, and `scout` are explicit fallback/substitution choices, not defaults.

If `cartographer-auditor` is unavailable, ask whether to substitute built-in `reviewer`/`oracle` or run that role serially. Do not silently skip review; record an explicit fallback receipt before accepting any phase.

If specialist calls repeatedly time out, fail tools, or return unusable output, record timeout/fallback receipts through `cartographer_handoff fallback` or `cartographer_receipt`, then call `cartographer-compass` before substantial parent takeover or broad serial repair.

### 3. Preflight repository safety

- Check `git status --short`.
- If there are pre-existing uncommitted changes not created by this workflow, stop and ask the user how to proceed before editing.
- Record the current branch and commit SHA.
- Ensure `.plan/{topic}/plan.md`, `plan.nodes.jsonl`, and `plan.edges.jsonl` are included in the phase workflow so checkbox/status updates are committed with the phase.
- Do not stage or commit unrelated user changes.
- Do not commit `.plan/_index/project-graph.sqlite` or other index/cache artifacts unless they are already tracked or the user explicitly wants them committed.

### 4. Refresh implementation context

Load/use the `index-project` skill when available. Run `ensure` before starting implementation so the index is created or re-indexed only when stale:

```bash
python skills/index-project/scripts/index_project.py ensure --root "$PWD" --json
```

The indexer must ensure `.plan/_index/` is present in `.gitignore`; do not commit generated SQLite/cache artifacts unless explicitly requested.

If indexing fails, report the error and ask whether to continue with manual discovery using `rg`/grep and selective reads. Do not silently skip indexing.

### 5. Orient from state and select the next executable phase

1. If `.cartographer/current.json` exists, treat it as a hint only. Validate that it points to the requested topic/state and ignore it if stale or invalid.
2. Initialize or validate topic state when the helper is available:

   ```bash
   node --experimental-strip-types skills/plan/scripts/cartographer_state.ts state-init --root "$PWD" --topic "{topic}" --json
   node --experimental-strip-types skills/plan/scripts/cartographer_state.ts state-validate --root "$PWD" --topic "{topic}" --json
   ```

3. If resuming after compaction, render bounded context data:

   ```bash
   node --experimental-strip-types skills/plan/scripts/cartographer_state.ts state-resume --root "$PWD" --topic "{topic}" --json
   ```

4. Before editing after resume, respond with:
   - current phase;
   - singular next action;
   - files to inspect.
5. Choose the first incomplete phase whose dependencies are complete.
6. Verify dependencies are acyclic and completed phases have commits or documented no-op completions.
7. Mark the selected phase `in-progress` in `.plan/{topic}/plan.md` and in `plan.nodes.jsonl` when present.
8. Set a singular `next_action` and initial `working_set` through state commands when available.

### 6. Create a retrieval plan and gather focused phase context

Before gathering phase context, write a short **retrieval plan** with 5–10 targeted probes derived from the selected phase. Include exact identifiers, filenames, tests, scripts, commands, config keys, generated artifacts, error strings, and constrained generic terms.

Use bounded **rationale retrieval** in `.plan/` for the active topic and explicitly related topics only. Treat retrieved rationale as **historical evidence** requiring freshness checks before it influences implementation.

Keep retrieval scopes separate:

- code probes should exclude `.plan/**`;
- rationale probes should explicitly target `.plan/`;
- raw `.plan/_private/**` inputs are off limits unless a phase explicitly tests private intake using synthetic fixtures.

Prefer:

- `.plan/{topic}/plan.md`;
- map/fact JSONL;
- deterministic validation reports;
- `cartographer_index query/read/context`;
- focused `rg`/grep searches;
- selective `read` calls.

Use `scout` only when this deterministic and lexical context is missing, contradictory, or too broad for safe editing.

### 7. Execute the single-writer loop

For each small unit of work inside the selected phase:

| Loop step | Required behavior                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------- |
| Orient    | Reload current state, selected journal records, phase text, receipts, and active files from disk. |
| Select    | Choose exactly one next action.                                                                   |
| Narrow    | Update `working_set` before editing: write-allowed, read-only, and forbidden paths.               |
| Inspect   | Re-open active files from disk; never rely on code read many turns ago.                           |
| Act       | Apply a small parent-owned patch.                                                                 |
| Validate  | Run the narrowest useful check and append a deterministic validation receipt when appropriate.    |
| Record    | Update state cursor/receipt refs; append a journal record only for important durable lessons.     |
| Compact   | On milestone triggers, run `compact-generate`.                                                    |
| Continue  | Re-orient from artifacts and ignore stale chat assumptions.                                       |

Compaction triggers include phase start/end, diagnosed test failure, decision made, file-set change, before switching areas, before risky refactor, before handoff, and a configurable context-usage threshold.

### 8. Verify checklist items and update the plan

- For each phase checklist item:
  - verify the expected output exists;
  - verify relevant code/tests/docs changed as needed;
  - change `- [ ] **P?.T?**` to `- [x] **P?.T?**` only when complete.
- Mirror completed task status in `plan.nodes.jsonl` by setting matching `task:P?.T?` nodes to `status: complete` when present.
- Do not check off validation items until the command or auditor evidence proves the item passed.

### 9. Run quality tools until green

Discover quality commands from:

- plan validation items;
- `package.json` scripts;
- project docs such as `AGENTS.md`, `README.md`, or plan notes;
- language/tooling config files.

Typical order:

1. format check or formatter if project policy allows;
2. typecheck/check;
3. lint;
4. tests;
5. build;
6. phase-specific validation commands.

Examples:

- `npm run check:scripts`
- `npm run typecheck`
- `npm run lint:ts`
- `npm run test`
- `npm run check`

If a command is unavailable, record it as unavailable rather than failed. If a command fails, capture a compact failure summary, apply a scoped fix, rerun the failed command and dependent checks, and record receipts.

Limit routine repair loops to 3 scoped fix attempts per distinct failing command. If the same command still fails, write timeout/fallback receipts, call `cartographer-compass`, and stop to ask the user unless the next step is clearly safe and in scope.

### 10. Audit and validate the phase

Once quality tools are green and deterministic validation receipts exist, route the semantic gate through `cartographer_handoff auditor` when available so the context pack, validation receipt IDs, artifact summaries, acceptance criteria, report path, PASS/FAIL outcome, and fallback metadata are captured deterministically. If `cartographer_handoff` is not yet available, dispatch `cartographer-auditor` as the read-only phase semantic gate and record an explicit fallback receipt.

Provide the auditor:

- selected phase text;
- current diff/stat;
- commands run, summarized outputs, and validation receipt IDs/paths;
- checked checklist items;
- unchecked validation items;
- relevant proposal/map/fact references;
- state/journal/compaction evidence when relevant.

Ask for explicit PASS/FAIL and capture the report with `cartographer_handoff auditor` or an approved fallback receipt. If the auditor rejects or any validation item fails:

1. apply a scoped fix;
2. rerun affected checks;
3. update receipts/state through `cartographer_validation`, `cartographer_implement record`, and `cartographer_state`;
4. call `cartographer-auditor` again and capture it through `cartographer_handoff auditor`.

Repeat until auditor passes, or an approved fallback receipt records semantic review outcome.

### 11. Commit completed phases

At the end of each completed phase:

- synchronize `.plan/{topic}/plan.md` phase status and checkboxes through `cartographer_plan_status`/`plan-status-set` where available;
- synchronize `plan.nodes.jsonl` statuses through `cartographer_plan_status`/`plan-status-set` where available;
- run/update relevant validation receipts through `cartographer_validation`;
- ensure `git status --short` contains only intended files;
- commit with a conventional commit message.

A phase commit is a checkpoint, **not a stopping point**. After the commit succeeds, immediately re-orient from disk, validate/resume state, select the next incomplete dependency-unblocked phase, and continue the loop in the same assistant turn when context and tool budget allow.

Stop after a phase commit only when one of these conditions is true:

- the next phase, plan metadata, or transition status explicitly marks the phase as human-gated;
- the next required transition is a major human approval gate: proposal-to-plan, plan-to-implementation, or final implementation approval;
- validation/fallback/auditor evidence leaves an unresolved blocker or residual risk needing user direction;
- repository safety checks find unrelated user changes or ambiguous intended files;
- the user explicitly asked for only one phase or asked to stop after the phase.

When continuing automatically, still create/update the phase context pack, compact/resume state through `cartographer_implement compact`/`cartographer_state`, set the next action/working set, and avoid carrying stale transcript assumptions across the phase boundary.

If the phase is a true no-op, mark it complete through `cartographer_plan_status` with an explanatory note, avoid an empty commit, then apply the same automatic-continuation rules.

### 12. Final implementation validation and ADR handling

After all phases are complete:

1. Run full project validation, usually `npm run check`.
2. Run topic validation:

   ```bash
   node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "{topic}" --json
   ```

3. Run planning graph validation:

   ```bash
   python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic "{topic}" --json
   ```

4. Run the final `cartographer-auditor` semantic gate and capture it through `cartographer_handoff auditor`.
5. If `adr_required: true`, run `cartographer_adr` after deterministic validation and cite validation receipt IDs/source commits.
6. If `adr_required: false`, record the reason and, when applicable, an `adr-not-required` receipt through `cartographer_receipt` or `receipt-append`.
7. Run `cartographer_implement finalize`/`implement-finalize` to enforce final prerequisites before reporting completion.

The ADR must cite sanitized evidence docs or validation receipt IDs, not raw `.plan/_private/**` paths or brittle raw logs.

## Receipt Discipline

After each significant command, specialist handoff, timeout, fallback substitution, phase decision, compaction, or validation gate, append a compact `.plan/{topic}/receipts.jsonl` record through `cartographer_validation`, `cartographer_handoff`, `cartographer_transition`, `cartographer_implement record`, or `cartographer_receipt`/`receipt-append` instead of relying on transcript continuity.

Validation receipts should include:

- command;
- exit code/result;
- duration;
- changed-file hashes when available;
- validation IDs satisfied;
- summarized output or first failure block.

Use the validation runner when available:

```bash
python skills/plan/scripts/validation_runner.py \
  --receipt-file .plan/{topic}/receipts.jsonl \
  --phase-id <P?> \
  --validation-id <P?.V?> \
  --command "<check>" \
  --json
```

Timeout/fallback receipts should include:

- child/tool attempted;
- attempt count;
- timeout or failure summary;
- control fields used when available;
- fallback approved;
- `cartographer-compass` recommendation when repeated;
- outcome;
- residual risk.

## Lifecycle, Retrieval, and Least-Privilege Contract

- Lifecycle states are `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`.
- Implement only from active `planned`/`in-progress` artifacts; treat `superseded` or `stale` artifacts as historical rationale requiring user or `cartographer-compass` confirmation before use.
- Candidate/verified metadata uses `candidate`, `verified`, and `verification` fields. Do not rely on candidate-only files for edit instructions unless you verify first.
- Retrieval scopes are `code`, `plans`, and `all`, with `code` as the default.
- Implementation source-code retrieval should exclude `.plan/**`; rationale retrieval should search `.plan/` only through bounded probes.
- Raw `.plan/_private/**` inputs are off limits during implementation unless a phase explicitly uses synthetic fixtures.
- Apply a least-privilege child tool policy. Do not give every child full mutable JSONL/private/ADR/receipt authority, raw private paths, ADR write actions, or broad receipt append authority.
- The parent owns canonical plan/checkoff/receipt/ADR writes unless a structured contract explicitly scopes otherwise.

## Prompt Snippets

### Auditor handoff

```text
Review phase <PHASE_ID> for topic <topic> after deterministic validation receipts passed.
Use .plan/<topic>/plan.md, plan graph artifacts, relevant proposal/map/fact summaries,
current diff/stat, receipt IDs, and state/journal evidence when relevant.
Return PASS/FAIL with required corrections. Stay read-only.
```

### Compass handoff

```text
Advise on this scope/dependency/repeated-failure issue for topic <topic>.
Use proposal/plan references, receipt summaries, and current failure context.
Answer whether the next action is within the approved plan, needs phase/order/scope change,
or should stop for user direction. Stay read-only.
```

### Legacy pathfinder opt-in only

```text
Use cartographer-pathfinder only when the user explicitly requests a legacy writer handoff.
Record why the retired writer path is being used, pass exact checklist/validation IDs,
allowed files, stop rules, evidence requirements, and require no commits/staging.
```

## Pitfalls

- Do not skip deterministic validation before auditor review.
- Do not treat `.cartographer/current.json` as authoritative.
- Do not append routine events or raw logs to `journal.jsonl`.
- Do not add `plan.json` or generated Markdown state views.
- Do not continue from stale transcript memory after compaction; reload from state/journal/plan artifacts.
- Do not mark checklist or validation items complete without evidence.
- Do not silently skip ADR handling when `adr_required` metadata exists.
- Do not use `cartographer-compass` as a substitute for the auditor semantic gate.
- Do not read raw `.plan/_private/**` inputs.

## Verification Checklist

Before finalizing an implementation, verify:

- `.plan/{topic}/plan.md` exists and every implemented phase is marked complete.
- `plan.nodes.jsonl` mirrors phase/task/validation statuses.
- `.cartographer/{topic}/state.json` validates or the absence of state is intentionally receipted for a legacy plan.
- `journal.jsonl` contains only curated important lessons, if any.
- `.cartographer/current.json` is ignored/non-authoritative.
- `.gitignore` contains `.plan/_index/`, `.plan/_private/`, and `.cartographer/current.json` when relevant.
- Every validation item is checked off by verified command output, `cartographer-auditor` approval, or an approved fallback receipt.
- Full project validation passed or any failure has explicit user-approved residual risk.
- The final `cartographer-auditor` PASS, or approved fallback semantic review receipt, exists.
- ADR intent from the proposal/plan was honored: `cartographer_adr` ran when `adr_required: true`, or an `adr-not-required` receipt exists when false.
