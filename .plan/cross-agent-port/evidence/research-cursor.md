# Research: Porting Pi Cartographer onto Cursor's Extensibility Model

> Verified against official `docs.cursor.com` pages and the Cursor changelog as of **2026-06-11**. Cursor's current line is the 2.x series (2.4 shipped 2026-01-22 adding Subagents + Skills; subagent docs reference 2.5 behavior). Cursor moves fast — treat version-tagged claims below as the live state at this date.

## Summary

Cursor is highly extensible and maps cleanly onto **all four** Pi Cartographer surfaces — with one partial degradation. **Custom tools** → MCP servers via `.cursor/mcp.json` (stdio/SSE/HTTP, project + global scope, env interpolation), but with a real **active-tool ceiling (~40–80 tools)** and per-call MCP approval gating. **Skills/workflow prompts** → Cursor now has native **Agent Skills (`SKILL.md`, shipped 2.4)** plus **Rules (`.cursor/rules/*.mdc`)** and **Commands (`.cursor/commands/*.md`)** — Skills are the best fit for a multi-step Cartographer workflow. **Project memory** → Cursor reads **`AGENTS.md`** (root + nested), with a clear precedence chain over the **deprecated `.cursorrules`**. **Subagents** → Cursor *does* support creating custom subagents (`.cursor/agents/*.md`, since 2.4; child subagents since 2.5), so Cartographer's specialist *roles/prompts port fine*. The **single partial gap vs. Claude Code is per-subagent tool restriction**: subagents **force-inherit ALL MCP tools** with no per-agent tool/MCP scoping — confirmed by the official docs FAQ (`/docs/subagents`) and an open feature request. The subagent frontmatter has only `name`/`description`/`model`/`readonly`/`is_background` — no `tools:`/`mcp_servers:` field; the coarse `readonly: true` write-lock is the only built-in access control, and hard tool isolation must be emulated via **hooks** (`beforeMCPExecution`).

---

## Findings

### Surface 1 — CUSTOM TOOLS (≈20 deterministic Python/TS CLI tools)

