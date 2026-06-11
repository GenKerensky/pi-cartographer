# proposal-design-split Proposal

## Description

Split Cartographer's current topic workflow into clearer change-lifecycle artifact phases, where a Cartographer `topic` maps to an OpenSpec-style `change`:

```text
topic/change: proposal -> requirements delta -> design -> plan -> implement -> fold into docs/requirements.md
```

The proposal phase should become lighter, but it should keep the current proposal structure up to the point where design begins: Description, Problem Statement, Goals, Non-Goals, Background, Viability, risks, and ADR metadata remain in `proposal.md` [F001]. After proposal acceptance, a new requirements phase should convert the topic/change into concrete product and behavioral requirements deltas with scenarios and stable graph IDs [F002][F014]. A separate design phase should then perform the detailed architecture/design work that currently lives under `## Design` in `proposal.md` [F008]. When the change is implemented and accepted, those topic-local requirement deltas should be folded into durable project requirements under `docs/requirements.md`, or split into multiple `docs/requirements*.md` / domain files if the permanent requirements doc becomes too large [F014].

This is a boundary split, not a reduction in rigor or a rewrite of the proposal's non-design sections. Current proposal mapping, research, fact graph construction, problem/background/viability prose, validation, and audit expectations should remain materially intact; only the detailed design and architecture output should move into the right downstream artifact layer [F003].

## Problem Statement

Cartographer's current proposal document does too much. It has to answer whether a change is worth doing, collect and cite research, identify risks and ADR intent, and also contain high-level implementation design steps [F008]. That makes proposal review heavier than necessary and blurs the distinction between:

- deciding whether a change is worthwhile;
- specifying concrete behavior the system must satisfy;
- choosing a design/architecture to satisfy that behavior;
- turning the design into implementation phases and validation checks.

The missing layer is a durable behavioral requirements/spec lifecycle. Without it, design and plan phases are driven mostly by proposal prose and fact citations rather than explicit, testable product/behavioral requirement deltas with stable IDs, scenarios, cross-artifact traceability, and a path to fold accepted changes into permanent project requirements [F002][F013][F014].

## Goals

1. **Make proposals lightweight without removing core sections.** Keep `proposal.md` structured like today's proposals through Background and Viability: description, problem statement, goals, non-goals, background, viability, risks, and ADR metadata stay in the proposal [F001].
2. **Add a requirements-delta phase.** Generate topic-local `requirements.md`, `requirements.nodes.jsonl`, and `requirements.edges.jsonl` after proposal acceptance and before design; treat these as change-local deltas for the current topic/change [F002][F013][F014].
3. **Move design out of proposals.** Create a separate `design.md` phase for architecture, alternatives, data/control flow, file-level impact, and detailed design decisions [F008].
4. **Preserve existing research rigor.** Keep current map/fact graph creation, detailed research, citations, validation, and audit posture; only change where the resulting material is finalized [F003].
5. **Use OpenSpec-compatible concepts without hard dependency.** Borrow proposal/specs/design/tasks separation, ADDED/MODIFIED/REMOVED deltas, and scenarios, but keep Cartographer's graph-native internals [F004][F005][F006][F012].
6. **Improve traceability.** Link requirements to proposal goals/non-goals, facts, risks, design decisions, plan tasks, validations, receipts, and eventual durable requirements in `docs/requirements.md` [F011][F013][F014].
7. **Preserve existing plan/implement authority.** The new requirements/design phases should feed the existing plan phase; they should not replace `plan.md`, `plan.nodes.jsonl`, `receipts.jsonl`, or implementation state rules [F009][F010].
8. **Fold accepted deltas into durable requirements.** After implementation/archive, merge accepted topic-local requirement deltas into `docs/requirements.md` in the same spirit that ADRs live durably under `docs/adr` [F014].
9. **Keep future OpenSpec import/export trivial.** Cartographer should stay native, but its requirement change types, scenarios, domains, archive/fold lifecycle, and artifact dependencies should map cleanly to current OpenSpec concepts so adapters can be added later without schema rework [F016][F017][F018].

## Non-Goals

