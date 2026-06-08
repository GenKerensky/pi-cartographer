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
)
ADR_EDGE_REQUIRED_FIELDS = ("from", "to", "type")

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


def list_action(args: argparse.Namespace) -> dict[str, Any]:
    discovery = discover_adr_directory(args.root, args.adr_dir, create=False)
    payload = discovery.to_receipt("list")
    payload["records"] = []
    payload["count"] = 0
    payload["parse_errors"] = []
    if not payload["ok"] or discovery.selected_dir is None:
        return payload

    adr_dir = discovery.selected_dir
    if not adr_dir.exists():
        return payload

    records: list[dict[str, Any]] = []
    parse_errors: list[dict[str, str]] = []
    for path in sorted(adr_dir.iterdir(), key=lambda item: item.name):
        if not path.is_file() or ADR_FILENAME_RE.match(path.name) is None:
            continue
        try:
            record = parse_adr_markdown(path.read_text(encoding="utf-8"))
        except (OSError, AdrMarkdownError) as exc:
            parse_errors.append({"path": rel_path(discovery.root, path), "error": str(exc)})
            continue
        records.append(record.to_summary(path=path, root=discovery.root))

    payload["records"] = records
    payload["count"] = len(records)
    payload["parse_errors"] = parse_errors
    payload["ok"] = not parse_errors
    if parse_errors:
        payload.setdefault("errors", []).append("One or more ADR Markdown files could not be parsed.")
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

    list_p = sub.add_parser("list", help="List existing ADR Markdown records from the selected directory.")
    add_common_args(list_p)
    list_p.set_defaults(func=list_action)
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
