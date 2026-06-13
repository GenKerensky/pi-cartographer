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
        self.assertIn("cartographer_compact_context", implement)
        self.assertIn("actual Pi transcript compaction", implement)
        self.assertIn("continue-with-implement-skill", implement)
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

    def test_wrapper_first_lifecycle_docs_are_documented(self) -> None:
        proposal = (ROOT / "skills/proposal/SKILL.md").read_text(encoding="utf-8")
        plan = (ROOT / "skills/plan/SKILL.md").read_text(encoding="utf-8")
        implement = (ROOT / "skills/implement/SKILL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")

        self.assertIn("cartographer_proposal", proposal)
        self.assertIn("cartographer_fact", proposal)
        self.assertIn("cartographer_proposal finalize", proposal)
        self.assertIn("cartographer_plan generate-graph", plan)
        self.assertIn("cartographer_plan_status set", plan)
        self.assertIn("validation-complete-item", plan)
        self.assertIn("cartographer_plan finalize", plan)
        self.assertIn("cartographer_implement start", implement)
        self.assertIn("cartographer_implement step", implement)
        self.assertIn("cartographer_implement finalize", implement)
        self.assertIn("cartographer_transition", implement)
        for text, name in [(implement, "implement"), (readme, "readme"), (agents, "agents")]:
            self.assertIn("Automatic phase advancement", text, name)
            self.assertIn("human approval", text, name)
            self.assertIn("cartographer_handoff auditor", text, name)
            self.assertIn("prose-only", text, name)

    def test_readme_documents_model_routing_setup_and_safety(self) -> None:
        text = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Model routing and fallback setup", text)
        self.assertIn("model-config", text)
        self.assertIn("ask which providers Cartographer may use", text)
        self.assertIn("recommend role-specific models", text)
        self.assertIn("recommend a main orchestrator model", text)
        self.assertIn("opencode/big-pickle", text)
        self.assertIn("Example proposal JSON", text)
        self.assertIn('"subagents"', text)
        self.assertIn('"agentOverrides"', text)
        self.assertIn('"cartographer-drafter"', text)
        self.assertIn('"cartographer-auditor"', text)
        self.assertIn('"parentFallbackModels"', text)
        self.assertIn('"parentFallbackAllowCrossProvider"', text)
        self.assertIn("JSON Schema", text)
        self.assertIn("model_config.ts preview", text)
        self.assertIn("model_config.ts apply", text)
        self.assertIn("do not paste-edit user settings by hand", text)
        self.assertIn("no `xhigh` defaults", text)
        self.assertIn("Cross-provider fallback", text)
        self.assertIn("does not hot-swap Pi's active model", text)
        self.assertIn("privacy/safety caveat", text)

    def test_model_config_skill_documents_interactive_setup_and_deterministic_writer(self) -> None:
        text = (ROOT / "skills/model-config/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("missing or partial model-routing configuration", text)
        self.assertIn("Missing settings file", text)
        self.assertIn("Missing `subagents.agentOverrides`", text)
        self.assertIn("Missing `cartographer.parentFallbackModels`", text)
        self.assertIn("Ask provider menu", text)
        self.assertIn("which providers Cartographer may use", text)
        self.assertIn("role-specific", text)
        self.assertIn("cost/subscription class", text)
        self.assertIn("speed/latency class", text)
        self.assertIn("thinking/reasoning support", text)
        self.assertIn("input modality", text)
        self.assertIn("context window", text)
        self.assertIn("privacy/safety", text)
        self.assertIn("Main orchestrator", text)
        self.assertIn("opencode/big-pickle", text)
        self.assertIn("no fallback", text.lower())
        self.assertIn("Preview settings", text)
        self.assertIn("model_config.ts preview", text)
        self.assertIn("Confirm and apply", text)
        self.assertIn("model_config.ts apply", text)
        self.assertIn("Ask for confirmation before writing", text)
        self.assertIn("model_config.ts", text)
        self.assertIn("available Pi model list", text)
        self.assertIn("thinking levels", text)
        self.assertIn("modality constraints", text)
        self.assertIn("no `xhigh` defaults", text)
        self.assertIn("Do not silently mutate user settings", text)
        self.assertIn("Do not use direct LLM edits for JSON settings", text)
        self.assertIn("privacy/safety caveat", text)
        self.assertIn("User confirmed", text)

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

    def test_requirements_design_split_scope_gate_is_documented(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        proposal = (ROOT / "skills/proposal/SKILL.md").read_text(encoding="utf-8")
        plan = (ROOT / "skills/plan/SKILL.md").read_text(encoding="utf-8")
        implement = (ROOT / "skills/implement/SKILL.md").read_text(encoding="utf-8")

        combined = "\n".join([readme, proposal, plan, implement])

        self.assertIn("proposal → research → interview → requirements delta → design → plan → implement", readme)
        self.assertIn("research-exhausted interview", proposal)
        self.assertIn("exhausted research", proposal)
        self.assertIn("re-enter interview one question at a time", proposal)
        self.assertIn("interview.nodes.jsonl", readme)
        self.assertIn("interview.edges.jsonl", readme)
        self.assertIn("interview.nodes.jsonl", plan)
        self.assertIn("interview.edges.jsonl", plan)
        self.assertIn("interview.nodes.jsonl", implement)
        self.assertIn("interview.edges.jsonl", implement)
        self.assertIn("core user workflow", combined)
        self.assertIn("docs/requirements.md", combined)
        self.assertIn("requirements_records.py init", combined)
        self.assertIn("preserves an existing requirements document unchanged", readme)
        self.assertIn("does not invent product requirements", plan)
        self.assertIn("Small changes that do not impact a core user workflow do not need", readme)
        self.assertIn("non-core-workflow changes", proposal)
        self.assertIn("requirements_required", proposal)
        self.assertIn("## Scope Gate", proposal)
        self.assertIn("## Next Artifacts", proposal)
        self.assertIn("Description", proposal)
        self.assertIn("Problem Statement", proposal)
        self.assertIn("Background", proposal)
        self.assertIn("Viability", proposal)
        self.assertIn("requirements.nodes.jsonl", plan)
        self.assertIn("requirements.edges.jsonl", plan)
        self.assertIn("design.nodes.jsonl", plan)
        self.assertIn("design.edges.jsonl", plan)
        self.assertIn("requirements.nodes.jsonl", implement)
        self.assertIn("requirements.edges.jsonl", implement)
        self.assertIn("design.nodes.jsonl", implement)
        self.assertIn("design.edges.jsonl", implement)
        self.assertNotIn("## Design\n", proposal)

    def test_interview_skill_documents_post_research_workflow(self) -> None:
        interview = (ROOT / "skills/interview/SKILL.md").read_text(encoding="utf-8")
        agents = "\n".join(
            [
                (ROOT / ".pi/agents/cartographer-auditor.md").read_text(encoding="utf-8"),
                (ROOT / ".pi/agents/cartographer-compass.md").read_text(encoding="utf-8"),
                (ROOT / ".pi/agents/cartographer-drafter.md").read_text(encoding="utf-8"),
            ]
        )

        for needle in [
            "after relevant research is exhausted",
            "one question at a time",
            "recommended answer first",
            "pause",
            "re-enter interview one question at a time",
            "Approval Summary",
            "A mockup is warranted",
            "single-file HTML mockup",
            "preview_export",
            "temporary run directory",
            "non-visual fallback",
            "persistent mockup editor",
            "interview.md",
            "interview.nodes.jsonl",
            "interview.edges.jsonl",
            "candidate-question",
            "researched-answer",
            "recommendation",
            "user-answer",
            "accepted-decision",
            "deferred-choice",
            "unresolved-blocker",
        ]:
            self.assertIn(needle, interview)
        self.assertIn("read-only summaries", interview)
        self.assertIn("interview.nodes.jsonl", agents)
        self.assertIn("interview.edges.jsonl", agents)

    def test_specialist_prompts_use_requirement_design_summaries(self) -> None:
        auditor = (ROOT / ".pi/agents/cartographer-auditor.md").read_text(encoding="utf-8")
        compass = (ROOT / ".pi/agents/cartographer-compass.md").read_text(encoding="utf-8")
        drafter = (ROOT / ".pi/agents/cartographer-drafter.md").read_text(encoding="utf-8")
        combined = "\n".join([auditor, compass, drafter])

        for needle in [
            "requirements.nodes.jsonl",
            "requirements.edges.jsonl",
            "design.nodes.jsonl",
            "design.edges.jsonl",
        ]:
            self.assertIn(needle, combined)
        self.assertIn("read-only summaries", combined)
        self.assertIn("core user workflow", compass)
        self.assertIn("do not put detailed architecture back into proposal", drafter.lower())


if __name__ == "__main__":
    unittest.main()
