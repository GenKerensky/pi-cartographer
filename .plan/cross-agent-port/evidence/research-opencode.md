# Research: opencode (SST) extensibility / plugin model — porting Pi Cartographer

## Summary

opencode (github.com/sst/opencode, docs at opencode.ai/docs) has first-class,
file-based extension points that map cleanly onto all four Pi Cartographer
surfaces. **Custom tools** are TS/JS files in `.opencode/tools/` (or a plugin's
`tool:` map) that can shell out to any language; **MCP** (stdio `local` + http
`remote`) is also fully supported via `opencode.json`. **Skills** are
`SKILL.md` folders loaded on demand via a native `skill` tool. **Subagents** are
markdown+YAML-frontmatter files in `.opencode/agents/` with per-agent
permissions/model/prompt. **Project memory** is `AGENTS.md` (with `CLAUDE.md`
fallback) plus an `instructions` config array. All four Cartographer surfaces
port over with minimal impedance.

---

## Findings

### 1. Custom tools — direct port for the ~20 deterministic Cartographer tools

1. **opencode supports local custom tools as TS/JS files; the definition can shell out to any language.** This is the closest analog to pi's `pi.registerTool(...)`. Tools live in `.opencode/tools/` (project) or `~/.config/opencode/tools/` (global). The **filename becomes the tool name** (e.g. `database.ts` → tool `database`). [Custom Tools](https://opencode.ai/docs/custom-tools/)

2. **The tool-definition API/signature** uses the `tool()` helper from `@opencode-ai/plugin`. Args are a **Zod** schema (`tool.schema.*`, which is just Zod; you may also `import { z } from "zod"` and export a plain object). The execute signature is `execute(args, context)` — note this is `(args, context)`, **not** pi's `(toolCallId, params, signal)`. [Custom Tools](https://opencode.ai/docs/custom-tools/)

   ```ts
   // .opencode/tools/cartographer_validation.ts
   import { tool } from "@opencode-ai/plugin"
   import path from "path"

   export default tool({
     description: "Run Cartographer validation receipts for a plan/topic",
     args: {
       topic: tool.schema.string().describe("Plan topic id"),
     },
     async execute(args, context) {
       const script = path.join(context.worktree, "skills/plan/scripts/validate.ts")
       const out = await Bun.$`node --experimental-strip-types ${script} --topic ${args.topic} --json`.text()
       return out.trim() // shaped text returned to the model
     },
   })
   ```

