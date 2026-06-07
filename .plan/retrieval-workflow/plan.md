# retrieval-workflow Plan

## Source Artifacts

- Proposal: `.plan/retrieval-workflow/proposal.md`
- Map graph: `.plan/retrieval-workflow/map.nodes.jsonl`, `.plan/retrieval-workflow/map.edges.jsonl`
- Fact graph: `.plan/retrieval-workflow/facts.nodes.jsonl`, `.plan/retrieval-workflow/facts.edges.jsonl`
- Shared index: `.plan/_index/project-graph.sqlite`

## Retrieval Notes

This plan keeps source-code retrieval and rationale retrieval separate. Source-code discovery should use normal index/`rg` behavior with `.plan/` excluded unless explicitly needed. Rationale retrieval should query `.plan/` only at proposal/plan/implementation boundaries and should treat old artifacts as historical evidence requiring freshness checks.

Useful implementation probes:

```bash
rg "cartographer_index" skills extensions tests --glob '!.plan/**'
rg "validate-topic" skills tests --glob '!.plan/**'
rg "map.nodes.jsonl" skills tests README.md --glob '!.plan/**'
rg "candidate" skills tests --glob '!.plan/**'
rg "status" skills/plan/scripts skills/*/SKILL.md tests --glob '!.plan/**'
rg "retrieval workflow" .plan
```

## Phase Overview

| Phase | Purpose | Depends on |
|---|---|---|
| P0 | Define schemas and lifecycle contract | none |
| P1 | Add workflow prompt changes for retrieval/rationale behavior | P0 |
| P2 | Add index/query support for scopes, context packing, and miss logging | P0 |
| P3 | Add JSONL validation/tooling for lifecycle and verification metadata | P0, P2 |
| P4 | Add retrieval-quality and lifecycle tests | P1, P2, P3 |
| P5 | Update extension guidance and docs | P1, P2, P3 |
| P6 | Final integration validation and migration notes | P4, P5 |

## Phases

### Phase P0 — Define retrieval and lifecycle contracts

- **Status:** complete
- **Depends on:** none
- **Objective:** Establish the shared data contract for candidate/verified retrieval evidence, retrieval miss records, query scopes, and artifact lifecycle states before changing workflow behavior.
- **Source references:** `.plan/retrieval-workflow/proposal.md`, `skills/proposal/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, `skills/plan/scripts/manage_jsonl.ts`, `skills/plan/scripts/validate_planning_graph.py`

Checklist:

- [x] **P0.T1** Define canonical lifecycle states: `draft`, `accepted`, `planned`, `in-progress`, `implemented`, `superseded`, and `stale`.
- [x] **P0.T2** Define candidate/verified metadata fields for map edges, map nodes where useful, and retrieval/context outputs.
- [x] **P0.T3** Define retrieval miss JSONL schema for `.plan/_retrieval/misses.jsonl`, including failure type, original query, eventual hit, and resolution.
- [x] **P0.T4** Define query scopes: `code`, `plans`, and `all`, with `code` as the default.
- [x] **P0.T5** Document that final concise ADR generation into `docs/` is out of scope for this plan.

Validation:

- [x] **P0.V1** Schema descriptions appear in the relevant skill/tool docs before downstream implementation begins.
- [x] **P0.V2** The contract preserves committed `.plan/` artifacts as source-of-truth rationale while keeping `.plan/_index/` ignored.
- [x] **P0.V3** The contract is consistent with GrepRAG-inspired goals for identifier-weighted, deduplicated, structure-aware retrieval [F2] [F4] [F5].

### Phase P1 — Add workflow prompt changes for retrieval and rationale behavior

- **Status:** complete
- **Depends on:** P0
- **Objective:** Update proposal, plan, and implement skills so agents generate bounded retrieval plans, verify candidates, perform explicit rationale retrieval at workflow boundaries, and treat old planning artifacts as historical evidence.
- **Source references:** `skills/proposal/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, `.plan/retrieval-workflow/proposal.md`

Checklist:

- [x] **P1.T1** Add bounded retrieval-plan instructions to proposal workflow before map refinement or optional scout.
- [x] **P1.T2** Add bounded retrieval-plan instructions to plan workflow before gathering plan-relevant context.
- [x] **P1.T3** Add bounded retrieval-plan instructions to implement workflow before phase context and worker handoff.
- [x] **P1.T4** Add explicit rationale retrieval moments for proposal, plan, implementation, reviewer, and oracle workflows.
- [x] **P1.T5** Add guidance that retrieved `.plan/` artifacts are historical evidence requiring freshness checks, not automatically authoritative current code facts.

