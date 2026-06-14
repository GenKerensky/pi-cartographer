# Context Size Audit Evidence

## Scope

This evidence summarizes a local analysis of the authorized Pi session JSONL named `2026-06-13T18-57-04-915Z_019ec258-4393-710a-8fcf-eeae6912fb0a.jsonl`, current Cartographer skill/rules file sizes, Pi documentation, and external context-engineering research. Raw transcript content is not reproduced.

## Session bloat findings

The session contained 1,199 entries, 3,861,445 bytes, and 6 compaction entries. The largest repeated immediate-context contributors were compaction summaries and full skill injections.

### Compaction entries

| Line | Compaction id | Summary chars | `tokensBefore` |
|---:|---|---:|---:|
| 103 | `05d631c7` | 5,338 | 59,723 |
| 297 | `b07fd11e` | 14,458 | 104,003 |
| 363 | `b05d25ee` | 13,900 | 79,097 |
| 475 | `9418a35e` | 19,673 | 103,811 |
| 1050 | `a129ba14` | 21,112 | 215,002 |
| 1175 | `85dbf451` | 21,988 | 111,772 |

Total compaction-summary text across entries was 96,469 chars. Later summaries stabilized around ~20k+ chars, which is enough to be a material baseline cost after each compaction even before normal system, tool, skill, and project context is added.

### Full skill injections after compaction

| Line | Injected skill | Message chars | Approx tokens at 4 chars/token |
|---:|---|---:|---:|
| 364 | `plan` | 39,007 | ~9,752 |
| 476 | `implement` | 28,119 | ~7,030 |
| 1051 | `implement` | 28,083 | ~7,021 |

The full injected skill messages total 95,209 chars. Two implement invocations repeated nearly the same ~28k chars after compactions. This supports the user-supplied diagnosis that immediate post-compaction bloat is dominated by skill reinjection plus a large summary, not by the index alone.

### Other large repeated context sources in-session

- `AGENTS.md` was read/included repeatedly at ~11,113 chars per occurrence.
- The session analysis found 186 `read` calls, 244 `bash` calls, 122 `cartographer_validation` calls, 117 `cartographer_plan_status` calls, and 55 `cartographer_jsonl` calls.
- Largest non-skill tool/text outputs included a 44,627-char check output, a 36,407-char numbered `AGENTS.md` dump, a 31,951-char `plan/SKILL.md` read, 28,266-char plan-rationale search output, and multiple 20k+ validation/diff outputs.
- Index/query outputs were large later in the session, but the high-cost immediate post-compaction pattern was the combination of compaction summaries, full skill messages, and baseline project/tool instructions.

## Current file-size baseline

Initial baseline before the user's DOX split:

| Path | Chars | Lines | Approx tokens |
|---|---:|---:|---:|
| `AGENTS.md` | 11,115 | 133 | ~2,779 |
| `skills/proposal/SKILL.md` | 47,698 | 441 | ~11,924 |
| `skills/plan/SKILL.md` | 41,377 | 489 | ~10,344 |
| `skills/implement/SKILL.md` | 28,206 | 453 | ~7,052 |
| `skills/index-project/SKILL.md` | 14,136 | 234 | ~3,534 |
| `skills/interview/SKILL.md` | 10,112 | 194 | ~2,528 |
| `skills/design/SKILL.md` | 4,376 | 72 | ~1,094 |
| `skills/requirements/SKILL.md` | 2,740 | 53 | ~685 |
| `extensions/cartographer-tools.ts` | 92,163 | 2,084 | ~23,041 |

`proposal`, `plan`, and `implement` are the largest always-loaded-on-activation Cartographer skills. `extensions/cartographer-tools.ts` is also very large and likely contributes via registered tool schemas and prompt snippets rather than as an ordinary skill body.

