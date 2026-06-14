# Skill Authoring and Cleanup Discipline

When editing `skills/*/SKILL.md` or bundled skill assets:

- Preserve the existing Cartographer workflow and userflow unless the user explicitly asks for a redesign and the change is backed by proposal/ADR handling.
- Treat skill text as agent-facing operating instructions, not human prose. Keep it terse, specific, and just expressive enough for an LLM to act correctly.
- Use RFC 2119 keywords intentionally: `MUST`/`MUST NOT` for hard safety, wrapper, privacy, validation, and lifecycle requirements; `SHOULD`/`SHOULD NOT` for strong defaults with valid exceptions; `MAY`/`OPTIONAL` only for true choices. Do not uppercase ordinary explanatory prose.
- Add only context the agent lacks: project conventions, exact tools, fragile sequences, gotchas, inputs/outputs, and validation gates. Remove generic explanations, broad best-practice filler, and repeated rationale.
- Prefer defaults over menus. Name the default tool/path first, then mention alternatives only as fallback conditions.
- Keep each skill a coherent unit. If `SKILL.md` approaches about 500 lines or low-frequency detail starts to dominate, move detail to one-level reference files and tell the agent exactly when to read them.
- Keep references one level deep from `SKILL.md`; avoid chains of reference files that require nested discovery.
- Frontmatter descriptions must be concise, specific, and trigger-oriented: describe the user intent/task, include important trigger terms, avoid first person, and avoid over-broad language that fires on near-misses.
- For description changes, create or update a small set of realistic trigger and near-miss prompts when practical, and check that the description would activate only for the intended skill.
- Ground skill changes in real project artifacts, observed workflow failures, ADRs, runbooks, tests, or user corrections. Do not synthesize generic instructions without project-specific evidence.
- Use concrete templates, command blocks, tables, and checklists instead of paragraphs when they reduce ambiguity.
- Match detail to risk: give agents freedom for judgment-heavy review, but use exact commands/scripts for fragile, stateful, or consistency-critical operations.
- Prefer deterministic scripts over English instructions when an operation can be expressed as a repeatable one-line shell/Python/Node command.
- Bundled scripts should be executable by the agent without reading their source. Document invocation in `SKILL.md`; only tell the agent to read a script when the script is intended as reference.
- Script interfaces MUST be non-interactive, support `--help`, emit structured output where useful (`--json` preferred), send diagnostics to stderr, provide actionable errors, use safe/idempotent defaults, support `--dry-run` for destructive/stateful actions, and keep output bounded or write large output to a requested file.
- Pin or document runtime dependencies for one-off tool commands and self-contained scripts. Do not assume unavailable packages or network access.
- For high-stakes or batch operations, use plan-validate-execute: produce a structured plan/intermediate file, validate it with a script, then apply changes only after validation passes.
- Add validation loops for quality-critical skill edits: run the relevant lint/check script, fix failures, and rerun before handoff.
- Skill prose MUST NOT instruct agents to hand-edit, append, or upsert canonical Cartographer JSONL/lifecycle artifacts when a dedicated wrapper exists. Agents MAY read JSONL directly for context; writes MUST go through `cartographer_*` tools or dedicated scripts tied to the artifact/phase/transition.
- If no dedicated wrapper exists for a required JSONL mutation, either add the narrow wrapper/script or document the fallback explicitly with `cartographer_jsonl upsert`, validation, receipt evidence, and residual risk.
- Delegated specialists should receive read-only summaries, artifact paths, receipts, and explicit output contracts. They should propose draft text or record suggestions, not mutate canonical artifacts, unless a structured handoff grants a narrow write scope.
- Keep raw `.plan/_private/**` contents out of skills, prompts, references, examples, receipts, and ADRs. Cite sanitized evidence only.