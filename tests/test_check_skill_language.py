from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "plan" / "scripts" / "check_skill_language.py"


class CheckSkillLanguageTests(unittest.TestCase):
    def run_checker(self, root: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python", str(SCRIPT), "--root", str(root), "--json", *args],
            text=True,
            capture_output=True,
            check=False,
        )

    def write_skill(self, root: Path, name: str, body: str) -> Path:
        path = root / "skills" / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "---\n"
            f"name: {name}\n"
            f"description: Use this skill when testing {name} behavior.\n"
            "---\n\n"
            f"# {name}\n\n"
            f"{body}\n",
            encoding="utf-8",
        )
        return path

    def write_agent(self, root: Path, name: str, *, model: bool = True) -> Path:
        path = root / ".pi" / "agents" / f"{name}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        model_line = "model: openai-codex/gpt-5.5\n" if model else ""
        path.write_text(
            f"---\nname: {name}\ndescription: Test agent\n{model_line}tools: read,bash\n---\n\nRead-only test agent.\n",
            encoding="utf-8",
        )
        return path

    def test_reports_direct_jsonl_write_but_allows_prohibition(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_skill(
                root,
                "proposal",
                "Write each finding by appending nodes to facts.nodes.jsonl.\n"
                "Do not hand-edit fact JSONL when a wrapper exists.\n",
            )
            self.write_agent(root, "cartographer-auditor")

            result = self.run_checker(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ok"])
            findings = payload["findings"]
            self.assertEqual(payload["counts"]["blocking_findings"], 1)
            self.assertEqual(findings[0]["code"], "DIRECT_JSONL_MUTATION")
            self.assertIn("appending nodes", findings[0]["text"])

    def test_strict_exits_nonzero_on_blocking_findings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_skill(root, "plan", "Create .plan/{topic}/plan.nodes.jsonl directly.\n")
            self.write_agent(root, "cartographer-drafter")

            result = self.run_checker(root, "--strict")
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["counts"]["blocking_findings"], 1)

    def test_agent_requires_explicit_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_skill(root, "dashboard", "Run deterministic commands only.\n")
            self.write_agent(root, "cartographer-compass", model=False)

            result = self.run_checker(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["findings"][0]["code"], "MISSING_AGENT_MODEL")

    def test_clean_fixture_has_no_blocking_findings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_skill(
                root,
                "implement",
                "Run `cartographer_plan_status` for status changes.\n"
                "Agents MAY read JSONL summaries but wrappers own writes.\n",
            )
            self.write_agent(root, "cartographer-auditor")

            result = self.run_checker(root, "--strict")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["counts"]["blocking_findings"], 0)


if __name__ == "__main__":
    unittest.main()
