#!/usr/bin/env python3
"""Validate planning artifacts for a .plan/<topic> workflow.

Checks JSONL graph syntax/resolution, fact citations/support edges, and plan phase
DAG basics. This helper is intentionally stdlib-only.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

PHASE_RE = re.compile(r"^###\s+Phase\s+(P\d+)\b.*$", re.MULTILINE)
DEPENDS_RE = re.compile(r"^-\s+\*\*Depends on:\*\*\s*(.+?)\s*$", re.MULTILINE)
TASK_RE = re.compile(r"\*\*(P\d+\.T\d+)\*\*")
VALIDATION_RE = re.compile(r"\*\*(P\d+\.V\d+)\*\*")
FACT_CITATION_RE = re.compile(r"\[(F\d+)\]")
REFERENCE_RE = re.compile(r"(?<![\w/.-])([A-Za-z0-9_./@+-]+\.[A-Za-z0-9_./@+-]+):(\d+)")


def read_jsonl(path: Path, errors: list[str], required: bool = False) -> list[dict[str, Any]]:
    if not path.exists():
        if required:
            errors.append(f"Missing required JSONL file: {path}")
        return []
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"Invalid JSONL in {path}:{line_number}: {exc}")
            continue
        if not isinstance(value, dict):
            errors.append(f"JSONL record must be an object in {path}:{line_number}")
            continue
        records.append(value)
    return records


def read_json(path: Path, errors: list[str]) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"Invalid JSON in {path}: {exc}")
        return None


def indexed_node_exists(db_path: Path, node_id: str) -> bool:
    if not db_path.exists():
        return False
    try:
        conn = sqlite3.connect(db_path)
        return bool(conn.execute("SELECT 1 FROM nodes WHERE id = ?", (node_id,)).fetchone())
    except sqlite3.Error:
        return False


def validate_unique_ids(records: list[dict[str, Any]], path: Path, errors: list[str]) -> set[str]:
    ids: set[str] = set()
    for index, record in enumerate(records, start=1):
        record_id = record.get("id")
        if not record_id:
            errors.append(f"Missing id in {path} record {index}")
            continue
        if record_id in ids:
            errors.append(f"Duplicate id {record_id!r} in {path}")
        ids.add(str(record_id))
    return ids


def validate_edges(
    records: list[dict[str, Any]], path: Path, allowed_ids: set[str], db_path: Path, errors: list[str]
) -> None:
    for index, record in enumerate(records, start=1):
        from_id = record.get("from")
        to_id = record.get("to")
        edge_type = record.get("type")
        if not from_id or not to_id or not edge_type:
            errors.append(f"Edge in {path} record {index} must include from, to, and type")
            continue
        for endpoint_name, endpoint in (("from", str(from_id)), ("to", str(to_id))):
            if endpoint in allowed_ids:
                continue
            if endpoint.startswith(("http://", "https://", "mailto:")):
                continue
            if indexed_node_exists(db_path, endpoint):
                continue
            errors.append(f"Unresolved {endpoint_name} endpoint {endpoint!r} in {path} record {index}")


def validate_file_references(root: Path, records: list[dict[str, Any]], path: Path, errors: list[str]) -> None:
    for index, record in enumerate(records, start=1):
        for key in ("reference", "evidence"):
            value = record.get(key)
            if not isinstance(value, str):
                continue
            for match in REFERENCE_RE.finditer(value):
                rel = match.group(1)
                if rel.startswith(("http", "https")):
                    continue
                candidate = root / rel
                if not candidate.exists():
                    errors.append(f"Missing referenced file {rel!r} in {path} record {index} field {key}")


def phase_blocks(plan_text: str) -> list[tuple[str, str]]:
    matches = list(PHASE_RE.finditer(plan_text))
    blocks: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(plan_text)
        blocks.append((match.group(1), plan_text[match.start() : end]))
    return blocks


def parse_dependencies(value: str) -> list[str]:
    value = value.strip()
    if value.lower() in {"none", "n/a", "na", "-"}:
        return []
    return [part.strip() for part in re.split(r"[,\s]+", value) if part.strip().startswith("P")]


def validate_plan(
    plan_path: Path,
    fact_ids: set[str],
    allowed_node_ids: set[str],
    plan_node_ids: set[str],
    db_path: Path,
    errors: list[str],
) -> None:
    if not plan_path.exists():
        errors.append(f"Missing plan file: {plan_path}")
        return
    text = plan_path.read_text(encoding="utf-8")
    blocks = phase_blocks(text)
    phase_ids = [phase_id for phase_id, _ in blocks]
    if len(phase_ids) != len(set(phase_ids)):
        errors.append("Duplicate phase IDs in plan")
    phase_set = set(phase_ids)
    phase_order = {phase_id: index for index, phase_id in enumerate(phase_ids)}
    graph: dict[str, list[str]] = {phase_id: [] for phase_id in phase_ids}
    task_ids: set[str] = set()
    validation_ids: set[str] = set()

    for phase_id, block in blocks:
        dep_match = DEPENDS_RE.search(block)
        if not dep_match:
            errors.append(f"Phase {phase_id} is missing '- **Depends on:**'")
            deps: list[str] = []
        else:
            deps = parse_dependencies(dep_match.group(1))
        graph[phase_id] = deps
        for dep in deps:
            if dep not in phase_set:
                errors.append(f"Phase {phase_id} depends on unknown phase {dep}")
            elif phase_order[dep] >= phase_order[phase_id]:
                errors.append(f"Phase {phase_id} depends on {dep}, which is not earlier in the plan")
        phase_tasks = TASK_RE.findall(block)
        phase_validations = VALIDATION_RE.findall(block)
        if not phase_tasks:
            errors.append(f"Phase {phase_id} has no checklist task IDs")
        if not phase_validations:
            errors.append(f"Phase {phase_id} has no validation item IDs")
        if plan_node_ids and f"phase:{phase_id}" not in plan_node_ids:
            errors.append(f"Missing plan graph node phase:{phase_id}")
        for task_id in phase_tasks:
            if not task_id.startswith(f"{phase_id}."):
                errors.append(f"Task {task_id} is in phase {phase_id} but uses another phase prefix")
            if task_id in task_ids:
                errors.append(f"Duplicate task ID {task_id}")
            if plan_node_ids and f"task:{task_id}" not in plan_node_ids:
                errors.append(f"Missing plan graph node task:{task_id}")
            task_ids.add(task_id)
        for validation_id in phase_validations:
            if not validation_id.startswith(f"{phase_id}."):
                errors.append(f"Validation {validation_id} is in phase {phase_id} but uses another phase prefix")
            if validation_id in validation_ids:
                errors.append(f"Duplicate validation ID {validation_id}")
            if plan_node_ids and f"validation:{validation_id}" not in plan_node_ids:
                errors.append(f"Missing plan graph node validation:{validation_id}")
            validation_ids.add(validation_id)

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        if node in visiting:
            errors.append(f"Cycle detected at phase {node}")
            return
        if node in visited:
            return
        visiting.add(node)
        for dep in graph.get(node, []):
            if dep in graph:
                visit(dep)
        visiting.remove(node)
        visited.add(node)

    for phase_id in phase_ids:
        visit(phase_id)

    for fact_id in FACT_CITATION_RE.findall(text):
        if fact_id not in fact_ids:
            errors.append(f"Plan cites missing fact [{fact_id}]")
    for node_id in re.findall(r"`((?:file|symbol|doc|dependency|topic):[^`]+)`", text):
        if node_id in allowed_node_ids:
            continue
        if indexed_node_exists(db_path, node_id):
            continue
        errors.append(f"Plan cites unresolved graph node `{node_id}`")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate planning graph artifacts for a topic.")
    parser.add_argument("--root", default=".", help="Project root. Default: current directory.")
    parser.add_argument("--topic", required=True, help="Topic directory under .plan/.")
    parser.add_argument("--json", action="store_true", help="Print JSON report.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    topic_dir = root / ".plan" / args.topic
    db_path = root / ".plan/_index/project-graph.sqlite"
    errors: list[str] = []

    map_nodes = read_jsonl(topic_dir / "map.nodes.jsonl", errors)
    map_edges = read_jsonl(topic_dir / "map.edges.jsonl", errors)
    fact_nodes = read_jsonl(topic_dir / "facts.nodes.jsonl", errors)
    fact_edges = read_jsonl(topic_dir / "facts.edges.jsonl", errors)
    plan_nodes = read_jsonl(topic_dir / "plan.nodes.jsonl", errors, required=True)
    plan_edges = read_jsonl(topic_dir / "plan.edges.jsonl", errors, required=True)
    graph = read_json(topic_dir / "map.graph.json", errors) or {}

    map_ids = validate_unique_ids(map_nodes, topic_dir / "map.nodes.jsonl", errors)
    fact_ids_all = validate_unique_ids(fact_nodes, topic_dir / "facts.nodes.jsonl", errors)
    plan_ids = validate_unique_ids(plan_nodes, topic_dir / "plan.nodes.jsonl", errors)
    graph_ids = {str(node.get("id")) for node in graph.get("nodes", []) if isinstance(node, dict) and node.get("id")}
    allowed_ids = map_ids | fact_ids_all | plan_ids | graph_ids

    validate_edges(map_edges, topic_dir / "map.edges.jsonl", allowed_ids, db_path, errors)
    validate_edges(fact_edges, topic_dir / "facts.edges.jsonl", allowed_ids, db_path, errors)
    validate_edges(plan_edges, topic_dir / "plan.edges.jsonl", allowed_ids, db_path, errors)
    validate_file_references(
        root, [*map_nodes, *map_edges, *fact_nodes, *fact_edges, *plan_nodes, *plan_edges], topic_dir, errors
    )

    fact_nodes_by_id = {str(node.get("id")): node for node in fact_nodes if node.get("id")}
    source_ids = {node_id for node_id, node in fact_nodes_by_id.items() if node.get("type") == "source"}
    fact_ids = {node_id for node_id, node in fact_nodes_by_id.items() if node.get("type") == "fact"}
    supported_facts = {
        str(edge.get("from"))
        for edge in fact_edges
        if edge.get("type") == "supported_by" and str(edge.get("to")) in source_ids
    }
    for fact_id in fact_ids:
        if fact_id.startswith("F") and fact_id not in supported_facts:
            errors.append(f"Fact {fact_id} has no supported_by edge to a source node")

    proposal_path = topic_dir / "proposal.md"
    if proposal_path.exists():
        proposal_text = proposal_path.read_text(encoding="utf-8")
        for fact_id in FACT_CITATION_RE.findall(proposal_text):
            if fact_id not in fact_ids:
                errors.append(f"Proposal cites missing fact [{fact_id}]")

    validate_plan(topic_dir / "plan.md", fact_ids, allowed_ids, plan_ids, db_path, errors)

    report = {
        "topic": args.topic,
        "ok": not errors,
        "errors": errors,
        "counts": {
            "map_nodes": len(map_nodes),
            "map_edges": len(map_edges),
            "fact_nodes": len(fact_nodes),
            "fact_edges": len(fact_edges),
            "plan_nodes": len(plan_nodes),
            "plan_edges": len(plan_edges),
        },
    }
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    elif errors:
        print("Planning graph validation failed:")
        for error in errors:
            print(f"- {error}")
    else:
        print("Planning graph validation passed.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
