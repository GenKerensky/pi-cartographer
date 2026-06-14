# Context Inventory

Root: `/var/home/falco/code/pi-cartographer/skill-context-optimization`

## Top Context Sources

| Category | Path | Chars | Approx tokens | Budget | Status |
|---|---|---:|---:|---:|---|
| topic-resume-source | `.plan/context-bloat-audit/receipts.jsonl` | 145200 | 36300 | 8000 | over-budget |
| tool-schema-estimate | `extensions/cartographer-tools.ts` | 35349 | 8837 | 12000 | over-budget |
| tool-schema-phase-estimate | `extensions/cartographer-tools.ts#implementation` | 28620 | 7155 | 12000 | over-budget |
| tool-schema-phase-estimate | `extensions/cartographer-tools.ts#proposal-design-planning` | 28303 | 7076 | 12000 | over-budget |
| topic-resume-source | `.plan/context-bloat-audit/context-packs.jsonl` | 10351 | 2588 | 8000 | over-budget |
| skill-kernel:proposal | `skills/proposal/SKILL.md` | 7335 | 1834 | 10000 | measured |
| skill-kernel:implement | `skills/implement/SKILL.md` | 6656 | 1664 | 8000 | measured |
| skill-kernel:plan | `skills/plan/SKILL.md` | 6585 | 1646 | 10000 | measured |
| resume-primer | `.cartographer/context-bloat-audit/state.json` | 6155 | 1539 | 4000 | over-budget |
| child-agents | `skills/AGENTS.md` | 3949 | 987 | 5000 | measured |
| root-agents | `AGENTS.md` | 2643 | 661 | 4000 | measured |
| skill-reference | `skills/implement/references/state-compaction.md` | 2178 | 544 | 8000 | measured |
| skill-reference | `skills/plan/references/drafting-graph.md` | 2085 | 521 | 8000 | measured |
| skill-reference | `skills/plan/references/validation-audit.md` | 2077 | 519 | 8000 | measured |
| skill-reference | `skills/proposal/references/mapping-facts.md` | 2062 | 516 | 8000 | measured |
| skill-reference | `skills/implement/references/validation-gates.md` | 2011 | 503 | 8000 | measured |
| skill-reference | `skills/proposal/references/scope-next-artifacts.md` | 1991 | 498 | 8000 | measured |
| skill-reference | `skills/proposal/references/retrieval-delegation.md` | 1979 | 495 | 8000 | measured |
| skill-reference | `skills/proposal/references/intake-private-adr.md` | 1957 | 489 | 8000 | measured |
| skill-reference | `skills/plan/references/retrieval-delegation.md` | 1928 | 482 | 8000 | measured |
| skill-reference | `skills/plan/references/inputs-gates.md` | 1897 | 474 | 8000 | measured |
| skill-reference | `skills/proposal/references/validation-audit.md` | 1867 | 467 | 8000 | measured |
| skill-reference | `skills/implement/references/execution-loop.md` | 1801 | 450 | 8000 | measured |
| skill-reference | `skills/implement/references/retrieval-delegation.md` | 1637 | 409 | 8000 | measured |
| skill-reference | `skills/implement/references/finalization-adr.md` | 1563 | 391 | 8000 | measured |
| skill-reference | `skills/plan/references/context-inventory.md` | 821 | 205 | 8000 | measured |

## Tool/Schema Phase Estimates

| Phase | Estimated chars | Approx tokens | Tools |
|---|---:|---:|---|
| implementation | 28620 | 7155 | `cartographer_adr,cartographer_artifacts,cartographer_compact_context,cartographer_context_pack,cartographer_handoff,cartographer_implement,cartographer_index,cartographer_jsonl,cartographer_plan_status,cartographer_receipt,cartographer_state,cartographer_transition,cartographer_validation` |
| proposal-design-planning | 28303 | 7076 | `cartographer_adr,cartographer_artifacts,cartographer_context_pack,cartographer_evidence,cartographer_fact,cartographer_handoff,cartographer_index,cartographer_jsonl,cartographer_plan,cartographer_proposal,cartographer_receipt,cartographer_session,cartographer_transition,cartographer_validation` |

## Largest Tool Definitions

| Tool | Estimated chars | Schema markers | Prompt chars |
|---|---:|---:|---:|
| cartographer_adr | 5450 | 107 | 71 |
| cartographer_index | 4136 | 87 | 56 |
| cartographer_state | 3093 | 53 | 94 |
| cartographer_handoff | 2391 | 43 | 70 |
| cartographer_artifacts | 2151 | 43 | 101 |
| cartographer_evidence | 2122 | 38 | 89 |
| cartographer_jsonl | 1800 | 32 | 63 |
| cartographer_validation | 1784 | 29 | 85 |
| cartographer_compact_context | 1676 | 25 | 69 |
| cartographer_transition | 1640 | 30 | 73 |
| cartographer_proposal | 1554 | 28 | 95 |
| cartographer_implement | 1406 | 25 | 63 |

## Active Skill Descriptions

| Skill | Path | Description chars | Approx tokens |
|---|---|---:|---:|
| implement | `skills/implement/SKILL.md` | 252 | 63 |
| proposal | `skills/proposal/SKILL.md` | 239 | 60 |
| index-project | `skills/index-project/SKILL.md` | 223 | 56 |
| dashboard | `skills/dashboard/SKILL.md` | 219 | 55 |
| plan | `skills/plan/SKILL.md` | 202 | 50 |
| requirements | `skills/requirements/SKILL.md` | 169 | 42 |
| interview | `skills/interview/SKILL.md` | 160 | 40 |
| model-config | `skills/model-config/SKILL.md` | 156 | 39 |
| design | `skills/design/SKILL.md` | 130 | 32 |
