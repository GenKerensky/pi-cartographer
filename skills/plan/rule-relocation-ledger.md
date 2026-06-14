# Plan Skill Rule Relocation Ledger

This ledger records the P2 split of `skills/plan/SKILL.md` into a compact kernel plus one-level references.

| Original area | New home | Rationale |
|---|---|---|
| Activation and non-implementation boundary | `SKILL.md` When to Use / Hard Rules | Kept in kernel for routing safety. |
| Output artifact list | `SKILL.md` Outputs | Kept in kernel as source-of-truth paths. |
| Requirements/design artifact guidance | `references/inputs-gates.md` | Detailed gate rules moved; kernel retains stop/preserve obligations. |
| Testing Strategy trace requirements | `SKILL.md` Hard Rules; `references/drafting-graph.md` | Kernel keeps requirement; detailed metadata moved. |
| Wrapper-first mutation contract | `SKILL.md` Hard Rules / Procedure | Kept as kernel sequence; detailed commands moved to references. |
| Existing-artifact reconciliation | `SKILL.md` Procedure | Kept as common safety rule. |
| Subagent mode/substitution rules | `SKILL.md` Procedure; `references/retrieval-delegation.md` | Kernel keeps ask-before-fallback rule; details moved. |
| Index refresh and map context | `SKILL.md` Procedure; `references/retrieval-delegation.md` | Kernel keeps required index/retrieval sequence; details moved. |
| Retrieval plan guidance | `references/retrieval-delegation.md` | Low-frequency detail. |
| Phase drafting structure | `SKILL.md` Procedure; `references/drafting-graph.md` | Kernel keeps section list; detailed structure moved. |
| Plan graph examples/schema snippets | `references/drafting-graph.md` | Converted from verbose examples to concise graph expectations. |
| JSONL and graph validation | `SKILL.md` Procedure; `references/validation-audit.md` | Kernel keeps mandatory validation; criteria moved. |
| Auditor handoff criteria | `references/validation-audit.md` | Detailed PASS/FAIL criteria moved. |
| Delegation prompts and structured contracts | `references/retrieval-delegation.md` | Converted to role guidance and least-privilege rules. |
| Lifecycle/retrieval contract | `SKILL.md` Hard Rules; `references/retrieval-delegation.md`; `references/inputs-gates.md` | Deduplicated into kernel hard rules plus topical references. |
| Pitfalls and verification checklist | `SKILL.md` Verification Checklist; topical references | Deduplicated and shortened. |

No safety, privacy, wrapper, validation, ADR, fact-support, or requirements/design gate rule was intentionally deleted without a new home. Long examples, repeated fallback prose, and prompt snippets were reduced to operational references.
