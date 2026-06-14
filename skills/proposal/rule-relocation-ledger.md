# Proposal Skill Rule Relocation Ledger

This ledger records the P2 split of `skills/proposal/SKILL.md` into a compact kernel plus one-level references.

| Original area | New home | Rationale |
|---|---|---|
| Activation and parent orchestration | `SKILL.md` When to Use / Hard Rules | Kept in kernel for routing and authority boundaries. |
| Output/private artifact paths | `SKILL.md` Outputs | Kept in kernel as source-of-truth paths. |
| Wrapper-first mutation contract | `SKILL.md` Hard Rules / Procedure | Kept as required sequence; details moved. |
| Topic initialization skeleton | `SKILL.md` Procedure; `references/intake-private-adr.md` | Kernel keeps required sections; skeleton/detail moved. |
| Private-artifact intake and redaction | `SKILL.md` Hard Rules; `references/intake-private-adr.md` | Kernel keeps privacy prohibitions; workflow details moved. |
| ADR evaluation guidance | `SKILL.md` Procedure; `references/intake-private-adr.md` | Kernel keeps metadata obligation; detailed triggers moved. |
| Subagent mode and serial fallback | `SKILL.md` Procedure; `references/retrieval-delegation.md` | Kernel keeps ask-before-serial rule; details moved. |
| Index refresh and map generation | `SKILL.md` Procedure; `references/mapping-facts.md` | Kernel keeps required index/map sequence; details moved. |
| Retrieval plan guidance | `references/retrieval-delegation.md` | Low-frequency detail. |
| Map JSONL shapes/examples | `references/mapping-facts.md` | Reduced to concise field expectations. |
| Research fact graph rules | `SKILL.md` Hard Rules; `references/mapping-facts.md` | Kernel keeps fact-support requirement; details moved. |
| Scope Gate and Next Artifacts | `SKILL.md` Procedure; `references/scope-next-artifacts.md` | Kernel keeps gate obligation; detailed criteria moved. |
| Deterministic validation/auditor gate | `SKILL.md` Procedure; `references/validation-audit.md` | Kernel keeps mandatory validation; criteria moved. |
| Delegation prompts/structured contracts | `references/retrieval-delegation.md` | Converted to role and least-privilege guidance. |
| Pitfalls and verification checklist | `SKILL.md` Verification Checklist; topical references | Deduplicated and shortened. |

No safety, privacy, wrapper, fact-support, validation, ADR, or requirements/design gate rule was intentionally deleted without a new home. Long examples, repeated fallback prose, and prompt snippets were reduced to operational references.
