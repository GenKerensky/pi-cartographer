# Project Agent Instructions

## Testing and Temporary Artifacts

- Tests must never write to or mutate the repository's real `.plan/` directory or other persistent project planning artifacts.
- Always use a mock filesystem, `tempfile`/`mktemp`, or another directory under `/tmp` for test arrange/setup data.
- When a test needs a project layout, scaffold a minimal mock project during the Arrange phase of Arrange/Act/Assert, run the action against that mock root, and assert against files inside the mock root.
- Do not point tests, validation fixtures, or exploratory test commands at `$PWD` if they create `.plan/`, `.plan/_index/`, `.plan/_retrieval/`, cache, database, or generated graph artifacts.
- If a manual verification command would create generated artifacts, run it against a temporary copy/mock project unless the user explicitly asks to modify the real repository artifacts.
