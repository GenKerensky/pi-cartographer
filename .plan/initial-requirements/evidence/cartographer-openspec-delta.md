# Delta: Cartographer Initial Requirements Capabilities vs OpenSpec Init

This document compares Cartographer's current requirements bootstrap/fold capabilities with OpenSpec's initialization and spec lifecycle as analyzed from OpenSpec commit `1b06fddd59d8e592d5b5794a1970b22867e85b1f`.

Primary companion evidence: `.plan/initial-requirements/evidence/openspec-init-analysis.md`.

## Current Cartographer capabilities

Cartographer currently has a requirements workflow introduced by ADR-0007, but the bootstrap is incomplete.

### What exists

- Durable requirements are documented as accepted topic-local deltas folded into `docs/requirements.md` or split `docs/requirements/<domain>.md` files (`README.md:153-157`, `README.md:257`).
- Planning guidance says topic-local `requirements.md` / `requirements.nodes.jsonl` / `requirements.edges.jsonl` are change deltas that later fold into durable requirements docs (`skills/plan/SKILL.md:51-55`, `skills/plan/SKILL.md:124`).
- Implementation guidance says requirement fold steps must leave a `requirements-fold` receipt or approved `requirements-fold-skip` receipt (`skills/implement/SKILL.md:60`).
- `requirements_records.py` provides two commands: `fold` and `validate-fold` (`skills/plan/scripts/requirements_records.py:206-218`).
- `fold` can create `docs/requirements.md` as a side effect because `ensure_header()` returns default content when the path does not exist (`skills/plan/scripts/requirements_records.py:51-55`, `skills/plan/scripts/requirements_records.py:146`).
- `fold` supports split-domain output through `--split-domain` and writes `docs/requirements/<domain>.md` when requested (`skills/plan/scripts/requirements_records.py:38-47`).
- `fold` appends a compact `requirements-fold` receipt (`skills/plan/scripts/requirements_records.py:160-176`).
- `validate-fold` requires a fold or approved skip receipt when requirement deltas exist (`skills/plan/scripts/requirements_records.py:183-199`).
- Tests cover add/modify/remove, rename/split-domain, missing fold receipt, approved skip, and duplicate durable IDs (`tests/test_requirements_records.py:34-168`).

### What does not exist

- No explicit `requirements_records.py init` command.
- No project-level command that intentionally creates `docs/requirements.md` before a topic has deltas.
- No idempotent no-op behavior for a direct requirements bootstrap.
- No documented command equivalent to `openspec init` for requirements docs.
- No generated requirements schema/template loader analogous to OpenSpec's artifact instruction system.
- No separate metadata file for durable requirements docs comparable to OpenSpec's `.openspec.yaml` for changes.

## OpenSpec capabilities relevant to init

OpenSpec has broader initialization and lifecycle functionality.

### Project home initialization

OpenSpec `openspec init` creates a project home:

```text
openspec/
├── specs/
├── changes/
└── changes/archive/
```

and optionally `openspec/config.yaml`, plus generated AI tool skills/commands.

References:

- `src/cli/index.ts:117-155`
- `src/core/init.ts:104-151`
- `src/core/init.ts:455-482`
- `src/core/init.ts:598-617`
- `docs/cli.md:84-149`

### Durable spec container vs initial spec files

OpenSpec initializes the durable spec **container** (`openspec/specs/`) but not every durable spec file. Durable `openspec/specs/<capability>/spec.md` files are created during sync/archive from change-local deltas.

References:

- `docs/getting-started.md:23-47`
- `docs/concepts.md:196-264`
- `src/core/specs-apply.ts:57-78`
- `src/core/specs-apply.ts:374-377`

### New durable spec skeleton

When archive/sync applies deltas for a new capability, OpenSpec creates a durable spec skeleton:

```markdown
# <Capability> Specification

## Purpose
TBD - created by archiving change <change>. Update Purpose after archive.

## Requirements
```

