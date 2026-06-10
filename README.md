# Pi Cartographer

_Mapping Your Project and Plotting Your Feature's Path Forward_

![Pi Cartographer logo](assets/pi-cartographer.png)

Pi Cartographer is a graph-grounded planning package for [pi](https://pi.dev). It helps you turn a rough request into:

1. A proposal grounded in the understanding of your codebase and context aware research
2. An ordered implementation plan
3. Implementation with phase-by-phase code changes that must pass validation

It bundles pi skills plus a small extension that registers deterministic helper tools. Durable planning notes live under `.plan/` so decisions can be reviewed, resumed, and committed with the code they explain.

_pi-cartographer is currently in active development and may not be production ready yet_

## Table of contents

- [Install](#install)
- [Requirements](#requirements)
- [What this package includes](#what-this-package-includes)
- [Quick start](#quick-start)
  - [Create a proposal](#create-a-proposal)
  - [Create a plan](#create-a-plan)
  - [Implement a plan](#implement-a-plan)
- [Planning dashboard](#planning-dashboard)
- [What gets written](#what-gets-written)
  - [JSONL graph artifacts](#jsonl-graph-artifacts)
- [Retrieval scopes](#retrieval-scopes)
- [Artifact lifecycle](#artifact-lifecycle)
- [Helper CLI reference](#helper-cli-reference)
- [Limitations and safety notes](#limitations-and-safety-notes)
- [Development](#development)

## Install

```bash
pi install npm:pi-cartographer
```

Other install options:

```bash
pi install git:github.com/GenKerensky/pi-cartographer
pi install /path/to/pi-cartographer
pi -e /path/to/pi-cartographer   # one-off local use
```

## Requirements

- **pi** with package/skill/extension support.
- **Python 3.11+** for the bundled indexer and validation scripts. Runtime Python helpers use only the standard library.
- **Modern Node.js** for the TypeScript JSONL helper and extension wrapper. Node 22+ is recommended because the helper CLI examples use `node --experimental-strip-types`.
- **[pi-subagents](https://pi.dev/packages/pi-subagents?name=sub+agents)** is recommended for the full delegated workflow. Without it, Cartographer skills can ask to continue serially with the current agent, but fallback is not automatic and requires user approval.

## What this package includes

| Resource                  | Type               | What it does                                                                                                                                                                                        |
| ------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index-project`           | Skill + Python CLI | Builds and queries a shared SQLite + FTS5 project graph under `.plan/_index/`.                                                                                                                      |
| `proposal`                | Skill              | Creates `.plan/<topic>/proposal.md` plus project map and research fact JSONL artifacts.                                                                                                             |
| `plan`                    | Skill              | Converts proposal/map/fact context into ordered phases, validations, and plan graph JSONL artifacts.                                                                                                |
| `implement`               | Skill              | Executes an existing plan phase-by-phase with deterministic context, `cartographer-pathfinder` phase edits, quality gates, `cartographer-auditor` approval, plan updates, and conventional commits. |
| `dashboard`               | Skill              | Starts, opens, checks, or stops the local read-only planning dashboard through the packaged `cartographer-dashboard` CLI.                                                                           |
| `cartographer_index`      | Extension tool     | Wraps index actions such as `ensure`, `query`, `context`, `read`, `slice-jsonl`, `status`, and `log-miss`.                                                                                          |
| `cartographer_jsonl`      | Extension tool     | Wraps JSONL actions such as `validate-topic`, `validate-file`, `validate-misses`, `list-misses`, `list`, `upsert`, and `seed-pi-facts`.                                                             |
| `cartographer_evidence`   | Extension tool     | Imports/list private proposal artifacts under `.plan/_private/<topic>/` without exposing raw contents and writes commit-safe evidence manifests.                                                    |
| `cartographer_session`    | Extension tool     | Analyzes authorized Pi session JSONL into compact Markdown/JSON reports without exposing raw transcript contents.                                                                                   |
| `cartographer_artifacts`  | Extension tool     | Provides read-only compact summaries for topic validation, fact citations, receipts, context packs, evidence manifests, and phase acceptance handoffs.                                              |
| `cartographer_validation` | Extension tool     | Parent-owned wrapper for validation commands and compact receipt output; it does not replace semantic auditor review.                                                                               |
| `cartographer_adr`        | Extension tool     | Evaluates, drafts, creates, imports, validates, searches, and relates Architecture Decision Records.                                                                                                |
| `cartographer-dashboard`  | CLI                | Runs the local loopback-only dashboard server and serves the React/Tailwind/shadcn planning UI for proposal, plan, graph, receipt, evidence, health, and document review.                           |

Skill commands are available as `/skill:<name>` when pi skill commands are enabled.

## Cartographer subagents

Project-scoped Cartographer agents live under `.pi/agents/` and are intentionally narrow. They consume context packs, receipts, map/fact artifacts, and deterministic validation results; they are not a replacement for tool validation or parent orchestration.

| Agent                     | Purpose                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `cartographer-archivist`  | Compresses missing research into source-backed fact/source/support JSONL suggestions. |
| `cartographer-drafter`    | Drafts proposal or plan artifacts from compact map/fact/context inputs.               |
| `cartographer-pathfinder` | Implements one approved phase as the single writer, without committing.               |
| `cartographer-auditor`    | Performs semantic review after deterministic validation receipts pass.                |
| `cartographer-compass`    | Advises on scope, dependency, phase-order, or repeated-failure decisions.             |
| `cartographer-redactor`   | Sanitizes authorized private artifacts into commit-safe evidence analyses.            |

Do not add default Cartographer clones of generic `scout`, `delegate`, or `context-builder` roles without a new measured proposal. Built-in subagents remain explicit fallbacks when a Cartographer-specific agent is unavailable or the user approves substitution.

Workflow contracts for delegated runs:

- Run deterministic validation receipts first, then use `cartographer-auditor` as the default proposal, plan, phase, and final semantic gate. Auditor fallback to built-in reviewer/oracle or serial review must be user-approved and recorded as an explicit fallback receipt.
- Use `cartographer-pathfinder` as the default phase writer for implementation. Every non-trivial phase handoff requires structured acceptance: exact checklist IDs, validation IDs, scope boundaries, changed-files evidence, commands/receipt requirements, residual risks, and stop rules.
- Record timeout/fallback receipts for child timeouts, unavailable tools, fallback substitutions, and repeated unusable handoffs. After repeated child failures, ask `cartographer-compass` for an escalation recommendation before substantial parent takeover.
- Apply a least-privilege child tool policy. Children receive only role-specific artifact paths and tool actions; the parent keeps canonical JSONL, private input, ADR, receipt, checkoff, commit, and orchestration authority unless a structured acceptance contract scopes a specific writer task.

Final role/tool matrix:

| Role                                              | Default tools/context                                                                                                                 | Parent-owned boundaries                                             | Example handoff evidence                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `cartographer-archivist` / `cartographer-drafter` | `cartographer_artifacts` fact/context summaries, `cartographer_index` query/read, sanitized evidence docs                             | Canonical JSONL upserts and receipt writes unless explicitly scoped | Fact citation summary, context-pack path, draft JSONL suggestions                                   |
| `cartographer-pathfinder`                         | Focused context pack, helper summary paths, `cartographer_index` reads/searches, scoped edit tools                                    | Commits, staging, final checkoff, ADR writes, unrelated phase files | Structured acceptance report with changed files, commands, validation IDs, no-staged-files evidence |
| `cartographer-auditor`                            | Deterministic validation receipts, `cartographer_artifacts` receipt/context/validation summaries, targeted `cartographer_index` reads | Read-only: no plan edits, no checkoff, no receipt/ADR mutation      | PASS/FAIL receipt at a deterministic path with required corrections if any                          |
| `cartographer-compass`                            | Receipt/context summaries, proposal/plan references, validation failure summaries                                                     | Decision advice only; user/parent chooses scope/order changes       | Escalation recommendation before parent takeover                                                    |
| `cartographer-redactor`                           | Authorized raw private paths only when explicitly scoped; `cartographer_session` for authorized sessions                              | No proposal/plan decisions; sanitized outputs only                  | `.plan/<topic>/evidence/*-analysis.md` and safe manifest entries                                    |

Examples:

```text
Auditor gate: after `npm run check` and topic/graph validation receipts pass, ask `cartographer-auditor` to review the current diff using `.plan/<topic>/context-packs.jsonl:<context-id>`, `.plan/<topic>/receipts.jsonl:<validation-ids>`, and a deterministic output receipt such as `.plan/<topic>/auditor-final-receipt.md`. The auditor returns PASS/FAIL and remains read-only.
```

```text
Pathfinder acceptance: include phase ID, exact checklist IDs, validation IDs, allowed files, context-pack path, helper summary paths, stop rules, and evidence fields (`changed-files`, `commands-run`, `validation-output`, `residual-risks`, `diff-summary`, `no-staged-files`). The pathfinder edits only the scoped phase and does not commit or stage.
```

```bash
# Read-only artifact helper summaries for child handoffs; these summarize, not mutate.
cartographer_artifacts({"action":"show-record","root":"$PWD","topic":"<topic>","artifact":"context-packs","id":"<context-id>"})
cartographer_artifacts({"action":"receipt-summary","root":"$PWD","topic":"<topic>","limit":10})
cartographer_artifacts({"action":"validate-topic-summary","root":"$PWD","topic":"<topic>"})
```

```jsonl
{
  "id": "receipt:P2:timeout-fallback:2026-06-08T12:00:00Z",
  "type": "fallback-receipt",
  "phase_id": "P2",
  "child": "cartographer-pathfinder",
  "attempt_count": 2,
  "failure": "timeout after 600000ms",
  "control": {
    "async": true,
    "timeoutMs": 600000
  },
  "fallback_approved": "user-approved serial repair",
  "compass_recommendation": "safe to continue with scoped docs-only fix",
  "outcome": "continued",
  "residual_risk": "semantic auditor still required"
}
```

## Quick start

Start pi from the repository you want to plan against, then run the workflow as needed:

```mermaid
flowchart TD
  A[User request] --> B[proposal]
  B --> C[.plan/topic/proposal.md]
  C --> D[plan]
  D --> E[.plan/topic/plan.md]
  E --> F[implement]
  F --> G[Validated phase commits]
```

### Create a proposal

```text
/skill:proposal Add offline search to the docs site
```

Creates `.plan/<topic>/proposal.md` plus supporting map/fact JSONL files.

Use this when the work needs design, scope, tradeoff, or rationale before coding.

### Create a plan

```text
/skill:plan offline search
```

Creates `.plan/<topic>/plan.md` with ordered phases, dependencies, checklists, validation steps, and machine-readable plan graph files.

Use this after a proposal exists, or when the request is already clear enough to plan directly.

### Implement a plan

```text
/skill:implement offline search
```

Runs an existing plan one phase at a time:

```mermaid
flowchart TD
  A[Select next phase] --> B[Gather focused context]
  B --> C[cartographer-pathfinder scoped edits]
  C --> D[Run deterministic checks and receipts]
  D -->|fail| C
  D -->|pass| E[cartographer-auditor semantic gate]
  E -->|needs fixes| C
  E -->|approved| F[Update plan artifacts]
  F --> G[Conventional commit]
```

Non-trivial implementation handoffs use structured acceptance for the pathfinder task before edits start, and `cartographer-auditor` reviews only after deterministic validation receipts pass. If a phase hits an unclear product, design, dependency, repeated timeout/fallback, or tooling decision, Cartographer records the receipt, uses `cartographer-compass` when escalation is needed, and stops to ask for direction.

## Planning dashboard

The dashboard is a local, loopback-only, read-only browser view over Cartographer artifacts. It reads proposal/plan/fact/map/receipt/context/evidence/ADR/index files and never writes `.plan/`, ADRs, index/cache files, or source files.

Start it from the project you want to inspect:

```bash
cartographer-dashboard start --root "$PWD" --host 127.0.0.1 --port 0 --json
```

Start with a topic deep link:

```bash
cartographer-dashboard start --root "$PWD" --topic planning-dashboard --host 127.0.0.1 --port 0 --json
```

Check status or stop the server:

```bash
cartographer-dashboard status --root "$PWD" --json
cartographer-dashboard stop --root "$PWD" --json
```

You can also ask pi to use the packaged skill:

```text
/skill:dashboard start planning-dashboard
/skill:dashboard status
/skill:dashboard stop
```

Dashboard behavior and safety boundaries:

- The server defaults to loopback and rejects non-loopback hosts such as `0.0.0.0`, `::`, and LAN/public addresses.
- Runtime metadata is stored under `XDG_RUNTIME_DIR` or an OS temp directory, keyed by repository root hash, not under `.plan/`.
- Live reload watches safe `.plan/**` files, excludes `.plan/_private/**`, and summarizes `.plan/_index/**` changes as stale-index events.
- The UI uses React, Tailwind CSS, shadcn/ui components, Shiki document/code highlighting, and React Flow graph visualization.
- Private raw evidence should be imported through Cartographer private-artifact workflows and reviewed via sanitized evidence documents, not read directly in the dashboard or skill.

In a source checkout, build client assets before package-like smoke checks or npm packaging:

```bash
npm run dashboard:build
```

## What gets written

Cartographer writes planning artifacts under `.plan/` in your project. Depending on which skills have run, a topic can contain:

```text
.plan/<topic>/proposal.md
.plan/<topic>/plan.md
.plan/<topic>/map.nodes.jsonl
.plan/<topic>/map.edges.jsonl
.plan/<topic>/facts.nodes.jsonl
.plan/<topic>/facts.edges.jsonl
.plan/<topic>/plan.nodes.jsonl
.plan/<topic>/plan.edges.jsonl
.plan/<topic>/receipts.jsonl
.plan/<topic>/context-packs.jsonl
```

When ADR generation is required and final validation has passed, Cartographer may also write ADR artifacts outside `.plan/` using the repository's existing ADR/decisions folder or the fallback `docs/adr/`:

```text
docs/adr/0001-<slug>.md
docs/adr/_graph/adr.nodes.jsonl
docs/adr/_graph/adr.edges.jsonl
```

These topic artifacts and ADR Markdown files are intentional rationale. Review and commit them when they explain the work.

### Private inputs and sanitized evidence

Some proposals need private logs, error dumps, transcripts, screenshots, exports, or documents as source material. Raw private inputs belong under the ignored private area, not in committed proposal artifacts:

```text
.plan/_private/<topic>/
.plan/_private/_inbox/<id>/
```

Use `.plan/_private/<topic>/` after the topic is known. Use `_inbox` only as temporary pre-topic staging. These files are raw/sensitive, should not be committed, and must not be indexed or cited as direct fact sources.

Commit-safe summaries of private inputs belong under the topic evidence folder:

```text
.plan/<topic>/evidence/
.plan/<topic>/evidence/manifest.jsonl
.plan/<topic>/evidence/<artifact-id>-analysis.md
```

Evidence analyses should summarize useful findings, relationships, counts, timelines, and redacted examples while omitting secrets, PII, raw stack traces, request/response bodies, private document text, and enough adjacent context to reconstruct sensitive values. Facts derived from these analyses should cite source nodes with `source_kind: sanitized_evidence` and references to `.plan/<topic>/evidence/*.md`, never raw `.plan/_private/**` files.

The private manifest `.plan/_private/<topic>/manifest.private.jsonl` may contain detailed provenance and optional hashes, but it is ignored. The commit-safe `evidence/manifest.jsonl` may store safe basenames by default; use redacted or opaque IDs when names are sensitive or collide. Raw file hashes are opt-in for reproducibility and should not be written by default.

### Architecture Decision Records

ADR support is deliberately small and metadata-gated:

- Proposal and plan workflows record `adr_required`, `adr_reason`, `adr_options_status`, and `adr_tool_mode`.
- Implementation finalization creates ADRs only after deterministic validation evidence exists, or records an `adr-not-required` receipt when skipping.
- `cartographer_adr` supports workflow-generated ADRs, standalone/manual ADR creation, legacy imports, relationship edges, current-first lookup, and validation.
- ADR directory discovery prefers an existing ADR/decisions folder and falls back to `docs/adr/`.
- ADR Markdown in `docs/adr/*.md` is ordinary documentation and is searchable through `cartographer_index` in `code`/`all` scopes. ADR graph JSONL under `<adr-dir>/_graph/` is managed by `cartographer_adr query/show/validate`, not broad JSONL indexing.
- Legacy imports may omit validation receipts only when explicitly marked legacy and accompanied by an import note.
- ADR content must cite sanitized evidence docs or validation receipt IDs, never raw `.plan/_private/**` paths.

### Clean Context Contract

Cartographer tools and skills should keep the chat as a control surface, not as the workflow database. LLM-facing tool results and subagent handoffs should use a compact Clean Context Contract:

```json
{
  "summary": "Short human-readable result.",
  "references": [{ "path": "skills/example.md", "start_line": 1, "end_line": 20 }],
  "counts": { "matches": 12, "omitted": 9 },
  "token_estimate": 1200,
  "truncated": true,
  "full_output_path": "/tmp/pi-cartographer-runs/<id>.log",
  "verification": { "read": [], "rg": [], "validation": [] },
  "next_actions": ["read skills/example.md:1", "run targeted validation"]
}
```

Defaults:

- Normal LLM-facing output should fit within about **8KB**.
- Expanded diagnostics should fit within about **16KB**.
- Larger command/query output should be written to `/tmp/pi-cartographer-runs/` by default and represented inline by a compact receipt.
- `.plan/_runs/` may be used only as an explicitly ignored local replay area; raw run logs, full command output, raw sessions, and private artifacts must not be committed.
- Direct CLI commands may remain raw/debug-friendly for humans and scripts, but Pi extension tool responses should summarize by default unless a caller explicitly requests raw output or an `outputPath`.

Workflow state should be checkpointed in small JSONL records instead of relying on transcript continuity:

```text
.plan/<topic>/receipts.jsonl
.plan/<topic>/context-packs.jsonl
```

Example receipt:

```jsonl
{
  "id": "receipt:P2:validation:2026-06-07T05:40:00Z",
  "type": "validation-receipt",
  "phase_id": "P2",
  "status": "passed",
  "changed_files": [
    "skills/index-project/scripts/index_project.py"
  ],
  "commands": [
    {
      "command": "npm run test:py",
      "result": "passed",
      "duration_ms": 1516
    }
  ],
  "summary": "Targeted Python tests passed.",
  "full_output_path": "/tmp/pi-cartographer-runs/p2-test.log",
  "verified": true,
  "verification": {
    "validation": [
      "npm run test:py"
    ]
  }
}
```

Example context pack:

```jsonl
{
  "id": "context:P2:implementation",
  "type": "context-pack",
  "phase_id": "P2",
  "budget_tokens": 3000,
  "references": [
    "skills/index-project/scripts/index_project.py:949"
  ],
  "summary": "Only index output shaping and related tests are needed for this phase.",
  "candidate_files": [
    "extensions/cartographer-tools.ts"
  ],
  "verified_files": [
    "skills/index-project/scripts/index_project.py"
  ],
  "open_questions": []
}
```

Oversized-output receipts should include `summary`, `counts`, `truncated`, `maxOutputChars`, `token_estimate`, `full_output_path`, and `next_actions`. Validation receipts should include the command, exit code/result, duration, changed-file hash set when available, summarized output or first failure block, and the validation IDs satisfied. Timeout/fallback receipts should include the child/tool attempted, attempt count, timeout or failure summary, control fields used when available, fallback approved, `cartographer-compass` recommendation for repeated child failures, outcome, and residual risk.

### JSONL graph artifacts

The `.jsonl` files are graph artifacts written as one JSON object per line. Cartographer creates them while it plans:

1. It indexes the current project and searches for relevant files, symbols, docs, dependencies, and snippets that mention tests or commands.
2. During proposal/planning, it records source-backed facts when research or local documentation evidence is needed.
3. It links everything as graph nodes and edges so later phases can reuse evidence instead of rediscovering the project.

```mermaid
flowchart TD
  request[Request] --> map[Map project context\nmap.nodes/edges.jsonl]
  request --> facts[Research facts\nfacts.nodes/edges.jsonl]
  map --> proposal[Ground recommendations\nproposal.md]
  facts --> proposal
  proposal --> plan[Build phase plan\nplan.nodes/edges.jsonl]
  map --> plan
  facts --> plan
  plan --> implement[Implement phases with focused evidence]
```

| Artifact                                  | What it stores                                                                     | How it is used                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `map.nodes.jsonl` / `map.edges.jsonl`     | Relevant project files, symbols, docs, dependencies, and relationships             | Grounds proposal recommendations in the current codebase and gives planning reusable file/symbol context. |
| `facts.nodes.jsonl` / `facts.edges.jsonl` | Research findings, sources, constraints, risks, tools, and `supported_by` evidence | Grounds proposal recommendations in source-backed facts and keeps design choices traceable.               |
| `plan.nodes.jsonl` / `plan.edges.jsonl`   | Phases, tasks, validations, dependencies, and references                           | Turns the grounded proposal into ordered implementation work and validation checks.                       |

Generated cache/index files are different:

```text
.plan/_index/
```

`.plan/_index/` is a local SQLite/FTS search cache built from the current checkout. You usually do **not** run `index-project` manually; the skills refresh and query it as needed.

```mermaid
flowchart TD
  code[Current project files] --> index[.plan/_index local search cache]
  index --> proposal[proposal: find relevant files and seed the map]
  index --> plan[plan: confirm files, tests, commands, and constraints]
  index --> implement[implement: gather focused context for the active phase]
  proposal --> artifacts[Committed .plan/topic rationale artifacts]
  plan --> artifacts
  implement --> artifacts
```

Cartographer treats the index as a fast lookup aid, not as durable rationale:

- The skills rebuild it from the current working tree when it is missing or stale.
- They use it to find candidate files, symbols, docs, tests, commands, and prior plan artifacts.
- Important candidates still need verification with direct reads, focused `rg`, or validation commands.
- `.plan/_index/` is generated, ignored, and should not be committed. The indexer attempts to add it to the target project's `.gitignore`.
- `.plan/_private/` is raw/private input storage, ignored, excluded from all retrieval scopes, and should not be committed. The indexer attempts to keep it ignored alongside `.plan/_index/`.
- `.plan/<topic>/evidence/` contains sanitized, commit-safe evidence and is included in explicit `plans` scope retrieval.

Retrieval miss notes may be written here:

```text
.plan/_retrieval/misses.jsonl
```

These are concise records of material searches that missed, including unresolved misses when known. They help improve future retrieval without storing raw snippets or secrets.

## Retrieval scopes

Cartographer keeps source-code search separate from planning-rationale search.

| Scope   | Meaning                                                                                | Use when                                                               |
| ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `code`  | Project code/docs/config, excluding `.plan/` rationale                                 | Default for implementation and code discovery.                         |
| `plans` | Committed `.plan/` proposals, plans, facts, maps, sanitized `evidence/`, and miss logs | Checking prior decisions, sanitized evidence, or historical rationale. |
| `all`   | Both code and planning rationale                                                       | Architecture review or migration work.                                 |

Index results are **candidates**, not proof. Important matches should be verified with direct reads, focused `rg`, or validation commands before they are cited or edited.

## Artifact lifecycle

Planning artifacts may use these lifecycle states:

```mermaid
stateDiagram-v2
  state "in-progress" as in_progress
  [*] --> draft
  draft --> accepted
  accepted --> planned
  planned --> in_progress
  in_progress --> implemented
  accepted --> superseded
  planned --> superseded
  implemented --> stale
  superseded --> [*]
  stale --> [*]
```

Use them as freshness hints:

- `draft` — not yet validated.
- `accepted` — proposal/rationale accepted.
- `planned` — implementation plan exists.
- `in-progress` — work has started.
- `implemented` — work completed, ideally with commit evidence.
- `superseded` — replaced by newer rationale.
- `stale` — may no longer match current code or facts.

Older `.plan/` topics may not have lifecycle metadata. Treat them as historical context until revalidated.

## Helper CLI reference

Most users can ignore these. They are useful for debugging, direct scripting, or running Cartographer outside pi.

```bash
# Ensure or refresh the index only when stale
python skills/index-project/scripts/index_project.py ensure --root "$PWD" --json

# Show index status and counts
python skills/index-project/scripts/index_project.py status --root "$PWD" --json

# Search current code/docs/config
python skills/index-project/scripts/index_project.py query --root "$PWD" --scope code --topic "search UI" --json

# Search prior planning rationale
python skills/index-project/scripts/index_project.py query --root "$PWD" --scope plans --topic "search UI" --json

# Produce compact context blocks with verification hints
python skills/index-project/scripts/index_project.py context --root "$PWD" --scope code --topic "search UI" --json

# Produce a compact repo-map synopsis and run safe fixed-string search
python skills/index-project/scripts/index_project.py repo-map --root "$PWD" --scope code --topic "search UI" --max-tokens 1500 --json
python skills/index-project/scripts/index_project.py search --root "$PWD" --pattern "--flag-like text" --path "README.md" --json

# Read indexed metadata for a file or node
python skills/index-project/scripts/index_project.py read --root "$PWD" --path "README.md" --json
python skills/index-project/scripts/index_project.py read --root "$PWD" --node-id "file:README.md" --json

# Create starter map JSONL for a topic
python skills/index-project/scripts/index_project.py slice-jsonl --root "$PWD" --topic "search UI" --out-dir ".plan/search-ui"

# Optional raw JSON slice for debugging/offline review
python skills/index-project/scripts/index_project.py slice --root "$PWD" --topic "search UI" --out "/tmp/search-ui.graph.json"

# Log a material retrieval miss
python skills/index-project/scripts/index_project.py log-miss --root "$PWD" --workflow plan --topic "search UI" --original-query "search component" --failure-type vocabulary_mismatch --resolution unresolved --json

# Import/list private proposal artifacts without parent-context inspection
python skills/plan/scripts/private_artifacts.py import --root "$PWD" --topic "support-case" --input "/tmp/private-log.txt" --json
python skills/plan/scripts/private_artifacts.py list --root "$PWD" --topic "support-case" --json

# Analyze an authorized Pi session JSONL into commit-safe summaries.
# Private sessions should be imported through private_artifacts.py first, then analyzed into .plan/<topic>/evidence/ or another commit-safe report path.
python skills/plan/scripts/analyze_session.py --input "/tmp/session.jsonl" --out ".plan/support-case/evidence/session-analysis.md" --json-out ".plan/support-case/evidence/session-analysis.json" --json

# Compute lightweight workflow benchmark metrics from receipts/context packs and optional session summary JSON
python skills/plan/scripts/workflow_benchmark.py --root "$PWD" --topic "support-case" --json

# Evaluate or manage Architecture Decision Records
python skills/plan/scripts/adr_records.py evaluate --root "$PWD" --topic "search-ui" --json
python skills/plan/scripts/adr_records.py draft --root "$PWD" --topic "search-ui" --json
python skills/plan/scripts/adr_records.py create --root "$PWD" --title "Use hosted auth" --decision "Use hosted auth" --context "Login needs OIDC support" --option "Hosted auth" --option "Self-hosted auth" --rationale "Lower operational burden" --domain authentication --keyword auth --json
python skills/plan/scripts/adr_records.py list --root "$PWD" --json
python skills/plan/scripts/adr_records.py query auth --root "$PWD" --json
python skills/plan/scripts/adr_records.py validate --root "$PWD" --json

# Start/check/stop the local read-only planning dashboard
cartographer-dashboard start --root "$PWD" --host 127.0.0.1 --port 0 --json
cartographer-dashboard start --root "$PWD" --topic "search-ui" --host 127.0.0.1 --port 0 --json
cartographer-dashboard status --root "$PWD" --json
cartographer-dashboard stop --root "$PWD" --json

# Validate planning artifacts
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "search-ui" --json
python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic "search-ui" --json

# Produce read-only helper summaries for delegated handoffs
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic-summary --root "$PWD" --topic "search-ui" --json
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts fact-citation-summary --root "$PWD" --topic "search-ui" --json
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts context-pack-summary --root "$PWD" --topic "search-ui" --limit 5 --json
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts receipt-summary --root "$PWD" --topic "search-ui" --limit 10 --json
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts phase-summary --root "$PWD" --topic "search-ui" --phase-id "P2" --json

# Inspect or update JSONL records
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts list --file ".plan/search-ui/map.nodes.jsonl" --json
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts upsert --file ".plan/search-ui/map.nodes.jsonl" --record '{"id":"topic:search-ui","type":"topic","title":"search UI"}' --json
```

`query`, `context`, `repo-map`, `search`, `slice`, and `slice-jsonl` also support repeated/comma-separated filters such as `--path-prefix`, `--exclude`, and `--type` where applicable.

## Limitations and safety notes

- Cartographer is a static planning aid. It uses SQLite + FTS5 + graph edges, not embeddings or runtime tracing.
- The index excludes dependency directories, build outputs, caches, low-signal lockfiles, and files over the configured max size.
- Index/map results are candidate context. Validate important claims against the working tree and actual project commands.
- `implement` requires an existing plan and will stop for missing plans, dirty working trees, unavailable required subagents/substitutes, unclear decisions, missing structured acceptance for non-trivial work, or repeated validation failures.
- Delegated workflows use least-privilege child tool policy: deterministic validation precedes `cartographer-auditor`, `cartographer-pathfinder` is the default scoped phase writer, timeout/fallback receipts are required for fallbacks and repeated child failures, and `cartographer-compass` escalation comes before substantial parent takeover.
- ADR generation is opt-in and metadata-gated: proposals/plans record `adr_required`; implementation finalization should use `cartographer_adr`/`adr_records.py` only after validation evidence exists, or write an explicit `adr-not-required` receipt when skipping.
- Pi packages and extensions run with local user permissions. Review third-party packages before installing them.

## Development

Install dev tools:

```bash
npm install
python -m pip install -r requirements-dev.txt
```

Run checks:

```bash
npm run check
```

Useful individual checks:

```bash
npm run check:scripts
npm run typecheck
npm run lint:py
npm run format:check
npm run test
npm run test:py
npm run test:ts
npm run dashboard:build
npm run dashboard:check
npm run test:browser -- tests/dashboard/client-shell.test.tsx
```
