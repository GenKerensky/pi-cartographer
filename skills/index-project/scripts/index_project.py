#!/usr/bin/env python3
"""Build and query a shared SQLite + FTS5 project graph index.

This script is intentionally stdlib-only so a Pi skill can run it in most
Python-enabled repositories without installing dependencies.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fnmatch
import hashlib
import json
import os
import posixpath
import re
import shlex
import sqlite3
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 2
DEFAULT_DB_REL = ".plan/_index/project-graph.sqlite"
DEFAULT_MANIFEST_REL = ".plan/_index/project-graph-manifest.json"

EXCLUDED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".plan",
    ".astro",
    ".cache",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "bower_components",
    "dist",
    "build",
    "out",
    "coverage",
    "__pycache__",
}

EXCLUDED_FILENAMES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
}

INCLUDED_EXTENSIONS = {
    ".astro",
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".lua",
    ".md",
    ".mdx",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".vue",
    ".xml",
    ".yaml",
    ".yml",
}

INCLUDED_FILENAMES = {
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "README",
    "README.md",
    "package.json",
    "tsconfig.json",
    "jsconfig.json",
    "astro.config.mjs",
    "vite.config.ts",
    "vite.config.js",
    "next.config.js",
    "next.config.mjs",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
}

LANGUAGE_BY_EXT = {
    ".astro": "astro",
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".css": "css",
    ".go": "go",
    ".h": "c",
    ".hpp": "cpp",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript-react",
    ".kt": "kotlin",
    ".lua": "lua",
    ".md": "markdown",
    ".mdx": "mdx",
    ".php": "php",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scss": "scss",
    ".sh": "shell",
    ".sql": "sql",
    ".svelte": "svelte",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript-react",
    ".vue": "vue",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
}

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "with",
}

IMPORT_RE = re.compile(
    r"(?:import\s+(?:[^'\"]+?\s+from\s+)?|export\s+[^'\"]+?\s+from\s+|require\(|import\()"
    r"['\"]([^'\"]+)['\"]"
)
PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+([\w\.]+)\s+import\s+|import\s+([\w\.]+))", re.MULTILINE)
MD_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)\s#]+)(?:#[^)]+)?\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
PY_SYMBOL_RE = re.compile(r"^\s*(?:async\s+def|def|class)\s+([A-Za-z_][\w]*)", re.MULTILINE)
JS_SYMBOL_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|"
    r"class\s+([A-Za-z_$][\w$]*)|"
    r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)",
    re.MULTILINE,
)
RUST_SYMBOL_RE = re.compile(r"^\s*(?:pub\s+)?(?:fn|struct|enum|trait|impl)\s+([A-Za-z_][\w]*)", re.MULTILINE)
GO_SYMBOL_RE = re.compile(r"^\s*(?:func|type)\s+([A-Za-z_][\w]*)", re.MULTILINE)


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def rel_path(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def file_node_id(path: str) -> str:
    return f"file:{path}"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "section"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def detect_language(path: Path) -> str:
    return LANGUAGE_BY_EXT.get(path.suffix.lower(), path.suffix.lower().lstrip(".") or "text")


def should_include(path: Path, root: Path, max_bytes: int) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    if any(part in EXCLUDED_DIRS for part in rel.parts[:-1]):
        return False
    if path.name in EXCLUDED_FILENAMES:
        return False
    if path.name in INCLUDED_FILENAMES:
        pass
    elif path.suffix.lower() not in INCLUDED_EXTENSIONS:
        return False
    try:
        stat = path.stat()
    except OSError:
        return False
    if stat.st_size > max_bytes:
        return False
    return stat.st_size != 0


def find_project_root(start: Path) -> Path:
    start = start.resolve()
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return start


def scan_files(root: Path, max_bytes: int) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        try:
            rel = current.relative_to(root)
        except ValueError:
            continue
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        for name in filenames:
            path = current / name
            if should_include(path, root, max_bytes):
                files.append(path)
    return sorted(files)


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=OFF")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            size INTEGER NOT NULL,
            mtime_ns INTEGER NOT NULL,
            hash TEXT NOT NULL,
            language TEXT NOT NULL,
            indexed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            path TEXT,
            start_line INTEGER,
            end_line INTEGER,
            hash TEXT,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS edges (
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            type TEXT NOT NULL,
            evidence_path TEXT,
            evidence_line INTEGER,
            confidence REAL NOT NULL DEFAULT 1.0,
            metadata TEXT,
            PRIMARY KEY (from_id, to_id, type, evidence_path, evidence_line)
        );

        CREATE TABLE IF NOT EXISTS chunks (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            path TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            text TEXT NOT NULL,
            summary TEXT,
            token_count INTEGER NOT NULL,
            hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            root TEXT NOT NULL,
            files_seen INTEGER NOT NULL,
            files_indexed INTEGER NOT NULL,
            files_removed INTEGER NOT NULL,
            settings TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
        CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
        CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
        CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
        CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
        """
    )
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED, path, title, text, summary)"
        )
    except sqlite3.OperationalError as exc:
        raise SystemExit(f"SQLite FTS5 is not available in this Python sqlite3 build: {exc}") from exc
    conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
    conn.commit()