Reference: `src/core/specs-apply.ts:374-377`.

### Change initialization

OpenSpec separates project init from change init:

- `openspec init` creates `openspec/`, `specs/`, `changes/`, `changes/archive/`, config, and tool integrations.
- `openspec new change <name>` creates `openspec/changes/<name>/` and `.openspec.yaml` metadata.
- Generated `/opsx:propose` uses `openspec status` and `openspec instructions` to guide artifact creation.

References:

- `src/commands/workflow/new-change.ts:107-169`
- `src/utils/change-utils.ts:121-172`
- `src/core/artifact-graph/instruction-loader.ts:226-337`
- `src/core/templates/workflows/propose.ts:26-63`

### Schema/template-driven artifact guidance

OpenSpec built-in schemas define artifact dependencies, generated paths, and templates:

- `schemas/spec-driven/schema.yaml:1-153`
- `schemas/spec-driven/templates/proposal.md:1-23`
- `schemas/spec-driven/templates/spec.md:1-8`
- `schemas/spec-driven/templates/design.md:1-19`
- `schemas/spec-driven/templates/tasks.md:1-9`

The schema instructions explicitly define delta sections and requirement/scenario syntax.

### Validation/archive lifecycle

OpenSpec validates initialized changes/specs from directory conventions and applies deltas to durable specs during archive:

- active changes: `openspec/changes/<change>/proposal.md` (`src/utils/item-discovery.ts:4-20`);
- durable specs: `openspec/specs/<id>/spec.md` (`src/utils/item-discovery.ts:22-42`);
- archive requires `openspec/changes`, or errors with "Run 'openspec init' first" (`src/core/archive.ts:56-64`);
- archive validates delta specs and blocks invalid deltas (`src/core/archive.ts:133-151`);
- archive writes durable spec updates then moves the change to archive (`src/core/archive.ts:201-285`).

## Capability delta table

| Capability | OpenSpec | Cartographer today | Delta / implication |
| --- | --- | --- | --- |
| Project initialization command | `openspec init [path]` creates project home and integrations | No equivalent; proposal/index workflows create `.plan/` topics as needed | Add a targeted requirements init first; broader project init can remain out of scope. |
| Durable requirements/spec container | Creates `openspec/specs/` upfront | Durable path is documented but `docs/requirements.md` appears only manually or via fold | Add `requirements_records.py init` to create `docs/requirements.md` intentionally. |
| Archive container | Creates `openspec/changes/archive/` upfront | `.plan/<topic>/` topics remain in place; no archive directory model in this proposal | Out of scope unless future Cartographer archive proposal exists. |
| Config/project memory | Creates/preserves `openspec/config.yaml`; injects context/rules into instructions | No requirements-specific config; workflow is skill/doc driven | Do not add config for this small feature; consider future schema/template work separately. |
| Tool integrations | Init writes skills/commands for selected tools | Pi Cartographer skills/tools are packaged in repo/harness, not generated per project | Out of scope for requirements init. |
| Change metadata | `openspec new change` writes `.openspec.yaml` | Cartographer uses `.plan/<topic>` graphs/receipts; no per-change metadata YAML | No change needed; Cartographer already has graph/receipt metadata. |
| Artifact templates | Schema-driven templates for proposal/spec/design/tasks | Skill docs plus validators; no template loader for requirements init | A simple header is enough for this feature; template loader is future work. |
| Durable spec skeleton | New spec domains get Purpose + Requirements skeleton during archive | `ensure_header()` only writes a generic one-line durable requirements header | Improve initial `docs/requirements.md` skeleton to include at least Purpose/Requirements-style sections if compatible. |
| Idempotency | Re-running init refreshes generated managed files, preserves config/user content | Fold updates requirements blocks; no init idempotency | Add no-overwrite/idempotent behavior and test it. |
| Validation | `validate --all`, delta validators, archive blockers | `validate-topic`, planning graph validators, `validate-fold` | Add tests and optionally validate initialized doc shape if useful. |
| Split domains | `openspec/specs/<domain>/spec.md` by design | Default `docs/requirements.md`, optional split `docs/requirements/<domain>.md` | Keep Cartographer default single file; optionally support `init --split-domain --domain <name>` later. |