1. **MCP is the supported way to add custom agent tools; write servers in any language that prints to stdout or serves HTTP.** Cursor supports three transports — `stdio` (local subprocess Cursor manages), `SSE` (Server-Sent Events, local/remote), and `Streamable HTTP` (local/remote). For ~20 local Python/TS CLI scripts, wrap them behind **one stdio MCP server** (or a couple) rather than 20 separate servers. [MCP docs](https://cursor.com/docs/mcp)

2. **`.cursor/mcp.json` schema — stdio fields.** For local servers: `type` (`"stdio"`, required), `command` (required; must be on PATH or a full path — `npx`/`node`/`python`/`docker`), `args` (array, optional), `env` (object, optional), `envFile` (path to a `.env`, **stdio-only**). Remote servers use `url` + `headers` (and optional `auth` object for static OAuth — `CLIENT_ID`/`CLIENT_SECRET`/`scopes`). `envFile` is **not** supported for remote servers. [MCP docs](https://cursor.com/docs/mcp)

3. **Project vs global scope; both merged, project wins.** Project config: `.cursor/mcp.json` in the repo (commit to git so the team shares tools). Global config: `~/.cursor/mcp.json` in the home dir (personal, all projects). "Both files are merged. If the same server name appears in both, the project-level config takes priority." [MCP help](https://cursor.com/help/customization/mcp), [MCP docs](https://cursor.com/docs/mcp)

4. **Env var & secret handling via config interpolation.** Cursor resolves variables in `command`, `args`, `env`, `url`, and `headers`: `${env:NAME}` (env var), `${userHome}`, `${workspaceFolder}` (folder containing `.cursor/mcp.json`), `${workspaceFolderBasename}`, `${pathSeparator}`/`${/}`. Best practice: never hardcode secrets — use `${env:API_KEY}` and set the var in your shell profile, or use `envFile` for stdio servers. [MCP docs](https://cursor.com/docs/mcp)

5. **Per-call approval is ON by default for MCP tools.** "Cursor asks for approval before using MCP tools by default." This is a per-call gate — relevant since ~20 deterministic Cartographer tools would each prompt. [MCP docs](https://cursor.com/docs/mcp)

6. **Auto-run / "YOLO" historically did NOT auto-approve MCP tools — now configured via `permissions.json` / Run Mode.** The current docs say: to pre-approve specific MCP tools without prompting, "add them to `permissions.json`" and steer the Auto-review classifier per server/tool with `autoRun` instructions. Historically (and still reported by users) plain YOLO/auto-run mode did not auto-execute MCP tools, prompting community requests for an MCP allowlist. Plan for Cartographer tools to be explicitly allowlisted. [MCP docs — Run Mode](https://cursor.com/docs/mcp), [YOLO doesn't auto-run MCP tools (forum)](https://forum.cursor.com/t/yolo-mode-doesnt-auto-run-mcp-tools/50366), [MCP allowlist request (forum)](https://forum.cursor.com/t/mcp-tools-allowlist-to-autorun/79051/1)

7. **CRITICAL: active-tool ceiling exists (~40, raised to ~80).** Cursor only sends a capped number of tool definitions to the agent. The original limit was **40 tools total across all enabled MCP servers**; community reports and a moderator note indicate it was **raised to ~80**. Tools beyond the cap "silently become invisible to the agent." With ~20 Cartographer tools plus any other servers (e.g. GitHub MCP alone is ~20 tools), you can hit this. Mitigation: keep Cartographer to one lean server, disable unused servers in Settings → MCP, or use a hub/router pattern. [Tools limited to 40 total (forum)](https://forum.cursor.com/t/tools-limited-to-40-total/67976), [MCP - 40 Tools way too less (forum, notes 80 limit)](https://forum.cursor.com/t/mcp-40-tools-way-to-less/79686), [EvoMap analysis](https://evomap.ai/blog/cursor-mcp-servers-setup-examples-limits)

8. **MCP capabilities supported beyond Tools.** Cursor supports MCP **Tools, Prompts, Resources, Roots, Elicitation, and Apps (interactive UI) extension**. If Cartographer wants to surface templated workflows or read-only data sources, Prompts/Resources are available too. Server failures are isolated (one crash won't kill others); debug via Output panel → "MCP Logs". [MCP docs](https://cursor.com/docs/mcp)

**Concrete `.cursor/mcp.json` for Cartographer (local Python + TS, project-scoped, secrets via env):**

```json
{
  "mcpServers": {
    "cartographer": {
      "type": "stdio",
      "command": "python",
      "args": ["${workspaceFolder}/skills/plan/scripts/mcp_server.py"],
      "env": {
        "CARTOGRAPHER_ROOT": "${workspaceFolder}",
        "API_KEY": "${env:CARTOGRAPHER_API_KEY}"
      },
      "envFile": "${workspaceFolder}/.env"
    },
    "cartographer-ts": {
      "type": "stdio",
      "command": "node",
      "args": ["--experimental-strip-types", "${workspaceFolder}/skills/plan/scripts/cartographer_state.ts", "mcp"]
    }
  }
}
```

---

### Surface 2 — SKILLS / WORKFLOW PROMPTS

9. **VERIFIED: Cursor added native Agent Skills (`SKILL.md`) in 2.4 (2026-01-22).** Changelog 2.4: "Cursor now supports Agent Skills in the editor and CLI. Agents can discover and apply skills when domain-specific knowledge and workflows are relevant. You can also invoke a skill using the slash command menu. Define skills in `SKILL.md` files, which can include custom commands, scripts, and instructions." Skills are explicitly positioned as better than rules for **dynamic context discovery and procedural "how-to" instructions** — i.e. exactly the Cartographer multi-step workflow case. [Changelog 2.4](https://cursor.com/changelog/2-4), [Skills docs](https://cursor.com/docs/skills)

10. **Skill directories & file layout (best fit for a Cartographer workflow).** Skills auto-load from: `.cursor/skills/` and `.agents/skills/` (project); `~/.cursor/skills/` and `~/.agents/skills/` (user/global). For compatibility Cursor *also* reads `.claude/skills/`, `.codex/skills/` and their `~/` equivalents — so an existing Claude-Code SKILL ports with **zero changes**. Each skill is a folder with a `SKILL.md`, optionally `scripts/`, `references/`, and `assets/` subdirs. Nested/monorepo skill dirs are discovered recursively and auto-scoped to their directory. [Skills docs](https://cursor.com/docs/skills)

11. **`SKILL.md` frontmatter fields.** `name` (required; lowercase/hyphens, must match folder name), `description` (required; how the agent decides relevance), `paths` (optional glob scoping — comma-string or list; replaces legacy `globs` which is still accepted as fallback), `disable-model-invocation` (optional; `true` = behaves like a pure slash command, only on explicit `/skill-name`), `metadata` (optional key-values). Skills load **progressively** (references/scripts pulled only when needed → context-efficient). [Skills docs](https://cursor.com/docs/skills)

12. **Skills can bundle and execute scripts in any language — the key Cartographer enabler.** "Skills can include a `scripts/` directory containing executable code that agents can run... Bash, Python, JavaScript, or any other executable format." This lets a Cartographer skill drive the deterministic CLI/wrapper steps directly from `SKILL.md` instructions, separate from (or in addition to) the MCP tool route. [Skills docs](https://cursor.com/docs/skills)

13. **RULES (`.cursor/rules/*.mdc`) — the four rule types & frontmatter.** Project rules live in `.cursor/rules/` as `.mdc` files (a plain `.md` there is **ignored** — no frontmatter; use `AGENTS.md` instead). Three frontmatter fields (`description`, `globs`, `alwaysApply`) produce four activation modes:
    - **Always Apply** (`alwaysApply: true`) — every chat session; globs/description ignored.
    - **Auto Attached** (`alwaysApply: false` + `globs` provided) — included when a matching file is in context.
    - **Agent Requested** / "Apply Intelligently" (`alwaysApply: false` + `description`, no globs) — agent reads description and pulls it in when relevant.
    - **Manual** (`alwaysApply: false`, no description, no globs) — only when `@`-mentioned (`@my-rule`).
    Rules can `@`-reference files (`@template.ts`) to include them in context, and can be organized in subfolders (nested rules). [Rules docs](https://cursor.com/docs/rules)

14. **COMMANDS (`.cursor/commands/*.md`) — custom slash commands (since v1.6).** Plain `.md` files in `.cursor/commands/` (project) or `~/.cursor/commands/` (global); the filename becomes the `/command` name. Team commands can be created via the Cursor Dashboard (Team/Enterprise). These are explicit, one-shot prompt expansions — distinct from `.mdc` rules (persistent context) and from skills (procedural, model-discoverable). [CLI slash commands docs](https://cursor.com/docs/cli/reference/slash-commands), [Toolsbase cheat sheet](https://toolsbase.dev/en/reference/cursor-commands)

15. **Migration tooling exists.** Cursor 2.4 ships a built-in `/migrate-to-skills` skill that converts eligible **dynamic rules** (`alwaysApply: false`/undefined, no globs) and **slash commands** into skills. Rules with `alwaysApply: true` or specific globs are intentionally NOT migrated (they have explicit triggers). [Skills help](https://cursor.com/help/customization/skills)

**Recommendation for the Cartographer "skill":** Express the multi-step Cartographer workflow as a **Skill**, not a rule or command — it's procedural, multi-step, and discovers context dynamically. Put it at `.cursor/skills/cartographer-plan/SKILL.md` (project, committed) with `scripts/` for the wrapper invocations and `references/` for the lifecycle/gate docs. Example:

```
.cursor/skills/cartographer-plan/
├── SKILL.md
├── scripts/
│   ├── proposal.py
│   ├── validation.py
│   └── handoff.py
└── references/
    └── lifecycle-gates.md
```

```markdown
---
name: cartographer-plan
description: Drives the Pi Cartographer planning lifecycle (proposal → fact → plan → validation → implement → handoff). Use when the user starts planning a topic, advances a phase, or records receipts.
---

# Cartographer Plan Workflow

Route deterministic mutations through the wrapper scripts; never hand-edit JSONL.

## Steps
1. Create/advance proposal: `python scripts/proposal.py --topic <topic>`
2. Capture validation receipts: `python scripts/validation.py --topic <topic>`
3. Run handoff/auditor: `python scripts/handoff.py auditor --topic <topic>`

See `references/lifecycle-gates.md` for human-gated transitions.
```

---

### Surface 3 — SUBAGENTS / DELEGATION (subagents work; only per-agent tool isolation degrades)

> **Framing correction (verified against `https://cursor.com/docs/subagents`, 2026-06-11):** Creating subagents is fully supported and Cartographer's specialist agent definitions port. The Configuration-fields table on that page lists exactly five fields — `name`, `description`, `model`, `readonly`, `is_background` — and the FAQ confirms subagents inherit *all* parent tools. So the gap is **not** "no subagents"; it is specifically **no declarative per-agent tool allowlist**. Treat this section as scoping that one limitation, not the subagent feature as a whole.

16. **VERIFIED: Custom Modes were removed in 2.1, and the replacement is Subagents (shipped 2.4).** Community confirms "Cursor 2.1 removed Custom Modes." Cursor 2.4 introduced **Subagents** as the file-based custom-agent story, and per the subagents-doc FAQ, since **2.5** subagents can even launch child subagents. So the "removed then re-added" framing is accurate: Custom Modes gone in 2.1, agent customization returned as Subagents in 2.4+. [Custom Agents forum thread](https://forum.cursor.com/t/custom-agents-vs-code-cc-double-down-cursor-removes-its-own/145931), [Changelog 2.4](https://cursor.com/changelog/2-4), [Subagents docs](https://cursor.com/docs/agent/subagents)

17. **Subagents DO exist as files: `.cursor/agents/*.md`.** File locations: project = `.cursor/agents/` (also `.claude/agents/`, `.codex/agents/` for compat); user = `~/.cursor/agents/` (+ compat dirs). `.cursor/` wins on name conflict; project beats user. Markdown + YAML frontmatter. Built-in subagents: **Explore** (codebase search), **Bash** (shell), **Browser** (MCP browser control). Invoke explicitly via `/name` or naturally ("use the verifier subagent"). [Subagents docs](https://cursor.com/docs/agent/subagents)

18. **Subagent frontmatter fields — NO tool/MCP scoping field exists.** The only documented config keys are: `name`, `description`, `model` (`inherit` or a model ID like `gpt-5.5`/`composer-2`), `readonly` (boolean — restricts writes: no file edits, no state-changing shell), and `is_background` (boolean). There is **no `tools:` and no `mcp_servers:` field.** The only access control is the coarse `readonly` write-lock; you cannot whitelist which MCP tools a subagent sees. [Subagents docs](https://cursor.com/docs/agent/subagents)

19. **CRITICAL — CONFIRMED: Cursor subagents force-inherit ALL MCP tools with no scoping (still true as of 2026).** The official subagents-doc FAQ states plainly: *"Can I use MCP tools in subagents? Yes. Subagents inherit all tools from the parent, including MCP tools from configured servers."* There is no mechanism to restrict this. An open feature request spells out the gap: *"Currently, all custom subagents (`.cursor/agents/*.md`) automatically inherit every configured MCP server and every tool within those servers from the parent environment. There is no way to 'un-inherit' or scope this"* — and proposes an `mcp_servers:` whitelist block in frontmatter that **does not yet exist**. [Subagents docs FAQ](https://cursor.com/docs/agent/subagents), [Subagent MCP Toolset Control Request (open feature request)](https://forum.cursor.com/t/cursor-subagent-mcp-toolset-control-request/159786)

20. **Honest comparison vs Claude Code.** This is the one surface where Cursor is materially behind Claude Code for Cartographer's needs:
    - Claude Code subagents support per-agent `tools:` allowlists (scope exactly which tools/MCP servers each subagent sees). **Cursor does not** — every subagent gets the full inherited toolset; the most you can do is `readonly: true`.
    - Consequences (per the feature request): token bloat from irrelevant tool schemas, model confusion, and **no way to prevent a "read-only" research subagent from seeing destructive MCP tools** (e.g. `delete_*`, `rm_dir`).
    - Additional reliability caveats: forum bug reports of subagents hitting `resource_exhausted` with certain MCP tools, and of **automation/Cloud-Agent subagents NOT inheriting** UI-defined or workspace `mcp.json` MCP servers (inconsistent with the editor behavior). Cartographer's child-subagent role-restriction model cannot be faithfully reproduced today.
    - Mitigation if you must restrict a subagent: rely on `readonly: true` for the write-lock, keep the MCP server surface minimal, and enforce destructive-tool gating via **hooks** (`beforeMCPExecution`/`beforeShellExecution`) rather than per-agent tool scoping. [Subagent MCP feature request](https://forum.cursor.com/t/cursor-subagent-mcp-toolset-control-request/159786), [resource_exhausted bug](https://forum.cursor.com/t/subagents-fail-with-resource-exhausted-when-using-mcp-tools/150916/1), [automation subagents don't inherit MCP](https://forum.cursor.com/t/in-cursor-automation-the-subagents-dont-inherit-the-mcp-servers-defined-in-the-ui-nor-the-workspace-mcp-json/156200)

**Example `.cursor/agents/cartographer-auditor.md` (best achievable scoping = readonly):**

```markdown
---
name: cartographer-auditor
description: Read-only auditor for Cartographer handoffs. Use after validation to confirm receipts and gate compliance. Do not edit files.
model: inherit
readonly: true
---

You are a skeptical Cartographer auditor. Verify validation receipts exist,
check phase-gate compliance, and report PASS/FAIL with evidence.
Note: you inherit all MCP tools — only use cartographer_* tools.
```
> The "only use cartographer_* tools" instruction is a **prompt-level** request, not an enforced restriction. Cursor will still expose every MCP tool to this subagent.

---

### Surface 4 — PROJECT MEMORY (AGENTS.md)

21. **VERIFIED: Cursor reads `AGENTS.md`.** It's a first-class rule source: "Agent instructions in markdown format. Simple alternative to `.cursor/rules`." Plain markdown, no frontmatter. Supported in **project root AND nested subdirectories** — nested files combine with parents, more-specific wins. [Rules docs — AGENTS.md](https://cursor.com/docs/rules)

22. **`.cursorrules` is legacy/deprecated (and silently ignored in agent mode).** A Cursor staffer confirmed on the forum: "`.cursorrules` is a legacy format and it's planned to be deprecated. The recommended approach is... `.cursor/rules/*.mdc` files with frontmatter." Multiple bug reports show `.cursorrules` being **silently ignored in Agent/Chat** (0/9 compliance), while the same content in a `.mdc` with `alwaysApply: true` worked (9/9). Do not rely on `.cursorrules` for the port. [Staff deprecation note (forum)](https://forum.cursor.com/t/project-rule-in-cursorrules-not-applied-in-agent-chat-works-in-cursor-rules/154309/3), [silently-ignored bug](https://forum.cursor.com/t/cursorrules-file-silently-ignored-in-agent-mode-with-no-warning/152046/1)

23. **Precedence when multiple rule sources exist.** The official Rules doc states the merge order for the structured sources: **Team Rules → Project Rules (`.cursor/rules/*.mdc`) → User Rules** ("all applicable rules are merged; earlier sources take precedence when guidance conflicts"). Community-documented full chain places the deprecated `.cursorrules` and `AGENTS.md` below those: **Team → Project (`.cursor/rules`) → User → `.cursorrules` (legacy) → `AGENTS.md`**. Note `AGENTS.md` and `.cursor/rules` are complementary, not mutually exclusive — `AGENTS.md` is the simple plain-markdown option; `.cursor/rules` adds globs/types/manual scoping. [Rules docs — precedence](https://cursor.com/docs/rules), [design.dev precedence guide](https://design.dev/guides/cursor-rules/), [HKTITAN cursor-best-practices](https://github.com/hktitan/cursor-best-practices/blob/HEAD/cursor-best-practices/references/rules-and-commands.md)

**Recommendation:** Keep a root `AGENTS.md` for the human-readable Cartographer guardrails (it already exists in this repo), and add scoped `.cursor/rules/*.mdc` for glob/auto-attached behavior where precision is needed. Don't ship `.cursorrules`.

---

### Cross-cutting: team sharing, hooks, long-running CLIs

24. **Team packaging & sharing.** Everything file-based is committed to the repo and shared via git: `.cursor/mcp.json` (project MCP), `.cursor/rules/*.mdc`, `.cursor/commands/*.md`, `.cursor/skills/**/SKILL.md`, `.cursor/agents/*.md`, `AGENTS.md`. User-global equivalents live under `~/.cursor/`. Additionally: **Team Rules** (dashboard-managed, Team/Enterprise, can be *enforced* so users can't disable), **Remote Rules** (import `.mdc` from a GitHub repo into `.cursor/rules/imported/<repo>`), **Skills from GitHub** (Settings → Rules → Add Rule → Remote Rule), and a **Plugins** system + Marketplace for packaged distribution. For a portable Cartographer extension, commit the `.cursor/` tree to the repo (best) and/or publish skills via a GitHub repo URL. [Rules docs](https://cursor.com/docs/rules), [Skills docs](https://cursor.com/docs/skills), [Plugins reference](https://cursor.com/docs/reference/plugins)

25. **Hooks system exists (Claude-Code-compatible).** Cursor has lifecycle hooks defined in a `hooks.json` (version 1): `sessionStart`/`sessionEnd`, `preToolUse`/`postToolUse`/`postToolUseFailure`, `subagentStart`/`subagentStop`, `beforeShellExecution`/`afterShellExecution`, `beforeMCPExecution`/`afterMCPExecution`, `beforeReadFile`/`afterFileEdit`, `beforeSubmitPrompt`, `stop`, `preCompact`. Hooks run shell commands at these points and can **block** actions — this is the recommended way to enforce destructive-tool gating that subagent frontmatter can't (see Finding 20). Claude Code hook names are auto-mapped. This lets Cartographer enforce its "never hand-edit JSONL / route through wrappers" discipline programmatically. [Hooks docs](https://cursor.com/docs/hooks), [Third-party hooks docs](https://cursor.com/docs/reference/third-party-hooks)

26. **Constraints on long-running local CLI tools.** (a) **MCP per-call approval** prompts each tool invocation unless allowlisted in `permissions.json` — friction for many sequential Cartographer calls. (b) **Tool-count ceiling (~40–80)** caps visible tools. (c) **stdio servers are Cursor-managed subprocesses**; on crash/timeout Cursor marks the call failed and isolates it from other servers (so a hanging long-running tool fails the call rather than the whole session). (d) For genuinely long-running work, prefer the **Bash subagent** or **background subagents** (`is_background: true`, output under `~/.cursor/subagents/`) for context isolation. (e) Sandbox/network settings (`/sandbox`) and Run Mode govern what shell/MCP can do without approval. [MCP docs](https://cursor.com/docs/mcp), [Subagents docs](https://cursor.com/docs/agent/subagents)

---

## Sources

**Kept (primary / official):**
- Model Context Protocol (MCP) — https://cursor.com/docs/mcp — canonical `.cursor/mcp.json` schema, transports, interpolation, approval, Run Mode/`permissions.json`.
- MCP integrations (help) — https://cursor.com/help/customization/mcp — project-vs-global merge + "project wins" rule.
- Agent Skills — https://cursor.com/docs/skills — `SKILL.md` format, directories, frontmatter, scripts.
- Skills (help) — https://cursor.com/help/customization/skills — `/migrate-to-skills`, invocation modes.
- Rules — https://cursor.com/docs/rules — four rule types, frontmatter table, AGENTS.md, precedence (Team→Project→User), Team/Remote rules.
- Subagents — https://cursor.com/docs/agent/subagents — `.cursor/agents/*.md`, frontmatter (no tool-scoping field), FAQ confirming full MCP inheritance, built-ins, 2.5 child subagents.
- Changelog 2.4 — https://cursor.com/changelog/2-4 — verifies Subagents + Skills shipped 2026-01-22.
- Hooks — https://cursor.com/docs/hooks — lifecycle hook events, blocking, `hooks.json`.
- Third-party hooks — https://cursor.com/docs/reference/third-party-hooks — Claude Code hook name mapping.
- CLI slash commands — https://cursor.com/docs/cli/reference/slash-commands — built-in `/` commands.
- Plugins reference — https://cursor.com/docs/reference/plugins — packaging/distribution.

**Kept (corroborating / community evidence for version-specific & gap claims):**
- Subagent MCP Toolset Control Request (forum) — https://forum.cursor.com/t/cursor-subagent-mcp-toolset-control-request/159786 — primary evidence of the no-scoping gap + proposed (nonexistent) `mcp_servers` block.
- Custom Agents removed/re-added (forum) — https://forum.cursor.com/t/custom-agents-vs-code-cc-double-down-cursor-removes-its-own/145931 — Custom Modes removed in 2.1.
- `.cursorrules` deprecation staff note — https://forum.cursor.com/t/project-rule-in-cursorrules-not-applied-in-agent-chat-works-in-cursor-rules/154309/3
- `.cursorrules` silently ignored bug — https://forum.cursor.com/t/cursorrules-file-silently-ignored-in-agent-mode-with-no-warning/152046/1
- Tool-count limit threads — https://forum.cursor.com/t/tools-limited-to-40-total/67976 and https://forum.cursor.com/t/mcp-40-tools-way-to-less/79686 (40→80).
- YOLO/MCP auto-run — https://forum.cursor.com/t/yolo-mode-doesnt-auto-run-mcp-tools/50366
- Precedence chain — https://design.dev/guides/cursor-rules/ and https://github.com/hktitan/cursor-best-practices

**Dropped:**
- EvoMap / DataCamp / Morph / QASkills / developertoolkit SEO explainers — accurate but secondary; used only to corroborate the tool-limit number, superseded by official docs.
- changelogs.directory mirror of the 2.4 changelog — redundant with the official changelog.
- shinpr/sub-agents-mcp (third-party MCP) — a workaround, not native Cursor behavior; out of scope for mapping.

---

## Gaps

1. **Exact current tool-count cap.** Official docs don't state a number; community evidence says 40 raised to ~80. The precise live limit (and whether it's per-server or global) should be confirmed empirically in your installed Cursor build before assuming all ~20 Cartographer tools + other servers fit.
2. **`permissions.json` schema detail.** The MCP doc references pre-approving tools and `autoRun` instructions in `permissions.json` but I did not pull the full schema. Next step: fetch the Run Mode / permissions reference page to script Cartographer tool allowlisting.
3. **Whether subagent MCP scoping has shipped.** The gap is confirmed open as of the cited docs/forum, but Cursor iterates fast — re-check the subagents doc frontmatter table and feature request #159786 for a `tools:`/`mcp_servers:` field before finalizing the port. The proposed syntax is not yet implemented.
4. **Cloud Agent / automation MCP inheritance inconsistency.** A bug report indicates automation subagents don't inherit UI/workspace MCP servers (unlike editor subagents). If Cartographer targets Cloud Agents, verify MCP availability there specifically.
5. **`.cursor/commands/*.md` frontmatter.** Commands are plain markdown; whether they accept any frontmatter (args, model) wasn't fully confirmed from official docs (the dedicated commands doc URL 404'd at `/docs/commands`). Confirm via Settings → Rules, Commands UI.
