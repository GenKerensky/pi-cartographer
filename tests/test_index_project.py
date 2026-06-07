from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/index-project/scripts/index_project.py"


class IndexProjectTests(unittest.TestCase):
    def run_script(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=True,
        )

    def make_project(self, root: Path) -> None:
        (root / "src").mkdir()
        (root / "docs").mkdir()
        (root / "node_modules/pkg").mkdir(parents=True)
        (root / ".plan/old").mkdir(parents=True)
        (root / "package.json").write_text(
            json.dumps(
                {
                    "dependencies": {"astro": "^5.0.0"},
                    "devDependencies": {"typescript": "^5.0.0"},
                }
            ),
            encoding="utf-8",
        )
        (root / "package-lock.json").write_text('{"lockfileVersion":3}\n', encoding="utf-8")
        (root / "README.md").write_text(
            "# Sample Project\n\n## Goals\nBuild a searchable catalog.\n\n[Guide](docs/guide.md)\n",
            encoding="utf-8",
        )
        (root / "src/index.ts").write_text(
            'import { helper } from "./util";\nexport function main() { return helper("catalog"); }\n',
            encoding="utf-8",
        )
        (root / "src/util.ts").write_text(
            "export const helper = (value: string) => `search ${value}`;\n",
            encoding="utf-8",
        )
        (root / "src/settings.ts").write_text(
            "export function loadUserSettings() { return { theme: 'dark' }; }\n",
            encoding="utf-8",
        )
        (root / "docs/guide.md").write_text(
            "# Guide\n\nThis guide documents the helper function and links to [index](../src/index.ts).\n",
            encoding="utf-8",
        )
        (root / "node_modules/pkg/index.js").write_text("ignored dependency\n", encoding="utf-8")
        (root / ".plan/old/proposal.md").write_text("ignored plan\n", encoding="utf-8")

    def test_index_query_and_slice_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            self.make_project(project)

            index_result = self.run_script("index", "--root", str(project), "--no-git-root", "--json")
            summary = json.loads(index_result.stdout)
            self.assertEqual(summary["files_seen"], 6)
            self.assertTrue(summary["gitignore_updated"])
            self.assertIn(".plan/_index/", (project / ".gitignore").read_text(encoding="utf-8"))
            self.assertTrue((project / ".plan/_index/project-graph.sqlite").exists())
            self.assertTrue((project / ".plan/_index/project-graph-manifest.json").exists())

            conn = sqlite3.connect(project / ".plan/_index/project-graph.sqlite")
            files = [row[0] for row in conn.execute("SELECT path FROM files ORDER BY path")]
            self.assertEqual(
                files,
                ["README.md", "docs/guide.md", "package.json", "src/index.ts", "src/settings.ts", "src/util.ts"],
            )
            self.assertFalse(any(path.startswith("node_modules/") or path.startswith(".plan/") for path in files))
            self.assertNotIn("package-lock.json", files)
            imports = list(conn.execute("SELECT from_id, to_id, type FROM edges WHERE type = 'imports'"))
            references = list(conn.execute("SELECT from_id, to_id, type FROM edges WHERE type = 'references'"))
            self.assertIn(("file:src/index.ts", "file:src/util.ts", "imports"), imports)
            self.assertIn(("file:docs/guide.md", "file:src/index.ts", "references"), references)

            query_result = self.run_script(
                "query",
                "--root",
                str(project),
                "--no-git-root",
                "--topic",
                "helper function",
                "--limit",
                "5",
                "--json",
            )
            query = json.loads(query_result.stdout)
            paths = {item["path"] for item in query}
            self.assertIn("src/index.ts", paths)
            self.assertIn("docs/guide.md", paths)
            self.assertIn("src/util.ts", paths)
            self.assertTrue(all(item.get("candidate") for item in query))
            self.assertTrue(all(item.get("verification", {}).get("read") for item in query))
            util_match = next(match for item in query if item["path"] == "src/util.ts" for match in item["matches"])
            self.assertTrue(util_match.get("verification", {}).get("rg"))
            self.assertTrue(
                any(
                    structure["node_id"].startswith("symbol:src/util.ts#helper")
                    for structure in util_match["structural_matches"]
                )
            )

            identifier_result = self.run_script(
                "query",
                "--root",
                str(project),
                "--no-git-root",
                "--topic",
                "load user settings",
                "--limit",
                "3",
                "--json",
            )
            identifier_query = json.loads(identifier_result.stdout)
            self.assertTrue(identifier_query)
            self.assertEqual(identifier_query[0]["path"], "src/settings.ts")
            self.assertTrue(
                any(
                    structure["node_id"].startswith("symbol:src/settings.ts#loadUserSettings")
                    for structure in identifier_query[0]["matches"][0]["structural_matches"]
                )
            )

            filtered_result = self.run_script(
                "query",
                "--root",
                str(project),
                "--no-git-root",
                "--topic",
                "helper function",
                "--path-prefix",
                "docs",
                "--limit",
                "5",
                "--json",
            )
            filtered = json.loads(filtered_result.stdout)
            self.assertTrue(filtered)
            self.assertTrue(all(item["path"].startswith("docs/") for item in filtered))

            out_dir = project / ".plan/helper-function"
            self.run_script(
                "slice-jsonl",
                "--root",
                str(project),
                "--no-git-root",
                "--topic",
                "helper function",
                "--out-dir",
                str(out_dir),
                "--limit",
                "5",
            )
            self.assertFalse((out_dir / "map.graph.json").exists())
            node_lines = (out_dir / "map.nodes.jsonl").read_text(encoding="utf-8").splitlines()
            edge_lines = (out_dir / "map.edges.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertTrue(node_lines)
            self.assertTrue(edge_lines)
            nodes = [json.loads(line) for line in node_lines]
            edges = [json.loads(line) for line in edge_lines]
            self.assertTrue(any(node["id"] == "topic:helper-function" for node in nodes))
            relevant_edges = [edge for edge in edges if edge["type"] == "relevant_to"]
            self.assertTrue(relevant_edges)
            self.assertTrue(any(edge.get("candidate") for edge in relevant_edges))
            self.assertTrue(any(edge.get("verification", {}).get("read") for edge in relevant_edges))

            read_result = self.run_script(
                "read",
                "--root",
                str(project),
                "--no-git-root",
                "--path",
                "src/index.ts",
                "--json",
            )
            read_payload = json.loads(read_result.stdout)
            self.assertEqual(read_payload["file"]["path"], "src/index.ts")
            self.assertTrue(any(node["id"] == "file:src/index.ts" for node in read_payload["nodes"]))
            self.assertTrue(read_payload["edges"])

            ensure_result = self.run_script("ensure", "--root", str(project), "--no-git-root", "--json")
            ensure_payload = json.loads(ensure_result.stdout)
            self.assertEqual(ensure_payload["action"], "fresh")
            self.assertFalse(ensure_payload["gitignore_updated"])
            (project / "src/util.ts").write_text("export function helper() { return 'changed'; }\n", encoding="utf-8")
            stale_result = self.run_script("ensure", "--root", str(project), "--no-git-root", "--json")
            stale_payload = json.loads(stale_result.stdout)
            self.assertEqual(stale_payload["action"], "reindexed")
            self.assertFalse(stale_payload["after"]["stale"])

    def test_incremental_update_removes_deleted_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            self.make_project(project)
            self.run_script("index", "--root", str(project), "--no-git-root", "--json")
            second = json.loads(self.run_script("index", "--root", str(project), "--no-git-root", "--json").stdout)
            self.assertEqual(second["files_indexed"], 0)
            self.assertEqual(second["files_skipped_unchanged"], 6)

            (project / "src/index.ts").unlink()
            third = json.loads(self.run_script("index", "--root", str(project), "--no-git-root", "--json").stdout)
            self.assertEqual(third["files_removed"], 1)
            conn = sqlite3.connect(project / ".plan/_index/project-graph.sqlite")
            self.assertFalse(conn.execute("SELECT 1 FROM files WHERE path = 'src/index.ts'").fetchone())


if __name__ == "__main__":
    unittest.main()