## Recommended Cartographer implementation scope

The immediate proposal should **not** try to clone OpenSpec's full project init. A focused implementation should add a durable requirements bootstrap that mirrors the useful part of OpenSpec's setup while preserving Cartographer's simpler native model.

### Minimum viable feature

Add:

```bash
python skills/plan/scripts/requirements_records.py init --root "$PWD" --json
```

Expected behavior:

- Creates `docs/requirements.md` if absent.
- Creates `docs/` parent directory if absent.
- Uses a stable initial skeleton.
- Does not require `--topic` because this initializes a durable project doc, not a topic-local delta.
- Returns JSON such as:

```json
{
  "ok": true,
  "path": "docs/requirements.md",
  "created": true,
  "message": "Created durable requirements document"
}
```

### Suggested skeleton

OpenSpec's new durable spec skeleton includes `Purpose` and `Requirements`; Cartographer's existing header is simpler. A good Cartographer skeleton would be:

```markdown
# Requirements

This file contains durable requirements folded from accepted Cartographer topic deltas.

## Purpose

Describe the stable behavioral requirements this project currently satisfies.

## Requirements

Durable requirement blocks use stable `REQ-*` identifiers and may be folded from `.plan/<topic>/requirements.nodes.jsonl`.
```

This keeps the existing sentence while adding the behavior-contract affordance OpenSpec uses.

### Idempotency and overwrite rules

Recommended default:

- If `docs/requirements.md` is absent: create it, `created: true`.
- If it exists: do not modify it, `created: false`, `reason: "exists"`.
- Do not add `--force` in the first cut unless there is a clear repair use case.
- If a future `--force` exists, it should be conservative and probably only repair missing heading sections, never overwrite existing requirement blocks.

### Tests to add

Use temp roots only:

1. `init` creates `docs/requirements.md` with expected heading/skeleton.
2. `init` creates missing `docs/` parent.
3. `init` is idempotent and does not change an existing file.
4. `init --json` returns stable structured fields.
5. Existing `fold` behavior still works when `docs/requirements.md` already exists from init.
6. `check:scripts` still compiles `requirements_records.py`.

### Docs to update

- `README.md`: add a short "Initialize durable requirements" snippet near the fold lifecycle.
- `skills/plan/SKILL.md`: mention initialization when planning requirements/fold work.
- Optional: `skills/implement/SKILL.md` can mention that fold expects an initialized durable requirements doc or will create/update it through helper behavior.

## Out-of-scope OpenSpec features for this proposal

Do not include these in the first implementation:

- generated AI tool skills/commands;
- global profile/delivery config;
- schema/template resolver;
- project config with context/rules;
- OpenSpec import/export;
- archive directory movement model;
- broad `cartographer init` command;
- automatic generation of real product requirements from source code.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| We overfit to OpenSpec and add too much ceremony. | Keep the first command limited to durable requirements doc initialization. |
| Init overwrites user-authored requirements. | Default to no-overwrite/idempotent behavior. |
| Skeleton conflicts with fold rendering. | Reuse/update `ensure_header()` so fold and init share the same document preamble. |
| Users think init creates actual requirements. | Docs must say init creates the container only; real requirements come from accepted deltas or manual curated additions. |
| Tests mutate real repo docs. | Use temp/mock roots only, matching project instructions. |

## Planning implications

The proposal should be updated or interpreted with these specifics:

- OpenSpec `init` creates a spec container, not domain spec content.
- Cartographer should add a project-doc init command, not a whole OpenSpec-like project scaffolder.
- The best implementation target is `requirements_records.py`, because it already owns durable requirements path/header/fold behavior.
- The most important delta is explicit, safe, idempotent bootstrap for `docs/requirements.md`.
