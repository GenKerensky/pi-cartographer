# testing-strategy Proposal

## Description

Add a mandatory testing-strategy design step to the Cartographer workflow. During `design`, agents must derive a topic-specific test strategy from a rubric covering languages, application type, existing testing tools, framework-specific documentation, and general testing best practices. During `plan`, every phase that changes behavior must include concrete validation items naming the unit, integration, and/or E2E tests to create or update and the commands that must pass.

The workflow should build on the target project's existing test stack by default, but it should explicitly ask the user before a meaningful tool pivot or upgrade. For example, if a TypeScript project already uses Jest but the surrounding stack is Vite-era TypeScript, the workflow may recommend Vitest for better modern integration, mocks, watch performance, and ecosystem alignment, but should ask before requiring the migration.

## Problem Statement

Cartographer currently has requirements/design/planning gates, but the design phase does not require a general testing strategy and plan validation can remain too generic. This leaves downstream implementation agents with unclear test obligations, especially for mixed TypeScript/Python projects, web frontends, APIs, HTML games, CLIs, system tools, agent skills, and Pi extensions. The result is inconsistent quality gates: some plans mention broad commands, while others fail to specify the exact tests that prove the feature works.

## Goals

- Require every applicable design phase to produce a topic-specific testing strategy before plan generation.
- Require the strategy to explicitly define unit, integration, and E2E expectations for the change topic.
- Require at least one E2E validation to be designed and run at least once for every feature/change topic, even when it is a smoke, harness, or manual-assisted E2E rather than a permanent high-frequency CI test.
- Require plan validation items to name specific test files, test scenarios, or commands that must be added/updated and pass.
- Use a rubric:
  1. What language(s) are being used?
  2. What kind of app/change is this?
  3. What existing testing frameworks/tools are present?
  4. What official framework docs and best-practice sources apply?
  5. What should be preserved, upgraded, or user-approved before pivoting?
- Prefer TypeScript and Python first-class guidance, with project-type guidance for web APIs, web frontends, HTML games, system tools, CLIs, agent skills, and Pi extensions.
- Ground recommendations in official testing framework docs, framework-specific testing recommendations, and general testing pyramid/trophy best practices. [F001] [F002] [F003] [F004]

## Non-Goals

- Do not force every project onto a single testing framework.
- Do not mandate a Jest-to-Vitest, Cypress-to-Playwright, unittest-to-pytest, or similar migration without explicit user approval.
- Do not require permanent slow E2E coverage for every edge case; require at least one designed E2E validation that runs at least once and make the plan decide what belongs in recurring CI.
- Do not replace existing Cartographer requirements/design/plan graph semantics.
- Do not weaken the project rule that tests must use temp/mock roots rather than mutating the repository's real `.plan/` artifacts.

## Background

Research supports a layered approach: unit tests validate isolated behavior, integration tests validate component boundaries, and E2E tests validate complete user/system workflows. The classic testing pyramid emphasizes many fast unit tests, fewer integration tests, and minimal E2E tests; the testing trophy adds static checks as a base and shifts modern web applications toward heavier integration/component coverage. [F004]

For TypeScript, Vitest is a strong default for modern unit/integration testing because it is TypeScript-friendly and supports mocks and coverage. [F002] Playwright is a strong default for browser and browser-adjacent E2E testing because its locator assertions retry until expected UI conditions are met. [F003] For Python, pytest's fixture ecosystem, including isolated temp paths and automatically restored monkeypatching, supports reliable unit and integration tests. [F001]

The proposal's research evidence is recorded in `.plan/testing-strategy/evidence/testing-research.md`.

## Viability

This change is viable because the current workflow already has distinct design and plan phases. The design skill can require a new `Testing Strategy` section and corresponding design graph records. The plan skill can consume that section and require validation items to cite concrete test artifacts and commands. Existing wrappers can continue to validate JSONL graph structure; additional semantic checks can be added to design/plan prose, graph generation, or auditor prompts.

The change is workflow-significant but incremental:

- `skills/design/SKILL.md` can require the testing rubric and outputs.
- `skills/plan/SKILL.md` can require validation items to derive from the accepted testing strategy.
- Validation scripts/tests can enforce presence of testing-strategy headings and at least one E2E validation requirement where design artifacts are present.
- Existing proposal/design/plan lifecycle gates remain intact.

