#!/usr/bin/env python3
"""Architecture Decision Record helpers for Cartographer.

This module is intentionally stdlib-only.  Phase P0 provides reusable ADR
Markdown, directory discovery, slugging, numbering, and a small JSON-emitting CLI
foundation. Later phases can build graph validation and write workflows on top of
these primitives without changing the contracts established here.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ADR_DIRECTORY_CANDIDATES = (
    "docs/adr",
    "docs/decisions",
    "doc/adr",
    "doc/decisions",
    "adr",
    "decisions",
)
FALLBACK_ADR_DIR = "docs/adr"
ADR_GRAPH_DIR = "_graph"
ADR_NODES_FILENAME = "adr.nodes.jsonl"
ADR_EDGES_FILENAME = "adr.edges.jsonl"

ADR_FILENAME_RE = re.compile(r"^(?P<number>\d{4})-(?P<slug>.+)\.md$")
ADR_ID_RE = re.compile(r"^ADR-(?P<number>\d{4})$")
ADR_NODE_ID_RE = re.compile(r"^adr:(?P<number>\d{4})$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FRONT_MATTER_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SECTION_HEADING_RE = re.compile(r"^##\s+(?P<title>.+?)\s*$")

ADR_STATUSES = {"proposed", "accepted", "accepted-legacy", "superseded", "rejected", "draft"}
ADR_EDGE_TYPES = {"supersedes", "related_to", "precursor_to", "depends_on", "child_of", "conflicts_with"}
ADR_NODE_REQUIRED_FIELDS = (
    "id",
    "type",
    "adr_id",
    "title",
    "path",
    "status",
    "decision_date",
    "domains",
    "keywords",
    "summary",
    "current",
)
ADR_EDGE_REQUIRED_FIELDS = ("from", "to", "type")
ACYCLIC_ADR_EDGE_TYPES = {"supersedes", "precursor_to", "depends_on", "child_of"}
NON_CURRENT_STATUSES = {"rejected", "superseded"}
LEGACY_IMPORT_NOTE_FIELDS = ("import_note", "legacy_import_note", "legacy_note")
SOURCE_STRING_FIELDS = ("generated_from_topic", "adr_required_source", "source", "source_mode")
SOURCE_LIST_FIELDS = ("source_commits", "validation_receipts")
ACTUAL_PRIVATE_PATH_RE = re.compile(r"\.plan/_private/(?!<topic>|_inbox/<)[^\s`\"')\]]+")
TOPIC_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$")

FRONT_MATTER_FIELD_ORDER = (
    "adr_id",
    "title",
    "status",
    "decision_date",
    "generated_from_topic",
    "adr_required_source",
    "legacy_import",
    "source_commits",
    "validation_receipts",
    "domains",
    "keywords",
    "decision_kind",
    "supersedes",
    "related",
    "precursors",
    "children",
    "confidence",
)
REQUIRED_FRONT_MATTER_FIELDS = FRONT_MATTER_FIELD_ORDER
LIST_FRONT_MATTER_FIELDS = {
    "source_commits",
    "validation_receipts",
    "domains",
    "keywords",
    "supersedes",
    "related",
    "precursors",
    "children",
}
BOOL_FRONT_MATTER_FIELDS = {"legacy_import"}
SCALAR_FRONT_MATTER_FIELDS = set(FRONT_MATTER_FIELD_ORDER) - LIST_FRONT_MATTER_FIELDS - BOOL_FRONT_MATTER_FIELDS

REQUIRED_BODY_SECTIONS = (
    "Status",
    "Decision",
    "Context",
    "Considered Options",
    "Why This Decision",
    "Consequences",
    "How to Use This Decision",
    "Validation",
)
SECTION_TO_FIELD = {
    "Decision": "decision",
    "Context": "context",
    "Considered Options": "considered_options",
    "Why This Decision": "rationale",
    "Consequences": "consequences",
    "How to Use This Decision": "usage",
    "Validation": "validation",
}


class AdrRecordsError(ValueError):
    """Base error for ADR helper failures."""


class AdrMarkdownError(AdrRecordsError):
    """Raised when ADR Markdown cannot be parsed or rendered safely."""


@dataclass(frozen=True)
class AdrDirectoryDiscovery:
    """Result of ADR directory selection."""

    root: Path
    selected_dir: Path | None
    existing_candidates: tuple[str, ...]
    candidate_dirs: tuple[str, ...]
    ambiguous: bool = False
    fallback_used: bool = False
    created: bool = False
    errors: tuple[str, ...] = ()

    @property
    def selected_dir_rel(self) -> str | None:
        if self.selected_dir is None:
            return None
        return rel_path(self.root, self.selected_dir)

    def to_receipt(self, action: str) -> dict[str, Any]:
        return {
            "ok": not self.ambiguous and not self.errors,
            "action": action,
            "root": str(self.root),
            "adr_dir": self.selected_dir_rel,
            "candidate_dirs": list(self.candidate_dirs),
            "existing_candidates": list(self.existing_candidates),
            "ambiguous": self.ambiguous,
            "fallback_used": self.fallback_used,
            "created": self.created,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class NumberAllocation:
    """Existing ADR numbers and the next available number."""

    next_number: int
    file_numbers: tuple[int, ...] = ()
    graph_numbers: tuple[int, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def existing_numbers(self) -> tuple[int, ...]:
        return tuple(sorted(set(self.file_numbers) | set(self.graph_numbers)))

    @property
    def next_adr_id(self) -> str:
        return format_adr_id(self.next_number)


@dataclass(frozen=True)
class AdrGraph:
    """Loaded ADR graph JSONL records and their source paths."""

    adr_dir: Path
    nodes_path: Path
    edges_path: Path
    nodes: tuple[dict[str, Any], ...] = ()
    edges: tuple[dict[str, Any], ...] = ()
    errors: tuple[str, ...] = ()


@dataclass(frozen=True)
class AdrMarkdownEntry:
    """Parsed ADR Markdown file plus raw metadata needed for validation."""

    path: Path
    rel_path: str
    record: AdrRecord
    metadata: dict[str, Any]
    text: str


@dataclass
class AdrRecord:
    """Minimal generated ADR Markdown contract.

    The front matter fields mirror the proposal's P0 schema. Body fields render to
    the required ADR sections in REQUIRED_BODY_SECTIONS order.
    """

    adr_id: str
    title: str
    status: str
    decision_date: str
    generated_from_topic: str = ""
    adr_required_source: str = ""
    legacy_import: bool = False
    source_commits: list[str] = field(default_factory=list)
    validation_receipts: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    decision_kind: str = ""
    supersedes: list[str] = field(default_factory=list)
    related: list[str] = field(default_factory=list)
    precursors: list[str] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    confidence: str = ""
    decision: str = ""
    context: str = ""
    considered_options: list[str] = field(default_factory=list)
    rationale: str = ""
    consequences: list[str] = field(default_factory=list)
    usage: str = ""
    validation: str = ""

    def to_front_matter(self) -> dict[str, Any]:
        return {
            "adr_id": self.adr_id,
            "title": self.title,
            "status": self.status,
            "decision_date": self.decision_date,
            "generated_from_topic": self.generated_from_topic,
            "adr_required_source": self.adr_required_source,
            "legacy_import": self.legacy_import,
            "source_commits": list(self.source_commits),
            "validation_receipts": list(self.validation_receipts),
            "domains": list(self.domains),
            "keywords": list(self.keywords),
            "decision_kind": self.decision_kind,
            "supersedes": list(self.supersedes),
            "related": list(self.related),
            "precursors": list(self.precursors),
            "children": list(self.children),
            "confidence": self.confidence,
        }

    def to_sections(self) -> dict[str, str | list[str]]:
        return {
            "Status": render_status_sentence(self.status, self.decision_date),
            "Decision": self.decision,
            "Context": self.context,
            "Considered Options": list(self.considered_options),
            "Why This Decision": self.rationale,
            "Consequences": list(self.consequences),
            "How to Use This Decision": self.usage,
            "Validation": self.validation,
        }

    def to_summary(self, path: Path | None = None, root: Path | None = None) -> dict[str, Any]:
        match = ADR_ID_RE.match(self.adr_id)
        number = int(match.group("number")) if match else None
        summary: dict[str, Any] = {
            "adr_id": self.adr_id,
            "number": number,
            "title": self.title,
            "status": self.status,
            "decision_date": self.decision_date,
            "domains": list(self.domains),
            "keywords": list(self.keywords),
            "confidence": self.confidence,
        }
        if path is not None:
            summary["path"] = rel_path(root or path.parent, path)
        return summary


def rel_path(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def resolve_under_root(root: Path, raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    resolved = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
    if not is_within(resolved, root):
        raise AdrRecordsError(f"ADR directory must be inside the project root: {raw_path}")
    return resolved


def slugify_title(title: str, *, max_length: int = 72) -> str:
    """Return a stable filename slug for an ADR title."""

    normalized = unicodedata.normalize("NFKD", title)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower().replace("&", " and ")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    slug = re.sub(r"-+", "-", slug)
    if len(slug) > max_length:
        slug = slug[:max_length].rstrip("-")
    return slug or "decision"


def format_adr_id(number: int) -> str:
    return f"ADR-{number:04d}"


def format_adr_node_id(number: int) -> str:
    return f"adr:{number:04d}"


def format_adr_filename(number: int, title: str) -> str:
    return f"{number:04d}-{slugify_title(title)}.md"


def number_from_adr_id(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    match = ADR_ID_RE.match(value.strip())
    return int(match.group("number")) if match else None


def number_from_node_id(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    match = ADR_NODE_ID_RE.match(value.strip())
    return int(match.group("number")) if match else None


def number_from_path(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    match = ADR_FILENAME_RE.match(Path(value).name)
    return int(match.group("number")) if match else None


def discover_adr_directory(
    root: str | Path, adr_dir: str | None = None, *, create: bool = False
) -> AdrDirectoryDiscovery:
    """Discover the repository ADR directory using project conventions.

    If no convention exists, select docs/adr and create it only when create=True.
    If multiple conventions exist, report ambiguity and do not select or create.
    """

    root_path = Path(root).resolve()
    candidate_dirs = tuple(ADR_DIRECTORY_CANDIDATES)
    existing = tuple(candidate for candidate in candidate_dirs if (root_path / candidate).is_dir())

    if adr_dir:
        selected = resolve_under_root(root_path, adr_dir)
        created = False
        if create and not selected.exists():
            selected.mkdir(parents=True, exist_ok=True)
            created = True
        if selected.exists() and not selected.is_dir():
            return AdrDirectoryDiscovery(
                root=root_path,
                selected_dir=selected,
                existing_candidates=existing,
                candidate_dirs=candidate_dirs,
                errors=(f"ADR path is not a directory: {rel_path(root_path, selected)}",),
            )
        return AdrDirectoryDiscovery(
            root=root_path,
            selected_dir=selected,
            existing_candidates=existing,
            candidate_dirs=candidate_dirs,
            created=created,
        )

    if len(existing) > 1:
        return AdrDirectoryDiscovery(
            root=root_path,
            selected_dir=None,
            existing_candidates=existing,
            candidate_dirs=candidate_dirs,
            ambiguous=True,
            errors=("Multiple ADR directory conventions exist; provide --adr-dir before writing.",),
        )

    if len(existing) == 1:
        selected = root_path / existing[0]
        return AdrDirectoryDiscovery(
            root=root_path,
            selected_dir=selected,
            existing_candidates=existing,
            candidate_dirs=candidate_dirs,
        )

    selected = root_path / FALLBACK_ADR_DIR
    created = False
    if create and not selected.exists():
        selected.mkdir(parents=True, exist_ok=True)
        created = True
    if selected.exists() and not selected.is_dir():
        return AdrDirectoryDiscovery(
            root=root_path,
            selected_dir=selected,
            existing_candidates=existing,
            candidate_dirs=candidate_dirs,
            fallback_used=True,
            created=created,
            errors=(f"ADR path is not a directory: {rel_path(root_path, selected)}",),
        )
    return AdrDirectoryDiscovery(
        root=root_path,
        selected_dir=selected,
        existing_candidates=existing,
        candidate_dirs=candidate_dirs,
        fallback_used=True,
        created=created,
    )


def file_numbers_in(adr_dir: Path) -> tuple[int, ...]:
    if not adr_dir.exists() or not adr_dir.is_dir():
        return ()
    numbers = []
    for path in adr_dir.iterdir():
        if not path.is_file():
            continue
        match = ADR_FILENAME_RE.match(path.name)
        if match:
            numbers.append(int(match.group("number")))
    return tuple(sorted(set(numbers)))


def graph_node_numbers_in(adr_dir: Path) -> tuple[tuple[int, ...], tuple[str, ...]]:
    graph_path = adr_dir / ADR_GRAPH_DIR / ADR_NODES_FILENAME
    if not graph_path.exists():
        return (), ()

    numbers: set[int] = set()
    warnings: list[str] = []
    try:
        lines = graph_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return (), (f"Unable to read {graph_path.name}: {exc}",)

    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            warnings.append(f"Invalid JSONL in {ADR_GRAPH_DIR}/{ADR_NODES_FILENAME}:{line_number}: {exc.msg}")
            continue
        if not isinstance(record, dict):
            warnings.append(f"ADR graph node record must be an object at line {line_number}")
            continue
        for key, parser in (("adr_id", number_from_adr_id), ("id", number_from_node_id), ("path", number_from_path)):
            number = parser(record.get(key))
            if number is not None:
                numbers.add(number)
    return tuple(sorted(numbers)), tuple(warnings)


def allocate_next_number(adr_dir: str | Path) -> NumberAllocation:
    adr_path = Path(adr_dir).resolve()
    file_numbers = file_numbers_in(adr_path)
    graph_numbers, warnings = graph_node_numbers_in(adr_path)
    existing = set(file_numbers) | set(graph_numbers)
    next_number = max(existing, default=0) + 1
    return NumberAllocation(
        next_number=next_number,
        file_numbers=file_numbers,
        graph_numbers=graph_numbers,
        warnings=warnings,
    )


def validate_front_matter_fields(metadata: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_FRONT_MATTER_FIELDS:
        if key not in metadata:
            errors.append(f"Missing required front matter field: {key}")
    for key in LIST_FRONT_MATTER_FIELDS:
        if key in metadata and not isinstance(metadata[key], list):
            errors.append(f"Front matter field must be a list: {key}")
    for key in BOOL_FRONT_MATTER_FIELDS:
        if key in metadata and not isinstance(metadata[key], bool):
            errors.append(f"Front matter field must be boolean: {key}")
    for key in SCALAR_FRONT_MATTER_FIELDS:
        if key in metadata and isinstance(metadata[key], (list, dict, bool)):
            errors.append(f"Front matter field must be a scalar string: {key}")
    adr_number = number_from_adr_id(metadata.get("adr_id"))
    if metadata.get("adr_id") is not None and adr_number is None:
        errors.append("Front matter adr_id must match ADR-NNNN")
    decision_date = metadata.get("decision_date")
    if isinstance(decision_date, str) and DATE_RE.match(decision_date):
        try:
            dt.date.fromisoformat(decision_date)
        except ValueError:
            errors.append("Front matter decision_date must be a valid YYYY-MM-DD date")
    elif decision_date is not None:
        errors.append("Front matter decision_date must be YYYY-MM-DD")
    status = metadata.get("status")
    if isinstance(status, str) and status and status not in ADR_STATUSES:
        errors.append(f"Front matter status is not recognized: {status}")
    return errors


def render_status_sentence(status: str, decision_date: str) -> str:
    label = status.replace("-", " ").title() if status else "Recorded"
    if status == "accepted":
        label = "Accepted"
    return f"{label} on {decision_date}."


def render_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return '""'
    text = str(value)
    if "\n" in text or "\r" in text:
        raise AdrMarkdownError("Front matter scalar values must be single-line strings")
    if text == "" or text != text.strip() or text[0] in {'"', "'", "[", "]", "{", "}", "#", "!", "*", "&"}:
        return json.dumps(text, ensure_ascii=False)
    return text


def render_front_matter(metadata: dict[str, Any]) -> str:
    errors = validate_front_matter_fields(metadata)
    if errors:
        raise AdrMarkdownError("Invalid ADR front matter: " + "; ".join(errors))

    ordered_keys = [key for key in FRONT_MATTER_FIELD_ORDER if key in metadata]
    extra_keys = sorted(key for key in metadata if key not in FRONT_MATTER_FIELD_ORDER)
    lines = ["---"]
    for key in [*ordered_keys, *extra_keys]:
        value = metadata[key]
        if isinstance(value, list):
            if not value:
                lines.append(f"{key}: []")
            else:
                lines.append(f"{key}:")
                for item in value:
                    if isinstance(item, list | dict):
                        raise AdrMarkdownError(f"Unsupported nested front matter list item for {key}")
                    lines.append(f"  - {render_scalar(item)}")
        elif isinstance(value, dict):
            raise AdrMarkdownError(f"Unsupported nested front matter mapping for {key}")
        else:
            lines.append(f"{key}: {render_scalar(value)}")
    lines.append("---")
    return "\n".join(lines)


def parse_inline_list(raw: str) -> list[Any]:
    if raw == "[]":
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    inner = raw[1:-1].strip()
    if not inner:
        return []
    return [parse_scalar(item.strip()) for item in inner.split(",")]


def parse_scalar(raw: str) -> Any:
    value = raw.strip()
    lower = value.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if value.startswith("[") and value.endswith("]"):
        return parse_inline_list(value)
    if value.startswith('"') and value.endswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise AdrMarkdownError(f"Invalid quoted front matter scalar: {exc.msg}") from exc
    return value


def split_front_matter(text: str) -> tuple[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise AdrMarkdownError("ADR Markdown must start with YAML-ish front matter")
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            front_matter = "\n".join(lines[1:index])
            body = "\n".join(lines[index + 1 :])
            return front_matter, body
    raise AdrMarkdownError("ADR Markdown front matter is not closed")


def parse_front_matter_block(block: str) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    lines = block.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line.startswith(" "):
            raise AdrMarkdownError(f"Unsupported front matter indentation at line {index + 1}")
        if ":" not in line:
            raise AdrMarkdownError(f"Invalid front matter line {index + 1}: missing ':'")
        key, raw_value = line.split(":", 1)
        key = key.strip()
        if not FRONT_MATTER_KEY_RE.match(key):
            raise AdrMarkdownError(f"Invalid front matter key at line {index + 1}: {key}")
        if key in metadata:
            raise AdrMarkdownError(f"Duplicate front matter field: {key}")
        raw_value = raw_value.strip()
        if raw_value == "":
            values: list[Any] = []
            index += 1
            while index < len(lines):
                item_line = lines[index]
                if not item_line.strip():
                    index += 1
                    continue
                if not item_line.startswith("  - "):
                    break
                values.append(parse_scalar(item_line[4:].strip()))
                index += 1
            metadata[key] = values
            continue
        metadata[key] = parse_scalar(raw_value)
        index += 1

    errors = validate_front_matter_fields(metadata)
    if errors:
        raise AdrMarkdownError("Invalid ADR front matter: " + "; ".join(errors))
    return metadata


def parse_body_sections(body: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current: str | None = None
    buffer: list[str] = []

    def save_current() -> None:
        if current is not None:
            sections[current] = "\n".join(buffer).strip()

    for line in body.splitlines():
        match = SECTION_HEADING_RE.match(line)
        if match:
            save_current()
            current = match.group("title")
            buffer = []
            continue
        if current is not None:
            buffer.append(line)
    save_current()

    missing = [section for section in REQUIRED_BODY_SECTIONS if section not in sections]
    if missing:
        raise AdrMarkdownError("Missing required ADR body sections: " + ", ".join(missing))
    return sections


def render_section_value(value: str | list[str]) -> str:
    if isinstance(value, list):
        if not value:
            return "- None recorded."
        return "\n".join(f"- {item}" for item in value)
    return value.strip()


def parse_bullet_section(value: str) -> list[str]:
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    if not lines:
        return []
    if all(line.startswith("- ") for line in lines):
        parsed = [line[2:].strip() for line in lines]
        return [] if parsed == ["None recorded."] else parsed
    return [value.strip()]


def render_adr_markdown(record: AdrRecord) -> str:
    front_matter = render_front_matter(record.to_front_matter())
    sections = record.to_sections()
    body_parts = [front_matter, "", f"# {record.adr_id}: {record.title}"]
    for section in REQUIRED_BODY_SECTIONS:
        body_parts.extend(["", f"## {section}", "", render_section_value(sections[section])])
    return "\n".join(body_parts).rstrip() + "\n"


def parse_adr_markdown(text: str) -> AdrRecord:
    front_matter_block, body = split_front_matter(text)
    metadata = parse_front_matter_block(front_matter_block)
    sections = parse_body_sections(body)
    return AdrRecord(
        adr_id=str(metadata["adr_id"]),
        title=str(metadata["title"]),
        status=str(metadata["status"]),
        decision_date=str(metadata["decision_date"]),
        generated_from_topic=str(metadata["generated_from_topic"]),
        adr_required_source=str(metadata["adr_required_source"]),
        legacy_import=bool(metadata["legacy_import"]),
        source_commits=[str(item) for item in metadata["source_commits"]],
        validation_receipts=[str(item) for item in metadata["validation_receipts"]],
        domains=[str(item) for item in metadata["domains"]],
        keywords=[str(item) for item in metadata["keywords"]],
        decision_kind=str(metadata["decision_kind"]),
        supersedes=[str(item) for item in metadata["supersedes"]],
        related=[str(item) for item in metadata["related"]],
        precursors=[str(item) for item in metadata["precursors"]],
        children=[str(item) for item in metadata["children"]],
        confidence=str(metadata["confidence"]),
        decision=sections["Decision"],
        context=sections["Context"],
        considered_options=parse_bullet_section(sections["Considered Options"]),
        rationale=sections["Why This Decision"],
        consequences=parse_bullet_section(sections["Consequences"]),
        usage=sections["How to Use This Decision"],
        validation=sections["Validation"],
    )


def adr_graph_paths(adr_dir: str | Path) -> tuple[Path, Path]:
    graph_dir = Path(adr_dir) / ADR_GRAPH_DIR
    return graph_dir / ADR_NODES_FILENAME, graph_dir / ADR_EDGES_FILENAME


def sort_json_value(value: Any) -> Any:
    if isinstance(value, list):
        return [sort_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: sort_json_value(value[key]) for key in sorted(value)}
    return value


def read_jsonl_records(
    path: str | Path, *, label: str | None = None, required: bool = False
) -> tuple[list[dict[str, Any]], tuple[str, ...]]:
    """Read JSONL object records with deterministic error messages."""

    jsonl_path = Path(path)
    display = label or jsonl_path.as_posix()
    errors: list[str] = []
    if not jsonl_path.exists():
        if required:
            errors.append(f"Missing required JSONL file: {display}")
        return [], tuple(errors)

    try:
        lines = jsonl_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [], (f"Unable to read JSONL file {display}: {exc}",)

    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"Invalid JSONL in {display}:{line_number}: {exc.msg}")
            continue
        if not isinstance(value, dict):
            errors.append(f"JSONL record must be an object in {display}:{line_number}")
            continue
        records.append(value)
    return records, tuple(errors)


def write_jsonl_atomic(path: str | Path, records: list[dict[str, Any]] | tuple[dict[str, Any], ...]) -> None:
    """Write JSONL records using stable key ordering and an atomic rename."""

    jsonl_path = Path(path)
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = dt.datetime.now(dt.UTC).strftime("%Y%m%d%H%M%S%f")
    tmp_path = jsonl_path.parent / f".tmp-{os.getpid()}-{suffix}-{jsonl_path.name}"
    text = "".join(json.dumps(sort_json_value(record), ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    tmp_path.write_text(text, encoding="utf-8")
    tmp_path.replace(jsonl_path)


def load_adr_graph(adr_dir: str | Path) -> AdrGraph:
    adr_path = Path(adr_dir).resolve()
    nodes_path, edges_path = adr_graph_paths(adr_path)
    node_records, node_errors = read_jsonl_records(nodes_path, label=f"{ADR_GRAPH_DIR}/{ADR_NODES_FILENAME}")
    edge_records, edge_errors = read_jsonl_records(edges_path, label=f"{ADR_GRAPH_DIR}/{ADR_EDGES_FILENAME}")
    return AdrGraph(
        adr_dir=adr_path,
        nodes_path=nodes_path,
        edges_path=edges_path,
        nodes=tuple(node_records),
        edges=tuple(edge_records),
        errors=tuple([*node_errors, *edge_errors]),
    )


def save_adr_graph(
    adr_dir: str | Path,
    nodes: list[dict[str, Any]] | tuple[dict[str, Any], ...],
    edges: list[dict[str, Any]] | tuple[dict[str, Any], ...],
) -> AdrGraph:
    """Write ADR graph JSONL files and return the reloaded graph."""

    nodes_path, edges_path = adr_graph_paths(adr_dir)
    write_jsonl_atomic(nodes_path, nodes)
    write_jsonl_atomic(edges_path, edges)
    return load_adr_graph(adr_dir)


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


def append_private_reference_errors_from_text(text: str, label: str, errors: list[str]) -> None:
    for match in ACTUAL_PRIVATE_PATH_RE.finditer(text):
        errors.append(f"Direct private artifact reference {match.group(0)!r} in {label}")


def append_private_reference_errors_from_records(
    records: tuple[dict[str, Any], ...], label: str, errors: list[str]
) -> None:
    for index, record in enumerate(records, start=1):
        for text in collect_strings(record):
            for match in ACTUAL_PRIVATE_PATH_RE.finditer(text):
                errors.append(f"Direct private artifact reference {match.group(0)!r} in {label} record {index}")


def parse_markdown_entries(
    root: Path, adr_dir: Path, errors: list[str], parse_errors: list[dict[str, str]] | None = None
) -> dict[str, AdrMarkdownEntry]:
    entries: dict[str, AdrMarkdownEntry] = {}
    seen_adr_ids: dict[str, str] = {}
    if not adr_dir.exists() or not adr_dir.is_dir():
        return entries

    for path in sorted(adr_dir.iterdir(), key=lambda item: item.name):
        if not path.is_file() or ADR_FILENAME_RE.match(path.name) is None:
            continue
        rel = rel_path(root, path)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            message = f"Unable to read ADR Markdown {rel}: {exc}"
            errors.append(message)
            if parse_errors is not None:
                parse_errors.append({"path": rel, "error": str(exc)})
            continue
        append_private_reference_errors_from_text(text, rel, errors)
        try:
            front_matter_block, _body = split_front_matter(text)
            metadata = parse_front_matter_block(front_matter_block)
            record = parse_adr_markdown(text)
        except AdrMarkdownError as exc:
            errors.append(f"Invalid ADR Markdown {rel}: {exc}")
            if parse_errors is not None:
                parse_errors.append({"path": rel, "error": str(exc)})
            continue

        file_number = number_from_path(path.name)
        adr_number = number_from_adr_id(record.adr_id)
        if file_number is not None and adr_number is not None and file_number != adr_number:
            errors.append(f"ADR Markdown {rel} filename number {file_number:04d} does not agree with {record.adr_id}")
        previous = seen_adr_ids.get(record.adr_id)
        if previous:
            errors.append(f"Duplicate ADR Markdown adr_id {record.adr_id!r} in {previous} and {rel}")
        seen_adr_ids[record.adr_id] = rel
        entries[rel] = AdrMarkdownEntry(path=path, rel_path=rel, record=record, metadata=metadata, text=text)
    return entries


def is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def date_ordinal(value: Any) -> int:
    if not isinstance(value, str):
        return 0
    try:
        return dt.date.fromisoformat(value).toordinal()
    except ValueError:
        return 0


def validate_node_date(value: Any, label: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not DATE_RE.match(value):
        errors.append(f"{label} decision_date must be YYYY-MM-DD")
        return
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        errors.append(f"{label} decision_date must be a valid YYYY-MM-DD date")


def node_number(record: dict[str, Any]) -> int | None:
    for key, parser in (("id", number_from_node_id), ("adr_id", number_from_adr_id), ("path", number_from_path)):
        number = parser(record.get(key))
        if number is not None:
            return number
    return None


def node_order_key(record: dict[str, Any]) -> tuple[int, int]:
    return (date_ordinal(record.get("decision_date")), node_number(record) or 0)


def adr_label_for_node(record: dict[str, Any]) -> str:
    adr_id = record.get("adr_id")
    node_id = record.get("id")
    if isinstance(adr_id, str) and adr_id:
        return adr_id
    if isinstance(node_id, str) and node_id:
        return node_id
    return "<unknown ADR>"


def endpoint_label(endpoint: str, node_by_id: dict[str, dict[str, Any]]) -> str:
    node = node_by_id.get(endpoint)
    if node is None:
        return endpoint
    return f"{endpoint} ({adr_label_for_node(node)})"


def first_import_note(node: dict[str, Any], metadata: dict[str, Any] | None) -> str:
    for source in (node, metadata or {}):
        for field_name in LEGACY_IMPORT_NOTE_FIELDS:
            value = source.get(field_name)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def validation_receipts_for(node: dict[str, Any], metadata: dict[str, Any] | None) -> list[str]:
    receipts: list[str] = []
    for value in (node.get("validation_receipts"), (metadata or {}).get("validation_receipts")):
        if isinstance(value, list):
            receipts.extend(str(item) for item in value if str(item).strip())
    return receipts


def source_mode_for(node: dict[str, Any], metadata: dict[str, Any] | None) -> str:
    merged = {**(metadata or {}), **node}
    for key in ("source_mode", "source", "adr_required_source"):
        value = merged.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if merged.get("legacy_import") is True or merged.get("status") == "accepted-legacy":
        return "legacy"
    return ""


def has_source_metadata(node: dict[str, Any], metadata: dict[str, Any] | None) -> bool:
    """Return true when an ADR graph node declares workflow/manual/legacy provenance."""

    merged = {**(metadata or {}), **node}
    if merged.get("legacy_import") is True or merged.get("status") == "accepted-legacy":
        return True
    source_mode = merged.get("source_mode") or merged.get("source")
    if isinstance(source_mode, str) and source_mode.strip() in {"manual", "workflow", "generated", "legacy", "import"}:
        return True
    generated_from_topic = merged.get("generated_from_topic")
    adr_required_source = merged.get("adr_required_source")
    return bool(
        isinstance(generated_from_topic, str)
        and generated_from_topic.strip()
        and isinstance(adr_required_source, str)
        and adr_required_source.strip()
    )


def validate_graph_nodes(
    root: Path,
    adr_dir: Path,
    nodes: tuple[dict[str, Any], ...],
    markdown_entries: dict[str, AdrMarkdownEntry],
    errors: list[str],
) -> dict[str, dict[str, Any]]:
    node_by_id: dict[str, dict[str, Any]] = {}
    seen_adr_ids: dict[str, str] = {}
    seen_paths: dict[str, str] = {}

    for index, node in enumerate(nodes, start=1):
        label = f"ADR graph node record {index}"
        for field_name in ADR_NODE_REQUIRED_FIELDS:
            if field_name not in node:
                errors.append(f"Missing {field_name!r} in {label}")

        node_id = node.get("id")
        adr_id = node.get("adr_id")
        path_value = node.get("path")
        status = node.get("status")

        if not isinstance(node_id, str) or number_from_node_id(node_id) is None:
            errors.append(f"{label} id must match adr:NNNN")
            node_id_text = str(node_id) if node_id is not None else f"<missing:{index}>"
        else:
            node_id_text = node_id
            if node_id in node_by_id:
                errors.append(f"Duplicate ADR graph node id {node_id!r}")
            else:
                node_by_id[node_id] = node

        if not isinstance(adr_id, str) or number_from_adr_id(adr_id) is None:
            errors.append(f"{label} adr_id must match ADR-NNNN")
        else:
            previous = seen_adr_ids.get(adr_id)
            if previous:
                errors.append(f"Duplicate ADR graph adr_id {adr_id!r} in {previous} and {label}")
            seen_adr_ids[adr_id] = label

        id_number = number_from_node_id(node_id)
        adr_number = number_from_adr_id(adr_id)
        if id_number is not None and adr_number is not None and id_number != adr_number:
            errors.append(f"{label} id {node_id!r} does not agree with adr_id {adr_id!r}")

        if node.get("type") != "adr":
            errors.append(f"{label} type must be 'adr'")
        if not isinstance(node.get("title"), str) or not str(node.get("title", "")).strip():
            errors.append(f"{label} title must be a non-empty string")
        if not isinstance(status, str) or status not in ADR_STATUSES:
            errors.append(f"{label} status is not recognized: {status!r}")
        validate_node_date(node.get("decision_date"), label, errors)
        for field_name in ("domains", "keywords"):
            if not is_string_list(node.get(field_name)):
                errors.append(f"{label} {field_name} must be a list of strings")
        if not isinstance(node.get("summary"), str) or not str(node.get("summary", "")).strip():
            errors.append(f"{label} summary must be a non-empty string")
        if not isinstance(node.get("current"), bool):
            errors.append(f"{label} current must be boolean")
        if "legacy_import" in node and not isinstance(node.get("legacy_import"), bool):
            errors.append(f"{label} legacy_import must be boolean")
        for field_name in SOURCE_STRING_FIELDS:
            if field_name in node and not isinstance(node.get(field_name), str):
                errors.append(f"{label} {field_name} must be a string")
        for field_name in SOURCE_LIST_FIELDS:
            if field_name in node and not is_string_list(node.get(field_name)):
                errors.append(f"{label} {field_name} must be a list of strings")
        for field_name in LEGACY_IMPORT_NOTE_FIELDS:
            if field_name in node and not isinstance(node.get(field_name), str):
                errors.append(f"{label} {field_name} must be a string")
        if not has_source_metadata(node, None):
            errors.append(
                f"{label} lacks source metadata; expected generated_from_topic plus adr_required_source, "
                "source/source_mode, or legacy_import=true"
            )

        entry: AdrMarkdownEntry | None = None
        if not isinstance(path_value, str) or not path_value.strip():
            errors.append(f"{label} path must be a non-empty relative path")
        else:
            if Path(path_value).is_absolute():
                errors.append(f"{label} path must be relative to the project root: {path_value}")
            resolved = (root / path_value).resolve()
            if not is_within(resolved, root):
                errors.append(f"{label} path escapes the project root: {path_value}")
            elif not is_within(resolved, adr_dir):
                errors.append(f"{label} path must point inside the selected ADR directory: {path_value}")
            if not resolved.exists():
                errors.append(f"{label} path does not exist: {path_value}")
            elif not resolved.is_file():
                errors.append(f"{label} path is not a file: {path_value}")
            path_number = number_from_path(path_value)
            if path_number is None:
                errors.append(f"{label} path filename must match NNNN-*.md: {path_value}")
            elif id_number is not None and path_number != id_number:
                errors.append(f"{label} path filename number {path_number:04d} does not agree with id {node_id!r}")
            previous_path_node = seen_paths.get(path_value)
            if previous_path_node:
                errors.append(f"Duplicate ADR graph node path {path_value!r} in {previous_path_node} and {label}")
            seen_paths[path_value] = label
            entry = markdown_entries.get(path_value)
            if resolved.exists() and entry is None:
                errors.append(f"{label} path {path_value} does not point to a parseable ADR Markdown file")

        if entry is not None:
            if isinstance(adr_id, str) and adr_id != entry.record.adr_id:
                errors.append(f"{label} adr_id {adr_id!r} does not match Markdown adr_id {entry.record.adr_id!r}")
            if isinstance(node.get("title"), str) and node["title"] != entry.record.title:
                errors.append(f"{label} title does not match Markdown title for {entry.rel_path}")
            if isinstance(status, str) and status != entry.record.status:
                errors.append(f"{label} status does not match Markdown status for {entry.rel_path}")
            if isinstance(node.get("decision_date"), str) and node["decision_date"] != entry.record.decision_date:
                errors.append(f"{label} decision_date does not match Markdown decision_date for {entry.rel_path}")
            if is_string_list(node.get("domains")) and list(node["domains"]) != entry.record.domains:
                errors.append(f"{label} domains do not match Markdown domains for {entry.rel_path}")
            if is_string_list(node.get("keywords")) and list(node["keywords"]) != entry.record.keywords:
                errors.append(f"{label} keywords do not match Markdown keywords for {entry.rel_path}")

            receipts = validation_receipts_for(node, entry.metadata)
            legacy = bool(node.get("legacy_import")) or entry.record.legacy_import or status == "accepted-legacy"
            manual = source_mode_for(node, entry.metadata) == "manual"
            import_note = first_import_note(node, entry.metadata)
            if status in {"accepted", "accepted-legacy"} and not receipts:
                if legacy:
                    if not import_note:
                        errors.append(
                            f"Legacy ADR {adr_label_for_node(node)} omits validation receipts but lacks an import note"
                        )
                elif not manual:
                    errors.append(
                        f"Accepted ADR {adr_label_for_node(node)} is missing validation receipts; "
                        "only manual ADRs and legacy imports may omit receipts"
                    )

        if (
            isinstance(node_id_text, str)
            and isinstance(adr_id, str)
            and id_number is not None
            and adr_number is not None
        ):
            expected_node_id = format_adr_node_id(adr_number)
            expected_adr_id = format_adr_id(id_number)
            if node_id_text != expected_node_id:
                errors.append(f"{label} id should be {expected_node_id} for {adr_id}")
            if adr_id != expected_adr_id:
                errors.append(f"{label} adr_id should be {expected_adr_id} for {node_id_text}")

    graph_paths = {str(node.get("path")) for node in nodes if isinstance(node.get("path"), str)}
    if nodes:
        for rel in sorted(markdown_entries):
            if rel not in graph_paths:
                errors.append(f"ADR Markdown file {rel} is not represented by an ADR graph node")

    return node_by_id


def validate_graph_edges(
    edges: tuple[dict[str, Any], ...], node_by_id: dict[str, dict[str, Any]], errors: list[str]
) -> list[tuple[int, dict[str, Any], str, str, str]]:
    valid_edges: list[tuple[int, dict[str, Any], str, str, str]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    for index, edge in enumerate(edges, start=1):
        label = f"ADR graph edge record {index}"
        for field_name in ADR_EDGE_REQUIRED_FIELDS:
            if field_name not in edge:
                errors.append(f"Missing {field_name!r} in {label}")
        from_id = edge.get("from")
        to_id = edge.get("to")
        edge_type = edge.get("type")
        if not isinstance(from_id, str) or not from_id.strip():
            errors.append(f"{label} from must be a non-empty node id")
        if not isinstance(to_id, str) or not to_id.strip():
            errors.append(f"{label} to must be a non-empty node id")
        if not isinstance(edge_type, str) or edge_type not in ADR_EDGE_TYPES:
            errors.append(f"Invalid ADR edge type {edge_type!r} in {label}")
        if isinstance(edge.get("reason"), (list, dict, bool)):
            errors.append(f"{label} reason must be a string when present")
        if "evidence" in edge and not is_string_list(edge.get("evidence")):
            errors.append(f"{label} evidence must be a list of strings")

        if isinstance(from_id, str) and from_id and from_id not in node_by_id:
            errors.append(f"Unresolved from endpoint {from_id!r} in {label}")
        if isinstance(to_id, str) and to_id and to_id not in node_by_id:
            errors.append(f"Unresolved to endpoint {to_id!r} in {label}")
        if not (isinstance(from_id, str) and isinstance(to_id, str) and isinstance(edge_type, str)):
            continue
        if edge_type not in ADR_EDGE_TYPES or from_id not in node_by_id or to_id not in node_by_id:
            continue
        if from_id == to_id:
            errors.append(f"{label} must not relate an ADR to itself")
        key = (from_id, to_id, edge_type)
        if key in seen_keys:
            errors.append(f"Duplicate ADR graph edge {from_id!r} -> {to_id!r} ({edge_type})")
        seen_keys.add(key)
        valid_edges.append((index, edge, from_id, to_id, edge_type))
    return valid_edges


def derive_adr_currentness(
    node_by_id: dict[str, dict[str, Any]], valid_edges: list[tuple[int, dict[str, Any], str, str, str]]
) -> tuple[dict[str, bool], dict[str, list[str]], dict[str, list[str]]]:
    superseded_by: dict[str, list[str]] = {node_id: [] for node_id in node_by_id}
    supersedes: dict[str, list[str]] = {node_id: [] for node_id in node_by_id}
    for _index, _edge, from_id, to_id, edge_type in valid_edges:
        if edge_type != "supersedes":
            continue
        superseded_by.setdefault(to_id, []).append(from_id)
        supersedes.setdefault(from_id, []).append(to_id)
    for mapping in (superseded_by, supersedes):
        for key in mapping:
            mapping[key] = sorted(mapping[key])

    current_by_id: dict[str, bool] = {}
    for node_id, node in node_by_id.items():
        status = str(node.get("status", ""))
        current_by_id[node_id] = not superseded_by.get(node_id) and status not in NON_CURRENT_STATUSES
    return current_by_id, superseded_by, supersedes


def first_cycle_for_edges(edges: list[tuple[str, str]]) -> list[str] | None:
    adjacency: dict[str, list[str]] = {}
    for from_id, to_id in edges:
        adjacency.setdefault(from_id, []).append(to_id)
    for from_id in adjacency:
        adjacency[from_id] = sorted(adjacency[from_id])

    state: dict[str, str] = {}
    stack: list[str] = []
    stack_index: dict[str, int] = {}

    def visit(node_id: str) -> list[str] | None:
        state[node_id] = "visiting"
        stack_index[node_id] = len(stack)
        stack.append(node_id)
        for next_id in adjacency.get(node_id, []):
            if state.get(next_id) == "visiting":
                return [*stack[stack_index[next_id] :], next_id]
            if state.get(next_id) is None:
                cycle = visit(next_id)
                if cycle:
                    return cycle
        stack.pop()
        stack_index.pop(node_id, None)
        state[node_id] = "done"
        return None

    for node_id in sorted(adjacency):
        if state.get(node_id) is None:
            cycle = visit(node_id)
            if cycle:
                return cycle
    return None


def validate_relation_semantics(
    valid_edges: list[tuple[int, dict[str, Any], str, str, str]],
    node_by_id: dict[str, dict[str, Any]],
    current_by_id: dict[str, bool],
    errors: list[str],
    warnings: list[str],
) -> None:
    for edge_type in sorted(ACYCLIC_ADR_EDGE_TYPES):
        typed_edges = [
            (from_id, to_id)
            for _index, _edge, from_id, to_id, candidate_type in valid_edges
            if candidate_type == edge_type
        ]
        cycle = first_cycle_for_edges(typed_edges)
        if cycle:
            errors.append(f"Cycle detected for {edge_type} ADR edges: {' -> '.join(cycle)}")

    for index, _edge, from_id, to_id, edge_type in valid_edges:
        from_node = node_by_id[from_id]
        to_node = node_by_id[to_id]
        if edge_type == "supersedes" and node_order_key(from_node) <= node_order_key(to_node):
            errors.append(
                f"ADR graph edge record {index} supersedes target must be older: "
                f"{endpoint_label(from_id, node_by_id)} -> {endpoint_label(to_id, node_by_id)}"
            )
        elif edge_type == "precursor_to" and node_order_key(from_node) >= node_order_key(to_node):
            errors.append(
                f"ADR graph edge record {index} precursor_to source must be older than target: "
                f"{endpoint_label(from_id, node_by_id)} -> {endpoint_label(to_id, node_by_id)}"
            )
        elif edge_type == "depends_on":
            if node_order_key(from_node) <= node_order_key(to_node):
                warnings.append(
                    f"ADR graph edge record {index} depends_on source is not newer than dependency target: "
                    f"{endpoint_label(from_id, node_by_id)} -> {endpoint_label(to_id, node_by_id)}"
                )
            if not current_by_id.get(to_id, False):
                warnings.append(
                    f"ADR graph edge record {index} depends_on target is not current: "
                    f"{endpoint_label(from_id, node_by_id)} -> {endpoint_label(to_id, node_by_id)}"
                )
        elif (
            edge_type == "conflicts_with"
            and current_by_id.get(from_id)
            and current_by_id.get(to_id)
            and not bool(_edge.get("reviewer_approved"))
        ):
            warnings.append(
                f"ADR graph edge record {index} conflicts_with relates two current ADRs without reviewer_approved=true: "
                f"{endpoint_label(from_id, node_by_id)} -> {endpoint_label(to_id, node_by_id)}"
            )


def validate_current_flags(
    nodes: tuple[dict[str, Any], ...], current_by_id: dict[str, bool], errors: list[str]
) -> None:
    for index, node in enumerate(nodes, start=1):
        node_id = node.get("id")
        if not isinstance(node_id, str) or node_id not in current_by_id:
            continue
        declared = node.get("current")
        if isinstance(declared, bool) and declared != current_by_id[node_id]:
            errors.append(
                f"ADR graph node record {index} current={str(declared).lower()} does not match derived current="
                f"{str(current_by_id[node_id]).lower()} for {node_id}"
            )


def validate_adr_graph(root: str | Path, adr_dir: str | Path) -> dict[str, Any]:
    root_path = Path(root).resolve()
    adr_path = Path(adr_dir).resolve()
    errors: list[str] = []
    warnings: list[str] = []
    parse_errors: list[dict[str, str]] = []

    graph = load_adr_graph(adr_path)
    errors.extend(graph.errors)
    append_private_reference_errors_from_records(graph.nodes, f"{ADR_GRAPH_DIR}/{ADR_NODES_FILENAME}", errors)
    append_private_reference_errors_from_records(graph.edges, f"{ADR_GRAPH_DIR}/{ADR_EDGES_FILENAME}", errors)

    markdown_entries = parse_markdown_entries(root_path, adr_path, errors, parse_errors)
    node_by_id = validate_graph_nodes(root_path, adr_path, graph.nodes, markdown_entries, errors)
    valid_edges = validate_graph_edges(graph.edges, node_by_id, errors)
    current_by_id, superseded_by, _supersedes = derive_adr_currentness(node_by_id, valid_edges)
    validate_current_flags(graph.nodes, current_by_id, errors)
    validate_relation_semantics(valid_edges, node_by_id, current_by_id, errors, warnings)

    current_ids = sorted(node_id for node_id, is_current in current_by_id.items() if is_current)
    superseded_ids = sorted(node_id for node_id, superseders in superseded_by.items() if superseders)
    return {
        "ok": not errors,
        "counts": {
            "nodes": len(graph.nodes),
            "edges": len(graph.edges),
            "markdown": len(markdown_entries),
            "current": len(current_ids),
            "superseded": len(superseded_ids),
        },
        "graph_files": {
            "nodes": rel_path(root_path, graph.nodes_path),
            "edges": rel_path(root_path, graph.edges_path),
        },
        "current_adr_ids": [
            adr_label_for_node(node_by_id[node_id]) for node_id in current_ids if node_id in node_by_id
        ],
        "superseded_adr_ids": [
            adr_label_for_node(node_by_id[node_id]) for node_id in superseded_ids if node_id in node_by_id
        ],
        "parse_errors": parse_errors,
        "errors": errors,
        "warnings": warnings,
    }


ARCHITECTURE_TERMS = {
    "architecture",
    "architectural",
    "auth",
    "auth0",
    "authentication",
    "authorization",
    "database",
    "datastore",
    "identity",
    "oidc",
    "oauth",
    "payment",
    "provider",
    "queue",
    "storage",
}
OPTION_TERMS = ("considered options", "alternatives", "options considered", "tradeoff", "trade-off")
RATIONALE_TERMS = ("why this decision", "rationale", "because", "reason")


def normalize_topic(topic: str) -> str:
    value = topic.strip()
    if not TOPIC_RE.match(value) or ".." in value or "/" in value or "\\" in value:
        raise AdrRecordsError(f"Invalid topic name: {topic!r}")
    return value


def topic_dir(root: Path, topic: str) -> Path:
    return root / ".plan" / normalize_topic(topic)


def read_topic_text(root: Path, topic: str | None) -> str:
    if not topic:
        return ""
    proposal_path = topic_dir(root, topic) / "proposal.md"
    if not proposal_path.exists():
        return ""
    return proposal_path.read_text(encoding="utf-8")


def has_substantive_command(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        command = value.get("command")
        return isinstance(command, str) and bool(command.strip())
    return False


def has_substantive_validation_item(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        for key in ("command", "id", "validation_id"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return True
    return False


def is_validation_receipt(record: dict[str, Any]) -> bool:
    verification = record.get("verification")
    validation_items = (verification or {}).get("validation") if isinstance(verification, dict) else None
    commands = record.get("commands")
    return record.get("type") == "validation-receipt" and (
        (isinstance(commands, list) and any(has_substantive_command(command) for command in commands))
        or (
            isinstance(validation_items, list)
            and any(has_substantive_validation_item(item) for item in validation_items)
        )
    )


def passed_receipt_ids(root: Path, topic: str | None) -> list[str]:
    if not topic:
        return []
    path = topic_dir(root, topic) / "receipts.jsonl"
    records, _errors = read_jsonl_records(path)
    ids: list[str] = []
    for record in records:
        if (
            str(record.get("status", "")).lower() in {"passed", "pass", "complete"}
            and record.get("id")
            and is_validation_receipt(record)
        ):
            ids.append(str(record["id"]))
    return ids


def first_heading(text: str, fallback: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def evaluate_adr_need(text: str) -> dict[str, Any]:
    lowered = text.lower()
    explicit_true = re.search(r"\badr_required\s*[:=]\s*true\b", lowered) is not None
    explicit_false = re.search(r"\badr_required\s*[:=]\s*false\b", lowered) is not None
    architecture_hits = sorted(term for term in ARCHITECTURE_TERMS if term in lowered)
    has_options = any(term in lowered for term in OPTION_TERMS)
    has_rationale = any(term in lowered for term in RATIONALE_TERMS)
    adr_required = explicit_true or (bool(architecture_hits) and not explicit_false)
    needs_prompt = adr_required and not has_options and not has_rationale
    if explicit_false:
        reason = "Proposal explicitly marks adr_required false."
    elif explicit_true:
        reason = "Proposal explicitly marks adr_required true."
    elif architecture_hits:
        reason = "Request/proposal contains architecture-significant terms: " + ", ".join(architecture_hits[:8])
    else:
        reason = "No durable architecture decision indicators were detected."
    return {
        "adr_required": adr_required,
        "adr_reason": reason,
        "architecture_terms": architecture_hits,
        "adr_options_status": "researched" if has_options else "missing",
        "adr_rationale_status": "present" if has_rationale else "missing",
        "needs_user_prompt": needs_prompt,
        "prompt": (
            "This appears ADR-worthy but lacks considered options or explicit rationale; "
            "ask whether to research alternatives or use the user's provided reason."
            if needs_prompt
            else ""
        ),
    }


def evaluate_action(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).resolve()
    topic_text = read_topic_text(root, args.topic)
    input_text = "\n".join(part for part in [args.request or "", topic_text] if part)
    evaluation = evaluate_adr_need(input_text)
    return {
        "ok": True,
        "action": "evaluate",
        "root": str(root),
        "topic": args.topic,
        "summary": (
            "I intend to generate an ADR at the end of validated work."
            if evaluation["adr_required"]
            else "I do not intend to generate an ADR for this work."
        ),
        **evaluation,
    }


def add_record_args(parser: argparse.ArgumentParser, *, required: bool = True) -> None:
    parser.add_argument("--title", required=required, help="ADR title.")
    parser.add_argument("--decision", required=required, help="Plain decision statement.")
    parser.add_argument("--context", required=required, help="Decision context/problem statement.")
    parser.add_argument("--option", dest="options", action="append", default=[], help="Considered option. Repeatable.")
    parser.add_argument("--rationale", default="", help="Why this decision was made.")
    parser.add_argument(
        "--consequence", dest="consequences", action="append", default=[], help="Decision consequence. Repeatable."
    )
    parser.add_argument("--usage", default="", help="How future work should use this decision.")
    parser.add_argument("--validation", default="", help="Validation/evidence summary.")
    parser.add_argument("--domain", dest="domains", action="append", default=[], help="Search domain. Repeatable.")
    parser.add_argument("--keyword", dest="keywords", action="append", default=[], help="Search keyword. Repeatable.")
    parser.add_argument("--status", default="accepted", choices=sorted(ADR_STATUSES), help="ADR status.")
    parser.add_argument("--decision-date", help="Decision date YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--decision-kind", default="feature-architecture", help="Decision kind metadata.")
    parser.add_argument("--confidence", default="", help="Decision confidence metadata.")
    parser.add_argument(
        "--source-commit", dest="source_commits", action="append", default=[], help="Source commit. Repeatable."
    )
    parser.add_argument(
        "--validation-receipt",
        dest="validation_receipts",
        action="append",
        default=[],
        help="Validation receipt id. Repeatable.",
    )


def ensure_options_or_rationale(options: list[str], rationale: str) -> None:
    if not options and not rationale.strip():
        raise AdrRecordsError("ADR creation requires at least one --option or an explicit --rationale")


def ensure_search_metadata(domains: list[str], keywords: list[str]) -> None:
    if not domains:
        raise AdrRecordsError("ADR creation requires at least one --domain for search metadata")
    if not keywords:
        raise AdrRecordsError("ADR creation requires at least one --keyword for search metadata")


def nonempty_or(value: str | None, fallback: str) -> str:
    return value if isinstance(value, str) and value.strip() else fallback


def proposal_bullets(text: str) -> list[str]:
    bullets: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("- "):
            bullets.append(stripped[2:].strip())
    return bullets[:5]


def record_from_args(
    args: argparse.Namespace,
    number: int,
    *,
    source_mode: str,
    topic: str = "",
    validation_receipts: list[str] | None = None,
    legacy: bool = False,
    proposal_text: str = "",
    evaluation: dict[str, Any] | None = None,
    allow_defaults: bool = False,
) -> AdrRecord:
    evaluation = evaluation or {}
    options = list(args.options)
    rationale = args.rationale
    domains = list(args.domains)
    keywords = list(args.keywords)
    if allow_defaults:
        options = options or proposal_bullets(proposal_text)
        rationale = nonempty_or(rationale, str(evaluation.get("adr_reason") or ""))
        domains = (
            domains or [str(item) for item in evaluation.get("architecture_terms", [])[:3]] or [topic or "architecture"]
        )
        keywords = keywords or [slugify_title(args.title or topic or "decision").split("-")[0]]
    ensure_options_or_rationale(options, rationale)
    ensure_search_metadata(domains, keywords)
    decision_date = args.decision_date or dt.date.today().isoformat()
    receipts = validation_receipts if validation_receipts is not None else list(args.validation_receipts)
    title = nonempty_or(args.title, first_heading(proposal_text, f"Decision for {topic or 'architecture'}"))
    decision = nonempty_or(args.decision, f"Record the accepted decision for {title}.")
    context = nonempty_or(args.context, first_heading(proposal_text, f"Context for {title}."))
    return AdrRecord(
        adr_id=format_adr_id(number),
        title=title,
        status=args.status,
        decision_date=decision_date,
        generated_from_topic=topic,
        adr_required_source=source_mode,
        legacy_import=legacy,
        source_commits=list(args.source_commits),
        validation_receipts=receipts,
        domains=domains,
        keywords=keywords,
        decision_kind=args.decision_kind,
        confidence=args.confidence,
        decision=decision,
        context=context,
        considered_options=options,
        rationale=rationale,
        consequences=list(args.consequences),
        usage=args.usage or f"Use this decision when working in {', '.join(domains) or 'the related area'}.",
        validation=args.validation
        or (
            "Manual ADR; rationale and options were provided by the user."
            if source_mode == "manual"
            else "Validated through Cartographer workflow receipts."
        ),
    )


def node_from_record(
    root: Path, path: Path, record: AdrRecord, *, source_mode: str, current: bool = True, import_note: str = ""
) -> dict[str, Any]:
    number = number_from_adr_id(record.adr_id)
    if number is None:
        raise AdrRecordsError(f"Invalid ADR id for graph node: {record.adr_id}")
    node: dict[str, Any] = {
        "id": format_adr_node_id(number),
        "type": "adr",
        "adr_id": record.adr_id,
        "title": record.title,
        "path": rel_path(root, path),
        "status": record.status,
        "decision_date": record.decision_date,
        "domains": list(record.domains),
        "keywords": list(record.keywords),
        "summary": record.decision,
        "generated_from_topic": record.generated_from_topic,
        "adr_required_source": record.adr_required_source,
        "source": source_mode,
        "source_mode": source_mode,
        "legacy_import": record.legacy_import,
        "source_commits": list(record.source_commits),
        "validation_receipts": list(record.validation_receipts),
        "current": current,
    }
    if import_note:
        node["import_note"] = import_note
    return node


def upsert_by_key(records: tuple[dict[str, Any], ...], record: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = record.get(key)
    output = [existing for existing in records if existing.get(key) != value]
    output.append(record)
    return output


def write_record_and_graph(
    root: Path, adr_dir: Path, record: AdrRecord, *, source_mode: str, import_note: str = ""
) -> dict[str, Any]:
    number = number_from_adr_id(record.adr_id)
    if number is None:
        raise AdrRecordsError(f"Invalid ADR id: {record.adr_id}")
    markdown = render_adr_markdown(record)
    path = adr_dir / format_adr_filename(number, record.title)
    if path.exists():
        raise AdrRecordsError(f"ADR file already exists: {rel_path(root, path)}")
    adr_dir_existed = adr_dir.exists()
    nodes_path, edges_path = adr_graph_paths(adr_dir)
    graph_dir = nodes_path.parent
    graph_dir_existed = graph_dir.exists()
    nodes_existed = nodes_path.exists()
    edges_existed = edges_path.exists()
    graph = load_adr_graph(adr_dir)
    original_nodes = list(graph.nodes)
    original_edges = list(graph.edges)
    adr_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown, encoding="utf-8")
    node = node_from_record(
        root,
        path,
        record,
        source_mode=source_mode,
        current=record.status not in NON_CURRENT_STATUSES,
        import_note=import_note,
    )
    nodes = upsert_by_key(graph.nodes, node, "id")
    save_adr_graph(adr_dir, nodes, original_edges)
    report = validate_adr_graph(root, adr_dir)
    if not report["ok"]:
        path.unlink(missing_ok=True)
        if nodes_existed:
            write_jsonl_atomic(nodes_path, original_nodes)
        else:
            nodes_path.unlink(missing_ok=True)
        if edges_existed:
            write_jsonl_atomic(edges_path, original_edges)
        else:
            edges_path.unlink(missing_ok=True)
        if not graph_dir_existed and graph_dir.exists() and not any(graph_dir.iterdir()):
            graph_dir.rmdir()
        if not adr_dir_existed and adr_dir.exists() and not any(adr_dir.iterdir()):
            adr_dir.rmdir()
    return {
        "ok": report["ok"],
        "path": rel_path(root, path),
        "record": record.to_summary(path=path, root=root),
        "node": node,
        "validation": report,
        "errors": report["errors"],
        "warnings": report["warnings"],
    }


def create_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("create")
    if not payload["ok"] or discovery.selected_dir is None:
        return payload
    allocation = allocate_next_number(discovery.selected_dir)
    record = record_from_args(args, allocation.next_number, source_mode="manual")
    result = write_record_and_graph(discovery.root, discovery.selected_dir, record, source_mode="manual")
    return {**payload, **result, "action": "create"}


def draft_action(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).resolve()
    topic = normalize_topic(args.topic or "")
    proposal_text = read_topic_text(root, topic)
    evaluation = evaluate_adr_need(proposal_text)
    if not evaluation["adr_required"] and not args.force:
        return {
            "ok": False,
            "action": "draft",
            "topic": topic,
            "errors": ["Topic is not marked adr_required; pass --force to draft anyway."],
            **evaluation,
        }
    receipts = passed_receipt_ids(root, topic)
    if args.status == "accepted" and not receipts:
        return {
            "ok": False,
            "action": "draft",
            "topic": topic,
            "errors": ["Accepted workflow ADR drafts require passed validation receipts."],
            **evaluation,
        }
    number = args.number or 1
    record = record_from_args(
        args,
        number,
        source_mode="proposal",
        topic=topic,
        validation_receipts=receipts,
        proposal_text=proposal_text,
        evaluation=evaluation,
        allow_defaults=True,
    )
    return {
        "ok": True,
        "action": "draft",
        "topic": topic,
        "draft": record.to_front_matter(),
        "sections": record.to_sections(),
        "markdown": render_adr_markdown(record),
        **evaluation,
    }


def write_action(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).resolve()
    topic = normalize_topic(args.topic) if args.topic else ""
    if topic:
        evaluation = evaluate_adr_need(read_topic_text(root, topic))
        if not evaluation["adr_required"] and not args.force:
            return {
                "ok": False,
                "action": "write",
                "root": str(root),
                "topic": topic,
                "errors": ["Topic is not marked adr_required; pass --force to write anyway."],
                **evaluation,
            }
        receipts = passed_receipt_ids(root, topic)
        if args.status == "accepted" and not receipts:
            return {
                "ok": False,
                "action": "write",
                "root": str(root),
                "topic": topic,
                "errors": ["Accepted workflow ADR writes require passed validation receipts."],
            }
    else:
        receipts = list(args.validation_receipts)
    discovery = discover_adr_directory(root, args.adr_dir, create=False)
    payload = discovery.to_receipt("write")
    if not payload["ok"] or discovery.selected_dir is None:
        return payload
    allocation = allocate_next_number(discovery.selected_dir)
    record = record_from_args(
        args,
        allocation.next_number,
        source_mode="proposal" if topic else "manual",
        topic=topic,
        validation_receipts=receipts,
    )
    result = write_record_and_graph(
        discovery.root, discovery.selected_dir, record, source_mode="workflow" if topic else "manual"
    )
    return {**payload, **result, "action": "write"}


def relate_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("relate")
    if not payload["ok"] or discovery.selected_dir is None:
        return payload
    if args.edge_type in {"supersedes", "conflicts_with"} and not args.confirm:
        return {
            **payload,
            "ok": False,
            "errors": [f"Relationship type {args.edge_type!r} requires --confirm before writing."],
        }
    graph = load_adr_graph(discovery.selected_dir)
    node_by_id = {str(node.get("id")): dict(node) for node in graph.nodes if isinstance(node.get("id"), str)}
    if args.from_id not in node_by_id or args.to_id not in node_by_id:
        return {**payload, "ok": False, "errors": ["Both --from and --to must reference existing ADR graph node ids."]}
    edge: dict[str, Any] = {"from": args.from_id, "to": args.to_id, "type": args.edge_type}
    if args.reason:
        edge["reason"] = args.reason
    if args.evidence:
        edge["evidence"] = args.evidence
    if args.edge_type == "conflicts_with":
        edge["reviewer_approved"] = True
    candidate_edges = [
        record
        for record in graph.edges
        if not (
            record.get("from") == edge["from"] and record.get("to") == edge["to"] and record.get("type") == edge["type"]
        )
    ]
    candidate_edges.append(edge)
    valid_edges = [
        (index, candidate, str(candidate.get("from")), str(candidate.get("to")), str(candidate.get("type")))
        for index, candidate in enumerate(candidate_edges, start=1)
        if isinstance(candidate.get("from"), str)
        and isinstance(candidate.get("to"), str)
        and isinstance(candidate.get("type"), str)
        and str(candidate.get("type")) in ADR_EDGE_TYPES
        and str(candidate.get("from")) in node_by_id
        and str(candidate.get("to")) in node_by_id
    ]
    current_by_id, _superseded_by, _supersedes = derive_adr_currentness(node_by_id, valid_edges)
    candidate_nodes: list[dict[str, Any]] = []
    for node in graph.nodes:
        updated = dict(node)
        node_id = str(updated.get("id"))
        if node_id in current_by_id:
            updated["current"] = current_by_id[node_id]
        candidate_nodes.append(updated)
    save_adr_graph(discovery.selected_dir, candidate_nodes, candidate_edges)
    report = validate_adr_graph(discovery.root, discovery.selected_dir)
    if not report["ok"]:
        save_adr_graph(discovery.selected_dir, list(graph.nodes), list(graph.edges))
    return {
        **payload,
        "edge": edge,
        "validation": report,
        "ok": report["ok"],
        "errors": report["errors"],
        "warnings": report["warnings"],
    }


def import_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("import")
    if not payload["ok"] or discovery.selected_dir is None:
        return payload
    source = resolve_under_root(discovery.root, args.path)
    if not source.exists() or not source.is_file():
        return {**payload, "ok": False, "errors": [f"ADR import path is not a file: {args.path}"]}
    if not is_within(source, discovery.selected_dir):
        return {
            **payload,
            "ok": False,
            "errors": [
                "Initial import support requires the ADR Markdown file to already be inside the selected ADR directory."
            ],
        }
    record = parse_adr_markdown(source.read_text(encoding="utf-8"))
    legacy = args.legacy or record.legacy_import or record.status == "accepted-legacy"
    has_receipts = bool(record.validation_receipts)
    if record.status == "accepted" and not has_receipts and not legacy:
        return {
            **payload,
            "ok": False,
            "errors": [
                "Accepted ADR imports without validation receipts require --legacy, accepted-legacy status, or legacy_import=true."
            ],
        }
    if legacy and not has_receipts and not args.import_note:
        return {
            **payload,
            "ok": False,
            "errors": ["Legacy ADR imports without validation receipts require --import-note."],
        }
    if args.legacy and not record.legacy_import:
        record.legacy_import = True
    graph = load_adr_graph(discovery.selected_dir)
    node = node_from_record(
        discovery.root,
        source,
        record,
        source_mode="legacy" if legacy else "manual",
        current=record.status not in NON_CURRENT_STATUSES,
        import_note=args.import_note,
    )
    nodes = upsert_by_key(graph.nodes, node, "id")
    save_adr_graph(discovery.selected_dir, nodes, list(graph.edges))
    report = validate_adr_graph(discovery.root, discovery.selected_dir)
    if not report["ok"]:
        save_adr_graph(discovery.selected_dir, list(graph.nodes), list(graph.edges))
    return {
        **payload,
        "record": record.to_summary(path=source, root=discovery.root),
        "validation": report,
        "ok": report["ok"],
        "errors": report["errors"],
        "warnings": report["warnings"],
    }


def compact_summary_from_node(
    root: Path,
    node: dict[str, Any],
    current: bool,
    superseded_by: dict[str, list[str]],
    supersedes: dict[str, list[str]],
    node_by_id: dict[str, dict[str, Any]],
    markdown_entries: dict[str, AdrMarkdownEntry],
) -> dict[str, Any]:
    node_id = str(node.get("id", ""))
    path_value = str(node.get("path", ""))
    number = node_number(node)
    summary: dict[str, Any] = {
        "id": node_id,
        "adr_id": str(node.get("adr_id", "")),
        "number": number,
        "title": str(node.get("title", "")),
        "status": str(node.get("status", "")),
        "decision_date": str(node.get("decision_date", "")),
        "current": current,
        "path": path_value,
        "domains": list(node.get("domains")) if is_string_list(node.get("domains")) else [],
        "keywords": list(node.get("keywords")) if is_string_list(node.get("keywords")) else [],
        "summary": str(node.get("summary", "")),
    }
    if superseded_by.get(node_id):
        summary["superseded_by"] = [
            adr_label_for_node(node_by_id[item]) for item in superseded_by[node_id] if item in node_by_id
        ]
    if supersedes.get(node_id):
        summary["supersedes"] = [
            adr_label_for_node(node_by_id[item]) for item in supersedes[node_id] if item in node_by_id
        ]
    entry = markdown_entries.get(path_value)
    search_parts = collect_strings(summary)
    if entry is not None:
        search_parts.append(entry.text)
    summary["_search_text"] = "\n".join(search_parts).lower()
    return summary


def compact_summary_from_markdown(root: Path, entry: AdrMarkdownEntry) -> dict[str, Any]:
    summary = entry.record.to_summary(path=entry.path, root=root)
    summary["path"] = entry.rel_path
    summary["id"] = format_adr_node_id(summary["number"]) if summary.get("number") else ""
    summary["current"] = entry.record.status not in NON_CURRENT_STATUSES
    summary["summary"] = " ".join(line.strip() for line in entry.record.decision.splitlines() if line.strip())[:240]
    summary["_search_text"] = "\n".join(collect_strings(summary) + [entry.text]).lower()
    return summary


def sort_compact_summaries(records: list[dict[str, Any]]) -> None:
    records.sort(
        key=lambda record: (
            0 if bool(record.get("current")) else 1,
            -date_ordinal(record.get("decision_date")),
            -(int(record.get("number") or 0)),
            str(record.get("adr_id", "")),
        )
    )


def query_matches(summary: dict[str, Any], query_text: str) -> bool:
    text = str(summary.get("_search_text", "")).lower()
    query = query_text.strip().lower()
    if not query:
        return True
    if query in text:
        return True
    tokens = [token for token in re.split(r"\W+", query) if token]
    return bool(tokens) and all(token in text for token in tokens)


def public_summaries(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: value for key, value in record.items() if not key.startswith("_")} for record in records]


def build_adr_catalog(
    root: Path, adr_dir: Path, *, include_superseded: bool = False, query_text: str = ""
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    parse_errors: list[dict[str, str]] = []
    graph = load_adr_graph(adr_dir)
    errors.extend(graph.errors)
    append_private_reference_errors_from_records(graph.nodes, f"{ADR_GRAPH_DIR}/{ADR_NODES_FILENAME}", errors)
    append_private_reference_errors_from_records(graph.edges, f"{ADR_GRAPH_DIR}/{ADR_EDGES_FILENAME}", errors)
    markdown_entries = parse_markdown_entries(root, adr_dir, errors, parse_errors)

    records: list[dict[str, Any]] = []
    node_by_id: dict[str, dict[str, Any]] = {}
    current_by_id: dict[str, bool] = {}
    superseded_by: dict[str, list[str]] = {}
    supersedes: dict[str, list[str]] = {}
    valid_edges: list[tuple[int, dict[str, Any], str, str, str]] = []

    if graph.nodes:
        for node in graph.nodes:
            node_id = node.get("id")
            if isinstance(node_id, str) and node_id not in node_by_id:
                node_by_id[node_id] = node
        valid_edges = [
            (index, edge, str(edge.get("from")), str(edge.get("to")), str(edge.get("type")))
            for index, edge in enumerate(graph.edges, start=1)
            if isinstance(edge.get("from"), str)
            and isinstance(edge.get("to"), str)
            and isinstance(edge.get("type"), str)
            and str(edge.get("type")) in ADR_EDGE_TYPES
            and str(edge.get("from")) in node_by_id
            and str(edge.get("to")) in node_by_id
        ]
        current_by_id, superseded_by, supersedes = derive_adr_currentness(node_by_id, valid_edges)
        for node_id, node in node_by_id.items():
            is_current = current_by_id.get(node_id, False)
            if not is_current and not include_superseded:
                continue
            records.append(
                compact_summary_from_node(
                    root,
                    node,
                    is_current,
                    superseded_by,
                    supersedes,
                    node_by_id,
                    markdown_entries,
                )
            )
    else:
        for entry in markdown_entries.values():
            is_current = entry.record.status not in NON_CURRENT_STATUSES
            if not is_current and not include_superseded:
                continue
            records.append(compact_summary_from_markdown(root, entry))

    if query_text:
        records = [record for record in records if query_matches(record, query_text)]
    sort_compact_summaries(records)
    return {
        "records": records,
        "errors": errors,
        "warnings": warnings,
        "parse_errors": parse_errors,
        "graph": graph,
        "node_by_id": node_by_id,
        "current_by_id": current_by_id,
        "valid_edges": valid_edges,
        "markdown_entries": markdown_entries,
    }


def find_summary_by_target(records: list[dict[str, Any]], target: str) -> dict[str, Any] | None:
    normalized = target.strip().lower()
    for record in records:
        candidates = {
            str(record.get("id", "")).lower(),
            str(record.get("adr_id", "")).lower(),
            str(record.get("path", "")).lower(),
            Path(str(record.get("path", ""))).name.lower(),
        }
        number = record.get("number")
        if isinstance(number, int):
            candidates.add(str(number))
            candidates.add(f"{number:04d}")
        if normalized in candidates:
            return record
    return None


def compact_relationships(
    target_id: str,
    valid_edges: list[tuple[int, dict[str, Any], str, str, str]],
    node_by_id: dict[str, dict[str, Any]],
    current_by_id: dict[str, bool],
) -> dict[str, list[dict[str, Any]]]:
    outgoing: list[dict[str, Any]] = []
    incoming: list[dict[str, Any]] = []

    def endpoint_summary(node_id: str) -> dict[str, Any]:
        node = node_by_id.get(node_id, {})
        return {
            "id": node_id,
            "adr_id": str(node.get("adr_id", "")),
            "title": str(node.get("title", "")),
            "current": bool(current_by_id.get(node_id, False)),
        }

    for index, _edge, from_id, to_id, edge_type in valid_edges:
        if from_id == target_id:
            outgoing.append({"record": index, "type": edge_type, "to": endpoint_summary(to_id)})
        if to_id == target_id:
            incoming.append({"record": index, "type": edge_type, "from": endpoint_summary(from_id)})
    outgoing.sort(key=lambda item: (str(item["type"]), str(item["to"]["id"])))
    incoming.sort(key=lambda item: (str(item["type"]), str(item["from"]["id"])))
    return {"outgoing": outgoing, "incoming": incoming}


def compact_sections_for_entry(entry: AdrMarkdownEntry | None) -> dict[str, Any]:
    if entry is None:
        return {}
    return {
        "decision": entry.record.decision,
        "context": entry.record.context,
        "rationale": entry.record.rationale,
        "validation": entry.record.validation,
    }


def discover_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=args.create)
    payload = discovery.to_receipt("discover")
    if payload["ok"] and discovery.selected_dir is not None and not discovery.ambiguous:
        allocation = allocate_next_number(discovery.selected_dir)
        payload.update(
            {
                "next_number": allocation.next_number,
                "next_adr_id": allocation.next_adr_id,
                "existing_numbers": list(allocation.existing_numbers),
                "file_numbers": list(allocation.file_numbers),
                "graph_numbers": list(allocation.graph_numbers),
                "warnings": list(allocation.warnings),
            }
        )
        if args.title:
            payload["next_filename"] = format_adr_filename(allocation.next_number, args.title)
    return payload


def validate_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("validate")
    payload.update(
        {
            "counts": {"nodes": 0, "edges": 0, "markdown": 0, "current": 0, "superseded": 0},
            "parse_errors": [],
            "warnings": [],
        }
    )
    if not payload["ok"] or discovery.selected_dir is None:
        return payload

    report = validate_adr_graph(discovery.root, discovery.selected_dir)
    payload.update(report)
    payload["ok"] = payload["ok"] and report["ok"]
    return payload


def list_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("list")
    payload.update({"records": [], "count": 0, "parse_errors": [], "warnings": []})
    if not payload["ok"] or discovery.selected_dir is None:
        return payload

    adr_dir = discovery.selected_dir
    if not adr_dir.exists():
        return payload

    catalog = build_adr_catalog(discovery.root, adr_dir, include_superseded=args.include_superseded)
    records = public_summaries(catalog["records"])
    payload["records"] = records
    payload["count"] = len(records)
    payload["parse_errors"] = catalog["parse_errors"]
    payload["warnings"] = catalog["warnings"]
    payload["errors"] = catalog["errors"]
    payload["ok"] = not payload["parse_errors"] and not payload["errors"]
    if payload["parse_errors"] and "One or more ADR Markdown files could not be parsed." not in payload["errors"]:
        payload["errors"].append("One or more ADR Markdown files could not be parsed.")
    return payload


def query_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("query")
    payload.update({"query": args.query, "records": [], "count": 0, "parse_errors": [], "warnings": []})
    if not payload["ok"] or discovery.selected_dir is None:
        return payload
    if not discovery.selected_dir.exists():
        return payload

    catalog = build_adr_catalog(
        discovery.root, discovery.selected_dir, include_superseded=args.include_superseded, query_text=args.query
    )
    records = public_summaries(catalog["records"])
    if args.limit is not None:
        records = records[: args.limit]
    payload["records"] = records
    payload["count"] = len(records)
    payload["parse_errors"] = catalog["parse_errors"]
    payload["warnings"] = catalog["warnings"]
    payload["errors"] = catalog["errors"]
    payload["ok"] = not payload["parse_errors"] and not payload["errors"]
    if payload["parse_errors"] and "One or more ADR Markdown files could not be parsed." not in payload["errors"]:
        payload["errors"].append("One or more ADR Markdown files could not be parsed.")
    return payload


def show_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("show")
    payload.update(
        {"target": args.target, "record": None, "relationships": {"outgoing": [], "incoming": []}, "parse_errors": []}
    )
    if not payload["ok"] or discovery.selected_dir is None:
        return payload
    if not discovery.selected_dir.exists():
        payload["ok"] = False
        payload.setdefault("errors", []).append("ADR directory does not exist.")
        return payload

    catalog = build_adr_catalog(discovery.root, discovery.selected_dir, include_superseded=True)
    all_records = catalog["records"]
    found = find_summary_by_target(all_records, args.target)
    if found is None:
        payload["ok"] = False
        payload["errors"] = [*catalog["errors"], f"ADR not found: {args.target}"]
        payload["parse_errors"] = catalog["parse_errors"]
        return payload
    if not args.include_superseded and not bool(found.get("current", False)):
        payload["ok"] = False
        payload["errors"] = [
            f"ADR {found.get('adr_id') or args.target} is not current; pass --include-superseded to show it."
        ]
        return payload

    record = public_summaries([found])[0]
    node_id = str(found.get("id", ""))
    payload["record"] = record
    payload["parse_errors"] = catalog["parse_errors"]
    payload["errors"] = catalog["errors"]
    payload["warnings"] = catalog["warnings"]
    payload["ok"] = not payload["parse_errors"] and not payload["errors"]
    if node_id and catalog["node_by_id"]:
        payload["relationships"] = compact_relationships(
            node_id, catalog["valid_edges"], catalog["node_by_id"], catalog["current_by_id"]
        )
    entry = catalog["markdown_entries"].get(str(found.get("path", "")))
    payload["sections"] = compact_sections_for_entry(entry)
    if payload["parse_errors"] and "One or more ADR Markdown files could not be parsed." not in payload["errors"]:
        payload["errors"].append("One or more ADR Markdown files could not be parsed.")
    return payload


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", default=".", help="Project root. Default: current directory.")
    parser.add_argument("--adr-dir", help="Explicit ADR directory path relative to --root.")
    parser.add_argument("--json", action="store_true", help="Print a JSON receipt.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cartographer ADR Markdown helper foundation.")
    sub = parser.add_subparsers(dest="command", required=True)

    discover_p = sub.add_parser("discover", help="Discover/select the ADR directory and next ADR number.")
    add_common_args(discover_p)
    discover_p.add_argument("--create", action="store_true", help=f"Create fallback {FALLBACK_ADR_DIR}/ if needed.")
    discover_p.add_argument("--title", help="Optional title used to preview the next ADR filename.")
    discover_p.set_defaults(func=discover_action)

    evaluate_p = sub.add_parser("evaluate", help="Evaluate whether a request/proposal likely requires an ADR.")
    add_common_args(evaluate_p)
    evaluate_p.add_argument("--topic", help="Cartographer topic under .plan/ used as proposal input.")
    evaluate_p.add_argument("--request", help="Optional user request text to evaluate.")
    evaluate_p.set_defaults(func=evaluate_action)

    draft_p = sub.add_parser("draft", help="Draft an ADR from workflow topic artifacts without writing files.")
    add_common_args(draft_p)
    draft_p.add_argument("--topic", required=True, help="Cartographer topic under .plan/.")
    draft_p.add_argument("--force", action="store_true", help="Draft even when evaluate does not recommend an ADR.")
    draft_p.add_argument("--number", type=int, help="Draft ADR number. Defaults to 1 for preview.")
    add_record_args(draft_p, required=False)
    draft_p.set_defaults(func=draft_action)

    create_p = sub.add_parser("create", help="Create a standalone/manual ADR and graph node.")
    add_common_args(create_p)
    add_record_args(create_p)
    create_p.set_defaults(func=create_action)

    write_p = sub.add_parser("write", help="Write a workflow/manual ADR and graph node.")
    add_common_args(write_p)
    write_p.add_argument("--topic", help="Optional Cartographer topic for workflow-generated ADR metadata.")
    write_p.add_argument("--force", action="store_true", help="Write even when evaluate does not recommend an ADR.")
    add_record_args(write_p)
    write_p.set_defaults(func=write_action)

    relate_p = sub.add_parser("relate", help="Add or update an ADR graph relationship edge.")
    add_common_args(relate_p)
    relate_p.add_argument("--from", dest="from_id", required=True, help="Source ADR graph node id, e.g. adr:0002.")
    relate_p.add_argument("--to", dest="to_id", required=True, help="Target ADR graph node id, e.g. adr:0001.")
    relate_p.add_argument(
        "--type", dest="edge_type", required=True, choices=sorted(ADR_EDGE_TYPES), help="ADR relationship type."
    )
    relate_p.add_argument("--reason", default="", help="Relationship rationale.")
    relate_p.add_argument("--evidence", action="append", default=[], help="Evidence path/id. Repeatable.")
    relate_p.add_argument(
        "--confirm", action="store_true", help="Confirm supersedes/conflicts_with relationship writes."
    )
    relate_p.set_defaults(func=relate_action)

    import_p = sub.add_parser("import", help="Import an existing ADR Markdown file into the ADR graph.")
    add_common_args(import_p)
    import_p.add_argument(
        "--path", required=True, help="Repo-relative path to an ADR Markdown file inside the ADR directory."
    )
    import_p.add_argument("--legacy", action="store_true", help="Mark the imported ADR as a legacy import.")
    import_p.add_argument(
        "--import-note", default="", help="Required note when a legacy ADR omits validation receipts."
    )
    import_p.set_defaults(func=import_action)

    validate_p = sub.add_parser("validate", help="Validate ADR Markdown and graph JSONL consistency.")
    add_common_args(validate_p)
    validate_p.set_defaults(func=validate_action)

    list_p = sub.add_parser("list", help="List compact ADR summaries from graph/Markdown records.")
    add_common_args(list_p)
    list_p.add_argument("--include-superseded", action="store_true", help="Include superseded/non-current ADRs.")
    list_p.set_defaults(func=list_action)

    query_p = sub.add_parser("query", help="Search compact ADR summaries, current-first by default.")
    add_common_args(query_p)
    query_p.add_argument("query", help="Search text matched against title, metadata, summary, and ADR body text.")
    query_p.add_argument("--include-superseded", action="store_true", help="Include superseded/non-current ADRs.")
    query_p.add_argument("--limit", type=int, help="Maximum number of summaries to return.")
    query_p.set_defaults(func=query_action)

    show_p = sub.add_parser("show", help="Show one compact ADR summary with graph relationships.")
    add_common_args(show_p)
    show_p.add_argument("target", help="ADR id, graph node id, number, filename, or repo-relative path.")
    show_p.add_argument("--include-superseded", action="store_true", help="Allow showing superseded/non-current ADRs.")
    show_p.set_defaults(func=show_action)
    return parser


def render_human(payload: dict[str, Any]) -> str:
    action = payload.get("action")
    if not payload.get("ok"):
        errors = payload.get("errors") or ["ADR command failed"]
        return "\n".join(str(error) for error in errors)
    if action == "discover":
        details = [f"ADR directory: {payload.get('adr_dir')}", f"Next ADR: {payload.get('next_adr_id')}"]
        if payload.get("next_filename"):
            details.append(f"Next filename: {payload['next_filename']}")
        if payload.get("created"):
            details.append("Created ADR directory.")
        return "\n".join(details)
    if action == "list":
        records = payload.get("records") or []
        if not records:
            return "No ADR records found."
        return "\n".join(f"{record['adr_id']} {record['status']} {record['title']}" for record in records)
    return f"ok: {payload}"


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        payload = args.func(args)
        exit_code = 0 if payload.get("ok") else 1
    except AdrRecordsError as exc:
        payload = {"ok": False, "action": getattr(args, "command", None), "errors": [str(exc)]}
        exit_code = 1

    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        output = render_human(payload)
        print(output, file=sys.stderr if exit_code else sys.stdout)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
