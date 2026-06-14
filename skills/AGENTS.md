# Skill Authoring Discipline

Scope: applies only under `skills/`. Project-wide testing, state, privacy, and
wrapper rules live in the root `AGENTS.md` and still apply here.

When editing `skills/*/SKILL.md` or bundled skill assets:

- Preserve the existing Cartographer workflow/userflow unless the user asks for
  a redesign and proposal/ADR handling supports it.
- Treat skill text as agent operating instructions, not human prose. Keep it
  terse, specific, and only detailed enough for an LLM to act correctly.
- Use RFC 2119 terms intentionally: `MUST`/`MUST NOT` for hard safety,
  wrapper, privacy, validation, and lifecycle requirements; `SHOULD` for strong
  defaults; `MAY`/`OPTIONAL` for true choices only.
- Add only context the agent lacks: project conventions, exact tools, fragile
  sequences, gotchas, inputs/outputs, and validation gates. Remove generic
  best-practice filler and repeated rationale.
- Prefer defaults over menus. Name the default tool/path first, then mention
  alternatives only as fallbacks.
- Keep each skill coherent. If `SKILL.md` approaches 500 lines or low-frequency
  detail dominates, move detail to one-level reference files and state exactly
  when to read them.
- Keep references one level deep from `SKILL.md`; avoid nested reference chains.
- Frontmatter descriptions must be concise, specific, and trigger-oriented:
  describe user intent/task, include important trigger terms, and avoid
  over-broad language that fires on near-misses.
- For description changes, create/update realistic trigger and near-miss prompts
  when practical, then check that routing stays precise.
- Ground skill changes in project artifacts, observed failures, ADRs, runbooks,
  tests, or user corrections. Do not synthesize generic instructions.
- Prefer templates, command blocks, tables, and checklists over paragraphs when
  they reduce ambiguity.
- Match detail to risk: use exact commands/scripts for fragile, stateful, or
  consistency-critical operations; allow judgment for review-heavy work.
- Prefer deterministic scripts over English instructions when a repeatable
  command can express the operation.
- Bundled scripts should be executable without reading source. Document
  invocation in `SKILL.md`; tell agents to read source only when it is intended
  as reference.
- Script interfaces MUST be non-interactive, support `--help`, emit structured
  output where useful (`--json` preferred), send diagnostics to stderr, provide
  actionable errors, use safe/idempotent defaults, support `--dry-run` for
  destructive/stateful actions, and keep output bounded or file-backed.
- Pin or document runtime dependencies for one-off commands and scripts. Do not
  assume unavailable packages or network access.
- For high-stakes or batch operations, use plan-validate-execute: produce a
  structured plan/intermediate file, validate it, then apply changes only after
  validation passes.
- Add validation loops for quality-critical skill edits: run the relevant
  lint/check script, fix failures, and rerun before handoff.
- Skill prose MUST NOT instruct agents to hand-edit, append, or upsert canonical
  Cartographer JSONL/lifecycle artifacts when a wrapper exists. Agents MAY read
  JSONL directly for context; writes MUST go through `cartographer_*` tools or
  dedicated artifact/phase/transition scripts.
- If no dedicated wrapper exists for a required JSONL mutation, either add a
  narrow wrapper/script or document the fallback with `cartographer_jsonl
upsert`, validation, receipt evidence, and residual risk.
- Delegated specialists should receive read-only summaries, artifact paths,
  receipts, and explicit output contracts. They should propose draft text or
  suggestions, not mutate canonical artifacts, unless a structured handoff
  grants narrow write scope.
- Keep raw `.plan/_private/**` contents out of skills, prompts, references,
  examples, receipts, and ADRs. Cite sanitized evidence only.
