# Session Analysis: behave-specs-session.jsonl

## Source Handling

- Input basename: `behave-specs-session.jsonl`
- Analyzer: `skills/plan/scripts/analyze_session.py`
- Raw transcript handling: raw message/tool contents are not reproduced; counts, lengths, durations, commands, and tool names are summarized.
- Max output chars setting: 4000

## Summary

- Entries: 1479
- Bytes: 5900812
- Invalid lines: 0
- Roles: `{"assistant": 687, "toolResult": 759, "unknown": 6, "user": 27}`
- Tools: `{"bash": 393, "cartographer_adr": 5, "cartographer_artifacts": 15, "cartographer_context_pack": 30, "cartographer_fact": 40, "cartographer_index": 25, "cartographer_jsonl": 25, "cartographer_plan": 10, "cartographer_plan_status": 101, "cartographer_proposal": 4, "cartographer_receipt": 18, "cartographer_state": 115, "cartographer_validation": 161, "edit": 162, "read": 190, "subagent": 78, "write": 42}`
- Tool errors: `{"bash": 10, "cartographer_jsonl": 2, "cartographer_plan": 3, "cartographer_plan_status": 2, "cartographer_receipt": 2, "cartographer_state": 6, "cartographer_validation": 17, "edit": 3, "read": 1, "subagent": 6}`
- Token totals: `{}`
- Cost totals: `{"cost": 31.02386200000001}`

## Largest Tool/Text Outputs

| Line | Role | Tool | Chars |
|---|---|---|---|
| 26 | toolResult | bash | 102324 |
| 186 | toolResult | bash | 102315 |
| 742 | toolResult | cartographer_validation | 84444 |
| 1037 | toolResult | subagent | 63304 |
| 24 | toolResult | bash | 50902 |
| 143 | toolResult | bash | 46973 |
| 6 | toolResult | read | 44199 |
| 840 | toolResult | bash | 41675 |
| 846 | toolResult | bash | 40950 |
| 706 | toolResult | bash | 35672 |

## Longest Timed Turns

| Line | Role | Tool | Duration ms |
|---|---|---|---|
| 748 | toolResult | subagent | 143759 |
| 1037 | toolResult | subagent | 132923 |
| 718 | toolResult | subagent | 98540 |
| 42 | toolResult | subagent | 87619 |
| 476 | toolResult | subagent | 87551 |
| 565 | toolResult | subagent | 85047 |
| 282 | toolResult | subagent | 83254 |
| 458 | toolResult | subagent | 81794 |
| 500 | toolResult | subagent | 80143 |
| 613 | toolResult | subagent | 76551 |

## Repeated Commands

| Command ID | Count | Command Chars |
|---|---|---|
| command-001 | 18 | 241 |
| command-002 | 11 | 133 |
| command-003 | 9 | 37 |
| command-004 | 6 | 13 |
| command-005 | 6 | 239 |
| command-006 | 5 | 27 |
| command-007 | 4 | 177 |
| command-008 | 3 | 18 |
| command-009 | 3 | 48 |
| command-010 | 3 | 45 |

## Subagent Outcomes by Agent

| Agent | Calls | Errors | Timeouts | Longest duration ms |
|---|---|---|---|---|
| cartographer-auditor | 50 | 5 | 0 | 143759 |
| cartographer-drafter | 4 | 1 | 0 | 87619 |
| reviewer | 4 | 0 | 0 | 42856 |
| scout | 3 | 0 | 0 | 132923 |
| unknown | 17 | 0 | 0 | 0 |

## Longest Subagent Durations

| Line | Agent | Tool | Duration ms |
|---|---|---|---|
| 748 | cartographer-auditor | subagent | 143759 |
| 1037 | scout | subagent | 132923 |
| 718 | cartographer-auditor | subagent | 98540 |
| 42 | cartographer-drafter | subagent | 87619 |
| 476 | cartographer-auditor | subagent | 87551 |
| 565 | cartographer-auditor | subagent | 85047 |
| 282 | cartographer-auditor | subagent | 83254 |
| 458 | cartographer-auditor | subagent | 81794 |
| 500 | cartographer-auditor | subagent | 80143 |
| 613 | cartographer-auditor | subagent | 76551 |

## Subagent Field Usage

| Field group | Visible records |
|---|---|
| acceptance | 32 |
| control | 30 |
| timeout | 34 |

## Subagent Timeouts

_None observed._

## Non-Subagent Timeout Mentions

| Line | Role | Tool |
|---|---|---|
| 6 | toolResult | read |
| 24 | toolResult | bash |
| 30 | toolResult | bash |
| 38 | toolResult | bash |
| 141 | toolResult | bash |
| 143 | toolResult | bash |
| 171 | user |  |
| 175 | user |  |
| 186 | toolResult | bash |
| 192 | toolResult | cartographer_validation |

## Tooling Friction Summary

| Category | Records |
|---|---|
| cartographer-cli/tool-usage | 767 |
| schema/tool-validation | 61 |
| custom-script-creation | 34 |
| exact-edit-failure | 5 |
| command-not-found | 1 |

## Compaction Events

| Line | Role | Tool |
|---|---|---|
| 370 | unknown |  |
| 858 | unknown |  |
| 1479 | unknown |  |

## Redaction Notes

This report intentionally omits raw prompts, raw tool outputs, request/response bodies, private document text, and secrets. Use the original local/private session file only when explicitly authorized.
