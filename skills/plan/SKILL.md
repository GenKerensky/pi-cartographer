---
name: "plan"
description: "Pi Cartographer planning workflow: generate .plan/<topic>/plan.md from a proposal plus index-project, map, and research graphs with ordered phases, dependencies, checklists, and validation criteria."
version: 5
created: "2026-06-06"
updated: "2026-06-08"
---
# Pi Cartographer Plan

## When to Use

Use this skill when the user asks for a plan, delivery plan, execution plan, or task breakdown that should live at `.plan/{topic}/plan.md`.

This skill assumes planning should be grounded in:

- the shared `index-project` SQLite + FTS5 project graph
- proposal artifacts when available
- topic map graph artifacts
- research fact graph artifacts
- delegated subagent review when available, or an approved serial current-agent workflow when subagents are unavailable

Do **not** implement code while using this skill. Produce the plan only, unless the user explicitly asks to start execution afterward.

## Outputs

Create or update these primary artifacts:

- `.plan/{topic}/plan.md`
- `.plan/{topic}/plan.nodes.jsonl` — machine-readable plan graph nodes for phases, tasks, validations, and cross-phase checks.
- `.plan/{topic}/plan.edges.jsonl` — machine-readable plan graph edges for `contains`, `depends_on`, `validates`, `unlocks`, and `blocked_by` relationships.

Use or create/update these supporting artifacts when needed:

- `.plan/_index/project-graph.sqlite`
- `.plan/_index/project-graph-manifest.json`
- `.plan/{topic}/proposal.md` when it already exists or when the user provides enough scope to summarize
- `.plan/{topic}/map.nodes.jsonl`
- `.plan/{topic}/map.edges.jsonl`
- `.plan/{topic}/facts.nodes.jsonl`
- `.plan/{topic}/facts.edges.jsonl`

`{topic}` is a concise summary of the user's requested topic in **3 words or less**. Prefer filesystem-safe lowercase kebab-case for paths.

## Procedure

1. **Derive the topic and inspect existing artifacts**
   - Summarize the user's plan topic in 3 words or less.
   - Create `.plan/{topic}/` if needed.
   - Check for existing artifacts:
     - `.plan/{topic}/proposal.md`
     - `.plan/{topic}/map.nodes.jsonl`
     - `.plan/{topic}/map.edges.jsonl`
     - `.plan/{topic}/facts.nodes.jsonl`
     - `.plan/{topic}/facts.edges.jsonl`
     - `.plan/{topic}/plan.nodes.jsonl`
     - `.plan/{topic}/plan.edges.jsonl`
   - If `.plan/{topic}/plan.md`, `plan.nodes.jsonl`, or `plan.edges.jsonl` already exists, do not blindly overwrite them. Preserve useful content, reconcile with the current proposal/index/research graphs, and continue existing phase/task/validation IDs when possible.
   - If there is no proposal and the user request is too vague to derive plan scope, ask one clarifying question before proceeding.

2. **Inspect available subagents and choose execution mode**
   - Call the subagent list action before delegating whenever the subagent tool is available.
   - Preferred Cartographer agents:
     - `cartographer-drafter` for phase planning from compact proposal/map/fact/context-pack inputs
     - `cartographer-auditor` for final semantic plan review after deterministic validation
     - `cartographer-compass` for phase dependency, scope, or decision-consistency conflicts
     - `cartographer-archivist` only when research facts are missing, stale, or insufficient
   - Built-in `scout`, `planner`, `oracle`, `reviewer`, and `researcher` are explicit fallback/substitution choices, not defaults. Use built-in `scout` only when deterministic Cartographer index/map tools plus focused `search`/`rg` checks are insufficient and the user approves fallback.
   - If the subagent list returns **no executable subagents**, or the subagent tool is unavailable:
     - Alert the user that no subagents are available for the plan workflow.
     - Ask whether they want to continue by running the full workflow serially with the current agent.
     - Do not proceed beyond artifact inspection unless the user approves serial mode.
     - If the user declines, stop and report any initialized paths.
   - If some executable subagents exist but a preferred exact agent is unavailable, ask the user whether to substitute the closest available agent or run that role serially with the current agent. Do not silently skip review roles.

