# retrieval-workflow Proposal

## Description

Improve Pi Cartographer's planning and implementation workflow by making retrieval a bounded, lexical-first, evidence-verified process. The plugin should keep the shared SQLite/FTS graph as durable planning infrastructure, but treat index hits as candidates that must be verified with direct reads and focused `rg`/grep before they become authoritative context for proposals, plans, or implementation handoffs.

The proposal is based on the GrepRAG paper's finding that lightweight identifier-oriented lexical retrieval is a strong baseline for repository-level code work, while its main weaknesses are noisy generic keywords, redundant/fragmented snippets, and weak reranking [F1] [F3] [F4] [F5].

## Problem Statement

Cartographer currently creates durable map/fact/plan artifacts, but retrieval behavior is still too implicit. Agents may query the index with broad topic strings, trust high-ranked matches too early, or pass redundant context into later roles. This can cause three workflow problems:

1. **Broad-topic retrieval drift**: a topic like `retrieval workflow` may surface loosely related docs or scripts while missing exact symbols, tests, or command paths.
2. **Candidate/verified ambiguity**: map JSONL can contain index-derived entries without clearly separating unverified candidates from evidence-backed context.
3. **Context budget waste**: scout/planner/worker prompts can receive overlapping snippets or whole artifacts instead of compact, structure-aware context.

These problems are especially important because Cartographer's outputs are meant to be reviewed, committed, and reused. A planning artifact should not merely list plausible files; it should explain how important file references were found and verified.

## Goals

- Add an explicit retrieval-planning step to proposal, plan, and implement workflows.
- Generate several targeted lexical probes per task, based on identifier categories shown useful by GrepRAG: class/type names, method/function names, variable/config keys, import/package names, tests, scripts, filenames, and error strings [F2].
- Store and validate candidate-vs-verified status in map and plan artifacts.
- Preserve `.plan/` as a committed rationale archive while making rationale retrieval explicit and bounded.
- Add a formal artifact lifecycle so old proposals/plans can be treated as historical evidence, current implementation guidance, superseded decisions, or stale context.
- Improve context packing by merging adjacent/overlapping snippets and preferring symbol/doc-section boundaries [F4] [F5].
- Add retrieval miss logging so failed/insufficient searches become evidence for future query expansion, alias maps, or optional semantic retrieval.
- Add tests/fixtures that exercise noisy generic terms, duplicated chunks, camelCase/snake_case identifier matching, adjacent snippet merging, rationale search scope, stale artifact warnings, and miss-log recording.
- Keep retrieval fast, local, deterministic, and stdlib/runtime-light.

## Non-Goals

- Do not add embeddings or a vector database by default.
- Do not replace `rg`/grep with the SQLite index, or replace the index with ad-hoc grep.
- Do not make scout mandatory for routine file discovery.
- Do not require external LLM calls for query generation inside the indexer.
- Do not create a fully autonomous implementation agent that edits without plan/checklist/reviewer gates.
- Do not implement final concise ADR generation into `docs/` in this proposal; that should be a separate proposal after full plan execution semantics are settled.

## Background

GrepRAG shows that LLM-generated `ripgrep` commands can match or outperform heavier RAG baselines for repository-level code completion while avoiding expensive indexing and graph maintenance [F1]. Its successful retrieval patterns are not arbitrary semantic searches; they are mostly explicit code identifiers such as class names, method names, variable names, and imports/packages [F2].

The same study also identifies failure modes that map directly to Cartographer:

- Generic keywords like `init`, `config`, and `run` create noisy retrieval sets that need disambiguation and reranking [F3].
- Separate grep queries can return overlapping or adjacent snippets, wasting context and fragmenting the semantic unit needed by the model [F4].
- Identifier-weighted reranking and structure-aware deduplication improve results, with deduplication especially important [F5].
- Command generation overhead should remain bounded through templates or compact keyword generation rather than unconstrained agent searching [F6].