3. **`context` object** gives `{ agent, sessionID, messageID, directory, worktree }`. Use `context.worktree` for the git worktree root and `context.directory` for the session cwd — useful for locating CLI scripts. There is **no `signal`/abort param and no `toolCallId`** exposed in the documented signature (a behavioral gap vs pi's API). [Custom Tools](https://opencode.ai/docs/custom-tools/)

4. **Multiple tools per file** → each named export becomes `<filename>_<exportname>` (e.g. `math.ts` exporting `add`/`multiply` → `math_add`, `math_multiply`). For ~20 tools you can either use one file per tool (clean 1:1 names like `cartographer_index.ts`) or group them. Custom tool names **override built-in tools** of the same name. [Custom Tools](https://opencode.ai/docs/custom-tools/)

5. **Tools can also be registered from a plugin** via the returned `tool:` map (`{ tool: { mytool: tool({...}) } }`). This is the path to use if you want the tools bundled in a distributable npm plugin rather than dropped as loose files. [Plugins](https://opencode.ai/docs/plugins/)

6. **Shelling out**: docs explicitly bless invoking external scripts (their example runs `python3` via Bun's `Bun.$` shell). This matches Cartographer's "shell out to Python/TS CLI, return shaped text" model exactly. [Custom Tools](https://opencode.ai/docs/custom-tools/)

### 2. Skills / workflow prompts — direct analog to SKILL.md

7. **opencode has a native Skills mechanism that is API-compatible with the Claude/Anthropic SKILL.md convention.** Skills are reusable instructions loaded **on demand** via a built-in `skill` tool — the agent sees a `<available_skills>` list (name + description) and calls `skill({ name: "..." })` to load full content. This matches Cartographer's "surfaced to the model on demand" design. [Agent Skills](https://opencode.ai/docs/skills/)

8. **Layout & locations**: one folder per skill, `SKILL.md` inside. Searched locations (project + global, plus Claude/agent compatibility):
   - `.opencode/skills/<name>/SKILL.md` and `~/.config/opencode/skills/<name>/SKILL.md`
   - `.claude/skills/<name>/SKILL.md` and `~/.claude/skills/<name>/SKILL.md`
   - `.agents/skills/<name>/SKILL.md` and `~/.agents/skills/<name>/SKILL.md`
   [Agent Skills](https://opencode.ai/docs/skills/)

9. **Frontmatter fields recognized**: only `name` (required), `description` (required), `license`, `compatibility`, `metadata` (string→string map). Unknown fields are ignored. `name` must be lowercase alphanumeric with single hyphens, 1–64 chars, and **must match the folder name**. `description` is 1–1024 chars. Note this is a **narrower frontmatter schema** than Cartographer's SKILL.md may use today — extra fields will be silently dropped, so any workflow metadata Cartographer relies on must move into the body or `metadata`. [Agent Skills](https://opencode.ai/docs/skills/)

10. **Skill permissions** are pattern-based in `opencode.json` (`permission.skill`: `allow`/`deny`/`ask`, with wildcards like `internal-*`), and can be overridden per agent or disabled entirely (`tools: { skill: false }`). [Agent Skills](https://opencode.ai/docs/skills/)

11. **Slash-commands / custom commands** are a separate, complementary mechanism. Markdown files in `commands/` (`.opencode/commands/<name>.md` or `~/.config/opencode/commands/<name>.md`), or a `command` map in `opencode.json`. Frontmatter: `description`, `agent`, `model`, `subtask`; body is the prompt template. Templates support `$ARGUMENTS`/`$1..$N`, shell injection via `` !`cmd` ``, and file refs via `@path`. Built-ins like `/init`, `/undo`, `/share` exist; a custom command of the same name overrides. Good fit for Cartographer "kick off this workflow" entry points; `subtask: true` forces execution in a subagent to avoid polluting primary context. [Commands](https://opencode.ai/docs/commands/)

### 3. Subagents — direct analog to Cartographer's restricted specialist agents (e.g. read-only auditor)

12. **opencode has two agent types: `primary` and `subagent`** (plus `all`). Built-in primaries: `build` (all tools), `plan` (restricted). Built-in subagents: `general`, `explore` (read-only), `scout` (read-only docs/dependency research). Primary agents delegate to subagents **automatically** (based on the subagent `description`) via the **Task tool**, or the user can **@mention** them (`@auditor ...`). [Agents](https://opencode.ai/docs/agents/)

13. **Markdown definition** (closest to Cartographer's format): files in `~/.config/opencode/agents/` (global) or `.opencode/agents/` (project); **filename becomes agent name** (`auditor.md` → `auditor`). Frontmatter fields: `description` (**required**), `mode` (`primary`|`subagent`|`all`), `model`, `temperature`, `top_p`, `steps` (max agentic iterations), `disable`, `hidden`, `color`, `permission` (and legacy `tools`), plus any extra keys passed through to the provider (e.g. `reasoningEffort`). Body is the system prompt. [Agents](https://opencode.ai/docs/agents/)

    ```markdown
    ---
    description: Read-only auditor that verifies Cartographer handoff receipts
    mode: subagent
    model: anthropic/claude-sonnet-4-5
    temperature: 0.1
    permission:
      edit: deny
      bash:
        "*": deny
        "git diff": allow
        "git log*": allow
      webfetch: deny
    tools:
      cartographer_validation: true
      cartographer_handoff: true
    ---
    You are the Cartographer auditor. Verify validation receipts and handoff
    context. Never modify files. Report PASS/FAIL with cited evidence.
    ```

14. **Restricting tools (the auditor use case).** Two mechanisms:
    - **`permission`** (preferred/current): keys include `read`, `edit` (gates `write`/`edit`/`apply_patch`), `glob`, `grep`, `list`, `bash`, `task`, `external_directory`, `todowrite`, `webfetch`, `websearch`, `lsp`, `skill`, `question`, `doom_loop`. Values: `allow`/`ask`/`deny`; several keys also accept glob→action maps (e.g. per-bash-command rules). A read-only agent = `edit: deny` (+ `bash` deny/ask). [Agents](https://opencode.ai/docs/agents/)
    - **`tools`** (now **deprecated** in favor of `permission`): boolean allow/deny per tool name, with wildcards (`"mymcp_*": false`, `"cartographer_*": true`). Still useful for an **allowlist of custom tools** since `permission` keys gate built-in categories, not individual custom/MCP tools. [Agents](https://opencode.ai/docs/agents/)

15. **Delegation control**: `permission.task` (glob → allow/ask/deny) restricts which subagents an agent may invoke via the Task tool; `deny` removes the subagent from the Task tool description entirely. `hidden: true` keeps a subagent out of the `@` autocomplete but still invokable programmatically. There's an interactive `opencode` create-agent flow that writes the markdown file for you. [Agents](https://opencode.ai/docs/agents/)

16. **JSON alternative**: agents can equivalently be defined under the `agent` key in `opencode.json` (same fields). Useful if Cartographer wants to ship agent config inside a single distributable config file rather than loose markdown. [Agents](https://opencode.ai/docs/agents/)

### 4. Project memory — AGENTS.md is natively supported

17. **opencode reads `AGENTS.md`** (Cursor-rules-style instructions injected into the model's context). `/init` scaffolds/updates it. Project file = `AGENTS.md` in repo root (applies to that dir + subdirs, found by walking up to the nearest git dir); global = `~/.config/opencode/AGENTS.md`. [Rules](https://opencode.ai/docs/rules/)

18. **Precedence / fallbacks** (first match wins per category): (1) local `AGENTS.md` (then `CLAUDE.md` fallback) walking up from cwd; (2) global `~/.config/opencode/AGENTS.md`; (3) `~/.claude/CLAUDE.md` (unless disabled). `AGENTS.md` beats `CLAUDE.md`; opencode global beats Claude global. Claude-Code compat can be turned off with `OPENCODE_DISABLE_CLAUDE_CODE[_PROMPT|_SKILLS]=1`. **Cartographer's existing top-level `AGENTS.md` works as-is.** [Rules](https://opencode.ai/docs/rules/)

19. **Additional instruction files** via `instructions` in `opencode.json` — an array of paths/globs (and even remote URLs, 5s timeout), e.g. `["CONTRIBUTING.md", "docs/guidelines.md", "packages/*/AGENTS.md", ".cursor/rules/*.md"]`. All are combined with `AGENTS.md`. opencode does **not** auto-parse `@file` references inside `AGENTS.md` — you either list them in `instructions` or instruct the model to lazy-load them with the read tool. [Rules](https://opencode.ai/docs/rules/)

### 5. MCP support (stdio + remote/http) — full schema

20. **MCP servers are defined under the `mcp` key in `opencode.json`/`opencode.jsonc`**, each with a unique name; tools become available to the LLM automatically. Two transport types: [MCP servers](https://opencode.ai/docs/mcp-servers/)
    - **`type: "local"`** (stdio): `command` (array, required, e.g. `["npx","-y","my-mcp"]` or `["bun","x",...]`), optional `environment` (env var map), `enabled`, `timeout` (ms, default 5000).
    - **`type: "remote"`** (http): `url` (required), optional `headers`, `enabled`, `oauth` (object or `false`), `timeout`. opencode auto-handles OAuth (RFC 7591 dynamic client registration); `opencode mcp auth <name>` / `logout` / `debug` manage credentials (stored in `~/.local/share/opencode/mcp-auth.json`).

    ```jsonc
    {
      "$schema": "https://opencode.ai/config.json",
      "mcp": {
        "cartographer-local": {
          "type": "local",
          "command": ["node", "--experimental-strip-types", "skills/plan/scripts/mcp.ts"],
          "environment": { "CARTOGRAPHER_ROOT": "{env:PWD}" },
          "enabled": true
        },
        "some-remote": {
          "type": "remote",
          "url": "https://example.com/mcp",
          "headers": { "Authorization": "Bearer {env:MY_API_KEY}" }
        }
      }
    }
    ```

21. **MCP tool gating**: MCP tools are namespaced by server name (e.g. `cartographer-local_*`). Disable globally with `tools: { "cartographer-local_*": false }`, then re-enable per agent — the documented pattern for "only expose these tools to this agent." Note the org-level **remote default** mechanism: orgs can ship MCP servers (disabled) via `.well-known/opencode`; users opt in with `enabled: true`. [MCP servers](https://opencode.ai/docs/mcp-servers/)

    **Recommendation for Cartographer**: prefer **local custom tools** (Finding 1) over an MCP server for the ~20 deterministic CLI wrappers — simpler, no separate process, and the docs warn MCP tools "add to the context" and can blow the context budget. Use MCP only if you need cross-editor reuse (Cursor/Claude/Codex all speak MCP) or a long-lived server.

### 6. Plugins — packaging / distribution / install

22. **Plugins are JS/TS modules** exporting plugin function(s) `async (ctx) => ({ ...hooks })`, where `ctx = { project, directory, worktree, client (opencode SDK), $ (Bun shell) }`. They hook lifecycle events (`tool.execute.before/after`, `session.*`, `file.edited`, `permission.*`, `experimental.session.compacting`, etc.) **and can register custom tools** via the returned `tool:` map. Import types via `import type { Plugin } from "@opencode-ai/plugin"`. [Plugins](https://opencode.ai/docs/plugins/)

23. **Install/distribution paths**:
    - **Local files**: drop `.ts`/`.js` in `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (global) — auto-loaded at startup.
    - **npm**: list packages in the `plugin` array in `opencode.json` (`"plugin": ["opencode-wakatime", "@my-org/custom-plugin"]`); installed via Bun at startup, cached in `~/.cache/opencode/node_modules/`. Scoped packages supported.
    - **Dependencies for local plugins/tools**: add a `package.json` in the config dir; opencode runs `bun install` at startup.
    [Plugins](https://opencode.ai/docs/plugins/) · [Config › Plugins](https://opencode.ai/docs/config/)

    → **For Cartographer distribution**: ship as an npm package `@your-org/opencode-cartographer` that exports a plugin registering all ~20 tools (via the `tool:` map) and optionally bundling agents/skills/commands; users add one line to `opencode.json`'s `plugin` array. This is the cleanest single-install story.

### 7. Config file schema & precedence (the umbrella for all of the above)

24. **Config file**: `opencode.json` or `opencode.jsonc` (JSONC = comments allowed), `$schema: "https://opencode.ai/config.json"`. Relevant top-level keys for Cartographer: `mcp`, `plugin`, `agent`, `command`, `instructions`, `tools`, `permission`, `model`/`small_model`/`provider`, `default_agent`, `experimental`. Variable substitution: `{env:VAR}` and `{file:path}`. [Config](https://opencode.ai/docs/config/)

25. **Config precedence (later overrides earlier; configs are *merged*, not replaced)**: (1) remote `.well-known/opencode`; (2) global `~/.config/opencode/opencode.json`; (3) `OPENCODE_CONFIG` env path; (4) project `opencode.json`; (5) `.opencode/` directories (agents, commands, plugins, tools, skills); (6) `OPENCODE_CONFIG_CONTENT` inline; (7) managed files (`/etc/opencode/` on Linux, `/Library/Application Support/opencode/` on macOS, `%ProgramData%\opencode` on Windows); (8) macOS MDM managed prefs (highest). `OPENCODE_CONFIG_DIR` can relocate the `.opencode`-style dir. [Config](https://opencode.ai/docs/config/)

---

## Cartographer → opencode mapping (quick reference)

| Cartographer surface | opencode equivalent | Location | Notes |
|---|---|---|---|
| `pi.registerTool(...)` (~20 CLI wrappers) | Custom tools via `tool()` | `.opencode/tools/<name>.ts` or plugin `tool:` map | `execute(args, context)`; shell out via `Bun.$`. No `signal`/`toolCallId`. |
| SKILL.md workflow prompts | Agent Skills | `.opencode/skills/<name>/SKILL.md` | On-demand via `skill` tool. Frontmatter limited to name/description/license/compatibility/metadata. |
| (workflow entry points) | Custom commands | `.opencode/commands/<name>.md` | `$ARGUMENTS`, `subtask: true` for subagent isolation. |
| Subagents (auditor etc.) | Subagents | `.opencode/agents/<name>.md` | `mode: subagent` + `permission`/`tools` allowlist; delegated via Task tool or `@mention`. |
| Top-level AGENTS.md | AGENTS.md (native) | repo root / `~/.config/opencode/AGENTS.md` | Works as-is; `instructions[]` for extra files. |
| (distribution) | npm plugin | `plugin: [...]` in `opencode.json` | Bundle tools/agents/skills; one-line install. |

---

## Sources

- **Kept: Custom Tools | opencode** (https://opencode.ai/docs/custom-tools/) — authoritative API/signature, location, Zod args, shell-out example.
- **Kept: Agents | opencode** (https://opencode.ai/docs/agents/) — subagent definition, frontmatter, full permission key list, delegation/Task tool.
- **Kept: Agent Skills | opencode** (https://opencode.ai/docs/skills/) — SKILL.md format, locations, frontmatter schema, `skill` tool, permissions.
- **Kept: Commands | opencode** (https://opencode.ai/docs/commands/) — custom slash-commands format, placeholders, subtask.
- **Kept: Rules | opencode** (https://opencode.ai/docs/rules/) — AGENTS.md support, precedence, CLAUDE.md fallback, `instructions`.
- **Kept: MCP servers | opencode** (https://opencode.ai/docs/mcp-servers/) — local/remote schema, all options, OAuth, per-agent gating.
- **Kept: Plugins | opencode** (https://opencode.ai/docs/plugins/) — plugin module shape, hooks/events, `tool:` registration, local vs npm install, deps.
- **Kept: Config | opencode** (https://opencode.ai/docs/config/) — full schema keys, precedence order, variable substitution, managed config.
- Dropped: open-code.ai / anomalyco-opencode.mintlify.app / opencode.ubitools.com mirrors — third-party doc mirrors; content matched official docs but not authoritative.
- Dropped: opencodebook.xyz, opencode-ai-opencode.mintlify.app "mcpServers" schema — the `mcpServers`/`.opencode.json` shape shown there is **stale/incorrect**; current schema is `mcp` in `opencode.json` (verified against official docs).
- Dropped: huggingface MCP-clients page — mixed Codex/opencode example, not authoritative for opencode.

## Gaps

- **Exact tool `execute` abort/cancellation**: official Custom Tools docs show `execute(args, context)` with no `signal` param. Pi's `signal`-based cancellation has no documented equivalent; confirm against `@opencode-ai/plugin` TypeScript types (inspect the installed package's `.d.ts`) before relying on it. Suggested next step: read the type defs in `node_modules/@opencode-ai/plugin`.
- **Whether a plugin can register agents/skills programmatically** (vs only tools + hooks): docs show plugins register `tool:` and hooks; agents/skills/commands are file/config-based. If you want a single npm install to also provide agents/skills, verify whether the plugin can write/register those, or whether you must instruct users to also copy `.opencode/agents` + `.opencode/skills` (or use `OPENCODE_CONFIG_DIR`). Likely you ship those as files in the package and document a copy/symlink step — confirm in the ecosystem examples.
- **Directory naming drift**: current docs use `agents/`, `commands/`, `tools/`, `plugins/`, `skills/` (plural where applicable). Older opencode versions used singular `agent/`/`command/`. Pin to the opencode version you target and verify the dir names against that release.
- **opencode version**: docs are undated; verify against the installed `opencode --version` and the live opencode.ai/docs at integration time, since this project area changes fast.

## Supervisor coordination

No blockers encountered; research complete. No supervisor decision required.
