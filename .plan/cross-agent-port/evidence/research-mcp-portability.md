# Research: Cross-Agent Portability Architecture for a Coding-Agent Extension (Pi Cartographer → opencode, Codex CLI, Claude Code, Cursor)

> **AI disclosure:** Pi Coding Agent: Claude Opus 4.8 (US) (AWS Bedrock US)

Research current as of 2026-06-11. Sources verified against official docs (modelcontextprotocol.io, agents.md, Codex/Cursor/opencode/Claude Code docs, SDK repos).

## Summary

MCP is the only real lowest-common-denominator **tool** layer — all four agents speak it over stdio, so wrap your existing Python+TS CLI scripts behind **one stdio MCP server** (build it with the **TypeScript SDK**, since Node is already a hard dependency via `--experimental-strip-types`). However, **MCP prompts are NOT a portable skill-delivery mechanism**: only Claude Code and Cursor surface them at all, and only as *user-invoked slash commands* that the model cannot see or trigger autonomously (Claude Code issue #11054). Skills/workflows port far better as **`SKILL.md`** files (an open standard since Dec 2025, read by all four) or, for autonomy, as **MCP tools that return workflow instructions**. **AGENTS.md** is the canonical project-memory file for Codex/opencode/Cursor and a *fallback* for Claude Code (symlink `CLAUDE.md → AGENTS.md`). The genuinely non-portable feature is **subagents with tool restriction**: strong in Claude Code/opencode/Codex, but Cursor subagents force-inherit all MCP tools with no scoping.

## Findings

### 1. MCP spec, transports, and the prompts problem

1. **Two standard transports; SSE is deprecated.** The current MCP spec defines exactly two transports: **stdio** (client launches server as a subprocess, newline-delimited JSON-RPC over stdin/stdout) and **Streamable HTTP** (introduced in 2025-03-26, replacing the old HTTP+SSE binding from 2024-11-05). The latest released spec revision is **2025-11-25**; a draft continues to evolve Streamable HTTP (e.g., removing the GET stream endpoint and protocol-level sessions). For a local CLI-wrapping extension, **stdio is the correct and only transport you need.** [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) · [stdio](https://modelcontextprotocol.io/specification/draft/basic/transports/stdio)

2. **Three server primitives — Tools (model-controlled), Resources (read-only data), Prompts (user-invoked workflows).** Per the official model: Tools = actions the AI decides to call; Resources = documents the AI can read; **Prompts = workflows the *user* explicitly selects.** Prompts can bundle arguments, completions, and embedded resources — they are genuinely "skill-like" workflow templates. [Server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts) · [MCP Prompts: Building Workflow Automation](https://blog.modelcontextprotocol.io/posts/2025-07-29-prompts-for-automation/)

3. **CRITICAL: MCP prompts do NOT port as autonomous skills.** The defining constraint of the prompt primitive is that it is *user-controlled*, surfaced as a slash command — the model cannot proactively invoke or even see it:
   - **Claude Code:** MCP prompts appear as slash commands (`/mcp__server__prompt`) that a user can run, but they are **not visible to Claude in conversation context**, so Claude cannot suggest or autonomously use them (unlike MCP tools, which it sees). Title-vs-name bugs also exist. [claude-code#11054](https://github.com/anthropics/claude-code/issues/11054) · [#7464](https://github.com/anthropics/claude-code/issues/7464)
   - **Cursor:** docs list Prompts as "Supported," but in practice surfacing is flaky — prompts with slashes in the name silently fail, and there are open feature requests to actually expose MCP prompts as slash commands. Treat as partial/unreliable. [Cursor MCP docs](https://cursor.com/docs/mcp) · [forum: slashes bug](https://forum.cursor.com/t/mcp-prompts-with-slashes-do-not-work/135336) · [forum: integrate MCP prompts](https://forum.cursor.com/t/integrate-mcp-prompts/76065)
   - **opencode:** MCP docs state only that "MCP **tools** are automatically available to the LLM." No prompt surfacing is documented → treat as **tools-only**. [opencode MCP](https://opencode.ai/docs/mcp-servers/)
   - **Codex CLI:** MCP is used for tools; Codex's own "custom prompts" come from `~/.codex/prompts/*.md` (its native slash-command format), **not** from MCP prompt advertisements. MCP prompts are not surfaced. [Codex customization](https://developers.openai.com/codex/concepts/customization)

   **Implication:** Do **not** rely on MCP prompts to ship skills/workflows cross-agent. They are at best a Claude-Code/Cursor convenience for human-triggered flows. For workflows the agent should run autonomously, expose them as **MCP tools** (which all four surface to the model). For human-authored reusable workflows, ship **`SKILL.md`** (see Finding 8).

### 2. MCP server SDK choice — build one TypeScript stdio server

4. **Both official SDKs wrap CLI scripts equally well; the server's language need not match the scripts' language.** Your MCP server is a thin dispatcher that `spawn`s the existing Python-stdlib and `node --experimental-strip-types` scripts as subprocesses and marshals stdout↔JSON-RPC. Either SDK can do this. The Python SDK (`mcp` on PyPI, **v1.x stable; v2 in alpha**) ships FastMCP for ~20-line servers; the TypeScript SDK (`@modelcontextprotocol/sdk`, 150M+ downloads) takes ~40 lines with Zod schemas. [python-sdk README](https://github.com/modelcontextprotocol/python-sdk) · [env.dev build guide](https://env.dev/guides/how-to-build-an-mcp-server)

5. **Recommendation: TypeScript SDK (`@modelcontextprotocol/sdk`), single stdio server.** Rationale:
   - **Node is already a guaranteed runtime** (the extension uses `node --experimental-strip-types`), so a TS server adds no new system dependency. A FastMCP server would force a Python environment/`uvx` install story onto distribution.
   - **Distribution converges on npm/npx.** The same package can ship the MCP server *and* the config-fanout installer (Finding 9) as one `npx`-runnable artifact. Python distribution (`pip`/`uvx`) is a separate, less universal channel.
   - The server stays language-agnostic at the dispatch boundary — it shells out to Python *and* TS scripts identically. Keep the core logic in the existing portable CLI scripts; the MCP server is purely an adapter, mirroring the current thin pi tool-adapter.

   **Architecture:** `bin/mcp-server.ts` (TS SDK, stdio) registers one MCP **tool per CLI verb** (e.g., `cartographer_plan`, `cartographer_validation`, `cartographer_state`), each tool's handler validating args with Zod then `spawn`ing `python3 scripts/...py` or `node --experimental-strip-types scripts/...ts`, returning stdout as tool result. This is the single capability surface all four agents consume identically.

### 3. AGENTS.md and the per-agent fallback/symlink strategy

6. **AGENTS.md is the widest-adopted canonical project-memory file (22k+ stars, 20k+ repos), but Claude Code treats it only as a fallback.** Native behavior:
   - **Codex CLI:** ✓ **native primary.** Reads `~/.codex/AGENTS.md` (global), then `AGENTS.md` walking git-root→cwd, with `AGENTS.override.md` precedence. [Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)
   - **opencode:** ✓ **native primary** (`CLAUDE.md` supported only as legacy fallback). [opencode rules](https://opencode.ai/docs/rules/)
   - **Cursor:** ✓ reads `AGENTS.md` at repo root **plus** `.cursor/rules/*.mdc`. [agents.md adoption list](https://agents.md/)
   - **Claude Code:** reads **`CLAUDE.md` first**; `AGENTS.md` is used **only if `CLAUDE.md` is absent** (per Anthropic's 2026 memory docs). There are open feature requests to make it first-class. [claude-code#6235](https://github.com/anthropics/claude-code/issues/6235) · [#34235](https://github.com/anthropics/claude-code/issues/34235)

7. **Fallback strategy: `AGENTS.md` as single source of truth + symlinks/`@`-imports.** Make `AGENTS.md` canonical, then `ln -sfn AGENTS.md CLAUDE.md` (Claude Code), and optionally `.cursor/rules/main.mdc → ../../AGENTS.md`. Alternatives: `@AGENTS.md` import inside `CLAUDE.md` (Claude Code + opencode understand `@`-imports; Cursor/Copilot do not), or a one-line pointer file (~95% adherence). **Windows trap:** without `git config --global core.symlinks true`, symlinks check out as plain text files containing the literal string `AGENTS.md`, silently loading nothing — add a CI check (`test -L CLAUDE.md`). [sph.sh: One Setup to Rule Them All](https://sph.sh/en/posts/model-agnostic-ai-coding-setup/)

### 4. Skills (the better skill-delivery path) and distribution/install

8. **`SKILL.md` is an open standard (Anthropic, Dec 2025) and ports across all four agents — far better than MCP prompts for shipping skills.** By 2026 the format is read by Claude Code, opencode (`.opencode/skills/`, `SKILL.md`), Cursor (Skills added in changelog 2.4), and Codex CLI (Skills listed in Codex customization). A skill written once typically loads in all four unchanged; **only the discovery directory differs**, which the installer handles. [sph.sh](https://sph.sh/en/posts/model-agnostic-ai-coding-setup/) · [opencode skills](https://opencodeguide.com/en/opencode-skills/) · [Cursor changelog 2.4](https://cursor.com/changelog/2-4) · [Codex customization](https://developers.openai.com/codex/concepts/customization)

9. **Distribution: an `npx` config-fanout installer is the established pattern — and you should ship your own.** Multiple existing tools prove the pattern (write the same server into each agent's distinct config file/format): `neondatabase/add-mcp`, `gerardbalaoro/mcpx-cli`, `william-garden/sync-mcp`, and `intellectronica/ruler` (rules fanout). Each agent's MCP config target differs in **path and format**:

   | Agent | MCP config file | Format |
   |---|---|---|
   | Claude Code | `.mcp.json` (project root) / `~/.claude.json` (user) | JSON, `mcpServers` key |
   | Cursor | `.cursor/mcp.json` / `~/.cursor/mcp.json` | JSON, `mcpServers` key |
   | OpenAI Codex | `.codex/config.toml` / `~/.codex/config.toml` | **TOML** |
   | opencode | `opencode.json` / `~/.config/opencode/` | JSON, `mcp` key |

   The MCP server entry shape (`command`, `args`, `env`) is otherwise nearly identical (Cursor/Claude Code copy verbatim). [add-mcp](https://github.com/neondatabase/add-mcp) · [mcpx-cli](https://github.com/gerardbalaoro/mcpx-cli) · [agent-drop comparison](https://agent-drop.com/claude-code-vs-cursor-mcp) · [sph.sh](https://sph.sh/en/posts/model-agnostic-ai-coding-setup/)

   **Recommended installer (`npx @pi/cartographer-install`):**
   1. Detect installed agents (presence of `~/.codex`, `~/.claude.json`, `.cursor/`, `opencode.json`).
   2. **MCP:** write/merge the cartographer stdio server entry into `.mcp.json`, `.cursor/mcp.json`, `~/.codex/config.toml` (TOML emitter), and `opencode.json` (`mcp` key) — idempotent merge, never clobber existing servers.
   3. **Memory:** create `AGENTS.md` (or leave existing) and `ln -sfn AGENTS.md CLAUDE.md`; on Windows write a real copy + CI lint instead of a symlink.
   4. **Skills:** copy the canonical `SKILL.md` set into each agent's skill dir (`.claude/skills/`, `.opencode/skills/`, Cursor's skills path, Codex skills path).
   5. **Commands:** optionally emit custom slash commands (`.claude/commands/`, `.opencode/command/`, `.cursor/commands/`, `~/.codex/prompts/*.md`).
   6. **Subagents:** emit agent definitions where supported (`.claude/agents/`, `.opencode/agents/`, `.codex/agents/*.toml`) — **skip tool-restriction on Cursor** (Finding 11).

### 5. Capability gap matrix

10. **Gap matrix (2026).** ✓ = supported, ⚠ = partial/unreliable, ✗ = not supported.

| Capability | Claude Code | opencode | Codex CLI | Cursor |
|---|---|---|---|---|
| **Local custom tools** (native, non-MCP) | ⚠ hooks only | ✓ plugins/`.opencode/tool` | ✗ (MCP only) | ✗ (MCP only) |
| **MCP tools** (model-visible) | ✓ | ✓ | ✓ | ✓ |
| **MCP prompts** (autonomous) | ✗ (slash-cmd only, model can't see — #11054) | ✗ (tools only) | ✗ (uses own `~/.codex/prompts`) | ⚠ (docs say yes; buggy in practice) |
| **Skills (`SKILL.md`)** | ✓ | ✓ (`.opencode/skills/`) | ✓ | ✓ (changelog 2.4) |
| **Subagents with tool restriction** | ✓ **strongest** (`.claude/agents/`, `tools:`/`allowed-tools`, `permissions.deny`) | ✓ (`.opencode/agents/`, `permission` blocks) | ✓ (`.codex/agents/*.toml`; manual trigger only) | ✗ **subagents exist (`.cursor/agents/*.md`) but force-inherit ALL MCP tools, no scoping** (forum #159786) |
| **Custom slash commands** | ✓ `.claude/commands/` | ✓ `.opencode/command/` | ✓ `~/.codex/prompts/*.md` | ✓ `/commands`, `.cursor/commands/` |
| **AGENTS.md (project memory)** | ⚠ fallback only (CLAUDE.md primary) | ✓ native | ✓ native | ✓ (+ `.cursor/rules`) |

   [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) · [opencode agents](https://opencode.ai/docs/agents/) + [permissions](https://opencode.ai/docs/permissions/) · [Codex subagents](https://developers.openai.com/codex/subagents) · [Cursor subagent toolset request](https://forum.cursor.com/t/cursor-subagent-mcp-toolset-control-request/159786) · [Cursor custom modes removed](https://forum.cursor.com/t/what-happened-to-custom-modes/147068)

11. **Subagents-with-tool-restriction is the hardest-to-port feature — confirmed.** Claude Code is the gold standard (per-subagent `tools`/`allowed-tools` frontmatter + `permissions.deny`). opencode matches it via primary/subagent + granular `permission` blocks. Codex added TOML agents under `.codex/agents/` (default-on, but **manual trigger only** — "spawn two agents"), with IDE visibility still landing. **Cursor is the gap:** it *removed* Custom Modes in 2.1, re-added subagents (`.cursor/agents/*.md`) in later releases, but those subagents **automatically inherit every MCP server/tool with no un-inherit/scoping mechanism** — an open feature request flags this as a compliance blocker. **Portability strategy:** define the restricted-subagent topology natively for Claude Code/opencode/Codex; for Cursor, degrade gracefully — expose the same capability as a slash command + a narrowly-scoped MCP tool set, and document that strict tool isolation is not enforceable there.

## Concrete recommendations

1. **One stdio MCP server in TypeScript** (`@modelcontextprotocol/sdk`) that dispatches to the existing Python/TS CLI scripts — one MCP **tool** per cartographer verb. This is the universal capability surface; do not depend on MCP prompts.
2. **Ship workflows two ways:** (a) as **MCP tools** that return workflow instructions, for agent-autonomous use across all four; (b) as portable **`SKILL.md`** files for human-discoverable skills. Reserve MCP prompts (if used at all) for Claude-Code-only human slash-command convenience.
3. **`AGENTS.md` = single source of truth**, symlink `CLAUDE.md → AGENTS.md` (real-copy + CI lint on Windows).
4. **Ship an `npx` config-fanout installer** that writes the MCP entry into all four config files/formats (JSON ×3 + TOML), copies `SKILL.md`/commands/subagent defs into each agent's dirs, idempotently. Model it on `add-mcp`/`mcpx-cli`/`ruler`.
5. **Accept the subagent wall:** native restricted subagents for Claude Code/opencode/Codex; document Cursor as tool-restriction-incapable and fall back to slash command + scoped MCP toolset there.

## Sources

**Kept (authoritative/primary):**
- MCP spec — Transports 2025-11-25 / stdio draft (modelcontextprotocol.io) — confirms two transports, SSE deprecated, stdio model.
- MCP server-concepts + Prompts-automation blog (modelcontextprotocol.io) — definitive tools/resources/prompts semantics and prompt-as-user-workflow nature.
- claude-code#11054, #7464, #6235, #34235 (github.com/anthropics) — primary evidence MCP prompts aren't model-visible and AGENTS.md is fallback-only.
- Codex docs: AGENTS.md guide, customization, subagents (developers.openai.com) — native AGENTS.md, `.codex/agents/`, MCP-for-tools, own prompts dir.
- opencode docs: agents, permissions, mcp-servers, rules (opencode.ai) — native AGENTS.md, MCP tools-only, permission-scoped subagents, SKILL.md.
- Cursor docs + forum: MCP docs, changelog 2.4, custom-modes removal, subagent toolset request (cursor.com / forum.cursor.com) — Prompts "supported" but buggy; subagents force-inherit tools.
- agents.md + agentsmd/agents.md repo — adoption breadth, canonical standard.
- sph.sh "One Setup to Rule Them All" — best synthesized cross-tool layout (symlinks, MCP fanout, the LCD wall); cross-checked against official docs.
- add-mcp / mcpx-cli / sync-mcp / ruler (github) — proven installer/fanout patterns and per-agent config paths/formats.
- agent-drop Claude Code vs Cursor MCP — config scopes, verbatim server portability, daemon pattern.
- python-sdk README + env.dev/Growth Engineer build guides — SDK maturity (v1 stable/v2 alpha), boilerplate comparison.

**Dropped:**
- codersera / tinyctl / developersdigest "best agent 2026" roundups — SEO/commentary, no primary config detail.
- Generic "what is MCP" explainers (techcommunity, engineersofai, rust-mcp course) — redundant once primary spec read.
- opencode-mcp (alaeddinemessadi) — a *different* product (bridges to opencode's API), not relevant to the wrapping question.

## Gaps

- **Exact latest MCP spec revision:** confirmed 2025-11-25 is released and current; a draft (referenced with a future-dated label) is evolving Streamable HTTP. Does not affect a stdio-only design, but verify the pinned spec/SDK version at build time.
- **Cursor MCP-prompt status is moving:** docs claim support, practice is buggy. If Cursor prompt support matters, re-test against the installed Cursor build before depending on it.
- **Codex `.codex/agents/` tool-restriction granularity:** docs confirm custom TOML agents exist; the precise per-agent tool-allow/deny schema should be read from the live Codex config reference at implementation time.
- **Skill discovery paths per agent** were confirmed to differ but not all exhaustively enumerated (esp. Cursor's and Codex's skill dirs) — verify each agent's current skills path in the installer before writing files.
