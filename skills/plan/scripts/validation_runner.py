#!/usr/bin/env python3
"""Run a validation command and append a compact validation receipt."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".plan/_index",
    ".plan/_private",
    ".plan/_runs",
}
TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".jsonl", ".md", ".txt", ".toml", ".yml", ".yaml"}


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def should_hash(path: Path, root: Path) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    rel_text = rel.as_posix()
    if any(rel_text == item or rel_text.startswith(f"{item}/") for item in EXCLUDED_DIRS):
        return False
    if any(part in {".git", "node_modules", ".venv", "venv", "__pycache__"} for part in rel.parts):
        return False
    if len(rel.parts) >= 2 and rel.parts[0] == ".plan" and rel.parts[1] in {"_index", "_private", "_runs"}:
        return False
    return path.is_file() and path.suffix.lower() in TEXT_SUFFIXES


def hash_files(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        try:
            rel = current.relative_to(root)
        except ValueError:
            continue
        dirnames[:] = [
            name for name in dirnames if name not in {".git", "node_modules", ".venv", "venv", "__pycache__"}
        ]
        if len(rel.parts) >= 2 and rel.parts[0] == ".plan" and rel.parts[1] in {"_index", "_private", "_runs"}:
            dirnames[:] = []
            continue
        for filename in filenames:
            path = current / filename
            if not should_hash(path, root):
                continue
            try:
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
            except OSError:
                continue
            hashes[path.relative_to(root).as_posix()] = digest
    return hashes


def hash_set_digest(hashes: dict[str, str]) -> str:
    payload = json.dumps(hashes, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def drop_receipt_file_hash(hashes: dict[str, str], root: Path, receipt_file: Path) -> dict[str, str]:
    try:
        rel = receipt_file.resolve().relative_to(root).as_posix()
    except ValueError:
        return hashes
    return {path: digest for path, digest in hashes.items() if path != rel}


def read_receipts(path: Path) -> list[dict[str, Any]]:
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


def find_previous(records: list[dict[str, Any]], command: str, phase_id: str | None) -> dict[str, Any] | None:
    for record in reversed(records):
        if record.get("command") != command:
            continue
        if phase_id and record.get("phase_id") != phase_id:
            continue
        if record.get("status") == "passed":
            return record
    return None


def write_full_output(text: str, directory: Path, label: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in label)[:48] or "validation"
    out = directory / f"{safe}-{dt.datetime.now(dt.UTC).strftime('%Y%m%dT%H%M%SZ')}.log"
    out.write_text(text, encoding="utf-8")
    return out


def summarize_output(
    stdout: str, stderr: str, max_chars: int, full_output_dir: Path, label: str
) -> tuple[str, str | None, bool]:
    combined = stdout + stderr
    if len(combined) <= max_chars:
        return combined, None, False
    output_path = write_full_output(combined, full_output_dir, label)
    first_failure = "\n".join((stderr or stdout).splitlines()[:20])
    summary = first_failure[:max_chars]
    return summary, str(output_path), True


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a validation command and write a compact receipt.")
    parser.add_argument("--root", default=".", help="Project root. Default: current directory.")
    parser.add_argument("--command", required=True, help="Command to run via the shell.")
    parser.add_argument("--phase-id", help="Plan phase ID, such as P2.")
    parser.add_argument("--validation-id", action="append", default=[], help="Validation ID satisfied by this command.")
    parser.add_argument("--receipt-file", required=True, help="Receipt JSONL file to append.")
    parser.add_argument("--max-output-chars", type=int, default=8000, help="Inline output budget.")
    parser.add_argument("--full-output-dir", default="/tmp/pi-cartographer-runs", help="Directory for oversized logs.")
    parser.add_argument("--timeout-sec", type=float, help="Timeout seconds for the validation command.")
    parser.add_argument(
        "--skip-if-unchanged", action="store_true", help="Skip if a previous passed receipt has the same file hash set."
    )
    parser.add_argument("--json", action="store_true", help="Print JSON receipt.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    receipt_file = Path(args.receipt_file)
    if not receipt_file.is_absolute():
        receipt_file = root / receipt_file
    hashes_before = drop_receipt_file_hash(hash_files(root), root, receipt_file)
    digest_before = hash_set_digest(hashes_before)
    previous = find_previous(read_receipts(receipt_file), args.command, args.phase_id)
    if args.skip_if_unchanged and previous and previous.get("hash_set_digest") == digest_before:
        receipt = {
            "id": f"receipt:{args.phase_id or 'manual'}:validation:{utc_now()}",
            "type": "validation-receipt",
            "phase_id": args.phase_id,
            "validation_ids": args.validation_id,
            "status": "skipped",
            "command": args.command,
            "commands": [{"command": args.command, "result": "skipped"}],
            "summary": "Skipped unchanged validation because file hash set matches a previous passed receipt.",
            "previous_receipt": previous.get("id"),
            "hash_set_digest": digest_before,
            "changed_file_count": len(hashes_before),
            "verified": True,
            "verification": {"validation": args.validation_id or [args.command]},
        }
        append_jsonl(receipt_file, receipt)
        if args.json:
            print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0

    started = dt.datetime.now(dt.UTC)
    timed_out = False
    try:
        result = subprocess.run(args.command, cwd=root, shell=True, text=True, capture_output=True, timeout=args.timeout_sec)
        stdout = result.stdout
        stderr = result.stderr
        exit_code = result.returncode
    except subprocess.TimeoutExpired as error:
        timed_out = True
        stdout = error.stdout if isinstance(error.stdout, str) else ""
        stderr = error.stderr if isinstance(error.stderr, str) else ""
        stderr = (stderr + f"\nCommand timed out after {args.timeout_sec} seconds.").strip()
        exit_code = 124
    ended = dt.datetime.now(dt.UTC)
    hashes_after = drop_receipt_file_hash(hash_files(root), root, receipt_file)
    digest_after = hash_set_digest(hashes_after)
    summary, full_output_path, truncated = summarize_output(
        stdout,
        stderr,
        args.max_output_chars,
        Path(args.full_output_dir),
        args.phase_id or "validation",
    )
    receipt = {
        "id": f"receipt:{args.phase_id or 'manual'}:validation:{utc_now()}",
        "type": "validation-receipt",
        "phase_id": args.phase_id,
        "validation_ids": args.validation_id,
        "status": "timed-out" if timed_out else ("passed" if exit_code == 0 else "failed"),
        "command": args.command,
        "commands": [{"command": args.command, "result": "timed-out" if timed_out else ("passed" if exit_code == 0 else "failed")}],
        "exit_code": exit_code,
        "duration_ms": int((ended - started).total_seconds() * 1000),
        "summary": summary.strip()
        or ("Command passed with no output." if exit_code == 0 else "Command timed out with no output." if timed_out else "Command failed with no output."),
        "truncated": truncated,
        "maxOutputChars": args.max_output_chars,
        "token_estimate": max(1, (len(stdout) + len(stderr)) // 4),
        "full_output_path": full_output_path,
        "hash_set_digest": digest_after,
        "changed_file_count": len(hashes_after),
        "changed_files": sorted(path for path in hashes_after if hashes_before.get(path) != hashes_after[path]),
        "verified": exit_code == 0,
        "verification": {"validation": args.validation_id or [args.command]},
    }
    if exit_code != 0:
        receipt["decision"] = "parent-review-required-after-timeout" if timed_out else "parent-review-required-after-validation-failure"
        receipt["fallback_required"] = True
    receipt = {key: value for key, value in receipt.items() if value not in (None, [], {})}
    append_jsonl(receipt_file, receipt)
    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
