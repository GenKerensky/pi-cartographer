# context-bloat-audit Requirements

This requirements delta defines testable behavior for reducing Pi Cartographer context bloat while preserving workflow safety, validation discipline, and resume correctness.

## Interview Decision

Interview is skipped for this phase. The approved proposal, session evidence, file-size measurements, and fact graph resolve the immediate user-owned scope: audit root and child `AGENTS.md`, Cartographer skills, compaction/resume payloads, and active tool definitions. Design may re-enter interview if it exposes a user-owned trade-off that cannot be decided from existing evidence.

## ADDED Requirements

### REQ-CBA-001 — Context inventory and budgets

The workflow must provide a repeatable context inventory for Cartographer agent sessions that measures root `AGENTS.md`, child `AGENTS.md` files such as `skills/AGENTS.md`, active skill descriptions, high-use `SKILL.md` bodies, compaction summaries, state-resume payloads, and active tool/schema exposure [F001] [F002] [F003] [F008].

#### Scenarios

- [SCN-CBA-001] Given the repository checkout, an agent can run a bounded inventory command or script and receive per-source character/token estimates and a sorted top-bloat table.
- [SCN-CBA-002] When a workflow skill or AGENTS.md file is changed, validation reports before/after size deltas against explicit budgets.

#### Acceptance Checks

- [AC-CBA-001] Inventory output includes at least `AGENTS.md`, `skills/AGENTS.md`, `skills/proposal/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, compaction/resume artifacts, and Cartographer tool definitions or active-tool profile estimates.
- [AC-CBA-002] Budget thresholds are documented for root AGENTS.md, child AGENTS.md, high-use skill kernels, reference depth, resume payload, and active tools.

### REQ-CBA-002 — Compact workflow skill kernels

High-use Cartographer workflow skills must be split into compact `SKILL.md` kernels plus one-level on-demand references. The kernel must keep only activation criteria, critical safety rules, execution loop, exact required wrapper sequence, stop conditions, and pointers to references [F003] [F004] [F005].

#### Scenarios

- [SCN-CBA-003] When the `implement` skill activates after compaction, the initially loaded skill body is small enough to preserve working context while still telling the agent how to resume safely.
- [SCN-CBA-004] When a low-frequency fallback, schema, delegation prompt, or example is needed, the kernel points to a specific reference file to read on demand.

#### Acceptance Checks

- [AC-CBA-003] `implement`, `plan`, and `proposal` each have explicit target budgets and must not regress without a documented exception.
- [AC-CBA-004] References remain one level deep from `SKILL.md`; no nested reference chain is required to execute the primary workflow.
- [AC-CBA-005] Existing safety/privacy/wrapper/validation requirements remain reachable through kernel text, deterministic tooling, or named references.

### REQ-CBA-003 — AGENTS.md hierarchy budget and locality

Root and child `AGENTS.md` files must be audited for context locality, duplication, lint/readability, and durable-rule ownership. Root `AGENTS.md` should carry only project-wide rules, while subtree rules such as skill authoring discipline belong in narrower child AGENTS.md files like `skills/AGENTS.md`. The former DOX framework is no longer part of the project instructions, so this requirement concerns ordinary scoped `AGENTS.md` files rather than DOX framework/index mechanics [F008] [F010].

#### Scenarios

- [SCN-CBA-005] When an agent works outside `skills/`, it receives the slim root context without skill-authoring details that do not apply.
- [SCN-CBA-006] When an agent works under `skills/`, it receives the skill-specific child AGENTS.md rules in a compact, lint-clean form.

#### Acceptance Checks

- [AC-CBA-006] The root/child AGENTS.md split is documented with measured before/after sizes and no DOX-framework assumptions.
- [AC-CBA-007] `skills/AGENTS.md` line-length and duplicate-rule warnings are resolved or explicitly justified.
- [AC-CBA-008] Parent/child instruction ownership stays current after rule relocation.

### REQ-CBA-004 — State-aware compaction and resume payloads

Cartographer implementation resume must be driven by compact state, receipt, and context-pack summaries rather than historical narrative or full skill reinjection. A post-compaction resume payload must prioritize topic, current phase, next action, working set, recent validation receipts, blockers, and a short critical-rule list [F001] [F002] [F006].

#### Scenarios

- [SCN-CBA-007] After compaction, the next assistant turn can continue implementation from state-resume data without rereading the full `implement/SKILL.md` unless a detailed reference is needed.
- [SCN-CBA-008] Repeated compactions do not accumulate long historical summaries beyond a fixed budget.

#### Acceptance Checks

- [AC-CBA-009] Resume summary generation has a fixed target size and records when it is truncated or references external state/context packs.
- [AC-CBA-010] State transition tooling exposes the next allowed action and guardrails compactly enough to replace repeated prose instructions.
- [AC-CBA-011] Raw transcript contents are not copied into `.plan/`, ADRs, receipts, or skill docs.

### REQ-CBA-005 — Active tool/schema context control

Cartographer must audit wrapper and extension tools for schema/prompt overhead and define an approach for reducing active tool context. Acceptable approaches include phase-scoped active-tool profiles, consolidated/multiplexed tools, shorter prompt snippets/schemas, or deferred discovery [F007].

#### Scenarios

- [SCN-CBA-009] During proposal/requirements/design work, the agent only sees the Cartographer tools needed for that phase plus core file/edit/shell tools.
- [SCN-CBA-010] During implementation, the agent receives implementation/state/validation tools without unrelated proposal-only schema overhead where feasible.

#### Acceptance Checks

- [AC-CBA-012] Tool inventory reports active tool count and estimated schema/snippet cost by workflow phase.
- [AC-CBA-013] Design compares phase-scoped tools, schema compaction, tool consolidation, and deferred discovery before selecting an implementation path.
- [AC-CBA-014] Tool reductions preserve auditability and do not hide required validation or mutation guardrails.

### REQ-CBA-006 — Behavior-preserving migration and validation

The context-reduction work must proceed through measurable, behavior-preserving phases. Each migration step must validate that proposal, requirements, design, plan, and implement workflows still expose required safety rules, wrapper calls, validations, and human gates [F004] [F005].

#### Scenarios

- [SCN-CBA-011] After splitting a skill, representative workflow dry-runs or fixture tests prove the agent can still find mandatory references and execute the correct wrapper sequence.
- [SCN-CBA-012] If a rule is moved from prose into tooling, tests or deterministic validation prove the tool enforces or emits the corresponding guardrail.

#### Acceptance Checks

- [AC-CBA-015] Plan phases include baseline measurement, one-skill-at-a-time splitting, validation after each split, compaction/resume changes, tool/schema changes, and final regression checks.
- [AC-CBA-016] Any removed rule has a documented new home: kernel, reference, `AGENTS.md` file, deterministic tool, state guard, or deleted-as-duplicate rationale.
- [AC-CBA-017] ADR finalization occurs after design chooses durable architecture for skill packaging, resume behavior, and tool/schema control.

## Durable Fold Targets

Accepted requirements should eventually fold into:

- `docs/requirements.md#context-bloat-audit` for durable product/workflow requirements.
- `AGENTS.md` and `skills/AGENTS.md` for stable scoped instruction locality rules.
- Relevant `skills/*/SKILL.md` kernels and `skills/*/references/*.md` files after implementation.
- ADR records if design selects durable architecture for skill packaging, compaction/resume, or active tool loading.