3. **Refresh the shared project index**
   - Load and use the `index-project` skill. This planning skill is usually installed next to `index-project`; read `../index-project/SKILL.md` relative to this `SKILL.md` when available.
   - Run `ensure` from the index-project workflow to create the index or re-index only when stale:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py ensure --root "$PWD" --json
     ```

   - This creates or updates:
     - `.plan/_index/project-graph.sqlite`
     - `.plan/_index/project-graph-manifest.json`
   - The indexer must ensure `.plan/_index/` is present in the target project's `.gitignore`; planning Markdown/JSONL artifacts remain commit-worthy source-of-truth unless the user decides otherwise.
   - Query the index for `{topic}` when concise handoff context is needed.
   - Do not create `.plan/{topic}/map.graph.json` by default; it duplicates the shared SQLite index. Only request a raw JSON slice for explicit debugging or offline review.
   - When supported, prefer the JSONL starter export if `map.nodes.jsonl` or `map.edges.jsonl` are missing/thin:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py slice-jsonl --root "$PWD" --topic "{topic}" --out-dir ".plan/{topic}" --limit 30
     ```

   - If indexing fails, alert the user with the error and ask whether to continue with manual file discovery using `rg`/grep and selective reads. Do not silently skip the index.

4. **Load and validate planning inputs**
   - Read `.plan/{topic}/proposal.md` if it exists. Extract:
     - problem statement
     - goals
     - non-goals
     - design steps
     - background and viability claims
     - ADR metadata (`adr_required`, `adr_reason`, `adr_options_status`, and `adr_tool_mode`) when present
   - Parse these JSON/JSONL artifacts if they exist:
     - `.plan/{topic}/map.nodes.jsonl`
     - `.plan/{topic}/map.edges.jsonl`
     - `.plan/{topic}/facts.nodes.jsonl`
     - `.plan/{topic}/facts.edges.jsonl`
   - If map JSONL artifacts are missing or thin, first regenerate them with `cartographer_index({"action":"slice-jsonl", ...})` or `index_project.py slice-jsonl`, then validate with `cartographer_jsonl({"action":"validate-topic", ...})`. Use focused `rg`/grep to verify high-impact files. Ask `scout` to derive/update map JSONL only when deterministic generation plus lexical verification returns no useful context or the topic spans complex architecture the index cannot summarize.
   - If research fact graph artifacts are missing or insufficient for dependency/tool choices, ask `researcher` to append source-backed nodes/edges to `facts.nodes.jsonl` and `facts.edges.jsonl`. Every source-backed fact must have a `fact` node, a `source` node, and a `supported_by` edge.
   - In serial mode, perform the scout/researcher roles yourself after user approval.

5. **Create a bounded retrieval plan and gather plan-relevant context**
   - Before gathering context or launching optional scout, write a short retrieval plan with 5-10 targeted probes derived from the proposal/request. Include exact identifiers, filenames, tests, scripts, commands, config keys, generated artifacts, error strings, and constrained generic terms.
   - Run bounded rationale retrieval in `.plan/` for related prior proposals, plans, facts, sanitized `evidence/` docs, superseded work, validation decisions, and non-goals that may constrain the new plan. Treat retrieved rationale as historical evidence requiring freshness checks.
   - Keep source-code retrieval and rationale retrieval separate: code probes should exclude `.plan/**`; rationale probes should explicitly target `.plan/` and must never include raw `.plan/_private/**` inputs.
   - Prefer existing map JSONL, `cartographer_index query/read`, focused `rg`/grep, and selective reads to identify plan-relevant context. Use lexical search first for exact identifiers, filenames, tests, scripts, commands, and error strings. Ask `scout`, or in approved serial mode inspect manually, only when this context is insufficient:
     - files likely to change
     - files that constrain the work
     - existing tests or validation commands
     - config/build/package manifests
     - generated artifacts or scripts that must run in order
     - cross-file dependencies and import/reference relationships
   - Start from `map.nodes.jsonl`, `map.edges.jsonl`, and the shared SQLite index. Use focused lexical search/manual inspection to verify, refine, or add relevant context.
   - Update the map graph JSONL only if necessary, preserving stable IDs and valid JSONL.

