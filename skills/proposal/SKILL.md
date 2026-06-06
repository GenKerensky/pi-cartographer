---
name: "proposal"
description: "Pi Cartographer proposal workflow: create .plan/<topic>/proposal.md using the index-project SQLite/FTS graph plus delegated scope, mapping, research, design, oracle review, and validation."
version: 16
created: "2026-06-05"
updated: "2026-06-06"
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
- `.plan/{topic}/map.graph.json` — raw topic graph slice exported from the shared project index.
- `.plan/{topic}/map.nodes.jsonl` — curated topic-map graph nodes derived from the index slice and verified manual additions.
- `.plan/{topic}/map.edges.jsonl` — curated topic-map graph edges connecting relevant files, symbols, docs, dependencies, constraints, and design context.
- `.plan/{topic}/facts.nodes.jsonl` — append-only research graph nodes: facts, sources, tools, examples, risks, constraints.
- `.plan/{topic}/facts.edges.jsonl` — append-only research graph edges connecting facts to sources, project context, goals, risks, and design steps.

`{topic}` is a concise summary of the user's requested topic in **3 words or less**. Prefer a filesystem-safe lowercase kebab-case topic for paths, and use the same topic in the proposal heading exactly as `# {topic} Proposal`.

## Procedure

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

     ## Design
     ```

   - Create empty or initialized `.plan/{topic}/map.nodes.jsonl`, `.plan/{topic}/map.edges.jsonl`, `.plan/{topic}/facts.nodes.jsonl`, and `.plan/{topic}/facts.edges.jsonl`.
   - If any topic artifact already exists, do not blindly truncate it. Preserve useful content, continue stable ID sequences, and reconcile existing records with new indexed/researched context.

2. **Inspect available subagents and choose execution mode**
   - Call the subagent list action before delegating whenever the subagent tool is available.
   - Prefer the exact agents named `delegate`, `scout`, `researcher`, `planner`, and `oracle` when available.
   - If the subagent list returns **no executable subagents**, or the subagent tool is unavailable:
     - Alert the user that no subagents are available for the proposal workflow.
     - Ask whether they want to continue by running the whole workflow serially with the current agent.
     - Do not proceed beyond initialization unless the user approves serial mode.
     - If the user declines, stop and report any initialized paths.
   - If the user approves serial mode, the current agent performs each role in order:
     1. scope writer for `delegate`
     2. codebase mapper for `scout`
     3. web/documentation researcher for `researcher`
     4. design planner for `planner`
     5. skeptical consistency checker for `oracle`
     6. final validator for the second `planner` pass
   - If some executable subagents exist but a required exact agent is unavailable, ask the user whether to substitute the closest available agent. Do not silently skip a role.

3. **Create or update the shared project index**
   - Load and use the `index-project` skill. If this skill is installed from the bundled `pi-skills` repository, read the sibling skill at `../index-project/SKILL.md` relative to this `SKILL.md`.
   - Run the index-project workflow to create or update:
     - `.plan/_index/project-graph.sqlite`
     - `.plan/_index/project-graph-manifest.json`
   - Query the index for `{topic}` and export a topic graph slice to `.plan/{topic}/map.graph.json`.
   - When the `index-project` skill supports it and the curated map graph files are missing or thin, prefer `slice-jsonl --out-dir ".plan/{topic}"` to initialize `.plan/{topic}/map.graph.json`, `.plan/{topic}/map.nodes.jsonl`, and `.plan/{topic}/map.edges.jsonl` before the scout pass. Do not overwrite useful existing curated map JSONL without reconciling it.
   - If indexing fails, alert the user with the error and ask whether to continue with manual file discovery. Do not silently skip the index.
   - Treat `.plan/_index/project-graph.sqlite` and `.plan/{topic}/map.graph.json` as the primary source for finding relevant files throughout the rest of the workflow.

4. **Scope the proposal with `delegate` or serial scope pass**
   - Delegate an agent, or in approved serial mode act as the scope writer, to think carefully about the request, mull over the user's intent, consider the whole chat and current project context, and define proposal scope.
   - Provide the topic graph slice and any relevant index-query output as context, but keep this pass problem-centered rather than file-centered.
   - Write content for these sections in `proposal.md`:
     - `## Description`
     - `## Problem Statement`
     - `## Goals`
     - `## Non-Goals`
   - Emphasize the problem the user wants to solve and the desired outcome. Keep technology and code details secondary in these sections.

5. **Map project files with `scout` or serial codebase mapping**
   - Ask `scout`, or in approved serial mode inspect the indexed graph yourself, to create a curated topic-specific file/code/doc graph.
   - Start from `.plan/{topic}/map.graph.json` and the shared SQLite index. Use manual inspection only to verify, refine, or add clearly relevant files not retrieved by the index.
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
   - Ask `researcher`, or in approved serial mode research yourself, to search for tooling, documentation, similar projects, examples, prior art, and implementation constraints related to the topic.
   - Use indexed project context to narrow research questions to this repository's actual architecture and constraints.
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
   - Ask `planner`, or in approved serial mode act as the planner, to combine the problem statement, goals/non-goals, `map.nodes.jsonl`, `map.edges.jsonl`, `map.graph.json`, the shared SQLite index, `facts.nodes.jsonl`, and `facts.edges.jsonl` into a rough plan.
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

