# P4 Resume-Primer Smoke Evidence

## Command

```bash
node --experimental-strip-types skills/plan/scripts/cartographer_state.ts \
  resume-primer --root "$PWD" --topic context-bloat-audit --max-chars 4000 --json
```

## Result

PASS.

- `ok`: true
- `chars`: 4000
- `budget_chars`: 4000
- `truncated`: true
- `omitted_sections`: `Selected journal`
- `read_only`: true

## Required resume facts observed

The primer identified:

- topic: `context-bloat-audit`
- source status: `hashes-valid`
- current phase: `P4`
- next action: `P4.T1` / `Implement bounded resume-primer output in Cartographer state tooling and extension wrapper.`
- files to inspect:
  - `skills/plan/scripts/cartographer_state.ts`
  - `extensions/cartographer-tools.ts`
  - `skills/implement/SKILL.md`
  - `skills/implement/references/state-compaction.md`
  - `tests/test_context_resume_primer.py`
  - `tests/cartographer_state.test.ts`
- working set:
  - write scopes for P4 implementation, tests, status, receipts, context pack, and smoke/auditor evidence
  - read-only state/journal/inventory context
  - forbidden private-artifact and generated-index trees
- validation refs from recent P2/P3 receipts
- critical rules:
  - trust disk artifacts over stale transcript memory
  - do not read raw private artifacts
  - use `cartographer_*` wrappers for canonical mutations
  - read compact implement references only when needed
  - first post-compaction response reports current phase, next action, and files to inspect

## Behavior preservation

The smoke output was pointer-based and did not include raw transcripts, raw private paths, full receipts, or full skill text. It stayed within the fixed budget and externalized lower-priority detail through `omitted_sections`/truncation metadata.
