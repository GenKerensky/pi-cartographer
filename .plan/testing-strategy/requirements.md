# testing-strategy Requirements

## Source Artifacts

- `.plan/testing-strategy/proposal.md`
- `.plan/testing-strategy/evidence/testing-research.md`
- Facts: [F001], [F002], [F003], [F004]

## Scope

This topic changes externally visible Cartographer workflow behavior. It does not choose a new architecture, language, framework, runtime structure, or dependency strategy for the project. Requirements are therefore required, while an ADR is not required for this proposal itself.

However, applying the workflow to a specific project may produce an ADR-triggering decision. Changes to a project's testing strategy that add, remove, replace, or standardize major testing tools/frameworks such as Vitest, Playwright, Cypress, Jest, pytest, or similar change the technical toolchain/dependency strategy and MUST trigger ADR evaluation/generation.

## Requirements

### REQ-TEST-001 — Design-phase testing strategy

The system MUST require applicable design phases to record a topic-specific testing strategy before planning begins.

The strategy MUST identify:

- language(s) involved;
- application/change type;
- existing test frameworks, tools, scripts, CI commands, and test directories;
- official framework/testing docs and general best-practice sources consulted;
- recommended unit testing strategy;
- recommended integration testing strategy;
- recommended E2E testing strategy;
- at least one E2E validation that must run at least once.

#### Acceptance checks

- A design artifact for a behavior-changing topic cannot satisfy the workflow unless it includes a testing-strategy section or equivalent graph-backed records.
- The testing strategy includes unit, integration, and E2E recommendations or explicitly justified non-applicability for any category except the required E2E validation.

### REQ-TEST-002 — Plan validation names concrete tests

The system MUST require plan validation items for behavior-changing phases to name specific test artifacts, scenarios, or commands that must be created, updated, and pass.

Generic validation language such as only "run tests" is insufficient unless accompanied by focused test files/scenarios and exact commands.

#### Acceptance checks

- Plan validations include stable validation IDs tied to concrete test obligations.
- Focused tests are listed before broad project-wide checks.
- Validation entries identify at least one command or harness invocation that can produce pass/fail evidence.

### REQ-TEST-003 — At least one E2E validation

The system MUST require every feature/change topic to design at least one E2E validation that runs at least once before acceptance.

The E2E validation MAY be a browser journey, API smoke workflow, CLI subprocess invocation, game launch/input flow, Pi harness smoke, or documented manual-assisted harness path, depending on the project type.

#### Acceptance checks

- The design/testing strategy names the E2E workflow.
- The plan includes a validation item that runs or records the E2E validation at least once.
- The strategy may decide whether the E2E validation becomes recurring CI, one-time validation, or manual-assisted evidence.

### REQ-TEST-004 — Existing-tool preservation and user-approved pivots

The system MUST build on existing project test tools by default and MUST ask the user before requiring a major testing-tool pivot or upgrade.

Examples include Jest-to-Vitest, Cypress-to-Playwright, unittest-to-pytest, adding Playwright/Vitest where no equivalent project standard exists, or adding a new heavyweight E2E framework to a project that already has a viable one.

When a testing strategy would add, remove, replace, or standardize a major testing framework/tool for the project, the workflow MUST trigger ADR evaluation/generation before implementation planning treats that toolchain change as accepted.

#### Acceptance checks

- Existing test frameworks/tools are discovered and named before recommendations are finalized.
- A major pivot is represented as a user-owned decision rather than silently imposed.
- The strategy may recommend a pivot with rationale, but implementation planning cannot require it until the user accepts it.
- Accepted major testing-tool additions, removals, replacements, or standardization decisions trigger ADR evaluation/generation before implementation planning treats them as project policy.

## Scenarios

### SCN-TEST-001 — TypeScript frontend feature

Given a TypeScript frontend topic with existing package scripts, when design runs, then it records existing test tools, derives component/integration and E2E strategy, cites applicable docs, and names at least one browser E2E validation.

### SCN-TEST-002 — Python CLI/system tool feature

Given a Python CLI or system tool topic, when planning runs, then validation items name focused pytest or subprocess tests using temporary project roots/filesystems and include at least one real command smoke path.

### SCN-TEST-003 — Tool pivot recommendation

Given an existing Jest project where Vitest appears preferable, when design recommends Vitest, then the workflow asks the user before making the migration required for implementation and triggers ADR evaluation/generation if the user accepts the project testing-tool change.

### SCN-TEST-004 — Plan rejects generic validation

Given a behavior-changing plan phase, when its validation says only "run tests", then the plan is incomplete until it names focused test artifacts/scenarios and pass commands.

## Fold Target

- `docs/requirements.md#testing-strategy-workflow`
