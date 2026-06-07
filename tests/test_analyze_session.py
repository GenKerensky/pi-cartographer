from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/analyze_session.py"


class AnalyzeSessionTests(unittest.TestCase):
    def test_analyzes_synthetic_session_without_raw_payload_leak(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            session = tmp_path / "session.jsonl"
            secret = "ghp_" + "123456789012345678901234567890123456"
            records = [
                {"role": "user", "content": "please do work"},
                {
                    "role": "assistant",
                    "content": "I will run validation",
                    "usage": {"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 7},
                    "duration_ms": 1200,
                },
                {
                    "type": "tool_result",
                    "tool_name": "bash",
                    "stdout": "safe output\n" + secret + "\n" + ("x" * 2000),
                    "duration_ms": 50,
                    "exitCode": 0,
                    "command": "npm run check -- --token " + secret,
                },
                {
                    "type": "tool_result",
                    "tool_name": "bash",
                    "stderr": "boom",
                    "duration_ms": 20,
                    "exitCode": 1,
                    "command": "npm run check -- --token " + secret,
                },
                {"type": "subagent", "agent": "reviewer", "timedOut": True, "message": "Run timed out after 120000ms"},
                {"type": "compaction", "summary": "compacted conversation"},
            ]
            session.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")
            report = tmp_path / "analysis.md"
            summary = tmp_path / "analysis.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--input",
                    str(session),
                    "--out",
                    str(report),
                    "--json-out",
                    str(summary),
                    "--json",
                ],
                text=True,
                capture_output=True,
                check=True,
            )

            receipt = json.loads(result.stdout)
            self.assertTrue(receipt["ok"])
            self.assertEqual(receipt["entries"], 6)
            self.assertEqual(receipt["compactions"], 1)
            stdout_report_and_json = (
                result.stdout + report.read_text(encoding="utf-8") + summary.read_text(encoding="utf-8")
            )
            self.assertNotIn(secret, stdout_report_and_json)
            self.assertNotIn("x" * 2000, stdout_report_and_json)
            summary_payload = json.loads(summary.read_text(encoding="utf-8"))
            self.assertEqual(summary_payload["roles"]["assistant"], 1)
            self.assertGreaterEqual(summary_payload["tools"].get("bash", 0), 2)
            self.assertEqual(summary_payload["tool_errors"]["bash"], 1)
            self.assertEqual(summary_payload["token_totals"]["input_tokens"], 10)
            self.assertEqual(summary_payload["subagent_timeouts"][0]["agent"], "reviewer")
            self.assertEqual(summary_payload["repeated_commands"][0]["command_id"], "command-001")
            self.assertNotIn("command", summary_payload["repeated_commands"][0])

    def test_invalid_lines_are_counted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            session = tmp_path / "session.jsonl"
            session.write_text('{"role":"user","content":"ok"}\nnot-json\n', encoding="utf-8")
            report = tmp_path / "analysis.md"

            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--input", str(session), "--out", str(report), "--json"],
                text=True,
                capture_output=True,
                check=True,
            )

            receipt = json.loads(result.stdout)
            self.assertEqual(receipt["entries"], 2)
            self.assertEqual(receipt["invalid_lines"], 1)


if __name__ == "__main__":
    unittest.main()
