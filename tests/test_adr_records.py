from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/plan/scripts/adr_records.py"

spec = importlib.util.spec_from_file_location("adr_records", SCRIPT)
assert spec is not None
adr_records = importlib.util.module_from_spec(spec)
sys.modules["adr_records"] = adr_records
assert spec.loader is not None
spec.loader.exec_module(adr_records)


class AdrRecordsTests(unittest.TestCase):
    def run_script(self, *args: str, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *args, "--json"],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def sample_record(self) -> adr_records.AdrRecord:
        return adr_records.AdrRecord(
            adr_id="ADR-0007",
            title="Use Auth0 for Authentication",
            status="accepted",
            decision_date="2026-06-08",
            generated_from_topic="auth-system",
            adr_required_source="proposal",
            legacy_import=False,
            source_commits=["abc1234"],
            validation_receipts=["receipt:final:validation:2026-06-08T18:10:00Z"],
            domains=["authentication", "identity"],
            keywords=["auth", "auth0", "oauth", "login"],
            decision_kind="feature-architecture",
            supersedes=[],
            related=["ADR-0002"],
            precursors=["ADR-0001"],
            children=[],
            confidence="high",
            decision="This project uses Auth0 as the hosted identity provider for user authentication.",
            context="The feature needed hosted login, OAuth/OIDC support, and user lifecycle management.",
            considered_options=["Auth0", "Self-hosted authentication", "Firebase Authentication"],
            rationale="Auth0 met the project requirements with the lowest operations burden.",
            consequences=[
                "Runtime code depends on Auth0 tenant configuration.",
                "Future authorization decisions should treat this ADR as a precursor.",
            ],
            usage="When adding login or identity features, integrate with Auth0/OIDC.",
            validation="Implemented and validated by the auth-system Cartographer topic.",
        )

    def test_discovery_selects_single_existing_convention(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            (project / "docs/decisions").mkdir(parents=True)

            discovery = adr_records.discover_adr_directory(project)

            self.assertTrue((project / "docs/decisions").exists())
            self.assertEqual(discovery.selected_dir_rel, "docs/decisions")
            self.assertEqual(discovery.existing_candidates, ("docs/decisions",))
            self.assertFalse(discovery.fallback_used)
            self.assertFalse((project / "docs/adr").exists())

    def test_fallback_creates_docs_adr_when_no_convention_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            discovery = adr_records.discover_adr_directory(project, create=True)

            self.assertEqual(discovery.selected_dir_rel, "docs/adr")
            self.assertTrue(discovery.fallback_used)
            self.assertTrue(discovery.created)
            self.assertTrue((project / "docs/adr").is_dir())

    def test_ambiguity_reports_multiple_existing_conventions_without_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            (project / "docs/adr").mkdir(parents=True)
            (project / "decisions").mkdir()

            discovery = adr_records.discover_adr_directory(project, create=True)

            self.assertTrue(discovery.ambiguous)
            self.assertIsNone(discovery.selected_dir)
            self.assertIn("docs/adr", discovery.existing_candidates)
            self.assertIn("decisions", discovery.existing_candidates)
            self.assertTrue(discovery.errors)

    def test_slug_generation_is_stable_and_filename_safe(self) -> None:
        self.assertEqual(adr_records.slugify_title("Use Auth0 for Authentication!"), "use-auth0-for-authentication")
        self.assertEqual(
            adr_records.slugify_title("  Store workflow receipts as JSONL  "), "store-workflow-receipts-as-jsonl"
        )
        self.assertEqual(adr_records.slugify_title("Café & Résumé Decisions"), "cafe-and-resume-decisions")
        self.assertEqual(adr_records.slugify_title("!!!"), "decision")
        self.assertEqual(
            adr_records.format_adr_filename(12, "Use Auth0 for Authentication!"), "0012-use-auth0-for-authentication.md"
        )

    def test_numbering_uses_files_and_graph_nodes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            adr_dir = Path(tmp) / "docs/adr"
            graph_dir = adr_dir / "_graph"
            graph_dir.mkdir(parents=True)
            (adr_dir / "0001-first.md").write_text("placeholder\n", encoding="utf-8")
            (adr_dir / "0007-Seventh-Decision.md").write_text("placeholder\n", encoding="utf-8")
            (adr_dir / "not-an-adr.md").write_text("ignored\n", encoding="utf-8")
            (graph_dir / "adr.nodes.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps({"id": "adr:0009", "adr_id": "ADR-0009", "path": "docs/adr/0009-graph.md"}),
                        json.dumps({"id": "adr:0003", "adr_id": "ADR-0003"}),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            allocation = adr_records.allocate_next_number(adr_dir)

            self.assertEqual(allocation.file_numbers, (1, 7))
            self.assertEqual(allocation.graph_numbers, (3, 9))
            self.assertEqual(allocation.existing_numbers, (1, 3, 7, 9))
            self.assertEqual(allocation.next_number, 10)
            self.assertEqual(allocation.next_adr_id, "ADR-0010")

    def test_cli_discover_reports_explicit_file_path_as_json_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            (project / "not-a-dir").write_text("file, not directory\n", encoding="utf-8")

            result = self.run_script("discover", "--root", str(project), "--adr-dir", "not-a-dir", check=False)
            payload = json.loads(result.stdout)

            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(payload["ok"])
            self.assertIn("not a directory", payload["errors"][0])

    def test_cli_discover_reports_fallback_file_conflict_as_json_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            (project / "docs").mkdir(parents=True)
            (project / "docs/adr").write_text("file, not directory\n", encoding="utf-8")

            result = self.run_script("discover", "--root", str(project), "--create", check=False)
            payload = json.loads(result.stdout)

            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["adr_dir"], "docs/adr")
            self.assertIn("not a directory", payload["errors"][0])

    def test_markdown_render_parse_round_trip(self) -> None:
        record = self.sample_record()

        rendered = adr_records.render_adr_markdown(record)
        parsed = adr_records.parse_adr_markdown(rendered)

        self.assertIn("---\nadr_id: ADR-0007", rendered)
        for section in adr_records.REQUIRED_BODY_SECTIONS:
            self.assertIn(f"## {section}", rendered)
        self.assertEqual(parsed.adr_id, record.adr_id)
        self.assertEqual(parsed.title, record.title)
        self.assertEqual(parsed.legacy_import, False)
        self.assertEqual(parsed.validation_receipts, record.validation_receipts)
        self.assertEqual(parsed.domains, record.domains)
        self.assertEqual(parsed.related, ["ADR-0002"])
        self.assertEqual(parsed.decision, record.decision)
        self.assertEqual(parsed.considered_options, record.considered_options)
        self.assertEqual(parsed.consequences, record.consequences)
        self.assertEqual(parsed.validation, record.validation)

    def test_markdown_parser_requires_front_matter_and_body_sections(self) -> None:
        with self.assertRaises(adr_records.AdrMarkdownError):
            adr_records.parse_adr_markdown("# ADR-0001: Missing front matter\n")

        rendered = adr_records.render_adr_markdown(self.sample_record())
        broken = rendered.replace("## Validation", "## Evidence", 1)
        with self.assertRaisesRegex(adr_records.AdrMarkdownError, "Missing required ADR body sections"):
            adr_records.parse_adr_markdown(broken)

    def test_cli_discover_creates_fallback_and_emits_json_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            result = self.run_script(
                "discover",
                "--root",
                str(project),
                "--create",
                "--title",
                "Use Auth0 for Authentication",
            )
            payload = json.loads(result.stdout)

            self.assertTrue(payload["ok"])
            self.assertEqual(payload["adr_dir"], "docs/adr")
            self.assertTrue(payload["created"])
            self.assertEqual(payload["next_adr_id"], "ADR-0001")
            self.assertEqual(payload["next_filename"], "0001-use-auth0-for-authentication.md")
            self.assertTrue((project / "docs/adr").is_dir())

    def test_cli_list_reads_markdown_records_without_real_repo_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            adr_dir = project / "docs/adr"
            adr_dir.mkdir(parents=True)
            record = self.sample_record()
            (adr_dir / "0007-use-auth0-for-authentication.md").write_text(
                adr_records.render_adr_markdown(record), encoding="utf-8"
            )

            result = self.run_script("list", "--root", str(project))
            payload = json.loads(result.stdout)

            self.assertTrue(payload["ok"])
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["records"][0]["adr_id"], "ADR-0007")
            self.assertEqual(payload["records"][0]["path"], "docs/adr/0007-use-auth0-for-authentication.md")
            self.assertEqual(payload["parse_errors"], [])

    def test_cli_discover_reports_ambiguity_as_json_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            (project / "docs/adr").mkdir(parents=True)
            (project / "adr").mkdir()

            result = self.run_script("discover", "--root", str(project), check=False)
            payload = json.loads(result.stdout)

            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(payload["ok"])
            self.assertTrue(payload["ambiguous"])
            self.assertEqual(payload["existing_candidates"], ["docs/adr", "adr"])


if __name__ == "__main__":
    unittest.main()