8. **Validate the plan with `planner` again or a serial validation pass**
   - Call `planner` one more time, or in approved serial mode perform a distinct validation pass yourself, to validate the complete proposal.
   - The validation pass must check that:
     - dependencies are declared and appear valid
     - steps align with the researched facts
     - referenced project files exist in the current checkout and, where possible, in the shared index
     - `map.nodes.jsonl` and `map.edges.jsonl` parse as valid JSONL
     - references in `map.nodes.jsonl` and `map.edges.jsonl` are valid
     - `facts.nodes.jsonl` and `facts.edges.jsonl` parse as valid JSONL
     - facts cited in `proposal.md` exist as `fact` nodes in `facts.nodes.jsonl`
     - every cited source-backed fact has a `supported_by` edge to a `source` node
     - indexed nodes or graph-slice entries cited in `proposal.md`, `map.nodes.jsonl`, or `map.edges.jsonl` exist in `.plan/{topic}/map.graph.json` or `.plan/_index/project-graph.sqlite`
     - the plan respects `## Goals` and `## Non-Goals`
   - Apply any necessary corrections to `proposal.md`, `map.nodes.jsonl`, `map.edges.jsonl`, `map.graph.json`, `facts.nodes.jsonl`, or `facts.edges.jsonl`.

9. **Final response**
   - Reply with the created topic and paths:
     - `.plan/_index/project-graph.sqlite`
     - `.plan/_index/project-graph-manifest.json`
     - `.plan/{topic}/proposal.md`
     - `.plan/{topic}/map.graph.json`
     - `.plan/{topic}/map.nodes.jsonl`
     - `.plan/{topic}/map.edges.jsonl`
     - `.plan/{topic}/facts.nodes.jsonl`
     - `.plan/{topic}/facts.edges.jsonl`
   - Briefly summarize what each delegated or serial role contributed and mention any residual risks or unresolved decisions.

## Delegation Guidance

Use sequential delegation because each artifact feeds the next stage. Keep the parent agent responsible for orchestration, artifact integrity, index freshness, and final validation.

After choosing delegated or approved serial execution mode, use the `index-project` skill to create/update `.plan/_index/project-graph.sqlite` and export `.plan/{topic}/map.graph.json` before scope, mapping, research, or planning passes. When this proposal skill is installed alongside `index-project`, prefer the direct sibling reference `../index-project/SKILL.md` to avoid ambiguity with another discovered skill of the same name. Pass the graph slice path, relevant query results, and index artifact paths into subagent prompts. Subagents should use the index-derived graph as their starting context rather than rediscovering the project from scratch.

If no executable subagents are available, first alert the user and ask whether they want the current agent to run the same sequence as an internal serial workflow. Only continue serially after the user approves. If they decline, stop and report any initialized/index artifacts.

In approved serial mode, clearly separate each role in your own reasoning and outputs: scope writer, codebase mapper, researcher, planner, oracle checker, and final validator. Produce the same artifacts and meet the same verification criteria; the only difference is that the current agent performs each pass instead of invoking subagents.

Recommended prompts for delegated mode:

- `delegate`: "Think deeply about the user's request and current context. Define the proposal scope. Use `.plan/{topic}/map.graph.json` only as background context; focus on the problem and desired outcome, not implementation details. Produce Description, Problem Statement, Goals, and Non-Goals sections for `.plan/{topic}/proposal.md`."
- `scout`: "Use `.plan/_index/project-graph.sqlite` and `.plan/{topic}/map.graph.json` to find project files relevant to `{topic}`. Create `.plan/{topic}/map.nodes.jsonl` and `.plan/{topic}/map.edges.jsonl` as a curated topic graph. Every node needs id, type, title, description, optional file-path:line-number reference, and should include `source`/`confidence` when available. Every edge needs from, to, and type."
- `researcher`: "Research tooling, documentation, similar projects, and examples for `{topic}` in light of the indexed project context from `.plan/{topic}/map.graph.json`. After each finding, immediately append JSONL nodes to `.plan/{topic}/facts.nodes.jsonl` and JSONL edges to `.plan/{topic}/facts.edges.jsonl` before continuing. Every source-backed claim needs a fact node, source node, and `supported_by` edge. When done, produce Background and Viability sections for `.plan/{topic}/proposal.md` citing fact IDs."
- `planner`: "Using proposal scope, `.plan/{topic}/map.nodes.jsonl`, `.plan/{topic}/map.edges.jsonl`, `.plan/{topic}/map.graph.json`, the shared project index, `facts.nodes.jsonl`, and `facts.edges.jsonl`, create high-level design steps under `## Design`, then fill each step with details, citations, dependencies, diagrams, and tables as appropriate."
- `oracle`: "Before the planner finalizes this step, check whether the step makes sense in context, fits the scope, respects goals/non-goals, aligns with facts, and references real project files or indexed nodes. Return concerns and suggested corrections."

