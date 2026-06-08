from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/workflow_benchmark.py"


class WorkflowBenchmarkTests(unittest.TestCase):
    def test_computes_receipt_and_context_pack_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = project / ".plan/demo"
            topic_dir.mkdir(parents=True)
            (topic_dir / "plan.nodes.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps({"id": "phase:P0", "type": "phase", "phase_id": "P0"}),
                        json.dumps({"id": "phase:P1", "type": "phase", "phase_id": "P1"}),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "receipts.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "id": "receipt:P0",
                                "type": "validation-receipt",
                                "phase_id": "P0",
                                "status": "passed",
                                "commands": [{"command": "npm run check", "result": "passed"}],
                                "summary": "ok",
                            }
                        ),
                        json.dumps(
                            {
                                "id": "receipt:P1",
                                "type": "validation-receipt",
                                "phase_id": "P1",
                                "status": "timed-out",
                                "timedOut": True,
                                "summary": "timeout",
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "context-packs.jsonl").write_text(
                json.dumps({"id": "context:P0", "type": "context-pack", "phase_id": "P0", "summary": "ctx"}) + "\n",
                encoding="utf-8",
            )
            session_summary = project / "session-summary.json"
            session_summary.write_text(
                json.dumps({"entries": 5, "subagent_timeouts": [{"line": 1}], "largest_outputs": [{"line": 2}]}) + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--root",
                    str(project),
                    "--topic",
                    "demo",
                    "--session-summary",
                    str(session_summary),
                    "--json",
                ],
                text=True,
                capture_output=True,
                check=True,
            )
            payload = json.loads(result.stdout)
            self.assertEqual(payload["phase_count"], 2)
            self.assertEqual(payload["receipt_phase_coverage"], 1.0)
            self.assertEqual(payload["context_pack_phase_coverage"], 0.5)
            self.assertEqual(payload["full_check_command_count"], 1)
            self.assertEqual(payload["timeout_receipts"], 1)
            self.assertEqual(payload["session_entries"], 5)


if __name__ == "__main__":
    unittest.main()
