from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/validate_planning_graph.py"


class PlanningGraphValidatorTests(unittest.TestCase):
    def run_validator(self, project: Path, topic: str = "demo") -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(project), "--topic", topic],
            text=True,
            capture_output=True,
        )

    def write_valid_project(self, root: Path) -> Path:
        topic_dir = root / ".plan/demo"
        topic_dir.mkdir(parents=True)
        (root / "src").mkdir()
        (root / "src/app.ts").write_text("export const value = 1;\n", encoding="utf-8")
        (topic_dir / "map.nodes.jsonl").write_text(
            "\n".join(
                [
                    json.dumps({"id": "topic:demo", "type": "topic", "title": "demo", "description": "Demo"}),
                    json.dumps(
                        {
                            "id": "file:src/app.ts",
                            "type": "file",
                            "title": "app",
                            "description": "App",
                            "reference": "src/app.ts:1",
                        }
                    ),
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        (topic_dir / "map.edges.jsonl").write_text(
            json.dumps({"from": "topic:demo", "to": "file:src/app.ts", "type": "relevant_to"}) + "\n",
            encoding="utf-8",
        )
        (topic_dir / "facts.nodes.jsonl").write_text(
            "\n".join(
                [
                    json.dumps({"id": "S001", "type": "source", "title": "Docs", "url": "https://example.com"}),
                    json.dumps({"id": "F001", "type": "fact", "title": "Fact", "claim": "Claim"}),
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        (topic_dir / "facts.edges.jsonl").write_text(
            json.dumps({"from": "F001", "to": "S001", "type": "supported_by"}) + "\n",
            encoding="utf-8",
        )
        (topic_dir / "plan.md").write_text(
            """# demo Plan

## Phases

### Phase P0 — Setup

- **Status:** pending
- **Depends on:** none
- **Primary references:** `file:src/app.ts`, [F001]

#### Objective
Set up the feature.

#### Checklist
- [ ] **P0.T1** Create the base module.

#### Validation
- [ ] **P0.V1** Run manual check.

### Phase P1 — Finish

- **Status:** pending
- **Depends on:** P0
- **Primary references:** `file:src/app.ts`, [F001]

#### Objective
Finish the feature.

#### Checklist
- [ ] **P1.T1** Wire the base module.

#### Validation
- [ ] **P1.V1** Run final manual check.
""",
            encoding="utf-8",
        )
        (topic_dir / "plan.nodes.jsonl").write_text(
            "\n".join(
                [
                    json.dumps({"id": "plan:demo", "type": "plan", "title": "demo Plan"}),
                    json.dumps({"id": "phase:P0", "type": "phase", "phase_id": "P0", "status": "pending"}),
                    json.dumps({"id": "task:P0.T1", "type": "task", "task_id": "P0.T1", "phase_id": "P0"}),
                    json.dumps(
                        {
                            "id": "validation:P0.V1",
                            "type": "validation",
                            "validation_id": "P0.V1",
                            "phase_id": "P0",
                        }
                    ),
                    json.dumps({"id": "phase:P1", "type": "phase", "phase_id": "P1", "status": "pending"}),
                    json.dumps({"id": "task:P1.T1", "type": "task", "task_id": "P1.T1", "phase_id": "P1"}),
                    json.dumps(
                        {
                            "id": "validation:P1.V1",
                            "type": "validation",
                            "validation_id": "P1.V1",
                            "phase_id": "P1",
                        }
                    ),
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        (topic_dir / "plan.edges.jsonl").write_text(
            "\n".join(
                [
                    json.dumps({"from": "plan:demo", "to": "phase:P0", "type": "contains"}),
                    json.dumps({"from": "plan:demo", "to": "phase:P1", "type": "contains"}),
                    json.dumps({"from": "phase:P1", "to": "phase:P0", "type": "depends_on"}),
                    json.dumps({"from": "phase:P0", "to": "task:P0.T1", "type": "contains"}),
                    json.dumps({"from": "phase:P0", "to": "validation:P0.V1", "type": "contains"}),
                    json.dumps({"from": "phase:P1", "to": "task:P1.T1", "type": "contains"}),
                    json.dumps({"from": "phase:P1", "to": "validation:P1.V1", "type": "contains"}),
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        return topic_dir

    def test_valid_plan_graph_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            self.write_valid_project(project)
            result = self.run_validator(project)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("Planning graph validation passed", result.stdout)

    def test_lifecycle_verification_and_miss_errors_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            nodes_path = topic_dir / "map.nodes.jsonl"
            with nodes_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"id": "artifact:bad", "type": "artifact", "lifecycle": "bogus"}) + "\n")
                handle.write(json.dumps({"id": "file:src/verified.ts", "type": "file", "verified": True}) + "\n")
            miss_dir = project / ".plan/_retrieval"
            miss_dir.mkdir(parents=True)
            (miss_dir / "misses.jsonl").write_text(
                json.dumps({"id": "miss:1", "failure_type": "bad", "text": "raw"}) + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Invalid lifecycle", result.stdout)
            self.assertIn("verified=true", result.stdout)
            self.assertIn("Invalid failure_type", result.stdout)
            self.assertIn("Raw snippet", result.stdout)

    def test_missing_fact_citation_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            plan = topic_dir / "plan.md"
            plan.write_text(plan.read_text(encoding="utf-8").replace("[F001]", "[F999]"), encoding="utf-8")
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("missing fact [F999]", result.stdout)

    def test_late_phase_dependency_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            plan = topic_dir / "plan.md"
            plan.write_text(
                plan.read_text(encoding="utf-8").replace("- **Depends on:** none", "- **Depends on:** P1"),
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("not earlier in the plan", result.stdout)

    def test_missing_plan_graph_node_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            nodes_path = topic_dir / "plan.nodes.jsonl"
            nodes = [json.loads(line) for line in nodes_path.read_text(encoding="utf-8").splitlines()]
            nodes = [node for node in nodes if node["id"] != "task:P1.T1"]
            nodes_path.write_text("\n".join(json.dumps(node) for node in nodes) + "\n", encoding="utf-8")
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Missing plan graph node task:P1.T1", result.stdout)


if __name__ == "__main__":
    unittest.main()
