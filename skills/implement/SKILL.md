---
name: "implement"
description: "Pi Cartographer implementation workflow: execute .plan/<topic>/plan.md phase-by-phase using scout, worker, reviewer, optional oracle checks, quality gates, and conventional commits."
version: 3
created: "2026-06-06"
updated: "2026-06-06"
---
# Pi Cartographer Implement

## When to Use

Use this skill when the user asks to implement an existing `.plan/{topic}/plan.md` plan, especially one produced by the `plan` skill.

This skill executes the plan phase-by-phase. It delegates:

- codebase lookups and context gathering to `scout`
- actual code edits/fixes to `worker`
- code review and validation-step review to `reviewer`

The orchestrating/current agent owns sequencing, quality gates, checklist updates, commits, stop decisions, and final reporting.

## Required Input

Primary input:

- `.plan/{topic}/plan.md`

Supporting artifacts, when present:

- `.plan/{topic}/plan.nodes.jsonl`
- `.plan/{topic}/plan.edges.jsonl`
- `.plan/{topic}/proposal.md`
- `.plan/{topic}/map.graph.json`
- `.plan/{topic}/map.nodes.jsonl`
- `.plan/{topic}/map.edges.jsonl`
- `.plan/{topic}/facts.nodes.jsonl`
- `.plan/{topic}/facts.edges.jsonl`
- `.plan/_index/project-graph.sqlite`
- `.plan/_index/project-graph-manifest.json`

If the plan is missing, ask the user whether to generate it first with the `plan` skill. Do not improvise a phase plan silently.

## Core Rules

- Work one phase at a time in dependency order.
- Do not start a phase until all phases it depends on are complete and committed, or explicitly documented as no-op completed.
- Use `scout` for lookups/context before code edits in each phase.
- Use `worker` for code edits and fixes. The main agent should not make substantial code edits unless the user approves serial fallback.
- Check off plan checklist items in `.plan/{topic}/plan.md` only after verifying completion, and mirror status changes in `plan.nodes.jsonl` when present.
- Run all available relevant quality tools until green: typecheck, lint, build, tests, format/check, and phase-specific validations.
- Dispatch `reviewer` after quality tools are green.
- Reviewer must review the code diff and validate/check off phase validation items.
- Use `oracle` for plan/scope/dependency decisions, not routine code review. Reviewer remains the normal phase validation authority.
- If reviewer or validation fails, delegate fixes to `worker`, rerun quality tools, and call `reviewer` again.
- Commit at the end of each completed phase using a conventional commit message. If the phase is a true no-op, mark it complete with an explanatory note and avoid an empty commit.
- Stop and ask the user what to do when an unknown/blocking issue appears.

## Procedure

1. **Derive topic and locate the plan**
   - Summarize the requested plan topic in 3 words or less.
   - Locate `.plan/{topic}/plan.md`.
   - If no exact topic path exists, search `.plan/*/plan.md` for a likely matching plan and confirm with the user if ambiguous.
   - If only a legacy `.plan/{topic}/implementation.md` exists, ask the user whether to use it as the plan or migrate it to `.plan/{topic}/plan.md`.
   - Read the plan completely.
   - Read supporting proposal/map/fact/index artifacts when available.
   - Identify:
     - phases and phase IDs
     - phase statuses
     - phase dependencies
     - unchecked checklist items
     - unchecked validation items
     - cross-phase validation commands
     - open questions
   - If open questions block implementation, ask the user before proceeding.

2. **Inspect subagents and choose execution mode**
   - Call the subagent list action before delegating whenever the subagent tool is available.
   - Required preferred agents:
     - `scout`
     - `worker`
     - `reviewer`
   - Useful optional agents:
     - `oracle` for ambiguous plan/scope/dependency decisions, plan drift, repeated agent/tool failures, and unknown blockers
     - `planner` for repairing a flawed plan
   - If `worker` is unavailable, do not proceed automatically. Ask the user whether to:
     - substitute another editing-capable agent
     - run worker duties serially with the current agent
     - stop until `worker` is available
   - If `scout` or `reviewer` is unavailable, ask whether to substitute another agent or run that role serially. Do not silently skip review.
   - If no executable subagents are available, alert the user and ask whether to continue serially with the current agent. Only continue after approval.

