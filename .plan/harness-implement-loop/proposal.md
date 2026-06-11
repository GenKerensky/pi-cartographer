# harness-implement-loop Proposal

## Description

Move Cartographer orchestration and artifact mutation from prose-only skills into deterministic, enforceable command/tool wrappers. The core change is that skills should describe intent and UX, while tools/scripts perform state transitions, artifact writes, receipt writes, validation gates, subagent handoffs, and finalization checks [F006][F018].

The initial focus remains implementation execution: a harness-integrated wrapper should own the phase loop, initialize and validate `.cartographer/<topic>/state.json`, drive milestone `compact-generate` / `state-resume` transitions, preserve deterministic receipt and auditor gates, and block misleading final success while executable phases remain pending [F001][F004][F007][F009][F014]. The proposal now also covers the adjacent orchestration surfaces that can break determinism: subagent gates, lifecycle transitions, plan status/checkoff, context packs, generic receipts, proposal finalization, plan finalization, fact/source append, plan graph generation, validation-item completion, and ADR metadata synchronization [F016][F019][F020][F021][F022][F023][F024][F025][F026][F027][F028].

The intended outcome is not another large planning system. `.plan/<topic>/plan.md`, plan JSONL, receipts, and context packs remain authoritative; `.cartographer/` remains compact execution/resume state [F005][F015]. The change is to make Cartographer workflows enforceable at Pi harness boundaries instead of hoping each model follows long Markdown procedures [F006][R001].

## Problem Statement

The sunset-pathfinder work added a state helper, state/resume workflow documentation, and ADR-0004's single-writer state decision [F005][F007]. A real `tanstack-dashboard` implementation session showed that those changes are not sufficient: the branch contained the helper, but the agent made zero `cartographer_state`, `state-init`, `compact-generate`, or `state-resume` calls [F001]. The missing `.cartographer/<topic>/state.json` was not caused by `.gitignore`; the workflow simply never initialized it [F002].

That same session had normal Pi transcript compactions, but those compactions did not create Cartographer state and were easy to confuse with workflow compaction [F003]. The final assistant response reported completion of bookkeeping while later plan phases remained pending [F004]. This is the failure mode the wrapper must prevent: prose guidance can be skipped, and transcript continuity can drift away from durable plan/state artifacts [R001].

## Goals

- Provide a first-class Cartographer implement wrapper command/tool that owns the phase loop: orient, select, narrow, inspect, act, validate, record, compact, continue [F006][F007].
- Provide deterministic wrappers for every high-impact orchestration or artifact mutation currently described only in skills: lifecycle transitions, subagent handoffs, proposal init/finalize, fact/source append, plan graph generation/finalize, plan status/checkoff, validation-item completion, context-pack creation, generic receipt append, and ADR metadata synchronization [F018][F019][F020][F021][F022][F023][F024][F025][F026][F027][F028].
- Provide a deterministic subagent handoff wrapper for read-only Cartographer gates, especially auditor/compass calls, so output capture, report paths, fallback receipts, and retry behavior are standardized instead of left to ad hoc prompts [F014][F016].
- Make `state-init` and `state-validate` mandatory preflight for normal implementation, with an explicit legacy/no-state receipt required for any bypass [F001][F002][F007].
- Drive `state-set-next`, `state-set-working-set`, `state-record-validation-ref`, `compact-generate`, and `state-resume` from wrapper-controlled milestones instead of optional model behavior [F007][F008].
- Integrate with Pi harness capabilities: extension commands, registered tools, lifecycle/context hooks, tool-call blocking, session compaction hooks, and status/notification surfaces where useful [F009][F010][F011].
- Distinguish Pi transcript compaction from Cartographer state compaction and bridge them intentionally: Pi compaction may summarize chat; Cartographer compaction must update/validate `.cartographer` state [F003][F011].
- Add hard finalization guards so an agent cannot produce a final success response while executable phases remain pending unless there is an explicit stop/residual-risk receipt [F004][F013].
- Preserve deterministic validation receipts, read-only auditor gates, and parent ownership of canonical `.plan`/receipt/ADR mutations [F014].
- Keep tests under temp/mock roots and avoid mutating the repository's real `.plan/` or `.cartographer/` artifacts during validation [F008][C001].

