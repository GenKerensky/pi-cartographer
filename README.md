# Pi Cartographer

![Pi Cartographer logo](assets/pi-cartographer.png)

Graph-grounded planning skills for [pi](https://pi.dev): turn an idea into a proposal, a dependency-aware plan, and a phase-by-phase implementation workflow.

Pi Cartographer is a package of four skills that work together:

| Skill | Purpose | Primary output |
|---|---|---|
| `index-project` | Builds a shared SQLite + FTS5 project graph for code/docs. | `.plan/_index/project-graph.sqlite` |
| `proposal` | Creates a researched proposal grounded in the project graph. | `.plan/<topic>/proposal.md` |
| `plan` | Converts proposal/research/context into ordered phases. | `.plan/<topic>/plan.md` |
| `implement` | Executes phases with scout/worker/reviewer loops and commits. | phase commits + checked plan |

## Dependencies

Hard dependency:

- **Python 3.11+** — required for the bundled helper scripts that build/query the SQLite project graph and validate planning artifacts. The scripts use only the Python standard library at runtime.

Soft dependency:

- **[pi-subagents](https://pi.dev/packages/pi-subagents?name=sub+agents)** — strongly recommended for delegated `scout`, `researcher`, `planner`, `oracle`, `reviewer`, and `worker` workflows. Without subagents, the skills can ask to continue in approved serial mode with the current agent, but the full Cartographer workflow works best with subagents installed.

## Install

From npm:

```bash
pi install npm:pi-cartographer
```

From GitHub:

```bash
pi install git:github.com/GenKerensky/pi-cartographer
```

From a local checkout:

```bash
pi install /path/to/pi-cartographer
```

For one-off use without installing:

```bash
pi -e /path/to/pi-cartographer
```

## Workflow

```text
index-project
  -> proposal
    -> plan
      -> implement
```

Recommended commands inside pi:

```text
/skill:proposal <topic or request>
/skill:plan <topic or request>
/skill:implement <topic or request>
```

## Artifacts

Pi Cartographer stores durable planning artifacts under `.plan/` in the target project.

Shared project index:

```text
.plan/_index/project-graph.sqlite
.plan/_index/project-graph-manifest.json
```

Topic artifacts:

```text
.plan/<topic>/proposal.md
.plan/<topic>/plan.md
.plan/<topic>/map.nodes.jsonl
.plan/<topic>/map.edges.jsonl
.plan/<topic>/facts.nodes.jsonl
.plan/<topic>/facts.edges.jsonl
.plan/<topic>/plan.nodes.jsonl
.plan/<topic>/plan.edges.jsonl
```

Retrieval learning artifacts:

```text
.plan/_retrieval/misses.jsonl
```

Generated index/cache artifacts under `.plan/_index/` are ignored. Topic Markdown/JSONL artifacts and retrieval miss logs are source-of-truth rationale that may be committed.

## Planning Artifact Lifecycle

Cartographer planning artifacts use these lifecycle states:

```text
draft -> accepted -> planned -> in-progress -> implemented -> superseded/stale
```

- `draft` — artifact is being created and is not yet validated.
- `accepted` — proposal rationale has passed validation or been explicitly accepted.
- `planned` — plan artifacts are generated and validation-ready.
- `in-progress` — implementation has started for a plan or phase.
- `implemented` — planned work has completed and should record implementation evidence such as commit SHAs when available.
- `superseded` — a newer artifact replaces this rationale.
- `stale` — referenced code, facts, or external context may no longer match current reality.

Lifecycle metadata may appear in JSONL records as `status`, `created_at`, `last_verified_at`, `implemented_by`, `superseded_by`, and `stale_reason`.

### Migration notes for existing `.plan/` topics

Older topic artifacts may not have lifecycle metadata. They remain valid rationale, but agents should treat missing lifecycle and `last_verified_at` fields as unknown freshness until the artifact is revalidated. When touching an older topic, add lifecycle metadata opportunistically: mark current accepted proposals as `accepted`, generated plans as `planned` or `implemented`, obsolete decisions as `superseded`, and known-invalid rationale as `stale` with a short `stale_reason`. Do not rewrite historical Markdown solely to add metadata unless it is already part of the active workflow.

## Retrieval Contract

Cartographer separates source-code retrieval from rationale retrieval:

- **Code retrieval** is the default and searches project code/docs/config without `.plan/` rationale artifacts.
- **Plans retrieval** searches committed `.plan/` proposal, plan, map, fact, and plan graph artifacts as historical rationale.
- **All retrieval** intentionally combines code and plan scopes for architectural review or migration tasks.

These scopes are implemented as `--scope code`, `--scope plans`, and `--scope all` for indexed query/context/slice commands, with `code` as the default.

Index results are candidates until verified. Candidate/verified metadata uses fields such as `candidate`, `verified`, and `verification` with `read`, `rg`, or validation-command evidence. Use compact `context` output when an agent needs merged snippets with verification hints instead of broad file reads. Retrieval misses that materially change the workflow should be logged with `log-miss` to `.plan/_retrieval/misses.jsonl` with fields such as `failure_type`, `original_query`, `eventual_hit`, and `resolution`.

Final concise ADR generation into `docs/` is intentionally out of scope for retrieval-workflow and should be handled by a later proposal.

## Design principles

- **Graph first:** project context, map data, facts, and plans are represented with node/edge artifacts where useful.
- **Static artifacts:** all planning state lives in files that can be reviewed and committed.
- **Progressive delegation:** use `scout`, `planner`, `researcher`, `oracle`, `reviewer`, and `worker` when available; fall back to approved serial execution when not.
- **Review gates:** implementation phases do not complete until quality tools are green and reviewer approval is recorded.
- **Conventional commits:** `implement` commits at the end of each completed phase.

## Skill details

### `index-project`

Builds and queries a shared project graph. The package also registers `cartographer_index` and `cartographer_jsonl` tools for agents; the Python CLIs are available as fallbacks:

```bash
python skills/index-project/scripts/index_project.py ensure --root "$PWD"
python skills/index-project/scripts/index_project.py query --root "$PWD" --scope code --topic "project goals" --limit 5
python skills/index-project/scripts/index_project.py query --root "$PWD" --scope plans --topic "prior rationale" --limit 5
python skills/index-project/scripts/index_project.py context --root "$PWD" --scope code --topic "project goals" --json
python skills/index-project/scripts/index_project.py read --root "$PWD" --path "README.md" --json
python skills/index-project/scripts/index_project.py slice-jsonl --root "$PWD" --topic "search UI" --out-dir ".plan/search-ui"
python skills/index-project/scripts/index_project.py log-miss --root "$PWD" --workflow plan --topic "search UI" --original-query "query" --failure-type vocabulary_mismatch --resolution query_expansion
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "search-ui" --json
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-misses --root "$PWD" --json
```

### `proposal`

Creates `.plan/<topic>/proposal.md` plus map/fact graph artifacts. It scopes the problem, maps relevant code/docs, researches prior art, and drafts a design with oracle checks.

### `plan`

Creates `.plan/<topic>/plan.md` plus machine-readable plan graph artifacts:

```text
.plan/<topic>/plan.nodes.jsonl
.plan/<topic>/plan.edges.jsonl
```

Plans include ordered phases, dependencies, task checklists, validation items, exit criteria, risks, and handoff guidance.

### `implement`

Executes `.plan/<topic>/plan.md` one phase at a time:

1. scout context
2. worker edits
3. quality gates until green
4. reviewer validation
5. phase checklist/status updates
6. conventional commit
7. next phase

Unknown design/product/tooling blockers stop for user direction.

## Development checks

Install Python dev tooling:

```bash
python -m pip install -r requirements-dev.txt
```

Run the full check suite:

```bash
npm run check
```

Available checks:

```bash
npm run check:scripts   # Python bytecode compile check
npm run lint:py         # Ruff lint
npm run format:check    # Ruff format check
npm test                # stdlib unittest suite
npm run format:py       # apply Ruff formatting
```

The Python helper scripts remain runtime dependency-free; Ruff is only a development tool.

## Package manifest

This repository declares its pi resources in `package.json`:

```json
{
  "pi": {
    "skills": ["skills"]
  }
}
```
