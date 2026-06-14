# context-bloat-audit Implementation Plan Outline (Draft)

Noncanonical drafter output for parent review. Do not treat as accepted `plan.md` text until applied through the normal Cartographer plan flow.

## P0 — Baseline inventory and budgets

- **Depends on:** approved proposal/requirements/design; existing evidence artifacts.
- **Design trace:** `DES-CBA-001`, `COMP-CBA-001`, `ALT-CBA-004`.
- **Requirement/scenario trace:** `REQ-CBA-001`; `SCN-CBA-001`, `SCN-CBA-002`; `AC-CBA-001`, `AC-CBA-002`.
- **Major tasks:**
  - Add deterministic context inventory script or wrapper mode for root `AGENTS.md`, child `AGENTS.md`, high-use skills, references, compaction/resume payloads, and active tool/schema estimates.
  - Define and encode initial pass/fail budgets from design targets.
  - Produce baseline report and changed-file before/after delta format.
- **Validation items:**
  - Unit tests using temporary mock projects only.
  - Fixture verifies sorted top bloat sources and threshold pass/fail deltas.
  - Run targeted script checks plus relevant lint/format checks.

## P1 — Compact `implement` skill kernel

- **Depends on:** P0 baseline and budget report.
- **Design trace:** `DES-CBA-002`, `DES-CBA-006`, `COMP-CBA-002`; risks `RISK-CBA-001`, `RISK-CBA-002`.
- **Requirement/scenario trace:** `REQ-CBA-002`, `REQ-CBA-006`; `SCN-CBA-003`, `SCN-CBA-004`, `SCN-CBA-011`; `AC-CBA-003`, `AC-CBA-004`, `AC-CBA-005`, `AC-CBA-015`, `AC-CBA-016`.
- **Major tasks:**
  - Refactor `skills/implement/SKILL.md` to the approved compact kernel target.
  - Move low-frequency details into one-level `references/*.md` files named from the kernel.
  - Create or update a rule relocation ledger for every moved, tooling-owned, or duplicate-deleted rule.
- **Validation items:**
  - Inventory confirms `implement` kernel budget and one-level references.
  - Reference-link and skill-language checks pass.
  - Representative implement dry-run confirms wrapper sequence, stop conditions, safety rules, and next reference are discoverable.

## P2 — Compact `plan` and `proposal` skill kernels

- **Depends on:** P1 validated without behavior loss.
- **Design trace:** `DES-CBA-002`, `DES-CBA-006`, `COMP-CBA-002`; risks `RISK-CBA-001`, `RISK-CBA-002`.
- **Requirement/scenario trace:** `REQ-CBA-002`, `REQ-CBA-006`; `SCN-CBA-004`, `SCN-CBA-011`; `AC-CBA-003`, `AC-CBA-004`, `AC-CBA-005`, `AC-CBA-015`, `AC-CBA-016`.
- **Major tasks:**
  - Refactor `skills/plan/SKILL.md` and `skills/proposal/SKILL.md` to approved compact kernel targets.
  - Split schemas, examples, fallback paths, prompt templates, and low-frequency lifecycle details into one-level references.
  - Extend the relocation ledger and remove only documented duplicates.
- **Validation items:**
  - Inventory confirms plan/proposal kernel budgets and reference depth.
  - Proposal and plan workflow dry-runs preserve requirements/design gates, human approvals, validation receipts, and graph discipline.
  - Run script syntax checks and relevant tests for touched skill tooling.

## P3 — AGENTS.md locality and scoped-instruction cleanup

- **Depends on:** P0 baseline; may run after or alongside P1/P2 if conflicts are controlled.
- **Design trace:** `DES-CBA-003`, `COMP-CBA-003`; supported by `F008`, `F010`.
- **Requirement/scenario trace:** `REQ-CBA-003`; `SCN-CBA-005`, `SCN-CBA-006`; `AC-CBA-006`, `AC-CBA-007`, `AC-CBA-008`.
- **Major tasks:**
  - Audit root `AGENTS.md` for project-wide-only rules.
  - Audit `skills/AGENTS.md` as a scoped child instruction file, resolving line-length and duplicate-rule warnings or recording exceptions.
  - Document parent/child ownership boundaries; do not reintroduce removed DOX framework mechanics.
- **Validation items:**
  - Inventory reports before/after sizes for root and child `AGENTS.md` files.
  - Lint/readability checks pass or have explicit exceptions.
  - Scenario review confirms non-skills work avoids skill-specific rules while skills work receives the child rules.

