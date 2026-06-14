# context-bloat-audit Design

## Source Artifacts

- `.plan/context-bloat-audit/proposal.md`
- `.plan/context-bloat-audit/requirements.md`
- `.plan/context-bloat-audit/requirements.nodes.jsonl`
- `.plan/context-bloat-audit/requirements.edges.jsonl`
- `.plan/context-bloat-audit/evidence/context-size-audit.md`
- `.plan/context-bloat-audit/evidence/workflow-session-analysis.md`

## Design Summary

Use a hybrid context-reduction architecture:

1. add a deterministic context inventory/budget script;
2. split high-use workflow skills into compact kernels plus one-level references;
3. keep AGENTS.md rules local and budgeted;
4. emit compact state-aware resume primers from Cartographer state/receipt/context-pack tooling;
5. audit tool/schema overhead and choose the least invasive reduction path that Pi supports.

This avoids a risky single-shot rewrite while directly addressing the largest measured bloat sources: full skill reinjection, large compaction summaries, skill/AGENTS.md rule concentration, and tool schema overhead [F001] [F002] [F003] [F007] [F008].

## Decisions

### DES-CBA-001 — Deterministic context inventory first

Create a bounded inventory script or wrapper mode before rewriting skills. It should report character and approximate-token estimates for root `AGENTS.md`, child AGENTS.md files, skill descriptions, high-use `SKILL.md` files, reference files, compaction summaries, state-resume payloads, and active Cartographer tool definitions.

Satisfies: `REQ-CBA-001`.

Rationale: Requirements need measurable budgets and before/after deltas. The existing evidence was produced manually; implementation should make this repeatable and safe for regression checks [F001] [F002] [F003] [F008].

### DES-CBA-002 — Skill kernels plus one-level references

Refactor `skills/implement/SKILL.md`, then `skills/plan/SKILL.md`, then `skills/proposal/SKILL.md` into compact operating kernels. Each kernel keeps only trigger guidance, hard safety rules, primary loop, required wrappers/gates, stop conditions, and named references. Move low-frequency details into one-level `references/*.md` files.

Satisfies: `REQ-CBA-002`, `REQ-CBA-006`.

Initial target budgets:

| File family | Target |
|---|---:|
| `skills/implement/SKILL.md` kernel | <= 8k chars |
| `skills/plan/SKILL.md` kernel | <= 10k chars |
| `skills/proposal/SKILL.md` kernel | <= 10k chars |
| Reference file depth | one level from `SKILL.md` |
| Individual reference file | preferably <= 8k chars unless justified |

Rationale: Pi and Agent Skills already implement progressive disclosure: full `SKILL.md` loads on activation while references load on demand [F004] [F005]. The current high-use skills are 28k-48k chars and should not be the default post-compaction payload [F003].

### DES-CBA-003 — AGENTS.md locality with lint-clean child rules

Keep root `AGENTS.md` limited to project-wide rules and move subtree-specific rules to child AGENTS.md files. Treat `skills/AGENTS.md` as a first-class context source that must meet line-length/readability, deduplication, and budget checks. Do not plan DOX framework/index work; the project now uses scoped `AGENTS.md` instruction files without the removed DOX section.

Satisfies: `REQ-CBA-003`.

Initial target budgets:

| AGENTS.md file type | Target |
|---|---:|
| root `AGENTS.md` | <= 4k chars |
| child `AGENTS.md` files | <= 5k chars unless justified |
| line-length warnings | zero or explicit exception |

Rationale: The user already split skill-authoring rules from root into `skills/AGENTS.md`, reducing the root baseline but creating a child context that still needs cleanup and budget validation [F008]. The DOX framework has also been removed, so the design should optimize scoped `AGENTS.md` files without preserving DOX-specific mechanics [F010].

### DES-CBA-004 — State-aware resume primer

Add or extend Cartographer state/transition tooling so implementation resume produces a compact primer from `.cartographer/<topic>/state.json`, context packs, and receipt summaries. The primer should include topic, lifecycle/phase, next action, working set, validation receipts, blockers, and 10-20 critical rules or reference pointers. Avoid historical narrative unless needed for unresolved decisions.

Satisfies: `REQ-CBA-004`.

Initial target budgets:

| Resume payload | Target |
|---|---:|
| default resume primer | <= 4k chars |
| extended diagnostic primer | <= 8k chars |
| repeated compaction summary growth | no unbounded accumulation |

