# Project Agent Instructions

Scope: this file is project-wide. Put subtree-specific guidance in the nearest
child `AGENTS.md`; skill-authoring rules belong in `skills/AGENTS.md`.

## Testing and Temporary Artifacts

- Tests must never write to or mutate the repository's real `.plan/` directory
  or other persistent planning artifacts.
- Use a mock filesystem, `tempfile`/`mktemp`, or another `/tmp` directory for
  test arrange/setup data.
- When a test needs a project layout, scaffold a minimal mock project during
  Arrange, run the action against that mock root, and assert inside it.
- Do not point tests, validation fixtures, or generated-artifact exploratory
  commands at `$PWD` if they create `.plan/`, `.plan/_index/`,
  `.plan/_retrieval/`, cache, database, or graph artifacts.
- If manual verification would create generated artifacts, use a temp copy/mock
  project unless the user explicitly asks to modify real repo artifacts.

## Cartographer Wrapper and State Discipline

- Route deterministic workflow mutations through Cartographer wrappers when
  available: proposal, fact, plan/status, validation, implement, handoff,
  transition, state, and ADR tools.
- Do not manually append receipts, hand-edit fact/plan status JSONL, or cross
  lifecycle gates as prose-only steps unless a wrapper is unavailable and an
  explicit fallback receipt records the substitute checks.
- After validation receipts, auditor PASS capture, status updates, and the
  phase commit are complete, automatic phase advancement is the default. Use
  human approval only for proposal/plan gates, explicitly human-gated phases,
  final implementation gates, or unresolved user-owned decisions.
- Treat `.plan/<topic>/plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`,
  `receipts.jsonl`, and `context-packs.jsonl` as authoritative for planning,
  validation evidence, and handoff context.
- Read `.cartographer/<topic>/state.json` and `journal.jsonl` directly when
  resuming, but mutate them only through `cartographer_state` or the matching
  script commands.
- After any direct state-file edit, run `cartographer state validate` or
  `node --experimental-strip-types skills/plan/scripts/cartographer_state.ts
state-validate --root "$PWD" --topic <topic> --json` before trusting state.
- Append `journal.jsonl` only for durable lessons, gotchas, constraints, or
  phase summaries that should survive compaction. Do not store raw logs,
  routine tool calls, full command output, receipts, transcripts, or ADRs.
- Treat `.cartographer/current.json` as a git-ignored local hint only; it is
  non-authoritative and safe to delete or ignore when stale.
