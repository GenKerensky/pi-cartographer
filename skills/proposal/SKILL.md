---
name: "proposal"
description: "Pi Cartographer proposal workflow: create .plan/<topic>/proposal.md using the index-project SQLite/FTS graph plus delegated scope, mapping, research, design, compass checks, deterministic validation, and cartographer-auditor gates."
version: 18
created: "2026-06-05"
updated: "2026-06-08"
---

# Pi Cartographer Proposal

## When to Use

Use this skill when the user asks for a project proposal, implementation proposal, or planning artifact that should live under `.plan/{topic}/` and be built with delegated agents when available, or with an approved serial current-agent workflow when subagents are unavailable.

## Outputs

Create or update these shared project-index files:

- `.plan/_index/project-graph.sqlite`
- `.plan/_index/project-graph-manifest.json`

Create or update these topic-specific proposal files in the current project:

- `.plan/{topic}/proposal.md`
- `.plan/{topic}/map.nodes.jsonl` — curated topic-map graph nodes derived from the shared SQLite index and verified manual additions.
- `.plan/{topic}/map.edges.jsonl` — curated topic-map graph edges connecting relevant files, symbols, docs, dependencies, constraints, and design context.
- `.plan/{topic}/facts.nodes.jsonl` — append-only research graph nodes: facts, sources, tools, examples, risks, constraints.
- `.plan/{topic}/facts.edges.jsonl` — append-only research graph edges connecting facts to sources, project context, goals, risks, and design steps.
- `.plan/{topic}/evidence/` — sanitized, commit-safe analysis documents when the proposal uses private artifacts.

Create or update ignored private-input files only when the user explicitly provides private artifacts:

- `.plan/_private/{topic}/` — raw private proposal inputs; never commit, index, or cite directly.
- `.plan/_private/_inbox/<id>/` — optional temporary staging when a topic must be confirmed before final placement.

Do not create `.cartographer/` execution state during proposal writing. If a proposal recommends long-horizon implementation state, it should keep `.plan/` authoritative and describe `.cartographer/<topic>/state.json`, curated `journal.jsonl`, schemas, and ignored `current.json` as implementation/resume artifacts only.

`{topic}` is a concise summary of the user's requested topic in **3 words or less**. Prefer a filesystem-safe lowercase kebab-case topic for paths, and use the same topic in the proposal heading exactly as `# {topic} Proposal`.

## Procedure

### Wrapper-first mutation contract

Use deterministic wrappers for proposal mutations whenever available. Prefer `cartographer_proposal init`/`proposal-init` for proposal skeleton creation, `cartographer_fact`/`fact-*` for source-backed fact/source/support edges, `cartographer_proposal adr-sync` after `cartographer_adr evaluate`, and `cartographer_proposal finalize` for final deterministic validation, fact citation checks, sanitized evidence checks, auditor PASS receipt checks, and lifecycle transition. Do not manually append proposal receipts, hand-edit fact JSONL, or cross proposal lifecycle gates as a prose-only step unless a wrapper is unavailable and an explicit fallback receipt documents the substitute checks.

1. **Derive the topic and initialize files**
   - Summarize the user's proposal topic in 3 words or less.
   - If the topic is ambiguous enough that scope cannot be inferred, ask one clarifying question before proceeding.
   - Create `.plan/{topic}/`.
   - Create `.plan/{topic}/proposal.md` with this skeleton:

     ```markdown
     # {topic} Proposal

     ## Description

     ## Problem Statement

     ## Goals

     ## Non-Goals

     ## Background

     ## Viability

     ## ADR Metadata

     - `adr_required`: false
     - `adr_reason`: Routine implementation change unless evaluation proves durable architectural significance.
     - `adr_options_status`: not-applicable
     - `adr_tool_mode`: evaluate-only

     ## Design
     ```

   - Create empty or initialized `.plan/{topic}/map.nodes.jsonl`, `.plan/{topic}/map.edges.jsonl`, `.plan/{topic}/facts.nodes.jsonl`, and `.plan/{topic}/facts.edges.jsonl`.
   - If the user provided private logs, errors, transcripts, screenshots, exports, or documents, create `.plan/{topic}/evidence/` and run the private-artifact intake preflight before reading or analyzing those files.
   - If any topic artifact already exists, do not blindly truncate it. Preserve useful content, continue stable ID sequences, and reconcile existing records with new indexed/researched context.

1a. **Run private-artifact intake preflight when needed**

- Trigger this preflight when the initial request includes private artifact paths, attachments, or phrases such as "use these logs", "consider this error dump", or "review this private document".
- Derive or confirm `{topic}` from the request text before reading raw private contents. If the topic is ambiguous, ask one concise topic/scope question.
- Import authorized files with `cartographer_evidence({"action":"import", ...})` when available, or the equivalent `python <plan-skill-dir>/scripts/private_artifacts.py import ... --json` CLI.
- Copy external files into `.plan/_private/{topic}/`. Move untracked in-repo sensitive files only when safe. If a referenced file is tracked by git, stop and ask before moving or rewriting it.
- Preserve safe basenames by default. Use sanitized or opaque names only when a basename is sensitive, collides, or the user/project policy requires it. Raw hashes are opt-in only.
- Store detailed provenance in ignored `.plan/_private/{topic}/manifest.private.jsonl`; commit-safe `evidence/manifest.jsonl` may include safe basenames, redaction status, and analysis paths.
- Do not read, grep, summarize, index, quote, or paste raw private artifact contents in the parent session. The next step is redactor-only analysis.

