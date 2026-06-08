---
name: "implement"
description: "Pi Cartographer implementation workflow: execute .plan/<topic>/plan.md phase-by-phase using deterministic context, cartographer-pathfinder phase writing, cartographer-auditor gates, optional compass checks, quality gates, and conventional commits."
version: 5
created: "2026-06-06"
updated: "2026-06-08"
---
# Pi Cartographer Implement

## When to Use

Use this skill when the user asks to implement an existing `.plan/{topic}/plan.md` plan, especially one produced by the `plan` skill.

This skill executes the plan phase-by-phase. It delegates:

- codebase lookups and context gathering to deterministic Cartographer tools plus focused lexical search; optional `scout` only when context is still insufficient
- actual phase edits/fixes to `cartographer-pathfinder` as the default phase writer; built-in `worker` is an approved fallback only
- phase and final semantic review to `cartographer-auditor` after deterministic validation receipts pass; built-in `reviewer` is an approved fallback only
- decision-level scope/dependency/repeated-failure assessment to `cartographer-compass` when needed

The orchestrating/current agent owns sequencing, quality gates, checklist updates, commits, timeout/fallback receipts, stop decisions, and final reporting.

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
- Use `cartographer-pathfinder` as default phase writer for code/config/doc/test edits and fixes. The main agent should not make substantial edits unless the user approves serial fallback and a fallback receipt records why the child writer was not used.
- Structured acceptance is mandatory for every non-trivial phase handoff to `cartographer-pathfinder` or fallback `worker`; include exact checklist IDs, validation IDs, scope boundaries, allowed files, changed-files evidence, commands/receipt requirements, residual-risk reporting, and stop rules.
- Check off plan checklist items in `.plan/{topic}/plan.md` only after verifying completion, and mirror status changes in `plan.nodes.jsonl` when present.
- Run all available relevant quality tools until green: typecheck, lint, build, tests, format/check, and phase-specific validations. Record deterministic validation receipts before semantic review.
- Dispatch `cartographer-auditor` after quality tools are green and deterministic validation receipts exist.
- `cartographer-auditor` must review the code/artifact diff and validate/check off phase validation items; a `PASS` is the default phase semantic gate.
- Use `cartographer-compass` for plan/scope/dependency decisions, not routine code review. `cartographer-auditor` remains the normal phase/final semantic validation authority.
- If auditor or validation fails, delegate fixes to `cartographer-pathfinder`, rerun quality tools, and call `cartographer-auditor` again.
- After repeated child timeouts, tool failures, or unusable handoffs, write timeout/fallback receipts and ask `cartographer-compass` for an escalation recommendation before substantial parent takeover.
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
     - ADR metadata (`adr_required`, `adr_reason`, `adr_options_status`, and `adr_tool_mode`) from the accepted proposal/plan when present
   - If open questions block implementation, ask the user before proceeding.
   - If ADR metadata is missing for an architecture-significant plan, treat it as ambiguous and ask whether to evaluate with `cartographer_adr` before finalization.

2. **Inspect subagents and choose execution mode**
   - Call the subagent list action before delegating whenever the subagent tool is available.
   - Required preferred Cartographer agents:
     - `cartographer-pathfinder` for single-phase implementation edits
     - `cartographer-auditor` for semantic review after deterministic validation receipts pass
   - Useful optional Cartographer agents:
     - `cartographer-compass` for ambiguous plan/scope/dependency decisions, plan drift, repeated agent/tool failures, and unknown blockers
     - `cartographer-drafter` for repairing flawed proposal/plan artifacts
   - Built-in `worker`, `reviewer`, `oracle`, `planner`, and `scout` are explicit fallback/substitution choices, not defaults. Use built-in `scout` only for missing/ambiguous context after index/map plus focused `search`/`rg` checks, or for complex unfamiliar architecture, and only with approved fallback.
   - If `cartographer-pathfinder` is unavailable, do not proceed automatically. Ask the user whether to:
     - substitute built-in `worker` or another editing-capable agent
     - run pathfinder duties serially with the current agent
     - stop until `cartographer-pathfinder` is available
     Record the approved substitution or serial mode as a fallback receipt before substantial edits.
   - If `cartographer-auditor` is unavailable, ask whether to substitute built-in `reviewer`/`oracle` or run that role serially. Do not silently skip review; record the fallback receipt before accepting any phase. If `scout` is unavailable, continue with Cartographer index/map tools unless the phase genuinely requires scout-style reconnaissance.
   - If a child repeatedly times out, fails tool calls, or returns unusable output, append timeout/fallback receipts and call `cartographer-compass` before substantial parent takeover or broad serial repair.
   - If no executable subagents are available, alert the user and ask whether to continue serially with the current agent. Only continue after approval and a fallback receipt.

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
   - Delegate to `scout`, or approved serial scout role, only if this index/map plus lexical context is missing, contradictory, or too broad for a safe `cartographer-pathfinder` handoff. If using scout, provide:
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