- Do **not** make OpenSpec a required runtime dependency [F012].
- Do **not** replace Cartographer's map/fact/plan/receipt/audit graph model with OpenSpec's document conventions [F011][F012].
- Do **not** remove or relocate the current proposal's Description, Problem Statement, Goals, Non-Goals, Background, or Viability sections; the split starts where detailed design begins [F001][F003].
- Do **not** reduce proposal research, source citation, deterministic validation, or auditor requirements [F003].
- Do **not** turn requirements into implementation plans. Requirements should describe observable product/behavioral contracts; design and plan artifacts own implementation details [F007].
- Do **not** replace the current plan or implement workflow authority. `plan.md`, plan graph JSONL, receipts, and context packs remain authoritative for execution [F009][F010].
- Do **not** treat topic-local requirements as the permanent source of truth after archive; accepted deltas should fold into durable `docs/requirements.md` / split requirements docs [F014].
- Do **not** implement OpenSpec import/export in the first cut unless the accepted plan explicitly scopes an adapter phase.

## Background

OpenSpec's model overlaps with the workflow Cartographer is evolving toward: proposal, specs/requirements, design, tasks, implementation, and archive [F005]. In Cartographer terms, `.plan/<topic>/` should be understood as the OpenSpec-style change folder: one topic is one proposed change with local proposal, requirements delta, design, plan, receipts, and context [F014]. OpenSpec separates durable current behavior (`specs/`) from change-local proposed modifications (`changes/`) [F004]. Its most relevant concept for Cartographer is delta specs: ADDED, MODIFIED, and REMOVED requirements with concrete scenarios [F006].

That maps naturally to Cartographer's missing behavioral layer. Topic-local requirements should describe what the current change adds, modifies, or removes; after the topic/change is implemented and accepted, those deltas should fold into durable project requirements under `docs/requirements.md`, with additional files allowed if the permanent requirements documentation becomes too large [F014]. A requirement can state what behavior changes, scenarios can make it testable, and graph edges can connect the requirement to evidence, design, plan tasks, validations, receipts, and later decay analysis [F013]. This preserves Cartographer's differentiator: the Markdown artifact is human-readable, while JSONL graph records provide stable IDs and auditable relationships [F011][F013].

The current Cartographer proposal workflow already creates proposal, map, and fact artifacts and includes a `## Design` section in the proposal document [F008]. The plan workflow already creates `plan.md`, `plan.nodes.jsonl`, and `plan.edges.jsonl` [F009], and implementation treats plan artifacts, receipts, and context packs as authoritative during execution [F010]. The proposed split should therefore insert requirements and design between proposal and plan rather than rewriting the whole downstream workflow.

Recent OpenSpec docs do not show a blocker to future import/export if Cartographer preserves the conceptual mapping. OpenSpec currently supports proposal/specs/design/tasks artifact dependencies, agent-compatible JSON inspection/validation/status commands, spec sync before archive, archive movement to dated change folders, and customizable schemas/templates [F016][F017][F018]. Cartographer can map those concepts to topic artifacts and graph records without depending on OpenSpec's directory structure internally.

## Viability

This is viable because the change extends existing Cartographer patterns instead of introducing a wholly separate system. Cartographer already has JSONL graph artifacts, fact citations, deterministic validators, topic-scoped planning files, receipts, and auditor expectations [F011]. The new requirements layer can follow the same conventions:

| Concern | Existing pattern | Proposed extension |
| --- | --- | --- |
| Human-readable artifact | `proposal.md`, `plan.md`, `docs/adr/*` | topic-local `requirements.md`, `design.md`, durable `docs/requirements.md` |
| Machine-readable graph | `map.*.jsonl`, `facts.*.jsonl`, `plan.*.jsonl` | `requirements.nodes.jsonl`, `requirements.edges.jsonl`, `design.nodes.jsonl`, `design.edges.jsonl` |
| Validation | topic JSONL + planning graph validators | add requirements/design citation and endpoint validation |
| Traceability | facts -> sources, phases -> tasks/validations | topic requirements -> facts/goals/design/plan/validations/receipts -> durable `docs/requirements.md` |
| External compatibility | none required | optional OpenSpec import/export adapter later; schema preserves current OpenSpec concepts [F012][F016][F017][F018] |