1b. **Evaluate ADR intent before planning begins**

- Run `cartographer_adr({"action":"evaluate","root":"$PWD","topic":"{topic}"})` once proposal scope is sketched, or the equivalent `python <plan-skill-dir>/scripts/adr_records.py evaluate --root "$PWD" --topic "{topic}" --json` CLI when the tool is unavailable.
- Record the evaluation under `## ADR Metadata` with `adr_required`, `adr_reason`, `adr_options_status`, and `adr_tool_mode`.
- Treat requests that embed a durable architectural choice, dependency/platform choice, identity/auth provider, data-store change, deployment topology, public API contract, or cross-cutting workflow policy as ADR-worthy unless clearly routine.
- If the user request directs a specific architectural choice such as "add Auth0" and the proposal lacks alternatives or explicit user rationale, ask one concise clarification for alternatives/rationale before marking the proposal ready for planning. Do not invent the user's rationale.
- If the user declines or the change is routine, set `adr_required: false` and record the reason. If `adr_required: true`, state that implementation finalization should generate or explicitly skip the ADR using `cartographer_adr` after validation.

2. **Inspect available subagents and choose execution mode**
   - Call the subagent list action before delegating whenever the subagent tool is available.
   - Prefer Cartographer-specific agents when available: `cartographer-archivist` for missing research, `cartographer-drafter` for proposal/plan drafting, `cartographer-auditor` for semantic review after deterministic validation, and `cartographer-compass` for scope/dependency decisions.
   - Built-in `delegate`, `researcher`, `planner`, `oracle`, and `reviewer` are explicit fallback/substitution choices, not defaults.
   - Do not add or rely on default Cartographer clones of generic `scout`, `delegate`, or `context-builder`. Use deterministic Cartographer index/map tools plus focused `search`/`rg` verification first; call built-in `scout` only when context is missing, contradictory, or too complex for the parent/tooling to summarize and the user approves fallback.
   - If the subagent list returns **no executable subagents**, or the subagent tool is unavailable:
     - Alert the user that no subagents are available for the proposal workflow.
     - Ask whether they want to continue by running the whole workflow serially with the current agent.
     - Do not proceed beyond initialization unless the user approves serial mode.
     - If the user declines, stop and report any initialized paths.
   - If the user approves serial mode, the current agent performs each required role in order:
     1. scope writer for `delegate`
     2. deterministic codebase mapper using Cartographer tools plus focused `rg`/grep verification; run a scout-style manual pass only if the map tools and lexical checks fail or are ambiguous
     3. web/documentation researcher for `researcher` only when needed facts are missing or stale
     4. design planner for `planner`
     5. skeptical consistency checker using `cartographer-compass`, or fallback `oracle` when approved
     6. final semantic gate using `cartographer-auditor`, or approved reviewer/oracle/serial fallback with an explicit fallback receipt
   - If some executable subagents exist but a required exact agent is unavailable, ask the user whether to substitute the closest available agent. Do not silently skip a role.

3. **Create or update the shared project index**
   - Load and use the `index-project` skill. If this skill is installed from the bundled `pi-skills` repository, read the sibling skill at `../index-project/SKILL.md` relative to this `SKILL.md`.
   - Run `ensure` from the index-project workflow to create the index or re-index only when stale:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py ensure --root "$PWD" --json
     ```

   - This creates or updates:
     - `.plan/_index/project-graph.sqlite`
     - `.plan/_index/project-graph-manifest.json`
   - The indexer must ensure `.plan/_index/` and `.plan/_private/` are present in the target project's `.gitignore`; do not commit the generated SQLite index/cache or raw private inputs unless the user explicitly asks.
   - Query the index for `{topic}` and capture concise query output for handoffs when useful. Do not read whole large files into parent context when `cartographer_index read`, focused `rg`/grep searches, or selective reads can return relevant context.
   - When the `index-project` skill supports it and the curated map graph files are missing or thin, prefer `slice-jsonl --out-dir ".plan/{topic}"` to initialize `.plan/{topic}/map.nodes.jsonl` and `.plan/{topic}/map.edges.jsonl` before any optional scout/review pass. Do not overwrite useful existing curated map JSONL without reconciling it.
   - Do not create `.plan/{topic}/map.graph.json` by default; it duplicates the SQLite index. Only request a raw JSON slice for explicit debugging or offline review.
   - If indexing fails, alert the user with the error and ask whether to continue with manual file discovery using `rg`/grep and selective reads. Do not silently skip the index.
   - Treat `.plan/_index/project-graph.sqlite` plus `.plan/{topic}/map.nodes.jsonl` and `.plan/{topic}/map.edges.jsonl` as the durable source for proposal map artifacts; use `rg`/grep to verify exact code evidence and fill targeted lexical gaps throughout the rest of the workflow.

4. **Scope the proposal with `delegate` or serial scope pass**
   - Delegate an agent, or in approved serial mode act as the scope writer, to think carefully about the request, mull over the user's intent, consider the whole chat and current project context, and define proposal scope.
   - Provide concise index-query output when relevant, but keep this pass problem-centered rather than file-centered.
   - Write content for these sections in `proposal.md`:
     - `## Description`
     - `## Problem Statement`
     - `## Goals`
     - `## Non-Goals`
   - Emphasize the problem the user wants to solve and the desired outcome. Keep technology and code details secondary in these sections.