7. **Delegate implementation edits to `cartographer-pathfinder`**
   - Delegate actual code/config/doc/test edits to `cartographer-pathfinder`, the default phase writer, or to an approved fallback `worker`/serial pathfinder role only after recording the fallback reason.
   - Use structured acceptance for every non-trivial phase handoff. If the subagent tool has an acceptance schema, populate it; if not, put the same structured acceptance contract in the prompt and record the contract/receipt path. Criteria must include the exact checklist IDs, validation IDs, scope boundaries, allowed/candidate files, changed-files evidence, commands to run when known, validation receipt requirements, residual-risk reporting, and stop rules for unrelated changes or product/scope decisions.
   - Provide:
     - selected phase text
     - exact unchecked checklist items for the phase
     - exact validation IDs and known commands/manual checks
     - scout findings or a note that deterministic context was sufficient
     - relevant map/fact graph references and context-pack path
     - explicit instruction not to commit
     - explicit instruction to avoid unrelated changes
     - timeout/fallback receipt requirements and stop rules
   - `cartographer-pathfinder` should:
     - make the code/config/doc/test changes needed for the phase
     - add/update tests when the phase requires or implies them
     - run targeted checks when practical
     - write/report validation receipt information when practical
     - report changed files, commands run, residual risks, and checklist items believed complete
   - If pathfinder reports a blocker, repeated tool failure, timeout, or plan mismatch, decide whether it is a known fixable implementation issue. If not, ask `cartographer-compass` for a decision recommendation before substantial parent takeover, then stop and ask the user when required.

8. **Verify checklist items and update the plan**
   - Inspect `cartographer-pathfinder` (or approved fallback writer) output and relevant diffs.
   - For each phase checklist item:
     - verify the expected output exists
     - verify relevant code/tests/docs changed as needed
     - change `- [ ] **P?.T?**` to `- [x] **P?.T?**` only when complete
   - Mirror completed task status in `plan.nodes.jsonl` by setting matching `task:P?.T?` nodes to `status: complete` when present.
   - Leave incomplete items unchecked and delegate additional `cartographer-pathfinder` fixes as needed.
   - Do not check off validation items yet unless the corresponding validation has actually passed. Validation items should be checked by changing `- [ ] **P?.V?**` to `- [x] **P?.V?**` only after command output or `cartographer-auditor` approval proves the item passed.

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
     - delegate a targeted fix to `cartographer-pathfinder` or the approved fallback writer
     - rerun the failed command and any dependent checks
   - Limit routine repair loops to **3 pathfinder fix attempts per distinct failing command or validation item**.
   - If the same command/validation still fails after 3 scoped fix attempts, write timeout/fallback receipts as appropriate, call `cartographer-compass` for a decision-level assessment, and then stop to ask the user unless compass identifies a clearly safe in-scope next step.
   - Continue the fix/check loop until green or until an unknown/blocking issue appears.

