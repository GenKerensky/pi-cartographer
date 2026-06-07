#!/usr/bin/env python3
"""Summarize Pi session JSONL without expanding raw transcript contents.

The analyzer is intentionally schema-tolerant: Pi session rows can evolve, so this
script looks for common role, tool, usage, duration, command, and compaction keys
while treating missing fields as unknown rather than fatal.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\b(?:github_pat|gh[pousr])_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b", re.IGNORECASE),
    re.compile(r"\b(?:postgres|postgresql|mysql|mongodb)://[^\s`\"']+", re.IGNORECASE),
]
TEXT_KEYS = {"content", "text", "result", "stdout", "stderr", "output"}
DURATION_KEYS = {"duration_ms", "durationMs", "elapsed_ms", "elapsedMs", "time_ms", "timeMs"}
TOKEN_KEYS = {
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "total_tokens",
    "prompt_tokens",
    "completion_tokens",
}
COST_KEYS = {"cost", "cost_usd", "estimated_cost_usd", "estimatedCostUsd"}


def now_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def redact_text(value: str, limit: int = 180) -> str:
    text = value.replace("\n", " ").replace("\r", " ")
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("<REDACTED>", text)
    text = re.sub(r"[A-Za-z0-9+/=_-]{40,}", "<REDACTED>", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def iter_values(value: Any) -> Any:
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from iter_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_values(item)


def nested_get(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = record.get(key)
        if value is not None:
            return value
    return None


def role_for(record: dict[str, Any]) -> str:
    role = nested_get(record, "role", "speaker", "actor")
    if isinstance(role, str):
        return role
    message = record.get("message")
    if isinstance(message, dict) and isinstance(message.get("role"), str):
        return str(message["role"])
    event = nested_get(record, "event", "type", "kind")
    if isinstance(event, str) and "tool" in event.lower():
        return "tool"
    return "unknown"


def tool_for(record: dict[str, Any]) -> str | None:
    for obj in iter_values(record):
        if not isinstance(obj, dict):
            continue
        for key in ("tool_name", "toolName", "tool", "name"):
            value = obj.get(key)
            if (
                isinstance(value, str)
                and value
                and value not in {"tool_result", "tool_use"}
                and ("tool" in str(obj.get("type", "")).lower() or key != "name")
            ):
                return value
    return None


def command_for(record: dict[str, Any]) -> str | None:
    for obj in iter_values(record):
        if isinstance(obj, dict) and isinstance(obj.get("command"), str):
            return str(obj["command"])
    return None


def agent_for(record: dict[str, Any]) -> str | None:
    for obj in iter_values(record):
        if not isinstance(obj, dict):
            continue
        for key in ("agent", "agentName", "agent_name", "subagent"):
            value = obj.get(key)
            if isinstance(value, str) and value:
                return redact_text(value, limit=80)
    return None


def text_char_count(value: Any) -> int:
    if isinstance(value, str):
        return len(value)
    if isinstance(value, list):
        return sum(text_char_count(item) for item in value)
    if isinstance(value, dict):
        total = 0
        for key, item in value.items():
            if key in TEXT_KEYS or isinstance(item, (dict, list)):
                total += text_char_count(item)
        return total
    return 0


def duration_ms(record: dict[str, Any]) -> int | None:
    for obj in iter_values(record):
        if not isinstance(obj, dict):
            continue
        for key in DURATION_KEYS:
            value = obj.get(key)
            if isinstance(value, (int, float)):
                return int(value)
    return None


def is_compaction(record: dict[str, Any]) -> bool:
    joined = " ".join(str(record.get(key, "")) for key in ("type", "kind", "event", "action", "name", "title")).lower()
    return "compact" in joined or "compaction" in joined


def is_tool_error(record: dict[str, Any]) -> bool:
    for obj in iter_values(record):
        if not isinstance(obj, dict):
            continue
        if obj.get("isError") is True or obj.get("error") is True:
            return True
        status = obj.get("status")
        if isinstance(status, str) and status.lower() in {"error", "failed", "failure"}:
            return True
        for key in ("exitCode", "exit_code", "returncode"):
            value = obj.get(key)
            if isinstance(value, int) and value != 0:
                return True
    return False


def is_subagent_timeout(record: dict[str, Any]) -> bool:
    for obj in iter_values(record):
        if not isinstance(obj, dict):
            continue
        if obj.get("timedOut") is True or obj.get("timed_out") is True:
            return True
    strings: list[str] = []
    for obj in iter_values(record):
        if isinstance(obj, dict):
            for key in ("type", "kind", "event", "status", "message", "summary", "text", "content"):
                value = obj.get(key)
                if isinstance(value, str):
                    strings.append(value.lower())
    joined = " ".join(strings)
    return ("subagent" in joined or "reviewer" in joined or "worker" in joined) and (
        "timed out" in joined or "timeout" in joined
    )


def accumulate_usage(record: dict[str, Any], token_totals: Counter[str], cost_totals: Counter[str]) -> None:
    for obj in iter_values(record):
        if not isinstance(obj, dict):
            continue
        for key in TOKEN_KEYS:
            value = obj.get(key)
            if isinstance(value, (int, float)):
                token_totals[key] += int(value)
        for key in COST_KEYS:
            value = obj.get(key)
            if isinstance(value, (int, float)):
                cost_totals[key] += float(value)


def analyze(input_path: Path, max_output_chars: int) -> dict[str, Any]:
    roles: Counter[str] = Counter()
    tools: Counter[str] = Counter()
    tool_errors: Counter[str] = Counter()
    commands: Counter[str] = Counter()
    token_totals: Counter[str] = Counter()
    cost_totals: Counter[str] = Counter()
    largest_outputs: list[dict[str, Any]] = []
    longest_turns: list[dict[str, Any]] = []
    compactions: list[dict[str, Any]] = []
    subagent_timeouts: list[dict[str, Any]] = []
    invalid_lines = 0
    entries = 0
    bytes_read = input_path.stat().st_size

    with input_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            entries += 1
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                invalid_lines += 1
                continue
            if not isinstance(record, dict):
                invalid_lines += 1
                continue

            role = role_for(record)
            roles[role] += 1
            tool = tool_for(record) or "unknown"
            if role == "tool" or "tool" in str(record.get("type", "")).lower() or tool != "unknown":
                tools[tool] += 1
            if is_tool_error(record):
                tool_errors[tool] += 1
            command = command_for(record)
            if command:
                commands[command] += 1
            accumulate_usage(record, token_totals, cost_totals)

            chars = text_char_count(record)
            if chars:
                largest_outputs.append(
                    {
                        "line": line_number,
                        "role": role,
                        "tool": None if tool == "unknown" else tool,
                        "chars": chars,
                    }
                )
            duration = duration_ms(record)
            if duration is not None:
                longest_turns.append(
                    {
                        "line": line_number,
                        "role": role,
                        "tool": None if tool == "unknown" else tool,
                        "duration_ms": duration,
                    }
                )
            if is_compaction(record):
                compactions.append({"line": line_number, "role": role, "tool": None if tool == "unknown" else tool})
            if is_subagent_timeout(record):
                subagent_timeouts.append(
                    {
                        "line": line_number,
                        "role": role,
                        "tool": None if tool == "unknown" else tool,
                        "agent": agent_for(record),
                    }
                )

    largest_outputs.sort(key=lambda item: int(item["chars"]), reverse=True)
    longest_turns.sort(key=lambda item: int(item["duration_ms"]), reverse=True)

    return {
        "input_basename": input_path.name,
        "bytes": bytes_read,
        "entries": entries,
        "invalid_lines": invalid_lines,
        "roles": dict(roles),
        "tools": dict(tools.most_common()),
        "tool_errors": dict(tool_errors.most_common()),
        "token_totals": dict(token_totals),
        "cost_totals": dict(cost_totals),
        "largest_outputs": largest_outputs[:10],
        "longest_turns": longest_turns[:10],
        "compactions": compactions[:10],
        "subagent_timeouts": subagent_timeouts[:10],
        "repeated_commands": [
            {"command_id": f"command-{index:03d}", "count": count, "command_chars": len(command)}
            for index, (command, count) in enumerate(commands.most_common(), start=1)
            if count > 1
        ][:10],
        "max_output_chars": max_output_chars,
    }


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    if not rows:
        return "_None observed._\n"
    output = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for row in rows:
        output.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(output) + "\n"


def render_markdown(summary: dict[str, Any]) -> str:
    rows_outputs = [
        [item["line"], item.get("role") or "", item.get("tool") or "", item["chars"]]
        for item in summary["largest_outputs"]
    ]
    rows_turns = [
        [item["line"], item.get("role") or "", item.get("tool") or "", item["duration_ms"]]
        for item in summary["longest_turns"]
    ]
    rows_commands = [
        [item["command_id"], item["count"], item["command_chars"]] for item in summary["repeated_commands"]
    ]
    rows_compactions = [
        [item["line"], item.get("role") or "", item.get("tool") or ""] for item in summary["compactions"]
    ]
    rows_timeouts = [
        [item["line"], item.get("role") or "", item.get("tool") or "", item.get("agent") or ""]
        for item in summary["subagent_timeouts"]
    ]
    return f"""# Session Analysis: {summary["input_basename"]}

