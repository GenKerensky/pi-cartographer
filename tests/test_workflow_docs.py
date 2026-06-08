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


if __name__ == "__main__":
    unittest.main()