def reset_database(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS chunks_fts;
        DROP TABLE IF EXISTS runs;
        DROP TABLE IF EXISTS chunks;
        DROP TABLE IF EXISTS edges;
        DROP TABLE IF EXISTS nodes;
        DROP TABLE IF EXISTS files;
        """
    )
    ensure_schema(conn)


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def line_for_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def insert_node(
    conn: sqlite3.Connection,
    node_id: str,
    node_type: str,
    title: str,
    description: str,
    path: str | None,
    start_line: int | None,
    end_line: int | None,
    content_hash: str | None,
    metadata: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO nodes
        (id, type, title, description, path, start_line, end_line, hash, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            node_id,
            node_type,
            title[:240],
            description[:1000],
            path,
            start_line,
            end_line,
            content_hash,
            json_dumps(metadata or {}),
        ),
    )


def insert_edge(
    conn: sqlite3.Connection,
    from_id: str,
    to_id: str,
    edge_type: str,
    evidence_path: str | None,
    evidence_line: int | None,
    confidence: float = 1.0,
    metadata: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO edges
        (from_id, to_id, type, evidence_path, evidence_line, confidence, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (from_id, to_id, edge_type, evidence_path, evidence_line, confidence, json_dumps(metadata or {})),
    )


def delete_file_records(conn: sqlite3.Connection, path: str) -> None:
    chunk_ids = [row["id"] for row in conn.execute("SELECT id FROM chunks WHERE path = ?", (path,))]
    if chunk_ids:
        placeholders = ",".join("?" for _ in chunk_ids)
        conn.execute(f"DELETE FROM chunks_fts WHERE chunk_id IN ({placeholders})", chunk_ids)
    node_ids = [row["id"] for row in conn.execute("SELECT id FROM nodes WHERE path = ?", (path,))]
    if node_ids:
        placeholders = ",".join("?" for _ in node_ids)
        conn.execute(f"DELETE FROM edges WHERE from_id IN ({placeholders})", node_ids)
        conn.execute(f"DELETE FROM edges WHERE to_id IN ({placeholders})", node_ids)
    conn.execute("DELETE FROM edges WHERE evidence_path = ?", (path,))
    conn.execute("DELETE FROM chunks WHERE path = ?", (path,))
    conn.execute("DELETE FROM nodes WHERE path = ?", (path,))
    conn.execute("DELETE FROM files WHERE path = ?", (path,))


def summarize_text(text: str, max_chars: int = 240) -> str:
    collapsed = " ".join(line.strip() for line in text.splitlines() if line.strip())
    if len(collapsed) <= max_chars:
        return collapsed
    return collapsed[: max_chars - 1].rstrip() + "…"


def chunk_lines(lines: list[str], chunk_size: int = 120, overlap: int = 15) -> Iterable[tuple[int, int, str]]:
    if not lines:
        return
    step = max(1, chunk_size - overlap)
    start = 0
    while start < len(lines):
        end = min(len(lines), start + chunk_size)
        text = "\n".join(lines[start:end]).strip()
        if text:
            yield start + 1, end, text
        if end == len(lines):
            break
        start += step


def structure_aware_chunk_lines(
    lines: list[str], nodes: list[dict[str, Any]], chunk_size: int = 120, overlap: int = 15
) -> Iterable[tuple[int, int, str]]:
    """Split files at symbols/headings before falling back to overlapping windows.

    This keeps high-value structural units together and avoids returning the same
    rigid 120-line window for every nearby symbol in a file.
    """
    if not lines:
        return
    boundaries = {1, len(lines) + 1}
    for node in nodes:
        start_line = node.get("start_line")
        if isinstance(start_line, int) and 1 <= start_line <= len(lines):
            boundaries.add(start_line)
    ordered = sorted(boundaries)
    yielded = False
    for left, right in zip(ordered, ordered[1:], strict=False):
        if left >= right:
            continue
        segment = lines[left - 1 : right - 1]
        if not any(line.strip() for line in segment):
            continue
        if len(segment) <= chunk_size:
            text = "\n".join(segment).strip()
            if text:
                yielded = True
                yield left, right - 1, text
            continue
        for start, end, text in chunk_lines(segment, chunk_size=chunk_size, overlap=overlap):
            yielded = True
            yield left + start - 1, left + end - 1, text
    if not yielded:
        yield from chunk_lines(lines, chunk_size=chunk_size, overlap=overlap)


def markdown_headings(text: str, path: str, content_hash: str) -> list[dict[str, Any]]:
    lines = text.splitlines()
    headings: list[dict[str, Any]] = []
    for index, line in enumerate(lines, start=1):
        match = HEADING_RE.match(line)
        if not match:
            continue
        level = len(match.group(1))
        title = match.group(2).strip().strip("#").strip()
        slug = slugify(title)
        node_id = f"doc:{path}#{slug}:{index}"
        headings.append(
            {
                "id": node_id,
                "type": "doc-section",
                "title": title,
                "description": f"Markdown heading level {level} in {path}.",
                "path": path,
                "start_line": index,
                "end_line": index,
                "hash": content_hash,
                "metadata": {"level": level, "slug": slug},
            }
        )
    return headings


def code_symbols(text: str, path: str, language: str, content_hash: str) -> list[dict[str, Any]]:
    if language == "python":
        regex = PY_SYMBOL_RE
    elif language in {"javascript", "javascript-react", "typescript", "typescript-react", "astro", "svelte", "vue"}:
        regex = JS_SYMBOL_RE
    elif language == "rust":
        regex = RUST_SYMBOL_RE
    elif language == "go":
        regex = GO_SYMBOL_RE
    else:
        return []

    symbols: list[dict[str, Any]] = []
    for match in regex.finditer(text):
        name = next((group for group in match.groups() if group), None)
        if not name:
            continue
        line = line_for_offset(text, match.start())
        node_id = f"symbol:{path}#{name}:{line}"
        symbols.append(
            {
                "id": node_id,
                "type": "symbol",
                "title": name,
                "description": f"Symbol `{name}` defined in {path}.",
                "path": path,
                "start_line": line,
                "end_line": line,
                "hash": content_hash,
                "metadata": {"language": language},
            }
        )
    return symbols


def index_file(conn: sqlite3.Connection, root: Path, path: Path, content_hash: str, size: int, mtime_ns: int) -> None:
    rel = rel_path(root, path)
    language = detect_language(path)
    text = read_text(path)
    lines = text.splitlines()
    indexed_at = utc_now()

    delete_file_records(conn, rel)

    conn.execute(
        "INSERT OR REPLACE INTO files(path, size, mtime_ns, hash, language, indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
        (rel, size, mtime_ns, content_hash, language, indexed_at),
    )

    insert_node(
        conn,
        file_node_id(rel),
        "file",
        path.name,
        f"Indexed {language} file at {rel}.",
        rel,
        1,
        max(1, len(lines)),
        content_hash,
        {"language": language, "size": size},
    )

    nodes: list[dict[str, Any]] = []
    if language in {"markdown", "mdx"}:
        nodes.extend(markdown_headings(text, rel, content_hash))
    nodes.extend(code_symbols(text, rel, language, content_hash))

    for node in nodes:
        insert_node(
            conn,
            node["id"],
            node["type"],
            node["title"],
            node["description"],
            node["path"],
            node["start_line"],
            node["end_line"],
            node["hash"],
            node["metadata"],
        )

    for start_line, end_line, chunk_text in structure_aware_chunk_lines(lines, nodes):
        chunk_hash = sha256_bytes(chunk_text.encode("utf-8"))
        chunk_id = f"chunk:{rel}:{start_line}-{end_line}:{chunk_hash[:10]}"
        summary = summarize_text(chunk_text)
        token_count = max(1, len(chunk_text) // 4)
        conn.execute(
            """
            INSERT OR REPLACE INTO chunks
            (id, node_id, path, start_line, end_line, text, summary, token_count, hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (chunk_id, file_node_id(rel), rel, start_line, end_line, chunk_text, summary, token_count, chunk_hash),
        )
        conn.execute(
            "INSERT INTO chunks_fts(chunk_id, path, title, text, summary) VALUES (?, ?, ?, ?, ?)",
            (chunk_id, rel, path.name, identifier_search_text(chunk_text), summary),
        )


def normalize_project_path(path: str) -> str:
    """Normalize a project-relative POSIX path without making it absolute."""
    normalized = posixpath.normpath(path.replace("\\", "/"))
    return "" if normalized == "." else normalized


def resolve_relative_import(source_rel: str, specifier: str, known_paths: set[str]) -> str | None:
    if not specifier.startswith("."):
        return None
    source_dir = Path(source_rel).parent.as_posix()
    candidate = normalize_project_path(posixpath.join(source_dir, specifier))
    variants = [candidate]
    for ext in INCLUDED_EXTENSIONS:
        variants.append(candidate + ext)
    for ext in INCLUDED_EXTENSIONS:
        variants.append(normalize_project_path(posixpath.join(candidate, f"index{ext}")))
    for variant in variants:
        normalized = normalize_project_path(variant)
        if normalized in known_paths:
            return normalized
    return None


def resolve_markdown_link(source_rel: str, target: str, known_paths: set[str]) -> str | None:
    if target.startswith(("http://", "https://", "mailto:", "#")):
        return None
    source_dir = Path(source_rel).parent.as_posix()
    candidate = normalize_project_path(posixpath.join(source_dir, target))
    if candidate in known_paths:
        return candidate
    if target.endswith("/"):
        for name in ("README.md", "index.md"):
            variant = normalize_project_path(posixpath.join(candidate, name))
            if variant in known_paths:
                return variant
    return None


def package_dependencies(text: str) -> dict[str, str]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    deps: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        value = data.get(key)
        if isinstance(value, dict):
            for name, version in value.items():
                deps[str(name)] = str(version)
    return deps


def ensure_index_gitignore(root: Path) -> bool:
    """Ensure the generated SQLite index directory is ignored by Git."""
    gitignore_path = root / ".gitignore"
    desired = ".plan/_index/"
    try:
        existing = gitignore_path.read_text(encoding="utf-8") if gitignore_path.exists() else ""
    except OSError:
        return False
    lines = [line.strip() for line in existing.splitlines()]
    if desired in lines or desired.rstrip("/") in lines:
        return False

    addition = desired + "\n"
    if existing and not existing.endswith("\n"):
        addition = "\n" + addition
    try:
        gitignore_path.write_text(existing + addition, encoding="utf-8")
    except OSError:
        return False
    return True


def rebuild_edges(conn: sqlite3.Connection, root: Path, paths: list[Path]) -> int:
    conn.execute("DELETE FROM edges")
    known_paths = {rel_path(root, path) for path in paths}
    edge_count = 0

    for path in paths:
        rel = rel_path(root, path)
        fnode = file_node_id(rel)
        language = detect_language(path)
        try:
            text = read_text(path)
        except OSError:
            continue

        for row in conn.execute("SELECT id, type, start_line FROM nodes WHERE path = ? AND id != ?", (rel, fnode)):
            insert_edge(conn, fnode, row["id"], "contains", rel, row["start_line"], 1.0, {"node_type": row["type"]})
            edge_count += 1

        if language in {"javascript", "javascript-react", "typescript", "typescript-react", "astro", "svelte", "vue"}:
            for match in IMPORT_RE.finditer(text):
                spec = match.group(1)
                target = resolve_relative_import(rel, spec, known_paths)
                if target:
                    insert_edge(
                        conn,
                        fnode,
                        file_node_id(target),
                        "imports",
                        rel,
                        line_for_offset(text, match.start()),
                        0.95,
                        {"specifier": spec},
                    )
                    edge_count += 1

        if language == "python":
            for match in PY_IMPORT_RE.finditer(text):
                module = match.group(1) or match.group(2) or ""
                module_path = module.replace(".", "/") + ".py"
                if module_path in known_paths:
                    insert_edge(
                        conn,
                        fnode,
                        file_node_id(module_path),
                        "imports",
                        rel,
                        line_for_offset(text, match.start()),
                        0.75,
                        {"module": module},
                    )
                    edge_count += 1

        if language in {"markdown", "mdx"}:
            for match in MD_LINK_RE.finditer(text):
                target = resolve_markdown_link(rel, match.group(1), known_paths)
                if target:
                    insert_edge(
                        conn,
                        fnode,
                        file_node_id(target),
                        "references",
                        rel,
                        line_for_offset(text, match.start()),
                        0.9,
                        {"href": match.group(1)},
                    )
                    edge_count += 1

        if rel == "package.json":
            for name, version in package_dependencies(text).items():
                dep_id = f"dependency:npm:{name}"
                insert_node(
                    conn,
                    dep_id,
                    "dependency",
                    name,
                    f"npm dependency declared in package.json ({version}).",
                    "package.json",
                    None,
                    None,
                    None,
                    {"ecosystem": "npm", "version": version},
                )
                insert_edge(conn, fnode, dep_id, "declares_dependency", rel, None, 1.0, {"version": version})
                edge_count += 1

    return edge_count


def index_project(args: argparse.Namespace) -> None:
    root = find_project_root(Path(args.root)) if args.git_root else Path(args.root).resolve()
    gitignore_updated = ensure_index_gitignore(root)
    db_path = root / DEFAULT_DB_REL
    manifest_path = root / DEFAULT_MANIFEST_REL
    conn = connect(db_path)
    if args.rebuild:
        reset_database(conn)
    else:
        ensure_schema(conn)

    paths = scan_files(root, args.max_bytes)
    seen_rel = {rel_path(root, path) for path in paths}
    existing = {row["path"]: row["hash"] for row in conn.execute("SELECT path, hash FROM files")}

    removed = sorted(set(existing) - seen_rel)
    for rel in removed:
        delete_file_records(conn, rel)

    indexed = 0
    skipped = 0
    for path in paths:
        rel = rel_path(root, path)
        try:
            data = path.read_bytes()
            stat = path.stat()
        except OSError:
            continue
        content_hash = sha256_bytes(data)
        if existing.get(rel) == content_hash and not args.force:
            skipped += 1
            continue
        index_file(conn, root, path, content_hash, stat.st_size, stat.st_mtime_ns)
        indexed += 1

    edges = rebuild_edges(conn, root, paths)
    settings = {
        "schema_version": SCHEMA_VERSION,
        "max_bytes": args.max_bytes,
        "excluded_dirs": sorted(EXCLUDED_DIRS),
        "excluded_filenames": sorted(EXCLUDED_FILENAMES),
        "included_extensions": sorted(INCLUDED_EXTENSIONS),
    }
    conn.execute(
        "INSERT INTO runs(created_at, root, files_seen, files_indexed, files_removed, settings) VALUES (?, ?, ?, ?, ?, ?)",
        (utc_now(), str(root), len(paths), indexed, len(removed), json_dumps(settings)),
    )
    conn.commit()

    counts = get_counts(conn)
    manifest = {
        "generated_at": utc_now(),
        "root": str(root),
        "database": DEFAULT_DB_REL,
        "schema_version": SCHEMA_VERSION,
        "files_seen": len(paths),
        "files_indexed": indexed,
        "files_skipped_unchanged": skipped,
        "files_removed": len(removed),
        "edges_rebuilt": edges,
        "gitignore_updated": gitignore_updated,
        "counts": counts,
        "settings": settings,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(json.dumps(manifest, indent=2, sort_keys=True) if args.json else format_index_summary(manifest))


def get_counts(conn: sqlite3.Connection) -> dict[str, int]:
    tables = ["files", "nodes", "edges", "chunks", "runs"]
    counts = {table: int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]) for table in tables}
    counts["chunks_fts"] = int(conn.execute("SELECT COUNT(*) FROM chunks_fts").fetchone()[0])
    return counts


