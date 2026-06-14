# P5 Tool/Schema Overhead Review

## Inventory result

`tool-inventory.json` / `tool-inventory.md` were generated with:

```bash
python skills/plan/scripts/context_inventory.py \
  --root "$PWD" \
  --topic context-bloat-audit \
  --baseline .plan/context-bloat-audit/evidence/context-inventory-p3.json \
  --json-out .plan/context-bloat-audit/evidence/tool-inventory.json \
  --out .plan/context-bloat-audit/evidence/tool-inventory.md \
  --json
```

Key measured estimates after low-risk description shortening:

- all Cartographer tools: 18 registered tools, estimated 35,349 chars / 8,837 tokens
- proposal/design/planning phase set: estimated 28,303 chars / 7,076 tokens
- implementation phase set: estimated 28,620 chars / 7,155 tokens
- largest tool contributors: `cartographer_adr`, `cartographer_index`, `cartographer_state`, `cartographer_handoff`, `cartographer_artifacts`

## Low-risk reductions applied

Shortened repeated, low-semantic-risk schema descriptions in `extensions/cartographer-tools.ts`, including:

- `Project root. Defaults to current working directory.` -> `Project root.`
- `Inline output budget before saving a full-output receipt.` -> `Inline output budget.`
- `Optional full-output path for oversized output.` -> `Full output path.`
- `Return raw command output instead of a compact receipt.` -> `Return raw output.`
- repeated topic/phase/receipt labels to concise equivalents

These preserve wrapper visibility and safety semantics while removing repeated boilerplate from emitted tool schemas.

## Guardrail reachability review

The following wrappers remain registered and visible after reductions:

- mutation/state: `cartographer_state`, `cartographer_plan_status`, `cartographer_implement`
- validation/evidence: `cartographer_validation`, `cartographer_receipt`, `cartographer_context_pack`
- lifecycle/audit: `cartographer_transition`, `cartographer_handoff`, `cartographer_adr`
- proposal/planning support: `cartographer_proposal`, `cartographer_fact`, `cartographer_plan`, `cartographer_jsonl`
- read-only context: `cartographer_index`, `cartographer_artifacts`
- privacy/session support: `cartographer_evidence`, `cartographer_session`
- compaction: `cartographer_compact_context`

No wrapper was removed or hidden.

## Recommendation

Defer active-tool profiles/deferred discovery to a follow-up design/ADR rather than implementing in this phase. Measurements show the dominant overhead is full wrapper schema availability, not prompt snippets alone. Safe schema text shortening helps but cannot bring phase estimates under the current 12k target without changing tool-loading semantics. Such a change could hide validation, mutation, audit, state, or transition guardrails and needs separate design/ADR coverage.
