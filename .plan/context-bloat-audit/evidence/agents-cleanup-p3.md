# P3 Scoped AGENTS.md Cleanup Evidence

## Scope

Reviewed and compacted root `AGENTS.md` and `skills/AGENTS.md` as ordinary scoped instruction files.

## Ownership boundaries

- Root `AGENTS.md` is project-wide only:
  - test/temp-artifact safety;
  - Cartographer wrapper/state discipline;
  - authoritative planning/state boundaries;
  - journal/current-state rules.
- `skills/AGENTS.md` is limited to skill-authoring discipline under `skills/`:
  - terse agent-facing skill prose;
  - reference-file depth;
  - trigger descriptions;
  - bundled script interfaces;
  - skill-specific JSONL/wrapper wording guardrails;
  - delegated specialist output contracts.

## Changes

- Added explicit scope note to both files.
- Removed duplicated project-wide wording from `skills/AGENTS.md` while preserving root applicability.
- Wrapped long Markdown lines and ran Prettier on both files.
- Preserved safety/privacy/wrapper/validation semantics.
- No DOX framework mechanics were introduced.

## Measured deltas

From `.plan/context-bloat-audit/evidence/context-inventory-p3.json` against P2 baseline:

- `AGENTS.md`: 2,861 -> 2,643 chars (`-218`), under 4,000 char budget.
- `skills/AGENTS.md`: 4,284 -> 3,949 chars (`-335`), under 5,000 char budget.

## Scoped-instruction behavior review

PASS:

- Non-`skills/` work receives root project-wide rules only from this repository scope.
- Work under `skills/` receives root rules plus skill-authoring discipline from `skills/AGENTS.md`.
- Skill-specific instructions no longer need to be loaded for unrelated non-skills edits.
- The root file now points subtree-specific guidance to nearest child `AGENTS.md`.

## Residual risks

- Existing over-budget inventory items remain outside P3 scope: receipts resume source, tool schema estimate, and current state/resume primer. These are covered by later phases P4/P5/P6.