6. **Draft ordered phases with `planner`**
   - Ask `planner`, or in approved serial mode act as planner, to produce a phase plan from concise inputs. Pass artifact paths plus short summaries instead of inlining large map/fact/research/scout outputs; use `outputMode: "file-only"` for large planner outputs.
     - the user's request
     - proposal scope and design, if available
     - indexed project graph results
     - map graph JSONL
     - research fact graph JSONL
     - package/config/test commands discovered from project files
   - The phase plan must be explicitly ordered and dependency-aware:
     - each phase has a stable phase ID such as `P0`, `P1`, `P2`
     - each phase declares `Status:` as `pending` when first written; execution may later update it to `in-progress`, `complete`, or `blocked`
     - each phase declares `Depends on:` with phase IDs or `none`
     - dependencies must form an acyclic graph
     - phases must be topologically ordered in the document
     - parallelizable phases may be marked explicitly, but only after dependencies are satisfied
   - Each phase must include:
     - objective
     - scope
     - dependencies/prerequisites
     - checklist items with stable task IDs such as `P1.T1`
     - validation items with stable validation IDs such as `P1.V1`
     - exit criteria
     - risks and mitigations
     - source references to map nodes/files and fact IDs where relevant
   - Prefer practical phases, not vague milestones. Each phase should leave the project in a coherent, reviewable state.

7. **Run `cartographer-compass` checks before finalizing each phase**
   - Before finalizing each phase, call `cartographer-compass`, or approved fallback `oracle`; in approved serial mode perform a distinct skeptical compass/oracle pass yourself.
   - The compass/oracle check must verify:
     - the phase fits the proposal goals and non-goals
     - dependencies are complete and ordered correctly
     - no phase depends on work from a later phase
     - the phase can be validated independently or has a clear reason why not
     - referenced files/nodes/facts exist
     - task scope is neither too broad nor too granular
   - Apply compass/oracle corrections before moving to the next phase.

8. **Write `.plan/{topic}/plan.md`**
   - Write the plan with this structure:

     ````markdown
     # {topic} Plan

     ## Source Artifacts

     ## Planning Assumptions

     ## Phase Dependency Graph

     ```mermaid
     flowchart TD
       P0["P0 — Example Foundation"] --> P1["P1 — Example Feature"]
     ```

     ## Phase Summary

     | Order | Phase ID | Phase | Depends On | Unlocks | Exit Criteria |
     |---:|---|---|---|---|---|

     ## Phases

     ### Phase P0 — <name>

     - **Status:** pending
     - **Depends on:** none
     - **Unlocks:** P1
     - **Primary references:** `file:path:line`, `[F001]`, `map-node-id`

     #### Objective

     #### Scope

     #### Checklist

     - [ ] **P0.T1** Task description with expected output.

     #### Validation

     - [ ] **P0.V1** Run `<command>` or perform a named manual check. State expected result.

     #### Exit Criteria

     #### Risks and Mitigations

     #### Notes for Execution Agent

     ## Cross-Phase Validation

     ## Open Questions

     ## Handoff Guidance
     ````

   - `## Source Artifacts` should list the exact proposal/index/map/fact artifacts used.
   - `## Planning Assumptions` should separate confirmed facts from assumptions and preserve accepted ADR intent from the proposal (`adr_required: true/false`) instead of treating ADR generation as future work.
   - `## Phase Dependency Graph` must include a Mermaid graph showing phase ordering/dependencies.
   - `## Phase Summary` must include every phase and dependency.
   - `## Cross-Phase Validation` should include final validation commands/checks that run after all phases.
   - `## Open Questions` should be empty or explicitly list unresolved decisions.
   - `## Handoff Guidance` should explain how an execution agent should execute the phases, when to stop for review, and whether implementation finalization must run `cartographer_adr` based on `adr_required` metadata.

