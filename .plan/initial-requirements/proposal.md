# Initial Requirements Document Proposal

## Description

Add a Cartographer-native initialization path for the durable requirements document so a project can intentionally bootstrap `docs/requirements.md` before any topic-local requirement deltas are folded into it.

Today, the requirements workflow documents that accepted topic-local deltas eventually fold into durable `docs/requirements.md` or split `docs/requirements/<domain>.md` files [F001]. The fold helper can create the durable file as a side effect when requirement deltas exist, but there is no explicit `init` command for starting the durable requirements file on its own [F002][F003]. This proposal covers adding that bootstrap affordance, analogous in intent to OpenSpec's `openspec init` project setup step [F005]. Follow-up code research clarifies that OpenSpec init creates the project/spec/change containers, config, and AI integrations, but not every durable spec document upfront [F006]. Cartographer should therefore keep the first cut native and focused on an explicit, safe, idempotent `docs/requirements.md` bootstrap rather than cloning the whole OpenSpec project init model [F007].

## Problem Statement

The requirements split added durable requirements as an important project artifact, but the first-file lifecycle is implicit. A user who wants to start `docs/requirements.md` before a scoped change has requirement deltas must either create it manually or wait for `requirements_records.py fold` to create it indirectly [F002][F003]. That is a small but real workflow gap:

- the durable requirements artifact is documented as a first-class output, but it has no first-class bootstrap command [F001];
- manual creation risks inconsistent header text or layout compared with fold output [F003];
- tests exercise fold and validation behavior, but not a direct initialization path [F004];
- users familiar with spec-driven tools reasonably expect an init step before proposing or archiving requirements changes [F005].

## Goals

1. Add an explicit, idempotent requirements initialization command that creates `docs/requirements.md` when absent.
2. Treat initialization as creating the durable requirements **container document**, not inventing product requirements, matching OpenSpec's distinction between initialized spec containers and later delta-derived durable specs [F006][F007].
3. Reuse and improve the durable requirements header/layout conventions already embedded in `requirements_records.py`, ideally adding OpenSpec-inspired `## Purpose` and `## Requirements` sections while preserving Cartographer wording [F003][F006].
4. Make the command safe: it must not overwrite an existing `docs/requirements.md` unless a deliberate force/repair mode is added and tested.
5. Add temp-root tests for create, missing parent directory creation, JSON output, idempotent no-op, existing-file preservation, and fold compatibility after init [F004].
6. Document the bootstrap path in README/workflow guidance near the existing fold lifecycle [F001].
7. Keep this Cartographer-native and narrowly scoped; do not add an OpenSpec dependency, import/export behavior, generated tool integrations, or broad project scaffolding [F005][F007].

## Non-Goals

- Do not implement OpenSpec import/export.
- Do not clone OpenSpec's full `openspec init` behavior: no generated AI tool integrations, global profile/delivery config, schema/template resolver, project config, `changes/archive` model, or broad `cartographer init` command in this proposal [F006][F007].
- Do not change the semantics of topic-local requirement deltas or fold receipts.
- Do not require every project to have requirements before small non-core changes.
- Do not generate product requirements content automatically; initialization should create the container/structure, not invent requirements.
- Do not mutate the repository's real `docs/requirements.md` from tests; tests must use temp/mock roots.

## Background

Cartographer's workflow now treats scoped topics as a lifecycle from proposal to requirements delta, design, plan, implementation, and fold into durable requirements docs [F001]. The durable docs are analogous to ADRs: topic artifacts preserve change history, while accepted behavior should eventually live under `docs/requirements.md` or split durable requirements files [F001].

The current `requirements_records.py` helper supports `fold` and `validate-fold` subcommands [F002]. Its `ensure_header` logic already defines the default durable requirements file text when fold creates a missing file [F003]. Existing tests cover fold behavior, split-domain output, fold receipt validation, and duplicate durable IDs [F004]. Those are the right foundations for an `init` command, but they do not expose project bootstrap as a user-facing operation.

OpenSpec's quick start includes `openspec init` before users start proposing changes [F005]. Code analysis shows that this initializes the OpenSpec home, `specs/`, `changes/`, archive container, config, and AI integrations while durable spec files are created later from deltas during sync/archive [F006]. Cartographer should not copy OpenSpec's runtime model, but the user expectation is valid: a requirements/spec workflow benefits from a simple, explicit durable requirements bootstrap command [F007].

## Viability

This is a small, low-risk extension because the implementation can reuse existing code paths and tests:

| Concern | Existing support | Proposed extension |
| --- | --- | --- |
| Default durable file content | `ensure_header()` returns the current header text [F003] | expose it through an `init` subcommand and consider adding `## Purpose` / `## Requirements` sections inspired by OpenSpec's durable spec skeleton [F006] |
| Durable file path | `durable_path()` already targets `docs/requirements.md` by default [F002] | create parent dirs and write only when absent |
| Split requirements docs | fold supports `--split-domain` [F002][F004] | keep split-domain init out of the MVP unless planning finds a concrete need |
| Safety | tests use temp roots [F004] | add temp-root tests for init/no-overwrite behavior |
| Documentation | README explains durable requirements/fold [F001] | add the init command near that section |

The simplest implementation is to extend `skills/plan/scripts/requirements_records.py` with an `init` subcommand that does not require `--topic`, because it initializes a durable project-level document rather than a topic-local delta. A follow-up plan can decide whether to also add package-level npm script aliases or dashboard affordances. The first cut should stay CLI/documentation-focused and should explicitly avoid broad OpenSpec-style project scaffolding [F007].

## ADR Metadata

- `adr_required`: false
- `adr_reason`: No new ADR expected: this proposal implements the existing ADR-0007 requirements workflow by adding a bootstrap/init helper for durable requirements docs. Re-evaluate if planning changes durable requirements semantics or introduces a new workflow boundary.
- `adr_options_status`: not-applicable
- `adr_tool_mode`: evaluate-only
- `adr_override_rationale`: cartographer_adr evaluate was conservative because the request touches workflow architecture; existing ADR-0007 already records the architectural decision, so this proposal should only require an ADR if the plan changes that decision.

## Design

Detailed design should be handled in the plan unless review expands the scope. The expected implementation direction is:

- add `requirements_records.py init` with `--root` and `--json`; unlike `fold` and `validate-fold`, it should not require `--topic`;
- create `docs/requirements.md` when absent, including the current Cartographer durable-requirements sentence plus OpenSpec-informed `## Purpose` and `## Requirements` sections [F006];
- return a structured JSON result describing `ok`, `path`, `created`, and a message/reason;
- preserve existing files by default and report `created: false` for idempotent no-op runs;
- keep `--force`, split-domain initialization, and automatic requirement generation out of the MVP unless the plan identifies a specific tested need;
- ensure existing `fold` behavior still works when the durable file was initialized first;
- add tests in `tests/test_requirements_records.py` using temp roots;
- document the command in `README.md` and, if appropriate, `skills/plan/SKILL.md`.

