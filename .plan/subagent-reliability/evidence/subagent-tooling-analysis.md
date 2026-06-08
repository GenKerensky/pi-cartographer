# Evidence Analysis: subagent tooling signals

## Source Handling

- Private input: authorized session artifact imported for `subagent-reliability`; raw path and raw transcript content are intentionally omitted.

- Analyzer: focused redaction-safe aggregate analyzer run from parent via local Python.

- Redaction status: passed

- What was intentionally omitted: raw prompts, raw tool outputs, full commands, private paths, secrets, adjacent transcript context, and full child responses.


## Summary

- Records analyzed: 2035

- Subagent tool records: 107

- Subagent records with explicit acceptance field: 36

- Subagent records with explicit timeout/maxRuntime field: 34

- Subagent records with async field: 0

- Subagent records with control field: 0


## Tool Errors by Tool

| Tool | Error records |
|---|---|
| bash | 25 |
| subagent | 17 |
| edit | 13 |
| cartographer_jsonl | 1 |


## Tooling-Signal Categories

| Category | Records | Top tools |
|---|---|---|
| auditor_or_review_gate | 337 | read:129, bash:101, subagent:47, unknown:26 |
| cartographer_tools | 294 | read:103, bash:102, unknown:25, subagent:20 |
| custom_script_created | 140 | bash:67, read:40, subagent:24, cartographer_index:5 |
| acceptance_contract | 118 | read:48, subagent:38, bash:12, write:10 |
| timeout | 76 | read:21, bash:18, subagent:17, unknown:11 |
| exact_edit_failure | 17 | edit:12, read:4, bash:1 |
| missing_file_or_dir | 15 | read:6, subagent:3, unknown:3, bash:2 |
| command_not_found | 4 | unknown:2, bash:1, read:1 |
| tool_unavailable_or_unknown | 2 | unknown:1, cartographer_index:1 |


## Subagent Agents and Errors

| Agent | Records | Error records |
|---|---|---|
| <unknown> | 36 | 0 |
| cartographer-auditor | 36 | 5 |
| reviewer | 24 | 8 |
| cartographer-pathfinder | 4 | 2 |
| delegate | 2 | 1 |
| planner | 2 | 1 |
| researcher | 1 | 0 |
| scout | 1 | 0 |
| cartographer-redactor | 1 | 0 |


## Longest Subagent Durations

| Line | Agent | Duration ms | Error |
|---|---|---|---|
| 1478 | cartographer-pathfinder | 600018 | True |
| 1408 | cartographer-pathfinder | 565697 | True |
| 1646 | cartographer-auditor | 300015 | True |
| 1811 | cartographer-auditor | 300010 | True |
| 1526 | cartographer-auditor | 264956 | False |
| 1718 | cartographer-auditor | 241628 | False |
| 609 | reviewer | 240013 | True |
| 1552 | cartographer-auditor | 238870 | False |
| 1743 | cartographer-auditor | 236867 | False |
| 1702 | cartographer-auditor | 223291 | False |
| 1600 | cartographer-auditor | 213453 | False |
| 1774 | cartographer-auditor | 207133 | False |


## Parent Tool Activity Shortly After Subagent Records

This is a coarse proximity signal, not proof of causality. It counts tool records within the next 12 session records after each subagent record.


| Tool | Nearby records |
|---|---|
| bash | 441 |
| read | 267 |
| edit | 179 |
| cartographer_jsonl | 75 |
| cartographer_index | 50 |
| write | 50 |


## Sanitized Example Signals

Examples are redacted, capped, and fingerprinted for deduplication. They are included only where useful for categorization; they are not raw transcript evidence.


