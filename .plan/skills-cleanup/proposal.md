# skills-cleanup Proposal

## Description

Clean up the existing Cartographer skill files so agent-facing instructions match the current workflow contract without changing the workflow design or userflow. The cleanup MUST make skill prose shorter, tool-first, script-backed, and consistent with accepted wrapper and single-writer ADRs.

Primary targets:

- `skills/proposal/SKILL.md`
- `skills/plan/SKILL.md`
- `skills/interview/SKILL.md`
- `skills/implement/SKILL.md`
- `skills/index-project/SKILL.md`
- `skills/dashboard/SKILL.md`

## Problem Statement

The skills still contain older prose that tells agents to create, update, append, upsert, or hand-synchronize JSONL and lifecycle artifacts directly. That conflicts with the current Cartographer contract: deterministic workflow mutations must go through wrapper tools when available, and specialist/subagent work should remain read-only unless explicitly scoped. The result is instruction drift: agents may follow stale English instead of the dedicated tools and scripts.

The problem is especially visible in `skills/plan/SKILL.md`, which still says to create or update primary plan artifacts and later to create `plan.nodes.jsonl` / `plan.edges.jsonl`, despite the wrapper-first section that points to `cartographer_plan` and `cartographer_plan_status` [F009]. Similar legacy wording exists in proposal and interview skills [F010] [F011].

## Goals

- MUST preserve the current proposal → optional interview/requirements/design → plan → implement workflow shape.
- MUST preserve the userflow; this is a skill-language/tooling cleanup, not a redesign.
- MUST align skill mutation instructions with ADR-0006 wrapper-first lifecycle gates [F001].
- MUST align delegated/specialist language with ADR-0004 single-writer and read-only specialist boundaries [F002].
- MUST state that agents MAY read JSONL artifacts, but JSONL writes MUST go through dedicated Cartographer tools/scripts tied to the phase, transition, or artifact class.
- MUST replace vague prose with exact tool/script commands when an action is deterministic.
- MUST use RFC 2119 keywords intentionally and sparingly for real requirements [F003].
- SHOULD make `SKILL.md` files terse and move lower-frequency details to one-level references when helpful [F004].
- SHOULD add deterministic lint/validation scripts for skill-language regressions.

## Non-Goals

- MUST NOT change core workflow semantics, lifecycle states, approval gates, or user-facing process ordering.
- MUST NOT remove JSONL artifacts as readable source-of-truth context.
- MUST NOT grant generic subagents broad write authority.
- MUST NOT redesign Cartographer wrappers, schemas, dashboard behavior, or artifact formats except where a narrow helper is needed to eliminate direct JSONL prose.
- MUST NOT convert this into a broad documentation rewrite for humans; skill language is for agents.

## Background

ADR-0006 says proposal, plan, implementation, handoff, transition, validation, state, and ADR mutations must route through deterministic wrappers when available instead of prose-only artifact mutation [F001]. ADR-0004 says the parent/current agent remains the default long-horizon writer, while specialists act as read-only gates and `cartographer-pathfinder` is legacy opt-in only [F002].

Current skill files predate or partially predate those decisions. The plan skill contains both wrapper-first guidance and stale direct creation language for plan JSONL artifacts [F009]. The proposal skill likewise has wrapper-first text but also tells agents to create/refine map/fact JSONL and write findings one at a time [F011]. The interview skill records the intended one-question gate but still describes direct `interview.*.jsonl` upserts, which needs a dedicated tool path or an explicit temporary fallback boundary [F010].

The requested language cleanup should follow agent-skill best practices: include only context the agent lacks, keep `SKILL.md` concise, use progressive disclosure for less common details, and prefer exact scripts for deterministic or fragile operations [F004] [F005]. Skill descriptions should focus on user intent and should be tested against positive and near-miss negative trigger prompts [F007]. Script interfaces should be non-interactive, have concise `--help`, use structured stdout, keep diagnostics on stderr, be idempotent/retry-safe, and bound output [F008].

## Viability

