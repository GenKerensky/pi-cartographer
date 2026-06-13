# P0 Inventory and Baseline

## Scope

Phase P0 captures the current skill/agent wording baseline before rewriting. It does not rewrite skill files.

## Repository Status Baseline

`git status --short` currently shows intentional topic work:

- `.plan/skills-cleanup/` proposal/plan artifacts and receipts.
- `.cartographer/skills-cleanup/` execution state created by `cartographer_implement start`.
- `AGENTS.md` skill-authoring guardrails added at user request.
- `.pi/agents/cartographer-*.md` model frontmatter updates added at user request: `model: openai-codex/gpt-5.5`.

No unrelated user edits were observed in `git status --short` during P0.

## Direct-Write / Stale JSONL Wording Findings

High-priority skill cleanup targets:

1. `skills/plan/SKILL.md`
   - Output section still says to create/update `plan.nodes.jsonl` and `plan.edges.jsonl` directly.
   - Line 253 says to create plan graph artifacts from Markdown despite the wrapper-first `cartographer_plan generate-graph` contract.
   - Research/context sections still ask `researcher`/serial pass to append source-backed fact graph records.
   - Delegated `planner` prompt still says to create `.plan/{topic}/plan.md`, `plan.nodes.jsonl`, and `plan.edges.jsonl`.

2. `skills/proposal/SKILL.md`
   - Output/init sections still describe creating empty map/fact JSONL files directly.
   - Research section still says to write each finding by appending nodes/edges to fact JSONL.
   - Serial-mode codebase mapper/researcher prompts still say to write map/fact JSONL directly.
   - Wrapper-first text exists, but stale procedural prose conflicts with it.

3. `skills/interview/SKILL.md`
   - Lines 74-75 say to upsert `interview.nodes.jsonl` and `interview.edges.jsonl` records directly.
   - This is the clearest wrapper/fallback gap for P4.

4. `skills/implement/SKILL.md`
   - Mostly aligned with ADR-0004/ADR-0006.
   - Still has direct wording around marking selected phase in `plan.md` and `plan.nodes.jsonl`, mirroring statuses, and appending receipts; P2 should tighten this around `cartographer_plan_status`, `cartographer_validation`, `cartographer_implement`, and `cartographer_state`.

5. `skills/index-project/SKILL.md`
   - Uses script-first language for deterministic indexing and `slice-jsonl`; mostly acceptable.
   - Mentions `slice-jsonl` writes starter map artifacts. This is deterministic tool output, not stale hand-edit prose, but P2/P5 should ensure wording stays clear.

6. `skills/dashboard/SKILL.md`
   - Concise and read-only. No obvious mutation-language issue beyond ordinary dashboard startup wording.

7. `AGENTS.md`
   - Contains desired wrapper/skill-authoring guardrails. Pattern hits are mostly prohibitions and should be allowlisted by future checker.

## Delegation / ADR-0004 Findings

High-priority delegation cleanup targets:

1. `skills/plan/SKILL.md`
   - `researcher` wording at lines 134/412 and serial research pass at line 421 still implies direct fact JSONL appends.
   - `planner` prompt at line 413 still asks a delegated planner to create canonical plan and graph files.
   - P3 should reframe children as returning suggestions/drafts while parent-owned wrappers apply canonical writes.

2. `skills/proposal/SKILL.md`
   - Research lines around 219 and serial role prompts around 395-396 still imply direct map/fact JSONL writes.
   - Existing least-privilege sections are good but conflict with older procedural snippets.

3. `skills/interview/SKILL.md`
   - Direct upsert language should become a wrapper/script/fallback boundary.

4. `.pi/agents/cartographer-*.md`
   - Auditor, compass, drafter, archivist, redactor, and pathfinder are mostly read-only/least-privilege.
   - `cartographer-archivist` says JSONL suggestions only and no canonical append unless explicitly assigned a draft/suggestion output path; acceptable but should be checked by future lint allowlist.
   - `cartographer-drafter` has `write` tool and assigned draft/update path language; acceptable if canonical receipt/ADR/private mutation remains prohibited.
   - `cartographer-pathfinder` is explicitly deprecated legacy opt-in; acceptable under ADR-0004.

## Line Count Baseline

`wc -l` results:

- `skills/dashboard/SKILL.md`: 85
- `skills/implement/SKILL.md`: 450
- `skills/index-project/SKILL.md`: 233
- `skills/interview/SKILL.md`: 192
- `skills/plan/SKILL.md`: 466
- `skills/proposal/SKILL.md`: 439
- `.pi/agents/cartographer-archivist.md`: 37
- `.pi/agents/cartographer-auditor.md`: 39
- `.pi/agents/cartographer-compass.md`: 38
- `.pi/agents/cartographer-drafter.md`: 39
- `.pi/agents/cartographer-pathfinder.md`: 44
- `.pi/agents/cartographer-redactor.md`: 110
- `AGENTS.md`: 47

No `SKILL.md` exceeds the ~500-line guidance, but `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, and `skills/proposal/SKILL.md` are close enough that P2 should cut prose or move low-frequency snippets into one-level references instead of adding more inline detail.

## Raw Command Output

Full P0 inventory command output is stored outside the repo at:

- `/tmp/skills-cleanup-p0-inventory.txt`
- `/tmp/skills-cleanup-p0-targeted.txt`

These files are temporary diagnostics and should not be committed.

## P0 Task Status

- P0.T1: complete — stale/direct-write language captured with target files and representative lines.
- P0.T2: complete — delegation-writing findings captured against ADR-0004 boundaries.
- P0.T3: complete — line counts captured and near-500 skills identified.
- P0.T4: complete — `AGENTS.md` guardrail update verified as intentional user-requested local work.

## Residual Risks

- Pattern searches intentionally over-match prohibitions, validator code, and legitimate deterministic tool output. P1 checker must include allowlists and distinguish examples/prohibitions from stale instructions.
- The agent model frontmatter updates are intentional user-requested local work, but not originally described in the plan. Keep them visible in status and commit messaging.