Update after the user's DOX split: `AGENTS.md` is now 2,861 chars / 21 lines / ~715 tokens, while the moved skill-authoring rules live in `skills/AGENTS.md` at 4,284 chars / 26 lines / ~1,071 tokens. The proposal should therefore audit both root baseline context and child DOX context loaded when working under `skills/`. The open editor also reports line-length lint warnings in `skills/AGENTS.md`, so cleanup should include readability/lint formatting as well as token budget reduction.

## Pi documentation findings

- Pi skills use progressive disclosure: the system prompt includes available skill names/descriptions, and the agent reads full `SKILL.md` only when a task matches.
- Pi supports `disable-model-invocation: true` to hide a skill from the system prompt when users must invoke it manually.
- Pi compaction preserves a structured summary plus recent messages from `firstKeptEntryId` onward. Repeated compaction summaries can grow because previous summaries are passed as iterative context.
- Pi extension hooks can inspect `systemPromptOptions`, including active tools, tool snippets, context files, and loaded skills. This makes it possible to build instrumentation or prompt-shaping extensions that measure or gate loaded context.
- Pi custom tools appear in the system prompt. A custom tool can provide a short `promptSnippet`; if omitted, custom tools are omitted from the default `Available tools` section, though provider-level tool schemas may still be available to the model depending on active tools.

## External research findings

- The Agent Skills specification recommends progressive disclosure layers: metadata first, `SKILL.md` instructions on activation, and scripts/references/assets only on demand. It recommends keeping main `SKILL.md` content under 500 lines and moving detailed reference material into focused reference files.
- The Agent Skills spec explicitly says the whole `SKILL.md` is loaded once a skill activates, so shortening the main skill file is more effective than only reorganizing headings inside it.
- Anthropic’s advanced tool-use guidance reports that loading large tool libraries up front can consume 55k to 134k tokens, and that on-demand Tool Search reduced one large-tool setup from ~77k tokens to ~8.7k tokens while improving tool-selection accuracy.
- Progressive-disclosure writing guidance consistently recommends: minimal operational core, pointers to details, on-demand retrieval, fewer simultaneously active tools/instructions, and removing repeated/contradictory rules.

## Implications for Cartographer

1. `implement/SKILL.md` should become a compact operating kernel, not a complete runbook. The current ~28k-char activation cost is too high for repeated post-compaction invocation.
2. `plan/SKILL.md` and `proposal/SKILL.md` should receive the same treatment because they are even larger than implement.
3. Root `AGENTS.md` needs a rules audit. Some workflow/tool rules are useful globally, but many are Cartographer-specific and could move into narrower child DOX files, skills, references, or deterministic wrapper behavior.
4. State transition tooling should own fragile sequencing and validation wherever possible. A tool result or state resume can provide the current phase, working set, allowed next command, receipts, and blockers more compactly than prose in `SKILL.md`.
5. Compaction customization should use `.cartographer/<topic>/state.json`, compact context packs, and receipt summaries as source of truth and avoid historical narrative. A target resume payload should fit in a small fixed budget.
6. Tool-definition bloat should be audited separately from skill prose. High-cardinality Cartographer wrappers may need active-tool profiles, command multiplexing, deferred tool discovery, or smaller schemas/snippets.

## Candidate reduction targets

- `skills/implement/SKILL.md`: target <= 8k chars / <= 2k tokens, references for phase gates, validation, auditor handoff, fallback handling, finalization, and commit workflow.
- `skills/plan/SKILL.md`: target <= 10k chars, references for JSONL schemas, validation details, delegation prompts, and failure modes.
- `skills/proposal/SKILL.md`: target <= 10k chars, references for private evidence intake, fact graph schema, delegation prompts, and auditor criteria.
- `AGENTS.md`: target <= 5k chars at root; push skill-authoring details to `skills/AGENTS.md`, Cartographer wrapper discipline to the nearest repo/project child scope, and DOX operating detail to a `docs/dox.md`-style reference if the harness can discover only a pointer.
- Tool schemas: inventory all active built-in, subagent, Context7, and Cartographer wrapper schemas and group them into profiles used by workflow phase.
