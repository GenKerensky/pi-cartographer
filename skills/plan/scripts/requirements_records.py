#!/usr/bin/env python3
"""Fold topic-local requirement deltas into durable requirements Markdown.

This helper is intentionally small and deterministic. It operates on temp/mock
projects in tests and appends compact receipts for real workflow use.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

HEADING_RE = re.compile(r"^###\s+(REQ-[A-Z0-9][A-Z0-9_.-]*)\b.*$", re.MULTILINE)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Invalid JSONL in {path}:{line_no}: {exc}") from exc
        if not isinstance(value, dict):
            raise SystemExit(f"Invalid JSONL in {path}:{line_no}: record must be object")
        records.append(value)
    return records


def write_jsonl_append(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, separators=(",", ":")) + "\n")


def durable_path(root: Path, requirement: dict[str, Any], split_domain: bool) -> Path:
    if split_domain:
        domain = str(requirement.get("domain") or "general").lower()
        domain = re.sub(r"[^a-z0-9_.-]+", "-", domain).strip("-") or "general"
        return root / "docs" / "requirements" / f"{domain}.md"
    return root / "docs" / "requirements.md"


def initial_requirements_content(path: Path) -> str:
    title = "Requirements" if path.name == "requirements.md" else f"Requirements: {path.stem}"
    return (
        f"# {title}\n\n"
        "This file contains durable requirements folded from accepted Cartographer topic deltas.\n\n"
        "## Purpose\n\n"
        "Describe the stable behavioral requirements this project currently satisfies.\n\n"
        "## Requirements\n\n"
        "Durable requirement blocks use stable `REQ-*` identifiers and may be folded from "
        "`.plan/<topic>/requirements.nodes.jsonl`.\n\n"
    )


def ensure_header(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8")
    return initial_requirements_content(path)


def init_requirements(root: Path) -> dict[str, Any]:
    path = root / "docs" / "requirements.md"
    relative = str(path.relative_to(root))
    if path.exists():
        return {
            "ok": True,
            "path": relative,
            "created": False,
            "reason": "exists",
            "message": "Durable requirements document already exists",
        }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(initial_requirements_content(path), encoding="utf-8")
    return {
        "ok": True,
        "path": relative,
        "created": True,
        "message": "Created durable requirements document",
    }


def parse_blocks(text: str) -> dict[str, tuple[int, int]]:
    matches = list(HEADING_RE.finditer(text))
    blocks: dict[str, tuple[int, int]] = {}
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        blocks[match.group(1)] = (start, end)
    return blocks


def render_requirement(req: dict[str, Any], scenarios: list[dict[str, Any]], topic: str, receipt_ids: list[str]) -> str:
    req_id = str(req["id"])
    title = str(req.get("title") or req_id)
    status = str(req.get("status") or "accepted")
    if req.get("change_type") == "REMOVED":
        status = "removed"
    lines = [
        f"### {req_id} — {title}",
        "",
        f"- Status: {status}",
        f"- Change type: {req.get('change_type', 'ADDED')}",
        f"- Domain: {req.get('domain', 'general')}",
        f"- Priority: {req.get('priority', 'must')}",
        f"- Source topic: {topic}",
    ]
    if req.get("renamed_from"):
        lines.append(f"- Renamed from: {req['renamed_from']}")
    if req.get("supersedes"):
        lines.append(
            f"- Supersedes: {', '.join(map(str, req['supersedes'] if isinstance(req['supersedes'], list) else [req['supersedes']]))}"
        )
    if receipt_ids:
        lines.append(f"- Fold receipts: {', '.join(receipt_ids)}")
    lines.extend(["", str(req.get("statement") or "No statement provided.").strip(), ""])
    related = [s for s in scenarios if s.get("requirement_id") == req_id]
    if related:
        lines.append("#### Scenarios")
        lines.append("")
        for scenario in related:
            lines.append(f"- **{scenario.get('id')}**: {scenario.get('title', 'Scenario')}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n\n"


def replace_block(text: str, req_id: str, block: str) -> tuple[str, bool]:
    blocks = parse_blocks(text)
    if req_id not in blocks:
        return text.rstrip() + "\n\n" + block, False
    start, end = blocks[req_id]
    return text[:start] + block + text[end:].lstrip("\n"), True


def find_durable_duplicates(root: Path) -> dict[str, list[str]]:
    docs = root / "docs"
    paths = []
    if (docs / "requirements.md").exists():
        paths.append(docs / "requirements.md")
    req_dir = docs / "requirements"
    if req_dir.exists():
        paths.extend(sorted(req_dir.glob("*.md")))
    seen: dict[str, list[str]] = {}
    for path in paths:
        for req_id in parse_blocks(path.read_text(encoding="utf-8")):
            seen.setdefault(req_id, []).append(str(path.relative_to(root)))
    return {req_id: locations for req_id, locations in seen.items() if len(locations) > 1}


def fold(root: Path, topic: str, split_domain: bool, receipt_ids: list[str]) -> dict[str, Any]:
    topic_dir = root / ".plan" / topic
    nodes = read_jsonl(topic_dir / "requirements.nodes.jsonl")
    requirements = [r for r in nodes if r.get("type") == "requirement"]
    scenarios = [r for r in nodes if r.get("type") == "scenario"]
    if not requirements:
        return {"ok": True, "topic": topic, "changed": [], "count": 0, "message": "No requirement deltas present"}
    duplicates = find_durable_duplicates(root)
    if duplicates:
        return {"ok": False, "topic": topic, "errors": [f"Duplicate durable requirement IDs: {duplicates}"]}

    changed: list[str] = []
    errors: list[str] = []
    for req in requirements:
        req_id = str(req.get("id") or "")
        change_type = str(req.get("change_type") or "ADDED")
        if change_type == "RENAMED" and not req.get("renamed_from"):
            errors.append(f"{req_id} RENAMED requires renamed_from")
            continue
        path = durable_path(root, req, split_domain)
        path.parent.mkdir(parents=True, exist_ok=True)
        text = ensure_header(path)
        if change_type == "RENAMED":
            old_id = str(req["renamed_from"])
            old_blocks = parse_blocks(text)
            if old_id in old_blocks:
                start, end = old_blocks[old_id]
                text = text[:start] + text[end:].lstrip("\n")
        block = render_requirement(req, scenarios, topic, receipt_ids)
        text, _existed = replace_block(text, req_id, block)
        path.write_text(text, encoding="utf-8")
        changed.append(str(path.relative_to(root)))

    if errors:
        return {"ok": False, "topic": topic, "errors": errors, "changed": changed}
    receipt_id = f"receipt:{topic}:requirements-fold:{dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()}"
    write_jsonl_append(
        topic_dir / "receipts.jsonl",
        {
            "id": receipt_id,
            "type": "requirements-fold",
            "status": "passed",
            "phase_id": "P4",
            "summary": f"Folded {len(requirements)} requirement delta(s) into durable requirements docs.",
            "changed_files": sorted(set(changed)),
            "requirement_ids": [str(req.get("id")) for req in requirements],
            "created_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        },
    )
    return {
        "ok": True,
        "topic": topic,
        "changed": sorted(set(changed)),
        "count": len(requirements),
        "receipt_id": receipt_id,
    }


def validate_fold(root: Path, topic: str) -> dict[str, Any]:
    topic_dir = root / ".plan" / topic
    nodes = read_jsonl(topic_dir / "requirements.nodes.jsonl")
    requirements = [r for r in nodes if r.get("type") == "requirement"]
    receipts = read_jsonl(topic_dir / "receipts.jsonl")
    if not requirements:
        return {"ok": True, "topic": topic, "message": "No requirement deltas present"}
    has_receipt = any(r.get("type") == "requirements-fold" and r.get("status") == "passed" for r in receipts)
    has_skip = any(r.get("type") == "requirements-fold-skip" and r.get("status") == "approved" for r in receipts)
    errors: list[str] = []
    if not (has_receipt or has_skip):
        errors.append(
            "Requirement deltas require a requirements-fold receipt or approved requirements-fold-skip receipt"
        )
    duplicates = find_durable_duplicates(root)
    if duplicates:
        errors.append(f"Duplicate durable requirement IDs: {duplicates}")
    return {"ok": not errors, "topic": topic, "errors": errors, "requirements": len(requirements)}


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    init_parser = sub.add_parser("init")
    init_parser.add_argument("--root", default=".")
    init_parser.add_argument("--json", action="store_true")

    for name in ["fold", "validate-fold"]:
        p = sub.add_parser(name)
        p.add_argument("--root", default=".")
        p.add_argument("--topic", required=True)
        p.add_argument("--json", action="store_true")
        p.add_argument("--split-domain", action="store_true")
        p.add_argument("--receipt-id", action="append", default=[])
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if args.command == "init":
        result = init_requirements(root)
    else:
        result = (
            fold(root, args.topic, args.split_domain, args.receipt_id)
            if args.command == "fold"
            else validate_fold(root, args.topic)
        )
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
