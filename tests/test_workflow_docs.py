from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WorkflowDocsTests(unittest.TestCase):
    def test_retrieval_rationale_guidance_is_documented(self) -> None:
        for rel in ["skills/proposal/SKILL.md", "skills/plan/SKILL.md", "skills/implement/SKILL.md"]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("retrieval plan", text, rel)
            self.assertIn("rationale retrieval", text, rel)
            self.assertIn("historical evidence", text, rel)

    def test_index_skill_documents_scopes_context_and_misses(self) -> None:
        text = (ROOT / "skills/index-project/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("--scope code|plans|all", text)
        self.assertIn("context", text)
        self.assertIn("log-miss", text)
        self.assertIn(".plan/_retrieval/misses.jsonl", text)

    def test_adr_gate_guidance_is_documented(self) -> None:
        proposal = (ROOT / "skills/proposal/SKILL.md").read_text(encoding="utf-8")
        plan = (ROOT / "skills/plan/SKILL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        combined = "\n".join([proposal, plan, readme])

        self.assertIn("adr_required", proposal)
        self.assertIn("alternatives/rationale", proposal)
        self.assertIn("cartographer_adr", proposal)
        self.assertIn("adr_required", plan)
        self.assertIn("cartographer_adr", plan)
        self.assertIn("adr_required", readme)
        self.assertNotIn("Final concise ADR generation into `docs/` is out of scope", combined)
        self.assertNotIn("does not generate final ADRs", readme)

    def test_implement_documents_adr_finalization(self) -> None:
        implement = (ROOT / "skills/implement/SKILL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("adr_required", implement)
        self.assertIn("adr-not-required", implement)
        self.assertIn("cartographer_adr", implement)
        self.assertIn("validation receipt", implement)
        self.assertIn("adr-not-required", readme)
        self.assertIn("Architecture Decision Records", readme)
        self.assertIn("docs/adr/", readme)
        self.assertIn("legacy imports", readme)
        self.assertNotIn("Final concise ADR generation into `docs/` is out of scope", implement)

    def test_deterministic_then_auditor_gates_are_documented(self) -> None:
        proposal = (ROOT / "skills/proposal/SKILL.md").read_text(encoding="utf-8")
        plan = (ROOT / "skills/plan/SKILL.md").read_text(encoding="utf-8")
        implement = (ROOT / "skills/implement/SKILL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Deterministic validation before `cartographer-auditor`", proposal)
        self.assertIn("cartographer-auditor` `PASS`", proposal)
        self.assertIn("fallback receipt", proposal)
        self.assertIn("JSONL validation before `cartographer-auditor`", plan)
        self.assertIn("validate_planning_graph.py", plan)
        self.assertIn("explicit fallback receipt", plan)
        self.assertIn("default phase semantic gate", implement)
        self.assertIn("final `cartographer-auditor` semantic gate", implement)
        self.assertIn("deterministic validation receipts first", readme)

    def test_single_writer_state_workflow_is_documented(self) -> None:
        implement = (ROOT / "skills/implement/SKILL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        pathfinder = (ROOT / ".pi/agents/cartographer-pathfinder.md").read_text(encoding="utf-8")

        for text, name in [(implement, "implement"), (readme, "readme"), (agents, "agents")]:
            self.assertIn(".cartographer", text, name)
            self.assertIn("journal", text, name)
            self.assertIn("current.json", text, name)
        self.assertIn("current/parent agent is the default writer", implement)
        self.assertIn("parent/current agent is the default writer", readme)
        self.assertIn("cartographer_state", implement)
        self.assertIn("state-resume", implement)
        self.assertIn("compact-generate", implement)
        self.assertIn("Deprecated legacy", pathfinder)
        self.assertIn("not the default phase writer", pathfinder)
        self.assertNotIn("Use `cartographer-pathfinder` as the default phase writer", implement)
        self.assertNotIn("cartographer-pathfinder` is the default scoped phase writer", readme)

    def test_timeout_fallback_receipts_and_compass_escalation_are_documented(self) -> None:
        implement = (ROOT / "skills/implement/SKILL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        for text, name in [(implement, "implement"), (readme, "readme")]:
            self.assertIn("timeout/fallback receipts", text, name)
            self.assertIn("cartographer-compass", text, name)
            self.assertIn("substantial parent takeover", text, name)

    def test_least_privilege_child_tool_policy_is_documented(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("least-privilege child tool policy", readme)
        self.assertIn("role-specific", readme)

        for rel in ["skills/proposal/SKILL.md", "skills/plan/SKILL.md", "skills/implement/SKILL.md"]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("least-privilege", text, rel)
            self.assertIn("full mutable JSONL/private/ADR/receipt authority", text, rel)

    def test_index_docs_explain_adr_markdown_and_graph_lookup(self) -> None:
        text = (ROOT / "skills/index-project/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("docs/adr/*.md", text)
        self.assertIn("cartographer_adr query/show", text)
        self.assertIn("ADR graph JSONL", text)

    def test_dashboard_skill_documents_read_only_cli_contract(self) -> None:
        text = (ROOT / "skills/dashboard/SKILL.md").read_text(encoding="utf-8")

        self.assertIn('name: "dashboard"', text)
        self.assertIn("description:", text)
        self.assertIn("cartographer-dashboard start", text)
        self.assertIn("cartographer-dashboard status", text)
        self.assertIn("cartographer-dashboard stop", text)
        self.assertIn("--topic planning-dashboard", text)
        self.assertIn("--json", text)
        self.assertIn("read-only", text)
        self.assertIn("loopback-only", text)
        self.assertIn("../../bin/cartographer-dashboard.js", text)
        self.assertIn("Do **not** reimplement server startup", text)
        self.assertIn(".plan/_private", text)

    def test_readme_documents_dashboard_usage_and_safety(self) -> None:
        text = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("## Planning dashboard", text)
        self.assertIn("cartographer-dashboard start", text)
        self.assertIn("/skill:dashboard", text)
        self.assertIn("loopback-only", text)
        self.assertIn("read-only", text)
        self.assertIn("Live reload watches safe `.plan/**`", text)
        self.assertIn("React Flow", text)
        self.assertIn("npm run dashboard:build", text)


if __name__ == "__main__":
    unittest.main()
