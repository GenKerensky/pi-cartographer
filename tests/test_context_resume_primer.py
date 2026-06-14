import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "plan" / "scripts" / "cartographer_state.ts"
FIXTURE = ROOT / "tests" / "fixtures" / "context_resume" / "repeated_compaction.json"


class ContextResumePrimerTests(unittest.TestCase):
    def run_state(self, root: Path, *args: str) -> dict:
        result = subprocess.run(
            ["node", "--experimental-strip-types", str(SCRIPT), *args, "--json"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def make_project(self, root: Path) -> None:
        topic = root / ".plan" / "demo"
        topic.mkdir(parents=True)
        (topic / "plan.md").write_text("# demo Plan\n", encoding="utf-8")
        (topic / "plan.nodes.jsonl").write_text(
            "\n".join(
                json.dumps(record)
                for record in [
                    {"id": "phase:P0", "type": "phase", "phase_id": "P0", "title": "Build", "status": "in-progress"},
                    {"id": "task:P0.T1", "type": "task", "task_id": "P0.T1", "phase_id": "P0", "title": "Inspect"},
                    {
                        "id": "validation:P0.V1",
                        "type": "validation",
                        "validation_id": "P0.V1",
                        "phase_id": "P0",
                        "title": "Check",
                    },
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        (topic / "plan.edges.jsonl").write_text("", encoding="utf-8")
        (topic / "receipts.jsonl").write_text(
            json.dumps({"id": "receipt:P0", "type": "validation-receipt", "status": "passed"}) + "\n",
            encoding="utf-8",
        )
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        (topic / "context-packs.jsonl").write_text(
            "".join(json.dumps(record) + "\n" for record in fixture["contextPacks"]),
            encoding="utf-8",
        )
        (root / "README.md").write_text("fixture\n", encoding="utf-8")

    def test_resume_primer_is_read_only_bounded_and_contains_required_fields(self) -> None:
        with tempfile.TemporaryDirectory(prefix="context-resume-primer-") as tmp:
            project = Path(tmp)
            self.make_project(project)
            self.run_state(project, "state-init", "--root", str(project), "--topic", "demo")
            self.run_state(
                project,
                "state-set-next",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--next-action-json",
                json.dumps(
                    {
                        "id": "next:P0.T1",
                        "kind": "inspect",
                        "summary": "Inspect README and phase receipts before editing.",
                        "phase_id": "P0",
                        "task_id": "P0.T1",
                        "files_to_inspect": ["README.md", ".plan/demo/plan.md"],
                    }
                ),
            )
            self.run_state(
                project,
                "state-set-working-set",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--working-set-json",
                json.dumps(
                    {
                        "write_allowed": [{"path": "README.md", "reason": "fixture edit"}],
                        "read_only": [{"path": ".plan/demo/plan.md", "reason": "authoritative plan"}],
                        "forbidden": [{"path": ".plan/_private/**", "reason": "private"}],
                    }
                ),
            )
            fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
            for record in fixture["journals"]:
                self.run_state(
                    project,
                    "journal-append",
                    "--root",
                    str(project),
                    "--topic",
                    "demo",
                    "--record-json",
                    json.dumps(record),
                )

            state_path = project / ".cartographer" / "demo" / "state.json"
            journal_path = project / ".cartographer" / "demo" / "journal.jsonl"
            before = (state_path.read_text(encoding="utf-8"), journal_path.read_text(encoding="utf-8"))
            payload = self.run_state(
                project,
                "resume-primer",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--max-chars",
                "1600",
                "--max-journal",
                "3",
            )
            after = (state_path.read_text(encoding="utf-8"), journal_path.read_text(encoding="utf-8"))

            self.assertTrue(payload["ok"])
            self.assertTrue(payload["read_only"])
            self.assertEqual(before, after)
            self.assertLessEqual(payload["chars"], 1600)
            primer = payload["primer"]
            self.assertIn("<CARTOGRAPHER_RESUME_PRIMER", primer)
            self.assertIn("Topic: demo", primer)
            self.assertIn("Next action", primer)
            self.assertIn("Working set", primer)
            self.assertIn("Critical rules", primer)
            self.assertIn("First post-compaction response", primer)
            self.assertNotIn(".plan/_private/demo", primer)


if __name__ == "__main__":
    unittest.main()