## Source Handling

- Input basename: `{summary["input_basename"]}`
- Analyzer: `skills/plan/scripts/analyze_session.py`
- Raw transcript handling: raw message/tool contents are not reproduced; counts, lengths, durations, commands, and tool names are summarized.
- Max output chars setting: {summary["max_output_chars"]}

## Summary

- Entries: {summary["entries"]}
- Bytes: {summary["bytes"]}
- Invalid lines: {summary["invalid_lines"]}
- Roles: `{json.dumps(summary["roles"], sort_keys=True)}`
- Tools: `{json.dumps(summary["tools"], sort_keys=True)}`
- Tool errors: `{json.dumps(summary["tool_errors"], sort_keys=True)}`
- Token totals: `{json.dumps(summary["token_totals"], sort_keys=True)}`
- Cost totals: `{json.dumps(summary["cost_totals"], sort_keys=True)}`

## Largest Tool/Text Outputs

{markdown_table(["Line", "Role", "Tool", "Chars"], rows_outputs)}
## Longest Timed Turns

{markdown_table(["Line", "Role", "Tool", "Duration ms"], rows_turns)}
## Repeated Commands

{markdown_table(["Command ID", "Count", "Command Chars"], rows_commands)}
## Subagent Timeouts

{markdown_table(["Line", "Role", "Tool", "Agent"], rows_timeouts)}
## Compaction Events