9. **Write machine-readable plan graph artifacts**
   - Create `.plan/{topic}/plan.nodes.jsonl` and `.plan/{topic}/plan.edges.jsonl` from the final Markdown plan.
   - Each JSONL line must be one complete valid JSON object. Do not wrap either file in an array and do not add trailing commas.
   - Include node records for:
     - root plan node: `plan:{topic}`
     - phases: `phase:P0`, `phase:P1`, ...
     - checklist tasks: `task:P0.T1`, `task:P1.T2`, ...
     - validation items: `validation:P0.V1`, `validation:P1.V2`, ...
     - cross-phase validation checks when present
   - Include edge records for:
     - `contains` from the plan to phases and from phases to tasks/validations
     - `depends_on` from a phase to prerequisite phases
     - `unlocks` from a phase to phases it unlocks when known
     - `validates` from validation nodes to the phase/task they validate when known
     - `references` from phases/tasks/validations to map nodes, file references, or fact IDs when explicit
   - Suggested `plan.nodes.jsonl` records:

     ```jsonl
     {"id":"plan:{topic}","type":"plan","title":"{topic} Plan","description":"Machine-readable root node for the implementation plan.","source":"plan.md"}
     {"id":"phase:P0","type":"phase","phase_id":"P0","title":"Foundation","status":"pending","depends_on":[],"source":"plan.md"}
     {"id":"task:P0.T1","type":"task","task_id":"P0.T1","phase_id":"P0","title":"Create base module","status":"pending","source":"plan.md"}
     {"id":"validation:P0.V1","type":"validation","validation_id":"P0.V1","phase_id":"P0","title":"Run npm run check","status":"pending","command":"npm run check","source":"plan.md"}
     ```

   - Suggested `plan.edges.jsonl` records:

     ```jsonl
     {"from":"plan:{topic}","to":"phase:P0","type":"contains"}
     {"from":"phase:P1","to":"phase:P0","type":"depends_on"}
     {"from":"phase:P0","to":"task:P0.T1","type":"contains"}
     {"from":"phase:P0","to":"validation:P0.V1","type":"contains"}
     ```

10. **Run JSONL and planning graph validation before audit**
   - JSONL validation before `cartographer-auditor` is mandatory. First validate topic JSONL artifacts with `cartographer_jsonl validate-topic` or the CLI fallback:

     ```bash
     node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "{topic}" --json
     ```

   - Then resolve `scripts/validate_planning_graph.py` relative to this `SKILL.md` and run the planning graph validator:

     ```bash
     python <plan-skill-dir>/scripts/validate_planning_graph.py --root "$PWD" --topic "{topic}" --json
     ```

   - Record validation receipts for both deterministic checks in `.plan/{topic}/receipts.jsonl`, including command, result, validation IDs when known, output summary, and changed-file hash set when available.
   - If validation fails, correct `plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`, map/fact graph files, or citations, then rerun the failed deterministic checks before finalizing.
   - If either validator cannot run, stop or ask the user before accepting the plan unless the user approves a manual fallback; write an explicit fallback receipt with the failed command/tool, error summary, manual checks performed, files reviewed, and residual risk.

11. **Final validation with `cartographer-auditor`**
   - After `cartographer_jsonl validate-topic` and `validate_planning_graph.py` receipts pass, launch `cartographer-auditor` as the default final semantic gate for plan artifacts, references, graph consistency, checklist/validation coverage, and handoff readiness.
   - Provide the auditor the plan path, plan graph paths, proposal/map/fact references, deterministic validation receipt IDs or compact output summaries, and require an explicit `PASS`/`FAIL` decision. A plan should not be marked ready for implementation without a `cartographer-auditor` `PASS` or an approved fallback receipt.
   - Use `cartographer-compass` for scope, dependency, and decision-consistency concerns, especially when phase ordering or assumptions are questionable; compass does not replace the final audit gate.
   - Built-in `reviewer`/`oracle` or a serial current-agent validation pass are fallback substitutes only when `cartographer-auditor` is unavailable, times out, or the user approves substitution. Each fallback must write an explicit fallback receipt in `.plan/{topic}/receipts.jsonl` with the attempted auditor, reason, substitute/manual reviewer used, deterministic validation receipt IDs, files reviewed, outcome, and residual risks.
   - Do not use `planner` for final validation unless no auditor/reviewer/oracle substitute is available and the user approves; record that as a fallback receipt.
   - The auditor/fallback validation pass must check:
     - `.plan/{topic}/plan.md` exists
     - `.plan/{topic}/plan.nodes.jsonl` and `.plan/{topic}/plan.edges.jsonl` exist and parse as valid JSONL
     - every phase has a unique phase ID, status, objective, checklist, validation items, exit criteria, and dependencies
     - phase dependencies are acyclic and topologically ordered
     - checklist item IDs are unique and scoped to their phase
     - validation item IDs are unique and scoped to their phase
     - validation commands are declared and appear valid for the project, or are clearly marked as manual checks
     - referenced project files exist in the current checkout
     - referenced indexed node IDs exist in `map.nodes.jsonl`, or `.plan/_index/project-graph.sqlite`
     - referenced fact IDs exist as `fact` nodes in `facts.nodes.jsonl`
     - every cited source-backed fact has a `supported_by` edge to a `source` node
     - the plan respects proposal goals and non-goals
     - the plan does not include code changes disguised as planning
   - Apply corrections, rerun deterministic validation, and repeat the `cartographer-auditor` or approved fallback gate before finalizing.