5. **Create a bounded retrieval plan, then map project files**
   - Before map generation or optional scouting, write a short retrieval plan with 5-10 targeted probes derived from the request. Include exact identifiers, filenames, commands, tests, config keys, error strings, and constrained generic terms to verify after index lookup.
   - Run a bounded rationale retrieval pass in `.plan/` for related prior proposals, plans, facts, sanitized `evidence/` docs, superseded work, and non-goals. Treat results as historical evidence requiring freshness checks, not current source truth.
   - Keep source-code retrieval and rationale retrieval separate: code probes should exclude `.plan/**`; rationale probes should explicitly target `.plan/` and must never include `.plan/_private/**`.
   - Prefer deterministic map generation over delegated scouting:

     ```bash
     python <index-project-skill-dir>/scripts/index_project.py slice-jsonl --root "$PWD" --topic "{topic}" --out-dir ".plan/{topic}" --limit 30
     node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "{topic}" --json
     ```

   - Use `cartographer_index({"action":"slice-jsonl", ...})` and `cartographer_jsonl({"action":"validate-topic", ...})` when the Cartographer tools are available.
   - Treat the generated `.plan/{topic}/map.nodes.jsonl` and `.plan/{topic}/map.edges.jsonl` as the map source of truth. Verify high-impact files, symbols, tests, scripts, and commands with focused `rg`/grep or selective reads before citing them in proposal prose.
   - Do **not** delegate to `scout` just to read `draft.md`, dump SQLite rows, or hand-curate JSONL that the indexer can generate.
   - Call `scout` only when one of these is true:
     - `slice-jsonl` returns no useful files/nodes for a non-trivial topic
     - the topic crosses many source files and requires architectural judgment not represented by graph edges
     - validation finds unresolved/contradictory references that deterministic tools cannot explain
     - the user explicitly asks for a scout-style code reconnaissance handoff
   - If `scout` is used, give it a narrow task based on `cartographer_index query/read` outputs plus exact `rg`/grep targets to verify, and ask for **suggested additions only**, not a full rewrite of map JSONL.
   - Create or refine these JSONL graph files as the source of truth for the proposal map:
     - `.plan/{topic}/map.nodes.jsonl`
     - `.plan/{topic}/map.edges.jsonl`
   - Represent hierarchy and relationships with typed graph edges such as `contains`, `part_of`, `depends_on`, `imports`, `references`, `documents`, `constrains`, or `relevant_to`.
   - Each JSONL line must be one complete valid JSON object. Do not wrap either file in an array and do not add trailing commas.
   - Each node in `map.nodes.jsonl` must include:
     - `id` — stable ID, preferably the indexed node ID such as `file:src/pages/index.astro` or `symbol:src/lib/search.ts#buildQuery:12`
     - `type` — for example `file`, `symbol`, `doc-section`, `dependency`, `route`, `config`, `data-artifact`, or `topic`
     - `title`
     - `description`
     - optionally `reference` as a URL or `file-path:line-number`
   - Include extra node metadata when useful, such as `path`, `start_line`, `end_line`, `why_relevant`, `symbols`, `dependencies`, `source` (`index` or `manual`), or `confidence`.
   - Each edge in `map.edges.jsonl` must include:
     - `from`
     - `to`
     - `type`
     - optionally `evidence`, `reference`, `confidence`, or `source`

   Suggested `.plan/{topic}/map.nodes.jsonl` shape:

   ```jsonl
   {"id":"topic:{topic}","type":"topic","title":"{topic}","description":"Root node for this proposal's curated project map.","source":"manual"}
   {"id":"file:src/pages/index.astro","type":"file","title":"Astro page","description":"Route that may host the proposed experience.","reference":"src/pages/index.astro:1","path":"src/pages/index.astro","source":"index","confidence":"high"}
   {"id":"doc:AGENTS.md#project-goals","type":"doc-section","title":"Project goals","description":"Static-first and progressive enhancement constraints for this project.","reference":"AGENTS.md:20","source":"index","confidence":"high"}
   ```

   Suggested `.plan/{topic}/map.edges.jsonl` shape:

   ```jsonl
   {"from":"topic:{topic}","to":"file:src/pages/index.astro","type":"relevant_to","evidence":"Entry point for the proposed user-facing experience.","confidence":"high"}
   {"from":"file:src/pages/index.astro","to":"doc:AGENTS.md#project-goals","type":"constrained_by","evidence":"The implementation must preserve useful static HTML before JavaScript loads."}
   {"from":"file:src/pages/index.astro","to":"symbol:src/components/SearchIsland.tsx#SearchIsland:12","type":"renders","reference":"src/pages/index.astro:18"}
   ```