3. **Preflight repository safety**
   - Check `git status --short`.
   - If there are pre-existing uncommitted changes not created by this workflow, stop and ask the user how to proceed before editing.
   - Record the current branch and commit SHA.
   - Ensure `.plan/{topic}/plan.md`, `.plan/{topic}/plan.nodes.jsonl`, and `.plan/{topic}/plan.edges.jsonl` are included in the phase workflow so checkbox/status updates are committed with the phase.
   - Do not stage or commit unrelated user changes.
   - Do not commit `.plan/_index/project-graph.sqlite` or other index/cache artifacts unless they are already tracked or the user explicitly wants them committed.

4. **Refresh implementation context**
   - Load/use the `index-project` skill when available. In the Pi Cartographer package, prefer `../index-project/SKILL.md` relative to this `SKILL.md`.
   - Refresh the shared index before starting implementation:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py index --root "$PWD"
     ```

   - Export or refresh `.plan/{topic}/map.graph.json` if needed:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py slice --root "$PWD" --topic "{topic}" --out ".plan/{topic}/map.graph.json" --limit 30
     ```

   - When supported, use `slice-jsonl --out-dir ".plan/{topic}"` if `map.nodes.jsonl` or `map.edges.jsonl` are missing/thin, then let scout verify/refine them.
   - If indexing fails, report the error and ask the user whether to continue with manual discovery. Do not silently skip indexing.

5. **Select the next executable phase**
   - Choose the first incomplete phase whose dependencies are complete.
   - Verify dependencies are acyclic and completed phases have commits or documented no-op completions.
   - If the next incomplete phase depends on an incomplete phase, stop and explain the dependency mismatch.
   - Mark the selected phase `in-progress` in `.plan/{topic}/plan.md` and in `plan.nodes.jsonl` when present.
   - For the selected phase, collect:
     - objective
     - checklist task IDs
     - validation item IDs
     - declared validation commands/manual checks
     - source references
     - risks/mitigations
     - notes for implementation agent

6. **Scout phase context**
   - Delegate to `scout`, or approved serial scout role, with:
     - the selected phase text
     - `.plan/{topic}/plan.md`
     - relevant proposal/map/fact artifacts
     - index path and graph slice path
   - Ask scout to return:
     - likely files to edit
     - files to avoid/edit carefully
     - existing symbols/components/functions to reuse
     - tests or validation commands related to the phase
     - generated artifacts or scripts that must be run
     - risks and hidden dependencies
     - any mismatch between the plan and current code
   - If scout discovers the phase is invalid or blocked by missing prerequisites, stop and ask the user unless the fix is clearly within the phase scope.

7. **Delegate implementation edits to `worker`**
   - Delegate actual code edits to `worker`, or approved serial worker role.
   - Use a structured acceptance contract when the subagent tool supports it. Criteria should include the exact checklist IDs, scope boundaries, changed-files evidence, commands to run when known, residual-risk reporting, and a stop rule for unrelated changes.
   - Provide:
     - selected phase text
     - exact unchecked checklist items for the phase
     - scout findings
     - relevant map/fact graph references
     - explicit instruction not to commit
     - explicit instruction to avoid unrelated changes
   - Worker should:
     - make the code/config/doc changes needed for the phase
     - add/update tests when the phase requires or implies them
     - run targeted checks when practical
     - report changed files, commands run, residual risks, and checklist items believed complete
   - If worker reports a blocker, repeated tool failure, or plan mismatch, decide whether it is a known fixable implementation issue. If not, stop and ask the user.

8. **Verify checklist items and update the plan**
   - Inspect worker output and relevant diffs.
   - For each phase checklist item:
     - verify the expected output exists
     - verify relevant code/tests/docs changed as needed
     - change `- [ ] **P?.T?**` to `- [x] **P?.T?**` only when complete
   - Mirror completed task status in `plan.nodes.jsonl` by setting matching `task:P?.T?` nodes to `status: complete` when present.
   - Leave incomplete items unchecked and delegate additional worker fixes as needed.
   - Do not check off validation items yet unless the corresponding validation has actually passed. Validation items should be checked by changing `- [ ] **P?.V?**` to `- [x] **P?.V?**` only after command output or reviewer approval proves the item passed.

9. **Run quality tools until green**
   - Discover quality commands from:
     - plan validation items
     - `package.json` scripts
     - project docs such as `AGENTS.md`, `README.md`, or plan notes
     - language/tooling config files
   - Run all available relevant checks. Typical order:
     1. format check or formatter if project policy allows
     2. typecheck/check
     3. lint
     4. tests
     5. build
     6. phase-specific validation commands
   - Examples:
     - `npm run check`
     - `npm run lint`
     - `npm run test`
     - `npm run build`
     - `npm run typecheck`
     - `pnpm ...`, `yarn ...`, `bun ...`, `pytest`, `cargo test`, `go test ./...` as appropriate
   - If a command is unavailable, record it as unavailable rather than failed.
   - If a command fails:
     - capture the failure output
     - delegate a targeted fix to `worker`
     - rerun the failed command and any dependent checks
   - Limit routine repair loops to **3 worker fix attempts per distinct failing command or validation item**.
   - If the same command/validation still fails after 3 scoped fix attempts, call `oracle` for a decision-level assessment and then stop to ask the user unless oracle identifies a clearly safe in-scope next step.
   - Continue the fix/check loop until green or until an unknown/blocking issue appears.

