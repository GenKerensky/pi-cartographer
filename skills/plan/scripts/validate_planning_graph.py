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
REQUIREMENT_CITATION_RE = re.compile(r"\[((?:REQ|SCN|AC)-[A-Z0-9][A-Z0-9_.-]*)\]")
REFERENCE_RE = re.compile(r"(?<![\w/.-])([A-Za-z0-9_./@+-]+\.[A-Za-z0-9_./@+-]+):(\d+)")
LIFECYCLE_STATES = {"draft", "accepted", "planned", "in-progress", "implemented", "superseded", "stale"}
MISS_FAILURE_TYPES = {
    "vocabulary_mismatch",
    "generic_noise",
    "missing_context",
    "stale_artifact",
    "ranking_failure",
    "tool_failure",
}
MISS_RESOLUTIONS = {"query_expansion", "path_constraint", "manual_read", "user_hint", "unresolved"}
RAW_MISS_FIELDS = {"text", "snippet", "raw_snippet", "content", "raw_content"}
SECRET_PATTERNS = [
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("github-token", re.compile(r"\b(?:github_pat|gh[pousr])_[A-Za-z0-9_]{20,}\b")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")),
    ("bearer-token", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b", re.IGNORECASE)),
    ("connection-string", re.compile(r"\b(?:postgres|postgresql|mysql|mongodb)://[^\s`\"']+", re.IGNORECASE)),
]
ACTUAL_PRIVATE_PATH_RE = re.compile(r"\.plan/_private/(?!<topic>|_inbox/<)[^\s`\"')\]]+")


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


def has_verification_evidence(record: dict[str, Any]) -> bool:
    verification = record.get("verification")
    if not isinstance(verification, dict):
        return False
    return any(bool(verification.get(key)) for key in ("read", "rg", "validation"))


def lifecycle_field(record: dict[str, Any]) -> str | None:
    for field in ("lifecycle", "lifecycle_status", "artifact_status"):
        if field in record:
            return field
    record_type = str(record.get("type", ""))
    record_id = str(record.get("id", ""))
    if (
        "status" in record
        and not record_id.startswith(("phase:", "task:", "validation:"))
        and record_type in {"proposal", "plan", "map", "fact", "source", "artifact", "rationale"}
    ):
        return "status"
    return None


def validate_lifecycle_and_retrieval_metadata(
    records: list[dict[str, Any]], label: str, errors: list[str], warnings: list[str]
) -> None:
    for index, record in enumerate(records, start=1):
        field = lifecycle_field(record)
        if field:
            state = str(record.get(field))
            if state not in LIFECYCLE_STATES:
                errors.append(f"Invalid lifecycle state {state!r} in {label} record {index}")
        if record.get("verified") is True and not has_verification_evidence(record):
            errors.append(f"verified=true lacks read/rg/validation evidence in {label} record {index}")
        record_type = str(record.get("type", ""))
        if (
            record.get("candidate") is True
            and record.get("verified") is not True
            and record_type
            in {
                "file",
                "symbol",
                "dependency",
                "depends_on",
                "imports",
                "references",
                "relevant_to",
            }
        ):
            warnings.append(f"High-impact candidate-only reference in {label} record {index}")
        used_as = record.get("used_as")
        used_for_implementation = (
            record.get("implementation_guidance") is True
            or used_as == "implementation_guidance"
            or (isinstance(used_as, list) and "implementation_guidance" in used_as)
        )
        if used_for_implementation:
            state = str(record.get(field)) if field else None
            if not state or state in {"draft", "superseded", "stale"} or not record.get("last_verified_at"):
                warnings.append(f"Implementation guidance uses stale/unverified rationale in {label} record {index}")


def has_validation_evidence(record: dict[str, Any]) -> bool:
    verification = record.get("verification")
    validation = verification.get("validation") if isinstance(verification, dict) else None
    return isinstance(record.get("commands"), list) or (isinstance(validation, list) and bool(validation))


def validate_receipt_records(records: list[dict[str, Any]], label: str, errors: list[str]) -> None:
    for index, record in enumerate(records, start=1):
        for field in ("id", "type", "status"):
            if not record.get(field):
                errors.append(f"Missing {field} in {label} record {index}")
        if record.get("type") == "validation-receipt" and not has_validation_evidence(record):
            errors.append(f"validation-receipt lacks commands or validation evidence in {label} record {index}")
        if record.get("truncated") is True:
            if not record.get("full_output_path"):
                errors.append(f"truncated receipt lacks full_output_path in {label} record {index}")
            if not (record.get("maxOutputChars") or record.get("max_output_chars")):
                errors.append(f"truncated receipt lacks maxOutputChars in {label} record {index}")
            if not record.get("token_estimate"):
                errors.append(f"truncated receipt lacks token_estimate in {label} record {index}")
        timed_out = record.get("timedOut") is True or record.get("status") in {"timed-out", "timeout"}
        failed = record.get("status") in {"failed", "failure"}
        if timed_out and not any(
            record.get(field) for field in ("narrowed_retry", "serial_fallback", "user_escalation", "decision")
        ):
            errors.append(f"timeout receipt lacks fallback decision in {label} record {index}")
        if failed and not any(
            record.get(field) for field in ("narrowed_retry", "serial_fallback", "user_escalation", "decision")
        ):
            errors.append(f"failure receipt lacks fallback decision in {label} record {index}")


def validate_context_pack_records(records: list[dict[str, Any]], label: str, errors: list[str]) -> None:
    for index, record in enumerate(records, start=1):
        for field in ("id", "type", "phase_id", "summary"):
            if not record.get(field):
                errors.append(f"Missing {field} in {label} record {index}")
        if record.get("type") != "context-pack":
            errors.append(f"Context pack record {index} has type {record.get('type')!r}")
        if record.get("budget_tokens") is not None and not isinstance(record.get("budget_tokens"), (int, float)):
            errors.append(f"context-pack budget_tokens must be numeric in {label} record {index}")
        if record.get("references") is not None and not isinstance(record.get("references"), list):
            errors.append(f"context-pack references must be an array in {label} record {index}")


REQUIREMENT_CHANGE_TYPES = {"ADDED", "MODIFIED", "REMOVED", "RENAMED"}
REQUIREMENT_PRIORITIES = {"must", "should", "may", "must-not", "should-not"}
REQUIREMENT_STATUSES = {"draft", "accepted", "planned", "implemented", "superseded", "removed"}
REQUIREMENT_ID_RE = re.compile(r"^REQ-[A-Z0-9][A-Z0-9_.-]*$")
SCENARIO_ID_RE = re.compile(r"^SCN-[A-Z0-9][A-Z0-9_.-]*$")
ACCEPTANCE_CHECK_ID_RE = re.compile(r"^AC-[A-Z0-9][A-Z0-9_.-]*$")
DURABLE_REQUIREMENT_REF_RE = re.compile(r"^docs/requirements(?:\.md|/[A-Za-z0-9_.-]+\.md)(?:#[A-Za-z0-9_.-]+)?$")
REQUIREMENT_EDGE_TYPES = {
    "satisfies_goal",
    "derived_from",
    "supported_by",
    "constrains",
    "supersedes",
    "modifies",
    "removes",
    "renames",
    "validated_by",
    "folds_into",
    "has_scenario",
    "accepts",
    "related_to",
}


def validate_requirement_records(
    records: list[dict[str, Any]], label: str, fact_ids: set[str], source_ids: set[str], errors: list[str]
) -> None:
    by_id = {str(record.get("id")): record for record in records if record.get("id")}
    for index, record in enumerate(records, start=1):
        record_type = record.get("type")
        record_id = str(record.get("id") or "")
        if not record_id:
            errors.append(f"Missing id in {label} record {index}")
        if record_type == "requirement" and not REQUIREMENT_ID_RE.match(record_id):
            errors.append(f"Invalid requirement id {record_id!r} in {label} record {index}")
        if record_type == "scenario" and not SCENARIO_ID_RE.match(record_id):
            errors.append(f"Invalid scenario id {record_id!r} in {label} record {index}")
        if record_type == "acceptance-check" and not ACCEPTANCE_CHECK_ID_RE.match(record_id):
            errors.append(f"Invalid acceptance-check id {record_id!r} in {label} record {index}")
        if record_type not in {"requirement", "scenario", "acceptance-check"}:
            errors.append(f"Invalid requirement record type {record_type!r} in {label} record {index}")
        if record_type == "requirement":
            for field in ["title", "statement", "change_type", "domain", "priority", "status"]:
                if not record.get(field):
                    errors.append(f"Missing {field} in {label} record {index}")
            if record.get("change_type") and record.get("change_type") not in REQUIREMENT_CHANGE_TYPES:
                errors.append(f"Invalid change_type {record.get('change_type')!r} in {label} record {index}")
            if record.get("priority") and record.get("priority") not in REQUIREMENT_PRIORITIES:
                errors.append(f"Invalid priority {record.get('priority')!r} in {label} record {index}")
        if record_type == "scenario":
            for field in ["title", "requirement_id"]:
                if not record.get(field):
                    errors.append(f"Missing {field} in {label} record {index}")
            if (
                record.get("requirement_id")
                and by_id.get(str(record.get("requirement_id")), {}).get("type") != "requirement"
            ):
                errors.append(
                    f"Scenario {record_id} references missing requirement_id {record.get('requirement_id')!r}"
                )
        if record.get("status") and record.get("status") not in REQUIREMENT_STATUSES:
            errors.append(f"Invalid requirement status {record.get('status')!r} in {label} record {index}")
        for field in ["scenario_refs", "fact_refs", "source_refs", "durable_refs"]:
            if field in record and not isinstance(record.get(field), list):
                errors.append(f"{field} must be an array in {label} record {index}")
        for ref in record.get("scenario_refs", []) if isinstance(record.get("scenario_refs"), list) else []:
            if by_id.get(str(ref), {}).get("type") != "scenario":
                errors.append(f"Requirement {record_id} references missing scenario {ref!r}")
        for ref in record.get("fact_refs", []) if isinstance(record.get("fact_refs"), list) else []:
            if str(ref) not in fact_ids:
                errors.append(f"Requirement {record_id} references missing fact {ref!r}")
        for ref in record.get("source_refs", []) if isinstance(record.get("source_refs"), list) else []:
            if str(ref) not in source_ids:
                errors.append(f"Requirement {record_id} references missing source {ref!r}")
        for ref in record.get("durable_refs", []) if isinstance(record.get("durable_refs"), list) else []:
            if not DURABLE_REQUIREMENT_REF_RE.match(str(ref)):
                errors.append(f"Requirement {record_id} has invalid durable ref {ref!r}")


def validate_requirement_edges(
    records: list[dict[str, Any]], label: str, allowed_ids: set[str], errors: list[str]
) -> None:
    for index, record in enumerate(records, start=1):
        if not record.get("from") or not record.get("to") or not record.get("type"):
            errors.append(f"Requirement edge in {label} record {index} must include from, to, and type")
            continue
        if record.get("type") not in REQUIREMENT_EDGE_TYPES:
            errors.append(f"Invalid requirement edge type {record.get('type')!r} in {label} record {index}")
        for endpoint_name in ["from", "to"]:
            endpoint = str(record.get(endpoint_name))
            if endpoint in allowed_ids or DURABLE_REQUIREMENT_REF_RE.match(endpoint):
                continue
            errors.append(f"Unresolved {endpoint_name} endpoint {endpoint!r} in {label} record {index}")


INTERVIEW_NODE_TYPES = {
    "candidate-question",
    "researched-answer",
    "recommendation",
    "user-answer",
    "accepted-decision",
    "deferred-choice",
    "unresolved-blocker",
}
INTERVIEW_STATUSES = {"draft", "asked", "answered", "accepted", "deferred", "blocked", "superseded"}
INTERVIEW_EDGE_TYPES = {
    "depends_on",
    "answered_by",
    "recommended_by",
    "decides",
    "deferred_by",
    "blocks",
    "supersedes",
    "cites",
    "feeds_requirement",
    "feeds_design",
    "related_to",
}


def validate_interview_source(topic_dir: Path, source: Any, label: str, index: int, errors: list[str]) -> None:
    if source is None:
        return
    if not isinstance(source, str) or not source.strip():
        errors.append(
            f"Interview source in {label} record {index} must be a non-empty string using interview.md#heading"
        )
        return
    match = re.match(r"^interview\.md#([A-Za-z0-9_.-]+)$", source)
    if not match:
        errors.append(f"Interview source {source!r} in {label} record {index} must use interview.md#heading")
        return
    interview_path = topic_dir / "interview.md"
    if not interview_path.exists():
        errors.append(f"Interview source {source!r} in {label} record {index} references missing interview.md")
        return
    if match.group(1).lower() not in markdown_anchors(interview_path.read_text(encoding="utf-8")):
        errors.append(f"Interview source {source!r} in {label} record {index} references missing heading")


def validate_interview_records(
    topic_dir: Path,
    records: list[dict[str, Any]],
    label: str,
    requirement_ids: set[str],
    design_ids: set[str],
    fact_ids: set[str],
    errors: list[str],
) -> None:
    for index, record in enumerate(records, start=1):
        record_id = str(record.get("id") or "")
        record_type = record.get("type")
        if not record_id:
            errors.append(f"Missing id in {label} record {index}")
        if record_type not in INTERVIEW_NODE_TYPES:
            errors.append(f"Invalid interview node type {record_type!r} in {label} record {index}")
        for field in ["title", "summary"]:
            if not record.get(field):
                errors.append(f"Missing {field} in {label} record {index}")
        if record.get("status") and record.get("status") not in INTERVIEW_STATUSES:
            errors.append(f"Invalid interview status {record.get('status')!r} in {label} record {index}")
        for field in ["requirement_refs", "design_refs", "fact_refs", "decision_refs", "depends_on"]:
            if field in record and not isinstance(record.get(field), list):
                errors.append(f"{field} must be an array in {label} record {index}")
        for ref in record.get("requirement_refs", []) if isinstance(record.get("requirement_refs"), list) else []:
            if str(ref) not in requirement_ids:
                errors.append(f"Interview node {record_id} references missing requirement {ref!r}")
        for ref in record.get("design_refs", []) if isinstance(record.get("design_refs"), list) else []:
            if str(ref) not in design_ids:
                errors.append(f"Interview node {record_id} references missing design {ref!r}")
        for ref in record.get("fact_refs", []) if isinstance(record.get("fact_refs"), list) else []:
            if str(ref) not in fact_ids:
                errors.append(f"Interview node {record_id} references missing fact {ref!r}")
        validate_interview_source(topic_dir, record.get("source"), label, index, errors)


def validate_interview_edges(
    records: list[dict[str, Any]], label: str, allowed_ids: set[str], errors: list[str]
) -> None:
    for index, record in enumerate(records, start=1):
        if not record.get("from") or not record.get("to") or not record.get("type"):
            errors.append(f"Interview edge in {label} record {index} must include from, to, and type")
            continue
        if record.get("type") not in INTERVIEW_EDGE_TYPES:
            errors.append(f"Invalid interview edge type {record.get('type')!r} in {label} record {index}")
        for endpoint_name in ["from", "to"]:
            endpoint = str(record.get(endpoint_name))
            if endpoint in allowed_ids or endpoint.startswith(("file:", "doc:", "symbol:", "dependency:")):
                continue
            errors.append(f"Unresolved {endpoint_name} endpoint {endpoint!r} in {label} record {index}")


DESIGN_NODE_TYPES = {"design-decision", "design-alternative", "design-component", "design-risk"}
DESIGN_STATUSES = {"proposed", "accepted", "rejected", "superseded", "implemented"}
DESIGN_EDGE_TYPES = {
    "satisfies",
    "supported_by",
    "constrained_by",
    "alternative_to",
    "mitigates",
    "risk_of",
    "related_to",
}


def markdown_anchors(text: str) -> set[str]:
    anchors: set[str] = set()
    for line in text.splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if not match:
            continue
        slug = re.sub(r"\s+", "-", re.sub(r"[^a-z0-9\s-]", "", match.group(1).strip().lower()))
        anchors.add(slug)
    return anchors


def validate_design_source(topic_dir: Path, source: Any, label: str, index: int, errors: list[str]) -> None:
    if not isinstance(source, str) or not source.strip():
        errors.append(f"Design source in {label} record {index} must be a non-empty string using design.md#heading")
        return
    match = re.match(r"^design\.md#([A-Za-z0-9_.-]+)$", source)
    if not match:
        errors.append(f"Design source {source!r} in {label} record {index} must use design.md#heading")
        return
    design_path = topic_dir / "design.md"
    if not design_path.exists():
        errors.append(f"Design source {source!r} in {label} record {index} references missing design.md")
        return
    if match.group(1).lower() not in markdown_anchors(design_path.read_text(encoding="utf-8")):
        errors.append(f"Design source {source!r} in {label} record {index} references missing heading")


def validate_design_records(
    topic_dir: Path,
    records: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    label: str,
    requirement_ids: set[str],
    fact_ids: set[str],
    errors: list[str],
) -> None:
    satisfying_edges = {
        str(edge.get("from"))
        for edge in edges
        if edge.get("type") == "satisfies" and str(edge.get("to")) in requirement_ids
    }
    for index, record in enumerate(records, start=1):
        record_id = str(record.get("id") or "")
        record_type = record.get("type")
        if not record_id:
            errors.append(f"Missing id in {label} record {index}")
        if record_type not in DESIGN_NODE_TYPES:
            errors.append(f"Invalid design node type {record_type!r} in {label} record {index}")
        for field in ["status", "title", "summary", "source"]:
            if not record.get(field):
                errors.append(f"Missing {field} in {label} record {index}")
        if record.get("status") and record.get("status") not in DESIGN_STATUSES:
            errors.append(f"Invalid design status {record.get('status')!r} in {label} record {index}")
        for field in ["requirement_refs", "fact_refs", "alternatives", "fast_follow_refs"]:
            if field in record and not isinstance(record.get(field), list):
                errors.append(f"{field} must be an array in {label} record {index}")
        for ref in record.get("requirement_refs", []) if isinstance(record.get("requirement_refs"), list) else []:
            if str(ref) not in requirement_ids:
                errors.append(f"Design node {record_id} references missing requirement {ref!r}")
        for ref in record.get("fact_refs", []) if isinstance(record.get("fact_refs"), list) else []:
            if str(ref) not in fact_ids:
                errors.append(f"Design node {record_id} references missing fact {ref!r}")
        infrastructure_rationale = record.get("infrastructure_only_rationale")
        has_infrastructure_rationale = isinstance(infrastructure_rationale, str) and bool(
            infrastructure_rationale.strip()
        )
        if (
            record_type == "design-decision"
            and record.get("status") == "accepted"
            and record_id not in satisfying_edges
            and not has_infrastructure_rationale
        ):
            errors.append(
                f"Accepted design decision {record_id} must satisfy a requirement/scenario or include non-empty infrastructure_only_rationale"
            )
        validate_design_source(topic_dir, record.get("source"), label, index, errors)


def validate_design_edges(
    records: list[dict[str, Any]], label: str, allowed_ids: set[str], db_path: Path, errors: list[str]
) -> None:
    for index, record in enumerate(records, start=1):
        if not record.get("from") or not record.get("to") or not record.get("type"):
            errors.append(f"Design edge in {label} record {index} must include from, to, and type")
            continue
        if record.get("type") not in DESIGN_EDGE_TYPES:
            errors.append(f"Invalid design edge type {record.get('type')!r} in {label} record {index}")
        for endpoint_name in ["from", "to"]:
            endpoint = str(record.get(endpoint_name))
            if endpoint in allowed_ids or endpoint.startswith(("file:", "doc:", "symbol:", "dependency:")):
                continue
            if indexed_node_exists(db_path, endpoint):
                continue
            errors.append(f"Unresolved {endpoint_name} endpoint {endpoint!r} in {label} record {index}")


def validate_requirement_citations(topic_dir: Path, requirement_ids: set[str], errors: list[str]) -> None:
    for name in ["requirements.md", "design.md", "plan.md"]:
        path = topic_dir / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for requirement_id in REQUIREMENT_CITATION_RE.findall(text):
            if requirement_id not in requirement_ids:
                errors.append(f"{name} cites missing requirement/scenario [{requirement_id}]")


def normalized_words(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower())


def validate_testing_strategy_contract(topic_dir: Path, requirement_ids: set[str], errors: list[str]) -> None:
    design_path = topic_dir / "design.md"
    plan_path = topic_dir / "plan.md"
    if not requirement_ids or not design_path.exists():
        return

    design_text = design_path.read_text(encoding="utf-8")
    design_lower = normalized_words(design_text)
    if "testing strategy" not in design_lower:
        errors.append("design.md must include a Testing Strategy section when topic requirements/scenarios exist")
        return

    required_terms = {
        "language/app type": ("language", "app"),
        "existing test tools": ("existing", "test"),
        "source-backed docs": ("docs",),
        "unit strategy": ("unit strategy",),
        "integration strategy": ("integration strategy",),
        "E2E strategy": ("e2e strategy",),
        "related ADR notes": ("adr",),
        "requirement coverage": ("req-",),
    }
    if any(requirement_id.startswith("SCN-") for requirement_id in requirement_ids):
        required_terms["scenario coverage"] = ("scn-",)
    for label, terms in required_terms.items():
        if not all(term in design_lower for term in terms):
            errors.append(f"Testing Strategy in design.md lacks {label}")

    plan_text = plan_path.read_text(encoding="utf-8") if plan_path.exists() else ""
    plan_lower = normalized_words(plan_text)
    if "testing strategy trace" not in plan_lower and "coverage matrix" not in plan_lower:
        errors.append("plan.md must include Testing Strategy Trace metadata or a requirement/scenario coverage matrix")
    plan_lines = plan_text.splitlines()
    coverage_line_pattern = re.compile(r"P\d+\.V\d+|exception|manual evidence|static evidence", re.IGNORECASE)
    for requirement_id in sorted(requirement_ids):
        if not requirement_id.startswith(("REQ-", "SCN-")):
            continue
        if not any(requirement_id in line and coverage_line_pattern.search(line) for line in plan_lines):
            errors.append(f"plan.md lacks validation coverage for requirement/scenario {requirement_id}")
    if "e2e" not in plan_lower:
        errors.append("plan.md must include at least one E2E validation for requirement-backed behavior changes")

    validation_line_pattern = re.compile(r"^- \[[ xX]\] \*\*(P\d+\.V\d+)\*\*\s*(.+)$", re.MULTILINE)
    concrete_pattern = re.compile(
        r"(`[^`]+`|\bcommand\b|\bartifact\b|\bfixture\b|\bscenario\b|\bmanual evidence\b|\bstatic evidence\b|tests?/[^\s`;,]+|[^\s`;,]+\.(?:py|ts|tsx|js|jsx|spec|test)\b)",
        re.IGNORECASE,
    )
    for validation_id, validation_text in validation_line_pattern.findall(plan_text):
        validation_lower = validation_text.lower()
        strategy_related = (
            "testing strategy trace" in validation_lower
            or any(requirement_id in validation_text for requirement_id in requirement_ids)
            or re.match(r"(?:run\s+)?(?:the\s+)?(?:tests|checks)\b", validation_lower)
        )
        if strategy_related and not concrete_pattern.search(validation_text):
            errors.append(
                f"Validation {validation_id} lacks concrete test artifacts/scenarios/commands or manual/static evidence"
            )
        if re.match(r"(?:run\s+)?(?:the\s+)?(?:tests|checks)\b", validation_lower) and not concrete_pattern.search(
            validation_text
        ):
            errors.append(
                f"Validation {validation_id} is generic-only and lacks concrete test artifacts/scenarios/commands"
            )

    pivot_terms = ["jest to vitest", "cypress to playwright", "replace pytest", "standardize playwright"]
    combined = normalized_words(design_text + "\n" + plan_text)
    if any(term in combined for term in pivot_terms) and "adr" not in combined:
        errors.append("Major testing-toolchain change lacks ADR evaluation/generation trigger")


def warn_missing_workflow_state(
    plan_nodes: list[dict[str, Any]],
    receipts: list[dict[str, Any]],
    context_packs: list[dict[str, Any]],
    warnings: list[str],
) -> None:
    receipt_phases = {str(record.get("phase_id")) for record in receipts if record.get("phase_id")}
    context_phases = {str(record.get("phase_id")) for record in context_packs if record.get("phase_id")}
    for phase in [record for record in plan_nodes if record.get("type") == "phase"]:
        phase_id = str(phase.get("phase_id") or "")
        if not phase_id or str(phase.get("status")) not in {"complete", "implemented"}:
            continue
        if phase_id not in context_phases:
            warnings.append(f"Completed phase {phase_id} lacks a context-pack record")
        if phase_id not in receipt_phases:
            warnings.append(f"Completed phase {phase_id} lacks a receipt record")


def validate_miss_records(records: list[dict[str, Any]], label: str, errors: list[str]) -> None:
    for index, record in enumerate(records, start=1):
        for field in ("id", "created_at", "original_query", "failure_type", "resolution"):
            if not record.get(field):
                errors.append(f"Missing {field} in {label} record {index}")
        if record.get("failure_type") and str(record["failure_type"]) not in MISS_FAILURE_TYPES:
            errors.append(f"Invalid failure_type {record['failure_type']!r} in {label} record {index}")
        if record.get("resolution") and str(record["resolution"]) not in MISS_RESOLUTIONS:
            errors.append(f"Invalid resolution {record['resolution']!r} in {label} record {index}")
        for field in record:
            if field in RAW_MISS_FIELDS:
                errors.append(f"Raw snippet/content field {field} is not allowed in {label} record {index}")


def collect_strings(value: Any, output: list[str] | None = None) -> list[str]:
    if output is None:
        output = []
    if isinstance(value, str):
        output.append(value)
    elif isinstance(value, list):
        for item in value:
            collect_strings(item, output)
    elif isinstance(value, dict):
        for item in value.values():
            collect_strings(item, output)
    return output


def validate_no_private_artifact_refs(records: list[dict[str, Any]], label: str, errors: list[str]) -> None:
    checked_fields = ("reference", "evidence", "url", "path", "raw_archive_path", "source_path", "private_path_hint")
    for index, record in enumerate(records, start=1):
        for field in checked_fields:
            for text in collect_strings(record.get(field)):
                for match in ACTUAL_PRIVATE_PATH_RE.finditer(text):
                    if str(record.get("id", "")).startswith("private:"):
                        continue
                    errors.append(
                        f"Direct private artifact reference {match.group(0)!r} in {label} record {index} field {field}"
                    )


def validate_secret_patterns(text: str, label: str, errors: list[str]) -> None:
    for name, pattern in SECRET_PATTERNS:
        if pattern.search(text):
            errors.append(f"Potential secret pattern {name} in {label}")


def evidence_files(topic_dir: Path) -> list[Path]:
    evidence_dir = topic_dir / "evidence"
    if not evidence_dir.exists():
        return []
    return sorted(
        path for path in evidence_dir.rglob("*") if path.is_file() and path.suffix.lower() in {".md", ".jsonl"}
    )


def reference_path(root: Path, reference: Any) -> Path | None:
    if not isinstance(reference, str):
        return None
    match = re.match(r"(.+):(\d+)$", reference)
    if not match:
        return None
    rel = match.group(1)
    if rel.startswith(("http://", "https://")):
        return None
    path = Path(rel)
    return path if path.is_absolute() else root / path


def validate_evidence_artifacts(
    root: Path, topic_dir: Path, fact_nodes: list[dict[str, Any]], errors: list[str]
) -> int:
    files = evidence_files(topic_dir)
    for file in files:
        text = file.read_text(encoding="utf-8")
        validate_secret_patterns(text, file.relative_to(root).as_posix(), errors)
        if file.name != "manifest.jsonl":
            for match in ACTUAL_PRIVATE_PATH_RE.finditer(text):
                errors.append(
                    f"Direct private artifact reference {match.group(0)!r} in {file.relative_to(root).as_posix()}"
                )
    for source in fact_nodes:
        if source.get("type") != "source" or source.get("source_kind") != "sanitized_evidence":
            continue
        source_path = reference_path(root, source.get("reference"))
        if not source_path or not source_path.exists():
            errors.append(f"Sanitized evidence source {source.get('id')} lacks a valid evidence file reference")
            continue
        text = source_path.read_text(encoding="utf-8")
        if not re.search(r"Redaction status:", text, re.IGNORECASE):
            errors.append(
                f"Sanitized evidence source {source.get('id')} lacks Redaction status in {source_path.relative_to(root).as_posix()}"
            )
    return len(files)


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
    warnings: list[str] = []

    map_nodes = read_jsonl(topic_dir / "map.nodes.jsonl", errors)
    map_edges = read_jsonl(topic_dir / "map.edges.jsonl", errors)
    fact_nodes = read_jsonl(topic_dir / "facts.nodes.jsonl", errors)
    fact_edges = read_jsonl(topic_dir / "facts.edges.jsonl", errors)
    plan_nodes = read_jsonl(topic_dir / "plan.nodes.jsonl", errors, required=True)
    plan_edges = read_jsonl(topic_dir / "plan.edges.jsonl", errors, required=True)
    requirement_nodes = read_jsonl(topic_dir / "requirements.nodes.jsonl", errors)
    requirement_edges = read_jsonl(topic_dir / "requirements.edges.jsonl", errors)
    design_nodes = read_jsonl(topic_dir / "design.nodes.jsonl", errors)
    design_edges = read_jsonl(topic_dir / "design.edges.jsonl", errors)
    interview_nodes = read_jsonl(topic_dir / "interview.nodes.jsonl", errors)
    interview_edges = read_jsonl(topic_dir / "interview.edges.jsonl", errors)
    receipts = read_jsonl(topic_dir / "receipts.jsonl", errors)
    context_packs = read_jsonl(topic_dir / "context-packs.jsonl", errors)
    retrieval_misses = read_jsonl(root / ".plan/_retrieval/misses.jsonl", errors)
    graph = read_json(topic_dir / "map.graph.json", errors) or {}

    map_ids = validate_unique_ids(map_nodes, topic_dir / "map.nodes.jsonl", errors)
    fact_ids_all = validate_unique_ids(fact_nodes, topic_dir / "facts.nodes.jsonl", errors)
    source_ids_for_requirements = {
        str(node.get("id")) for node in fact_nodes if node.get("type") == "source" and node.get("id")
    }
    fact_ids_for_requirements = {
        str(node.get("id")) for node in fact_nodes if node.get("type") == "fact" and node.get("id")
    }
    plan_ids = validate_unique_ids(plan_nodes, topic_dir / "plan.nodes.jsonl", errors)
    requirement_ids = validate_unique_ids(requirement_nodes, topic_dir / "requirements.nodes.jsonl", errors)
    design_ids = validate_unique_ids(design_nodes, topic_dir / "design.nodes.jsonl", errors)
    interview_ids = validate_unique_ids(interview_nodes, topic_dir / "interview.nodes.jsonl", errors)
    graph_ids = {str(node.get("id")) for node in graph.get("nodes", []) if isinstance(node, dict) and node.get("id")}
    allowed_ids = map_ids | fact_ids_all | plan_ids | requirement_ids | design_ids | interview_ids | graph_ids

    validate_edges(map_edges, topic_dir / "map.edges.jsonl", allowed_ids, db_path, errors)
    validate_edges(fact_edges, topic_dir / "facts.edges.jsonl", allowed_ids, db_path, errors)
    validate_edges(plan_edges, topic_dir / "plan.edges.jsonl", allowed_ids, db_path, errors)
    validate_requirement_records(
        requirement_nodes, "requirements.nodes.jsonl", fact_ids_for_requirements, source_ids_for_requirements, errors
    )
    validate_requirement_edges(requirement_edges, "requirements.edges.jsonl", allowed_ids, errors)
    validate_design_records(
        topic_dir, design_nodes, design_edges, "design.nodes.jsonl", requirement_ids, fact_ids_for_requirements, errors
    )
    validate_design_edges(design_edges, "design.edges.jsonl", allowed_ids, db_path, errors)
    validate_interview_records(
        topic_dir,
        interview_nodes,
        "interview.nodes.jsonl",
        requirement_ids,
        design_ids,
        fact_ids_for_requirements,
        errors,
    )
    validate_interview_edges(interview_edges, "interview.edges.jsonl", allowed_ids, errors)
    validate_file_references(
        root,
        [
            *map_nodes,
            *map_edges,
            *fact_nodes,
            *fact_edges,
            *plan_nodes,
            *plan_edges,
            *requirement_nodes,
            *requirement_edges,
            *design_nodes,
            *design_edges,
            *interview_nodes,
            *interview_edges,
        ],
        topic_dir,
        errors,
    )
    validate_lifecycle_and_retrieval_metadata(map_nodes, "map.nodes.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(map_edges, "map.edges.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(fact_nodes, "facts.nodes.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(fact_edges, "facts.edges.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(plan_nodes, "plan.nodes.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(plan_edges, "plan.edges.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(requirement_nodes, "requirements.nodes.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(requirement_edges, "requirements.edges.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(design_nodes, "design.nodes.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(design_edges, "design.edges.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(interview_nodes, "interview.nodes.jsonl", errors, warnings)
    validate_lifecycle_and_retrieval_metadata(interview_edges, "interview.edges.jsonl", errors, warnings)
    validate_no_private_artifact_refs(map_nodes, "map.nodes.jsonl", errors)
    validate_no_private_artifact_refs(map_edges, "map.edges.jsonl", errors)
    validate_no_private_artifact_refs(fact_nodes, "facts.nodes.jsonl", errors)
    validate_no_private_artifact_refs(fact_edges, "facts.edges.jsonl", errors)
    validate_no_private_artifact_refs(plan_nodes, "plan.nodes.jsonl", errors)
    validate_no_private_artifact_refs(plan_edges, "plan.edges.jsonl", errors)
    validate_no_private_artifact_refs(requirement_nodes, "requirements.nodes.jsonl", errors)
    validate_no_private_artifact_refs(requirement_edges, "requirements.edges.jsonl", errors)
    validate_no_private_artifact_refs(design_nodes, "design.nodes.jsonl", errors)
    validate_no_private_artifact_refs(design_edges, "design.edges.jsonl", errors)
    validate_no_private_artifact_refs(interview_nodes, "interview.nodes.jsonl", errors)
    validate_no_private_artifact_refs(interview_edges, "interview.edges.jsonl", errors)
    validate_no_private_artifact_refs(receipts, "receipts.jsonl", errors)
    validate_no_private_artifact_refs(context_packs, "context-packs.jsonl", errors)
    validate_receipt_records(receipts, "receipts.jsonl", errors)
    validate_context_pack_records(context_packs, "context-packs.jsonl", errors)
    warn_missing_workflow_state(plan_nodes, receipts, context_packs, warnings)
    validate_miss_records(retrieval_misses, "misses.jsonl", errors)
    evidence_file_count = validate_evidence_artifacts(root, topic_dir, fact_nodes, errors)

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

    validate_requirement_citations(topic_dir, requirement_ids, errors)
    validate_testing_strategy_contract(topic_dir, requirement_ids, errors)
    validate_plan(topic_dir / "plan.md", fact_ids, allowed_ids, plan_ids, db_path, errors)

    report = {
        "topic": args.topic,
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "map_nodes": len(map_nodes),
            "map_edges": len(map_edges),
            "fact_nodes": len(fact_nodes),
            "fact_edges": len(fact_edges),
            "plan_nodes": len(plan_nodes),
            "plan_edges": len(plan_edges),
            "requirement_nodes": len(requirement_nodes),
            "requirement_edges": len(requirement_edges),
            "design_nodes": len(design_nodes),
            "design_edges": len(design_edges),
            "interview_nodes": len(interview_nodes),
            "interview_edges": len(interview_edges),
            "receipts": len(receipts),
            "context_packs": len(context_packs),
            "evidence_files": evidence_file_count,
            "retrieval_misses": len(retrieval_misses),
        },
    }
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    elif errors:
        print("Planning graph validation failed:")
        for error in errors:
            print(f"- {error}")
        for warning in warnings:
            print(f"Warning: {warning}")
    else:
        print("Planning graph validation passed.")
        for warning in warnings:
            print(f"Warning: {warning}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
