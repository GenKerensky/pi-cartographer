# Session Analysis: 2026-06-13T18-57-04-915Z_019ec258-4393-710a-8fcf-eeae6912fb0a.jsonl

## Source Handling

- Input basename: `2026-06-13T18-57-04-915Z_019ec258-4393-710a-8fcf-eeae6912fb0a.jsonl`
- Analyzer: `skills/plan/scripts/analyze_session.py`
- Raw transcript handling: raw message/tool contents are not reproduced; counts, lengths, durations, commands, and tool names are summarized.
- Max output chars setting: 12000

## Summary

- Entries: 1199
- Bytes: 3861445
- Invalid lines: 0
- Roles: `{"assistant": 559, "toolResult": 607, "unknown": 14, "user": 19}`
- Tools: `{"ask_user_question": 2, "bash": 244, "cartographer_adr": 4, "cartographer_artifacts": 9, "cartographer_compact_context": 12, "cartographer_context_pack": 38, "cartographer_fact": 24, "cartographer_handoff": 34, "cartographer_implement": 50, "cartographer_index": 14, "cartographer_jsonl": 55, "cartographer_plan": 6, "cartographer_plan_status": 117, "cartographer_proposal": 10, "cartographer_receipt": 4, "cartographer_state": 20, "cartographer_transition": 21, "cartographer_validation": 122, "edit": 100, "query-docs": 6, "read": 186, "resolve-library-id": 6, "subagent": 41, "write": 22}`
- Tool errors: `{"bash": 5, "cartographer_context_pack": 1, "cartographer_handoff": 4, "cartographer_implement": 4, "cartographer_plan_status": 3, "cartographer_receipt": 2, "cartographer_state": 1, "cartographer_transition": 2, "cartographer_validation": 16, "edit": 4, "subagent": 2}`
- Token totals: `{}`
- Cost totals: `{"cost": 10.942774}`

## Largest Tool/Text Outputs

| Line | Role | Tool | Chars |
|---|---|---|---|
| 1161 | toolResult | bash | 44627 |
| 364 | user |  | 39007 |
| 167 | toolResult | bash | 36407 |
| 304 | toolResult | read | 31951 |
| 274 | toolResult | bash | 28266 |
| 476 | user |  | 28119 |
| 1051 | user |  | 28083 |
| 308 | toolResult | bash | 27835 |
| 399 | assistant | write | 26344 |
| 170 | toolResult | bash | 26261 |

## Longest Timed Turns

| Line | Role | Tool | Duration ms |
|---|---|---|---|
| 988 | toolResult | subagent | 100708 |
| 398 | toolResult | subagent | 91995 |
| 510 | toolResult | subagent | 77682 |
| 842 | toolResult | subagent | 76750 |
| 412 | toolResult | subagent | 72998 |
| 920 | toolResult | subagent | 70518 |
| 738 | toolResult | subagent | 66795 |
| 848 | toolResult | subagent | 60471 |
| 826 | toolResult | subagent | 55836 |
| 767 | toolResult | subagent | 54470 |

## Repeated Commands

| Command ID | Count | Command Chars |
|---|---|---|
| command-001 | 15 | 128 |
| command-002 | 15 | 18 |
| command-003 | 8 | 99 |
| command-004 | 8 | 37 |
| command-005 | 7 | 81 |
| command-006 | 7 | 13 |
| command-007 | 6 | 61 |
| command-008 | 3 | 21 |
| command-009 | 3 | 15 |
| command-010 | 2 | 77 |

## Subagent Outcomes by Agent

| Agent | Calls | Errors | Timeouts | Longest duration ms |
|---|---|---|---|---|
| cartographer-auditor | 33 | 1 | 0 | 100708 |
| cartographer-drafter | 2 | 1 | 0 | 91995 |
| unknown | 6 | 0 | 0 | 0 |

## Longest Subagent Durations

| Line | Agent | Tool | Duration ms |
|---|---|---|---|
| 988 | cartographer-auditor | subagent | 100708 |
| 398 | cartographer-drafter | subagent | 91995 |
| 510 | cartographer-auditor | subagent | 77682 |
| 842 | cartographer-auditor | subagent | 76750 |
| 412 | cartographer-auditor | subagent | 72998 |
| 920 | cartographer-auditor | subagent | 70518 |
| 738 | cartographer-auditor | subagent | 66795 |
| 848 | cartographer-auditor | subagent | 60471 |
| 826 | cartographer-auditor | subagent | 55836 |
| 767 | cartographer-auditor | subagent | 54470 |

## Subagent Field Usage

| Field group | Visible records |
|---|---|
| acceptance | 19 |
| control | 17 |
| timeout | 17 |

## Subagent Timeouts

_None observed._

## Non-Subagent Timeout Mentions

| Line | Role | Tool |
|---|---|---|
| 20 | toolResult | query-docs |
| 21 | assistant |  |
| 170 | toolResult | bash |
| 274 | toolResult | bash |
| 304 | toolResult | read |
| 308 | toolResult | bash |
| 364 | user |  |
| 382 | toolResult | bash |
| 396 | toolResult | read |
| 476 | user |  |

## Tooling Friction Summary

| Category | Records |
|---|---|
| cartographer-cli/tool-usage | 690 |
| schema/tool-validation | 43 |
| exact-edit-failure | 4 |
| custom-script-creation | 3 |
| command-not-found | 3 |

## Compaction Events

| Line | Role | Tool |
|---|---|---|
| 103 | unknown |  |
| 297 | unknown |  |
| 363 | unknown |  |
| 475 | unknown |  |
| 1050 | unknown |  |
| 1175 | unknown |  |

## Redaction Notes

This report intentionally omits raw prompts, raw tool outputs, request/response bodies, private document text, and secrets. Use the original local/private session file only when explicitly authorized.