6. **Research background with `researcher` or serial research pass**
   - Before launching `researcher`, seed and inspect existing `facts.nodes.jsonl`/`facts.edges.jsonl` with `cartographer_jsonl`:

     ```bash
     node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts seed-pi-facts --root "$PWD" --topic "{topic}" --json
     node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "{topic}" --json
     ```

   - Reuse still-valid local docs facts. Do not re-read and re-summarize Pi docs or pi-subagents docs when equivalent source/fact nodes already exist.
   - If private artifacts were imported, launch `cartographer-redactor` before ordinary research. Pass only explicit `.plan/_private/{topic}/...` paths from the private manifest, require `outputMode: "file-only"`, and require sanitized analyses under `.plan/{topic}/evidence/` with `Redaction status`. The parent must inspect only the sanitized analysis docs and JSONL suggestions, never raw private contents.
   - Facts derived from private artifacts must cite a source node with `source_kind: "sanitized_evidence"` and a `reference` to `.plan/{topic}/evidence/*.md`; do not cite `.plan/_private/**` as a source.
   - Ask `researcher`, or in approved serial mode research yourself, only for missing, stale, or genuinely external facts about tooling, documentation, similar projects, examples, prior art, and implementation constraints related to the topic.
   - Use indexed project context to narrow research questions to this repository's actual architecture and constraints. Pass concise index/query summaries and artifact paths, not full raw draft/docs content.
   - Treat research as an append-only JSONL graph, not YAML.
   - Write each finding **one at a time before continuing search** by appending nodes to `.plan/{topic}/facts.nodes.jsonl` and edges to `.plan/{topic}/facts.edges.jsonl`.
   - Each JSONL line must be one complete valid JSON object. Do not wrap the file in an array and do not add trailing commas.
   - Every source-backed claim must have:
     - a stable fact node ID such as `F001`
     - a source node ID such as `S001`
     - a `supported_by` edge from the fact to the source
     - enough source detail to verify it later
   - Use typed nodes such as `source`, `fact`, `tool`, `example`, `risk`, `constraint`, `project-context`, or `question`.
   - Use typed edges such as `supported_by`, `applies_to`, `supports_goal`, `constrains`, `mitigates`, `contradicts`, `related_to`, or `raises_question`.

   Suggested `.plan/{topic}/facts.nodes.jsonl` shape:

   ```jsonl
   {"id":"S001","type":"source","title":"Source title","url":"https://example.com","accessed_at":"<ISO-8601 timestamp>","publisher":"Optional publisher"}
   {"id":"F001","type":"fact","title":"Short fact title","claim":"A specific source-backed assertion.","evidence":"Brief quotation or concrete detail from the source.","relevance":"How this affects the proposal.","confidence":"high"}
   {"id":"T001","type":"tool","title":"Tool or library name","description":"What the tool does and why it matters.","url":"https://example.com/tool","confidence":"medium"}
   ```

   Suggested `.plan/{topic}/facts.edges.jsonl` shape:

   ```jsonl
   {"from":"F001","to":"S001","type":"supported_by","evidence":"Specific quote, section name, or source detail."}
   {"from":"F001","to":"file:src/pages/index.astro","type":"applies_to","evidence":"Why the fact matters to this project file or indexed node."}
   {"from":"T001","to":"F001","type":"related_to","evidence":"Tool is an example or implementation option for the fact."}
   ```

   - When research is complete, write concise content for these sections in `proposal.md`:
     - `## Background`
     - `## Viability`
   - Research assertions in those sections must cite fact IDs from `facts.nodes.jsonl`, for example `[F003]`.
   - `## Viability` should answer whether this has been done before, what examples/tools exist, and how hard it would be to implement in this project for the specific problem.

7. **Design with `planner` and per-step `oracle` review, or serial planner/oracle passes**
   - Ask `planner`, or in approved serial mode act as the planner, to combine the problem statement, goals/non-goals, concise map/fact summaries, and artifact paths into a rough plan. Do not inline large map/research/scout outputs; use `outputMode: "file-only"` for large subagent outputs and pass file paths plus short summaries.
   - First pass: produce high-level implementation steps under `## Design`, with each step as `### <step>`.
   - Examples of step names: `### Scaffold Vite App`, `### Configure Terraform Infra`, `### Create API Project`, `### Add Docker Compose Database`.
   - Before finalizing each design step, call `oracle`, or in approved serial mode pause and perform a separate skeptical oracle check yourself, to verify that the step makes sense in context and does not conflict with the proposal scope, indexed project graph, file map, or research.
   - Fill in each accepted step with:
     - purpose and expected outcome
     - relevant current project files from the curated map graph (`map.nodes.jsonl` and `map.edges.jsonl`) and indexed nodes/chunks
     - libraries, tools, or docs from the research graph (`facts.nodes.jsonl` and `facts.edges.jsonl`)
     - dependencies and prerequisites
     - major risks or unknowns
     - references to fact IDs and file map/index entries
   - Include Mermaid diagrams and tables where they clarify control flow, data flow, responsibilities, dependencies, or sequencing.