The main implementation cost is not producing more prose; it is clarifying lifecycle boundaries and adding validators so split artifacts cannot drift [F011][F013]. That cost is worthwhile because requirements become a reusable behavioral contract that design, plan, implementation, archive, and decay analysis can all reference.

## ADR Metadata

- `adr_required`: true
- `adr_reason`: This changes Cartographer's durable workflow architecture and artifact dependency model by introducing a requirements/spec layer and moving design out of proposal.md. It also defines the boundary between Cartographer-native graph semantics and OpenSpec-compatible external conventions.
- `adr_options_status`: required-before-finalization
- `adr_tool_mode`: evaluate-now-write-after-validation

## Design

### 1. Redefine the lightweight proposal contract

Update the proposal workflow so `proposal.md` answers whether the change should be pursued before detailed architecture work begins, while preserving the current proposal shape up to design.

`proposal.md` should retain the current non-design section structure:

- `## Description`;
- `## Problem Statement`;
- `## Goals`;
- `## Non-Goals`;
- `## Background` with fact citations;
- `## Viability` with fact citations;
- major risks and constraints;
- `## ADR Metadata` and recommendation;
- explicit decision criteria for moving to requirements.

`proposal.md` should stop being the home for detailed architecture steps only. The current `## Design` section can either be removed after migration or replaced with a short `## Next Artifacts` / `## Proposed Workflow` section that points to the requirements and design phases.

**Primary references:** `file:skills/proposal/SKILL.md`, [F001], [F003], [F008].

### 2. Add a topic-local requirements delta phase after proposal acceptance

Introduce a new workflow that consumes accepted proposal artifacts and emits change-local requirements for the current Cartographer topic. In OpenSpec terms, `.plan/<topic>/` is the change folder, and these requirements are the change's spec deltas:

- `.plan/<topic>/requirements.md` — human-readable behavioral requirement deltas for this topic/change;
- `.plan/<topic>/requirements.nodes.jsonl` — requirement, scenario, acceptance-check, and delta nodes;
- `.plan/<topic>/requirements.edges.jsonl` — edges to proposal goals, non-goals, facts, risks, design nodes, plan tasks, validations, receipts, and durable `docs/requirements.md` requirement IDs.

The requirements vocabulary should be OpenSpec-shaped:

```text
ADDED Requirements
MODIFIED Requirements
REMOVED Requirements
```

Each requirement should have a stable ID, domain, priority, change type, source links, scenarios, and validation expectations. Scenarios should prefer Given/When/Then language where useful [F006][F007]. Topic-local requirement IDs should either reference existing durable requirement IDs for MODIFIED/REMOVED changes or mint new IDs that can be promoted into `docs/requirements.md` when the change is folded in [F014].

**Primary references:** `artifact:requirements.md`, `artifact:requirements.nodes.jsonl`, `artifact:requirements.edges.jsonl`, `artifact:docs-requirements`, [F002], [F006], [F007], [F013], [F014].

### 3. Move architecture and design work into graph-backed design artifacts

Create a design phase that consumes proposal + requirements + map/fact graphs and emits:

- `.plan/<topic>/design.md` — human-readable architecture and design narrative;
- `.plan/<topic>/design.nodes.jsonl` — design decision, alternative, component, interface, migration, risk, and validation-strategy nodes;
- `.plan/<topic>/design.edges.jsonl` — typed edges linking design nodes to requirements, facts, map nodes/files, alternatives, plan phases, validations, and receipts.

This should follow the same human Markdown + machine JSONL pattern already used for plans, because structured design-to-requirement references are valuable enough to include from the start [F015].

`design.md` should contain the work currently overloading proposal design:

- technical approach and alternatives;
- architecture decisions and trade-offs;
- dependency and migration considerations;
- file/module impact;
- data/control-flow diagrams;
- risks, unknowns, and validation strategy;
- links from design sections back to requirement IDs and facts.

