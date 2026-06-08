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

    def record_for(
        self,
        number: int,
        title: str,
        *,
        status: str = "accepted",
        decision_date: str = "2026-06-08",
        receipts: list[str] | None = None,
        legacy: bool = False,
    ) -> adr_records.AdrRecord:
        return adr_records.AdrRecord(
            adr_id=adr_records.format_adr_id(number),
            title=title,
            status=status,
            decision_date=decision_date,
            generated_from_topic="demo-topic",
            adr_required_source="proposal" if not legacy else "legacy-import",
            legacy_import=legacy,
            source_commits=[] if legacy else ["abc1234"],
            validation_receipts=[] if receipts is None else receipts,
            domains=["authentication"],
            keywords=["auth", title.lower().split()[1] if len(title.split()) > 1 else "decision"],
            decision_kind="feature-architecture",
            confidence="high",
            decision=f"Decision for {title}.",
            context=f"Context for {title}.",
            considered_options=[title, "Alternative option"],
            rationale=f"Rationale for {title}.",
            consequences=[f"Consequence for {title}."],
            usage=f"Use {title} when relevant.",
            validation="Validation evidence is recorded in receipts." if receipts else "Imported legacy ADR.",
        )

    def write_adr(self, project: Path, record: adr_records.AdrRecord) -> Path:
        adr_dir = project / "docs/adr"
        adr_dir.mkdir(parents=True, exist_ok=True)
        number = adr_records.number_from_adr_id(record.adr_id)
        assert number is not None
        path = adr_dir / adr_records.format_adr_filename(number, record.title)
        path.write_text(adr_records.render_adr_markdown(record), encoding="utf-8")
        return path

    def node_for(
        self,
        project: Path,
        path: Path,
        record: adr_records.AdrRecord,
        *,
        current: bool = True,
        import_note: str | None = None,
    ) -> dict[str, object]:
        number = adr_records.number_from_adr_id(record.adr_id)
        assert number is not None
        node: dict[str, object] = {
            "id": adr_records.format_adr_node_id(number),
            "type": "adr",
            "adr_id": record.adr_id,
            "title": record.title,
            "path": path.relative_to(project).as_posix(),
            "status": record.status,
            "decision_date": record.decision_date,
            "domains": record.domains,
            "keywords": record.keywords,
            "summary": record.decision,
            "generated_from_topic": record.generated_from_topic,
            "adr_required_source": record.adr_required_source,
            "legacy_import": record.legacy_import,
            "source_commits": record.source_commits,
            "validation_receipts": record.validation_receipts,
            "current": current,
        }
        if import_note is not None:
            node["import_note"] = import_note
        return node

    def write_graph(self, project: Path, nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> None:
        adr_records.save_adr_graph(project / "docs/adr", nodes, edges)

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

    def test_validate_graph_derives_currentness_and_lookup_is_current_first(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            old = self.record_for(1, "Use Auth0", decision_date="2026-06-01", receipts=["receipt:old"])
            new = self.record_for(2, "Use Internal OIDC", decision_date="2026-06-08", receipts=["receipt:new"])
            old_path = self.write_adr(project, old)
            new_path = self.write_adr(project, new)
            self.write_graph(
                project,
                [
                    self.node_for(project, old_path, old, current=False),
                    self.node_for(project, new_path, new, current=True),
                ],
                [{"from": "adr:0002", "to": "adr:0001", "type": "supersedes", "reason": "Provider changed."}],
            )

            validate_result = self.run_script("validate", "--root", str(project))
            validate_payload = json.loads(validate_result.stdout)
            self.assertTrue(validate_payload["ok"])
            self.assertEqual(validate_payload["counts"]["current"], 1)
            self.assertEqual(validate_payload["current_adr_ids"], ["ADR-0002"])
            self.assertEqual(validate_payload["superseded_adr_ids"], ["ADR-0001"])

            list_payload = json.loads(self.run_script("list", "--root", str(project)).stdout)
            self.assertEqual(list_payload["count"], 1)
            self.assertEqual(list_payload["records"][0]["adr_id"], "ADR-0002")

            query_payload = json.loads(self.run_script("query", "auth", "--root", str(project)).stdout)
            self.assertEqual(query_payload["count"], 1)
            self.assertEqual(query_payload["records"][0]["adr_id"], "ADR-0002")

            show_old = self.run_script("show", "ADR-0001", "--root", str(project), check=False)
            self.assertNotEqual(show_old.returncode, 0)
            self.assertIn("not current", json.loads(show_old.stdout)["errors"][0])

            show_payload = json.loads(
                self.run_script("show", "ADR-0001", "--root", str(project), "--include-superseded").stdout
            )
            self.assertTrue(show_payload["ok"])
            self.assertEqual(show_payload["record"]["adr_id"], "ADR-0001")
            self.assertEqual(show_payload["relationships"]["incoming"][0]["type"], "supersedes")

    def test_validate_graph_reports_endpoint_edge_type_cycle_and_path_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            first = self.record_for(1, "Use Auth0", decision_date="2026-06-01", receipts=["receipt:first"])
            second = self.record_for(2, "Use OIDC", decision_date="2026-06-02", receipts=["receipt:second"])
            first_path = self.write_adr(project, first)
            second_path = self.write_adr(project, second)
            bad_path_node = self.node_for(project, first_path, first, current=True)
            bad_path_node["path"] = "docs/adr/0003-wrong-number.md"
            self.write_graph(
                project,
                [bad_path_node, self.node_for(project, second_path, second, current=True)],
                [
                    {"from": "adr:0001", "to": "adr:9999", "type": "related_to"},
                    {"from": "adr:0001", "to": "adr:0002", "type": "invalid_edge"},
                    {"from": "adr:0001", "to": "adr:0002", "type": "child_of"},
                    {"from": "adr:0002", "to": "adr:0001", "type": "child_of"},
                ],
            )

            result = self.run_script("validate", "--root", str(project), check=False)
            payload = json.loads(result.stdout)
            errors = "\n".join(payload["errors"])

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("path does not exist", errors)
            self.assertIn("Unresolved to endpoint 'adr:9999'", errors)
            self.assertIn("Invalid ADR edge type 'invalid_edge'", errors)
            self.assertIn("Cycle detected for child_of ADR edges", errors)

    def test_validate_graph_warns_when_dependency_target_is_superseded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            old = self.record_for(1, "Use Auth0", decision_date="2026-06-01", receipts=["receipt:old"])
            dependent = self.record_for(2, "Use OIDC Sessions", decision_date="2026-06-02", receipts=["receipt:dep"])
            replacement = self.record_for(3, "Use Internal OIDC", decision_date="2026-06-03", receipts=["receipt:new"])
            old_path = self.write_adr(project, old)
            dep_path = self.write_adr(project, dependent)
            replacement_path = self.write_adr(project, replacement)
            self.write_graph(
                project,
                [
                    self.node_for(project, old_path, old, current=False),
                    self.node_for(project, dep_path, dependent, current=True),
                    self.node_for(project, replacement_path, replacement, current=True),
                ],
                [
                    {"from": "adr:0003", "to": "adr:0001", "type": "supersedes"},
                    {"from": "adr:0002", "to": "adr:0001", "type": "depends_on"},
                ],
            )

            payload = json.loads(self.run_script("validate", "--root", str(project)).stdout)
            self.assertTrue(payload["ok"])
            self.assertIn("depends_on target is not current", "\n".join(payload["warnings"]))

    def test_validate_graph_rejects_private_references_in_markdown_and_graph(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            record = self.record_for(1, "Use Auth0", receipts=["receipt:first"])
            path = self.write_adr(project, record)
            text = path.read_text(encoding="utf-8") + "\n.plan/_private/demo/raw.log\n"
            path.write_text(text, encoding="utf-8")
            node = self.node_for(project, path, record, current=True)
            node["summary"] = "Do not cite .plan/_private/demo/raw.log"
            self.write_graph(project, [node], [])

            result = self.run_script("validate", "--root", str(project), check=False)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ok"])
            self.assertIn("Direct private artifact reference", "\n".join(payload["errors"]))

    def test_legacy_adrs_may_omit_receipts_only_with_legacy_marker_and_note(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            legacy = self.record_for(1, "Use Legacy Auth", status="accepted-legacy", receipts=[], legacy=True)
            legacy_path = self.write_adr(project, legacy)
            self.write_graph(
                project,
                [self.node_for(project, legacy_path, legacy, current=True, import_note="Imported from existing docs.")],
                [],
            )
            ok_payload = json.loads(self.run_script("validate", "--root", str(project)).stdout)
            self.assertTrue(ok_payload["ok"])

        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            generated = self.record_for(1, "Use Auth0", receipts=[])
            generated_path = self.write_adr(project, generated)
            self.write_graph(project, [self.node_for(project, generated_path, generated, current=True)], [])
            result = self.run_script("validate", "--root", str(project), check=False)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ok"])
            self.assertIn("missing validation receipts", "\n".join(payload["errors"]))

    def test_default_lookup_excludes_non_current_rejected_graph_and_markdown_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            rejected = self.record_for(1, "Reject Auth0", status="rejected", receipts=["receipt:reject"])
            rejected_path = self.write_adr(project, rejected)
            self.write_graph(project, [self.node_for(project, rejected_path, rejected, current=False)], [])

            default_list = json.loads(self.run_script("list", "--root", str(project)).stdout)
            include_list = json.loads(self.run_script("list", "--root", str(project), "--include-superseded").stdout)
            default_query = json.loads(self.run_script("query", "auth0", "--root", str(project)).stdout)

            self.assertEqual(default_list["count"], 0)
            self.assertEqual(default_query["count"], 0)
            self.assertEqual(include_list["count"], 1)
            self.assertEqual(include_list["records"][0]["adr_id"], "ADR-0001")

        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            rejected = self.record_for(1, "Reject Auth0", status="rejected", receipts=["receipt:reject"])
            self.write_adr(project, rejected)

            default_list = json.loads(self.run_script("list", "--root", str(project)).stdout)
            include_list = json.loads(self.run_script("list", "--root", str(project), "--include-superseded").stdout)

            self.assertEqual(default_list["count"], 0)
            self.assertEqual(include_list["count"], 1)

    def test_validate_graph_requires_source_mode_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            generated = self.record_for(1, "Use Auth0", receipts=["receipt:first"])
            generated_path = self.write_adr(project, generated)
            node = self.node_for(project, generated_path, generated, current=True)
            for field in ["generated_from_topic", "adr_required_source", "source", "source_mode", "legacy_import"]:
                node.pop(field, None)
            self.write_graph(project, [node], [])

            result = self.run_script("validate", "--root", str(project), check=False)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ok"])
            self.assertIn("lacks source metadata", "\n".join(payload["errors"]))

    def test_evaluate_flags_adr_worthy_request_without_options_or_rationale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            payload = json.loads(
                self.run_script("evaluate", "--root", str(project), "--request", "add Auth0 to the project").stdout
            )

            self.assertTrue(payload["ok"])
            self.assertTrue(payload["adr_required"])
            self.assertTrue(payload["needs_user_prompt"])
            self.assertEqual(payload["adr_options_status"], "missing")

    def test_evaluate_rejects_path_traversal_topic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            result = self.run_script("evaluate", "--root", str(project), "--topic", "../secret", check=False)
            payload = json.loads(result.stdout)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Invalid topic name", "\n".join(payload["errors"]))

    def test_create_standalone_adr_writes_markdown_graph_and_lookup_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            create_payload = json.loads(
                self.run_script(
                    "create",
                    "--root",
                    str(project),
                    "--title",
                    "Use Auth0 for Authentication",
                    "--decision",
                    "Use Auth0 as the hosted identity provider.",
                    "--context",
                    "The project needs hosted login and OIDC support.",
                    "--option",
                    "Auth0",
                    "--option",
                    "Self-hosted authentication",
                    "--rationale",
                    "Auth0 has the lowest operations burden.",
                    "--domain",
                    "authentication",
                    "--keyword",
                    "auth",
                    "--keyword",
                    "auth0",
                ).stdout
            )

            self.assertTrue(create_payload["ok"])
            self.assertEqual(create_payload["record"]["adr_id"], "ADR-0001")
            self.assertTrue((project / create_payload["path"]).exists())
            self.assertTrue((project / "docs/adr/_graph/adr.nodes.jsonl").exists())

            list_payload = json.loads(self.run_script("list", "--root", str(project)).stdout)
            query_payload = json.loads(self.run_script("query", "auth", "--root", str(project)).stdout)
            show_payload = json.loads(self.run_script("show", "ADR-0001", "--root", str(project)).stdout)

            self.assertEqual(list_payload["count"], 1)
            self.assertEqual(query_payload["records"][0]["adr_id"], "ADR-0001")
            self.assertEqual(show_payload["record"]["adr_id"], "ADR-0001")
            self.assertEqual(show_payload["sections"]["decision"], "Use Auth0 as the hosted identity provider.")

    def test_create_requires_options_or_rationale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            result = self.run_script(
                "create",
                "--root",
                str(project),
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                check=False,
            )
            payload = json.loads(result.stdout)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requires at least one --option", "\n".join(payload["errors"]))
            self.assertFalse((project / "docs/adr").exists())

    def test_create_requires_search_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            result = self.run_script(
                "create",
                "--root",
                str(project),
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                "--option",
                "Auth0",
                "--rationale",
                "It is the chosen provider.",
                check=False,
            )
            payload = json.loads(result.stdout)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requires at least one --domain", "\n".join(payload["errors"]))
            self.assertFalse((project / "docs/adr").exists())

    def test_create_rolls_back_markdown_when_post_validation_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()

            result = self.run_script(
                "create",
                "--root",
                str(project),
                "--title",
                "Use Legacy Auth",
                "--decision",
                "Use legacy auth.",
                "--context",
                "An accepted-legacy ADR without import note should fail validation.",
                "--option",
                "Legacy auth",
                "--rationale",
                "It was imported.",
                "--domain",
                "authentication",
                "--keyword",
                "legacy",
                "--status",
                "accepted-legacy",
                check=False,
            )
            payload = json.loads(result.stdout)

            self.assertFalse(payload["ok"])
            self.assertFalse((project / "docs/adr").exists())
            self.assertFalse((project / "docs/adr/0001-use-legacy-auth.md").exists())
            self.assertFalse((project / "docs/adr/_graph").exists())

    def test_relate_adds_graph_edge_and_show_reports_relationship(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            for title, decision, keyword in [
                ("Use Auth0 for Authentication", "Use Auth0 as the hosted identity provider.", "auth0"),
                ("Use OIDC Sessions", "Use OIDC sessions with Auth0.", "oidc"),
            ]:
                self.run_script(
                    "create",
                    "--root",
                    str(project),
                    "--title",
                    title,
                    "--decision",
                    decision,
                    "--context",
                    "Authentication integration needs session handling.",
                    "--option",
                    title,
                    "--option",
                    "Custom implementation",
                    "--rationale",
                    "This option matches the selected authentication direction.",
                    "--domain",
                    "authentication",
                    "--keyword",
                    keyword,
                )

            relate_payload = json.loads(
                self.run_script(
                    "relate",
                    "--root",
                    str(project),
                    "--from",
                    "adr:0002",
                    "--to",
                    "adr:0001",
                    "--type",
                    "related_to",
                    "--reason",
                    "Session handling is related to hosted authentication.",
                ).stdout
            )
            show_payload = json.loads(self.run_script("show", "ADR-0002", "--root", str(project)).stdout)

            self.assertTrue(relate_payload["ok"])
            self.assertEqual(show_payload["relationships"]["outgoing"][0]["type"], "related_to")

    def test_relate_supersedes_requires_confirmation_and_updates_currentness(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            for title, decision, keyword in [
                ("Use Auth0", "Use Auth0 as the hosted identity provider.", "auth0"),
                ("Use Internal OIDC", "Use internal OIDC as the identity provider.", "oidc"),
            ]:
                self.run_script(
                    "create",
                    "--root",
                    str(project),
                    "--title",
                    title,
                    "--decision",
                    decision,
                    "--context",
                    "Authentication provider decisions are needed.",
                    "--option",
                    title,
                    "--option",
                    "Alternative provider",
                    "--rationale",
                    "This option best fits current requirements.",
                    "--domain",
                    "authentication",
                    "--keyword",
                    keyword,
                )

            rejected = self.run_script(
                "relate",
                "--root",
                str(project),
                "--from",
                "adr:0002",
                "--to",
                "adr:0001",
                "--type",
                "supersedes",
                "--reason",
                "Provider changed.",
                check=False,
            )
            self.assertFalse(json.loads(rejected.stdout)["ok"])

            accepted = json.loads(
                self.run_script(
                    "relate",
                    "--root",
                    str(project),
                    "--from",
                    "adr:0002",
                    "--to",
                    "adr:0001",
                    "--type",
                    "supersedes",
                    "--reason",
                    "Provider changed.",
                    "--confirm",
                ).stdout
            )
            list_payload = json.loads(self.run_script("list", "--root", str(project)).stdout)
            include_payload = json.loads(self.run_script("list", "--root", str(project), "--include-superseded").stdout)

            self.assertTrue(accepted["ok"])
            self.assertEqual(list_payload["count"], 1)
            self.assertEqual(list_payload["records"][0]["adr_id"], "ADR-0002")
            self.assertEqual(include_payload["count"], 2)

    def test_import_legacy_adr_adds_graph_node_without_receipts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            legacy = self.record_for(1, "Use Legacy Auth", status="accepted-legacy", receipts=[], legacy=True)
            legacy_path = self.write_adr(project, legacy)

            payload = json.loads(
                self.run_script(
                    "import",
                    "--root",
                    str(project),
                    "--path",
                    legacy_path.relative_to(project).as_posix(),
                    "--legacy",
                    "--import-note",
                    "Imported from existing ADR docs.",
                ).stdout
            )

            self.assertTrue(payload["ok"])
            self.assertEqual(payload["record"]["adr_id"], "ADR-0001")
            self.assertTrue((project / "docs/adr/_graph/adr.nodes.jsonl").exists())

    def test_import_rejects_accepted_receiptless_adr_without_legacy_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            generated = self.record_for(1, "Use Auth0", receipts=[])
            generated_path = self.write_adr(project, generated)

            result = self.run_script(
                "import",
                "--root",
                str(project),
                "--path",
                generated_path.relative_to(project).as_posix(),
                check=False,
            )
            payload = json.loads(result.stdout)

            self.assertFalse(payload["ok"])
            self.assertIn("require --legacy", "\n".join(payload["errors"]))
            self.assertFalse((project / "docs/adr/_graph/adr.nodes.jsonl").exists())

    def test_write_topic_missing_search_metadata_leaves_no_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            topic_dir = project / ".plan/demo"
            topic_dir.mkdir(parents=True)
            (topic_dir / "proposal.md").write_text(
                "# demo Proposal\n\nadr_required: true\n\n- Auth0\n- Self-hosted auth\n",
                encoding="utf-8",
            )
            (topic_dir / "receipts.jsonl").write_text(
                json.dumps(
                    {
                        "id": "receipt:final",
                        "type": "validation-receipt",
                        "status": "passed",
                        "commands": [{"command": "npm run check", "result": "passed"}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = self.run_script(
                "write",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                "--option",
                "Auth0",
                "--rationale",
                "It fits the requirements.",
                check=False,
            )
            payload = json.loads(result.stdout)

            self.assertFalse(payload["ok"])
            self.assertIn("requires at least one --domain", "\n".join(payload["errors"]))
            self.assertFalse((project / "docs/adr").exists())

    def test_write_topic_rejects_adr_required_false_even_with_validation_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            topic_dir = project / ".plan/demo"
            topic_dir.mkdir(parents=True)
            (topic_dir / "proposal.md").write_text("# demo Proposal\n\nadr_required: false\n", encoding="utf-8")
            (topic_dir / "receipts.jsonl").write_text(
                json.dumps(
                    {
                        "id": "receipt:final",
                        "type": "validation-receipt",
                        "status": "passed",
                        "commands": [{"command": "npm run check", "result": "passed"}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = self.run_script(
                "write",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                "--option",
                "Auth0",
                "--rationale",
                "It fits the requirements.",
                "--domain",
                "authentication",
                "--keyword",
                "auth0",
                check=False,
            )
            payload = json.loads(result.stdout)

            self.assertFalse(payload["ok"])
            self.assertIn("not marked adr_required", "\n".join(payload["errors"]))
            self.assertFalse((project / "docs/adr").exists())
            self.assertFalse((project / "docs/adr/0001-use-auth0.md").exists())

    def test_draft_requires_workflow_receipts_for_accepted_topic_adr(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            topic_dir = project / ".plan/demo"
            topic_dir.mkdir(parents=True)
            (topic_dir / "proposal.md").write_text(
                "# demo Proposal\n\nadr_required: true\n\n## Considered Options\n\n- Auth0\n- Self-hosted auth\n",
                encoding="utf-8",
            )
            failed = self.run_script(
                "draft",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                "--option",
                "Auth0",
                "--rationale",
                "It fits the requirements.",
                "--domain",
                "authentication",
                "--keyword",
                "auth0",
                check=False,
            )
            self.assertFalse(json.loads(failed.stdout)["ok"])

            (topic_dir / "receipts.jsonl").write_text(
                json.dumps(
                    {
                        "id": "receipt:review",
                        "type": "review-receipt",
                        "status": "passed",
                        "commands": [{"command": "npm run check", "result": "passed"}],
                        "verification": {"validation": ["npm run check"]},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            review_only_failed = self.run_script(
                "draft",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                "--option",
                "Auth0",
                "--rationale",
                "It fits the requirements.",
                "--domain",
                "authentication",
                "--keyword",
                "auth0",
                check=False,
            )
            self.assertFalse(json.loads(review_only_failed.stdout)["ok"])

            (topic_dir / "receipts.jsonl").write_text(
                json.dumps({"id": "receipt:empty", "type": "validation-receipt", "status": "passed", "commands": []})
                + "\n"
                + json.dumps(
                    {"id": "receipt:blank", "type": "validation-receipt", "status": "passed", "commands": [{}]}
                )
                + "\n",
                encoding="utf-8",
            )
            empty_receipt_failed = self.run_script(
                "draft",
                "--root",
                str(project),
                "--topic",
                "demo",
                "--title",
                "Use Auth0",
                "--decision",
                "Use Auth0.",
                "--context",
                "Authentication is needed.",
                "--option",
                "Auth0",
                "--rationale",
                "It fits the requirements.",
                "--domain",
                "authentication",
                "--keyword",
                "auth0",
                check=False,
            )
            self.assertFalse(json.loads(empty_receipt_failed.stdout)["ok"])

            (topic_dir / "receipts.jsonl").write_text(
                json.dumps({"id": "receipt:review", "type": "review-receipt", "status": "passed"})
                + "\n"
                + json.dumps(
                    {
                        "id": "receipt:final",
                        "type": "validation-receipt",
                        "status": "passed",
                        "commands": [{"command": "npm run check", "result": "passed"}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            ok_payload = json.loads(
                self.run_script(
                    "draft",
                    "--root",
                    str(project),
                    "--topic",
                    "demo",
                    "--title",
                    "Use Auth0",
                    "--decision",
                    "Use Auth0.",
                    "--context",
                    "Authentication is needed.",
                    "--option",
                    "Auth0",
                    "--rationale",
                    "It fits the requirements.",
                    "--domain",
                    "authentication",
                    "--keyword",
                    "auth0",
                ).stdout
            )
            self.assertTrue(ok_payload["ok"])
            self.assertEqual(ok_payload["draft"]["validation_receipts"], ["receipt:final"])

            derived_payload = json.loads(
                self.run_script(
                    "draft",
                    "--root",
                    str(project),
                    "--topic",
                    "demo",
                ).stdout
            )
            self.assertTrue(derived_payload["ok"])
            self.assertEqual(derived_payload["draft"]["generated_from_topic"], "demo")
            self.assertIn("Auth0", derived_payload["sections"]["Considered Options"])


if __name__ == "__main__":
    unittest.main()
