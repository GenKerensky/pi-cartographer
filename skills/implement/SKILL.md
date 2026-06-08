---
name: "implement"
description: "Pi Cartographer implementation workflow: execute .plan/<topic>/plan.md phase-by-phase using scout, worker, reviewer, optional oracle checks, quality gates, and conventional commits."
version: 4
created: "2026-06-06"
updated: "2026-06-07"
---
# Pi Cartographer Implement

## When to Use

Use this skill when the user asks to implement an existing `.plan/{topic}/plan.md` plan, especially one produced by the `plan` skill.

This skill executes the plan phase-by-phase. It delegates:

- codebase lookups and context gathering to deterministic Cartographer tools plus focused lexical search; optional `scout` only when context is still insufficient
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
- Prefer plan/map JSONL, `cartographer_index query/read`, focused `rg`/grep, and selective file reads for lookups/context before code edits. Use `scout` only when this deterministic and lexical context is insufficient or the phase spans complex unfamiliar architecture.
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
     - `worker`
     - `reviewer`
   - Optional preferred agent:
     - `scout` only for missing/ambiguous context after index/map plus focused `rg`/grep checks, or for complex unfamiliar architecture
   - Useful optional agents:
     - `oracle` for ambiguous plan/scope/dependency decisions, plan drift, repeated agent/tool failures, and unknown blockers
     - `planner` for repairing a flawed plan
   - If `worker` is unavailable, do not proceed automatically. Ask the user whether to:
     - substitute another editing-capable agent
     - run worker duties serially with the current agent
     - stop until `worker` is available
   - If `reviewer` is unavailable, ask whether to substitute another agent or run that role serially. Do not silently skip review. If `scout` is unavailable, continue with Cartographer index/map tools unless the phase genuinely requires scout-style reconnaissance.
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
   - Run `ensure` before starting implementation so the index is created or re-indexed only when stale:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py ensure --root "$PWD" --json
     ```

   - The indexer must ensure `.plan/_index/` is present in the target project's `.gitignore`; do not commit the generated SQLite index/cache unless the user explicitly asks.
   - Do not create `.plan/{topic}/map.graph.json` by default; it duplicates the shared SQLite index. Only request a raw JSON slice for explicit debugging or offline review.
   - When supported, use `slice-jsonl --out-dir ".plan/{topic}"` if `map.nodes.jsonl` or `map.edges.jsonl` are missing/thin, then validate with `cartographer_jsonl validate-topic`. Let scout verify/refine them only if deterministic output plus focused `rg`/grep checks are inadequate.
   - If indexing fails, report the error and ask the user whether to continue with manual discovery using `rg`/grep and selective reads. Do not silently skip indexing.

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

6. **Create a bounded retrieval plan and gather phase context; use `scout` only when needed**
   - Before phase context gathering or optional scout, write a short retrieval plan with 5-10 targeted probes derived from the selected phase. Include exact identifiers, filenames, tests, scripts, commands, config keys, generated artifacts, error strings, and constrained generic terms.
   - Run bounded rationale retrieval in `.plan/` for the active topic and explicitly related topics only, including sanitized `evidence/` docs when they inform the active plan. Treat retrieved rationale as historical evidence requiring freshness checks before it influences implementation.
   - Keep source-code retrieval and rationale retrieval separate: code probes should exclude `.plan/**`; rationale probes should explicitly target `.plan/` and must never include raw `.plan/_private/**` inputs.
   - First use `.plan/{topic}/plan.md`, map JSONL, fact JSONL, deterministic validation reports, `cartographer_index query/read`, focused `rg`/grep searches, and selective file reads to gather phase context. For concrete code evidence, search exact identifiers, filenames, scripts, tests, commands, and error strings before relying on broad indexed snippets. Do not read entire large files or raw generated artifacts when targeted indexed context or lexical hits are enough.
   - Delegate to `scout`, or approved serial scout role, only if this index/map plus lexical context is missing, contradictory, or too broad for a safe worker handoff. If using scout, provide:
     - the selected phase text
     - `.plan/{topic}/plan.md`
     - relevant proposal/map/fact artifacts
     - index path and map JSONL paths
     - any known `rg`/grep findings and exact identifiers or filenames to verify
   - Ask scout to start with focused `rg`/grep for concrete code evidence, cross-check index/map context, and return:
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
     - optionally run `index_project.py ensure --root "$PWD" --json` if source files changed substantially
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

Performance rules:

- Follow the Clean Context Contract: normal LLM-facing outputs should stay near 8KB, expanded diagnostics near 16KB, and larger outputs should be represented by compact receipts with `summary`, `references`, `counts`, `token_estimate`, `truncated`, `full_output_path`, `verification`, and `next_actions`.
- Before each phase handoff, write or update a compact `.plan/{topic}/context-packs.jsonl` record with the phase ID, budget, relevant references, verified files, candidate files, open questions, and validation commands.
- After each significant command, subagent handoff, timeout, or phase decision, append a `.plan/{topic}/receipts.jsonl` record instead of relying on transcript continuity. Validation receipts should include commands, exit codes/results, durations, changed-file hashes when available, and validation IDs satisfied.
- Use `python skills/plan/scripts/validation_runner.py --receipt-file .plan/{topic}/receipts.jsonl --phase-id <P?> --validation-id <P?.V?> --command "<check>" --json` for repeatable validation receipts when available. During repair loops, run targeted checks first and use `--skip-if-unchanged` only when a previous passed receipt has the same file hash set; still run one final full gate before phase signoff.
- Keep raw command/search/session output in `/tmp/pi-cartographer-runs/` by default; use ignored `.plan/_runs/` only when explicitly useful for local replay, and never cite or commit raw run logs.
- Do not inline large scout/research/planner outputs into worker/reviewer prompts; pass artifact paths and concise summaries. Use `outputMode: "file-only"` for large child outputs.
- Prefer `cartographer_index context`, `repo-map`, `read`, safe `search`, `cartographer_jsonl validate-topic`, focused `rg`/grep, and selective reads before launching optional scout.
- Do not ask child agents to dump SQLite schemas, grep entire large drafts, or read whole local docs unless targeted indexed reads and focused lexical searches are insufficient.
- Use reviewer for code/artifact validation and oracle only for decision/scope consistency.

Retrieval and lifecycle contract for implementation:

- Lifecycle states are `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`. Implement only from active `planned`/`in-progress` artifacts; treat `superseded` or `stale` artifacts as historical rationale requiring user or oracle confirmation before use.
- Candidate/verified metadata uses `candidate`, `verified`, and `verification` fields. Worker handoffs should not rely on candidate-only files for edit instructions unless the worker is explicitly told to verify first.
- Retrieval misses that materially change implementation should be appended to `.plan/_retrieval/misses.jsonl` with `failure_type`, `original_query`, `expanded_queries`, `retrieval_modes`, `expected_terms`, `eventual_hit`, and `resolution`.
- Retrieval scopes are `code`, `plans`, and `all`, with `code` as the default. Implementation source-code retrieval should exclude `.plan/**`; rationale retrieval should search `.plan/` only through bounded probes for the active or explicitly related topics, including sanitized evidence docs when relevant. Raw `.plan/_private/**` inputs are off limits during implementation unless a phase explicitly tests private intake with synthetic fixtures.
- Final concise ADR generation into `docs/` is out of scope for this plan and should be handled by a later proposal.

Cartographer tool access for every delegated agent in this workflow (`scout`, `worker`, `reviewer`, and optional `oracle`/`planner`):

```bash
cartographer_index({"action":"ensure","root":"$PWD"})
cartographer_index({"action":"query","root":"$PWD","topic":"{topic}","limit":10})
cartographer_index({"action":"read","root":"$PWD","path":"<project-relative-path>"})
cartographer_index({"action":"read","root":"$PWD","nodeId":"<indexed-node-id>"})
cartographer_jsonl({"action":"validate-topic","root":"$PWD","topic":"{topic}"})
cartographer_evidence({"action":"list","root":"$PWD","topic":"{topic}"})
```

When launching delegated agents through pi-subagents, include the package extension path `extensions/cartographer-tools.ts` in the child tool/extension configuration when supported so these tools are callable. Tell each delegated agent it may run `cartographer_index` with `action: "ensure"` before reading the index; if it reports `action: "reindexed"`, it should continue from the refreshed index and mention that in its handoff. If custom tools are unavailable in the child, use the equivalent `python <index-project-skill-dir>/scripts/index_project.py ...`, `python <plan-skill-dir>/scripts/private_artifacts.py ...`, and `node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts ...` CLI commands via bash. Do not ask agents to inspect the SQLite file manually when the index tool can answer the question. Do not ask agents to read raw `.plan/_private/**` inputs; use sanitized `.plan/{topic}/evidence/` docs instead.

### Optional Scout

```text
Inspect implementation context for phase <PHASE_ID> of .plan/{topic}/plan.md only where deterministic Cartographer index/map context plus focused lexical checks are insufficient.
Start from cartographer_index query/read and .plan/{topic}/map.nodes.jsonl, map.edges.jsonl, facts.nodes.jsonl, and facts.edges.jsonl when present. Then use focused `rg`/grep for exact identifiers, filenames, tests, scripts, commands, generated artifacts, and error strings. Do not rediscover the repo broadly or read whole large files unless indexed snippets and lexical hits are insufficient.
Return likely files to edit, files to avoid/edit carefully, reusable symbols, tests/validation commands, generated artifacts/scripts, risks, and any mismatch between the phase plan and current code.
Do not edit files.
```

### Worker

```text
Implement phase <PHASE_ID> from .plan/{topic}/plan.md.
Use the deterministic context summary, optional scout findings, and source artifacts provided. You have read access to Cartographer tools; run ensure/read if you need fresh indexed context, and use focused `rg`/grep for exact code evidence before editing. Complete only the listed unchecked checklist items for this phase. Make code/config/doc/test changes as needed. Do not commit. Avoid unrelated changes. Run targeted checks if practical.
Acceptance criteria:
- Complete checklist IDs: <P?.T?>
- Provide changed-files summary and commands run.
- Do not modify files outside the phase scope unless explicitly justified.
- Report residual risks/blockers and stop for unknown design/product decisions.
Report changed files, commands run, checklist items completed, and residual risks/blockers.
```

### Worker Fix

```text
Fix the failures found while validating phase <PHASE_ID>. Use the command output/reviewer findings below. You have read access to the index tool commands and may run ensure/read if you need fresh indexed context; use focused `rg`/grep for exact failing identifiers, files, tests, or errors. Keep the fix scoped to this phase. Do not commit. Report changed files and commands run.
```

### Oracle

```text
Evaluate this decision-level blocker for phase <PHASE_ID>. Do not review code line-by-line. You have read access to the index tool commands and may run ensure/read if freshness or references are uncertain. Determine whether the issue is within the approved plan, requires a phase/order/scope change, or should be escalated to the user. Consider proposal goals/non-goals, phase dependencies, current codebase constraints, quality-tool output, deterministic context, and worker/reviewer/optional-scout findings. Return recommended options and any stop condition.
```

### Reviewer

```text
Review phase <PHASE_ID> implementation. Check the current diff, commands run, checked checklist items, unchecked validation items, and source artifacts. You have read access to the index tool commands and may run ensure/read if freshness or references are uncertain. Verify correctness, scope control, maintainability, and every validation item for this phase. If you can edit, check off passing validation items in .plan/{topic}/plan.md. If not, report exact validation items that may be checked off. Reject with required fixes for any issue.
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
- `.gitignore` contains `.plan/_index/` when indexing succeeded.
- Every phase is checked off or otherwise clearly marked complete.
- Every checklist item is checked off.
- Every validation item is checked off by reviewer approval or verified command output.
- Phase/task/validation statuses in `plan.nodes.jsonl` are consistent with checked Markdown items when the file exists.
- All phase dependencies were respected.
- All available quality tools are green or explicitly documented as unavailable/skipped with a reason.
- Reviewer approved the final code for each phase.
- Each phase with changes has a conventional commit.
- Final `git status --short` has no unexpected unstaged/uncommitted changes.
