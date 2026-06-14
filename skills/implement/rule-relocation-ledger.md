# Implement Skill Rule Relocation Ledger

This ledger records the P1 split of `skills/implement/SKILL.md` into a compact kernel plus one-level references.

| Original area | New home | Rationale |
|---|---|---|
| Required inputs/supporting artifacts | `SKILL.md` Inputs | Kept in kernel as activation/source-of-truth context. |
| Source-of-truth boundaries | `SKILL.md` Hard Rules; `references/state-compaction.md`; `references/finalization-adr.md` | Kernel keeps hard boundaries; details moved to references. |
| Single-writer execution | `SKILL.md` Hard Rules; `references/retrieval-delegation.md` | Kept as hard rule and specialist policy. |
| Wrapper-first lifecycle contract | `SKILL.md` Procedure; `references/execution-loop.md`; `references/state-compaction.md` | Kernel keeps required wrapper sequence; details moved. |
| State and journal mutation | `references/state-compaction.md` | Low-frequency details; kernel points to reference. |
| Validation and gates | `SKILL.md` Procedure; `references/validation-gates.md` | Kernel keeps auditor requirement; details moved. |
| Plan/topic orientation | `SKILL.md` Procedure | Kept as primary execution path. |
| Subagent/specialist details | `SKILL.md` Specialist Roles; `references/retrieval-delegation.md` | Kernel keeps allowed roles; detailed fallback policy moved. |
| Repository safety and commit discipline | `SKILL.md` Procedure; `references/execution-loop.md` | Kernel keeps status/commit requirement; details moved. |
| Retrieval plan guidance | `references/retrieval-delegation.md` | Low-frequency context-gathering detail. |
| Phase checklist/status updates | `SKILL.md` Procedure; `references/execution-loop.md` | Kernel keeps wrapper requirement; details moved. |
| Quality command ordering and repair loops | `references/validation-gates.md` | Low-frequency validation detail. |
| Auditor prompt snippets | `references/validation-gates.md`; `references/retrieval-delegation.md` | Converted to operating guidance instead of prompt blocks. |
| Compaction trigger details | `references/state-compaction.md` | Low-frequency details; kernel keeps phase-end compact step. |
| Requirements fold and ADR handling | `SKILL.md` Finalize; `references/finalization-adr.md` | Kernel keeps final obligation; details moved. |
| Legacy pathfinder opt-in prompt | `references/retrieval-delegation.md` | Preserved as retired/fallback policy, not kernel prose. |
| Pitfalls and verification checklist | `SKILL.md` Hard Rules and Validation Checklist; references by topic | Deduplicated into shorter hard rules and reference details. |

No safety/privacy/wrapper/validation rule was intentionally deleted without a new home. Routine explanatory prose and repeated rationale were removed as duplicate/non-operational text.