## P4 — State-aware resume primer

- **Depends on:** P0 inventory; should account for post-P1/P2 kernel structure.
- **Design trace:** `DES-CBA-004`, `COMP-CBA-004`; risk `RISK-CBA-003`.
- **Requirement/scenario trace:** `REQ-CBA-004`; `SCN-CBA-007`, `SCN-CBA-008`; `AC-CBA-009`, `AC-CBA-010`, `AC-CBA-011`.
- **Major tasks:**
  - Add or extend state/transition tooling to emit a compact resume primer from state, receipts, and context packs.
  - Include topic, lifecycle/phase, next action, working set, validation receipts, blockers, and critical rules/reference pointers.
  - Enforce fixed target size and avoid copying raw transcript content into durable artifacts.
- **Validation items:**
  - Unit tests generate primers from mock `.cartographer` state, receipts, and context packs in temporary projects.
  - Repeated-compaction fixture verifies bounded summary growth or externalized detail.
  - Manual-assisted resume smoke confirms agent can identify the next wrapper action without full legacy skill text.

## P5 — Tool/schema overhead audit and low-risk reductions

- **Depends on:** P0 inventory; P1/P2 should be stable enough to avoid confusing tool overhead with skill overhead.
- **Design trace:** `DES-CBA-005`, `COMP-CBA-005`; risk `RISK-CBA-004`; deferred alternative `ALT-CBA-003`.
- **Requirement/scenario trace:** `REQ-CBA-005`; `SCN-CBA-009`, `SCN-CBA-010`; `AC-CBA-012`, `AC-CBA-013`, `AC-CBA-014`.
- **Major tasks:**
  - Measure active tool count and estimated schema/prompt-snippet cost by workflow phase.
  - Apply only low-risk reductions first: shorter descriptions/snippets, phase guidance, and consolidation where guardrails remain visible.
  - Record whether phase-scoped active-tool profiles or deferred discovery require a follow-up design/ADR decision.
- **Validation items:**
  - Tool inventory report covers proposal/design vs implementation phases.
  - Checks prove mutation wrappers, validation wrappers, and auditability guardrails remain reachable.
  - Targeted TypeScript checks for extension/tool changes.

## P6 — Final regression, documentation fold-in, and ADR

- **Depends on:** P1-P5 validation evidence complete.
- **Design trace:** `DES-CBA-006`, `TEST-CBA-001`, `ALT-CBA-004`.
- **Requirement/scenario trace:** all requirements; especially `REQ-CBA-006`, `SCN-CBA-012`, `AC-CBA-015`, `AC-CBA-016`, `AC-CBA-017`.
- **Major tasks:**
  - Run final inventory and compare against P0 baseline.
  - Fold accepted requirement/design deltas into docs and relevant AGENTS/skill docs.
  - Produce ADR capturing validated hybrid architecture, skill packaging conventions, resume behavior, and tool-loading outcome.
- **Validation items:**
  - Run `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic context-bloat-audit --json` after graph/doc updates.
  - Run `npm run check:scripts`, targeted tests, lint/format checks, and the aggregate `npm run check` if scope warrants.
  - Auditor review should confirm relocation ledger completeness, behavior preservation, and ADR readiness.

## Validation command candidates

- `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic context-bloat-audit --json`
- `npm run check:scripts`
- `npm run typecheck`
- `npm run lint:ts`
- `npm run lint:py`
- `npm run format:prettier:check`
- `npm run format:check`
- `npm run test:py`
- `npm run test:ts`
- `npm run check` for final regression when runtime cost is acceptable.

## References used

- `.plan/context-bloat-audit/proposal.md`
- `.plan/context-bloat-audit/design.md`
- `.plan/context-bloat-audit/requirements.nodes.jsonl`
- `.plan/context-bloat-audit/requirements.edges.jsonl`
- `.plan/context-bloat-audit/design.nodes.jsonl`
- `.plan/context-bloat-audit/design.edges.jsonl`
- `.plan/context-bloat-audit/facts.nodes.jsonl`
- `.plan/context-bloat-audit/context-packs.jsonl`
- `package.json` scripts (`F009`)

## Unresolved questions

- Exact inventory script path/name is still a plan decision: design allows `skills/plan/scripts/context_inventory.*` or an equivalent wrapper mode.
- Exact acceptance thresholds beyond the initial design budgets should be finalized after P0 baseline output.
- Whether tool profiles/deferred discovery become in-scope implementation or follow-up work depends on P5 measurements.