8. **Run deterministic validation, then `cartographer-auditor` semantic audit**
   - Deterministic validation before `cartographer-auditor` is mandatory for a proposal to become accepted. Run JSONL artifact validation first and record a validation receipt:

     ```bash
     node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "{topic}" --json
     ```

   - Correct any deterministic validation failures before launching an auditor. Do not ask a child to hand-check raw JSONL as a substitute for this validation when the tool or CLI can run.
   - After deterministic validation passes, route the final semantic gate through `cartographer_handoff auditor` when available so proposal/map/fact artifact summaries, acceptance criteria, validation receipt IDs, report path, and PASS/FAIL schema are captured deterministically. If the wrapper is unavailable, launch `cartographer-auditor` directly and record an explicit fallback receipt.
   - Built-in `reviewer`/`oracle` or a serial current-agent validation pass are fallback substitutes only when `cartographer_handoff auditor` or `cartographer-auditor` is unavailable, times out, or the user approves substitution. Each fallback must write an explicit fallback receipt in `.plan/{topic}/receipts.jsonl` with the attempted auditor, reason, substitute/manual reviewer used, deterministic validation receipt IDs, files reviewed, outcome, and residual risks.
   - If the JSONL validator cannot run, stop or ask the user before accepting the proposal unless the user approves a manual fallback; record a fallback receipt that includes the failed command/tool, error summary, manual checks performed, and remaining risk.
   - The deterministic/auditor validation pass must check that:
     - dependencies are declared and appear valid
     - steps align with the researched facts
     - referenced project files exist in the current checkout and, where possible, in the shared index
     - `map.nodes.jsonl` and `map.edges.jsonl` parse as valid JSONL
     - references in `map.nodes.jsonl` and `map.edges.jsonl` are valid
     - `facts.nodes.jsonl` and `facts.edges.jsonl` parse as valid JSONL
     - facts cited in `proposal.md` exist as `fact` nodes in `facts.nodes.jsonl`
     - every cited source-backed fact has a `supported_by` edge to a `source` node
     - private-derived facts cite sanitized evidence docs, not `.plan/_private/**`
     - evidence docs referenced as `source_kind: "sanitized_evidence"` include a redaction status
     - indexed nodes cited in `proposal.md`, `map.nodes.jsonl`, or `map.edges.jsonl` exist in `.plan/_index/project-graph.sqlite`
     - the proposal respects `## Goals` and `## Non-Goals`
     - `## ADR Metadata` exists, contains `adr_required`, and matches the request/proposal evidence
   - Apply any necessary corrections to `proposal.md`, `map.nodes.jsonl`, `map.edges.jsonl`, `facts.nodes.jsonl`, or `facts.edges.jsonl`, rerun deterministic validation, and require `cartographer-auditor` `PASS` or an approved fallback receipt before final response.

9. **Final response**
   - Reply with the created topic and paths:
     - `.plan/_index/project-graph.sqlite`
     - `.plan/_index/project-graph-manifest.json`
     - `.plan/{topic}/proposal.md`
     - `.plan/{topic}/map.nodes.jsonl`
     - `.plan/{topic}/map.edges.jsonl`
     - `.plan/{topic}/facts.nodes.jsonl`
     - `.plan/{topic}/facts.edges.jsonl`
     - `.plan/{topic}/evidence/` when private artifacts were analyzed
   - Briefly summarize what each delegated or serial role contributed, mention any residual risks or unresolved decisions, and explicitly state whether an ADR is expected to be generated later (`adr_required: true/false`) and why.

## Delegation Guidance

Keep the parent agent responsible for orchestration, artifact integrity, index freshness, and final validation. Do not default to one long serial subagent chain. Prefer deterministic parent/tool steps for index refresh, map generation, JSONL validation, and small JSONL upserts.

Performance rules:

- Follow the Clean Context Contract: normal LLM-facing outputs should stay near 8KB, expanded diagnostics near 16KB, and larger outputs should be represented by compact receipts with `summary`, `references`, `counts`, `token_estimate`, `truncated`, `full_output_path`, `verification`, and `next_actions`.
- Write proposal workflow checkpoints to `.plan/{topic}/receipts.jsonl` and compact handoff context to `.plan/{topic}/context-packs.jsonl` when a proposal step generates durable decisions, validation results, large research output, timeout/fallback events, fallback substitutions, or subagent handoff context.
- Keep raw command/search/session output in `/tmp/pi-cartographer-runs/` by default; use ignored `.plan/_runs/` only when explicitly useful for local replay, and never cite or commit raw run logs.
- Do not read entire large files (`draft.md`, local Pi docs, raw README files, generated artifacts) unless targeted indexed reads or focused lexical searches are insufficient. Use `cartographer_index context`, `repo-map`, and `read` for durable planning context, and use safe `search`/focused `rg` for exact identifiers, filenames, scripts, tests, and error strings.
- Treat lexical search as the fast verification path for concrete code evidence; treat the shared index as a reusable planning/map cache, not the only discovery mechanism.
- Do not inline large subagent outputs into later prompts. Use `outputMode: "file-only"` for researcher, optional scout, planner, `cartographer-auditor`/fallback reviewer, or any child expected to produce more than a short answer.
- Parallelize independent read-only roles where practical: scope writing and missing research can run after deterministic map generation without waiting for optional scout. Keep `cartographer-compass`/oracle consistency checks after design and `cartographer-auditor` validation after deterministic receipts.
- Seed/cache local Pi docs and pi-subagents facts with `cartographer_jsonl({"action":"seed-pi-facts", ...})`; do not ask researcher to re-summarize the same local docs every proposal.
- Use `cartographer_jsonl validate-topic` for deterministic artifact checks before asking `cartographer-auditor` to reason about higher-level quality; fallback reviewer/oracle passes must cite the validation receipt or explain the approved fallback receipt.
- Use `cartographer_evidence import` for user-provided private artifacts before any raw-content analysis. Keep `.plan/_private/**` out of prompts except as explicit paths for `cartographer-redactor`, and cite only sanitized `.plan/{topic}/evidence/` outputs.