10. **Use `oracle` for plan/scope decision checks**
   - Do **not** use `oracle` as a routine substitute for `reviewer`. Reviewer is the right agent for code correctness, validation item approval, and phase sign-off.
   - Call `oracle`, or perform an approved serial oracle pass, only when implementation raises a decision-level concern:
     - the plan appears to conflict with the current codebase
     - phase ordering or dependencies may need to change
     - a required library/API/tool behaves differently than the plan assumed
     - the fix would expand scope beyond the current phase
     - scout, worker, and reviewer disagree about correctness or scope
     - the same command, tool, or subagent call fails repeatedly and the next action is unclear
     - an unexpected side effect appears outside the current phase
   - Oracle should answer: is this still within the approved plan, should the phase/order/scope change, or should we stop and ask the user?
   - Oracle may recommend options, but it must not override stop conditions or user approval requirements.

11. **Handle unknown or blocking issues**
   - Stop and ask the user what to do if any of these occur after any useful oracle check:
     - a library or API does not work as expected and requires a design choice
     - an update causes unexpected side effects outside the current phase scope
     - the plan conflicts with the current codebase
     - tests reveal a product/behavior decision not covered by the plan
     - a tool, command, or subagent call keeps failing after reasonable retries
     - fixing the issue would require changing phase order or scope
   - When stopping, explain:
     - phase and checklist item affected
     - what was attempted
     - exact error or symptom
     - likely causes
     - options for proceeding
     - oracle recommendation, if oracle was called
     - current git status and whether any changes are uncommitted

12. **Review and validate the phase**
   - Once quality tools are green, dispatch `reviewer`.
   - Reviewer must receive:
     - selected phase text
     - current diff/stat
     - commands run and outputs
     - checked checklist items
     - unchecked validation items
     - relevant proposal/map/fact graph references
   - Ask reviewer to:
     - review the code changes for correctness, maintainability, and scope control
     - verify every phase validation item
     - check off validation items in `.plan/{topic}/plan.md` if the reviewer can edit, or report exact items to check off
     - identify required fixes before approval
   - If reviewer rejects or any validation item fails:
     - do not commit
     - pass the reviewer findings back to `worker`
     - rerun quality tools
     - call `reviewer` again
   - Mirror approved validation status in `plan.nodes.jsonl` by setting matching `validation:P?.V?` nodes to `status: complete` when present.
   - Repeat until reviewer approves and all phase validation items are checked off.

13. **Complete and commit the phase**
   - Confirm all checklist and validation items for the phase are checked off in `.plan/{topic}/plan.md`.
   - Mark the phase `complete` in `.plan/{topic}/plan.md` and in `plan.nodes.jsonl` when present. If the phase completed with no source changes, add a short no-op completion note explaining why.
   - Run `git diff --check` when available.
   - Run a final minimal quality gate for the phase if not already done after the latest fix.
   - Stage only phase-related files, including `.plan/{topic}/plan.md`, `.plan/{topic}/plan.nodes.jsonl`, and `.plan/{topic}/plan.edges.jsonl` when changed.
   - Do not stage unrelated user changes or generated caches unless required by the plan.
   - Commit using a conventional commit message with a bullet list of major changes:

     ```bash
     git commit -m "feat({topic}): complete phase P1" \
       -m "- Implemented <major change>" \
       -m "- Added/updated validation for <area>" \
       -m "- Checked off phase P1 tasks and validations"
     ```

   - Choose the commit type based on the phase work:
     - `feat` for user-visible capability
     - `fix` for bug fixes
     - `refactor` for behavior-preserving restructuring
     - `test` for test-only work
     - `docs` for documentation-only work
     - `chore` for tooling/config/maintenance
   - If a phase changes only planning artifacts, use `docs` or `chore` as the commit type and explain the no-op source result in the commit body.
   - If a phase produces no file changes at all, do not create an empty commit unless the user explicitly asks. Mark/document the phase as no-op complete and explain why no commit was made.

