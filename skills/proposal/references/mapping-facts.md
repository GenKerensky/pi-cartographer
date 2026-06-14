# Proposal Mapping and Facts Reference

Read when refreshing index context, mapping project files, or adding research facts.

## Index and map

Use the shared index as the durable project graph:

```bash
python skills/index-project/scripts/index_project.py ensure --root "$PWD" --json
```

Prefer deterministic map generation when map graph files are missing or thin:

```bash
python skills/index-project/scripts/index_project.py slice-jsonl --root "$PWD" --topic <topic> --out-dir .plan/<topic> --limit 30
```

Then validate topic artifacts. Do not create `map.graph.json` by default.

Verify high-impact files, symbols, tests, scripts, and commands with focused `rg`/grep or selective reads before citing them in proposal prose.

Map node/edge guidance:

- nodes should have stable `id`, `type`, `title`, `description`, and useful `reference`/`path`/confidence metadata;
- edges should have `from`, `to`, `type`, and useful evidence/reference/confidence metadata;
- preserve the curated graph shape instead of turning it into a flat grep dump.

Use scout only when deterministic index/map tools plus lexical checks are missing, contradictory, or too broad for safe mapping. Scout returns suggestions only; parent applies accepted changes through deterministic wrappers or receipted fallback.

## Research facts

Seed/reuse existing local Pi/package/subagent facts before new research. Ask for external research only when facts are missing, stale, or insufficient for scope, dependencies, tools, examples, risks, or validation choices.

Every source-backed claim used in proposal prose needs:

- a `fact` node with stable ID such as `F001`;
- a `source` node;
- a `supported_by` edge from fact to source;
- enough source detail for later verification.

Use `cartographer_fact add-source`, `add-fact`, and `support-fact` when available. If unavailable, use a narrow parent-owned `cartographer_jsonl upsert`/script fallback, validate topic artifacts, and record fallback evidence.

Research assertions in `Background` and `Viability` cite fact IDs like `[F003]`.
