from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "plan" / "scripts" / "requirements_records.py"


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")


class RequirementsRecordsTests(unittest.TestCase):
    def run_helper(self, root: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python", str(SCRIPT), *args, "--root", str(root), "--topic", "demo", "--json"],
            text=True,
            capture_output=True,
            check=False,
        )

    def run_init(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python", str(SCRIPT), "init", "--root", str(root), "--json"],
            text=True,
            capture_output=True,
            check=False,
        )

    def write_topic(self, root: Path, records: list[dict[str, object]]) -> Path:
        topic = root / ".plan" / "demo"
        topic.mkdir(parents=True, exist_ok=True)
        write_jsonl(topic / "requirements.nodes.jsonl", records)
        (topic / "receipts.jsonl").write_text("", encoding="utf-8")
        return topic

    def test_init_creates_durable_requirements_document(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = self.run_init(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["ok"])
            self.assertTrue(payload["created"])
            self.assertEqual(payload["path"], "docs/requirements.md")
            durable = root / "docs" / "requirements.md"
            self.assertTrue(durable.exists())
            text = durable.read_text(encoding="utf-8")
            self.assertIn("# Requirements", text)
            self.assertIn("## Purpose", text)
            self.assertIn("## Requirements", text)
            self.assertIn("durable requirements folded from accepted Cartographer topic deltas", text)

    def test_init_is_idempotent_and_preserves_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            durable = root / "docs" / "requirements.md"
            durable.parent.mkdir(parents=True)
            original = "# Requirements\n\nCustom durable requirements.\n"
            durable.write_text(original, encoding="utf-8")

            result = self.run_init(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["ok"])
            self.assertFalse(payload["created"])
            self.assertEqual(payload["path"], "docs/requirements.md")
            self.assertEqual(payload["reason"], "exists")
            self.assertEqual(durable.read_text(encoding="utf-8"), original)

    def test_fold_add_modify_remove_and_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(self.run_init(root).returncode, 0)
            self.write_topic(
                root,
                [
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Add durable requirement",
                        "statement": "The system MUST persist folded requirements.",
                        "change_type": "ADDED",
                        "domain": "workflow",
                        "priority": "must",
                        "status": "accepted",
                    },
                    {"id": "SCN-DEMO-001", "type": "scenario", "title": "Fold path", "requirement_id": "REQ-DEMO-001"},
                ],
            )
            result = self.run_helper(root, "fold", "--receipt-id", "receipt:test")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            durable = (root / "docs" / "requirements.md").read_text(encoding="utf-8")
            self.assertIn("### REQ-DEMO-001", durable)
            self.assertIn("SCN-DEMO-001", durable)
            self.assertIn("receipt:test", durable)
            receipts = (root / ".plan" / "demo" / "receipts.jsonl").read_text(encoding="utf-8")
            self.assertIn('"type":"requirements-fold"', receipts)

            self.write_topic(
                root,
                [
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Modified durable requirement",
                        "statement": "The system SHOULD update folded requirements deterministically.",
                        "change_type": "MODIFIED",
                        "domain": "workflow",
                        "priority": "should",
                        "status": "accepted",
                    }
                ],
            )
            self.assertEqual(self.run_helper(root, "fold").returncode, 0)
            durable = (root / "docs" / "requirements.md").read_text(encoding="utf-8")
            self.assertIn("Modified durable requirement", durable)
            self.assertNotIn("Add durable requirement", durable)

            self.write_topic(
                root,
                [
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Removed durable requirement",
                        "statement": "Removed but retained as durable tombstone.",
                        "change_type": "REMOVED",
                        "domain": "workflow",
                        "priority": "must",
                        "status": "removed",
                    }
                ],
            )
            self.assertEqual(self.run_helper(root, "fold").returncode, 0)
            durable = (root / "docs" / "requirements.md").read_text(encoding="utf-8")
            self.assertIn("- Status: removed", durable)

    def test_fold_rename_and_split_domain(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir(parents=True)
            (root / "docs" / "requirements.md").write_text(
                "# Requirements\n\n### REQ-OLD-001 — Old name\n\nOld statement.\n\n", encoding="utf-8"
            )
            self.write_topic(
                root,
                [
                    {
                        "id": "REQ-DEMO-002",
                        "type": "requirement",
                        "title": "Renamed requirement",
                        "statement": "The system MUST preserve rename provenance.",
                        "change_type": "RENAMED",
                        "renamed_from": "REQ-OLD-001",
                        "domain": "Runtime UX",
                        "priority": "must",
                        "status": "accepted",
                    }
                ],
            )
            result = self.run_helper(root, "fold", "--split-domain")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            split = root / "docs" / "requirements" / "runtime-ux.md"
            self.assertTrue(split.exists())
            text = split.read_text(encoding="utf-8")
            self.assertIn("### REQ-DEMO-002", text)
            self.assertIn("Renamed from: REQ-OLD-001", text)

    def test_validate_fold_requires_receipt_or_skip_and_detects_duplicates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_topic(
                root,
                [
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Needs fold",
                        "statement": "The system MUST require fold receipts.",
                        "change_type": "ADDED",
                        "domain": "workflow",
                        "priority": "must",
                        "status": "accepted",
                    }
                ],
            )
            result = self.run_helper(root, "validate-fold")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requirements-fold receipt", result.stdout)

            topic = root / ".plan" / "demo"
            write_jsonl(
                topic / "receipts.jsonl",
                [{"id": "skip", "type": "requirements-fold-skip", "status": "approved", "summary": "test"}],
            )
            self.assertEqual(self.run_helper(root, "validate-fold").returncode, 0)

            (root / "docs" / "requirements").mkdir(parents=True)
            (root / "docs" / "requirements.md").write_text(
                "# Requirements\n\n### REQ-DUP-001 — A\n\n", encoding="utf-8"
            )
            (root / "docs" / "requirements" / "workflow.md").write_text(
                "# Requirements\n\n### REQ-DUP-001 — B\n\n", encoding="utf-8"
            )
            result = self.run_helper(root, "validate-fold")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Duplicate durable requirement IDs", result.stdout)


if __name__ == "__main__":
    unittest.main()
