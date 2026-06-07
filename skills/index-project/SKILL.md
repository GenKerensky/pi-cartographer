---
name: "index-project"
description: "Pi Cartographer indexer: build and update a shared .plan/_index/project-graph.sqlite SQLite + FTS5 code/doc graph for LLM planning. Use before proposal planning, file discovery, or topic-scoped project mapping."
version: 3
created: "2026-06-06"
updated: "2026-06-07"
---
# Pi Cartographer Index Project

## When to Use

Use this skill when an agent needs a reusable project-wide code/doc index for planning, proposal writing, or topic-scoped file discovery. It builds or updates a shared SQLite + FTS5 graph artifact under `.plan/_index/` and exposes commands for querying relevant files by topic.

## Artifacts

The index lives in the current project:

- `.plan/_index/project-graph.sqlite` — SQLite database with file inventory, graph nodes/edges, chunks, and FTS5 search.
- `.plan/_index/project-graph-manifest.json` — scan summary, root path, generated timestamp, counts, and index settings.

The indexer also ensures `.plan/_index/` and `.plan/_private/` are present in the target project's `.gitignore`, creating `.gitignore` if needed. Topic planning artifacts remain text/JSONL source-of-truth files and are not automatically ignored.

Committed `.plan/<topic>/proposal.md`, `.plan/<topic>/plan.md`, related JSONL rationale artifacts, and sanitized `.plan/<topic>/evidence/` analyses are indexed in the explicit `plans` retrieval scope. They are excluded from the default `code` scope. `.plan/_index/` cache files and raw `.plan/_private/` inputs are never indexed.

Do not place topic-specific proposal content inside `.plan/_index/`; proposals should query this shared artifact and write their own slices under `.plan/{topic}/`.

## Procedure

1. **Resolve the project root**
   - Use the current working directory unless the user explicitly asks for another root.
   - Prefer the git root when working inside a repository.

2. **Ensure the index exists and is fresh**
   - Resolve `scripts/index_project.py` relative to this `SKILL.md`.
   - Prefer `ensure` before reading the database. It checks file hashes and re-indexes only when the index is missing or stale:

     ```bash
     python <skill-dir>/scripts/index_project.py ensure --root "$PWD"
     ```

   - Use `--json` for machine-readable freshness/reindex reports:

     ```bash
     python <skill-dir>/scripts/index_project.py ensure --root "$PWD" --json
     ```

   - Use `index` only when explicitly forcing a normal update/rebuild:

     ```bash
     python <skill-dir>/scripts/index_project.py index --root "$PWD"
     ```

   - The script scans source, config, documentation, and data files; excludes dependency/build/runtime directories and low-signal lockfiles; computes content hashes; updates changed files; removes deleted files; rebuilds graph edges; and ensures `.plan/_index/` is listed in `.gitignore`.

3. **Query the index for a topic**
   - Run source-code retrieval with the default `code` scope:

     ```bash
     python <skill-dir>/scripts/index_project.py query --root "$PWD" --topic "<topic>" --limit 20
     ```

   - Use explicit rationale retrieval only when prior planning artifacts are relevant:

     ```bash
     python <skill-dir>/scripts/index_project.py query --root "$PWD" --scope plans --topic "<topic>" --limit 20
     ```

   - Use `--scope all` only for deliberate source+rationale review. Use `--json` for machine-readable output:

     ```bash
     python <skill-dir>/scripts/index_project.py query --root "$PWD" --scope code --topic "<topic>" --limit 20 --json
     ```

4. **Read indexed file or node context**
   - Use `read` when an agent needs indexed metadata, chunks, and graph edges for a specific file or node without manually walking the repository:

     ```bash
     python <skill-dir>/scripts/index_project.py read --root "$PWD" --path "src/app.ts" --json
     python <skill-dir>/scripts/index_project.py read --root "$PWD" --node-id "file:src/app.ts" --json
     ```