10. **Use `cartographer-compass` for plan/scope decision checks**
   - Do **not** use `cartographer-compass`/`oracle` as a routine substitute for `cartographer-auditor`. `cartographer-auditor` is the right agent for code correctness, validation item approval, and phase sign-off.
   - Call `cartographer-compass`, or perform an approved serial oracle pass, only when implementation raises a decision-level concern:
     - the plan appears to conflict with the current codebase
     - phase ordering or dependencies may need to change
     - a required library/API/tool behaves differently than the plan assumed
     - the fix would expand scope beyond the current phase
     - scout, pathfinder, and auditor disagree about correctness or scope
     - the same command, tool, or subagent call fails repeatedly and the next action is unclear
     - an unexpected side effect appears outside the current phase
   - `cartographer-compass`/oracle should answer: is this still within the approved plan, should the phase/order/scope change, or should we stop and ask the user?
   - Compass/oracle may recommend options, but it must not override stop conditions, auditor gates, or user approval requirements.

11. **Handle unknown or blocking issues**
   - Stop and ask the user what to do if any of these occur after any useful `cartographer-compass`/oracle check:
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
     - `cartographer-compass`/oracle recommendation, if one was called
     - current git status and whether any changes are uncommitted

12. **Audit and validate the phase**
   - Once quality tools are green and deterministic validation receipts exist, dispatch `cartographer-auditor` as the default phase semantic gate.
   - `cartographer-auditor` must receive:
     - selected phase text
     - current diff/stat
     - commands run, summarized outputs, and validation receipt IDs/paths
     - checked checklist items
     - unchecked validation items
     - relevant proposal/map/fact graph references
     - structured acceptance criteria used for the pathfinder handoff
   - Ask `cartographer-auditor` to:
     - review the code/artifact changes for correctness, maintainability, and scope control
     - verify every phase validation item against deterministic receipts and targeted inspection
     - check off validation items in `.plan/{topic}/plan.md` if the auditor can edit, or report exact items to check off
     - identify required fixes before approval
     - return an explicit `PASS`/`FAIL`
   - If `cartographer-auditor` rejects or any validation item fails:
     - do not commit
     - pass the auditor findings back to `cartographer-pathfinder` or the approved fallback writer
     - rerun quality tools and update validation receipts
     - call `cartographer-auditor` again
   - If `cartographer-auditor` is unavailable or times out, use built-in `reviewer`/`oracle` or serial review only with user-approved fallback and an explicit fallback receipt; do not silently accept the phase.
   - Mirror approved validation status in `plan.nodes.jsonl` by setting matching `validation:P?.V?` nodes to `status: complete` when present.
   - Repeat until `cartographer-auditor` passes (or approved fallback receipt records pass) and all phase validation items are checked off.

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
   - Run a final `cartographer-auditor` semantic gate after deterministic final validation receipts pass; built-in reviewer/oracle or serial final review are fallback substitutes only with explicit fallback receipts.
   - If final checks create fixes or plan/checkoff changes, assign them to the owning phase, rerun relevant checks/auditor, and create a conventional commit before final response.
   - If final checks fail, delegate fixes to `cartographer-pathfinder` or the approved fallback writer, rerun checks, and dispatch `cartographer-auditor` if the fix changes code.

16. **Finalize ADR intent after validation**
   - Run this step only after deterministic final validation is green and before the final handoff.
   - Inspect accepted proposal/plan ADR metadata. If `adr_required: true`, use `cartographer_adr` (or `python <plan-skill-dir>/scripts/adr_records.py`) to draft/write/validate a workflow ADR for `{topic}`.
   - Workflow-generated ADR evidence must include:
     - stable topic ID (`--topic {topic}`)
     - passed validation receipt IDs from `.plan/{topic}/receipts.jsonl`
     - phase/final commit IDs when available (`--source-commit <sha>`)
     - a concise validation summary with no raw `.plan/_private/**` references and no brittle raw log paths
   - Typical commands, keeping output shaped under the Clean Context Contract:

     ```bash
     cartographer_adr({"action":"draft","root":"$PWD","topic":"{topic}","maxOutputChars":8000})
     cartographer_adr({"action":"write","root":"$PWD","topic":"{topic}","title":"<decision>","decision":"<decision>","context":"<context>","options":["<accepted option>","<alternative>"],"rationale":"<why>","domains":["<domain>"],"keywords":["<keyword>"],"validationReceipts":["<receipt-id>"],"sourceCommits":["<sha>"],"maxOutputChars":8000})
     cartographer_adr({"action":"validate","root":"$PWD","maxOutputChars":8000})
     ```

   - If `adr_required: false`, append an `adr-not-required` receipt to `.plan/{topic}/receipts.jsonl` with `topic`, `reason`, `source: proposal-metadata`, `validation_receipts`, optional `source_commits`, `created_at`, and `status: skipped`. Do not silently skip.
   - If ADR metadata is missing or conflicts with an obviously ADR-worthy change, stop and ask the user whether to create an ADR, update metadata, or record an `adr-not-required` receipt.
   - Do not generate ADRs before validation evidence exists, do not include raw/private artifact paths, and do not make subagents mandatory for ADR finalization.

