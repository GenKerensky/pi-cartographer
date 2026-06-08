from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/validation_runner.py"


class ValidationRunnerTests(unittest.TestCase):
    def run_runner(self, project: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(project), *args, "--json"],
            text=True,
            capture_output=True,
            check=check,
        )

    def test_pass_receipt_and_skip_when_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            project.mkdir(exist_ok=True)
            (project / "README.md").write_text("hello\n", encoding="utf-8")
            receipts = project / ".plan/demo/receipts.jsonl"
            marker = project / "marker.txt"
            command = f"{sys.executable} -c \"from pathlib import Path; Path('marker.txt').write_text('x')\""

            first = self.run_runner(
                project,
                "--command",
                command,
                "--phase-id",
                "P1",
                "--validation-id",
                "P1.V1",
                "--receipt-file",
                str(receipts),
            )
            first_payload = json.loads(first.stdout)
            self.assertEqual(first_payload["status"], "passed")
            self.assertTrue(marker.exists())

            second = self.run_runner(
                project,
                "--command",
                command,
                "--phase-id",
                "P1",
                "--validation-id",
                "P1.V1",
                "--receipt-file",
                str(receipts),
                "--skip-if-unchanged",
            )
            second_payload = json.loads(second.stdout)
            self.assertEqual(second_payload["status"], "skipped")
            self.assertEqual(second_payload["previous_receipt"], first_payload["id"])
            records = [json.loads(line) for line in receipts.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(records), 2)

    def test_failure_receipt_returns_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            receipts = project / "receipts.jsonl"
            result = self.run_runner(
                project,
                "--command",
                f"{sys.executable} -c \"import sys; print('bad'); sys.exit(2)\"",
                "--phase-id",
                "P2",
                "--receipt-file",
                str(receipts),
                check=False,
            )
            self.assertEqual(result.returncode, 2)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "failed")
            self.assertEqual(payload["exit_code"], 2)
            self.assertEqual(payload["decision"], "parent-review-required-after-validation-failure")
            self.assertTrue(payload["fallback_required"])

    def test_timeout_receipt_includes_fallback_decision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            receipts = project / "receipts.jsonl"
            result = self.run_runner(
                project,
                "--command",
                f'{sys.executable} -c "import time; time.sleep(2)"',
                "--phase-id",
                "P4",
                "--receipt-file",
                str(receipts),
                "--timeout-sec",
                "0.1",
                check=False,
            )
            self.assertEqual(result.returncode, 124)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "timed-out")
            self.assertEqual(payload["decision"], "parent-review-required-after-timeout")
            self.assertTrue(payload["fallback_required"])

    def test_large_output_uses_full_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            receipts = project / "receipts.jsonl"
            logs = project / "logs"
            result = self.run_runner(
                project,
                "--command",
                f"{sys.executable} -c \"print('x' * 2000)\"",
                "--phase-id",
                "P3",
                "--receipt-file",
                str(receipts),
                "--max-output-chars",
                "40",
                "--full-output-dir",
                str(logs),
            )
            payload = json.loads(result.stdout)
            self.assertTrue(payload["truncated"])
            self.assertIn("full_output_path", payload)
            self.assertTrue(Path(payload["full_output_path"]).exists())
            self.assertNotIn("x" * 2000, result.stdout)


if __name__ == "__main__":
    unittest.main()