### command_not_found

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 60 | bash | adc4cac08959 | *.md skills/*/SKILL.md', 'timeout': 10}) /bin/bash: line 1: cartographer_index: command not found /bin/bash: line 1: Prefer: command not found rg: skills/*.md: No such file or directory (os error 2) skills/proposal/SK |
| 140 | read | edb3c8a13506 | ms.` ## Error patterns - Line 69, bash: /bin/bash: line 1: cartographer_index: command not found /bin/bash: line 1: Prefer: command not found rg: skills/*.md: No such file or directory (os error 2) skills/proposal/SK |
| 174 |  | 5ef925962055 | d error: shell quoting/backticks caused `/bin/bash: line 1: cartographer_index: command not found` and `/bin/bash: line 1: Prefer: command not found`. - Key prior-art takeaways: - SWE-agent recommends LM-centric too |
| 617 |  | 1eb2255b0ea6 | edits for an implementation task.` - `/bin/bash: line 1: cartographer_index: command not found` - `/bin/bash: line 1: Prefer: command not found` - `Run timed out (reviewer): Timed out after 180000ms.` - Workflo |


### missing_file_or_dir

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 54 | bash | 1c346b37b39b | 28:58.653Z { "action": "status", "id": "worker" } result chars 39 Async run not found. Provide id or dir. ---END PREVIEW--- === subagent result line 360 ts 2026-06-07T05:31:04.017Z isError False call line |
| 60 | bash | 8fd3200a2e8d | lls/*/SKILL.md', 'timeout': 10}) /bin/bash: line 1: cartographer_index: command not found /bin/bash: line 1: Prefer: command not found rg: skills/*.md: No such file or directory (os error 2) skills/proposal/SK |
| 70 | read | 93e967a4e35f | T_DB_REL if not db_path.exists(): raise SystemExit(f"Index database not found: {db_path}. Run the index command first.") conn = connect(db_path) ensure_schema(conn) candidate_limit = m |
| 117 | subagent | f8c38dd5ea2d | Async run not found. Provide id or dir. |
| 140 | read | d0aa7e488e6e | 5:28:59.125Z: {'action': 'status', 'id': 'worker'}; result 39 chars: `Async run not found. Provide id or dir.` - Line 360 at 2026-06-07T05:31:04.017Z: {'agent': 'reviewer', 'context': 'fresh', 'task': 'Review |


### tool_unavailable_or_unknown

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 174 |  | e0f3f8908089 | arly Progress - Checked subagent status with `subagent(status, id="7d7e0d48")`; tool returned `Async run not found`. - Continued the main proposal work rather than interrupting further. - Read `.plan/workflow-optimization/researcher-b |
| 255 | cartographer_index | 66daa19c736e | "text": "## Longest turns\n\| start line \| duration s \| tools \| assistant msgs \| tool chars \| token sum \| errors \| user request \|\n\|---:\|---:\|---:\|---:\|---:\|---:\|---:\|---\|\n\| 327 \| 774.7 \| 55 \| 45 \| 144,554 \| 11,093,982 \| 2 \| implement the … |


### exact_edit_failure

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 22 | read | 3b2dd55e12b0 | = await readFile(absolutePath, "utf8"); const next = current.replace(params.oldText, params.newText); await writeFile(absolutePath, next, "utf8"); return { content: [{ type: "text", text: |
| 60 | bash | 2a883988906d | , 'edit', {'path': 'skills/index-project/scripts/index_project.py', 'edits': [{'oldText': 'SCHEMA_VERSION = 1\nDEFAULT_DB_REL = ".plan/_index/project-graph.sqlite"', 'newText': 'SCHEMA_VERSION = 2\nDEFAULT_D |
| 140 | read | f8cb4f1dbc47 | : Could not find edits[3] in skills/index-project/scripts/index_project.py. The oldText must match exactly including all whitespace and newlines. - Line 165, bash: > pi-cartographer@0.1.0 check > npm run ch |
| 324 | edit | fb4077b4785b | Could not find the exact text in .gitignore. The old text must match exactly including all whitespace and newlines. |
| 755 | edit | 815f5293c832 | Could not find the exact text in README.md. The old text must match exactly including all whitespace and newlines. |


### timeout

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 4 |  | 7dda621465af | l for improvement of this package based on anything that went wrong (researcher timed out), anything that was slow, uneccessary, polluted the context or produced lackluster results. This extension needs to fol |
| 20 | read | acc4e2563087 | (isToolCallEventType("bash", event)) { // event.input is { command: string; timeout?: number } event.input.command = `source ~/.profile\n${event.input.command}`; if (event.input.command.includes |
| 22 | read | c5ca515478fa | mmand. ```typescript const result = await pi.exec("git", ["status"], { signal, timeout: 5000 }); // result.stdout, result.stderr, result.code, result.killed ``` ### pi.getActiveTools() / pi.getAllTools() / |
| 28 | read | ceee0812b670 | /skills/pi-skills/brave-search/content.js https://arxiv.org/html/2601.23254v2","timeout":30}}],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.5","usage":{"input":827,"output":103,"ca |
| 50 | bash | a56060b82f46 | generated.\n\n### Blocked\n- None. Note: one delegated `reviewer` subagent run timed out during proposal review, but deterministic validation passed afterward.\n\n## Key Decisions\n- **`rg` vs index split**: |


### acceptance_contract

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 6 | read | 3b9212c73e73 | s start as `draft` and become `accepted` only after validation or explicit user acceptance. - Index/map/query results are candidates until verified. Use `candidate`, `verified`, and `verification` metadata wher |
| 54 | bash | 09d9bb984729 | the source of truth. Do not commit. Report changed files and commands run.", "acceptance": { "criteria": [ "P0.T1-P0.T5 contract definitions are present in relevant docs/skill guidance", "No i |
| 95 | bash | 1bd00b10df78 | it for grading outputs. We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), c |
| 96 | bash | 75d0cf5f822c | ge. * Writing an outline of a document, checking that the outline meets certain criteria, then writing the document based on the outline. ### Workflow: Routing Routing classifies an input and directs it to |
| 98 | bash | a795a67bf43d | elines succeeded. We conduct a quantitative census of all samples meeting these criteria (362 Python and 281 Java cases). 268- 269:We focus on the actual retrieval pipeline of Naive GrepRAG. Following the cla |