17. **Final response**
   - Report:
     - completed topic
     - plan artifacts updated (`plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`)
     - phases completed
     - commits created
     - final quality commands run
     - `cartographer-auditor` approval status or approved fallback receipt
     - ADR outcome: generated ADR path/graph validation, `adr-not-required` receipt ID, or user-deferred decision
     - any skipped/unavailable commands
     - any residual risks or follow-up recommendations

## Delegation Prompt Templates

Performance rules:

- Follow the Clean Context Contract: normal LLM-facing outputs should stay near 8KB, expanded diagnostics near 16KB, and larger outputs should be represented by compact receipts with `summary`, `references`, `counts`, `token_estimate`, `truncated`, `full_output_path`, `verification`, and `next_actions`.
- Before each phase handoff, write or update a compact `.plan/{topic}/context-packs.jsonl` record with the phase ID, budget, relevant references, verified files, candidate files, open questions, and validation commands.
- After each significant command, subagent handoff, timeout, fallback substitution, or phase decision, append a `.plan/{topic}/receipts.jsonl` record instead of relying on transcript continuity. Timeout/fallback receipts should include child name, attempt count, timeout/error summary, control fields used when available, fallback approved by the user, `cartographer-compass` recommendation when repeated, and residual risk. Validation receipts should include commands, exit codes/results, durations, changed-file hashes when available, and validation IDs satisfied.
- Use `python skills/plan/scripts/validation_runner.py --receipt-file .plan/{topic}/receipts.jsonl --phase-id <P?> --validation-id <P?.V?> --command "<check>" --json` for repeatable validation receipts when available. During repair loops, run targeted checks first and use `--skip-if-unchanged` only when a previous passed receipt has the same file hash set; still run one final full gate before phase signoff.
- Keep raw command/search/session output in `/tmp/pi-cartographer-runs/` by default; use ignored `.plan/_runs/` only when explicitly useful for local replay, and never cite or commit raw run logs.
- Do not inline large scout/research/planner/pathfinder/auditor outputs into later prompts; pass artifact paths, receipt IDs, and concise summaries. Use `outputMode: "file-only"` for large child outputs.
- Prefer `cartographer_index context`, `repo-map`, `read`, safe `search`, `cartographer_jsonl validate-topic`, focused `rg`/grep, and selective reads before launching optional scout.
- Do not ask child agents to dump SQLite schemas, grep entire large drafts, or read whole local docs unless targeted indexed reads and focused lexical searches are insufficient.
- Use `cartographer-pathfinder` as the default phase writer, `cartographer-auditor` for phase/final code/artifact semantic validation after deterministic receipts pass, and `cartographer-compass` only for decision/scope consistency or repeated child failures. Built-in worker/reviewer/oracle remain fallback substitutes only.

Retrieval and lifecycle contract for implementation:

- Lifecycle states are `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`. Implement only from active `planned`/`in-progress` artifacts; treat `superseded` or `stale` artifacts as historical rationale requiring user or `cartographer-compass`/oracle confirmation before use.
- Candidate/verified metadata uses `candidate`, `verified`, and `verification` fields. `cartographer-pathfinder` handoffs should not rely on candidate-only files for edit instructions unless the child is explicitly told to verify first.
- Retrieval misses that materially change implementation should be appended to `.plan/_retrieval/misses.jsonl` with `failure_type`, `original_query`, `expanded_queries`, `retrieval_modes`, `expected_terms`, `eventual_hit`, and `resolution`.
- Retrieval scopes are `code`, `plans`, and `all`, with `code` as the default. Implementation source-code retrieval should exclude `.plan/**`; rationale retrieval should search `.plan/` only through bounded probes for the active or explicitly related topics, including sanitized evidence docs when relevant. Raw `.plan/_private/**` inputs are off limits during implementation unless a phase explicitly tests private intake with synthetic fixtures.
- ADR finalization is metadata-gated: after final validation, `adr_required: true` should produce a validated `cartographer_adr` workflow ADR, while `adr_required: false` should produce an explicit `adr-not-required` receipt with a short reason.

Role-scoped least-privilege Cartographer tool examples for delegated agents in this workflow (`scout`, `cartographer-pathfinder`/fallback `worker`, `cartographer-auditor`/fallback `reviewer`, and optional `cartographer-compass`/`oracle`/`planner`):

```bash
cartographer_index({"action":"ensure","root":"$PWD"})
cartographer_index({"action":"query","root":"$PWD","topic":"{topic}","limit":10})
cartographer_index({"action":"read","root":"$PWD","path":"<project-relative-path>"})
cartographer_index({"action":"read","root":"$PWD","nodeId":"<indexed-node-id>"})
cartographer_jsonl({"action":"validate-topic","root":"$PWD","topic":"{topic}"})
cartographer_evidence({"action":"list","root":"$PWD","topic":"{topic}"})
cartographer_adr({"action":"draft","root":"$PWD","topic":"{topic}","maxOutputChars":8000})
cartographer_adr({"action":"validate","root":"$PWD","maxOutputChars":8000})
```

When launching delegated agents through pi-subagents, include the package extension path `extensions/cartographer-tools.ts` in the child tool/extension configuration when supported so needed tools are callable. Apply a least-privilege child tool policy: do not grant every child full mutable JSONL/private/ADR/receipt authority, raw `.plan/_private/**` access, ADR write actions, or broad receipt append authority. The parent owns canonical plan/checkoff/receipt/ADR writes unless a structured acceptance contract explicitly scopes a pathfinder edit. Tell each delegated agent it may run `cartographer_index` with `action: "ensure"` before reading the index when freshness is uncertain; if it reports `action: "reindexed"`, it should continue from the refreshed index and mention that in its handoff. If custom tools are unavailable in the child, use the equivalent `python <index-project-skill-dir>/scripts/index_project.py ...`, `python <plan-skill-dir>/scripts/private_artifacts.py ...`, and `node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts ...` CLI commands via bash, then write fallback receipts for substituted validation/audit paths. Do not ask agents to inspect the SQLite file manually when the index tool can answer the question. Do not ask agents to read raw `.plan/_private/**` inputs; use sanitized `.plan/{topic}/evidence/` docs instead.

### Optional Scout

```text
Inspect implementation context for phase <PHASE_ID> of .plan/{topic}/plan.md only where deterministic Cartographer index/map context plus focused lexical checks are insufficient.
Start from cartographer_index query/read and .plan/{topic}/map.nodes.jsonl, map.edges.jsonl, facts.nodes.jsonl, and facts.edges.jsonl when present. Then use focused `rg`/grep for exact identifiers, filenames, tests, scripts, commands, generated artifacts, and error strings. Do not rediscover the repo broadly or read whole large files unless indexed snippets and lexical hits are insufficient.
Return likely files to edit, files to avoid/edit carefully, reusable symbols, tests/validation commands, generated artifacts/scripts, risks, and any mismatch between the phase plan and current code.
Do not edit files.
```

### Pathfinder