def format_index_summary(manifest: dict[str, Any]) -> str:
    counts = manifest["counts"]
    return "\n".join(
        [
            "Project index updated.",
            f"  root: {manifest['root']}",
            f"  database: {manifest['database']}",
            f"  files seen: {manifest['files_seen']}",
            f"  indexed: {manifest['files_indexed']}",
            f"  skipped unchanged: {manifest['files_skipped_unchanged']}",
            f"  removed: {manifest['files_removed']}",
            f"  nodes: {counts['nodes']}",
            f"  edges: {counts['edges']}",
            f"  chunks: {counts['chunks']}",
            f"  fts rows: {counts['chunks_fts']}",
        ]
    )


def fts_tokens(topic: str) -> list[str]:
    tokens = [t.lower() for t in re.findall(r"[A-Za-z0-9_]{2,}", topic) if t.lower() not in STOP_WORDS]
    if not tokens:
        tokens = [t.lower() for t in re.findall(r"[A-Za-z0-9_]+", topic)]
    tokens = [re.sub(r"[^A-Za-z0-9_]", "", t) for t in tokens]
    return [t for t in tokens if t][:12]


def fts_query(topic: str, mode: str = "AND") -> str:
    tokens = fts_tokens(topic)
    if not tokens:
        return '""'
    joiner = " AND " if mode.upper() == "AND" and len(tokens) > 1 else " OR "
    return joiner.join(f"{token}*" for token in tokens)