Design should be explicitly requirement-driven: every major design section should identify the requirement IDs it satisfies or intentionally defers. Each major section in `design.md` should have a corresponding `design.nodes.jsonl` record with stable ID, type, status, requirement refs, fact refs, and source heading. The first schema should use the Decision + Alternative model: `design-decision`, `design-alternative`, `design-component`, and `design-risk` nodes, with `design.edges.jsonl` relationships such as `satisfies`, `supported_by`, `constrained_by`, and `alternative_to` [F015][F020]. Full implementation traceability edges such as `modifies`, `implemented_by`, and `validated_by`, plus richer `design-interface` and `validation-strategy` nodes, should be documented as a fast-follow once plan/validation artifacts exist [F020].

Example `design.nodes.jsonl`:

```jsonl
{"id":"DES-PDS-001","type":"design-decision","title":"Topic-local requirements are change deltas","status":"accepted","summary":"Treat .plan/<topic>/requirements.* as change-local requirement deltas that fold into docs/requirements.md after archive.","requirement_refs":["REQ-PDS-001","REQ-PDS-002"],"fact_refs":["F004","F006","F014"],"source":"design.md#topic-local-requirements-are-change-deltas"}
{"id":"ALT-PDS-001","type":"design-alternative","title":"Hard-depend on OpenSpec","status":"rejected","summary":"Rejected because Cartographer should keep graph-native internals and only provide adapter compatibility.","fact_refs":["F012"],"source":"design.md#alternatives"}
```

Example `design.edges.jsonl`:

```jsonl
{"from":"DES-PDS-001","to":"REQ-PDS-001","type":"satisfies","evidence":"Design implements topic-local requirements as change deltas."}
{"from":"DES-PDS-001","to":"F014","type":"supported_by","evidence":"User clarified topic equals OpenSpec change and deltas fold into docs/requirements.md."}
{"from":"ALT-PDS-001","to":"DES-PDS-001","type":"alternative_to","evidence":"Hard dependency was considered and rejected."}
```

**Primary references:** `artifact:design.md`, `artifact:design.nodes.jsonl`, `artifact:design.edges.jsonl`, `file:skills/proposal/SKILL.md`, [F008], [F013], [F015].

### 4. Teach plan generation to consume requirements and design

Update the plan workflow so `plan.md`, `plan.nodes.jsonl`, and `plan.edges.jsonl` are generated from proposal + requirements + design + map/fact graphs, not from proposal design prose alone [F009].

Plan phases should include requirement references in phase/task metadata, and validation nodes should be able to satisfy one or more requirement/scenario IDs. This keeps implementation grounded in observable behavior while preserving current plan authority [F010].

**Primary references:** `file:skills/plan/SKILL.md`, `file:skills/implement/SKILL.md`, [F009], [F010].

### 5. Extend validators and artifact summaries

Extend existing topic validation rather than creating a separate validation stack [F011]. Validation should check:

- requirements JSONL parses and has unique stable IDs;
- requirement edges resolve to known proposal/fact/map/design/plan/validation/receipt IDs where applicable;
- requirement citations in `requirements.md`, `design.md`, and `plan.md` resolve;
- `design.nodes.jsonl` has unique stable IDs and valid source headings;
- `design.edges.jsonl` endpoints resolve to design nodes, requirement nodes, fact nodes, map nodes, plan nodes, validation IDs, or receipts;
- design sections cite requirement IDs or explicitly mark exploratory/non-binding design material;
- every accepted design-decision node has at least one requirement edge or a documented rationale for being infrastructure-only;
- plan phases/tasks reference requirement and design IDs when they implement behavior;
- no raw private references or unsupported source claims enter new artifacts.

**Primary references:** `file:skills/plan/scripts/manage_jsonl.ts`, `file:skills/plan/scripts/validate_planning_graph.py`, [F011], [F013].

### 6. Add OpenSpec-compatible adapter points later

Do not embed OpenSpec as a core dependency [F012]. Instead, define Cartographer-native requirements records so they can project into an OpenSpec-compatible shape:

```text
.plan/<topic>/requirements.delta.md
.plan/_specs/<domain>/requirements.md
```

Future commands could import/export OpenSpec change folders:

```text
cartographer requirements import-openspec openspec/changes/<change>
cartographer requirements export-openspec --topic <topic>
```

This keeps Cartographer's graph, receipts, audits, and decay model authoritative while making interop possible for current or future OpenSpec projects [F012][F013].

### 7. Fold accepted requirements into `docs/requirements.md`

