#!/usr/bin/env python3
"""Inventory Cartographer context sources with bounded, non-secret output."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_BUDGETS = {
    "root-agents": 4000,
    "child-agents": 5000,
    "skill-description": 1200,
    "skill-kernel:implement": 8000,
    "skill-kernel:plan": 10000,
    "skill-kernel:proposal": 10000,
    "skill-reference": 8000,
    "resume-primer": 4000,
    "resume-primer-extended": 8000,
    "tool-schema-estimate": 12000,
}
HIGH_USE_SKILLS = {"implement", "plan", "proposal"}
PHASE_TOOL_SETS = {
    "proposal-design-planning": {
        "cartographer_index",
        "cartographer_evidence",
        "cartographer_session",
        "cartographer_adr",
        "cartographer_artifacts",
        "cartographer_proposal",
        "cartographer_fact",
        "cartographer_jsonl",
        "cartographer_transition",
        "cartographer_plan",
        "cartographer_handoff",
        "cartographer_context_pack",
        "cartographer_receipt",
        "cartographer_validation",
    },
    "implementation": {
        "cartographer_index",
        "cartographer_artifacts",
        "cartographer_compact_context",
        "cartographer_state",
        "cartographer_validation",
        "cartographer_receipt",
        "cartographer_context_pack",
        "cartographer_transition",
        "cartographer_plan_status",
        "cartographer_implement",
        "cartographer_handoff",
        "cartographer_adr",
        "cartographer_jsonl",
    },
}


@dataclass
class ToolEstimate:
    name: str
    description_chars: int
    prompt_snippet_chars: int
    schema_markers: int
    estimated_chars: int

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description_chars": self.description_chars,
            "prompt_snippet_chars": self.prompt_snippet_chars,
            "schema_markers": self.schema_markers,
            "estimated_chars": self.estimated_chars,
            "approx_tokens": max(1, round(self.estimated_chars / 4)) if self.estimated_chars else 0,
        }


@dataclass
class InventoryItem:
    category: str
    path: str
    chars: int
    lines: int
    approx_tokens: int
    budget: int | None = None
    status: str = "measured"
    notes: str = ""

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "category": self.category,
            "path": self.path,
            "chars": self.chars,
            "lines": self.lines,
            "approx_tokens": self.approx_tokens,
            "status": self.status,
        }
        if self.budget is not None:
            data["budget"] = self.budget
            data["over_budget"] = self.chars > self.budget
        if self.notes:
            data["notes"] = self.notes
        return data


def rel(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def measure(root: Path, path: Path, category: str, budget: int | None = None, notes: str = "") -> InventoryItem:
    text = read_text(path)
    return InventoryItem(
        category=category,
        path=rel(root, path),
        chars=len(text),
        lines=text.count("\n") + 1 if text else 0,
        approx_tokens=max(1, round(len(text) / 4)) if text else 0,
        budget=budget,
        notes=notes,
    )


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    result: dict[str, str] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip().strip('"').strip("'")
        if key.strip() in {"name", "description"}:
            result[key.strip()] = value
    return result


def iter_skill_files(root: Path) -> list[Path]:
    skills_dir = root / "skills"
    if not skills_dir.exists():
        return []
    return sorted(skills_dir.glob("*/SKILL.md"))


def inventory_agents(root: Path) -> list[InventoryItem]:
    items: list[InventoryItem] = []
    root_agents = root / "AGENTS.md"
    if root_agents.exists():
        items.append(measure(root, root_agents, "root-agents", DEFAULT_BUDGETS["root-agents"]))
    for path in sorted(root.glob("**/AGENTS.md")):
        if path == root_agents or ".plan" in path.parts or ".git" in path.parts:
            continue
        items.append(measure(root, path, "child-agents", DEFAULT_BUDGETS["child-agents"]))
    return items


def inventory_skills(root: Path) -> tuple[list[InventoryItem], list[dict[str, Any]]]:
    items: list[InventoryItem] = []
    descriptions: list[dict[str, Any]] = []
    for path in iter_skill_files(root):
        text = read_text(path)
        meta = parse_frontmatter(text)
        name = meta.get("name") or path.parent.name
        desc = meta.get("description", "")
        desc_chars = len(name) + len(desc)
        desc_budget = DEFAULT_BUDGETS["skill-description"]
        descriptions.append(
            {
                "name": name,
                "path": rel(root, path),
                "description_chars": desc_chars,
                "approx_tokens": max(1, round(desc_chars / 4)) if desc_chars else 0,
                "budget": desc_budget,
                "over_budget": desc_chars > desc_budget,
            }
        )
        if name in HIGH_USE_SKILLS:
            items.append(
                measure(
                    root,
                    path,
                    f"skill-kernel:{name}",
                    DEFAULT_BUDGETS[f"skill-kernel:{name}"],
                    notes="high-use workflow skill",
                )
            )
            refs = path.parent / "references"
            if refs.exists():
                for ref in sorted(refs.glob("*.md")):
                    items.append(measure(root, ref, "skill-reference", DEFAULT_BUDGETS["skill-reference"], notes=name))
    return items, descriptions


def inventory_topic(root: Path, topic: str | None) -> list[InventoryItem]:
    if not topic:
        return []
    topic_dir = root / ".plan" / topic
    items: list[InventoryItem] = []
    for name in ["context-packs.jsonl", "receipts.jsonl"]:
        path = topic_dir / name
        if path.exists():
            items.append(measure(root, path, "topic-resume-source", DEFAULT_BUDGETS["resume-primer-extended"]))
    state = root / ".cartographer" / topic / "state.json"
    if state.exists():
        items.append(measure(root, state, "resume-primer", DEFAULT_BUDGETS["resume-primer"]))
    return items


def inventory_session(root: Path, session_path: str | None) -> list[InventoryItem]:
    if not session_path:
        return []
    path = Path(session_path).expanduser()
    items: list[InventoryItem] = []
    if not path.exists():
        return [InventoryItem("session", path.as_posix(), 0, 0, 0, status="missing")]
    compaction_chars = 0
    compactions = 0
    invalid = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            invalid += 1
            continue
        if isinstance(record, dict) and record.get("type") == "compaction":
            compactions += 1
            summary = record.get("summary")
            if isinstance(summary, str):
                compaction_chars += len(summary)
    items.append(
        InventoryItem(
            "compaction-summary-total",
            rel(root, path),
            compaction_chars,
            compactions,
            round(compaction_chars / 4) if compaction_chars else 0,
            notes=f"compactions={compactions}; invalid_lines={invalid}; raw summaries not emitted",
        )
    )
    return items


def string_field(block: str, field: str) -> str:
    match = re.search(rf"{field}:\s*([\"'])(.*?)\1", block, re.DOTALL)
    return match.group(2).strip() if match else ""


def tool_blocks(text: str) -> list[str]:
    starts = [match.start() for match in re.finditer(r"pi\.registerTool\(\{", text)]
    blocks: list[str] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(text)
        blocks.append(text[start:end])
    return blocks


def estimate_tools(text: str) -> list[ToolEstimate]:
    tools: list[ToolEstimate] = []
    for block in tool_blocks(text):
        name = string_field(block, "name")
        if not name:
            continue
        descriptions = re.findall(r"description:\s*([\"'])(.*?)\1", block, re.DOTALL)
        description_chars = sum(len(value.strip()) for _, value in descriptions)
        prompt = string_field(block, "promptSnippet")
        schema_markers = len(
            re.findall(r"Type\.(?:Object|String|Array|Number|Boolean|Optional|Union|Literal|Any)", block)
        )
        estimated_chars = len(name) + description_chars + len(prompt) + schema_markers * 40
        tools.append(ToolEstimate(name, description_chars, len(prompt), schema_markers, estimated_chars))
    return tools


def inventory_tools(root: Path) -> tuple[list[InventoryItem], list[dict[str, Any]]]:
    path = root / "extensions" / "cartographer-tools.ts"
    if not path.exists():
        return [], []
    tools = estimate_tools(read_text(path))
    items: list[InventoryItem] = []
    total = sum(tool.estimated_chars for tool in tools)
    schema_markers = sum(tool.schema_markers for tool in tools)
    prompt_chars = sum(tool.prompt_snippet_chars for tool in tools)
    items.append(
        InventoryItem(
            "tool-schema-estimate",
            rel(root, path),
            total,
            len(tools),
            round(total / 4) if total else 0,
            DEFAULT_BUDGETS["tool-schema-estimate"],
            status="estimated" if total else "unknown",
            notes=f"registered_tools={len(tools)}; prompt_chars={prompt_chars}; schema_markers={schema_markers}",
        )
    )
    by_name = {tool.name: tool for tool in tools}
    for phase, names in PHASE_TOOL_SETS.items():
        selected = [by_name[name] for name in sorted(names) if name in by_name]
        estimate = sum(tool.estimated_chars for tool in selected)
        items.append(
            InventoryItem(
                "tool-schema-phase-estimate",
                f"{rel(root, path)}#{phase}",
                estimate,
                len(selected),
                round(estimate / 4) if estimate else 0,
                DEFAULT_BUDGETS["tool-schema-estimate"],
                status="estimated" if estimate else "unknown",
                notes="tools=" + ",".join(tool.name for tool in selected),
            )
        )
    return items, [tool.to_json() for tool in sorted(tools, key=lambda tool: tool.estimated_chars, reverse=True)]


def load_baseline(path: str | None) -> dict[str, dict[str, Any]]:
    if not path:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return {str(item.get("path")): item for item in items if isinstance(item, dict) and item.get("path")}


def apply_deltas(items: list[dict[str, Any]], baseline: dict[str, dict[str, Any]]) -> None:
    for item in items:
        old = baseline.get(str(item.get("path")))
        if not old:
            continue
        old_chars = int(old.get("chars", 0) or 0)
        item["delta_chars"] = int(item.get("chars", 0) or 0) - old_chars


def git_changed_paths(root: Path) -> list[str]:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "status", "--short"], text=True, capture_output=True, check=False
        )
    except OSError:
        return []
    paths: list[str] = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        paths.append(line[3:].strip())
    return paths


def build_inventory(root: Path, topic: str | None, session: str | None, baseline: str | None) -> dict[str, Any]:
    root = root.resolve()
    items_obj: list[InventoryItem] = []
    skill_items, descriptions = inventory_skills(root)
    tool_items, tool_details = inventory_tools(root)
    items_obj.extend(inventory_agents(root))
    items_obj.extend(skill_items)
    items_obj.extend(inventory_topic(root, topic))
    items_obj.extend(inventory_session(root, session))
    items_obj.extend(tool_items)
    items = [item.to_json() for item in sorted(items_obj, key=lambda item: item.chars, reverse=True)]
    apply_deltas(items, load_baseline(baseline))
    over_budget = [item for item in items if item.get("over_budget")]
    return {
        "ok": True,
        "root": str(root),
        "topic": topic,
        "budgets": DEFAULT_BUDGETS,
        "counts": {
            "items": len(items),
            "skill_descriptions": len(descriptions),
            "tool_details": len(tool_details),
            "over_budget": len(over_budget),
        },
        "items": items,
        "skill_descriptions": sorted(descriptions, key=lambda item: item["description_chars"], reverse=True),
        "tool_details": tool_details,
        "changed_paths": git_changed_paths(root),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = ["# Context Inventory", "", f"Root: `{payload['root']}`", "", "## Top Context Sources", ""]
    lines.append("| Category | Path | Chars | Approx tokens | Budget | Status |")
    lines.append("|---|---|---:|---:|---:|---|")
    for item in payload["items"][:30]:
        budget = item.get("budget", "")
        status = "over-budget" if item.get("over_budget") else item.get("status", "")
        lines.append(
            f"| {item['category']} | `{item['path']}` | {item['chars']} | {item['approx_tokens']} | {budget} | {status} |"
        )
    phase_items = [item for item in payload["items"] if item["category"] == "tool-schema-phase-estimate"]
    if phase_items:
        lines.extend(["", "## Tool/Schema Phase Estimates", ""])
        lines.append("| Phase | Estimated chars | Approx tokens | Tools |")
        lines.append("|---|---:|---:|---|")
        for item in phase_items:
            phase = item["path"].split("#", 1)[-1]
            tools = item.get("notes", "").removeprefix("tools=")
            lines.append(f"| {phase} | {item['chars']} | {item['approx_tokens']} | `{tools}` |")
    if payload.get("tool_details"):
        lines.extend(["", "## Largest Tool Definitions", ""])
        lines.append("| Tool | Estimated chars | Schema markers | Prompt chars |")
        lines.append("|---|---:|---:|---:|")
        for item in payload["tool_details"][:12]:
            lines.append(
                f"| {item['name']} | {item['estimated_chars']} | {item['schema_markers']} | {item['prompt_snippet_chars']} |"
            )
    lines.extend(["", "## Active Skill Descriptions", ""])
    lines.append("| Skill | Path | Description chars | Approx tokens |")
    lines.append("|---|---|---:|---:|")
    for item in payload["skill_descriptions"][:30]:
        lines.append(f"| {item['name']} | `{item['path']}` | {item['description_chars']} | {item['approx_tokens']} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Project root to inventory.")
    parser.add_argument("--topic", help="Optional .plan/<topic> and .cartographer/<topic> context to measure.")
    parser.add_argument(
        "--session", help="Optional authorized Pi session JSONL; emits aggregate compaction metrics only."
    )
    parser.add_argument("--baseline", help="Optional previous JSON inventory to compute per-path char deltas.")
    parser.add_argument("--out", help="Write Markdown report to this path.")
    parser.add_argument("--json-out", help="Write JSON payload to this path.")
    parser.add_argument("--json", action="store_true", help="Print JSON payload to stdout instead of Markdown.")
    args = parser.parse_args()

    payload = build_inventory(Path(args.root), args.topic, args.session, args.baseline)
    if args.json_out:
        Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_out).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(render_markdown(payload), encoding="utf-8")
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