Validation:

- [x] **P1.V1** `rg "rationale retrieval" skills/proposal/SKILL.md skills/plan/SKILL.md skills/implement/SKILL.md` finds the new workflow guidance.
- [x] **P1.V2** `rg "retrieval plan" skills/proposal/SKILL.md skills/plan/SKILL.md skills/implement/SKILL.md` finds bounded retrieval-plan instructions.
- [x] **P1.V3** Skill instructions preserve `.plan/_index/` ignore policy and do not recommend ignoring committed proposal/plan/fact/map JSONL rationale artifacts.

### Phase P2 — Add index/query support for scopes, context packing, and miss logging

- **Status:** complete
- **Depends on:** P0
- **Objective:** Extend index-project tooling so callers can intentionally search code, planning rationale, or both; request compact verified context; and record material retrieval misses.
- **Source references:** `skills/index-project/scripts/index_project.py`, `skills/index-project/SKILL.md`, `tests/test_index_project.py`, `.plan/retrieval-workflow/proposal.md`

Checklist:

- [x] **P2.T1** Add `--scope code|plans|all` to query and context-related commands, with `code` as the default.
- [x] **P2.T2** Index committed `.plan/<topic>/proposal.md`, `.plan/<topic>/plan.md`, and JSONL rationale artifacts into a separate plan/rationale scope without mixing them into default code results.
- [x] **P2.T3** Add a compact context command or option that merges adjacent snippets, deduplicates overlaps, prefers symbols/headings, and labels candidate vs verified context.
- [x] **P2.T4** Add generic-token safeguards and warnings for ambiguous terms such as `config`, `run`, `init`, `handler`, and `process` [F3].
- [x] **P2.T5** Add miss-log support for `.plan/_retrieval/misses.jsonl` with append-only structured records.
- [x] **P2.T6** Ensure generated/cache artifacts under `.plan/_index/` remain ignored while committed rationale artifacts remain visible to explicit plan-scope retrieval.

Validation:

- [x] **P2.V1** `python skills/index-project/scripts/index_project.py query --root "$PWD" --scope code --topic "retrieval" --json` excludes `.plan/` rationale artifacts.
- [x] **P2.V2** `python skills/index-project/scripts/index_project.py query --root "$PWD" --scope plans --topic "retrieval" --json` can return `.plan/retrieval-workflow/proposal.md` or related rationale artifacts.
- [x] **P2.V3** Context output includes merged/deduplicated snippets with candidate/verified labels and verification hints.
- [x] **P2.V4** A material retrieval miss can be appended to `.plan/_retrieval/misses.jsonl` without logging raw snippets or secrets.

### Phase P3 — Add JSONL validation and lifecycle tooling

- **Status:** complete
- **Depends on:** P0, P2
- **Objective:** Teach Cartographer validation/tooling to understand lifecycle states, candidate/verified metadata, stale/superseded rationale, and retrieval miss records.
- **Source references:** `skills/plan/scripts/manage_jsonl.ts`, `skills/plan/scripts/validate_planning_graph.py`, `tests/test_manage_jsonl.py`, `tests/manage_jsonl.test.ts`, `tests/test_validate_planning_graph.py`

Checklist:

- [x] **P3.T1** Add lifecycle status validation for proposal, map, fact, and plan graph records where status metadata is present.
- [x] **P3.T2** Add warnings or errors for `verified: true` records that lack supporting read/rg/validation evidence.
- [x] **P3.T3** Add warnings for high-impact candidate-only references in proposal/plan artifacts.
- [x] **P3.T4** Add warnings for retrieved rationale that is `draft`, `superseded`, `stale`, or missing `last_verified_at` when used as implementation guidance.
- [x] **P3.T5** Add list/upsert/validate support for retrieval miss records under `.plan/_retrieval/misses.jsonl`.
- [x] **P3.T6** Preserve existing JSONL validation behavior for projects that do not yet use lifecycle or retrieval miss metadata.

Validation:

- [x] **P3.V1** `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic retrieval-workflow --json` passes or reports only intended warnings.
- [x] **P3.V2** `python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic retrieval-workflow --json` passes for valid artifacts.
- [x] **P3.V3** Invalid lifecycle, unsupported `verified: true`, and malformed miss-log fixtures are detected by tests.

### Phase P4 — Add retrieval-quality and lifecycle tests

- **Status:** pending
- **Depends on:** P1, P2, P3
- **Objective:** Add regression coverage for the retrieval behaviors and artifact lifecycle rules that motivated this proposal.
- **Source references:** `tests/test_index_project.py`, `tests/test_validate_planning_graph.py`, `tests/test_manage_jsonl.py`, `tests/manage_jsonl.test.ts`, `.plan/retrieval-workflow/facts.nodes.jsonl`

