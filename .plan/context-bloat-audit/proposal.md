# context-bloat-audit Proposal

## Description

Audit and reduce the persistent context footprint of Pi Cartographer workflows, focusing on the baseline context that appears when agents load root or child `AGENTS.md` files, invoke Cartographer skills, resume after compaction, and receive active tool definitions. The work should turn large always-loaded instructions into compact operating kernels plus on-demand references, and should move fragile workflow sequencing into deterministic state/transition tooling where practical.

## Problem Statement

Recent workflow-session evidence shows that Cartographer implementation work can start or resume with a large context tax before the agent reads task-specific project files. The analyzed session repeatedly injected full workflow skill bodies after compaction, including ~39k chars for `plan` and ~28k chars for `implement`, and later compaction summaries grew to ~20k+ chars [F001][F002]. This creates the “20% instantly used” behavior the user observed and makes long-horizon work more expensive, more fragile, and more likely to bury important current-state instructions.

The current Cartographer skill/rules layout also concentrates too much procedural detail in files that are loaded wholesale on activation or when editing a subtree. The largest workflow skills range from ~28k to ~48k chars, with `proposal`, `plan`, and `implement` each costing thousands of tokens as soon as they are loaded [F003]. The user has already split skill-authoring rules out of the root `AGENTS.md` into `skills/AGENTS.md`; the audit should include this child DOX file as a first-class context source, not just the root rules file [F008]. Pi and the Agent Skills model already support progressive disclosure, but the Cartographer workflow files are not yet taking full advantage of it [F004][F005].

## Goals

- Quantify the baseline context cost of root/project `AGENTS.md`, child DOX files such as `skills/AGENTS.md`, Cartographer skills, loaded skill descriptions, compaction summaries, state-resume context, and active tool definitions.
- Reduce `skills/implement/SKILL.md` to a minimal execution kernel that carries only the rules needed to continue the current state safely.
- Apply the same audit pattern to `skills/plan/SKILL.md`, `skills/proposal/SKILL.md`, and other Cartographer skills that routinely enter workflow context.
- Split low-frequency rules, schemas, examples, fallback paths, and delegation prompt templates into one-level `references/` files loaded only when the active step needs them.
- Move deterministic sequencing, status checks, validation recipes, and resume payload construction from prose rules into wrapper/state-transition tooling where feasible.
- Create a compact post-compaction resume path that prioritizes current topic, phase, next action, working set, receipts, blockers, and a short critical-rule list instead of full historical narrative.
- Audit Cartographer wrapper/tool definitions and active-tool profiles for schema/token overhead, with options for phase-scoped activation, consolidation, shorter schemas/snippets, or deferred discovery.

## Non-Goals

- Do not remove safety, privacy, wrapper-discipline, validation, or lifecycle requirements; relocate or encode them more efficiently.
- Do not redesign Cartographer’s proposal/requirements/design/plan/implement lifecycle unless the audit proves a smaller architecture requires it.
- Do not rewrite all skills in one unbounded pass; use measurable before/after budgets and validate behavior after each workflow family.
- Do not optimize by hiding necessary instructions from the agent without a deterministic tool, state guard, or reference path that preserves correctness.
- Do not commit raw private session contents; evidence should remain sanitized summaries and aggregate metrics.

## Background

The session analysis produced sanitized evidence rather than raw transcript excerpts. It found 1,199 entries, six compactions, and repeated large context sources: full skill injections, repeated `AGENTS.md` reads, large validation/diff outputs, and later index/query outputs. The immediate post-compaction issue was dominated by compaction summary size plus full skill injection [F001][F002]. Since that analysis, skill-authoring rules have been moved from the root `AGENTS.md` into `skills/AGENTS.md`; this improves root baseline size but creates a narrower child context that still needs line-length cleanup, deduplication, and budget review [F008].

Pi’s documented skill model is progressive disclosure: only skill names/descriptions are always available, while full `SKILL.md` content is loaded when relevant, and supporting files are read on demand [F004]. The Agent Skills specification recommends the same layered structure and explicitly advises moving longer details into focused reference files, keeping the main skill body under compact limits [F005].

Pi compaction can be customized by extensions through `session_before_compact`, which can supply a custom summary and details [F006]. That means Cartographer does not need to rely solely on default narrative compaction; it can construct a state-aware resume summary from `.cartographer/<topic>/state.json`, context packs, and receipt summaries.

Tool definitions are a parallel bloat source. Anthropic reports that large tool libraries can consume tens of thousands of tokens up front, and that on-demand tool discovery can reduce tool-heavy context dramatically [F007]. Cartographer’s many wrapper tools and large extension code path should therefore be audited as a separate but related workstream.

## Viability

This is viable because it mostly reorganizes existing instructions and pushes existing deterministic workflow knowledge into places Cartographer already owns: wrapper tools, state files, receipts, context packs, and skill references. The research path is established by the Agent Skills progressive-disclosure pattern [F005], and Pi exposes enough extension/context/compaction hooks to instrument and improve resume behavior [F006].

The riskiest portion is not shrinking prose; it is preserving behavior. Some existing rules are long because they encode hard-won safety and lifecycle constraints. The implementation must therefore use a measure-preserve-validate loop: capture baseline sizes and workflow behavior, split one skill at a time, run skill activation/description checks plus representative proposal/plan/implement dry-runs, and only then remove or relocate duplicated rules.

## ADR Metadata

- `adr_required`: true
- `adr_reason`: The work may change durable Cartographer workflow architecture: skill packaging boundaries, compaction/resume behavior, and active tool/schema loading strategy.
- `adr_options_status`: missing-options-to-be-developed-in-requirements-design
- `adr_tool_mode`: evaluate-now-write-after-validated-design

## Scope Gate

- `requirements_required`: true
- `requirements_reason`: This affects core Cartographer agent workflows, externally visible agent behavior, compaction/resume semantics, skill packaging contracts, and active tool/schema behavior. It needs testable requirements and design alternatives before implementation.

## Next Artifacts

Use the scoped path:

`proposal -> research -> interview skip/targeted questions -> requirements gate -> design gate -> plan -> implement -> ADR finalization -> fold accepted deltas into docs/requirements.md and relevant AGENTS/skill docs`

Expected downstream work:

1. Requirements should define measurable budgets for root `AGENTS.md`, child DOX files including `skills/AGENTS.md`, high-use `SKILL.md` files, reference-file depth, compaction resume payload size, and active tool/schema exposure.
2. Design should compare at least these architecture options:
   - skill-only split into compact kernels plus references;
   - state/tooling-first resume where wrappers emit compact next-action primers;
   - active-tool profile/deferred-tool-discovery strategy for Cartographer wrappers;
   - hybrid approach with phased migration.
3. Plan should sequence the work to preserve behavior: instrument, baseline, split implement, validate implement workflow, split proposal/plan, validate proposal/plan workflows, then address tool schemas and compaction hooks.
4. Implementation should generate an ADR once validated design choices are known.

## Design