Use subagents only where they add judgment: missing research (`cartographer-archivist`), design/proposal synthesis (`cartographer-drafter`), semantic audit (`cartographer-auditor`), and decision consistency (`cartographer-compass`). Built-in agents remain fallback substitutes only.

Apply a least-privilege child tool policy. Do not grant every child full mutable JSONL/private/ADR/receipt authority: the parent owns canonical proposal/map/fact writes, receipt append decisions, ADR evaluation, and raw private intake. Give each child only the artifact paths, read-only Cartographer actions, sanitized evidence, and explicit output contract needed for its role; `cartographer-redactor` is the only child that should receive raw `.plan/_private/**` paths, and `cartographer-auditor` should normally receive deterministic receipts rather than mutable write authority. For non-trivial delegated handoffs, pass structured `acceptance`, `async`/timeout expectations, `control` stop/escalation rules, `outputMode: "file-only"` for large outputs, helper summary paths, and timeout/fallback receipt requirements.

Retrieval and lifecycle contract for proposal artifacts:

- Lifecycle states are `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`. New proposal artifacts start as `draft` and become `accepted` only after validation or explicit user acceptance.
- Index/map/query results are candidates until verified. Use `candidate`, `verified`, and `verification` metadata where useful; `verified: true` requires direct read, focused `rg`, or deterministic validation evidence.
- Retrieval miss records belong in `.plan/_retrieval/misses.jsonl` and should include `failure_type`, `original_query`, `expanded_queries`, `retrieval_modes`, `expected_terms`, `eventual_hit`, `resolution`, and concise notes when known.
- Retrieval scopes are `code`, `plans`, and `all`, with `code` as the default. Proposal code discovery should exclude `.plan/**`; rationale retrieval should search `.plan/` only through explicit bounded probes.
- ADR generation is no longer blanket out-of-scope: proposals must record `adr_required` intent, and implementation finalization should use `cartographer_adr` only when accepted metadata and validation receipts justify it.

After choosing delegated or approved serial execution mode, use the `index-project` skill to create/update `.plan/_index/project-graph.sqlite` before scope, mapping, research, or planning passes. When this proposal skill is installed alongside `index-project`, prefer the direct sibling reference `../index-project/SKILL.md` to avoid ambiguity with another discovered skill of the same name. Pass concise query results, map JSONL paths, index artifact paths, and the index tool commands into subagent prompts. Subagents should use the index-derived graph as their starting context for proposal artifacts, then use `rg`/grep and selective file reads to verify exact code evidence or fill obvious lexical gaps.

Role-scoped least-privilege Cartographer helper examples for delegated agents in this workflow (`cartographer-archivist`, `cartographer-drafter`, `cartographer-compass`/fallback `oracle`, `cartographer-auditor`/fallback `reviewer`, and redactor-only private analysis):

```bash
cartographer_artifacts({"action":"validate-topic-summary","root":"$PWD","topic":"{topic}"})
cartographer_artifacts({"action":"fact-citation-summary","root":"$PWD","topic":"{topic}"})
cartographer_artifacts({"action":"show-record","root":"$PWD","topic":"{topic}","artifact":"context-packs","id":"<context-id>"})
cartographer_artifacts({"action":"receipt-summary","root":"$PWD","topic":"{topic}"})
cartographer_artifacts({"action":"evidence-manifest-summary","root":"$PWD","topic":"{topic}"})
cartographer_index({"action":"query","root":"$PWD","topic":"{topic}","limit":10})
cartographer_index({"action":"read","root":"$PWD","path":"<project-relative-path>"})
cartographer_session({"action":"analyze","input":"<authorized-session-jsonl>","out":".plan/{topic}/evidence/<session-analysis>.md"})
```

