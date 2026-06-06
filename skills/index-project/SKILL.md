---
name: "index-project"
description: "Pi Blueprint indexer: build and update a shared .plan/_index/project-graph.sqlite SQLite + FTS5 code/doc graph for LLM planning. Use before proposal planning, file discovery, or topic-scoped project mapping."
version: 2
created: "2026-06-06"
updated: "2026-06-06"
---
# Pi Blueprint Index Project

## When to Use

Use this skill when an agent needs a reusable project-wide code/doc index for planning, proposal writing, or topic-scoped file discovery. It builds or updates a shared SQLite + FTS5 graph artifact under `.plan/_index/` and exposes commands for querying relevant files by topic.

## Artifacts

The index lives in the current project:

- `.plan/_index/project-graph.sqlite` — SQLite database with file inventory, graph nodes/edges, chunks, and FTS5 search.
- `.plan/_index/project-graph-manifest.json` — scan summary, root path, generated timestamp, counts, and index settings.

Do not place topic-specific proposal content inside `.plan/_index/`; proposals should query this shared artifact and write their own slices under `.plan/{topic}/`.

## Procedure

1. **Resolve the project root**
   - Use the current working directory unless the user explicitly asks for another root.
   - Prefer the git root when working inside a repository.

2. **Build or update the index**
   - Resolve `scripts/index_project.py` relative to this `SKILL.md`.
   - Run:

     ```bash
     python <skill-dir>/scripts/index_project.py index --root "$PWD"
     ```

   - The script scans source, config, documentation, and data files; excludes dependency/build/runtime directories and low-signal lockfiles; computes content hashes; updates changed files; removes deleted files; and rebuilds graph edges.

3. **Query the index for a topic**
   - Run:

     ```bash
     python <skill-dir>/scripts/index_project.py query --root "$PWD" --topic "<topic>" --limit 20
     ```

   - Use `--json` for machine-readable output:

     ```bash
     python <skill-dir>/scripts/index_project.py query --root "$PWD" --topic "<topic>" --limit 20 --json
     ```

4. **Export a topic graph slice when useful**
   - Run:

     ```bash
     python <skill-dir>/scripts/index_project.py slice --root "$PWD" --topic "<topic>" --out ".plan/<topic>/map.graph.json" --limit 30
     ```

   - Use this raw slice as the indexed source for proposal/plan-specific map graph artifacts.

5. **Export starter JSONL map graph artifacts when useful**
   - Run:

     ```bash
     python <skill-dir>/scripts/index_project.py slice-jsonl --root "$PWD" --topic "<topic>" --out-dir ".plan/<topic>" --limit 30
     ```

   - This writes:
     - `.plan/<topic>/map.graph.json`
     - `.plan/<topic>/map.nodes.jsonl`
     - `.plan/<topic>/map.edges.jsonl`
   - Treat these JSONL files as starter graph artifacts. Scout/planner passes should still verify, prune, and enrich them for the specific topic.

6. **Filter query/slice results when needed**
   - `query`, `slice`, and `slice-jsonl` support:
     - `--path-prefix <prefix>` to include only paths under a project-relative prefix such as `src` or `docs`
     - `--exclude <glob-or-prefix>` to exclude paths such as `plan/*` or `public/data`
     - `--type <node-type>` to limit graph node types such as `file`, `symbol`, or `doc-section`
   - Options may be repeated or comma-separated.

7. **Use index results during planning**
   - Prefer files and nodes returned by FTS/graph queries over ad-hoc grep for proposal mapping.
   - Expand from high-scoring matches through graph edges such as `imports`, `references`, `defines`, `declares_dependency`, and `contains`.
   - Cite file references from indexed nodes/chunks in proposal artifacts.

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

## Query Semantics

`query` performs FTS5 search over indexed chunks and returns file-level matches with representative snippets. It first favors all-term matches for precision, then blends in any-term matches when needed for recall. It also includes directly connected graph neighbors when relevant.

`slice` writes a JSON graph slice with:

- `topic`
- `generated_at`
- `query_results`
- `nodes`
- `edges`

Pi Blueprint skills may transform this slice into JSONL map graph artifacts, Markdown references, or planner context.

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
- Do not index `.plan/` except for the shared `.plan/_index` output; proposal artifacts should not feed back into the project graph.
- Do not rely only on top FTS matches. Check graph neighbors and high-level config/docs too.
- Do not treat this index as authoritative for dynamic behavior; it is a static planning aid.
- Do not cite a file in a proposal unless it exists in the current checkout.

## Verification

After indexing, verify:

```bash
python <skill-dir>/scripts/index_project.py status --root "$PWD"
python <skill-dir>/scripts/index_project.py query --root "$PWD" --topic "project goals" --limit 5
python <skill-dir>/scripts/index_project.py slice-jsonl --root "$PWD" --topic "project goals" --out-dir "/tmp/project-goals-index-check" --limit 5
```

Success means:

- `.plan/_index/project-graph.sqlite` exists
- `.plan/_index/project-graph-manifest.json` exists
- FTS5 queries return relevant chunks/files
- `slice-jsonl` can write valid `map.graph.json`, `map.nodes.jsonl`, and `map.edges.jsonl`
- status reports nonzero files, nodes, chunks, and FTS rows