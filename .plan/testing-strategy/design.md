# testing-strategy Design

## Source Artifacts

- `.plan/testing-strategy/proposal.md`
- `.plan/testing-strategy/requirements.md`
- `.plan/testing-strategy/evidence/testing-research.md`
- Requirements: `REQ-TEST-001`, `REQ-TEST-002`, `REQ-TEST-003`, `REQ-TEST-004`
- Scenarios: `SCN-TEST-001`, `SCN-TEST-002`, `SCN-TEST-003`, `SCN-TEST-004`

## Design Summary

Add testing-strategy expectations as workflow instructions rather than a new runtime service. The design and plan skills should require agents to derive a test strategy from current project context, then convert that strategy into concrete plan validation items.

The proposal itself does not choose a project testing framework, so it does not require an ADR. A specific topic that changes a project's testing toolchain or dependency strategy, such as adding Vitest or Playwright as a project standard, must trigger ADR evaluation/generation before that toolchain change is treated as accepted.

## Decisions

### DES-TEST-001 — Design owns the testing strategy

The design phase MUST own the topic-specific testing strategy section because it is where alternatives, risks, and validation approach are chosen before implementation planning.

The `Testing Strategy` section should include:

- detected languages;
- app/change type;
- existing test frameworks/tools/scripts/CI;
- official docs and best-practice sources consulted;
- unit strategy;
- integration strategy;
- E2E strategy;
- at least one E2E validation that runs at least once;
- ADR trigger notes for major testing-toolchain changes;
- unresolved user decisions or accepted pivots.

Satisfies: `REQ-TEST-001`, `REQ-TEST-003`, `REQ-TEST-004`.

### DES-TEST-002 — Planning consumes strategy as validation obligations

The plan phase MUST derive validation items from the accepted testing strategy. Behavior-changing phases should name focused test artifacts, scenarios, or commands instead of relying on generic "run tests" language.

Plan validation should prefer this order:

1. focused unit/integration tests for the changed behavior;
2. focused E2E validation that runs at least once;
3. broad project checks after focused tests pass.

Satisfies: `REQ-TEST-002`, `REQ-TEST-003`.

### DES-TEST-003 — Existing-tool preservation with explicit ADR boundary

The workflow MUST preserve existing project test tools by default. If design recommends adding, removing, replacing, or standardizing a major test framework/tool, that recommendation is a user-owned decision and an ADR trigger.

Examples that trigger ADR evaluation/generation if accepted:

- Jest to Vitest;
- Cypress to Playwright;
- adding Playwright as the project E2E standard;
- adding Vitest as the project TypeScript test runner standard;
- replacing Python `unittest` with pytest as project policy.

Satisfies: `REQ-TEST-004`, `SCN-TEST-003`.

## Rejected Alternatives

### ALT-TEST-001 — Keep testing guidance only in plans

Rejected because plan-only guidance is too late: implementation phases need a prior design decision that explains why each test layer is appropriate.

### ALT-TEST-002 — Mandate Vitest and Playwright for all TypeScript projects

Rejected because existing projects may already have viable tools. Toolchain changes should be recommended with rationale, accepted by the user, and captured through ADR evaluation/generation when they become project policy.

### ALT-TEST-003 — Require permanent recurring E2E CI for every change

Rejected because some changes only need a one-time smoke/harness/manual-assisted E2E validation before acceptance. The design must name the E2E validation and decide whether it belongs in recurring CI.

## Risks and Mitigations

- **Risk:** Agents produce boilerplate testing strategies without project-specific discovery.  
  **Mitigation:** Require language, app type, existing tools/scripts, and docs consulted before finalizing the strategy.

- **Risk:** Plans still include generic validation.  
  **Mitigation:** Require stable plan validation IDs to name focused test files/scenarios/commands and broad checks separately.

- **Risk:** Toolchain changes slip in as ordinary test tasks.  
  **Mitigation:** Require ADR evaluation/generation for accepted major testing-tool additions, removals, replacements, or project-wide standards.

## Implementation Notes

- Update `skills/design/SKILL.md` to require a `Testing Strategy` section for behavior-changing topics.
- Update `skills/plan/SKILL.md` to require validation items derived from the accepted testing strategy.
- Add validation/tests for generated design/plan artifacts using temp/mock roots only.
- Keep `.plan/<topic>/requirements*` and `.plan/<topic>/design*` graph-backed and validated before planning.