12. **Final response**
   - Reply with the topic and created/updated paths:
     - `.plan/{topic}/plan.md`
     - `.plan/{topic}/plan.nodes.jsonl`
     - `.plan/{topic}/plan.edges.jsonl`
   - Mention the source artifacts used:
     - `.plan/_index/project-graph.sqlite`
     - `.plan/{topic}/proposal.md` if present
     - `.plan/{topic}/map.nodes.jsonl`
     - `.plan/{topic}/map.edges.jsonl`
     - `.plan/{topic}/facts.nodes.jsonl`
     - `.plan/{topic}/facts.edges.jsonl`
   - Briefly summarize phase count, dependency shape, validation coverage, and any unresolved open questions.

## Delegation Guidance

Keep the current agent responsible for orchestration, artifact integrity, and final validation. Use deterministic Cartographer tools for index/map/JSONL validation before launching subagents. Use subagents to improve judgment and reduce planning drift, not to perform routine file discovery.

Performance rules:

- Follow the Clean Context Contract: normal LLM-facing outputs should stay near 8KB, expanded diagnostics near 16KB, and larger outputs should be represented by compact receipts with `summary`, `references`, `counts`, `token_estimate`, `truncated`, `full_output_path`, `verification`, and `next_actions`.
- Write planning checkpoints to `.plan/{topic}/receipts.jsonl` and phase/scout/planner handoff context to `.plan/{topic}/context-packs.jsonl` when a planning step generates durable decisions, validation results, timeout/fallback events, fallback substitutions, large output, or implementation context.
- Keep raw command/search/session output in `/tmp/pi-cartographer-runs/` by default; use ignored `.plan/_runs/` only when explicitly useful for local replay, and never cite or commit raw run logs.
- Do not read entire large source/docs/artifact files into parent or child context when `cartographer_index context`, `repo-map`, `read`, safe `search`, focused `rg`/grep searches, or selective reads can provide targeted context.
- Use the shared index and map JSONL as durable planning context; use `rg`/grep as the fast path for verifying concrete identifiers, filenames, scripts, tests, commands, and error strings.
- Do not inline large child outputs into subsequent prompts. Use `outputMode: "file-only"` for researcher, optional scout, planner, `cartographer-auditor`/fallback reviewer, or any child likely to produce more than a concise answer.
- Run `cartographer_jsonl validate-topic` and the planning graph validator before `cartographer-auditor` validation so children reason about deterministic receipts rather than hand-checking raw JSONL; reviewer/oracle substitutes must cite the same receipts or explain an approved fallback receipt.
- Use `cartographer-drafter`, `cartographer-auditor`, `cartographer-compass`, and `cartographer-archivist` for their narrow roles when needed. Use built-in `scout` only as an approved fallback for missing/ambiguous context or complex architecture; never ask it to dump SQLite, perform broad repo rediscovery, or rewrite generated maps.
- Apply a least-privilege child tool policy. Do not grant every child full mutable JSONL/private/ADR/receipt authority: the parent owns canonical plan graph writes, receipt append decisions, ADR evaluation, and raw private access. Give each child only the artifact paths, read-only Cartographer actions, sanitized evidence, and explicit output contract needed for its role. For non-trivial handoffs, pass structured `acceptance`, `async`/timeout expectations, `control` stop/escalation rules, `outputMode: "file-only"` for large outputs, helper summary paths, and timeout/fallback receipt requirements.
- Seed/reuse existing fact JSONL for local Pi/package/subagent docs with `cartographer_jsonl({"action":"seed-pi-facts", ...})`; do not repeat local-doc research each plan.

Retrieval and lifecycle contract for plan artifacts:

- Lifecycle states are `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`. Plans should become `planned` only after graph validation; implementation phases later move to `in-progress` and `implemented`.
- Candidate/verified metadata uses `candidate`, `verified`, and `verification` fields. `verified: true` requires direct read, focused `rg`, or deterministic validation evidence.
- Retrieval misses that materially change planning should be appended to `.plan/_retrieval/misses.jsonl` with `failure_type`, `original_query`, `expanded_queries`, `retrieval_modes`, `expected_terms`, `eventual_hit`, and `resolution`.
- Retrieval scopes are `code`, `plans`, and `all`, with `code` as the default. Planning should use bounded rationale retrieval in `.plan/` for prior decisions and sanitized evidence docs while keeping source-code retrieval separate. Raw `.plan/_private/**` inputs are off limits and must not be cited.
- ADR generation is gated by accepted proposal/plan metadata: if `adr_required: true`, implementation finalization should run `cartographer_adr` after deterministic validation; if false, carry the reason forward rather than silently skipping.

