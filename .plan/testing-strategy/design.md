# testing-strategy Design

## Source Artifacts

- `.plan/testing-strategy/proposal.md`
- `.plan/testing-strategy/requirements.md`
- `.plan/testing-strategy/evidence/testing-research.md`
- Requirements: `REQ-TEST-001`, `REQ-TEST-002`, `REQ-TEST-003`, `REQ-TEST-004`
- Scenarios: `SCN-TEST-001`, `SCN-TEST-002`, `SCN-TEST-003`, `SCN-TEST-004`

## Design Summary

Add testing-strategy expectations as workflow instructions and validation gates rather than a new runtime service. The design phase must produce a topic-specific testing strategy from project evidence. The plan phase must convert that accepted strategy into concrete validation obligations. Deterministic validators must check for required evidence before auditor review, and auditors must judge whether the evidence is meaningful, not merely present.

The proposal itself does not choose a project testing framework, so it does not require an ADR. A specific topic that changes a project's testing toolchain or dependency strategy, such as adding Vitest or Playwright as a project standard, must trigger ADR evaluation/generation before that toolchain change is treated as accepted. Existing related ADRs are binding context unless a new accepted ADR explicitly supersedes them.

## Decisions

### DES-TEST-001 — Design owns the testing strategy

The design phase MUST own the topic-specific `Testing Strategy` section because it is where alternatives, risks, ADR constraints, and validation approach are chosen before implementation planning.

The `Testing Strategy` section MUST include enough structured content for deterministic validation and later auditor review:

- detected languages and runtime/toolchain boundaries;
- app/change type, such as API, frontend, HTML game, CLI, system tool, agent skill, or Pi extension;
- existing test frameworks, scripts, fixtures, CI jobs, and relevant config files;
- official docs and best-practice sources consulted, with fact/source IDs where applicable;
- existing related ADRs and their constraints;
- unit strategy, or a justification if unit tests are not applicable;
- integration strategy, or a justification if integration tests are not applicable;
- E2E strategy, including at least one E2E validation that runs at least once;
- whether each E2E validation is recurring CI, one-time smoke/harness, or manual-assisted with evidence;
- ADR trigger notes for major testing-toolchain changes, including whether a new ADR would supersede existing related ADRs;
- unresolved user decisions, accepted pivots, and any required researcher/compass/interview follow-up.

The strategy MUST treat existing accepted ADRs as binding context. It may not override an existing related ADR through ordinary design prose or plan tasks. If the accepted testing strategy needs to replace or contradict a related ADR, the workflow MUST create a new ADR that explicitly supersedes the existing related ADR before implementation treats the new strategy as authoritative.

Satisfies: `REQ-TEST-001`, `REQ-TEST-003`, `REQ-TEST-004`.

### DES-TEST-002 — Planning consumes strategy as validation obligations

The plan phase MUST derive validation items from the accepted testing strategy. Behavior-changing phases should name focused test artifacts, scenarios, or commands instead of relying on generic "run tests" language.

Plan validation should prefer this order:

1. focused unit/integration tests for the changed behavior;
2. focused E2E validation that runs at least once;
3. broad project checks after focused tests pass.

For each behavior-changing phase, the plan SHOULD include a compact `Testing Strategy Trace` or equivalent validation metadata that identifies:

- the design/testing-strategy decision or section used;
- relevant test layer(s): static, unit, integration, E2E, contract/golden/manual-assisted;
- concrete test files, fixtures, scenarios, commands, or explicit new test artifact names;
- requirement and scenario IDs covered by the validation item;
- whether the phase contributes to the required at-least-once E2E validation;
- any justified non-applicability for skipped layers.

The plan MUST include a requirement test coverage matrix or equivalent trace showing every topic-generated `REQ-*` and `SCN-*` record and the planned validation item(s) that prove it. A requirement or scenario may use non-test validation only when the plan gives an explicit rationale and names the manual/static/semantic evidence that will satisfy it.

Plan auditor review MUST verify that validation gates derive from the accepted testing strategy, include concrete test artifacts/scenarios/commands, cover every topic-generated requirement and scenario or justify exceptions, and include at least one E2E validation for behavior-changing work. A generic-only "run tests" validation gate is insufficient unless the plan explicitly justifies that the phase is non-behavioral.

Satisfies: `REQ-TEST-002`, `REQ-TEST-003`.

### DES-TEST-003 — Existing-tool preservation with explicit ADR boundary

The workflow MUST preserve existing project test tools by default. If design recommends adding, removing, replacing, or standardizing a major test framework/tool, that recommendation is a user-owned decision and an ADR trigger.

Examples that trigger ADR evaluation/generation if accepted:

- Jest to Vitest;
- Cypress to Playwright;
- adding Playwright as the project E2E standard;
- adding Vitest as the project TypeScript test runner standard;
- replacing Python `unittest` with pytest as project policy.

The plan may include an ADR evaluation task before implementation phases that depend on the toolchain change. It MUST NOT silently treat an unapproved major testing-toolchain pivot as an ordinary test implementation detail.

Satisfies: `REQ-TEST-004`, `SCN-TEST-003`.

### DES-TEST-004 — Deterministic gates produce evidence before auditor review

Design and plan validators MUST provide machine-checkable evidence to the auditor before a green-light decision. Validators are not responsible for judging the quality of the testing strategy, but they MUST detect missing or untraceable required fields so the auditor is not asked to infer basic completeness from prose.

Design-phase validation evidence should include:

- topic validation for JSONL/schema integrity through `cartographer_jsonl validate-topic` or `manage_jsonl.ts validate-topic`;
- design graph validation through the existing planning graph validator path where applicable;
- proof that `design.md` contains a `Testing Strategy` section for applicable behavior-changing topics;
- a checklist of required strategy fields from `DES-TEST-001`, including ADR references/notes and at least one E2E validation;
- traceability from accepted design decisions to `REQ-TEST-*` requirement IDs;
- supported fact/source citations for external testing-framework guidance;
- context-pack evidence summarizing the testing strategy, validation receipts, and unresolved decisions.

Plan-phase validation evidence should include:

- topic validation for JSONL/schema integrity;
- planning graph validation for phases, tasks, validation IDs, dependencies, and references;
- proof that behavior-changing phases have validation IDs with concrete commands, artifacts, scenarios, or manual evidence requirements;
- traceability from plan validations to the accepted design/testing strategy;
- a requirement/scenario coverage matrix showing every topic-generated `REQ-*` and `SCN-*` is covered by planned validation or an explicit justified non-test/manual evidence exception;
- proof that at least one E2E validation exists for applicable behavior-changing topics;
- proof that broad generic checks are separate from focused strategy-derived tests;
- detection of major testing-toolchain changes that need ADR evaluation before dependent implementation work.

State and lifecycle tools remain wrappers around the authoritative `.plan` artifacts: `cartographer_transition` should not advance design or plan gates without the strategy validation receipts, context pack, and auditor PASS; `cartographer_handoff auditor` should record the semantic PASS/FAIL; `cartographer_plan_status` and `cartographer_validation complete-item` should keep validation item completion tied to receipt evidence; `.cartographer` implementation state should only reference plan validation IDs and receipts, not duplicate the testing strategy.

Satisfies: `REQ-TEST-001`, `REQ-TEST-002`, `REQ-TEST-003`, `REQ-TEST-004`.

### DES-TEST-005 — Uncertainty escalates to researcher, compass, or interview

The main agent MUST NOT invent a testing strategy or phase validation when project evidence is insufficient.

Invoke researcher/archivist when evidence is missing, stale, or external:

- official documentation or current best practices for a test framework/tool are needed;
- the project uses an unfamiliar testing framework, runner, browser harness, fixture system, or CI convention;
- existing facts do not support a proposed testing-layer recommendation;
- there is uncertainty about how a language/framework should test a boundary, such as async APIs, browser behavior, subprocesses, file systems, databases, or agent-tool contracts.

Invoke compass/oracle when the evidence is available but a judgment or consistency decision is unclear:

- multiple valid strategies are possible and the trade-off affects scope, dependencies, risk, or phase order;
- a major testing-toolchain change is being considered;
- a proposed strategy conflicts with an existing ADR or may require superseding it;
- the agent is unsure whether an E2E validation should be recurring CI, one-time smoke/harness, or manual-assisted;
- the agent is unsure whether a plan phase's tests sufficiently prove the changed behavior.

Invoke interview/user approval when the remaining issue is user-owned:

- accepting a major tool pivot or new project-wide testing standard;
- superseding an existing ADR;
- choosing between materially different validation cost/risk profiles;
- approving a manual-assisted E2E path when automated E2E is impractical.

Researcher produces source-backed facts and options; compass produces decision-consistency recommendations; interview records user decisions. None of these roles may replace deterministic validation or auditor review.

Satisfies: `REQ-TEST-001`, `REQ-TEST-002`, `REQ-TEST-004`.

## Validator and Auditor Contracts

### Design gate

Before the design auditor runs, validators and parent-owned wrappers must produce receipts or summaries showing:

1. schema/JSONL validity for requirements, facts, map, and design artifacts;
2. presence of a `Testing Strategy` section for applicable behavior-changing topics;
3. required field coverage from `DES-TEST-001`;
4. requirement/scenario test coverage expectations for every topic-generated `REQ-*` and `SCN-*`, or explicit non-test/manual evidence exceptions;
5. at least one named E2E validation or a blocker requiring interview/user decision;
6. related ADRs searched/listed, or an explicit statement that no related ADR was found;
7. major testing-toolchain changes marked as ADR triggers rather than silently accepted;
8. context-pack summary that cites the design artifacts and validation receipts.