This is viable as a scoped documentation/tooling cleanup. The repository already has deterministic wrapper scripts and validation commands, including `cartographer_workflow.ts`, `manage_jsonl.ts`, `validate_planning_graph.py`, and package scripts such as `npm run check`, `npm run check:scripts`, lint, format, typecheck, dashboard, and test commands [F012]. The implementation can add a small skill-language linter and use focused `rg`/Python checks to catch direct JSONL-write phrasing, stale delegation prompts, oversized skill files, and missing script/tool references.

No new architecture decision is needed because the proposal implements accepted ADR-0004 and ADR-0006 rather than choosing a new workflow architecture [F001] [F002].

## Skill Language Guidelines

Use these as acceptance rules for the cleanup:

1. **Wrapper-first writes**
   - Agents MAY read `.jsonl` files directly for context.
   - Agents MUST NOT hand-edit, append, or upsert lifecycle JSONL artifacts when a dedicated Cartographer wrapper exists.
   - Skill text MUST say `Run <tool/script>` for deterministic writes, status changes, receipts, lifecycle transitions, validation completion, context packs, ADR operations, and handoffs.
   - If a dedicated wrapper is missing for a required JSONL write, the plan MUST either add the narrow wrapper or document an explicit temporary fallback using `cartographer_jsonl upsert` plus validation/receipt evidence.

2. **Single-writer and delegation**
   - The parent/current agent MUST own canonical artifact writes unless a structured contract explicitly scopes otherwise.
   - Specialists SHOULD consume `cartographer_artifacts`, `cartographer_index`, receipts, context packs, and sanitized evidence summaries read-only.
   - Prompts MUST NOT ask `planner`, `researcher`, `scout`, or other generic agents to create/update canonical JSONL files.
   - Delegated agents MAY return suggested records or draft text; parent-owned tooling applies canonical mutations.

3. **RFC 2119 usage**
   - Use uppercase `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`, and `OPTIONAL` only for normative agent requirements.
   - Prefer `MUST` for safety, wrapper, privacy, validation, and lifecycle boundaries.
   - Prefer `SHOULD` for defaults with valid fallback paths.
   - Prefer ordinary lowercase prose for explanatory text.

4. **Terse agent-facing prose**
   - Cut generic explanations the model already knows.
   - Prefer command blocks, tables, compact checklists, and examples over paragraphs.
   - Keep each skill scoped to its activation intent; move low-frequency detail to one-level reference files when the main skill nears the 500-line guidance.
   - Frontmatter descriptions SHOULD state user intent and trigger conditions, then be tested with realistic trigger/non-trigger prompts.

5. **Script-first deterministic actions**
   - Deterministic scans SHOULD be one-line `rg`, `node`, or `python` commands in the skill.
   - Repeated or fragile checks SHOULD become scripts under `skills/*/scripts/` or `skills/plan/scripts/`.
   - New scripts MUST be non-interactive, idempotent where practical, structured-output capable (`--json`), concise under `--help`, bounded in output, and clear about exit codes.

## Scope Gate

- `requirements_required`: false
- `requirements_reason`: The work is a constrained skill-language and validation cleanup that preserves existing workflow/userflow semantics. Topic-local requirements/design artifacts are not needed unless implementation discovers a missing wrapper that changes durable workflow behavior.

## Next Artifacts

Lightweight path: `proposal -> plan -> implement`.

The plan SHOULD include phases for:

1. Inventory and classify stale skill language.
2. Define/refine deterministic skill-language lint checks.
3. Rewrite skill files to wrapper-first, single-writer, RFC 2119, and script-first wording.
4. Investigate delegated-writing prompts against ADR-0004 and remove or reframe contradictions.
5. Add or adjust narrow scripts/wrappers only where needed to avoid direct JSONL-write prose.
6. Validate with targeted skill-language checks plus existing project checks.

## ADR Metadata

- `adr_required`: false
- `adr_reason`: No new durable architecture decision: this proposal cleans existing skill wording to conform to accepted ADR-0004 and ADR-0006 without changing workflow design or userflow.
- `adr_options_status`: not-applicable
- `adr_tool_mode`: evaluate-only
- `adr_override_rationale`: `cartographer_adr evaluate` flagged architecture-significant terms, but the requested work implements existing accepted ADRs rather than selecting a new architecture.

## Design