Checklist:

- [ ] **P4.T1** Add index tests for identifier expansion, generic-token downranking/warnings, duplicate chunk handling, and adjacent snippet context packing.
- [ ] **P4.T2** Add query-scope tests proving `code` excludes `.plan/` and `plans` includes committed rationale artifacts.
- [ ] **P4.T3** Add miss-log tests for append, list, validation, and malformed record handling.
- [ ] **P4.T4** Add lifecycle validation tests for stale, superseded, implemented, and missing-verification cases.
- [ ] **P4.T5** Add workflow documentation tests or snapshot-style assertions where practical for retrieval/rationale prompt guidance.

Validation:

- [ ] **P4.V1** `npm run test:py` passes.
- [ ] **P4.V2** `npm run test:ts` passes.
- [ ] **P4.V3** Tests fail before the relevant implementation changes and pass after them, demonstrating real coverage.

### Phase P5 — Update extension guidance and user-facing docs

- **Status:** pending
- **Depends on:** P1, P2, P3
- **Objective:** Expose the retrieval contract, scopes, miss logging, and lifecycle behavior to agents and users through tool registration metadata and README/skill documentation.
- **Source references:** `extensions/cartographer-tools.ts`, `README.md`, `skills/index-project/SKILL.md`, `skills/proposal/SKILL.md`, `skills/plan/SKILL.md`, `skills/implement/SKILL.md`

Checklist:

- [ ] **P5.T1** Update `cartographer_index` tool parameters and prompt guidelines for `scope`, context output, and candidate verification.
- [ ] **P5.T2** Add miss-log tool guidance or `cartographer_jsonl` support for retrieval miss records.
- [ ] **P5.T3** Document lifecycle states and rationale retrieval policy in README and relevant skills.
- [ ] **P5.T4** Document that `.plan/_index/` is generated/cache and ignored, while topic Markdown/JSONL artifacts are committed rationale.
- [ ] **P5.T5** Document that final concise ADR generation to `docs/` is deferred to a separate proposal.

Validation:

- [ ] **P5.V1** `npm run typecheck` passes after extension parameter updates.
- [ ] **P5.V2** README and skill docs describe `code`, `plans`, and `all` scopes consistently.
- [ ] **P5.V3** Tool prompt guidelines tell agents to verify candidates and use explicit rationale retrieval rather than broad hidden-directory search.

### Phase P6 — Final integration validation and migration notes

- **Status:** pending
- **Depends on:** P4, P5
- **Objective:** Validate the full workflow, update this plan's lifecycle metadata, and provide migration notes for existing `.plan/` artifacts.
- **Source references:** `package.json`, `.plan/retrieval-workflow/proposal.md`, `.plan/retrieval-workflow/plan.md`, `.plan/retrieval-workflow/plan.nodes.jsonl`, `.plan/retrieval-workflow/plan.edges.jsonl`

Checklist:

- [ ] **P6.T1** Run the full project check suite and record command output in implementation notes.
- [ ] **P6.T2** Validate map/fact/plan JSONL artifacts for `retrieval-workflow`.
- [ ] **P6.T3** Add migration notes for existing `.plan/` topics that lack lifecycle metadata.
- [ ] **P6.T4** Mark completed phases as `implemented` and record commit SHAs in plan graph metadata during implementation.
- [ ] **P6.T5** Confirm `.plan/_index/` is ignored and no generated SQLite/cache artifacts are staged.

Validation:

- [ ] **P6.V1** `npm run check` passes.
- [ ] **P6.V2** `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic retrieval-workflow --json` passes.
- [ ] **P6.V3** `python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic retrieval-workflow --json` passes.
- [ ] **P6.V4** `git status --short` shows only intentional source, tests, docs, and committed `.plan/retrieval-workflow/` artifacts; `.plan/_index/` is not staged.

## Cross-Phase Validation

Run before final completion:

```bash
npm run check
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic retrieval-workflow --json
python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic retrieval-workflow --json
```

## Risks

- Query-scope support could accidentally index `.plan/_index/` cache files; guard with explicit excludes.
- Lifecycle warnings could be too noisy at first; start with warnings before promoting to hard errors.
- Miss logging could become telemetry noise; log only material misses that change workflow direction.
- Context packing could become too clever; keep it deterministic and covered by fixtures.
- Rationale retrieval may surface stale plans; require lifecycle/freshness checks before using old artifacts as guidance.