The design auditor must review that evidence and decide whether:

- the testing strategy is project-specific rather than boilerplate;
- existing tools, scripts, CI, and ADRs were actually considered;
- unit/integration/E2E choices fit the app/change type and risk;
- the required E2E validation is meaningful and feasible;
- unsupported assumptions were routed to researcher, compass, or interview;
- ADR conflicts or supersession needs are explicit before approval.

### Plan gate

Before the plan auditor runs, validators and parent-owned wrappers must produce receipts or summaries showing:

1. topic and planning graph validation passed;
2. every behavior-changing phase has validation IDs;
3. focused validation items name concrete test artifacts, scenarios, commands, or manual evidence;
4. validation items trace back to the accepted design/testing strategy;
5. every topic-generated `REQ-*` and `SCN-*` is covered by one or more validation items, or has an explicit justified non-test/manual evidence exception;
6. at least one E2E validation is included for applicable behavior-changing topics;
7. broad checks do not substitute for focused tests;
8. ADR evaluation/generation tasks precede phases that depend on accepted major testing-toolchain changes.

The plan auditor must review that evidence and decide whether:

- plan validations actually prove the strategy, changed behavior, and every topic-generated requirement/scenario;
- test layers are neither missing nor excessive for the phase risk;
- command/test names align with discovered project tools and scripts;
- the E2E validation has a credible execution point and evidence path;
- generic checks are retained only as broad safety nets after focused tests;
- unresolved strategy/tool decisions are blocked or routed to compass/interview before implementation.

## Rejected Alternatives

### ALT-TEST-001 — Keep testing guidance only in plans

Rejected because plan-only guidance is too late: implementation phases need a prior design decision that explains why each test layer is appropriate.

### ALT-TEST-002 — Mandate Vitest and Playwright for all TypeScript projects

Rejected because existing projects may already have viable tools. Toolchain changes should be recommended with rationale, accepted by the user, and captured through ADR evaluation/generation when they become project policy.

### ALT-TEST-003 — Require permanent recurring E2E CI for every change

Rejected because some changes only need a one-time smoke/harness/manual-assisted E2E validation before acceptance. The design must name the E2E validation and decide whether it belongs in recurring CI.

## Risks and Mitigations

- **Risk:** Agents produce boilerplate testing strategies without project-specific discovery.  
  **Mitigation:** Require language, app type, existing tools/scripts, related ADRs, and docs consulted before finalizing the strategy; require validator evidence before auditor review.

- **Risk:** Validators overreach into subjective testing-quality judgments.  
  **Mitigation:** Validators check presence, traceability, concrete fields, and receipt evidence; auditors judge quality, fit, sufficiency, and risk.

- **Risk:** Plans still include generic validation or leave some requirements untested.  
  **Mitigation:** Require stable plan validation IDs to name focused test files/scenarios/commands and broad checks separately, require plan validator traceability to the design strategy and every topic-generated requirement/scenario, and require plan auditor review to reject generic-only validation gates or uncovered requirements for behavior-changing work.

- **Risk:** Toolchain changes slip in as ordinary test tasks.  
  **Mitigation:** Require ADR evaluation/generation for accepted major testing-tool additions, removals, replacements, or project-wide standards, and block dependent phases until the ADR path is explicit.

- **Risk:** Strategy uncertainty is resolved by guesswork.  
  **Mitigation:** Route missing external evidence to researcher/archivist, judgment conflicts to compass/oracle, and user-owned decisions to interview/user approval.

## Implementation Notes

- Update `skills/design/SKILL.md` to require a `Testing Strategy` section for behavior-changing topics and to define researcher/compass/interview escalation.
- Update `skills/plan/SKILL.md` to require validation items derived from the accepted testing strategy.
- Update validator scripts or add narrow helper checks so design and plan validators emit the evidence listed in `DES-TEST-004` before auditor handoff.
- Update auditor guidance so design/plan audits verify the testing strategy and plan validation gates before approval.
- Update context-pack/handoff usage so auditor inputs include strategy evidence summaries, validation receipt IDs, and unresolved-decision notes.
- Add validation/tests for generated design/plan artifacts using temp/mock roots only.
- Keep `.plan/<topic>/requirements*`, `.plan/<topic>/design*`, and `.plan/<topic>/plan*` graph-backed and validated before implementation.
- Do not duplicate the strategy into `.cartographer` state; implementation state should reference authoritative plan validation IDs and receipts only.
