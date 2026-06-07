from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/manage_jsonl.ts"


class ManageJsonlTests(unittest.TestCase):
    def run_script(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--experimental-strip-types", str(SCRIPT), *args], text=True, capture_output=True, check=True
        )

    def test_upsert_and_validate_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nodes.jsonl"
            first = {"id": "N1", "type": "thing", "title": "Old"}
            second = {"id": "N1", "description": "Merged"}

            result = self.run_script("upsert", "--file", str(path), "--record", json.dumps(first), "--json")
            self.assertEqual(json.loads(result.stdout)["action"], "inserted")
            result = self.run_script("upsert", "--file", str(path), "--record", json.dumps(second), "--json")
            self.assertEqual(json.loads(result.stdout)["action"], "updated")

            records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(records, [{"description": "Merged", "id": "N1", "title": "Old", "type": "thing"}])
            validation = json.loads(
                self.run_script("validate-file", "--file", str(path), "--require-id", "--json").stdout
            )
            self.assertTrue(validation["ok"])

    def test_validate_lifecycle_verification_and_misses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            nodes = root / "nodes.jsonl"
            nodes.write_text(
                "\n".join(
                    [
                        json.dumps({"id": "N1", "type": "artifact", "lifecycle": "bogus"}),
                        json.dumps({"id": "N2", "type": "file", "verified": True}),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            validation = subprocess.run(
                [
                    "node",
                    "--experimental-strip-types",
                    str(SCRIPT),
                    "validate-file",
                    "--file",
                    str(nodes),
                    "--json",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(validation.returncode, 0)
            report = json.loads(validation.stdout)
            self.assertFalse(report["ok"])
            self.assertTrue(any("Invalid lifecycle" in error for error in report["errors"]))
            self.assertTrue(any("verified=true" in error for error in report["errors"]))

            miss_dir = root / ".plan/_retrieval"
            miss_dir.mkdir(parents=True)
            (miss_dir / "misses.jsonl").write_text(
                json.dumps(
                    {
                        "id": "miss:1",
                        "created_at": "2026-06-07T00:00:00+00:00",
                        "original_query": "config",
                        "failure_type": "vocabulary_mismatch",
                        "resolution": "query_expansion",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            valid_lifecycle = root / "valid-lifecycle.jsonl"
            valid_lifecycle.write_text(
                "\n".join(
                    [
                        json.dumps({"id": "A1", "type": "artifact", "lifecycle": "implemented"}),
                        json.dumps(
                            {
                                "id": "A2",
                                "type": "artifact",
                                "lifecycle": "superseded",
                                "used_as": "implementation_guidance",
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            lifecycle_report = json.loads(
                self.run_script("validate-file", "--file", str(valid_lifecycle), "--json").stdout
            )
            self.assertTrue(lifecycle_report["ok"])
            self.assertTrue(any("stale/unverified rationale" in warning for warning in lifecycle_report["warnings"]))

            miss_report = json.loads(self.run_script("validate-misses", "--root", str(root), "--json").stdout)
            self.assertTrue(miss_report["ok"])
            listed = json.loads(self.run_script("list-misses", "--root", str(root), "--json").stdout)
            self.assertEqual(listed["count"], 1)

            with (miss_dir / "misses.jsonl").open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"id": "miss:2", "failure_type": "bad", "text": "raw"}) + "\n")
            invalid = subprocess.run(
                [
                    "node",
                    "--experimental-strip-types",
                    str(SCRIPT),
                    "validate-misses",
                    "--root",
                    str(root),
                    "--json",
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(invalid.returncode, 0)
            invalid_report = json.loads(invalid.stdout)
            self.assertTrue(any("Invalid failure_type" in error for error in invalid_report["errors"]))
            self.assertTrue(any("Raw snippet" in error for error in invalid_report["errors"]))

    def test_validate_topic_checks_fact_support(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            topic = root / ".plan/demo"
            topic.mkdir(parents=True)
            (root / "README.md").write_text("hello\n", encoding="utf-8")
            (topic / "proposal.md").write_text("# Demo\n\nUses [F001].\n", encoding="utf-8")
            (topic / "map.nodes.jsonl").write_text(
                json.dumps({"id": "topic:demo", "type": "topic", "title": "Demo"}) + "\n", encoding="utf-8"
            )
            (topic / "map.edges.jsonl").write_text("", encoding="utf-8")
            (topic / "facts.nodes.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps({"id": "S001", "type": "source", "title": "Readme", "reference": "README.md:1"}),
                        json.dumps({"id": "F001", "type": "fact", "title": "Fact"}),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            (topic / "facts.edges.jsonl").write_text(
                json.dumps({"from": "F001", "to": "S001", "type": "supported_by"}) + "\n", encoding="utf-8"
            )

            report = json.loads(
                self.run_script("validate-topic", "--root", str(root), "--topic", "demo", "--json").stdout
            )
            self.assertTrue(report["ok"])
            self.assertEqual(report["counts"]["fact_nodes"], 2)


if __name__ == "__main__":
    unittest.main()
