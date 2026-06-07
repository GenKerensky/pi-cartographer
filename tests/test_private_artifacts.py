from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/private_artifacts.py"


class PrivateArtifactsTests(unittest.TestCase):
    def run_script(self, *args: str, cwd: Path | None = None) -> dict:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *args, "--json"],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_import_copies_without_printing_contents_and_writes_manifests(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            source = Path(tmp) / "secret-log.txt"
            source.write_text("super secret token should not appear in stdout\n", encoding="utf-8")

            payload = self.run_script(
                "import",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--input",
                str(source),
            )

            self.assertTrue(payload["ok"])
            stdout_text = json.dumps(payload)
            self.assertNotIn("super secret token", stdout_text)
            private_file = project / ".plan/_private/demo/secret-log.txt"
            public_manifest = project / ".plan/demo/evidence/manifest.jsonl"
            private_manifest = project / ".plan/_private/demo/manifest.private.jsonl"
            self.assertTrue(private_file.exists())
            self.assertTrue(public_manifest.exists())
            self.assertTrue(private_manifest.exists())
            public_record = json.loads(public_manifest.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(public_record["basename"], "secret-log.txt")
            self.assertEqual(public_record["redaction_status"], "pending")
            self.assertIn(".plan/_private/demo/secret-log.txt", public_record["private_path_hint"])
            self.assertNotIn("super secret token", public_manifest.read_text(encoding="utf-8"))

    def test_opaque_names_and_hash_opt_in(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            source = Path(tmp) / "Sensitive Customer Name.log"
            source.write_text("hello\n", encoding="utf-8")

            self.run_script(
                "import",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--input",
                str(source),
                "--basename-mode",
                "opaque",
                "--hash",
            )

            self.assertTrue((project / ".plan/_private/demo/artifact-001.log").exists())
            private_record = json.loads(
                (project / ".plan/_private/demo/manifest.private.jsonl").read_text(encoding="utf-8").splitlines()[0]
            )
            public_record = json.loads(
                (project / ".plan/demo/evidence/manifest.jsonl").read_text(encoding="utf-8").splitlines()[0]
            )
            self.assertIn("sha256", private_record)
            self.assertNotIn("sha256", public_record)
            self.assertEqual(public_record["basename"], "artifact-001.log")

    def test_move_refuses_tracked_repo_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            subprocess.run(["git", "init"], cwd=project, check=True, stdout=subprocess.DEVNULL)
            tracked = project / "tracked-log.txt"
            tracked.write_text("tracked\n", encoding="utf-8")
            subprocess.run(["git", "add", "tracked-log.txt"], cwd=project, check=True, stdout=subprocess.DEVNULL)

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "import",
                    "--root",
                    str(project),
                    "--topic",
                    "demo",
                    "--input",
                    str(tracked),
                    "--move",
                    "--json",
                ],
                text=True,
                capture_output=True,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Refusing to move tracked file", result.stderr + result.stdout)
            self.assertTrue(tracked.exists())

    def test_list_manifest_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            source = Path(tmp) / "log.txt"
            source.write_text("hello\n", encoding="utf-8")
            self.run_script("import", "--root", str(project), "--topic", "demo", "--input", str(source))

            payload = self.run_script("list", "--root", str(project), "--topic", "demo")
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["records"][0]["basename"], "log.txt")


if __name__ == "__main__":
    unittest.main()