Role-scoped least-privilege Cartographer helper examples for delegated agents in this workflow (`cartographer-drafter`, `cartographer-archivist`, `cartographer-compass`/fallback `oracle`, and `cartographer-auditor`/fallback `reviewer`):

```bash
cartographer_artifacts({"action":"validate-topic-summary","root":"$PWD","topic":"{topic}"})
cartographer_artifacts({"action":"fact-citation-summary","root":"$PWD","topic":"{topic}"})
cartographer_artifacts({"action":"context-pack-summary","root":"$PWD","topic":"{topic}","id":"<context-id>"})
cartographer_artifacts({"action":"receipt-summary","root":"$PWD","topic":"{topic}"})
cartographer_artifacts({"action":"evidence-manifest-summary","root":"$PWD","topic":"{topic}"})
cartographer_index({"action":"query","root":"$PWD","topic":"{topic}","limit":10})
cartographer_index({"action":"read","root":"$PWD","path":"<project-relative-path>"})
```

Mutable helpers remain parent-owned unless a structured contract explicitly scopes a draft path: use `cartographer_jsonl validate-topic` and `validate_planning_graph.py` for deterministic receipts before audit, keep `seed-pi-facts`/upserts and `cartographer_adr` in parent workflow, and keep raw `.plan/_private/**` out of planning-agent prompts. When launching delegated agents through pi-subagents, include the package extension path `extensions/cartographer-tools.ts` in the child tool/extension configuration when supported so needed tools are callable. Grant only the actions needed by that role; do not hand every child mutable `cartographer_jsonl upsert`, raw private paths, ADR write actions, or receipt append authority by default. If custom helper tools are unavailable in the child, generate the same `cartographer_artifacts`/`cartographer_index` summaries in the parent/CLI first, pass their paths in the prompt, and write a timeout/fallback receipt for substituted validation or audit paths.

Structured handoff contract fields should be explicit in the `subagent(...)` call when supported, or copied into the prompt when not supported:

```json
{
  "acceptance": {
    "criteria": ["phase/checklist/validation IDs are preserved", "helper summaries cited", "PASS/FAIL or draft receipt required"],
    "evidenceRequired": ["changed-files when applicable", "commands-run", "validation-output", "residual-risks", "diff-summary"]
  },
  "async": {"enabled": true, "timeoutMs": 600000},
  "control": {"stopRules": ["scope ambiguity", "missing helper summaries", "repeated tool failure"], "maxFinalizationTurns": 3},
  "outputMode": "file-only",
  "helperSummaries": [".plan/{topic}/context-packs.jsonl:<id>", ".plan/{topic}/receipts.jsonl:<ids>"],
  "timeoutFallbackReceipt": ".plan/{topic}/receipts.jsonl"
}
```

Recommended delegated-role prompts:

- Optional `scout`: "Start from `cartographer_index query/read` outputs plus `map.nodes.jsonl` and `map.edges.jsonl`, then use focused `rg`/grep searches to verify exact identifiers, filenames, scripts, tests, generated artifacts, commands, error strings, or contradictions. Identify only missing plan-relevant context. Do not rediscover the repo broadly or read whole large files unless indexed snippets and lexical hits are insufficient. Return concise suggested map additions as JSONL records."
- `researcher`: "Only if research facts are missing, stale, or insufficient: propose source-backed JSONL nodes for `.plan/{topic}/facts.nodes.jsonl` and edges for `.plan/{topic}/facts.edges.jsonl`. Inspect existing facts first and reuse valid local-doc facts. You have read access to Cartographer tools; run index/query/read to ground research in current project context. Every source-backed claim needs a fact node, source node, and `supported_by` edge. Focus on dependencies/tools/validation needed for planning."
- `planner`: "Create `.plan/{topic}/plan.md`, `.plan/{topic}/plan.nodes.jsonl`, and `.plan/{topic}/plan.edges.jsonl` with topologically ordered phases, explicit dependencies, phase statuses, checklist task IDs, validation item IDs, exit criteria, risks, and source references from concise proposal/index/map/fact summaries and artifact paths. You have read access to Cartographer tools and may run targeted reads before citing indexed context. Do not ask for or inline full raw artifacts."
- `cartographer-compass`/fallback `oracle`: "Review this phase before finalization. Check scope fit, dependency ordering, missing prerequisites, validation adequacy, reference validity, and whether this phase leaves the project in a coherent state. Use provided `cartographer_artifacts` context/receipt/fact summaries and `cartographer_index` query/read summaries, or parent-generated summary paths if helper tools are unavailable. Return required corrections only."
- `cartographer-auditor`: "Review the complete plan after `cartographer_jsonl validate-topic` and `validate_planning_graph.py` receipts pass. Check acyclic phase dependencies, complete checklist/validation coverage, valid references, alignment with proposal goals/non-goals, ADR metadata preservation, and readiness for handoff to an execution agent. Use provided artifact helper summaries, deterministic receipt IDs/paths, acceptance criteria, and deterministic auditor receipt path; use Cartographer tools for targeted checks only if freshness or references are uncertain. Do not manually re-parse large JSONL when a deterministic validation receipt is available. Return `PASS`/`FAIL` with required corrections."
- Fallback `reviewer`/serial validator: "Use only when `cartographer-auditor` is unavailable or the user approved substitution. Review the same artifacts and deterministic receipts, then write or request an explicit fallback receipt with outcome and residual risk."

Serial-mode role prompts:

- Context pass: inspect the index and map JSONL yourself; verify likely changed files, constraints, scripts, tests, and generated artifacts with focused `rg`/grep and selective reads. Use scout only for complex or missing context.
- Research pass: only if needed, append source-backed JSONL research graph records before using claims in the plan.
- Planner pass: draft phases and checklists.
- Compass/oracle pass: challenge each phase before finalization.
- Auditor/final validation pass: after deterministic JSONL and planning graph validation, check the full plan against all verification criteria, correct drift, and write a fallback receipt because the default `cartographer-auditor` was not used.

## Pitfalls

- Do not implement code or edit project source files while generating the plan.
- Do not skip the `index-project` refresh unless the user approves continuing after an indexing failure.
- Do not rely only on the proposal prose; use indexed files and graph artifacts to ground the plan.
- Do not cite a fact ID unless it exists as a `fact` node in `facts.nodes.jsonl`.
- Do not cite a source-backed fact unless it has a `supported_by` edge to a `source` node.
- Do not use YAML for graph artifacts; map and fact graphs are JSONL.
- Do not create cyclic phase dependencies.
- Do not leave a phase without validation items and exit criteria.
- Do not hide unresolved decisions; put them in `## Open Questions`.
- Do not overwrite existing plans without preserving useful content and stable IDs.
- Do not drop `adr_required` metadata from the proposal; carry it into assumptions, validation, or handoff guidance.
- Do not describe ADR generation as out of scope when the accepted proposal says `adr_required: true`.

## Verification Checklist

Before finalizing, verify:

- `.plan/{topic}/plan.md` exists.
- `.plan/{topic}/plan.nodes.jsonl` and `.plan/{topic}/plan.edges.jsonl` exist and parse as valid JSONL.
- `.plan/_index/project-graph.sqlite` and `.plan/_index/project-graph-manifest.json` exist or indexing failure was explicitly approved by the user.
- `.gitignore` contains `.plan/_index/` when indexing succeeded.
- `map.nodes.jsonl` and `map.edges.jsonl` were read or intentionally regenerated.
- `facts.nodes.jsonl` and `facts.edges.jsonl` were read when research-backed claims are used.
- Every phase has:
  - phase ID
  - status
  - objective
  - explicit `Depends on`
  - checklist task IDs
  - validation item IDs
  - exit criteria
  - risks/mitigations
- Phase dependencies are acyclic and topologically ordered.
- Every referenced file exists.
- Every referenced fact ID exists.
- Every validation command is valid for the project or clearly marked manual.
- `scripts/validate_planning_graph.py --root "$PWD" --topic "{topic}"` passes.
- ADR intent from the proposal is preserved in planning assumptions or handoff guidance, including `adr_required` and the reason.
- Final `cartographer-auditor` `PASS` was recorded after deterministic JSONL/planning graph validation, or an approved reviewer/oracle/serial fallback receipt exists and corrections were applied.