5. **Build compact context blocks when useful**
   - Use `context` when an agent needs a concise package of candidate snippets instead of full query output:

     ```bash
     python <skill-dir>/scripts/index_project.py context --root "$PWD" --scope code --topic "<topic>" --limit 8 --max-tokens 3000 --json
     ```

   - Context blocks merge adjacent/overlapping snippets, deduplicate repeated match intervals, include `candidate`/`verified` labels, and carry verification hints. Treat `verified: false` output as a candidate until direct reads, focused `rg`, or validation commands support it.

6. **Log material retrieval misses when they change the workflow**
   - Append concise miss records with `log-miss`:

     ```bash
     python <skill-dir>/scripts/index_project.py log-miss --root "$PWD" --workflow plan --topic "<topic>" --original-query "<query>" --failure-type vocabulary_mismatch --eventual-hit "src/example.ts:42" --resolution query_expansion
     ```

   - This writes `.plan/_retrieval/misses.jsonl`. Do not log secrets, raw proprietary snippets, or routine empty searches.

7. **Export starter JSONL map graph artifacts when useful**
   - Run:

     ```bash
     python <skill-dir>/scripts/index_project.py slice-jsonl --root "$PWD" --topic "<topic>" --out-dir ".plan/<topic>" --limit 30
     ```

   - This writes:
     - `.plan/<topic>/map.nodes.jsonl`
     - `.plan/<topic>/map.edges.jsonl`
   - Treat these JSONL files as starter graph artifacts. Scout/planner passes should still verify, prune, and enrich them for the specific topic.
   - Do **not** write `.plan/<topic>/map.graph.json` by default. The shared SQLite database is the raw source of truth. Only run `slice --out ".plan/<topic>/map.graph.json"` or pass `slice-jsonl --include-raw-slice` when a portable raw snapshot is explicitly useful for debugging or review.

8. **Filter query/slice results when needed**
   - `query`, `context`, `slice`, and `slice-jsonl` support:
     - `--path-prefix <prefix>` to include only paths under a project-relative prefix such as `src` or `docs`
     - `--exclude <glob-or-prefix>` to exclude paths such as `plan/*` or `public/data`
     - `--type <node-type>` to limit graph node types such as `file`, `symbol`, or `doc-section`
   - Options may be repeated or comma-separated.

9. **Use index results during planning**
   - Prefer files and nodes returned by FTS/graph queries as the durable starting point for proposal and plan mapping.
   - Use focused `rg`/grep alongside the index to verify exact identifiers, filenames, scripts, tests, commands, and error strings, or to fill targeted lexical gaps.
   - Expand from high-scoring matches through graph edges such as `imports`, `references`, `defines`, `declares_dependency`, and `contains`.
   - Cite file references from indexed nodes/chunks in proposal artifacts only after verifying high-impact references with direct reads or focused lexical evidence when needed.

## Database Shape

The script creates these tables:

- `files(path, size, mtime_ns, hash, language, indexed_at)`
- `nodes(id, type, title, description, path, start_line, end_line, hash, metadata)`
- `edges(from_id, to_id, type, evidence_path, evidence_line, confidence, metadata)`
- `chunks(id, node_id, path, start_line, end_line, text, summary, token_count, hash)`
- `chunks_fts` — FTS5 virtual table over chunk path/title/text/summary
- `runs(id, created_at, root, files_seen, files_indexed, files_removed, settings)`

Node IDs are stable and typed, for example:

- `file:src/pages/index.astro`
- `symbol:scripts/build_db.py#build_database:42`
- `doc:AGENTS.md#project-goals`
- `dependency:npm:astro`

## Retrieval Contract

Cartographer separates retrieval into three planned scopes:

- `code` — default source-code retrieval over project code/docs/config. This scope excludes committed `.plan/` rationale artifacts and never treats `.plan/_index/` cache files as source.
- `plans` — explicit rationale retrieval over committed `.plan/<topic>/proposal.md`, `.plan/<topic>/plan.md`, map/fact/plan JSONL, sanitized `.plan/<topic>/evidence/` analyses, and retrieval miss logs.
- `all` — explicit combined retrieval for architecture review, migration, or reasoning across source and rationale.

The scoped query CLI (`--scope code|plans|all`) is implemented for `query`, `context`, `slice`, and `slice-jsonl`. `code` is the default; use `plans` only for explicit rationale retrieval.