## Non-Goals

- Do not replace `.plan` with a second task database or revive `plan.json` [F005][F015].
- Do not make `.cartographer` authoritative for planning, validation history, or checklist truth [F005][F015].
- Do not auto-commit, auto-stage, or silently accept phase completion without deterministic evidence and an auditor/fallback gate [F014].
- Do not remove existing deterministic primitive commands such as `cartographer_state`, `cartographer_index`, `cartographer_jsonl`, `cartographer_validation`, `cartographer_evidence`, or `cartographer_adr`; new wrappers should orchestrate and enforce around them [F007][F018].
- Do not remove the human from major approval points. Instead, make human approval explicit, durable, and tool-mediated through `cartographer_transition approve` for proposal approval, plan approval, and final implementation approval. Normal implementation phases should advance automatically after deterministic criteria pass unless the plan explicitly marks a phase as requiring human approval [F028][F029].
- Do not require a full external orchestrator service for the first iteration. Prefer project-local Pi extension command/tool wrappers for implement execution and subagent handoffs, while leaving room for SDK-level runtime orchestration later [F009][F012].
- Do not implement product-specific TanStack dashboard work in this proposal; that session is evidence for a workflow defect [F001].

## Background

ADR-0004 accepted the parent/current agent as the default long-horizon writer, backed by `.cartographer` state, curated journal memory, milestone compaction, controlled resume context rendering, deterministic receipts, and read-only specialist gates [F005]. The current implementation skill documents these rules and lists the state commands, but it remains Markdown guidance interpreted by the model [F006].

The low-level machinery exists. `cartographer_state.ts` exposes semantic commands for state initialization, validation, next action, working set, validation refs, journal append, current pointer, compact generation, and resume rendering [F007]. Its tests prove those primitives can create and validate `.cartographer` files under temp roots and keep `state-resume` read-only [F008]. The current Pi extension already registers `cartographer_state` as a tool [F007].

The gap is orchestration. Pi supports exactly the harness surfaces this workflow needs: extensions can register commands and tools, intercept lifecycle events, inject context, block tool calls, customize compaction, and persist extension state [F009][F010][F011]. Pi's SDK also exposes lower-level `AgentSession` / runtime APIs for future programmatic runs if an extension-only wrapper is not enough [F012].

A review of the other orchestration skills shows the same pattern beyond implementation. Proposal and plan skills ask the agent to initialize files, append facts, write graph JSONL, mark statuses, create context packs, append receipts, synchronize ADR metadata, and finalize gates through prose. Some low-level primitives already exist, but the multi-artifact transitions are still model-mediated and therefore easy to skip, misorder, or desynchronize [F018].

The subagent report-capture friction points to the same class of problem: Cartographer needs deterministic gates, while the current generic subagents plugin is optimized for broad delegation. That does not yet prove the dependency should be removed. The safer approach is to quarantine it behind a Cartographer-specific handoff API, measure whether deterministic invocation/output capture is achievable, and only then decide whether to patch the plugin or replace it with a Cartographer-native runner [F016][F017].

## Viability

This is viable because the proposal builds on existing code rather than inventing new storage:

- Reuse `cartographer_state.ts` for all state writes and validation [F007].
- Reuse `cartographer_validation` / `validation_runner.py` for deterministic command receipts [F014].
- Reuse `validate_planning_graph.py` and topic validation for finalization checks [F013].
- Add wrapper tests following the existing temp-root state test pattern [F008][C001].
- Use Pi extension APIs already present in the packaged harness docs for commands, hooks, and compaction integration [F009][F011].

The main risk is over-correcting into an opaque orchestrator. The mitigation is to keep the wrapper small, deterministic, and inspectable: it should write compact `.cartographer` state via existing semantic commands, append receipts, expose next action/status, and leave actual code edits to the parent/current agent or a narrowly scoped tool-mediated turn [F015].

## ADR Metadata