Serial-mode confirmation prompt:

- "No executable subagents are available for this proposal workflow. Do you want me to continue by creating/updating the shared project index and then performing the delegate, scout, researcher, planner, oracle, and validation passes serially as the current agent?"

Serial-mode role prompts:

- Scope writer: define `## Description`, `## Problem Statement`, `## Goals`, and `## Non-Goals` from the user's intent and current context, using the topic graph only as background.
- Codebase mapper: inspect `.plan/{topic}/map.graph.json` and the shared index, verify relevant files manually as needed, and write `map.nodes.jsonl` plus `map.edges.jsonl` with valid file references and resolvable graph IDs.
- Researcher: search or inspect documentation yourself, using indexed project constraints to focus the search, and append each source-backed finding as JSONL graph records to `facts.nodes.jsonl` and `facts.edges.jsonl` before continuing.
- Planner: draft `## Design` as high-level `###` steps, then fill each step with dependencies, references to facts and indexed files, risks, diagrams, and tables where helpful.
- Oracle checker: before each step is finalized, switch perspective and challenge the step for scope fit, fact alignment, index/file-reference validity, and hidden assumptions.
- Final validator: perform the second planner pass and correct missing dependencies, invalid references, unsupported citations, missing index citations, or scope drift.

## Pitfalls

- Do not skip the `index-project` step; the shared SQLite + FTS5 graph is the primary discovery source for proposal mapping.
- Do not continue after an indexing failure without alerting the user and getting approval for manual discovery.
- Do not continue automatically in the zero-subagent case; alert the user and ask whether to proceed serially with the current agent.
- Do not run serial mode unless the user has approved it.
- Do not treat serial mode as permission to skip roles. The current agent must still perform scope, mapping, research, planning, oracle checking, and final validation as separate passes.
- Do not let research claims enter `proposal.md` without a corresponding `fact` node ID in `facts.nodes.jsonl` and a supporting `supported_by` edge in `facts.edges.jsonl`.
- Do not write YAML, JSON arrays, or comma-separated JSON objects into the map or research graph files; they must remain newline-delimited JSON objects.
- Treat `map.nodes.jsonl` plus `map.edges.jsonl` as the proposal map source of truth.
- Do not let the map graph become a flat grep dump; it should be a curated graph view of the indexed topic graph.
- Do not rely only on raw FTS ranking; verify high-impact files and include graph neighbors where relevant.
- Do not turn the scope sections into a technology shopping list; keep them problem-centered.
- Do not skip oracle checks for design steps, even in serial mode.
- Do not overwrite useful existing proposal content without preserving or reconciling it.

## Verification

Before finalizing, verify:

- `.plan/_index/project-graph.sqlite` exists.
- `.plan/_index/project-graph-manifest.json` exists and reports nonzero indexed files/chunks.
- `.plan/{topic}/map.graph.json` exists and was exported from the shared index for the proposal topic.
- `.plan/{topic}/proposal.md` exists and contains all required sections.
- `.plan/{topic}/map.nodes.jsonl` exists, parses as valid JSONL, and contains curated map nodes with `id`, `type`, `title`, `description`, optional `reference`, and index metadata such as `source`/`confidence` when available.
- `.plan/{topic}/map.edges.jsonl` exists, parses as valid JSONL, and contains typed edges whose `from`/`to` IDs resolve to curated map nodes, indexed graph-slice nodes, or other explicitly cited graph nodes.
- `.plan/{topic}/facts.nodes.jsonl` exists, parses as valid JSONL, and contains source-backed fact/source/tool/example/risk/constraint nodes with stable IDs.
- `.plan/{topic}/facts.edges.jsonl` exists, parses as valid JSONL, and contains typed edges, including `supported_by` edges from fact nodes to source nodes.
- Every fact citation in `proposal.md` exists as a `fact` node in `facts.nodes.jsonl`.
- Every cited source-backed fact has a `supported_by` edge to a `source` node.
- Every file reference in `map.nodes.jsonl` or `map.edges.jsonl` points to an existing project file, ideally with a line number.
- Every indexed node ID cited in `map.nodes.jsonl`, `map.edges.jsonl`, or `proposal.md` exists in `.plan/{topic}/map.graph.json` or `.plan/_index/project-graph.sqlite`.
- `## Design` contains high-level `###` steps plus details, dependencies, references, and any useful diagrams/tables.
- Design steps use indexed project files where relevant instead of relying only on ad-hoc file discovery.
- A final planner validation pass has been completed and corrections were applied.