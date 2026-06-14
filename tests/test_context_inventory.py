from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "plan" / "scripts" / "context_inventory.py"


class ContextInventoryTests(unittest.TestCase):
    def run_inventory(self, root: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root), "--json", *args],
            text=True,
            capture_output=True,
            check=False,
        )

    def write_skill(self, root: Path, name: str, description: str, body: str = "Body") -> None:
        path = root / "skills" / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "---\n"
            f"name: {name}\n"
            f"description: {description}\n"
            "---\n\n"
            f"# {name}\n\n{body}\n",
            encoding="utf-8",
        )

    def test_inventory_reports_core_sources_and_skill_descriptions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "AGENTS.md").write_text("root rules\n", encoding="utf-8")
            (root / "skills").mkdir()
            (root / "skills" / "AGENTS.md").write_text("skill rules\n", encoding="utf-8")
            self.write_skill(root, "implement", "Implement existing plans.", "x" * 20)
            self.write_skill(root, "plan", "Create plans.", "y" * 20)
            self.write_skill(root, "proposal", "Create proposals.", "z" * 20)
            self.write_skill(root, "small", "Small helper.")

            result = self.run_inventory(root)

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            paths = {item["path"] for item in payload["items"]}
            self.assertIn("AGENTS.md", paths)
            self.assertIn("skills/AGENTS.md", paths)
            self.assertIn("skills/implement/SKILL.md", paths)
            self.assertIn("skills/plan/SKILL.md", paths)
            self.assertIn("skills/proposal/SKILL.md", paths)
            descriptions = {item["name"] for item in payload["skill_descriptions"]}
            self.assertGreaterEqual({"implement", "plan", "proposal", "small"}, descriptions)
            self.assertIn("budgets", payload)
            self.assertEqual(payload["counts"]["skill_descriptions"], 4)

    def test_session_inventory_emits_aggregate_compaction_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            session = root / "session.jsonl"
            secret = "ghp_123456789012345678901234567890123456"
            session.write_text(
                json.dumps({"type": "compaction", "summary": "safe summary " + secret})
                + "\n"
                + json.dumps({"type": "message", "message": {"role": "user", "content": secret}})
                + "\n",
                encoding="utf-8",
            )

            result = self.run_inventory(root, "--session", str(session))

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(secret, result.stdout)
            payload = json.loads(result.stdout)
            compaction = [item for item in payload["items"] if item["category"] == "compaction-summary-total"][0]
            self.assertEqual(compaction["lines"], 1)
            self.assertGreater(compaction["chars"], 0)
            self.assertIn("raw summaries not emitted", compaction["notes"])

    def test_baseline_deltas_are_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "AGENTS.md").write_text("root rules\n", encoding="utf-8")
            baseline = root / "baseline.json"
            baseline.write_text(
                json.dumps({"items": [{"path": "AGENTS.md", "chars": 5}]}),
                encoding="utf-8",
            )

            result = self.run_inventory(root, "--baseline", str(baseline))

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            root_item = [item for item in payload["items"] if item["path"] == "AGENTS.md"][0]
            self.assertEqual(root_item["delta_chars"], len("root rules\n") - 5)


if __name__ == "__main__":
    unittest.main()