- `adr_required`: true
- `adr_reason`: This changes the enforceable boundary of the implementation workflow from prose-only model guidance to a harness-integrated command/tool wrapper. It amends the practical consequences of ADR-0004 and relies on Pi extension/SDK integration points.
- `adr_options_status`: needed
- `adr_tool_mode`: evaluate-and-create-after-validation
- `adr_note`: `cartographer_adr evaluate` initially returned `adr_required: false`, but the proposal intentionally treats this as ADR-worthy because it changes cross-cutting workflow architecture, harness integration boundaries, and the durability guarantees of accepted ADR-0004.

## Design

### 1. Add an implement-runner command/tool wrapper

Add a Cartographer-owned wrapper, preferably in `extensions/cartographer-tools.ts` plus a script such as `skills/plan/scripts/cartographer_implement.ts`, with a small command surface:

- `implement-start --topic <topic>`: preflight plan artifacts, initialize/validate state, set `current.json`, select the first executable phase, set singular `next_action`, set initial `working_set`, and emit a bounded status block.
- `implement-step --topic <topic>`: perform one wrapper-managed loop transition around the current phase. The first version may emit the required next action and guardrails rather than auto-editing code.
- `implement-record --topic <topic> --receipt-id ...`: record validation refs and update state after checks.
- `implement-compact --topic <topic> --trigger <phase-start|phase-complete|failure|file-set-change|before-final>`: call `compact-generate`, validate state, render `state-resume`, and optionally request Pi transcript compaction.
- `implement-finalize --topic <topic>`: block unless all executable phases are complete or an explicit stop/residual-risk receipt exists; run topic/graph validation; require auditor PASS or approved fallback [F004][F013][F014].

The wrapper should call `cartographer_state.ts` rather than duplicating state mutation logic [F007].

### 2. Make state initialization a hard preflight

For normal implementation, `implement-start` must fail closed if `.cartographer/<topic>/state.json` cannot be initialized or validated. A no-state path is allowed only when explicitly requested or when the plan predates the state system, and it must append a receipt explaining the legacy bypass [F001][F002].

Preflight should verify:

- `.plan/<topic>/plan.md`, `plan.nodes.jsonl`, `plan.edges.jsonl`, `receipts.jsonl`, and `context-packs.jsonl` exist or fail with an actionable message.
- `state-init` and `state-validate` pass.
- `.cartographer/current.json` is set as a local hint.
- the selected phase has complete dependencies and a single next action.
- `working_set` is populated before edits.

### 3. Bridge Pi compaction and Cartographer compaction

Use Pi extension compaction hooks to avoid future confusion between transcript compaction and workflow compaction [F003][F011]. At minimum:

- On `session_before_compact`, if an active Cartographer topic exists, run or require `compact-generate --trigger pi-session-before-compact` before Pi summarizes chat.
- On `session_compact`, append or update state metadata with the Pi compaction entry id when safe, without treating it as validation evidence.
- After wrapper-initiated `implement-compact`, render `state-resume` and inject the bounded resume context on the next implement turn [F007][F011].

### 4. Add harness-level guardrails

Use extension `before_agent_start`, `context`, and/or `tool_call` hooks where they provide deterministic safety [F009][F010]. Candidate guards:

- If the user invokes `/skill:implement` or asks `implement <topic>`, inject a wrapper-first instruction or route to the wrapper command.
- Block or warn on direct edits during an active implement session when no state exists, no selected phase is in progress, or `working_set.write_allowed` excludes the target path.
- Before final assistant messages for an active implement session, require a finalization check result. If Pi cannot block text finalization directly, register a command/tool the model must call and add tests that detect missing calls in session analysis.
- Surface status in the TUI/footer/widget: active topic, phase, next action, state validity, last receipt ids, and pending guard failures.

### 5. Add a lifecycle transition gate

Add `cartographer_transition` as the durable lifecycle coordinator. Specialized tools still do the work; `cartographer_transition` decides whether a lifecycle edge is allowed, records the transition receipt, and blocks unsafe forward motion.

Supported lifecycle states and transitions:

```text
proposal-draft
  -> proposal-ready-for-human-review
  -> proposal-approved
  -> plan-draft
  -> plan-ready-for-human-review
  -> plan-approved
  -> implementation-in-progress
  -> phase-in-progress(Pn)
  -> phase-complete(Pn)
  -> next phase-in-progress(Pn+1)
  -> implementation-ready-for-human-review
  -> implemented
```

Core commands:

- `cartographer_transition status --topic <topic>`: prints current lifecycle state, blocking gates, required validations, pending human approvals, and next allowed commands.
- `cartographer_transition request-approval --topic <topic> --gate <proposal|plan|phase|implementation> [--phase-id Pn]`: verifies deterministic prerequisites, writes a review bundle/context pack if needed, records a `ready-for-human-review` receipt, and stops.
- `cartographer_transition approve --topic <topic> --gate <proposal|plan|implementation|phase> [--phase-id Pn] [--approved-by <human>] --summary <text>`: records human approval, advances lifecycle state, and unlocks the next transition. `phase` approval is only required when the plan explicitly marks that phase as human-gated. If `--approved-by` is omitted, resolve the approver from `.cartographer/config.toml` first, then `git config user.name`, then the system username.
- `cartographer_transition reject --topic <topic> --gate <...> --reason <text>`: records rejection, leaves or moves the lifecycle to blocked/rework, and sets the next required action.
- `cartographer_transition advance --topic <topic> --to <state>`: machine-only transition for gates that do not require human approval, allowed only when all deterministic prerequisites and receipts exist.

Human-in-the-loop behavior:

- Proposal finalization stops at `proposal-ready-for-human-review` after deterministic validation, context pack creation, and auditor PASS. The human approves with `cartographer_transition approve --gate proposal`. Only then may planning start.
- Plan finalization stops at `plan-ready-for-human-review` after plan graph validation, dependency checks, context pack creation, and auditor PASS. The human approves with `cartographer_transition approve --gate plan`. Only then may implementation start.
- Normal implementation phases do **not** stop for human approval. After phase validation receipts, plan status synchronization, context pack creation, state compaction/resume, and auditor PASS/fallback, `cartographer_transition advance --to phase-complete --phase-id Pn` may advance automatically to the next executable phase.
- A phase stops for human approval only when the plan explicitly marks it as human-gated, such as `human_approval_required: true`, a phase-level transition prerequisite, or an unresolved decision requiring user direction. In that case it enters `phase-ready-for-human-review(Pn)`, and the human approves with `cartographer_transition approve --gate phase --phase-id Pn`.
- Final implementation stops at `implementation-ready-for-human-review` after full project validation, topic/graph validation, final auditor gate, ADR handling, and clean state. The human approves with `cartographer_transition approve --gate implementation`. Only then may the topic be marked `implemented`.
- Human approval receipts must include approver identity or local label, timestamp, approved artifact/receipt IDs, summary, and any accepted residual risk. Approval receipts do not replace deterministic validation; they authorize crossing a major gate, or an explicitly human-gated phase, after validation exists.
- Approver identity resolution is deterministic and local-only: `--approved-by` wins when supplied; otherwise read `.cartographer/config.toml` (gitignored) for a configured approver such as `approver = "John Doe"` or `[transition] approved_by = "John Doe"`; otherwise use `git config user.name`; otherwise use the system username. The value must be non-secret and human-readable, never an auth token or signature.

`cartographer_transition` should update or coordinate:

- proposal/plan lifecycle metadata;
- `plan.md` and `plan.nodes.jsonl` statuses through `cartographer_plan_status`;
- `.cartographer/<topic>/state.json` through `cartographer_state` when implementation is active;
- context packs through `cartographer_context_pack`;
- generic transition/approval/rejection receipts through `cartographer_receipt`;
- final next actions for the agent/human.

### 6. Add deterministic proposal and fact wrappers

Add proposal-facing wrappers so proposal creation and acceptance are not assembled by ad hoc file edits:

- `cartographer_proposal init --topic <topic>` creates the proposal skeleton, topic directory, empty JSONL graph files, evidence directory when needed, and initial metadata without truncating existing useful artifacts [F019].
- `cartographer_fact add-source`, `cartographer_fact add-fact`, and `cartographer_fact support-fact` append or upsert source/fact/support records while enforcing source-backed fact shape, stable IDs, and `supported_by` edges [F020].
- `cartographer_proposal adr-sync` runs or consumes `cartographer_adr evaluate` output and ensures `## ADR Metadata` matches the deterministic evaluation or includes an explicit override rationale [F027].
- `cartographer_proposal finalize --topic <topic>` runs validate-topic, fact citation summary, sanitized evidence checks, context-pack checks, deterministic auditor handoff, and receipt append before the proposal is considered ready for planning [F023].