Use mutable helpers only in parent-owned deterministic steps unless a child contract explicitly scopes them: `cartographer_jsonl validate-topic` may produce validation output, `seed-pi-facts`/upserts remain parent-owned, `cartographer_adr` remains parent/finalization-owned, and raw private paths go only to `cartographer-redactor`. When launching delegated agents through pi-subagents, include the package extension path `extensions/cartographer-tools.ts` in the child tool/extension configuration when supported so needed tools are callable. Grant only the actions needed by that role; do not hand every child mutable `cartographer_jsonl upsert`, raw private paths, ADR write actions, or receipt append authority by default. If custom helper tools are unavailable in the child, generate the same `cartographer_artifacts`, `cartographer_index`, or `cartographer_session` summaries in the parent/CLI first, pass their paths in the prompt, and write a timeout/fallback receipt for any substituted validation or audit path.

Structured handoff contract fields should be explicit in the `subagent(...)` call when supported, or copied into the prompt when not supported:

```json
{
  "acceptance": {
    "criteria": ["exact sections/checklist IDs", "helper summaries cited", "PASS/FAIL or draft receipt required"],
    "evidenceRequired": [
      "changed-files when applicable",
      "commands-run",
      "validation-output",
      "residual-risks",
      "diff-summary"
    ]
  },
  "async": { "enabled": true, "timeoutMs": 600000 },
  "control": {
    "stopRules": ["scope ambiguity", "missing helper summaries", "repeated tool failure"],
    "maxFinalizationTurns": 3
  },
  "outputMode": "file-only",
  "helperSummaries": [".plan/{topic}/context-packs.jsonl:<id>", ".plan/{topic}/receipts.jsonl:<ids>"],
  "timeoutFallbackReceipt": ".plan/{topic}/receipts.jsonl"
}
```

If no executable subagents are available, first alert the user and ask whether they want the current agent to run the same sequence as an internal serial workflow. Only continue serially after the user approves. If they decline, stop and report any initialized/index artifacts.

In approved serial mode, clearly separate each role in your own reasoning and outputs: scope writer, codebase mapper, researcher, planner, oracle checker, and final validator. Produce the same artifacts and meet the same verification criteria; the only difference is that the current agent performs each pass instead of invoking subagents.

Recommended prompts for delegated mode:

- `delegate`: "Think deeply about the user's request and current context. Define the proposal scope. You have read access to the index tool commands; run `ensure` if freshness is uncertain, then use concise query output only as background context. Focus on the problem and desired outcome, not implementation details. Produce Description, Problem Statement, Goals, and Non-Goals sections for `.plan/{topic}/proposal.md`."
- Optional `scout`: "Start from `cartographer_index query/read` outputs and existing map JSONL for `{topic}`, then use focused `rg`/grep searches for exact identifiers, filenames, scripts, tests, commands, and error strings that may be missing or questionable. Do not rediscover the repo broadly or read whole large files unless index snippets and lexical hits are insufficient. Do not rewrite map JSONL and do not create `map.graph.json`; return concise suggested node/edge additions with evidence."
- `researcher`: "Research only missing or stale facts for `{topic}` in light of indexed project context. First inspect existing fact JSONL summaries; do not re-summarize local Pi docs or pi-subagents docs when existing supported fact nodes cover them. You have read access to Cartographer tools; run `cartographer_index ensure` if freshness is uncertain and use `query`/`read` for project context. Return concise JSONL node/edge suggestions and Background/Viability prose citing fact IDs. Every source-backed claim needs a fact node, source node, and `supported_by` edge. Do not read whole large docs unless targeted facts are missing."
- `planner`: "Using proposal scope, concise map/fact summaries, artifact paths, and the shared project index, create high-level design steps under `## Design`, then fill each step with details, citations, dependencies, diagrams, and tables as appropriate. Use Cartographer tools for targeted reads before citing indexed context. Do not request or inline full raw map/research/scout outputs when file paths plus concise summaries are sufficient."
- `cartographer-compass`/fallback `oracle`: "Before the planner finalizes this step, check whether the step makes sense in context, fits the scope, respects goals/non-goals, aligns with facts, and references real project files or indexed nodes. Use provided `cartographer_artifacts` fact/context/receipt summaries and `cartographer_index` query/read summaries, or parent-generated summary paths if helper tools are unavailable. Return concerns and suggested corrections only."
- `cartographer-auditor`: "Final-validate the complete proposal artifacts after deterministic validation receipts pass. Use the provided `cartographer_jsonl validate-topic` receipt, `cartographer_artifacts` validate/fact/receipt summaries, helper summary paths, acceptance criteria, and deterministic auditor receipt path instead of manually re-parsing large JSONL. Run targeted `cartographer_index` reads only when freshness or references are uncertain. Check required sections, fact citations/support, map/fact JSONL validity, file references, goals/non-goals alignment, ADR metadata, and handoff readiness. Do not create new design content; return `PASS`/`FAIL` with required corrections."
- Fallback `reviewer`/serial validator: "Use only when `cartographer-auditor` is unavailable or the user approved substitution. Review the same artifacts and deterministic receipts, then write or request an explicit fallback receipt with outcome and residual risk."

Serial-mode confirmation prompt:

- "No executable subagents are available for this proposal workflow. Do you want me to continue by creating/updating the shared project index, generating/validating map JSONL deterministically, and then performing needed scope, research, planner, compass/oracle, and auditor-validation passes serially as the current agent?"