{markdown_table(["Line", "Role", "Tool"], rows_compactions)}
## Redaction Notes

This report intentionally omits raw prompts, raw tool outputs, request/response bodies, private document text, and secrets. Use the original local/private session file only when explicitly authorized.
"""


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze Pi session JSONL into a compact report.")
    parser.add_argument("--input", required=True, help="Input Pi session JSONL file.")
    parser.add_argument("--out", required=True, help="Markdown report output path.")
    parser.add_argument("--json-out", help="Optional JSON summary output path.")
    parser.add_argument("--max-output-chars", type=int, default=8000, help="Inline output budget metadata.")
    parser.add_argument("--json", action="store_true", help="Print a JSON receipt.")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    out_path = Path(args.out).resolve()
    summary = analyze(input_path, args.max_output_chars)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render_markdown(summary), encoding="utf-8")
    json_out = Path(args.json_out).resolve() if args.json_out else None
    if json_out:
        write_json(json_out, summary)

    receipt = {
        "ok": True,
        "id": f"session-analysis:{now_id()}",
        "input_basename": input_path.name,
        "out": str(out_path),
        "json_out": str(json_out) if json_out else None,
        "entries": summary["entries"],
        "bytes": summary["bytes"],
        "invalid_lines": summary["invalid_lines"],
        "largest_outputs": len(summary["largest_outputs"]),
        "longest_turns": len(summary["longest_turns"]),
        "compactions": len(summary["compactions"]),
        "subagent_timeouts": len(summary["subagent_timeouts"]),
    }
    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print(f"Wrote session analysis report: {out_path}")
        if json_out:
            print(f"Wrote session analysis JSON: {json_out}")
        print(f"Entries: {summary['entries']} bytes: {summary['bytes']} invalid_lines: {summary['invalid_lines']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