These wrappers should reuse `cartographer_jsonl`, `cartographer_evidence`, `cartographer_adr`, and the handoff wrapper rather than duplicating low-level validation logic.

### 7. Add deterministic plan and status wrappers

Add plan-facing wrappers so planning and implementation bookkeeping cannot desynchronize Markdown checkboxes from plan graph JSONL:

- `cartographer_plan generate-graph --topic <topic>` parses `plan.md` phases, tasks, validations, dependencies, and references into `plan.nodes.jsonl` / `plan.edges.jsonl`, reducing hand-authored graph drift [F024].
- `cartographer_plan finalize --topic <topic>` runs graph generation/checks, dependency cycle validation, citation/reference checks, context-pack checks, deterministic auditor handoff, and final receipts before a plan is ready for implementation [F023].
- `cartographer_plan_status set --topic <topic> --phase Pn --status <pending|in-progress|complete|blocked>` atomically updates `plan.md` and `plan.nodes.jsonl`, preserving stable IDs and creating required status receipts/context-pack prompts when needed [F021].
- `cartographer_validation complete-item --topic <topic> --validation-id Pn.Vm --receipt-id <id>` verifies a receipt exists and satisfies the validation before marking the validation complete in Markdown and JSONL [F026].

### 8. Add deterministic context-pack and receipt wrappers

Add wrappers for the two artifact types that repeatedly become implicit preconditions for gates:

- `cartographer_context_pack create/update --topic <topic> --phase-id <phase>` creates or updates context-pack records from verified artifacts, receipt IDs, changed files, and bounded summaries; gates should require context packs through this tool rather than relying on the agent to remember them [F022].
- `cartographer_receipt append --topic <topic> --type <...>` provides a schema-checked generic receipt writer for non-validation events: fallback, timeout, audit, compass decision, phase status, output-capture failure, no-op completion, legacy bypass, and residual-risk receipts [F025].

`cartographer_validation` remains the preferred path for command validation receipts; `cartographer_receipt` fills the current gap for non-command workflow evidence [F025].

### 9. Add a deterministic subagent handoff wrapper

Add a small handoff wrapper, either as part of the same extension or as a sibling tool such as `cartographer_handoff`, for Cartographer specialist calls. This proposal is already about hardening non-deterministic workflow boundaries; subagent report capture is one of those boundaries.

The wrapper should standardize:

- handoff kind: `auditor`, `compass`, `archivist`, `redactor`, or explicit fallback;
- invocation mode: use the known-good mode for read-only audits and avoid task wording that causes the harness to classify an audit as an implementation task;
- required inputs: context pack id/path, receipt ids, artifact summaries, allowed raw paths, and report path;
- output contract: exact PASS/FAIL or decision schema, required corrections, notes, and residual risks;
- report capture: write to a parent-owned temp path first when safer, then copy or record into `.plan/<topic>/...`;
- retry policy: distinguish semantic FAIL from harness/output-capture failure, retry once with the stable invocation shape, then record fallback receipt;
- receipt policy: append timeout, output-capture, fallback, and PASS/FAIL receipts with explicit residual risk.

For auditor gates, the wrapper should make an empty/missing subagent response a harness failure, not an audit FAIL. It should only record semantic FAIL when the auditor actually returned required corrections.

This wrapper is also an explicit evaluation point for the current subagents dependency. The implementation plan should define success metrics: stable output capture, no misleading implementation-task classification for read-only gates, reliable report-path writes, bounded retry behavior, and receipts that separate semantic outcome from transport/harness failure. If those metrics fail after a stable wrapper invocation shape, a later phase should either patch/contribute fixes to the subagents plugin or build a Cartographer-native handoff runner using Pi SDK/runtime APIs [F012][F016][F017].

### 10. Keep the first version bounded

The first implementation should not attempt to fully automate code edits. It should enforce the loop around the current parent writer:

1. start/select phase;
2. update next action and working set;
3. require the parent to inspect/edit;
4. record validation receipts;
5. compact at milestones;
6. run deterministic subagent handoff gates through the handoff wrapper;
7. validate and gate finalization.