Cartographer already has useful foundations: a shared SQLite/FTS project graph (`.plan/_index/project-graph.sqlite`), topic maps (`map.nodes.jsonl`, `map.edges.jsonl`), fact graphs, plan graphs, subagent roles, and validation tooling. Relevant areas include `skills/index-project/SKILL.md`, `skills/index-project/scripts/index_project.py`, `skills/proposal/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, `skills/plan/scripts/manage_jsonl.ts`, `skills/plan/scripts/validate_planning_graph.py`, and `extensions/cartographer-tools.ts`.

## Viability

This is highly viable. The plugin is already lexical/FTS-first rather than embedding-based, and recent work has introduced candidate and verification metadata in index query results. The remaining improvements are mostly workflow formalization, JSONL schema conventions, validation checks, and deterministic retrieval utilities.

The most complex implementation work is context packing: merging adjacent snippets, deduplicating overlaps, and emitting compact verified context. This can be implemented in the existing Python index script with stdlib-only logic and covered by focused fixtures. The prompt/workflow changes are low risk because they refine existing skill behavior rather than introducing new external dependencies.

## Design

### 1. Add a retrieval plan step to every workflow

Introduce a short, explicit retrieval plan before optional scout or worker handoff. The retrieval plan should list 5-10 targeted probes, each with a purpose and scope:

```text
- method: query_index / rg "cartographer_index" — find tool API usage
- filename: rg "manage_jsonl" — locate JSONL validation entry points
- command: rg "validate-topic" — locate CLI/tool validation behavior
- artifact: rg "map.nodes.jsonl" — locate map graph semantics
- generic constrained: rg "config" skills/index-project tests — avoid repo-wide noise
```

Update these workflow prompts:

- `skills/proposal/SKILL.md`: retrieval plan before deterministic map refinement or optional scout.
- `skills/plan/SKILL.md`: retrieval plan before gathering plan-relevant context.
- `skills/implement/SKILL.md`: retrieval plan before phase context and worker handoff.

The retrieval plan should be concise and bounded, reflecting GrepRAG's command-generation overhead lesson [F6].

### 2. Formalize candidate vs verified map records

Extend map JSONL conventions so index-derived records and `relevant_to` edges can carry verification state:

```json
{
  "source": "index-query",
  "candidate": true,
  "verified": false,
  "verification": {
    "read": { "path": "skills/index-project/scripts/index_project.py", "start_line": 927, "end_line": 934 },
    "rg": ["rg -n --fixed-strings verification_for_match -- skills/index-project/scripts/index_project.py"]
  }
}
```

Then add validation rules:

- `candidate` defaults to true for index-query results.
- `verified` can be true only when a direct read, `rg`, or deterministic validation command is recorded.
- proposal/plan validation warns when high-impact references are still candidate-only.
- implementation handoffs should not rely on candidate-only files for edit instructions unless the worker is explicitly told to verify first.

Primary files:

- `skills/plan/scripts/manage_jsonl.ts`
- `skills/plan/scripts/validate_planning_graph.py`
- `skills/proposal/SKILL.md`
- `skills/plan/SKILL.md`
- `skills/implement/SKILL.md`

### 3. Add a compact verified context packer

Add a new index command or option, likely one of:

```bash
python skills/index-project/scripts/index_project.py context --topic "..." --limit 8 --json
python skills/index-project/scripts/index_project.py query --topic "..." --verified-context --json
```

The context packer should:

- start from index candidates
- include verification hints
- merge adjacent snippets from the same file
- deduplicate overlapping chunks
- prefer symbol/doc-section boundaries
- cap output by file count and approximate token budget
- label every snippet as candidate or verified

This directly addresses fragmentation and redundancy [F4] while preserving the lightweight lexical retrieval model [F1].

### 4. Improve noisy generic keyword handling

Add query safeguards for high-frequency ambiguous terms [F3]:

- maintain a small configurable noisy-code-token list: `init`, `run`, `config`, `handler`, `index`, `main`, `process`, `data`, `util`, `helper`, `test`.
- when a query is mostly generic, require at least one scope constraint such as path prefix, filename, symbol name, artifact name, or nearby specific token.
- downrank matches that only hit generic terms.
- surface a warning in text output: `Generic query; constrain with path/type/symbol terms before trusting results.`

Primary file: `skills/index-project/scripts/index_project.py`.

### 5. Add retrieval-quality fixtures

Add fixtures/tests for the GrepRAG failure modes and the Cartographer workflow contract:

- **Identifier expansion**: `loadUserSettings` should match `load user settings`.
- **Generic noise**: `config` alone should not outrank a scoped `index-project config` target.
- **Deduplication**: duplicate generated chunks should not dominate top results.
- **Context merging**: adjacent chunks from one file should be packed into one context block.
- **Candidate verification metadata**: `slice-jsonl` should preserve `candidate`, `verification`, and later `verified` fields.
- **Validation warning**: proposal/plan artifacts should warn on high-impact candidate-only references.

Primary files:

- `tests/test_index_project.py`
- `tests/test_validate_planning_graph.py`
- `tests/test_manage_jsonl.py`
- `tests/manage_jsonl.test.ts`

### 6. Expose verification-oriented tool guidance

Update `extensions/cartographer-tools.ts` so child agents see the retrieval contract directly:

- index query returns candidates, not authority
- verify high-impact hits with `read`/`rg`
- use focused lexical probes for exact code evidence
- use map/fact/plan validation before reviewer/oracle reasoning

This keeps tool guidance consistent with the skill files and reduces prompt drift across subagents.

### 7. Add retrieval trace summaries to proposal and plan artifacts

Add an optional `## Retrieval Notes` section to proposals and plans. It should summarize:

- queries/probes used
- key verified files
- candidate-only areas needing caution
- noisy terms avoided or constrained
- context-packing/deduplication decisions

This makes planning artifacts auditable without dumping raw search output.

### 8. Add retrieval miss logging

Add a lightweight miss log for cases where index/`rg` retrieval did not find useful context, returned only noisy generic matches, or required substantial manual query reformulation. This should create a feedback loop before adding heavier mechanisms such as embeddings.

Suggested artifact:

```text
.plan/_retrieval/misses.jsonl
```

Suggested record shape:

```json
{
  "id": "miss:2026-06-07T03:30:00Z:bundler-config",
  "created_at": "2026-06-07T03:30:00Z",
  "workflow": "proposal|plan|implement|manual",
  "topic": "bundler config",
  "original_query": "where is the bundler config?",
  "expanded_queries": ["rollup config", "vite config", "package.json build"],
  "retrieval_modes": ["cartographer_index", "rg"],
  "failure_type": "vocabulary_mismatch|generic_noise|missing_context|stale_artifact|ranking_failure|tool_failure",
  "expected_terms": ["rollup", "vite"],
  "eventual_hit": "rollup.config.ts:1",
  "resolution": "query_expansion|path_constraint|manual_read|user_hint|unresolved",
  "notes": "The repo uses Rollup but never says bundler."
}
```

Logging rules:

- Log only when retrieval materially slows or changes the workflow; do not log every empty search.
- Prefer concise structured records over raw command dumps.
- Do not log secrets, proprietary URLs, or large snippets.
- If a miss reveals a reusable synonym or project-local term, record `expected_terms` and `resolution` so future work can decide whether to add query expansion.
- Keep miss logging append-only and committed as project learning, while generated SQLite index/cache remains ignored.

Primary files:

- `skills/proposal/SKILL.md`
- `skills/plan/SKILL.md`
- `skills/implement/SKILL.md`
- `skills/plan/scripts/manage_jsonl.ts`
- `extensions/cartographer-tools.ts`

### 9. Add explicit rationale retrieval moments

Keep default code retrieval free of `.plan/` noise, but require bounded rationale searches at workflow boundaries where project history and intent matter:

- before creating a new proposal, search `.plan/` for related prior proposals, plans, facts, and superseded work
- before creating a plan, search `.plan/` for prior decisions that constrain sequencing, validation, or non-goals
- before implementing an existing plan, read the current topic's proposal/plan/facts and search `.plan/` for explicitly related topics only
- when a worker/reviewer/oracle encounters unclear design intent, search `.plan/` for the symbol, topic, feature name, or relevant decision term
- when reviewer/oracle checks scope drift, compare the current diff against the active plan and any related historical rationale

The workflow should label this as **rationale retrieval**, distinct from source-code retrieval. Rationale retrieval should be limited to a small number of targeted probes, such as:

```bash
rg "retrieval workflow" .plan
rg "cartographer_index" .plan
rg "GrepRAG" .plan
```

Agents should treat retrieved planning artifacts as historical evidence requiring freshness checks, not as authoritative current code facts.

### 10. Add a formal artifact lifecycle

Add lifecycle metadata to proposal, plan, and JSONL graph records so agents can distinguish current guidance from historical context:

```text
draft -> accepted -> planned -> in-progress -> implemented -> superseded/stale
```

Suggested metadata fields:

```json
{
  "status": "draft|accepted|planned|in-progress|implemented|superseded|stale",
  "created_at": "2026-06-07T00:00:00Z",
  "last_verified_at": "2026-06-07T00:00:00Z",
  "implemented_by": ["commit-sha"],
  "superseded_by": ".plan/new-topic/proposal.md",
  "stale_reason": "Referenced file moved or behavior changed"
}
```

