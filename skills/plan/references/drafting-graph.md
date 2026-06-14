# Plan Drafting and Graph Reference

Read when drafting `.plan/<topic>/plan.md` or generating plan graph artifacts.

## Plan structure

Use this structure:

```markdown
# <topic> Plan

## Source Artifacts
## Planning Assumptions
## Phase Dependency Graph
## Phase Summary
## Phases
### Phase P0 — <name>
- **Status:** pending
- **Depends on:** none
- **Unlocks:** P1
- **Primary references:** ...
#### Objective
#### Scope
#### Checklist
#### Validation
#### Testing Strategy Trace
#### Exit Criteria
#### Risks and Mitigations
#### Notes for Execution Agent
## Cross-Phase Validation
## Open Questions
## Handoff Guidance
```

## Phase rules

- Use stable phase IDs: `P0`, `P1`, `P2`.
- Keep phases dependency-aware and topologically ordered.
- Declare `Status:` for each phase.
- Declare `Depends on:` and `Unlocks:`.
- Include objective, scope, checklist, validation, exit criteria, risks, and execution notes.
- Use task IDs like `P1.T1` and validation IDs like `P1.V1`.
- Prefer coherent reviewable phases over vague milestones.
- Keep implementation code changes out of the planning phase.

## Testing trace

For behavior-changing work, derive validation from accepted design Testing Strategy and include:

- design/testing-strategy refs;
- covered `REQ-*` and `SCN-*` IDs;
- validation layer: static, unit, integration, E2E, contract/golden, or manual-assisted;
- concrete test files, fixtures, scenarios, commands, or named evidence;
- E2E contribution or justified non-applicability.

Include a coverage matrix or equivalent trace so every topic requirement/scenario has validation coverage or an explicit exception.

## Graph generation

After the Markdown plan is ready, use `cartographer_plan generate-graph` or the CLI `plan-generate-graph` fallback. Treat `plan.nodes.jsonl` and `plan.edges.jsonl` as wrapper/script outputs derived from `plan.md`.

Expected graph coverage:

- root plan node;
- phase nodes;
- checklist task nodes;
- validation and cross-phase validation nodes;
- `contains`, `depends_on`, `unlocks`, `validates`, and `references` edges when applicable.
