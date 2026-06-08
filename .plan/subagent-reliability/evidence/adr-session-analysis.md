# Session Analysis: adr-session.jsonl

## Source Handling

- Input basename: `adr-session.jsonl`
- Analyzer: `skills/plan/scripts/analyze_session.py`
- Redaction status: passed
- Raw transcript handling: raw message/tool contents are not reproduced; counts, lengths, durations, commands, and tool names are summarized.
- Max output chars setting: 6000

## Summary

- Entries: 2035
- Bytes: 9272219
- Invalid lines: 0
- Roles: `{"assistant": 892, "toolResult": 1105, "unknown": 9, "user": 29}`
- Tools: `{"ask_user_question": 6, "bash": 788, "cartographer_index": 54, "cartographer_jsonl": 122, "edit": 430, "query-docs": 6, "read": 389, "resolve-library-id": 6, "subagent": 107, "write": 58}`
- Tool errors: `{"bash": 25, "cartographer_jsonl": 1, "edit": 13, "subagent": 17}`
- Token totals: `{}`
- Cost totals: `{"cost": 55.37621000000002}`

## Largest Tool/Text Outputs

| Line | Role | Tool | Chars |
|---|---|---|---|
| 36 | toolResult | cartographer_index | 166878 |
| 255 | toolResult | cartographer_index | 124364 |
| 407 | toolResult | cartographer_index | 108918 |
| 52 | toolResult | bash | 101373 |
| 20 | toolResult | read | 101287 |
| 98 | toolResult | bash | 101252 |
| 647 | toolResult | cartographer_index | 66374 |
| 42 | toolResult | cartographer_index | 63280 |
| 646 | toolResult | cartographer_index | 59844 |
| 22 | toolResult | read | 48664 |

## Longest Timed Turns

| Line | Role | Tool | Duration ms |
|---|---|---|---|
| 1478 | toolResult | subagent | 600018 |
| 1408 | toolResult | subagent | 565697 |
| 1646 | toolResult | subagent | 300015 |
| 1811 | toolResult | subagent | 300010 |
| 1526 | toolResult | subagent | 264956 |
| 1718 | toolResult | subagent | 241628 |
| 609 | toolResult | subagent | 240013 |
| 1552 | toolResult | subagent | 238870 |
| 1743 | toolResult | subagent | 236867 |
| 1702 | toolResult | subagent | 223291 |

## Repeated Commands

| Command ID | Count | Command Chars |
|---|---|---|
| command-001 | 25 | 80 |
| command-002 | 15 | 18 |
| command-003 | 15 | 58 |
| command-004 | 10 | 13 |
| command-005 | 7 | 293 |
| command-006 | 5 | 124 |
| command-007 | 5 | 1723 |
| command-008 | 4 | 104 |
| command-009 | 4 | 38 |
| command-010 | 4 | 55 |

## Subagent Timeouts

| Line | Role | Tool | Agent |
|---|---|---|---|
| 22 | toolResult | read |  |
| 50 | toolResult | bash |  |
| 52 | toolResult | bash |  |
| 54 | toolResult | bash |  |
| 56 | toolResult | bash |  |
| 107 | toolResult | bash |  |
| 114 | toolResult | subagent | delegate |
| 127 | toolResult | cartographer_index |  |
| 140 | toolResult | read |  |
| 155 | assistant | write |  |

## Compaction Events

| Line | Role | Tool |
|---|---|---|
| 174 | unknown |  |
| 617 | unknown |  |
| 1103 | unknown |  |
| 1763 | unknown |  |

## Redaction Notes

This report intentionally omits raw prompts, raw tool outputs, request/response bodies, private document text, and secrets. Use the original local/private session file only when explicitly authorized.
