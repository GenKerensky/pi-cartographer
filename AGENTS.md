# Project Agent Instructions

## Testing and Temporary Artifacts

- Tests must never write to or mutate the repository's real `.plan/` directory or other persistent project planning artifacts.
- Always use a mock filesystem, `tempfile`/`mktemp`, or another directory under `/tmp` for test arrange/setup data.
- When a test needs a project layout, scaffold a minimal mock project during the Arrange phase of Arrange/Act/Assert, run the action against that mock root, and assert against files inside the mock root.
- Do not point tests, validation fixtures, or exploratory test commands at `$PWD` if they create `.plan/`, `.plan/_index/`, `.plan/_retrieval/`, cache, database, or generated graph artifacts.
- If a manual verification command would create generated artifacts, run it against a temporary copy/mock project unless the user explicitly asks to modify the real repository artifacts.

## Cartographer State Discipline

- Treat `.plan/<topic>/plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`, `receipts.jsonl`, and `context-packs.jsonl` as authoritative for current planning, validation evidence, and handoff context.
- Read `.cartographer/<topic>/state.json` and `.cartographer/<topic>/journal.jsonl` directly when resuming long-horizon work, but mutate them through `cartographer_state` / `cartographer_state.ts` semantic commands.
- After any direct edit to `.cartographer` state files, run `cartographer state validate` or `node --experimental-strip-types skills/plan/scripts/cartographer_state.ts state-validate --root "$PWD" --topic <topic> --json` before trusting them.
- Append `journal.jsonl` only for important lessons, gotchas, constraints, or phase summaries that should survive compaction; do not store raw logs, routine tool calls, full command output, receipt history, or transcripts.
- Treat `.cartographer/current.json` as a git-ignored local active-topic hint only. It is non-authoritative and safe to delete or ignore when stale.