Workflow rules:

- `proposal` starts artifacts as `draft`, then marks them `accepted` only when final validation passes or user explicitly accepts them.
- `plan` marks the topic `planned` after plan graph validation passes.
- `implement` marks phases `in-progress` and `implemented`, recording commit SHAs for completed phases.
- If retrieved old rationale conflicts with current code, agents should mark or recommend marking it `stale` rather than silently ignoring it.
- If a new proposal replaces an old one, link old artifacts with `superseded_by`.

Primary files:

- `skills/proposal/SKILL.md`
- `skills/plan/SKILL.md`
- `skills/implement/SKILL.md`
- `skills/plan/scripts/manage_jsonl.ts`
- `skills/plan/scripts/validate_planning_graph.py`

### 11. Add explicit query scopes for code vs rationale

Extend index/query tooling with explicit search scopes so agents can intentionally choose whether planning artifacts are included:

```bash
python skills/index-project/scripts/index_project.py query --scope code --topic "retrieval"
python skills/index-project/scripts/index_project.py query --scope plans --topic "retrieval"
python skills/index-project/scripts/index_project.py query --scope all --topic "retrieval"
```

Proposed defaults:

- `--scope code`: default for implementation and source discovery; excludes `.plan/**` except `.plan/_index` internals are never queried as source
- `--scope plans`: searches committed `.plan/<topic>/proposal.md`, `.plan/<topic>/plan.md`, and graph JSONL rationale artifacts
- `--scope all`: explicit combined search for high-level architectural review or migration tasks

The SQLite database can index planning artifacts into a separate namespace/table or scope column, but source-code query results should not blend planning rationale unless the caller opts in. This preserves the value of committed reasoning without letting decayed artifacts pollute ordinary code retrieval.

### 12. Validate retrieved rationale opportunistically

Do not try to keep every historical plan fresh forever. Instead, validate old rationale only when it is retrieved or when a topic is actively implemented:

- verify referenced files still exist
- verify indexed node IDs still resolve, when present
- verify cited fact/source nodes still exist
- warn if `last_verified_at` is old or missing
- warn if the artifact is `draft`, `superseded`, or `stale`
- require active implementation handoffs to use current-topic artifacts plus verified related rationale only

This keeps validation cost proportional to usage and avoids turning the archive into a maintenance burden.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| More metadata makes JSONL noisy | Keep required fields minimal; put details under `verification` and `metadata`. |
| Agents over-run `rg` searches | Bound retrieval plans to 5-10 probes and require a stop condition. |
| Generic-token rules hide useful files | Warn/downrank rather than hard-filter unless a query is entirely generic. |
| Validation becomes too strict | Start with warnings for candidate-only references; later promote critical checks to errors. |
| Context packer becomes a second planner | Keep it deterministic: retrieve, merge, dedupe, annotate; no design decisions. |
| Miss logs become noisy telemetry | Log only material misses, use concise schemas, and avoid raw dumps. |
| Historical plans become stale but look authoritative | Add lifecycle status, `last_verified_at`, and opportunistic validation warnings. |
| Rationale retrieval misses useful history | Require bounded `.plan/` rationale search at proposal/plan/implementation boundaries. |
| Rationale search pollutes source-code retrieval | Add explicit `code`, `plans`, and `all` query scopes; keep `code` as the default. |

## Success Criteria

- Proposal/plan/implement skills all require a bounded retrieval plan before optional scout or worker handoff.
- Proposal/plan/implement workflows perform bounded rationale retrieval in `.plan/` at the appropriate workflow boundaries.
- `map.edges.jsonl` generated from index queries includes candidate and verification metadata.
- Artifacts support lifecycle states: `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`.
- Validation reports candidate-only high-impact references and stale/superseded retrieved rationale.
- Retrieval misses are logged to an append-only JSONL artifact when searches fail due to vocabulary mismatch, generic noise, stale artifacts, ranking failure, or missing context.
- Query tooling supports explicit `code`, `plans`, and `all` scopes with `code` as the default.
- Query/context output handles identifier expansion, generic term noise, dedupe, and adjacent context merging.
- `npm run check` passes with new fixtures.
- No embeddings/vector database or external runtime service is introduced.
- Final ADR generation into `docs/` remains out of scope for this proposal.