`query` performs FTS5 search over indexed chunks and returns file-level **candidate** matches with representative snippets, scope labels, generic-query warnings, and verification hints. Treat query results as candidates: verify high-impact hits with direct file reads and/or the returned `rg` commands before citing them in proposal/plan prose or editing code.

Candidate/verified metadata uses these fields where applicable:

- `candidate`: `true` when a result is plausible but not authoritative.
- `verified`: `true` only when supporting evidence has been recorded.
- `verification.read`: direct file and line-range evidence.
- `verification.rg`: focused lexical commands that support the match.
- `verification.validation`: deterministic validation command evidence.

Retrieval misses that materially slow or change the workflow should be captured as concise JSONL records in `.plan/_retrieval/misses.jsonl`. Miss records should include `failure_type`, `original_query`, `expanded_queries`, `retrieval_modes`, `expected_terms`, `eventual_hit`, `resolution`, and `notes` when known. Do not log secrets, proprietary raw snippets, or routine empty searches.

Raw private proposal inputs under `.plan/_private/**` are excluded from every retrieval scope. If private artifacts are needed for planning, first generate sanitized analysis documents under `.plan/<topic>/evidence/`; those evidence docs can then be retrieved with `scope=plans`.

## Query Semantics

Ranking is lexical-first and GrepRAG-inspired:

- retrieves a larger candidate pool from all-term and any-term FTS queries
- uses BM25 as a tie-breaker rather than the only ranking signal
- boosts exact identifier, filename, title, and symbol/doc-section matches
- deduplicates repeated chunks so duplicate/generated copies do not dominate the top results
- prefers structure-aware chunks split around symbols and Markdown headings where possible
- includes directly connected graph neighbors when relevant

`slice` optionally writes a portable raw JSON graph slice with:

- `topic`
- `generated_at`
- `query_results`
- `nodes`
- `edges`

Pi Cartographer skills should normally use the SQLite database and JSONL map artifacts directly. A raw slice is only a debugging/review snapshot when portability matters.

## Update Behavior

The indexer is hash-based:

- unchanged files are skipped
- changed files have old nodes/chunks/FTS rows replaced
- deleted files are removed from the index
- graph edges are rebuilt from the current scan

For small and medium repositories, this should usually complete in seconds. Embeddings/vector search are intentionally out of scope for this skill; add them only if FTS5 + graph expansion misses relevant context.

## Pitfalls

- Do not index dependency directories such as `node_modules`, `.venv`, `venv`, build outputs, or `.git`.
- Do not index low-signal lockfiles such as `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`; use manifest files like `package.json` for dependency discovery.
- Do not mix `.plan/` rationale into default source-code retrieval; use `--scope plans` for explicit rationale retrieval. `.plan/_index/` cache files and `.plan/_private/` raw inputs remain excluded.
- Do not rely only on top FTS matches. Check graph neighbors and high-level config/docs too.
- Do not treat this index as authoritative for dynamic behavior; it is a static planning aid.
- Do not cite a file in a proposal unless it exists in the current checkout.

## Verification

After indexing, verify:

```bash
python <skill-dir>/scripts/index_project.py ensure --root "$PWD"
python <skill-dir>/scripts/index_project.py status --root "$PWD"
python <skill-dir>/scripts/index_project.py query --root "$PWD" --topic "project goals" --limit 5
python <skill-dir>/scripts/index_project.py read --root "$PWD" --node-id "file:README.md" --json
python <skill-dir>/scripts/index_project.py slice-jsonl --root "$PWD" --topic "project goals" --out-dir "/tmp/project-goals-index-check" --limit 5
```

Success means:

- `.plan/_index/project-graph.sqlite` exists
- `.plan/_index/project-graph-manifest.json` exists
- `.gitignore` contains `.plan/_index/` and `.plan/_private/`
- `ensure` reports the index is fresh after any needed re-index
- FTS5 queries return relevant chunks/files
- `read` returns indexed file/node context from SQLite
- `slice-jsonl` can write valid `map.nodes.jsonl` and `map.edges.jsonl`
- status reports nonzero files, nodes, chunks, and FTS rows