Rationale: The analyzed session showed repeated post-compaction skill injections and compaction summaries growing to ~20k+ chars [F001] [F002]. Pi exposes compaction customization hooks, so Cartographer can steer compaction/resume toward bounded state rather than transcript narrative [F006].

### DES-CBA-005 — Tool/schema overhead audit before tool architecture changes

Instrument tool/schema context cost by workflow phase before changing active tool behavior. The first implementation should prefer low-risk reductions: shorter prompt snippets, schema description trimming, and phase guidance. If measurements show wrapper tools dominate baseline context, design follow-up may introduce phase-scoped active tool profiles or deferred discovery.

Satisfies: `REQ-CBA-005`.

Rationale: Tool-schema bloat can be large in agent systems, and on-demand tool discovery can reduce it dramatically [F007]. However, Cartographer wrapper tools encode safety and auditability; reducing them before measuring could hide guardrails. The design therefore makes inventory mandatory before deeper tool routing changes.

### DES-CBA-006 — Behavior-preserving phased migration

Implement changes in phases: inventory, split `implement`, validate, split `plan`, validate, split `proposal`, validate, AGENTS.md cleanup, resume-primer tooling, tool/schema audit, final regression/ADR. Every moved or deleted rule must have a recorded new home or duplicate-deletion rationale.

Satisfies: `REQ-CBA-006`.

Rationale: The most important risk is behavior loss, not failure to shrink prose. Phased migration lets validation catch missing wrapper gates, safety rules, or references after each high-use skill changes [F004] [F005].

## Alternatives Considered

### ALT-CBA-001 — Skill-only split

Move details out of `SKILL.md` files but leave compaction/resume and tools unchanged.

- Pros: lower risk and immediate savings for skill activation.
- Cons: does not address compaction summary growth or tool-schema overhead.
- Decision: rejected as insufficient alone.

### ALT-CBA-002 — Tooling-first resume only

Focus on state/transition resume primers and avoid skill edits.

- Pros: directly targets post-compaction continuation.
- Cons: full skill activation remains expensive; proposal/plan/implement stay bloated.
- Decision: rejected as insufficient alone.

### ALT-CBA-003 — Aggressive deferred tool loading first

Implement active-tool profiles or deferred discovery before shrinking skills.

- Pros: could reduce harness-level overhead substantially if tool schemas dominate.
- Cons: higher risk; may affect safety wrappers and is less directly proven as the immediate bloat source in this session.
- Decision: defer until inventory confirms tool/schema cost and Pi extension constraints.

### ALT-CBA-004 — Hybrid phased migration

Combine inventory, skill kernels, AGENTS.md locality, resume primer, and measured tool/schema reduction.

- Pros: addresses all observed bloat families while preserving validation gates.
- Cons: more phases and more validation work.
- Decision: accepted.

## Components

- `skills/plan/scripts/context_inventory.*` or equivalent wrapper mode: reports context size budgets and deltas.
- `skills/*/SKILL.md` kernels: concise activation and primary-loop instructions.
- `skills/*/references/*.md`: low-frequency details, schemas, fallback recipes, delegation prompts, and examples.
- `AGENTS.md` and child `AGENTS.md`: local rule contracts with measured budgets.
- `skills/plan/scripts/cartographer_state.ts` / extension tools: compact state-resume primer support.
- `extensions/cartographer-tools.ts`: tool/schema prompt snippet inventory and potential future active-tool profile support.
- `.plan/context-bloat-audit/*`: validation receipts, context packs, and traceability graph.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Rule loss during skill splitting | rule relocation ledger, one-skill-at-a-time validation, auditor gate |
| References become hard to discover | kernels name exact reference files and trigger conditions |
| Resume primer omits critical blocker | include validation receipts, blockers, next action, and context-pack references |
| Tool-schema reduction hides guardrails | inventory first; preserve wrapper tools until measured design supports reduction |
| AGENTS.md split creates stale/conflicting rules | AGENTS.md locality pass after every change; parent/child index checks |
| Budget targets are too aggressive | allow documented exceptions with measured rationale and residual risk |

## Testing Strategy

### Project evidence