## ADR Metadata
- `adr_required`: false
- `adr_reason`: No project architecture decision is required for this proposal itself: it changes external Cartographer workflow behavior and acceptance criteria, but it does not choose or change project architecture, language, library, runtime structure, dependency strategy, or major technical direction. However, topic-specific testing-strategy changes that add, remove, replace, or standardize major project testing tools or frameworks such as Vitest, Playwright, Cypress, Jest, pytest, or similar should trigger ADR evaluation/generation because they change the project's technical toolchain/dependency strategy.
- `adr_options_status`: not-applicable
- `adr_tool_mode`: evaluate-only
- `adr_override_rationale`: User correction: requirements are required for externally testable behavior changes; ADR is not required absent an architectural decision.
## Scope Gate

- `requirements_required`: true
- `requirements_reason`: This changes externally visible Cartographer workflow behavior and acceptance criteria. Requirements are needed so the new behavior can be tested against stable requirement/scenario IDs before design and planning.
- `design_required`: true
- `design_reason`: The proposal explicitly changes the design phase and requires graph-backed design decisions for testing strategy behavior before implementation planning.

## Proposed Workflow Behavior

### Design Phase

`design.md` should include a `Testing Strategy` section that records:

- detected languages and static checks;
- app/change type classification;
- existing test frameworks, package scripts, CI commands, and test directories;
- official docs/best-practice sources consulted;
- recommended unit strategy;
- recommended integration strategy;
- recommended E2E strategy;
- at least one E2E validation that must run at least once;
- user-approval questions for major framework pivots or upgrades;
- ADR trigger notes for major testing-tool additions, removals, replacements, or project-wide standardization decisions;
- risks, exceptions, and residual manual validation needs.

### Plan Phase

`plan.md` validation items should not say only "run tests". They should call out concrete obligations such as:

- `P1.V1`: add/update `tests/test_cli_generate.py` and run `pytest tests/test_cli_generate.py`;
- `P2.V1`: add/update `src/components/LoginForm.test.tsx` and run `npm run test -- LoginForm`;
- `P2.V2`: add/update `e2e/login.spec.ts` and run `npx playwright test e2e/login.spec.ts` at least once;
- `P3.V1`: run project-wide `npm run check` or `pytest` only after the focused tests pass.

### App-Type Guidance

- **Web APIs:** emphasize route/service/database/auth integration tests plus unit tests for business rules and at least one API smoke/E2E workflow.
- **Web frontends:** use static checks, component integration tests, and limited critical Playwright E2E user journeys.
- **HTML games:** unit-test deterministic simulation/game rules, integration-test input/update/collision/assets, and run a Playwright launch/input/observable-state E2E smoke.
- **System tools:** unit-test planning/parsing, integration-test temp real filesystems/env/subprocess boundaries, and run at least one real command E2E smoke.
- **CLIs:** test help, success, bad input, exit codes, stdout/stderr, and temp-dir side effects; run at least one packaged/entry command E2E.
- **Agent skills:** test frontmatter/references/schemas/redaction/fixture workflows and run at least one harness-level or simulated workflow E2E.
- **Pi extensions:** test schema registration, extension load, bounded outputs, failure/cancellation paths, and at least one Pi harness smoke invocation.

## Risks and Mitigations

- **Risk:** Overly strict testing mandates slow small changes.  
  **Mitigation:** Require the strategy and at least one E2E validation, but allow the design to justify which tests are recurring CI versus one-time/manual/harness validation.

- **Risk:** Agents may recommend unnecessary framework migrations.  
  **Mitigation:** Preserve existing tools by default, require a user question before pivots such as Jest-to-Vitest or Cypress-to-Playwright, and require ADR evaluation/generation when the accepted strategy changes the project's testing toolchain or dependency strategy.

- **Risk:** Plan validation becomes verbose but not actionable.  
  **Mitigation:** Require specific test files/scenarios and exact commands, not generic "run tests" language.

- **Risk:** Framework docs vary by project.  
  **Mitigation:** The rubric requires official framework/testing docs to be consulted for the specific project stack before strategy finalization.

## Next Artifacts

- Requirements artifact defining externally testable workflow behavior and acceptance scenarios.
- Design artifact defining the exact `Testing Strategy` section contract and graph representation.
- Plan artifact requiring validation item derivation from the accepted testing strategy.
- Implementation plan covering skill text updates, validator/test updates, and workflow/auditor prompts.