### auditor_or_review_gate

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 6 | read | 9ee904b3028b | efer the exact agents named `delegate`, `researcher`, `planner`, `oracle`, and `reviewer` when available. - Treat `scout` as optional. Use deterministic Cartographer index/map tools plus focused `rg`/grep |
| 8 | read | b7fb80126169 | ss --root "$PWD" --workflow plan --topic "<topic>" --original-query "<query>" --failure-type vocabulary_mismatch --eventual-hit "src/example.ts:42" --resolution query_expansion ``` - This writes |
| 10 | subagent | ce3aa66f136a | eb researcher — searches, evaluates, and synthesizes a focused research brief - reviewer (builtin): Versatile review specialist for code diffs, plans, proposed solutions, codebase health, and PR/issue validat |
| 16 | read | 3cf73dd55cdc | Constraints - Do not call either tool more than 3 times per question. - Do not pass API keys, passwords, credentials, personal data, or proprietary code as the `query` argument — it is sent to the Contex |
| 20 | read | a27091269382 | │ ├─► (extension commands checked first, bypass if found) │ ├─► input (can intercept, transform, or handle) │ ├─► (skill/template expansion if not handle |


### cartographer_tools

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 6 | read | 67335bfe7de4 | ex only when stale: ```bash python <index-project-skill-dir>/scripts/index_project.py ensure --root "$PWD" --json ``` - This creates or updates: - `.plan/_index/project-graph.sqlite` |
| 8 | read | 96e1a8a922f9 | repository. 2. **Ensure the index exists and is fresh** - Resolve `scripts/index_project.py` relative to this `SKILL.md`. - Prefer `ensure` before reading the database. It checks file hashes and re-indexes |
| 36 | cartographer_index | bfc47285d189 | match_type": "any_terms", "node_id": "file:skills/index-project/scripts/index_project.py", "rank": -8.424485990309252, "reference": "skills/index-project/scripts/index_project.py:1594", |
| 42 | cartographer_index | 815887c43c8a | `[scout]`, `[researcher]`, `planner`, `oracle`, and `reviewer`):\\n\\n```bash\\ncartographer_index({\\\"action\u2026", "start_line": 1, "verification": { "read": { "end_line": 37, |
| 48 | bash | 09c67fe036b2 | name Counter({'bash': 115, 'edit': 79, 'read': 66, 'subagent': 8, 'write': 7, 'cartographer_jsonl': 6, 'cartographer_index': 5, 'ask_user_question': 1}) tool results 287 Counter({'bash': 115, 'edit': 79, 'read': 66, ' |


### custom_script_created

| Line | Tool | Fingerprint | Redacted category-local snippet |
|---|---|---|---|
| 6 | read | 103cbbaf927b | jsonl --root "$PWD" --topic "{topic}" --out-dir ".plan/{topic}" --limit 30 node --experimental-strip-types <plan-skill-dir>/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "{topic}" --json ``` - Use `cart |
| 50 | bash | aae6c7a632bf | ig.json`\n- Validation commands that passed earlier:\n - `npm run check`\n - `node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic retrieval-workflow --json`\n - `python skills |
| 54 | bash | e88222fb1b0f | Ms": 10000 }, { "id": "validate-topic", "command": "node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root \"$PWD\" --topic retrieval-workflow --json", "timeout |
| 56 | bash | 49ec94510868 | dur 6.915 call 601 result 602 tool bash err False chars 1355 args {'command': 'python - <<\'PY\'\nfrom pathlib import Path\nimport json\ncommits={\n \'P0\':\'1427332\',\n \'P1\':\'b9b7553\',\n \'P2\':\'1b0b5ac\ |
| 58 | bash | 89d4b2daad65 | ), ("python -m unittest discover tests -p 'test_index_project.py'", 1), ('tmp=$(mktemp -d); python - <<\'PY\' "$tmp"\nfrom pathlib import Path\nimport sys,jso', 1), ('npm test', 1), ('python skills/index-pr |


## Findings

- Tooling friction is visible, but it is mixed with orchestration friction: subagent records rarely carried explicit `acceptance`, `async`, or `control` fields, while timeout-scale durations and subagent errors were present.

- Current Cartographer child agent definitions use basic file/shell tools rather than direct Cartographer index/JSONL/session tools; when they need graph or validation operations they must rely on `bash` and CLI commands.

- The safest improvement is least-privilege Cartographer read/validate tools for children, plus parent-owned mutation/signoff, not blanket write permissions.

- A dedicated read-only JSONL/artifact tool would reduce custom one-off scripts and let auditors/drafters inspect facts, receipts, context packs, and validation summaries without shelling out.


## Proposed Fact Records

- `F014`: Focused tooling analysis found subagent records with low explicit acceptance/async/control usage relative to subagent call volume.

- `F015`: Tooling categories include schema/tool-use friction, command/search failures, and custom-script creation signals, supporting new read-only artifact helpers.

- `F016`: Direct Cartographer tool access is absent from current child agent tool lists, forcing CLI/bash fallback for JSONL/index operations.


## Redaction Notes

No raw prompts, full commands, raw tool outputs, private paths, or unredacted private content are included.