- Languages/tools: TypeScript/TSX, Python, Markdown, JSONL.
- Existing checks: `npm run check:scripts`, `npm run typecheck`, `npm run lint:ts`, `npm run lint:py`, `npm run format:prettier:check`, `npm run format:check`, `npm run dashboard:check`, `npm run test:py`, `npm run test:ts`, and aggregate `npm run check` [F009].
- Existing Cartographer validation: `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic <topic> --json`.
- Related ADR search: no matching accepted ADR records were returned for `compaction skills tool context bloat model routing testing strategy`; ADR finalization remains required after validated design/implementation choices.

### Source-backed docs

- Source-backed docs: Pi skills/compaction docs, Agent Skills specification, Anthropic tool-use guidance, and `package.json` script evidence are captured in facts F004-F009 and should remain cited in proposal/requirements/design artifacts.

### Unit strategy

- Unit strategy: add focused unit tests for new inventory and resume-primer scripts using temporary mock projects only.

### Unit and fixture checks

- Add tests for the context inventory script using temporary mock projects only.
- Add tests that confirm size-budget reports include root AGENTS.md, child AGENTS.md, selected skills, references, and tool/schema estimates.
- Add tests or script checks that validate rule relocation ledger entries resolve to kernel/reference/tool/state locations.
- Add tests for resume-primer generation from mock `.cartographer` state, receipts, and context packs.

### Integration strategy

- Integration strategy: validate graph artifacts, skill reference reachability, script checks, and workflow dry-runs after each split.

### Integration checks

- Run `manage_jsonl.ts validate-topic` for affected planning topics after graph changes.
- Run skill language/reference checks for each split skill.
- Run representative dry-runs or fixture validations for proposal, plan, and implement workflows after each kernel split.
- Run `npm run check:scripts`, targeted unit tests, and relevant lint/format checks after script or skill edits.

### E2E strategy

- E2E strategy: run one manual-assisted Cartographer workflow smoke check on a temporary/mock topic and record evidence under `.plan/context-bloat-audit/evidence/`.

### E2E/smoke checks

At least once before implementation finalization, run a manual-assisted Cartographer workflow smoke check on a temporary/mock topic:

1. load compact `implement` kernel;
2. generate or read a state-resume primer;
3. confirm the agent can identify the next wrapper action and required reference without loading the entire legacy skill text;
4. validate that receipts/context packs remain sufficient for auditor handoff.

This E2E is manual-assisted because it concerns agent context behavior and skill activation, but it must produce a validation receipt or explicit manual evidence note.

### Requirement and scenario coverage

| Requirement | Validation expectation |
|---|---|
| `REQ-CBA-001` | inventory unit tests plus budget report fixture |
| `REQ-CBA-002` | skill size checks, reference link checks, workflow dry-runs |
| `REQ-CBA-003` | AGENTS.md size/lint checks and parent/child scoped-instruction ownership review |
| `REQ-CBA-004` | resume-primer unit tests and compaction/resume smoke evidence |
| `REQ-CBA-005` | tool/schema inventory report and design decision record |
| `REQ-CBA-006` | relocation ledger, phased validation receipts, auditor PASS |

| Scenario | Validation expectation |
|---|---|
| `SCN-CBA-001` | inventory fixture reports sorted top bloat sources for a mock/project checkout |
| `SCN-CBA-002` | changed-file fixture shows before/after budget deltas and threshold pass/fail status |
| `SCN-CBA-003` | implement kernel size check plus resume dry-run confirms next action is discoverable |
| `SCN-CBA-004` | reference link check confirms low-frequency details are reachable by named reference |
| `SCN-CBA-005` | root-only context inventory confirms skill-authoring rules are absent outside `skills/` work |
| `SCN-CBA-006` | `skills/AGENTS.md` lint/size check confirms compact child AGENTS.md behavior or records exception |
| `SCN-CBA-007` | resume-primer fixture resumes from state/context packs without default full skill reload |
| `SCN-CBA-008` | repeated-compaction fixture verifies summaries stay inside the fixed budget or externalize detail |
| `SCN-CBA-009` | proposal/design phase tool inventory shows implementation-only tools are absent or justified |
| `SCN-CBA-010` | implementation phase tool inventory shows proposal-only tools are absent or justified |
| `SCN-CBA-011` | post-split workflow dry-run validates mandatory wrapper sequence and human gates |
| `SCN-CBA-012` | deterministic tool/state test proves any tooling-owned rule emits or enforces its guardrail |

## ADR Follow-up

An ADR is required after implementation validates the selected architecture. It should capture the accepted hybrid approach, any durable tool-loading strategy, compaction/resume behavior, and skill packaging conventions.
