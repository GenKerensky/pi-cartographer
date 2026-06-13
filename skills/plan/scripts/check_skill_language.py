#!/usr/bin/env python3
"""Check Cartographer skill and agent instruction language.

This checker is intentionally heuristic. It flags high-risk phrases for review
without trying to perform semantic review. Use --strict when findings should fail
CI or final validation.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
JSONL_NAME_RE = re.compile(
    r"(?i)\b(?:map|facts?|plan|interview|requirements|design|receipts|context-packs|journal)"
    r"(?:\.(?:nodes|edges))?\.jsonl\b"
)
DIRECT_MUTATION_RE = re.compile(
    r"(?i)\b(create|write|append|upsert|update|synchroni[sz]e|sync|mirror|mark|check off)\b"
)
DELEGATED_ROLE_RE = re.compile(r"(?i)\b(planner|researcher|scout|delegate|subagent|specialist|worker|pathfinder)\b")
DELEGATED_WRITE_RE = re.compile(r"(?i)\b(create|write|append|upsert|rewrite|mutate|update)\b")
RFC2119_RE = re.compile(r"\b(MUST(?: NOT)?|SHOULD(?: NOT)?|MAY|OPTIONAL|REQUIRED|RECOMMENDED)\b")
LOWERCASE_REQUIREMENT_RE = re.compile(r"\b(must|must not|should|should not|may|optional|required|recommended)\b")

ALLOW_HINTS = (
    "do not",
    "don't",
    "must not",
    "should not",
    "not ",
    "never ",
    "read-only",
    "readonly",
    "without mutating",
    "without mutation",
    "suggestion",
    "suggested",
    "example",
    "shape",
    "fallback",
    "append-only",
    "unless a wrapper",
    "when available",
    "validate",
    "validation",
    "parse",
    "exists",
    "source of truth",
    "cartographer_",
    "cartographer-",
    "slice-jsonl",
    "index_project.py",
    "index-project skill",
    "project-graph.sqlite",
    "validation_runner.py",
    "receipt-append",
    "plan-status-set",
    "proposal-init",
    "plan-generate-graph",
    "generate-graph",
    "state-",
    "cartographer_receipt",
    "cartographer_handoff",
    "cartographer_validation",
    "cartographer_fact",
    "cartographer_jsonl",
    "cartographer_context_pack",
)

SCAN_GLOBS = (
    "skills/*/SKILL.md",
    ".pi/agents/*.md",
    "AGENTS.md",
)


@dataclass
class Finding:
    code: str
    severity: str
    path: str
    line: int
    message: str
    text: str
    blocking: bool = False


def rel_path(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def parse_frontmatter(text: str) -> dict[str, str]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}
    values: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def is_allowed_context(line: str) -> bool:
    lowered = line.lower()
    return any(hint in lowered for hint in ALLOW_HINTS)


def scan_markdown_file(root: Path, path: Path, max_lines: int) -> list[Finding]:
    text = path.read_text(encoding="utf-8")
    relative = rel_path(root, path)
    findings: list[Finding] = []
    lines = text.splitlines()
    frontmatter = parse_frontmatter(text)

    if path.name == "SKILL.md":
        description = frontmatter.get("description", "")
        if not description:
            findings.append(
                Finding(
                    code="MISSING_DESCRIPTION",
                    severity="error",
                    path=relative,
                    line=1,
                    message="SKILL.md frontmatter must include a description.",
                    text="",
                    blocking=True,
                )
            )
        elif len(description) > 1024:
            findings.append(
                Finding(
                    code="LONG_DESCRIPTION",
                    severity="warning",
                    path=relative,
                    line=1,
                    message="Skill description exceeds 1024 characters.",
                    text=description[:180],
                    blocking=True,
                )
            )
        elif re.search(r"(?i)\b(i can|you can use this|this skill does stuff|helps with)\b", description):
            findings.append(
                Finding(
                    code="WEAK_DESCRIPTION",
                    severity="warning",
                    path=relative,
                    line=1,
                    message="Skill description should be trigger-oriented and specific.",
                    text=description[:180],
                    blocking=False,
                )
            )
        if len(lines) > max_lines:
            findings.append(
                Finding(
                    code="LONG_SKILL_FILE",
                    severity="warning",
                    path=relative,
                    line=max_lines + 1,
                    message=f"SKILL.md has {len(lines)} lines; consider one-level references near {max_lines} lines.",
                    text="",
                    blocking=False,
                )
            )

    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        has_jsonl = bool(JSONL_NAME_RE.search(stripped))
        has_mutation = bool(DIRECT_MUTATION_RE.search(stripped))
        if has_jsonl and has_mutation and not is_allowed_context(stripped):
            findings.append(
                Finding(
                    code="DIRECT_JSONL_MUTATION",
                    severity="warning",
                    path=relative,
                    line=line_number,
                    message="Potential direct canonical JSONL mutation wording; prefer wrapper/tool/script instructions.",
                    text=stripped[:240],
                    blocking=True,
                )
            )

        if has_mutation and "receipt" in stripped.lower() and not is_allowed_context(stripped):
            findings.append(
                Finding(
                    code="DIRECT_RECEIPT_MUTATION",
                    severity="warning",
                    path=relative,
                    line=line_number,
                    message="Potential direct receipt mutation wording; prefer cartographer_receipt, cartographer_handoff, or cartographer_validation.",
                    text=stripped[:240],
                    blocking=True,
                )
            )

        if (
            DELEGATED_ROLE_RE.search(stripped)
            and DELEGATED_WRITE_RE.search(stripped)
            and (
                "jsonl" in stripped.lower()
                or "canonical" in stripped.lower()
                or "receipt" in stripped.lower()
                or "adr" in stripped.lower()
                or "private" in stripped.lower()
                or "plan.md" in stripped.lower()
                or "proposal.md" in stripped.lower()
            )
            and not is_allowed_context(stripped)
        ):
            findings.append(
                Finding(
                    code="DELEGATED_WRITE_AUTHORITY",
                    severity="warning",
                    path=relative,
                    line=line_number,
                    message="Potential delegated canonical-write authority; keep specialists read-only or suggestions-only.",
                    text=stripped[:240],
                    blocking=True,
                )
            )

        if RFC2119_RE.search(stripped) and stripped.endswith(":"):
            findings.append(
                Finding(
                    code="RFC2119_HEADING",
                    severity="warning",
                    path=relative,
                    line=line_number,
                    message="RFC 2119 keywords in headings often overstate normative force.",
                    text=stripped[:180],
                    blocking=False,
                )
            )
        if "must" in stripped.lower() and not RFC2119_RE.search(stripped) and LOWERCASE_REQUIREMENT_RE.search(stripped):
            # Informational only; lowercase can be ordinary English.
            pass

    return findings


def discover_files(root: Path, paths: list[str]) -> list[Path]:
    if paths:
        return sorted({(root / item).resolve() for item in paths})
    discovered: set[Path] = set()
    for pattern in SCAN_GLOBS:
        discovered.update(path.resolve() for path in root.glob(pattern) if path.is_file())
    return sorted(discovered)


def build_report(root: Path, paths: list[str], max_lines: int) -> dict[str, Any]:
    files = discover_files(root, paths)
    findings: list[Finding] = []
    errors: list[str] = []
    for path in files:
        try:
            if path.is_file():
                findings.extend(scan_markdown_file(root, path, max_lines))
            else:
                errors.append(f"Path is not a file: {rel_path(root, path)}")
        except UnicodeDecodeError as exc:
            errors.append(f"Unable to read text file {rel_path(root, path)}: {exc}")
    blocking = [finding for finding in findings if finding.blocking]
    by_code: dict[str, int] = {}
    for finding in findings:
        by_code[finding.code] = by_code.get(finding.code, 0) + 1
    return {
        "ok": not errors and not blocking,
        "root": str(root),
        "counts": {
            "files_scanned": len(files),
            "findings": len(findings),
            "blocking_findings": len(blocking),
            "errors": len(errors),
            "by_code": by_code,
        },
        "errors": errors,
        "findings": [asdict(finding) for finding in findings],
    }


def print_text_report(report: dict[str, Any]) -> None:
    counts = report["counts"]
    print(
        f"skill-language-check ok={report['ok']} files={counts['files_scanned']} "
        f"findings={counts['findings']} blocking={counts['blocking_findings']} errors={counts['errors']}"
    )
    for error in report["errors"]:
        print(f"ERROR: {error}", file=sys.stderr)
    for finding in report["findings"][:80]:
        marker = "BLOCK" if finding["blocking"] else finding["severity"].upper()
        print(f"{marker} {finding['path']}:{finding['line']} {finding['code']}: {finding['message']}")
        if finding["text"]:
            print(f"  {finding['text']}")
    if len(report["findings"]) > 80:
        print(f"... {len(report['findings']) - 80} additional finding(s) omitted")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check Cartographer skill/agent language for wrapper-first and single-writer risks.",
        epilog=(
            "Examples:\n"
            "  python skills/plan/scripts/check_skill_language.py --root . --json\n"
            "  python skills/plan/scripts/check_skill_language.py --root . --strict"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--root", default=".", help="Project root. Default: current directory.")
    parser.add_argument("--path", action="append", default=[], help="Project-relative file to scan. Repeatable.")
    parser.add_argument("--max-lines", type=int, default=500, help="Preferred maximum SKILL.md line count.")
    parser.add_argument("--json", action="store_true", help="Emit JSON report to stdout.")
    parser.add_argument("--strict", action="store_true", help="Exit nonzero when blocking findings are present.")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    report = build_report(root, args.path, args.max_lines)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_text_report(report)
    if report["errors"]:
        return 2
    if args.strict and report["counts"]["blocking_findings"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