def split_identifier(value: str) -> list[str]:
    """Return lowercase lexical and camel/snake-case parts for code identifiers."""
    parts: list[str] = []
    for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]*|[0-9]+", value):
        pieces = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", token.replace("_", " ")).split()
        parts.extend(piece.lower() for piece in pieces if piece)
        parts.append(token.lower())
    return [part for part in parts if part and part not in STOP_WORDS]


def identifier_search_text(text: str) -> str:
    """Append identifier parts so FTS can match camelCase/snake_case by concept."""
    parts = split_identifier(text)
    return text if not parts else f"{text}\n{' '.join(parts)}"


def identifier_query_tokens(topic: str) -> list[str]:
    tokens: list[str] = []
    for raw in re.findall(r"[A-Za-z0-9_]{2,}", topic):
        tokens.extend(split_identifier(raw))
    seen: set[str] = set()
    unique: list[str] = []
    for token in tokens:
        if token not in seen:
            seen.add(token)
            unique.append(token)
    return unique[:16]


def exact_token_count(tokens: list[str], text: str) -> int:
    if not tokens or not text:
        return 0
    haystack = {part.lower() for part in re.findall(r"[A-Za-z0-9_]+", text)}
    haystack.update(split_identifier(text))
    return sum(1 for token in tokens if token in haystack)