Add an archive/finalization step that mirrors OpenSpec's archive merge lifecycle. When a topic/change is implemented, validated, and accepted, its ADDED/MODIFIED/REMOVED requirement deltas should be applied to durable project requirements:

```text
.plan/<topic>/requirements.md          # change-local deltas
docs/requirements.md                   # durable current behavior
docs/requirements/<domain>.md          # optional split when docs/requirements.md grows too large
```

This should work like `docs/adr`: durable project-level requirements live in docs, while topic-local artifacts preserve the history, evidence, design, plan, receipts, and audit trail for the change that introduced them [F014]. The fold operation should be graph-aware: promoted requirement IDs, superseded requirement IDs, scenario IDs, and receipt/audit references should remain traceable from `requirements.edges.jsonl` and validators should detect unresolved or duplicate durable requirement IDs.

Follow OpenSpec's current lifecycle shape where it helps: verify implementation against artifacts before finalization, sync/merge requirement deltas into durable requirements, then archive the topic/change with full context preserved [F016][F017]. Cartographer should add receipt/audit requirements around those steps, but the external mapping should remain straightforward:

| OpenSpec concept | Cartographer concept |
| --- | --- |
| `openspec/changes/<change>/` | `.plan/<topic>/` |
| `specs/**/spec.md` change deltas | `.plan/<topic>/requirements.md` + requirements JSONL |
| `openspec/specs/` current behavior | `docs/requirements.md` / split `docs/requirements/*.md` |
| `/opsx:sync` | Cartographer fold requirements deltas |
| `/opsx:archive` | Cartographer archive/finalize topic after receipts/audit |

**Primary references:** `artifact:docs-requirements`, `artifact:requirements.md`, `artifact:requirements.nodes.jsonl`, `artifact:requirements.edges.jsonl`, [F004], [F006], [F014], [F016], [F017].

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Artifact proliferation makes the workflow feel heavier. | Keep proposal lightweight, support progressive rigor, and generate compact summaries for child handoffs. |
| Requirements/design/plan drift apart. | Add stable IDs, cross-artifact edges, `design.nodes.jsonl`, `design.edges.jsonl`, and deterministic validators before making the split default. |
| Topic-local deltas never become durable behavior docs. | Add an archive/fold step that applies accepted deltas to `docs/requirements.md` and preserves trace links back to the topic/change. |
| Requirements become implementation plans. | Validate requirement language around observable behavior and keep file/function detail in design or plan [F007]. |
| OpenSpec compatibility constrains Cartographer internals. | Treat OpenSpec as import/export shape only; Cartographer requirements graph remains authoritative [F012]. |
| Future OpenSpec import/export reveals a missing concept. | Preserve mappings for change folders, specs, domains, scenarios, ADDED/MODIFIED/REMOVED and RENAMED-style change types, sync, archive, validation, and schema metadata from the start [F016][F017][F018]. |
| Existing proposals/plans break. | Support legacy proposal-with-design topics during migration and only require new artifacts for newly accepted topics after the split. |

## Open Questions

1. Requirements and design graph artifacts should be required by scope/risk of change, like ADRs. Small changes that do not impact a core user workflow do not need requirements/design graph artifacts; they can remain lightweight unless another risk factor makes the behavioral contract valuable.
2. Use the **Decision + Alternative** schema first for `design.nodes.jsonl` / `design.edges.jsonl`: support `design-decision`, `design-alternative`, `design-component`, and `design-risk` nodes, plus edges such as `satisfies`, `supported_by`, `constrained_by`, and `alternative_to`. Document full implementation traceability (`design-interface`, `validation-strategy`, `implemented_by`, `validated_by`, richer file/plan links) as a fast-follow after the basic design graph is in place.
3. Confirm the durable requirements file layout from current OpenSpec behavior during planning. The intended direction is `docs/requirements.md` first, with split/domain files only when needed, while preserving a clean mapping from OpenSpec `specs/<domain>/spec.md` to Cartographer durable requirements sections/files [F016][F017][F018].
4. The first implementation should include only Cartographer-native requirements and fold-to-docs support. It should not include OpenSpec import/export yet, but must keep concepts mapped cleanly enough that a later adapter is trivial [F012][F016][F017][F018].