This makes the wrapper a deterministic control plane, not an autonomous hidden worker [F015][F016].

### 11. Tests and validation

Add temp-root tests for:

- `cartographer_transition` blocks major lifecycle transitions until deterministic prerequisites and required human approval receipts exist; normal implementation phase transitions require deterministic prerequisites but not human approval unless the phase is explicitly human-gated. Request/approve/reject flows update lifecycle state and receipts without bypassing validation.
- `cartographer_proposal init/finalize` creates expected proposal artifacts, rejects missing citation/evidence/audit prerequisites, and never truncates existing useful artifacts.
- `cartographer_fact` wrappers enforce source/fact/support shape and reject unsupported cited facts.
- `cartographer_plan generate-graph/finalize` creates plan graph JSONL from Markdown, detects dependency cycles/status drift, and requires deterministic validation/audit evidence.
- `cartographer_plan_status` atomically updates `plan.md` and `plan.nodes.jsonl` or rolls back on failure.
- `cartographer_validation complete-item` refuses to mark validation complete without a matching passed receipt.
- `cartographer_context_pack` creates/updates context packs with bounded summaries and verified artifact references.
- `cartographer_receipt append` validates non-command receipt schemas for fallback, timeout, audit, compass, phase, output-capture, and legacy-bypass receipts.
- `implement-start` creates `.cartographer/<topic>/state.json` and `journal.jsonl` in a mock project.
- `implement-start` fails when required `.plan` artifacts are missing.
- `implement-step` refuses to proceed without a singular next action and working set.
- `implement-compact` calls `compact-generate`, validates state, and renders bounded resume context.
- direct write guard blocks edits outside `working_set.write_allowed` during an active wrapper session, if implemented in extension hooks.
- `implement-finalize` fails while phases remain pending and passes only after plan/task/validation status plus receipts/context packs satisfy the validator [F004][F013].
- subagent handoff wrapper captures auditor PASS/FAIL output to the expected report path, treats missing output as harness failure, retries with the stable invocation mode, and records fallback receipts when needed [F016].
- subagent dependency evaluation records whether the generic plugin meets Cartographer reliability metrics or whether follow-up work should patch it or replace it with a Cartographer-native Pi SDK runner [F017].
- Pi transcript compaction hook records/bridges compaction without confusing it with validation evidence [F003][F011].
- docs tests assert `/skill:implement` is wrapper-first and specialist gates go through the handoff wrapper, not ad hoc prose-only prompts [F006][F016][R001].

Expected validation commands:

- `npm run test:ts -- tests/cartographer_state.test.ts tests/cartographer_tools.test.ts`
- new wrapper-specific tests, e.g. `npm run test:ts -- tests/cartographer_implement.test.ts`
- `python -m unittest discover tests -p 'test_workflow_docs.py'`
- `npm run check:scripts`
- `npm run check`
- topic validation for this proposal/plan.

## Risks and Mitigations

- **Risk:** The wrapper becomes a hidden second source of truth. **Mitigation:** reuse `cartographer_state.ts`; keep `.plan` authoritative; validate source refs; never introduce `plan.json` [F005][F015].
- **Risk:** The wrapper blocks legitimate exploratory edits. **Mitigation:** support explicit legacy/manual bypass receipts and user-approved pause/stop modes.
- **Risk:** Extension hooks are too weak to block final text responses. **Mitigation:** implement enforceable command/tool gates first, add session-analysis regression tests, and consider SDK-level runtime orchestration if extension-only enforcement remains porous [F009][F012].
- **Risk:** Pi transcript compaction and Cartographer state compaction remain confusing. **Mitigation:** name hooks and receipts explicitly, store Pi compaction ids as context only, and require `compact-generate` for state transitions [F003][F011].

## Open Questions

- Should the main user-facing entrypoint be `/cartographer-implement <topic>`, `/skill:implement <topic>` routing, a tool-only `cartographer_implement`, or all three?
- Should edit guardrails be advisory in the first release, or block write/edit tools outside the active working set immediately?
- Should wrapper execution remain single-session, or should it eventually use the Pi SDK to run bounded phase turns and automatically continue after compaction?