def normalized_chunk_signature(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    normalized = re.sub(r"[^a-z0-9_ ]+", "", normalized)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def verification_for_match(path: str, start_line: int, end_line: int, tokens: list[str]) -> dict[str, Any]:
    rg_terms = [token for token in tokens if len(token) >= 2][:5]
    return {
        "read": {"path": path, "start_line": start_line, "end_line": end_line},
        "rg": [f"rg -n --fixed-strings {shlex.quote(term)} -- {shlex.quote(path)}" for term in rg_terms],
    }


def structural_matches_for_chunk(
    conn: sqlite3.Connection, path: str, start_line: int, end_line: int, tokens: list[str]
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, type, title, path, start_line, end_line
        FROM nodes
        WHERE path = ?
          AND type IN ('symbol', 'doc-section')
          AND start_line BETWEEN ? AND ?
        ORDER BY start_line ASC
        LIMIT 8
        """,
        (path, start_line, end_line),
    ).fetchall()
    matches: list[dict[str, Any]] = []
    for row in rows:
        title_hits = exact_token_count(tokens, row["title"] or "")
        matches.append(
            {
                "node_id": row["id"],
                "node_type": row["type"],
                "title": row["title"],
                "reference": f"{row['path']}:{row['start_line']}",
                "token_hits": title_hits,
            }
        )
    return matches


def parse_multi_arg(values: Any) -> list[str]:
    if not values:
        return []
    raw_values = [values] if isinstance(values, str) else list(values)
    items: list[str] = []
    for value in raw_values:
        for part in str(value).split(","):
            part = part.strip()
            if part:
                items.append(part)
    return items


def path_matches_prefix(path: str, prefix: str) -> bool:
    prefix = normalize_project_path(prefix)
    if prefix == "":
        return True
    return path == prefix or path.startswith(prefix.rstrip("/") + "/")


def path_is_allowed(path: str, args: argparse.Namespace) -> bool:
    prefixes = parse_multi_arg(getattr(args, "path_prefix", []))
    excludes = parse_multi_arg(getattr(args, "exclude", []))
    if prefixes and not any(path_matches_prefix(path, prefix) for prefix in prefixes):
        return False
    for pattern in excludes:
        normalized = normalize_project_path(pattern)
        if fnmatch.fnmatch(path, normalized) or path_matches_prefix(path, normalized):
            return False
    return True


def eligible_paths_for_types(conn: sqlite3.Connection, args: argparse.Namespace) -> set[str] | None:
    node_types = parse_multi_arg(getattr(args, "node_types", []))
    if not node_types:
        return None
    placeholders = ",".join("?" for _ in node_types)
    rows = conn.execute(
        f"SELECT DISTINCT path FROM nodes WHERE type IN ({placeholders}) AND path IS NOT NULL", node_types
    ).fetchall()
    return {row["path"] for row in rows}


def load_metadata(value: Any) -> Any:
    if not value:
        return {}
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def query_index(args: argparse.Namespace) -> list[dict[str, Any]]:
    root = find_project_root(Path(args.root)) if args.git_root else Path(args.root).resolve()
    db_path = root / DEFAULT_DB_REL
    if not db_path.exists():
        raise SystemExit(f"Index database not found: {db_path}. Run the index command first.")
    conn = connect(db_path)
    ensure_schema(conn)

    candidate_limit = max(args.limit * 20, args.limit, 60)

    def run_search(query: str) -> list[sqlite3.Row]:
        return conn.execute(
            """
            SELECT c.id AS chunk_id, c.node_id, c.path, c.start_line, c.end_line,
                   c.summary, c.text, files.language,
                   snippet(chunks_fts, 3, '[', ']', '…', 24) AS snippet,
                   bm25(chunks_fts) AS rank
            FROM chunks_fts
            JOIN chunks c ON chunks_fts.chunk_id = c.id
            JOIN files ON files.path = c.path
            WHERE chunks_fts MATCH ?
            ORDER BY rank ASC
            LIMIT ?
            """,
            (query, candidate_limit),
        ).fetchall()

    tokens = fts_tokens(args.topic)
    identifier_tokens = identifier_query_tokens(args.topic) or tokens
    eligible_paths = eligible_paths_for_types(conn, args)
    search_rows: list[tuple[sqlite3.Row, str]] = []
    seen_chunks: set[str] = set()
    if tokens:
        and_rows = run_search(fts_query(args.topic, "AND"))
        for row in and_rows:
            seen_chunks.add(row["chunk_id"])
            search_rows.append((row, "all_terms"))
        # Topic queries should favor precision, but not at the expense of recall.
        # Blend any-term matches into a larger candidate pool, then let scoring,
        # identifier weighting, structural matches, and deduplication choose the
        # final compact result set.
        if len(tokens) > 1:
            for row in run_search(fts_query(args.topic, "OR")):
                if row["chunk_id"] in seen_chunks:
                    continue
                seen_chunks.add(row["chunk_id"])
                search_rows.append((row, "any_terms"))

    grouped: dict[str, dict[str, Any]] = {}
    seen_signatures: dict[str, str] = {}
    for row, match_type in search_rows:
        path = row["path"]
        if not path_is_allowed(path, args):
            continue
        if eligible_paths is not None and path not in eligible_paths:
            continue

        rank = float(row["rank"])
        text = row["text"] or ""
        structural_matches = structural_matches_for_chunk(
            conn, path, int(row["start_line"]), int(row["end_line"]), identifier_tokens
        )
        path_hits = exact_token_count(identifier_tokens, path)
        text_hits = exact_token_count(identifier_tokens, text)
        title_hits = exact_token_count(identifier_tokens, Path(path).name)
        structural_hits = sum(match.get("token_hits", 0) for match in structural_matches)
        signature = normalized_chunk_signature(text)
        duplicate_of = seen_signatures.get(signature)
        if duplicate_of is None:
            seen_signatures[signature] = path

        match_score = 5.0 if match_type == "all_terms" else 1.5
        # FTS5 bm25() is lower-is-better and often a small negative value. Keep it
        # as a light tie-breaker rather than letting it dominate identifier hits.
        match_score += 1.0 / (1.0 + abs(rank))
        match_score += min(path_hits, 4) * 1.5
        match_score += min(title_hits, 3) * 1.0
        match_score += min(text_hits, 6) * 0.45
        match_score += min(structural_hits, 4) * 1.25
        if structural_matches:
            match_score += 0.75
        if duplicate_of and duplicate_of != path:
            match_score *= 0.35

        item = grouped.setdefault(
            path,
            {
                "path": path,
                "candidate": True,
                "score": 0.0,
                "best_rank": rank,
                "matches": [],
                "match_types": [],
                "deduplicated_matches": 0,
            },
        )
        item["score"] += match_score
        item["best_rank"] = min(item["best_rank"], rank)
        if duplicate_of and duplicate_of != path and "duplicate_of" not in item:
            item["duplicate_of"] = duplicate_of
        if match_type not in item["match_types"]:
            item["match_types"].append(match_type)
        if duplicate_of and duplicate_of != path:
            item["deduplicated_matches"] += 1

        match_record = {
            "node_id": row["node_id"],
            "reference": f"{path}:{row['start_line']}",
            "start_line": row["start_line"],
            "end_line": row["end_line"],
            "match_type": match_type,
            "selection": "structure" if structural_matches else "chunk",
            "score": round(match_score, 4),
            "rank": rank,
            "identifier_hits": {
                "path": path_hits,
                "title": title_hits,
                "text": text_hits,
                "structure": structural_hits,
            },
            "dedupe_key": signature,
            "duplicate_of": duplicate_of if duplicate_of and duplicate_of != path else None,
            "structural_matches": structural_matches,
            "snippet": row["snippet"] or row["summary"],
            "verification": verification_for_match(
                path, int(row["start_line"]), int(row["end_line"]), identifier_tokens
            ),
        }
        match_record = {key: value for key, value in match_record.items() if value not in (None, [], {})}
        existing_keys = {match.get("dedupe_key") for match in item["matches"]}
        if len(item["matches"]) < 5 and match_record.get("dedupe_key") not in existing_keys:
            item["matches"].append(match_record)

    for item in grouped.values():
        item["score"] = round(float(item["score"]), 4)
        item["matches"] = sorted(
            item["matches"],
            key=lambda match: (-float(match.get("score", 0.0)), float(match.get("rank", 0.0)), match["reference"]),
        )[:3]
        if item["matches"]:
            item["verification"] = item["matches"][0].get("verification", {})

    results = sorted(grouped.values(), key=lambda item: (-item["score"], item["best_rank"], item["path"]))[: args.limit]
    add_graph_neighbors(conn, results, args.neighbors)
    if args.json:
        print(json.dumps(results, indent=2, sort_keys=True))
    else:
        print(format_query_results(args.topic, results))
    return results


def add_graph_neighbors(conn: sqlite3.Connection, results: list[dict[str, Any]], max_neighbors: int) -> None:
    if not results or max_neighbors <= 0:
        return
    paths = [item["path"] for item in results]
    placeholders = ",".join("?" for _ in paths)
    node_rows = conn.execute(f"SELECT id, path FROM nodes WHERE path IN ({placeholders})", paths).fetchall()
    node_ids = [row["id"] for row in node_rows]
    if not node_ids:
        return
    node_to_path = {row["id"]: row["path"] for row in node_rows}
    placeholders = ",".join("?" for _ in node_ids)
    edge_rows = conn.execute(
        f"""
        SELECT from_id, to_id, type, evidence_path, evidence_line, confidence
        FROM edges
        WHERE from_id IN ({placeholders}) OR to_id IN ({placeholders})
        ORDER BY confidence DESC, type ASC
        LIMIT ?
        """,
        [*node_ids, *node_ids, max_neighbors * max(1, len(results))],
    ).fetchall()
    by_path: dict[str, list[dict[str, Any]]] = {path: [] for path in paths}
    for edge in edge_rows:
        from_path = node_to_path.get(edge["from_id"])
        to_path = node_to_path.get(edge["to_id"])
        owner = from_path if from_path in by_path else to_path
        if owner is None:
            continue
        other_id = edge["to_id"] if owner == from_path else edge["from_id"]
        other = conn.execute("SELECT id, type, title, path, start_line FROM nodes WHERE id = ?", (other_id,)).fetchone()
        if not other:
            continue
        entry = {
            "type": edge["type"],
            "node_id": other["id"],
            "node_type": other["type"],
            "title": other["title"],
            "path": other["path"],
            "reference": f"{other['path']}:{other['start_line']}"
            if other["path"] and other["start_line"]
            else other["path"],
            "evidence": f"{edge['evidence_path']}:{edge['evidence_line']}"
            if edge["evidence_path"] and edge["evidence_line"]
            else edge["evidence_path"],
            "confidence": edge["confidence"],
        }
        if len(by_path[owner]) < max_neighbors:
            by_path[owner].append(entry)
    for item in results:
        item["neighbors"] = by_path.get(item["path"], [])


def format_query_results(topic: str, results: list[dict[str, Any]]) -> str:
    if not results:
        return f"No indexed candidate matches for topic: {topic}"
    lines = [
        f"Indexed candidate matches for topic: {topic}",
        "Verify candidates with read/rg before citing or editing.",
    ]
    for index, item in enumerate(results, start=1):
        duplicate = f" duplicate_of={item['duplicate_of']}" if item.get("duplicate_of") else ""
        lines.append(f"\n{index}. {item['path']}  score={item['score']:.3f}{duplicate}")
        for match in item.get("matches", []):
            snippet = re.sub(r"\s+", " ", match.get("snippet") or "").strip()
            selector = match.get("selection", "chunk")
            lines.append(f"   - {match['reference']} [{selector}]: {snippet[:220]}")
            verification = match.get("verification", {})
            read_hint = verification.get("read", {}) if isinstance(verification, dict) else {}
            if read_hint:
                lines.append(
                    f"     verify: read {read_hint.get('path')} lines {read_hint.get('start_line')}-{read_hint.get('end_line')}"
                )
        for neighbor in item.get("neighbors", [])[:3]:
            ref = neighbor.get("reference") or neighbor.get("path") or neighbor.get("node_id")
            lines.append(f"   - {neighbor['type']} -> {ref} ({neighbor['title']})")
    return "\n".join(lines)


def build_slice_payload(args: argparse.Namespace) -> tuple[Path, dict[str, Any]]:
    root = find_project_root(Path(args.root)) if args.git_root else Path(args.root).resolve()
    db_path = root / DEFAULT_DB_REL
    if not db_path.exists():
        raise SystemExit(f"Index database not found: {db_path}. Run the index command first.")
    conn = connect(db_path)
    ensure_schema(conn)

    query_args = argparse.Namespace(
        root=str(root),
        git_root=False,
        topic=args.topic,
        limit=args.limit,
        neighbors=args.neighbors,
        json=False,
        path_prefix=getattr(args, "path_prefix", []),
        exclude=getattr(args, "exclude", []),
        node_types=getattr(args, "node_types", []),
    )
    # Avoid printing query output while still reusing query logic.
    original_stdout = sys.stdout
    with open(os.devnull, "w", encoding="utf-8") as devnull:
        try:
            sys.stdout = devnull
            results = query_index(query_args)
        finally:
            sys.stdout = original_stdout

    paths = sorted(
        {item["path"] for item in results}
        | {n.get("path") for item in results for n in item.get("neighbors", []) if n.get("path")}
    )
    paths = [path for path in paths if path and path_is_allowed(path, args)]
    selected_node_ids = (
        {f"file:{path}" for path in paths}
        | {match["node_id"] for item in results for match in item.get("matches", []) if match.get("node_id")}
        | {n["node_id"] for item in results for n in item.get("neighbors", []) if n.get("node_id")}
    )
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    if selected_node_ids:
        conn.execute("CREATE TEMP TABLE IF NOT EXISTS temp_selected_nodes(id TEXT PRIMARY KEY)")
        conn.execute("DELETE FROM temp_selected_nodes")
        conn.executemany(
            "INSERT OR IGNORE INTO temp_selected_nodes(id) VALUES (?)", [(node_id,) for node_id in selected_node_ids]
        )
        conn.execute("CREATE TEMP TABLE IF NOT EXISTS temp_selected_types(type TEXT PRIMARY KEY)")
        conn.execute("DELETE FROM temp_selected_types")
        node_types = parse_multi_arg(getattr(args, "node_types", []))
        conn.executemany(
            "INSERT OR IGNORE INTO temp_selected_types(type) VALUES (?)", [(node_type,) for node_type in node_types]
        )
        node_rows = conn.execute(
            """
            SELECT id, type, title, description, path, start_line, end_line, metadata
            FROM nodes
            WHERE id IN (SELECT id FROM temp_selected_nodes)
              AND (
                NOT EXISTS (SELECT 1 FROM temp_selected_types)
                OR type IN (SELECT type FROM temp_selected_types)
              )
            ORDER BY path, type, start_line
            """
        ).fetchall()
        node_ids = [row["id"] for row in node_rows]
        nodes = [dict(row) for row in node_rows]
        for node in nodes:
            node["metadata"] = load_metadata(node.get("metadata"))
        if node_ids:
            conn.execute("DELETE FROM temp_selected_nodes")
            conn.executemany(
                "INSERT OR IGNORE INTO temp_selected_nodes(id) VALUES (?)", [(node_id,) for node_id in node_ids]
            )
            edge_rows = conn.execute(
                """
                SELECT from_id, to_id, type, evidence_path, evidence_line, confidence, metadata
                FROM edges
                WHERE from_id IN (SELECT id FROM temp_selected_nodes)
                  AND to_id IN (SELECT id FROM temp_selected_nodes)
                ORDER BY type, evidence_path, evidence_line
                """
            ).fetchall()
            edges = [dict(row) for row in edge_rows]
            for edge in edges:
                edge["metadata"] = load_metadata(edge.get("metadata"))

    payload = {
        "topic": args.topic,
        "generated_at": utc_now(),
        "database": DEFAULT_DB_REL,
        "filters": {
            "path_prefix": parse_multi_arg(getattr(args, "path_prefix", [])),
            "exclude": parse_multi_arg(getattr(args, "exclude", [])),
            "node_types": parse_multi_arg(getattr(args, "node_types", [])),
        },
        "query_results": results,
        "nodes": nodes,
        "edges": edges,
    }
    return root, payload


def slice_index(args: argparse.Namespace) -> None:
    root, payload = build_slice_payload(args)
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = root / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote topic graph slice: {out_path}")


def slice_jsonl_index(args: argparse.Namespace) -> None:
    root, payload = build_slice_payload(args)
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    graph_path = out_dir / "map.graph.json"
    if getattr(args, "include_raw_slice", False):
        graph_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    topic_id = f"topic:{slugify(args.topic)}"
    node_records: list[dict[str, Any]] = [
        {
            "id": topic_id,
            "type": "topic",
            "title": args.topic,
            "description": "Root node for this topic-scoped project map.",
            "source": "index-project",
            "generated_at": payload["generated_at"],
        }
    ]
    seen_nodes = {topic_id}
    for node in payload["nodes"]:
        record = {
            "id": node["id"],
            "type": node["type"],
            "title": node["title"],
            "description": node["description"],
            "path": node.get("path"),
            "start_line": node.get("start_line"),
            "end_line": node.get("end_line"),
            "reference": f"{node['path']}:{node['start_line']}"
            if node.get("path") and node.get("start_line")
            else node.get("path"),
            "source": "index",
            "metadata": node.get("metadata") or {},
        }
        if record["id"] not in seen_nodes:
            node_records.append({key: value for key, value in record.items() if value is not None})
            seen_nodes.add(record["id"])

    edge_records: list[dict[str, Any]] = []
    seen_edges: set[tuple[Any, ...]] = set()

    def add_edge(record: dict[str, Any]) -> None:
        key = (
            record.get("from"),
            record.get("to"),
            record.get("type"),
            record.get("reference"),
            record.get("evidence"),
        )
        if key in seen_edges:
            return
        seen_edges.add(key)
        edge_records.append({k: v for k, v in record.items() if v is not None})

    for result in payload["query_results"]:
        target = f"file:{result['path']}"
        add_edge(
            {
                "from": topic_id,
                "to": target,
                "type": "relevant_to",
                "evidence": result.get("matches", [{}])[0].get("snippet") if result.get("matches") else None,
                "reference": result.get("matches", [{}])[0].get("reference") if result.get("matches") else None,
                "score": result.get("score"),
                "candidate": result.get("candidate", True),
                "verification": result.get("verification"),
                "source": "index-query",
            }
        )
    for edge in payload["edges"]:
        reference = (
            f"{edge['evidence_path']}:{edge['evidence_line']}"
            if edge.get("evidence_path") and edge.get("evidence_line")
            else edge.get("evidence_path")
        )
        add_edge(
            {
                "from": edge["from_id"],
                "to": edge["to_id"],
                "type": edge["type"],
                "reference": reference,
                "confidence": edge.get("confidence"),
                "source": "index",
                "metadata": edge.get("metadata") or {},
            }
        )

    nodes_path = out_dir / "map.nodes.jsonl"
    edges_path = out_dir / "map.edges.jsonl"
    write_jsonl(nodes_path, node_records)
    write_jsonl(edges_path, edge_records)
    if getattr(args, "include_raw_slice", False):
        print(f"Wrote topic graph slice: {graph_path}")
    print(f"Wrote topic map nodes: {nodes_path}")
    print(f"Wrote topic map edges: {edges_path}")


def detect_staleness(root: Path, max_bytes: int) -> dict[str, Any]:
    """Return a cheap freshness report for the shared index."""
    db_path = root / DEFAULT_DB_REL
    manifest_path = root / DEFAULT_MANIFEST_REL
    report: dict[str, Any] = {
        "root": str(root),
        "database": str(db_path),
        "manifest": str(manifest_path),
        "exists": db_path.exists(),
        "stale": False,
        "missing": [],
        "changed": [],
        "deleted": [],
        "files_seen": 0,
        "indexed_files": 0,
    }
    if not db_path.exists():
        report["stale"] = True
        report["reason"] = "missing-index"
        return report

    conn = connect(db_path)
    existing_schema_version = int(conn.execute("PRAGMA user_version").fetchone()[0])
    ensure_schema(conn)
    if existing_schema_version < SCHEMA_VERSION:
        report["stale"] = True
        report["reason"] = "indexer-version-changed"
        report["force_reindex"] = True
    paths = scan_files(root, max_bytes)
    seen: dict[str, str] = {}
    for path in paths:
        try:
            seen[rel_path(root, path)] = sha256_bytes(path.read_bytes())
        except OSError:
            continue
    existing = {row["path"]: row["hash"] for row in conn.execute("SELECT path, hash FROM files")}
    report["files_seen"] = len(seen)
    report["indexed_files"] = len(existing)
    report["missing"] = sorted(set(seen) - set(existing))
    report["deleted"] = sorted(set(existing) - set(seen))
    report["changed"] = sorted(path for path, digest in seen.items() if existing.get(path) not in (None, digest))
    file_stale = bool(report["missing"] or report["changed"] or report["deleted"])
    report["stale"] = bool(report["stale"] or file_stale)
    if file_stale:
        report["reason"] = "file-set-or-hash-changed"
    elif report["stale"]:
        report["reason"] = report.get("reason", "index-settings-changed")
    else:
        report["reason"] = "fresh"
    return report


def ensure_index(args: argparse.Namespace) -> None:
    root = find_project_root(Path(args.root)) if args.git_root else Path(args.root).resolve()
    gitignore_updated = ensure_index_gitignore(root)
    report = detect_staleness(root, args.max_bytes)
    if report["stale"] or args.force:
        index_args = argparse.Namespace(
            root=str(root),
            git_root=False,
            max_bytes=args.max_bytes,
            rebuild=False,
            force=bool(args.force or report.get("force_reindex")),
            json=True,
        )
        original_stdout = sys.stdout
        with open(os.devnull, "w", encoding="utf-8") as devnull:
            try:
                sys.stdout = devnull
                index_project(index_args)
            finally:
                sys.stdout = original_stdout
        refreshed = detect_staleness(root, args.max_bytes)
        payload = {"action": "reindexed", "before": report, "after": refreshed, "gitignore_updated": gitignore_updated}
    else:
        payload = {"action": "fresh", "before": report, "after": report, "gitignore_updated": gitignore_updated}
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        after = payload["after"]
        print(f"Index {payload['action']}: {after['database']}")
        print(f"  files seen: {after['files_seen']}")
        print(f"  indexed files: {after['indexed_files']}")
        print(f"  stale: {after['stale']}")


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    records = [dict(row) for row in rows]
    for record in records:
        if "metadata" in record:
            record["metadata"] = load_metadata(record.get("metadata"))
    return records


def read_index(args: argparse.Namespace) -> None:
    root = find_project_root(Path(args.root)) if args.git_root else Path(args.root).resolve()
    db_path = root / DEFAULT_DB_REL
    if not db_path.exists():
        raise SystemExit(f"Index database not found: {db_path}. Run the ensure or index command first.")
    conn = connect(db_path)
    ensure_schema(conn)

    if args.path:
        rel = args.path.strip().lstrip("/")
        file_row = conn.execute("SELECT * FROM files WHERE path = ?", (rel,)).fetchone()
        nodes = rows_to_dicts(
            conn.execute(
                "SELECT id, type, title, description, path, start_line, end_line, metadata FROM nodes WHERE path = ? ORDER BY type, start_line LIMIT ?",
                (rel, args.limit),
            )
        )
        node_ids = [node["id"] for node in nodes]
    elif args.node_id:
        nodes = rows_to_dicts(
            conn.execute(
                "SELECT id, type, title, description, path, start_line, end_line, metadata FROM nodes WHERE id = ?",
                (args.node_id,),
            )
        )
        file_row = None
        node_ids = [args.node_id] if nodes else []
    else:
        raise SystemExit("read requires --path or --node-id")

    edges: list[dict[str, Any]] = []
    chunks: list[dict[str, Any]] = []
    if node_ids:
        placeholders = ",".join("?" for _ in node_ids)
        edges = rows_to_dicts(
            conn.execute(
                f"""
                SELECT from_id, to_id, type, evidence_path, evidence_line, confidence, metadata
                FROM edges
                WHERE from_id IN ({placeholders}) OR to_id IN ({placeholders})
                ORDER BY type, evidence_path, evidence_line
                LIMIT ?
                """,
                [*node_ids, *node_ids, args.limit],
            )
        )
        chunks = rows_to_dicts(
            conn.execute(
                f"""
                SELECT id, node_id, path, start_line, end_line, summary, token_count
                FROM chunks
                WHERE node_id IN ({placeholders}) OR path = COALESCE(?, path)
                ORDER BY path, start_line
                LIMIT ?
                """,
                [*node_ids, args.path, args.limit],
            )
        )

    payload = {
        "root": str(root),
        "database": str(db_path),
        "file": dict(file_row) if file_row else None,
        "nodes": nodes,
        "edges": edges,
        "chunks": chunks,
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(f"Index read: {db_path}")
        if payload["file"]:
            print(f"File: {payload['file']['path']} ({payload['file']['language']}, {payload['file']['size']} bytes)")
        for node in nodes:
            ref = f":{node['start_line']}" if node.get("start_line") else ""
            print(f"- {node['id']} [{node['type']}] {node.get('path') or ''}{ref} — {node['title']}")
        if edges:
            print("Edges:")
            for edge in edges[: args.limit]:
                print(f"- {edge['from_id']} --{edge['type']}--> {edge['to_id']}")


def status(args: argparse.Namespace) -> None:
    root = find_project_root(Path(args.root)) if args.git_root else Path(args.root).resolve()
    db_path = root / DEFAULT_DB_REL
    manifest_path = root / DEFAULT_MANIFEST_REL
    if not db_path.exists():
        raise SystemExit(f"Index database not found: {db_path}")
    conn = connect(db_path)
    ensure_schema(conn)
    counts = get_counts(conn)
    latest = conn.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone()
    payload = {
        "root": str(root),
        "database": str(db_path),
        "manifest": str(manifest_path),
        "counts": counts,
        "latest_run": dict(latest) if latest else None,
    }
    if payload["latest_run"] and payload["latest_run"].get("settings"):
        with contextlib.suppress(json.JSONDecodeError):
            payload["latest_run"]["settings"] = json.loads(payload["latest_run"]["settings"])
    print(json.dumps(payload, indent=2, sort_keys=True) if args.json else format_status(payload))


def format_status(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    lines = ["Project index status:", f"  database: {payload['database']}", f"  manifest: {payload['manifest']}"]
    for key in ("files", "nodes", "edges", "chunks", "chunks_fts", "runs"):
        lines.append(f"  {key}: {counts[key]}")
    latest = payload.get("latest_run")
    if latest:
        lines.append(f"  latest run: {latest.get('created_at')} ({latest.get('files_seen')} files seen)")
    return "\n".join(lines)


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--root", default=".", help="Project root or path inside a git repository. Default: current directory."
    )
    parser.add_argument(
        "--git-root",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Resolve --root to nearest git root. Default: true.",
    )


def add_filter_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--path-prefix",
        action="append",
        default=[],
        help="Only include results under this project-relative path prefix. May be repeated or comma-separated.",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Exclude project-relative path prefixes or glob patterns. May be repeated or comma-separated.",
    )
    parser.add_argument(
        "--type",
        dest="node_types",
        action="append",
        default=[],
        help="Limit graph nodes/results to node type(s), such as file,symbol,doc-section. May be repeated or comma-separated.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build and query a SQLite + FTS5 project graph index.")
    sub = parser.add_subparsers(dest="command", required=True)

    index_p = sub.add_parser("index", help="Build or update the shared project index.")
    add_common_args(index_p)
    index_p.add_argument(
        "--max-bytes", type=int, default=1_500_000, help="Skip files larger than this many bytes. Default: 1500000."
    )
    index_p.add_argument("--rebuild", action="store_true", help="Drop and rebuild all index tables.")
    index_p.add_argument("--force", action="store_true", help="Re-index all scanned files without checking hashes.")
    index_p.add_argument("--json", action="store_true", help="Print JSON summary.")
    index_p.set_defaults(func=index_project)

    query_p = sub.add_parser("query", help="Search indexed chunks by topic.")
    add_common_args(query_p)
    query_p.add_argument("--topic", required=True, help="Topic or search phrase.")
    query_p.add_argument("--limit", type=int, default=20, help="Maximum file results. Default: 20.")
    query_p.add_argument("--neighbors", type=int, default=5, help="Maximum graph neighbors per result. Default: 5.")
    add_filter_args(query_p)
    query_p.add_argument("--json", action="store_true", help="Print JSON results.")
    query_p.set_defaults(func=query_index)

    slice_p = sub.add_parser("slice", help="Export a topic graph slice as JSON.")
    add_common_args(slice_p)
    slice_p.add_argument("--topic", required=True, help="Topic or search phrase.")
    slice_p.add_argument("--out", required=True, help="Output JSON path, relative to root unless absolute.")
    slice_p.add_argument(
        "--limit", type=int, default=30, help="Maximum file results before graph expansion. Default: 30."
    )
    slice_p.add_argument("--neighbors", type=int, default=8, help="Maximum graph neighbors per result. Default: 8.")
    add_filter_args(slice_p)
    slice_p.set_defaults(func=slice_index)

    slice_jsonl_p = sub.add_parser(
        "slice-jsonl", help="Export topic map.nodes.jsonl and map.edges.jsonl from the shared index."
    )
    add_common_args(slice_jsonl_p)
    slice_jsonl_p.add_argument("--topic", required=True, help="Topic or search phrase.")
    slice_jsonl_p.add_argument(
        "--out-dir", required=True, help="Output directory for map.nodes.jsonl and map.edges.jsonl."
    )
    slice_jsonl_p.add_argument(
        "--limit", type=int, default=30, help="Maximum file results before graph expansion. Default: 30."
    )
    slice_jsonl_p.add_argument(
        "--neighbors", type=int, default=8, help="Maximum graph neighbors per result. Default: 8."
    )
    add_filter_args(slice_jsonl_p)
    slice_jsonl_p.add_argument(
        "--include-raw-slice",
        action="store_true",
        help="Also write map.graph.json as a portable raw JSON snapshot. By default the SQLite index remains the raw source of truth.",
    )
    slice_jsonl_p.set_defaults(func=slice_jsonl_index)

    ensure_p = sub.add_parser("ensure", help="Check freshness and re-index if files changed or the index is missing.")
    add_common_args(ensure_p)
    ensure_p.add_argument(
        "--max-bytes", type=int, default=1_500_000, help="Skip files larger than this many bytes. Default: 1500000."
    )
    ensure_p.add_argument("--force", action="store_true", help="Re-index even when the freshness check passes.")
    ensure_p.add_argument("--json", action="store_true", help="Print JSON freshness report.")
    ensure_p.set_defaults(func=ensure_index)

    read_p = sub.add_parser("read", help="Read indexed file/node context from the SQLite project graph.")
    add_common_args(read_p)
    target = read_p.add_mutually_exclusive_group(required=True)
    target.add_argument("--path", help="Project-relative file path to read from the index.")
    target.add_argument("--node-id", help="Indexed node ID to read, such as file:src/app.ts.")
    read_p.add_argument("--limit", type=int, default=50, help="Maximum nodes/edges/chunks to return. Default: 50.")
    read_p.add_argument("--json", action="store_true", help="Print JSON index context.")
    read_p.set_defaults(func=read_index)

    status_p = sub.add_parser("status", help="Print index status.")
    add_common_args(status_p)
    status_p.add_argument("--json", action="store_true", help="Print JSON status.")
    status_p.set_defaults(func=status)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
