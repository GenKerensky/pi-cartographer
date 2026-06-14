# Testing Strategy Research Evidence

## Research Summary

This evidence records the testing strategy research used to motivate the proposal.

## Definitions

- **Unit tests** verify one small piece of behavior in isolation: pure functions, parsers, reducers, argument parsing, validation logic, and small classes. They should be fast, deterministic, and independent of real network, persistent filesystem, database, browser, or subprocess boundaries unless those dependencies are faked.
- **Integration tests** verify multiple components across a real or realistic boundary: API route plus service plus database, CLI command plus temp filesystem, frontend component plus router/query client/mocked API, or agent skill script plus fixture project. They should still avoid uncontrolled external services.
- **End-to-end tests** verify a complete user- or system-visible workflow through the real app boundary: browser user flow, installed CLI invocation, deployed API smoke workflow, Pi extension load/use workflow, or HTML game launch/input/win condition.

## General Best Practices

- Use static checks as the foundation: TypeScript typechecking, ESLint/Biome, Python ruff, and mypy/pyright where appropriate.
- Use the testing pyramid for libraries/system tools where many isolated units are valuable: many unit tests, fewer integration tests, minimal E2E tests.
- Use the testing trophy for modern web applications: static checks, focused unit tests, many integration/component tests, and a small set of critical E2E tests.
- Test at the lowest level that provides confidence: unit for pure logic, integration for component boundaries, E2E for real workflows, contract/schema validation for interface promises.
- Every feature/change topic should include at least one designed E2E validation to be run at least once before acceptance, even if it is a smoke/manual-harness E2E rather than a permanent high-frequency CI test.

## TypeScript Tooling Evidence

- Vitest is a strong modern default for TypeScript unit and integration tests, especially for Vite-era projects, with TypeScript/JSX support, mocks, watch mode, and coverage support. [F002]
- Playwright is a strong default for browser E2E testing and browser smoke tests because web-first assertions retry until expected UI conditions are met. [F003]
- Testing Library and MSW are appropriate companions for frontend component integration tests where the goal is user-visible behavior with realistic mocked network boundaries.

## Python Tooling Evidence

- Pytest is a strong default for Python unit and integration tests. Fixtures such as `tmp_path` support isolated filesystem tests, and `monkeypatch` automatically restores object, dictionary, environment, and path mutations after tests. [F001]
- For Python APIs, framework-native clients such as FastAPI/Starlette `TestClient` or `httpx` should be preferred for route/service integration tests.

## Project-Type Recommendations

| Project type | Recommended emphasis | E2E expectation |
| --- | --- | --- |
| Web APIs | High integration coverage around route/service/database/auth boundaries; unit tests for business rules; contract/schema checks | At least one authenticated or critical workflow API smoke test |
| Web frontends | Testing trophy: static checks, component integration tests, limited pure unit tests, Playwright E2E | At least one critical user journey in browser |
| HTML games | Unit tests for deterministic simulation/game rules; integration tests for input/update/collision/asset pipelines; browser smoke/input E2E | At least one Playwright launch + input + observable state check |
| System tools | Unit tests for planning/parsing; integration tests against temp real filesystems and env vars; subprocess E2E | At least one installed/binary or real command smoke workflow |
| CLIs | Command runner/subprocess integration tests for help, success, bad input, exit codes, stdout/stderr, temp-dir side effects | At least one real shell invocation of the packaged/entry command |
| Agent skills | Contract tests for metadata, references, schemas, redaction, fixture workflows, and activation/near-miss prompts | At least one harness-level or simulated workflow from prompt to validated artifact |
| Pi extensions | Schema/tool registration tests, extension load tests, failure/cancellation/output bounds, harness smoke | At least one Pi harness smoke path invoking the extension/tool |

## Design-Phase Rubric Proposed by Research

A design-phase testing strategy should answer:

1. **What language(s) are being used?**
   - TypeScript, Python, or mixed.
   - Identify typecheck/lint tools and existing test runners.
2. **What kind of app/change is this?**
   - Web API, web frontend, HTML game, system tool, CLI, agent skill, Pi extension, library, or mixed.
3. **What testing frameworks/tools already exist?**
   - package scripts, pyproject config, pytest/Vitest/Jest/Playwright/Cypress, framework-native test utilities, CI commands, existing test directories.
4. **What should be preserved vs upgraded?**
   - Build on existing frameworks by default.
   - If existing tools are dated or mismatched, ask the user before pivoting, e.g. Jest-to-Vitest for modern TypeScript/Vite projects.
5. **What unit, integration, and E2E tests must this topic add or update?**
   - Name concrete test files or commands where possible.
   - Tie each plan validation item to a specific test artifact and pass command.

## Source Notes

- Pytest documentation: fixture system, `tmp_path`, and `monkeypatch` behavior. [F001]
- Vitest documentation: TypeScript-friendly test runner with mocks and coverage support. [F002]
- Playwright documentation: web-first assertions and browser automation model. [F003]
- General testing pyramid/trophy literature: unit/integration/E2E balance and modern integration-heavy web testing. [F004]