14. **Continue to the next phase**
   - After a successful phase commit or documented no-op completion:
     - refresh `git status --short`
     - optionally refresh the project index if source files changed substantially
     - select the next incomplete dependency-ready phase
   - Repeat steps 5-13 until every phase is complete and validated.

15. **Final completion checks**
   - Run cross-phase validation from `.plan/{topic}/plan.md`.
   - Run the planning graph validator when available:

     ```bash
     python <plan-skill-dir>/scripts/validate_planning_graph.py --root "$PWD" --topic "{topic}"
     ```

   - Run the broadest available project quality gates again, typically check/lint/test/build.
   - Ensure every phase checklist and validation item is checked off.
   - Ensure each completed phase has a commit or documented no-op completion.
   - If final checks create fixes or plan/checkoff changes, assign them to the owning phase, rerun relevant checks/reviewer, and create a conventional commit before final response.
   - If final checks fail, delegate fixes to `worker`, rerun checks, and dispatch `reviewer` if the fix changes code.

16. **Final response**
   - Report:
     - completed topic
     - plan artifacts updated (`plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`)
     - phases completed
     - commits created
     - final quality commands run
     - reviewer approval status
     - any skipped/unavailable commands
     - any residual risks or follow-up recommendations

## Delegation Prompt Templates

### Scout

```text
Inspect implementation context for phase <PHASE_ID> of .plan/{topic}/plan.md.
Use .plan/_index/project-graph.sqlite, .plan/{topic}/map.graph.json, map.nodes.jsonl, map.edges.jsonl, facts.nodes.jsonl, and facts.edges.jsonl when present.
Return likely files to edit, files to avoid/edit carefully, reusable symbols, tests/validation commands, generated artifacts/scripts, risks, and any mismatch between the phase plan and current code.
Do not edit files.
```

### Worker

```text
Implement phase <PHASE_ID> from .plan/{topic}/plan.md.
Use the scout findings and source artifacts provided. Complete only the listed unchecked checklist items for this phase. Make code/config/doc/test changes as needed. Do not commit. Avoid unrelated changes. Run targeted checks if practical.
Acceptance criteria:
- Complete checklist IDs: <P?.T?>
- Provide changed-files summary and commands run.
- Do not modify files outside the phase scope unless explicitly justified.
- Report residual risks/blockers and stop for unknown design/product decisions.
Report changed files, commands run, checklist items completed, and residual risks/blockers.
```

### Worker Fix

```text
Fix the failures found while validating phase <PHASE_ID>. Use the command output/reviewer findings below. Keep the fix scoped to this phase. Do not commit. Report changed files and commands run.
```

### Oracle

```text
Evaluate this decision-level blocker for phase <PHASE_ID>. Do not review code line-by-line. Determine whether the issue is within the approved plan, requires a phase/order/scope change, or should be escalated to the user. Consider proposal goals/non-goals, phase dependencies, current codebase constraints, quality-tool output, and scout/worker/reviewer findings. Return recommended options and any stop condition.
```

### Reviewer

```text
Review phase <PHASE_ID> implementation. Check the current diff, commands run, checked checklist items, unchecked validation items, and source artifacts. Verify correctness, scope control, maintainability, and every validation item for this phase. If you can edit, check off passing validation items in .plan/{topic}/plan.md. If not, report exact validation items that may be checked off. Reject with required fixes for any issue.
```

## Stop Conditions

Stop and ask the user before continuing when:

- required subagents are unavailable and the user has not approved substitution or serial fallback
- there are unrelated pre-existing uncommitted changes
- the plan is missing or ambiguous
- a phase dependency is incomplete or cyclic
- an unknown design/product decision blocks implementation
- a library/tool/API behaves differently than expected and requires a choice
- quality tools fail after 3 scoped worker repair attempts for the same command/validation item
- worker/reviewer/subagent calls repeatedly fail
- fixing the issue would require expanding scope beyond the current phase
- committing would include unrelated files

## Verification Checklist

Before final completion, verify:

- `.plan/{topic}/plan.md` exists.
- Every phase is checked off or otherwise clearly marked complete.
- Every checklist item is checked off.
- Every validation item is checked off by reviewer approval or verified command output.
- Phase/task/validation statuses in `plan.nodes.jsonl` are consistent with checked Markdown items when the file exists.
- All phase dependencies were respected.
- All available quality tools are green or explicitly documented as unavailable/skipped with a reason.
- Reviewer approved the final code for each phase.
- Each phase with changes has a conventional commit.
- Final `git status --short` has no unexpected unstaged/uncommitted changes.