Serial-mode role prompts:

- Scope writer: define `## Description`, `## Problem Statement`, `## Goals`, and `## Non-Goals` from the user's intent and current context, using index-query output only as background.
- Codebase mapper: inspect the shared SQLite index and starter map JSONL, verify relevant files with focused `rg`/grep and selective reads as needed, and write `map.nodes.jsonl` plus `map.edges.jsonl` with valid file references and resolvable graph IDs.
- Researcher: search or inspect documentation yourself, using indexed project constraints to focus the search, and append each source-backed finding as JSONL graph records to `facts.nodes.jsonl` and `facts.edges.jsonl` before continuing.
- Planner: draft `## Design` as high-level `###` steps, then fill each step with dependencies, references to facts and indexed files, risks, diagrams, and tables where helpful.
- Compass/oracle checker: before each step is finalized, switch perspective and challenge the step for scope fit, fact alignment, index/file-reference validity, and hidden assumptions.
- Final validator: perform a cartographer-auditor-style artifact validation pass after deterministic JSONL validation, correct missing dependencies, invalid references, unsupported citations, missing index citations, or scope drift, and write a fallback receipt because the default auditor was not used.

## Pitfalls

- Do not skip the `index-project` step; the shared SQLite + FTS5 graph is the primary durable source for proposal mapping artifacts.
- Do not continue after an indexing failure without alerting the user and getting approval for manual discovery with `rg`/grep and selective reads.
- Do not continue automatically in the zero-subagent case; alert the user and ask whether to proceed serially with the current agent.
- Do not run serial mode unless the user has approved it.
- Do not treat serial mode as permission to skip roles. The current agent must still perform scope, mapping, research, planning, compass/oracle checking, and final validation as separate passes.
- Do not let research claims enter `proposal.md` without a corresponding `fact` node ID in `facts.nodes.jsonl` and a supporting `supported_by` edge in `facts.edges.jsonl`.
- Do not write YAML, JSON arrays, or comma-separated JSON objects into the map or research graph files; they must remain newline-delimited JSON objects.
- Treat `map.nodes.jsonl` plus `map.edges.jsonl` as the proposal map source of truth.
- Do not let the map graph become a flat grep dump; it should be a curated graph view grounded in the indexed topic graph and verified with focused lexical evidence where useful.
- Do not rely only on raw FTS ranking; verify high-impact files with `rg`/grep or direct reads and include graph neighbors where relevant.
- Do not turn the scope sections into a technology shopping list; keep them problem-centered.
- Do not skip compass/oracle checks for design steps, even in serial mode.
- Do not overwrite useful existing proposal content without preserving or reconciling it.
- Do not omit `## ADR Metadata`; every proposal should state `adr_required` and why.
- Do not mark `adr_required: true` for directed architecture choices without alternatives or user-provided rationale unless the user explicitly accepts the rationale.

## Verification

Before finalizing, verify:

- `.plan/_index/project-graph.sqlite` exists.
- `.plan/_index/project-graph-manifest.json` exists and reports nonzero indexed files/chunks.
- `.gitignore` contains `.plan/_index/` so generated index/cache files are not committed.
- `.plan/{topic}/proposal.md` exists and contains all required sections.
- `.plan/{topic}/map.nodes.jsonl` exists, parses as valid JSONL, and contains curated map nodes with `id`, `type`, `title`, `description`, optional `reference`, and index metadata such as `source`/`confidence` when available.
- `.plan/{topic}/map.edges.jsonl` exists, parses as valid JSONL, and contains typed edges whose `from`/`to` IDs resolve to curated map nodes, indexed nodes in the shared SQLite database, or other explicitly cited graph nodes.
- `.plan/{topic}/facts.nodes.jsonl` exists, parses as valid JSONL, and contains source-backed fact/source/tool/example/risk/constraint nodes with stable IDs.
- `.plan/{topic}/facts.edges.jsonl` exists, parses as valid JSONL, and contains typed edges, including `supported_by` edges from fact nodes to source nodes.
- Every fact citation in `proposal.md` exists as a `fact` node in `facts.nodes.jsonl`.
- Every cited source-backed fact has a `supported_by` edge to a `source` node.
- Every file reference in `map.nodes.jsonl` or `map.edges.jsonl` points to an existing project file, ideally with a line number.
- Every indexed node ID cited in `map.nodes.jsonl`, `map.edges.jsonl`, or `proposal.md` exists in `.plan/_index/project-graph.sqlite`.
- `## Design` contains high-level `###` steps plus details, dependencies, references, and any useful diagrams/tables.
- Design steps use indexed project files where relevant instead of relying only on ad-hoc file discovery.
- `## ADR Metadata` includes `adr_required`, `adr_reason`, `adr_options_status`, and `adr_tool_mode`.
- Directed ADR-worthy choices include alternatives or user-provided rationale, or the proposal records that clarification is still needed.
- A final `cartographer-auditor` `PASS` has been recorded after deterministic validation, or an approved reviewer/oracle/serial fallback receipt exists and corrections were applied.
