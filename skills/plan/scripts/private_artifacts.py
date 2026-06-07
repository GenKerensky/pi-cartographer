#!/usr/bin/env python3
"""Safely import private proposal artifacts without exposing contents.

The helper is intentionally stdlib-only. It copies or moves user-authorized
artifacts into .plan/_private/<topic>/ and writes manifests that can be used by
proposal workflows without printing or reading raw artifact contents into LLM
context. Hashing is opt-in and streams bytes without returning file content.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

PRIVATE_ROOT_REL = ".plan/_private"
EVIDENCE_DIR_REL = ".plan/{topic}/evidence"
PRIVATE_MANIFEST = "manifest.private.jsonl"
PUBLIC_MANIFEST = "manifest.jsonl"


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    return slug or "artifact"


def topic_slug(value: str | None) -> str:
    if not value:
        return "_inbox"
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "_inbox"


def rel_path(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def git_tracked(root: Path, path: Path) -> bool:
    if not is_within(path, root) or not (root / ".git").exists():
        return False
    try:
        rel = rel_path(root, path)
        result = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", rel],
            cwd=root,
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def classify_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".log", ".txt"}:
        return "log"
    if suffix in {".jsonl"}:
        return "session-log"
    if suffix in {".json", ".yaml", ".yml"}:
        return "data-export"
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        return "image"
    if suffix in {".pdf", ".doc", ".docx", ".md"}:
        return "document"
    return "artifact"


def unique_destination(private_dir: Path, source: Path, mode: str, index: int) -> Path:
    suffix = source.suffix
    if mode == "opaque":
        base = f"artifact-{index:03d}{suffix}"
    elif mode == "sanitize":
        base = slugify(source.name)
        if suffix and not base.lower().endswith(suffix.lower()):
            base += suffix
    else:
        base = source.name
    candidate = private_dir / base
    if not candidate.exists():
        return candidate
    stem = Path(base).stem
    ext = Path(base).suffix
    counter = 2
    while True:
        candidate = private_dir / f"{stem}-{counter}{ext}"
        if not candidate.exists():
            return candidate
        counter += 1


def append_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, sort_keys=True) + "\n")


def import_artifacts(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).resolve()
    topic = topic_slug(args.topic)
    if topic == "_inbox" and not args.inbox:
        raise SystemExit("--topic is required unless --inbox is set")

    private_dir = root / PRIVATE_ROOT_REL / ("_inbox" if args.inbox else topic)
    if args.inbox:
        private_dir = private_dir / (args.inbox_id or dt.datetime.now(dt.UTC).strftime("%Y%m%d%H%M%S"))
    evidence_dir = root / EVIDENCE_DIR_REL.format(topic=topic)
    private_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    private_records: list[dict[str, Any]] = []
    public_records: list[dict[str, Any]] = []
    imported: list[dict[str, Any]] = []

    for index, raw_input in enumerate(args.input, start=1):
        source = Path(raw_input).expanduser().resolve()
        if not source.exists() or not source.is_file():
            raise SystemExit(f"Private artifact input is not a file: {raw_input}")
        if args.move and git_tracked(root, source):
            raise SystemExit(f"Refusing to move tracked file without explicit user handling: {rel_path(root, source)}")
        destination = unique_destination(private_dir, source, args.basename_mode, index)
        if args.move:
            shutil.move(str(source), destination)
            operation = "moved"
        else:
            shutil.copy2(source, destination)
            operation = "copied"

        artifact_id = f"private-artifact:{topic}:{destination.stem}"
        private_rel = rel_path(root, destination)
        analysis_name = f"{destination.stem}-analysis.md"
        now = utc_now()
        private_record: dict[str, Any] = {
            "id": artifact_id,
            "topic": topic,
            "kind": classify_kind(destination),
            "original_path": str(source),
            "private_path": private_rel,
            "basename": destination.name,
            "size_bytes": destination.stat().st_size,
            "operation": operation,
            "imported_at": now,
            "hash_recorded": bool(args.hash),
        }
        if args.hash:
            private_record["sha256"] = sha256_file(destination)
        public_record = {
            "id": artifact_id,
            "type": "private-artifact",
            "kind": private_record["kind"],
            "basename": destination.name,
            "private_path_hint": private_rel,
            "analysis": f"evidence/{analysis_name}",
            "status": "imported",
            "sensitivity": args.sensitivity,
            "redaction_status": "pending",
        }
        private_records.append(private_record)
        public_records.append(public_record)
        imported.append(
            {
                "id": artifact_id,
                "basename": destination.name,
                "private_path": private_rel,
                "analysis": public_record["analysis"],
                "operation": operation,
            }
        )

    append_jsonl(private_dir / PRIVATE_MANIFEST, private_records)
    append_jsonl(evidence_dir / PUBLIC_MANIFEST, public_records)
    return {
        "ok": True,
        "topic": topic,
        "private_dir": rel_path(root, private_dir),
        "evidence_dir": rel_path(root, evidence_dir),
        "private_manifest": rel_path(root, private_dir / PRIVATE_MANIFEST),
        "evidence_manifest": rel_path(root, evidence_dir / PUBLIC_MANIFEST),
        "imported": imported,
    }


def list_artifacts(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).resolve()
    topic = topic_slug(args.topic)
    manifest = root / EVIDENCE_DIR_REL.format(topic=topic) / PUBLIC_MANIFEST
    if not manifest.exists():
        return {"ok": True, "topic": topic, "count": 0, "records": []}
    records = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    return {"ok": True, "topic": topic, "count": len(records), "records": records[: args.limit]}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import private proposal artifacts safely.")
    sub = parser.add_subparsers(dest="command", required=True)

    import_p = sub.add_parser("import", help="Copy/move private artifacts into .plan/_private/<topic>/")
    import_p.add_argument("--root", default=".", help="Project root. Default: current directory.")
    import_p.add_argument("--topic", help="Proposal topic slug. Required unless --inbox is set.")
    import_p.add_argument(
        "--input", action="append", required=True, help="Private artifact file to import. Repeatable."
    )
    import_p.add_argument("--move", action="store_true", help="Move instead of copy. Refuses tracked repo files.")
    import_p.add_argument("--basename-mode", choices=["preserve", "sanitize", "opaque"], default="preserve")
    import_p.add_argument("--hash", action="store_true", help="Record sha256 in the private manifest only.")
    import_p.add_argument("--inbox", action="store_true", help="Use .plan/_private/_inbox/<id>/ for pre-topic staging.")
    import_p.add_argument("--inbox-id", help="Inbox id when --inbox is used.")
    import_p.add_argument("--sensitivity", default="unknown", choices=["unknown", "low", "medium", "high"])
    import_p.add_argument("--json", action="store_true")
    import_p.set_defaults(func=import_artifacts)

    list_p = sub.add_parser("list", help="List commit-safe evidence manifest records")
    list_p.add_argument("--root", default=".", help="Project root. Default: current directory.")
    list_p.add_argument("--topic", required=True, help="Proposal topic slug.")
    list_p.add_argument("--limit", type=int, default=20)
    list_p.add_argument("--json", action="store_true")
    list_p.set_defaults(func=list_artifacts)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    payload = args.func(args)
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(f"ok: {payload}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
