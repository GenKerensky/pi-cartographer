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

    def test_requirements_graph_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            (topic_dir / "requirements.md").write_text(
                "# Requirements\n\n## ADDED Requirements\n\nImplements [REQ-DEMO-001] and [SCN-DEMO-001].\n",
                encoding="utf-8",
            )
            (topic_dir / "design.md").write_text("# Design\n\nSatisfies [REQ-DEMO-001].\n", encoding="utf-8")
            (topic_dir / "requirements.nodes.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "id": "REQ-DEMO-001",
                                "type": "requirement",
                                "title": "Demo requirement",
                                "statement": "The system MUST validate requirements.",
                                "change_type": "ADDED",
                                "domain": "demo",
                                "priority": "must",
                                "status": "accepted",
                                "scenario_refs": ["SCN-DEMO-001"],
                                "fact_refs": ["F001"],
                                "source_refs": ["S001"],
                                "durable_refs": ["docs/requirements.md#demo"],
                            }
                        ),
                        json.dumps(
                            {
                                "id": "SCN-DEMO-001",
                                "type": "scenario",
                                "title": "Happy path",
                                "requirement_id": "REQ-DEMO-001",
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "requirements.edges.jsonl").write_text(
                json.dumps({"from": "REQ-DEMO-001", "to": "F001", "type": "supported_by"})
                + "\n"
                + json.dumps({"from": "REQ-DEMO-001", "to": "docs/requirements.md#demo", "type": "folds_into"})
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "plan.md").write_text(
                (topic_dir / "plan.md")
                .read_text(encoding="utf-8")
                .replace(
                    "#### Validation\n- [ ] **P1.V1** Run final manual check.\n",
                    "#### Validation\n- [ ] **P1.V1** Run final manual check. Testing Strategy Trace: covers REQ-DEMO-001 and SCN-DEMO-001; layer E2E; command `python -m unittest tests.test_demo`; concrete artifact tests/test_demo.py.\n",
                )
                + "\n## Requirement Test Coverage Matrix\n\n| Requirement / Scenario | Validation |\n| --- | --- |\n| REQ-DEMO-001 | P1.V1 |\n| SCN-DEMO-001 | P1.V1 |\n",
                encoding="utf-8",
            )
            (topic_dir / "design.md").write_text(
                "# Design\n\n## Decision One\n\nSatisfies [REQ-DEMO-001].\n\n## Testing Strategy\n\nLanguage: Python. App type: CLI. Existing test tools: unittest. Docs consulted: Python unittest docs. Unit strategy: focused functions. Integration strategy: temp filesystem command boundaries. E2E strategy: run one CLI smoke. Related ADR notes: none found. Requirement/scenario coverage: REQ-DEMO-001 and SCN-DEMO-001 map to P1.V1.\n\n## Alternative One\n\nRejected.\n",
                encoding="utf-8",
            )
            (topic_dir / "design.nodes.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "id": "DES-DEC-001",
                                "type": "design-decision",
                                "status": "accepted",
                                "title": "Decision one",
                                "summary": "Use the validated path.",
                                "source": "design.md#decision-one",
                                "requirement_refs": ["REQ-DEMO-001"],
                                "fact_refs": ["F001"],
                                "fast_follow_refs": ["implemented_by"],
                            }
                        ),
                        json.dumps(
                            {
                                "id": "DES-ALT-001",
                                "type": "design-alternative",
                                "status": "rejected",
                                "title": "Alternative one",
                                "summary": "Do not use this path.",
                                "source": "design.md#alternative-one",
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "design.edges.jsonl").write_text(
                json.dumps({"from": "DES-DEC-001", "to": "REQ-DEMO-001", "type": "satisfies"})
                + "\n"
                + json.dumps({"from": "DES-DEC-001", "to": "F001", "type": "supported_by"})
                + "\n"
                + json.dumps({"from": "DES-ALT-001", "to": "DES-DEC-001", "type": "alternative_to"})
                + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            (topic_dir / "design.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "DES-DEC-002",
                        "type": "design-decision",
                        "status": "accepted",
                        "title": "Orphan",
                        "summary": "No requirement.",
                        "source": {},
                        "requirement_refs": ["REQ-MISSING"],
                        "fact_refs": ["F999"],
                        "infrastructure_only_rationale": True,
                        "evidence": ".plan/_private/demo/raw.log",
                    }
                )
                + "\n"
                + json.dumps(
                    {
                        "id": "DES-ALT-002",
                        "type": "design-alternative",
                        "status": "rejected",
                        "title": "Bad source",
                        "summary": "Invalid source format.",
                        "source": "README.md:1",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "design.edges.jsonl").write_text(
                json.dumps({"from": "DES-DEC-002", "to": "REQ-MISSING", "type": "satisfies"}) + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            for expected in [
                "Accepted design decision DES-DEC-002 must satisfy",
                "non-empty infrastructure_only_rationale",
                "references missing requirement",
                "references missing fact",
                "must be a non-empty string using design.md#heading",
                "must use design.md#heading",
                "Direct private artifact reference",
                "Unresolved to endpoint",
            ]:
                self.assertIn(expected, result.stdout)

            (topic_dir / "design.nodes.jsonl").unlink()
            (topic_dir / "design.edges.jsonl").unlink()
            (topic_dir / "design.md").write_text("# Design\n\nMissing [REQ-DEMO-999].\n", encoding="utf-8")
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("missing requirement/scenario [REQ-DEMO-999]", result.stdout)

            (topic_dir / "design.md").write_text("# Design\n\nSatisfies [REQ-DEMO-001].\n", encoding="utf-8")
            (topic_dir / "requirements.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "req-demo-001",
                        "type": "requirement",
                        "title": "Bad requirement",
                        "statement": "Invalid refs",
                        "change_type": "CHANGED",
                        "domain": "demo",
                        "priority": "must",
                        "status": "accepted",
                        "scenario_refs": ["SCN-MISSING"],
                        "fact_refs": ["F999"],
                        "source_refs": ["S999"],
                        "durable_refs": ["docs/requirements/bad path.md"],
                        "evidence": ".plan/_private/demo/raw.log",
                    }
                )
                + "\n"
                + json.dumps(
                    {"id": "SCN-DEMO-001", "type": "scenario", "title": "Happy path", "requirement_id": "REQ-MISSING"}
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "requirements.edges.jsonl").write_text(
                json.dumps({"from": "REQ-DEMO-001", "to": "docs/requirements/bad path.md", "type": "folds_into"})
                + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            for expected in [
                "Invalid requirement id",
                "Invalid change_type",
                "references missing scenario",
                "references missing fact",
                "references missing source",
                "invalid durable ref",
                "Direct private artifact reference",
                "Unresolved to endpoint",
            ]:
                self.assertIn(expected, result.stdout)

    def test_interview_graph_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            (topic_dir / "requirements.md").write_text("# Requirements\n\nUses [REQ-DEMO-001].\n", encoding="utf-8")
            (topic_dir / "plan.md").write_text(
                (topic_dir / "plan.md")
                .read_text(encoding="utf-8")
                .replace(
                    "#### Validation\n- [ ] **P1.V1** Run final manual check.\n",
                    "#### Validation\n- [ ] **P1.V1** Run final manual check. Testing Strategy Trace: covers REQ-DEMO-001; layer E2E; command `python -m unittest tests.test_demo`; concrete artifact tests/test_demo.py.\n",
                )
                + "\n## Requirement Test Coverage Matrix\n\n| Requirement / Scenario | Validation |\n| --- | --- |\n| REQ-DEMO-001 | P1.V1 |\n",
                encoding="utf-8",
            )
            (topic_dir / "design.md").write_text(
                "# Design\n\n## Decision One\n\nSatisfies [REQ-DEMO-001].\n\n## Testing Strategy\n\nLanguage: Python. App type: CLI. Existing test tools: unittest. Docs consulted: Python unittest docs. Unit strategy: focused functions. Integration strategy: temp filesystem command boundaries. E2E strategy: run one CLI smoke. Related ADR notes: none found. Requirement/scenario coverage: REQ-DEMO-001 maps to P1.V1.\n",
                encoding="utf-8",
            )
            (topic_dir / "interview.md").write_text("# Interview\n\n## Decision One\n\nAccepted.\n", encoding="utf-8")
            (topic_dir / "requirements.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Demo requirement",
                        "statement": "The system MUST validate interview artifacts.",
                        "change_type": "ADDED",
                        "domain": "demo",
                        "priority": "must",
                        "status": "accepted",
                        "fact_refs": ["F001"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "requirements.edges.jsonl").write_text(
                json.dumps({"from": "REQ-DEMO-001", "to": "F001", "type": "supported_by"}) + "\n",
                encoding="utf-8",
            )
            (topic_dir / "design.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "DES-DEC-001",
                        "type": "design-decision",
                        "status": "accepted",
                        "title": "Decision one",
                        "summary": "Use the validated path.",
                        "source": "design.md#decision-one",
                        "requirement_refs": ["REQ-DEMO-001"],
                        "fact_refs": ["F001"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "design.edges.jsonl").write_text(
                json.dumps({"from": "DES-DEC-001", "to": "REQ-DEMO-001", "type": "satisfies"}) + "\n",
                encoding="utf-8",
            )
            (topic_dir / "interview.nodes.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "id": "INT-Q-001",
                                "type": "candidate-question",
                                "status": "asked",
                                "title": "Choose behavior",
                                "summary": "Ask the user.",
                                "source": "interview.md#decision-one",
                                "fact_refs": ["F001"],
                            }
                        ),
                        json.dumps(
                            {
                                "id": "INT-D-001",
                                "type": "accepted-decision",
                                "status": "accepted",
                                "title": "Use validated path",
                                "summary": "User accepted it.",
                                "source": "interview.md#decision-one",
                                "requirement_refs": ["REQ-DEMO-001"],
                                "design_refs": ["DES-DEC-001"],
                                "fact_refs": ["F001"],
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "interview.edges.jsonl").write_text(
                json.dumps({"from": "INT-Q-001", "to": "INT-D-001", "type": "answered_by"})
                + "\n"
                + json.dumps({"from": "INT-D-001", "to": "REQ-DEMO-001", "type": "feeds_requirement"})
                + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            (topic_dir / "interview.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "INT-BAD-001",
                        "type": "unknown",
                        "status": "bogus",
                        "title": "Bad",
                        "summary": "Bad",
                        "source": "README.md:1",
                        "requirement_refs": ["REQ-MISSING"],
                        "design_refs": ["DES-MISSING"],
                        "fact_refs": ["F999"],
                        "evidence": ".plan/_private/demo/raw.log",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "interview.edges.jsonl").write_text(
                json.dumps({"from": "INT-BAD-001", "to": "REQ-MISSING", "type": "scenario_for"}) + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            for expected in [
                "Invalid interview node type",
                "Invalid interview status",
                "references missing requirement",
                "references missing design",
                "references missing fact",
                "must use interview.md#heading",
                "Invalid interview edge type",
                "Direct private artifact reference",
            ]:
                self.assertIn(expected, result.stdout)

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

    def test_testing_strategy_valid_topic_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            self.assertNotIn(str(ROOT), str(topic_dir.resolve()))
            (topic_dir / "requirements.md").write_text("# Requirements\n\nUses [REQ-DEMO-001] and [SCN-DEMO-001].\n", encoding="utf-8")
            (topic_dir / "requirements.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Demo requirement",
                        "statement": "The system MUST validate a temp-root testing workflow.",
                        "change_type": "ADDED",
                        "domain": "demo",
                        "priority": "must",
                        "status": "accepted",
                        "scenario_refs": ["SCN-DEMO-001"],
                        "fact_refs": ["F001"],
                    }
                )
                + "\n"
                + json.dumps(
                    {"id": "SCN-DEMO-001", "type": "scenario", "title": "Happy path", "requirement_id": "REQ-DEMO-001"}
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "requirements.edges.jsonl").write_text(
                json.dumps({"from": "REQ-DEMO-001", "to": "F001", "type": "supported_by"}) + "\n",
                encoding="utf-8",
            )
            (topic_dir / "design.md").write_text(
                "# Design\n\n## Decision One\n\nSatisfies [REQ-DEMO-001].\n\n## Testing Strategy\n\nLanguage: Python. App type: CLI. Existing test tools: unittest. Docs consulted: Python unittest docs. Unit strategy: focused functions. Integration strategy: temp filesystem command boundaries. E2E strategy: run one CLI smoke. Related ADR notes: none found. Requirement/scenario coverage: REQ-DEMO-001 and SCN-DEMO-001 map to P1.V1.\n",
                encoding="utf-8",
            )
            (topic_dir / "plan.md").write_text(
                (topic_dir / "plan.md")
                .read_text(encoding="utf-8")
                .replace(
                    "- [ ] **P1.V1** Run final manual check.",
                    "- [ ] **P1.V1** Testing Strategy Trace: covers REQ-DEMO-001 and SCN-DEMO-001; layer E2E; command `python -m unittest tests.test_demo`; concrete artifact tests/test_demo.py.",
                )
                + "\n## Requirement Test Coverage Matrix\n\nREQ-DEMO-001 and SCN-DEMO-001 are covered by P1.V1.\n",
                encoding="utf-8",
            )

            manage = ROOT / "skills/plan/scripts/manage_jsonl.ts"
            topic_result = subprocess.run(
                ["node", "--experimental-strip-types", str(manage), "validate-topic", "--root", str(project), "--topic", "demo", "--json"],
                text=True,
                capture_output=True,
            )
            self.assertEqual(topic_result.returncode, 0, topic_result.stdout + topic_result.stderr)
            graph_result = self.run_validator(project)
            self.assertEqual(graph_result.returncode, 0, graph_result.stdout + graph_result.stderr)

    def test_testing_strategy_contract_failures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            (topic_dir / "requirements.md").write_text("# Requirements\n\nUses [REQ-DEMO-001] and [SCN-DEMO-001].\n", encoding="utf-8")
            (topic_dir / "requirements.nodes.jsonl").write_text(
                json.dumps(
                    {
                        "id": "REQ-DEMO-001",
                        "type": "requirement",
                        "title": "Demo requirement",
                        "statement": "The system MUST validate testing strategy coverage.",
                        "change_type": "ADDED",
                        "domain": "demo",
                        "priority": "must",
                        "status": "accepted",
                        "scenario_refs": ["SCN-DEMO-001"],
                        "fact_refs": ["F001"],
                    }
                )
                + "\n"
                + json.dumps(
                    {"id": "SCN-DEMO-001", "type": "scenario", "title": "Happy path", "requirement_id": "REQ-DEMO-001"}
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "requirements.edges.jsonl").write_text(
                json.dumps({"from": "REQ-DEMO-001", "to": "F001", "type": "supported_by"}) + "\n",
                encoding="utf-8",
            )
            (topic_dir / "design.md").write_text("# Design\n\n## Decision\n\nSatisfies [REQ-DEMO-001].\n", encoding="utf-8")

            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("must include a Testing Strategy", result.stdout)

            (topic_dir / "design.md").write_text(
                "# Design\n\n## Decision\n\nSatisfies [REQ-DEMO-001].\n\n## Testing Strategy\n\nLanguage: Python. App type: CLI. Existing test tools: unittest. Docs consulted: Python unittest docs. Unit strategy: functions. Integration strategy: temp filesystem. E2E strategy: CLI smoke. Related ADR notes: none. Requirement/scenario coverage: REQ-DEMO-001 and SCN-DEMO-001.\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("lacks validation coverage for requirement/scenario REQ-DEMO-001", result.stdout)
            self.assertIn("lacks validation coverage for requirement/scenario SCN-DEMO-001", result.stdout)

            plan_text = (topic_dir / "plan.md").read_text(encoding="utf-8")
            (topic_dir / "plan.md").write_text(
                plan_text.replace("- [ ] **P1.V1** Run final manual check.", "- [ ] **P1.V1** Run tests.")
                + "\n## Requirement Test Coverage Matrix\n\nREQ-DEMO-001 and SCN-DEMO-001 are covered by P1.V1. Testing Strategy Trace: layer E2E.\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("generic-only", result.stdout)

            (topic_dir / "plan.md").write_text(
                plan_text.replace(
                    "- [ ] **P1.V1** Run final manual check.",
                    "- [ ] **P1.V1** Testing Strategy Trace: covers REQ-DEMO-001 and SCN-DEMO-001; layer E2E.",
                )
                + "\n## Requirement Test Coverage Matrix\n\nREQ-DEMO-001 and SCN-DEMO-001 are covered by P1.V1. Testing Strategy Trace: layer E2E.\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("lacks concrete test artifacts", result.stdout)

            (topic_dir / "plan.md").write_text(
                plan_text.replace(
                    "- [ ] **P1.V1** Run final manual check.",
                    "- [ ] **P1.V1** Testing Strategy Trace: covers REQ-DEMO-001 and SCN-DEMO-001; command `python -m unittest tests.test_demo`; concrete artifact tests/test_demo.py.",
                )
                + "\n## Requirement Test Coverage Matrix\n\nREQ-DEMO-001 and SCN-DEMO-001 are covered by P1.V1.\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("at least one E2E validation", result.stdout)

            (topic_dir / "design.md").write_text(
                "# Design\n\n## Decision\n\nSatisfies [REQ-DEMO-001].\n\n## Testing Strategy\n\nLanguage: Python. App type: CLI. Existing test tools: unittest. Docs consulted: Python unittest docs. Integration strategy: temp filesystem. E2E strategy: CLI smoke. Related ADR notes: none. Requirement/scenario coverage: REQ-DEMO-001 and SCN-DEMO-001.\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("lacks unit strategy", result.stdout)

            (topic_dir / "design.md").write_text(
                "# Design\n\n## Decision\n\nSatisfies [REQ-DEMO-001].\n\n## Testing Strategy\n\nLanguage: Python. App type: CLI. Existing test tools: unittest. Docs consulted: Python unittest docs. Unit strategy: functions. Integration strategy: temp filesystem. E2E strategy: CLI smoke. Jest to Vitest migration is accepted. Requirement/scenario coverage: REQ-DEMO-001 and SCN-DEMO-001.\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Major testing-toolchain change lacks ADR", result.stdout)

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

    def test_sanitized_evidence_source_requires_redaction_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            evidence_dir = topic_dir / "evidence"
            evidence_dir.mkdir()
            (evidence_dir / "artifact-analysis.md").write_text("# Evidence Analysis: artifact\n", encoding="utf-8")
            facts = [
                json.loads(line) for line in (topic_dir / "facts.nodes.jsonl").read_text(encoding="utf-8").splitlines()
            ]
            facts[0]["source_kind"] = "sanitized_evidence"
            facts[0]["reference"] = ".plan/demo/evidence/artifact-analysis.md:1"
            (topic_dir / "facts.nodes.jsonl").write_text(
                "\n".join(json.dumps(fact) for fact in facts) + "\n", encoding="utf-8"
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("lacks Redaction status", result.stdout)

    def test_receipt_and_context_pack_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            (topic_dir / "receipts.jsonl").write_text(
                json.dumps(
                    {
                        "id": "receipt:P0",
                        "type": "validation-receipt",
                        "status": "passed",
                        "phase_id": "P0",
                        "commands": [{"command": "manual", "result": "passed"}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            (topic_dir / "context-packs.jsonl").write_text(
                json.dumps(
                    {
                        "id": "context:P0",
                        "type": "context-pack",
                        "phase_id": "P0",
                        "summary": "Focused context",
                        "budget_tokens": 1000,
                        "references": ["src/app.ts:1"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertEqual(result.returncode, 0, result.stdout)

            (topic_dir / "receipts.jsonl").write_text(
                json.dumps(
                    {"id": "receipt:timeout", "type": "subagent-receipt", "status": "timed-out", "phase_id": "P0"}
                )
                + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("timeout receipt lacks fallback decision", result.stdout)

            (topic_dir / "receipts.jsonl").write_text(
                json.dumps(
                    {
                        "id": "receipt:failed",
                        "type": "validation-receipt",
                        "status": "failed",
                        "phase_id": "P0",
                        "commands": [{"command": "manual", "result": "failed"}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("failure receipt lacks fallback decision", result.stdout)

    def test_private_reference_and_secret_pattern_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            topic_dir = self.write_valid_project(project)
            evidence_dir = topic_dir / "evidence"
            evidence_dir.mkdir()
            fake_token = "gh" + "p_" + "".join(["123456", "789012", "345678", "901234", "567890", "123456"])
            (evidence_dir / "artifact-analysis.md").write_text(
                f"# Evidence Analysis: artifact\n\n{fake_token}\n",
                encoding="utf-8",
            )
            nodes_path = topic_dir / "facts.nodes.jsonl"
            with nodes_path.open("a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        {
                            "id": "S002",
                            "type": "source",
                            "title": "Raw",
                            "raw_archive_path": ".plan/_private/demo/raw.log",
                        }
                    )
                    + "\n"
                )
            result = self.run_validator(project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Potential secret pattern", result.stdout)
            self.assertIn("Direct private artifact reference", result.stdout)


if __name__ == "__main__":
    unittest.main()
