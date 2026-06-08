#!/usr/bin/env python3
"""Compute lightweight workflow metrics from committed Cartographer artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def command_texts(receipts: list[dict[str, Any]]) -> list[str]:
    commands: list[str] = []
    for receipt in receipts:
        if isinstance(receipt.get("command"), str):
            commands.append(str(receipt["command"]))
        for item in receipt.get("commands", []):
            if isinstance(item, dict) and isinstance(item.get("command"), str):
                commands.append(str(item["command"]))
    return commands


def load_session_summary(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def compute(root: Path, topic: str, session_summary_path: Path | None = None) -> dict[str, Any]:
    topic_dir = root / ".plan" / topic
    plan_nodes = read_jsonl(topic_dir / "plan.nodes.jsonl")
    receipts = read_jsonl(topic_dir / "receipts.jsonl")
    context_packs = read_jsonl(topic_dir / "context-packs.jsonl")
    phases = [record for record in plan_nodes if record.get("type") == "phase"]
    validation_receipts = [record for record in receipts if record.get("type") == "validation-receipt"]
    commands = command_texts(receipts)
    full_check_reruns = sum(1 for command in commands if "npm run check" in command)
    phase_ids = {str(record.get("phase_id")) for record in phases if record.get("phase_id")}
    receipt_phase_ids = {str(record.get("phase_id")) for record in receipts if record.get("phase_id")}
    context_phase_ids = {str(record.get("phase_id")) for record in context_packs if record.get("phase_id")}
    output_chars = 0
    for receipt in receipts:
        counts = receipt.get("counts")
        if isinstance(counts, dict) and isinstance(counts.get("outputChars"), (int, float)):
            output_chars += int(counts["outputChars"])
        elif isinstance(receipt.get("summary"), str):
            output_chars += len(str(receipt["summary"]))
    session_summary = load_session_summary(session_summary_path)
    return {
        "topic": topic,
        "phase_count": len(phases),
        "receipt_count": len(receipts),
        "context_pack_count": len(context_packs),
        "validation_receipt_count": len(validation_receipts),
        "passed_receipts": sum(1 for record in receipts if record.get("status") == "passed"),
        "failed_receipts": sum(1 for record in receipts if record.get("status") == "failed"),
        "skipped_receipts": sum(1 for record in receipts if record.get("status") == "skipped"),
        "timeout_receipts": sum(
            1
            for record in receipts
            if record.get("timedOut") is True or record.get("status") in {"timeout", "timed-out"}
        ),
        "full_check_command_count": full_check_reruns,
        "receipt_phase_coverage": round(len(phase_ids & receipt_phase_ids) / len(phase_ids), 3) if phase_ids else 0,
        "context_pack_phase_coverage": round(len(phase_ids & context_phase_ids) / len(phase_ids), 3)
        if phase_ids
        else 0,
        "llm_facing_output_chars_estimate": output_chars,
        "session_entries": session_summary.get("entries"),
        "session_subagent_timeouts": len(session_summary.get("subagent_timeouts", []))
        if isinstance(session_summary.get("subagent_timeouts"), list)
        else None,
        "session_largest_outputs": len(session_summary.get("largest_outputs", []))
        if isinstance(session_summary.get("largest_outputs"), list)
        else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute lightweight Cartographer workflow benchmark metrics.")
    parser.add_argument("--root", default=".", help="Project root. Default: current directory.")
    parser.add_argument("--topic", required=True, help="Topic under .plan/.")
    parser.add_argument("--session-summary", help="Optional analyzer JSON summary path.")
    parser.add_argument("--json", action="store_true", help="Print JSON metrics.")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    session_summary = Path(args.session_summary).resolve() if args.session_summary else None
    payload = compute(root, args.topic, session_summary)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(f"Workflow benchmark for {args.topic}")
        for key, value in payload.items():
            print(f"- {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