```text
Implement phase <PHASE_ID> from .plan/{topic}/plan.md as cartographer-pathfinder, the default phase writer.
Use the deterministic context summary, optional scout findings, source artifacts, and context-pack path provided. You have read access to Cartographer tools; run ensure/read if you need fresh indexed context, and use focused `rg`/grep for exact code evidence before editing. Complete only the listed unchecked checklist items for this phase. Make code/config/doc/test changes as needed. Do not commit. Avoid unrelated changes. Run targeted checks if practical and write/report validation receipt information.
Structured acceptance (mandatory for non-trivial phase handoffs):
- Complete checklist IDs: <P?.T?>
- Address validation IDs: <P?.V?>
- Stay within scope and allowed files: <paths/scope>
- Provide changed-files summary, commands run, receipt paths/IDs, and residual risks.
- Do not modify files outside the phase scope unless explicitly justified.
- Report residual risks/blockers and stop for unknown design/product decisions, repeated tool failures, or changes outside the phase.
Report changed files, commands run, checklist items completed, validation status, and residual risks/blockers.
```

### Pathfinder Fix

```text
Fix the failures found while validating phase <PHASE_ID>. Use the command output/auditor findings below. You have read access to the index tool commands and may run ensure/read if you need fresh indexed context; use focused `rg`/grep for exact failing identifiers, files, tests, or errors. Keep the fix scoped to this phase. Do not commit. Report changed files, commands run, receipt updates, and residual risks.
```

### Compass

```text
Evaluate this decision-level blocker for phase <PHASE_ID>. Do not review code line-by-line. You have read access to the index tool commands and may run ensure/read if freshness or references are uncertain. Determine whether the issue is within the approved plan, requires a phase/order/scope change, or should be escalated to the user. Consider proposal goals/non-goals, phase dependencies, current codebase constraints, quality-tool output, deterministic context, timeout/fallback receipts, and pathfinder/auditor/optional-scout findings. Return recommended options and any stop condition before substantial parent takeover.
```

### Auditor

```text
Review phase <PHASE_ID> implementation after deterministic validation receipts pass. Check the current diff, commands run, checked checklist items, unchecked validation items, structured acceptance criteria, receipt IDs/paths, and source artifacts. You have read access to the index tool commands and may run ensure/read if freshness or references are uncertain. Verify correctness, scope control, maintainability, and every validation item for this phase. If you can edit, check off passing validation items in .plan/{topic}/plan.md. If not, report exact validation items that may be checked off. Return PASS/FAIL and reject with required fixes for any issue.
```

## Stop Conditions

Stop and ask the user before continuing when:

- required subagents are unavailable and the user has not approved substitution or serial fallback
- there are unrelated pre-existing uncommitted changes
- the plan is missing or ambiguous
- a phase dependency is incomplete or cyclic
- an unknown design/product decision blocks implementation
- a library/tool/API behaves differently than expected and requires a choice
- quality tools fail after 3 scoped pathfinder repair attempts for the same command/validation item
- pathfinder/auditor/subagent calls repeatedly fail and `cartographer-compass` has been consulted before substantial parent takeover
- fixing the issue would require expanding scope beyond the current phase
- committing would include unrelated files
- ADR metadata is missing or contradictory for an ADR-worthy implementation and the user has not chosen create/update/skip

## Verification Checklist

Before final completion, verify:

- `.plan/{topic}/plan.md` exists.
- `.gitignore` contains `.plan/_index/` when indexing succeeded.
- Every phase is checked off or otherwise clearly marked complete.
- Every checklist item is checked off.
- Every validation item is checked off by `cartographer-auditor` approval or verified command output, or by an approved fallback receipt.
- Phase/task/validation statuses in `plan.nodes.jsonl` are consistent with checked Markdown items when the file exists.
- All phase dependencies were respected.
- All available quality tools are green or explicitly documented as unavailable/skipped with a reason.
- `cartographer-auditor` approved the final code/artifacts for each phase, or an approved fallback receipt records the semantic gate outcome.
- Each phase with changes has a conventional commit.
- If `adr_required: true`, `cartographer_adr draft/write/validate` ran after final validation and the ADR path/validation receipt is recorded.
- If `adr_required: false`, `.plan/{topic}/receipts.jsonl` contains an `adr-not-required` receipt with a reason and validation receipt references.
- Final `git status --short` has no unexpected unstaged/uncommitted changes.
