# Research: Claude Code Extensibility Model (porting Pi Cartographer)

> Sourced from official Claude Code docs at `code.claude.com/docs` (full-page
> fetches, current as of 2026 — pages reference Claude Code up to v2.1.16x).
> Disclosure: Pi Coding Agent: Claude Opus 4.8 (US).

## Summary

Claude Code has four first-class extension surfaces that map almost 1:1 onto Pi
Cartographer's: **MCP servers** (custom tools), **Agent Skills** (`SKILL.md`),
**subagents** (markdown + frontmatter), and **CLAUDE.md memory** (with AGENTS.md
support via import). The ideal distribution vehicle is a **plugin** — a single
directory that bundles MCP servers + skills + subagents + slash commands + hooks,
shipped through a `marketplace.json` catalog. For ~20 deterministic Python/TS
CLI tools, expose them as **one stdio MCP server** bundled in a plugin, and ship
your existing `SKILL.md` files (the format is nearly identical — Claude Code
follows the open [Agent Skills](https://agentskills.io) standard) plus your agents
in the same plugin.

---

## 1. CUSTOM TOOLS → MCP servers

Claude Code adds custom tools exclusively through the **Model Context Protocol
(MCP)**. There is no other plugin-tool API; deterministic local scripts are
exposed by wrapping them in an MCP server (stdio is the natural fit for local
Python/TS). [Source: MCP docs](https://code.claude.com/docs/en/mcp)

### Transports
- **stdio** — local child process over stdin/stdout. Best for local tools/custom scripts. (Recommended for Pi Cartographer's CLI scripts.)
- **http** (streamable HTTP) — recommended for remote servers. `type` accepts `"http"` or alias `"streamable-http"`.
- **sse** — *deprecated*, use http instead.
- **ws** (WebSocket) — for servers that push events; header-only auth, not addable via `--transport` flag.

### Config schema (`.mcp.json` at project root)
```json
{
  "mcpServers": {
    "cartographer": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "cartographer.mcp_server"],
      "env": { "CARTOGRAPHER_ROOT": "${CLAUDE_PROJECT_DIR:-.}" },
      "timeout": 600000,
      "alwaysLoad": false
    }
  }
}
```
HTTP example:
```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": { "Authorization": "Bearer ${API_KEY}" }
    }
  }
}
```

### Scopes (precedence high → low)
| Scope | Loads in | Shared | Stored in |
| --- | --- | --- | --- |
| **local** (default) | current project, private | No | `~/.claude.json` (per-project entry) |
| **project** | current project | Yes (VCS) | `.mcp.json` in project root |
| **user** | all your projects | No | `~/.claude.json` |

Full precedence chain: local → project → user → **plugin-provided** → claude.ai
connectors. Scopes match by name; plugins/connectors match by endpoint. The
whole entry from the winning source is used (fields are **not** merged).

### CLI to register
```bash
claude mcp add --transport stdio cartographer --scope project -- python -m cartographer.mcp_server
claude mcp add-json cartographer '{"type":"stdio","command":"python","args":["-m","cartographer.mcp_server"]}'
claude mcp list / get <name> / remove <name>
```
Note: `--` separates Claude's flags from the server command; `--env KEY=val` for env.

### Key behaviors relevant to porting
- **`${CLAUDE_PROJECT_DIR}`** is set in the spawned server's env (project root). In project/user `.mcp.json` use a default (`${CLAUDE_PROJECT_DIR:-.}`); **plugin-provided** MCP configs substitute it directly without a default.
- Project-scoped `.mcp.json` servers require **user approval** on first use (`claude mcp reset-project-choices` to reset).
- **Env var expansion** (`${VAR}`, `${VAR:-default}`) works in `command`, `args`, `env`, `url`, `headers`.
- **Tool Search** is on by default: MCP tool defs are deferred and discovered on demand, so ~20 tools cost almost no context. Set `alwaysLoad: true` per-server (v2.1.121+) to force tools into context every turn. Write a good server `instructions` field (≤2KB) so Claude knows when to search your tools.
- **Output limits**: warning at 10k tokens, default cap 25k (`MAX_MCP_OUTPUT_TOKENS`); per-tool override via `_meta["anthropic/maxResultSizeChars"]` (≤500k).
- Per-server tool-execution `timeout` (ms) field; min 1000.
- MCP **prompts** become slash commands `/mcp__server__prompt`; MCP **resources** are `@server:proto://path` mentions.

**Mapping verdict:** Wrap all ~20 deterministic CLI scripts behind **one stdio
MCP server** (a thin dispatcher importing your existing Python/TS). Ship it in a
plugin's `.mcp.json` using `${CLAUDE_PLUGIN_ROOT}` for the binary path.

---

## 2. SKILLS → Agent Skills (`SKILL.md`)

Claude Code follows the open **[Agent Skills](https://agentskills.io) standard**,
so a generic `SKILL.md` is largely portable. Claude Code *extends* it with
invocation control, subagent execution, and dynamic context injection.
[Source: Skills docs](https://code.claude.com/docs/en/skills)

> **Important for Pi:** "Custom commands have been merged into skills." A file at
> `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create
> `/deploy`. Existing pi-format `SKILL.md` files should map directly; the main
> differences are Claude-specific frontmatter fields (below) and the directory
> layout (one folder per skill, `SKILL.md` as entrypoint).

### Locations (override order: enterprise > personal > project; plugin skills are namespaced and never conflict)
| Location | Path | Applies to |
| --- | --- | --- |
| Enterprise | managed settings dir | org-wide |
| Personal | `~/.claude/skills/<name>/SKILL.md` | all your projects |
| Project | `.claude/skills/<name>/SKILL.md` | this project |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | where plugin enabled (namespaced `plugin:skill`) |

Project skills load from `.claude/skills/` in the cwd **and every parent up to
repo root**, plus nested dirs on demand (monorepo support). `--add-dir`
directories' `.claude/skills/` are also loaded (an exception to the usual rule).
Live change detection picks up edits to `SKILL.md` mid-session.

### Frontmatter reference (all optional; only `description` recommended)
```yaml
---
name: my-skill                 # display name; defaults to dir name (NOT the command name except at plugin root)
description: What it does and WHEN to use it   # drives auto-invocation; combined+when_to_use capped 1536 chars
when_to_use: trigger phrases / example requests
argument-hint: "[issue-number]"
arguments: [issue, branch]     # named positional args → $issue, $branch
disable-model-invocation: true # only user can invoke (manual /name); also blocks subagent preload
user-invocable: false          # only Claude can invoke; hidden from / menu
allowed-tools: Read Grep        # pre-approve tools while active (does NOT restrict pool)
disallowed-tools: AskUserQuestion  # remove from pool while active
model: inherit                 # or sonnet/opus/haiku/fable/full-id
effort: high                   # low|medium|high|xhigh|max
context: fork                  # run in a forked subagent
agent: Explore                 # which subagent type when context: fork
hooks: { ... }                 # skill-scoped lifecycle hooks
paths: ["src/api/**/*.ts"]     # glob-gate auto-activation
shell: bash                    # or powershell
---
```

### Invocation / auto-loading
- **Manual:** `/skill-name [args]`.
- **Auto:** Claude loads a skill when your request matches its `description`. By default both user and Claude can invoke.
- Descriptions are always in context (budget ~1% of context window, configurable via `skillListingBudgetFraction`); **full body loads only when invoked** and then stays in context for the session.
- Directory name → command name (except plugin-root `SKILL.md`, which uses frontmatter `name`).

### Claude-specific power features (beyond generic SKILL.md)
- **Dynamic context injection:** `` !`git diff HEAD` `` runs the shell command *before* Claude sees the content and inlines the output (preprocessing). Multi-line via ```` ```! ```` fenced blocks. Disable globally with `disableSkillShellExecution`.
- **String substitutions:** `$ARGUMENTS`, `$ARGUMENTS[N]`/`$N`, named `$name`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}` (use this to reference bundled scripts portably).
- **`context: fork`** runs the skill as a subagent (skill body = the task prompt).
- **Supporting files:** keep `SKILL.md` < 500 lines; reference `reference.md`, `scripts/*.py` etc. that load only when needed.
- A skill folder with a `.claude-plugin/plugin.json` auto-loads as a `<name>@skills-dir` plugin (can then bundle agents/hooks/MCP).

**Mapping verdict:** Your pi `SKILL.md` files port directly. Audit frontmatter:
generic fields (`name`, `description`) are identical; pi-specific fields not in
the table above are ignored. Adopt `${CLAUDE_SKILL_DIR}` for script paths and the
`!`cmd`` injection where pi uses its own preprocessing. Place each as
`<plugin>/skills/<name>/SKILL.md`.

---

## 3. SUBAGENTS → `.claude/agents/`

Subagents are markdown files with YAML frontmatter; the **body becomes the system
prompt**. They run in an isolated context window and return only their final
output. [Source: Subagents docs](https://code.claude.com/docs/en/sub-agents)

### Locations (priority high → low)
| Priority | Location | Scope |
| --- | --- | --- |
| 1 | managed settings `.claude/agents/` | org-wide |
| 2 | `--agents` CLI flag (JSON) | session |
| 3 | `.claude/agents/` | project |
| 4 | `~/.claude/agents/` | user |
| 5 | plugin `agents/` dir | where plugin enabled (namespaced `plugin:agent`, subfolders → `plugin:sub:agent`) |

Scanned recursively; identity comes from frontmatter `name` (filename need not
match). Built-ins: **Explore** (Haiku, read-only), **Plan** (read-only, plan
mode), **general-purpose** (all tools).

### Frontmatter (only `name` + `description` required)
```yaml
---
name: code-reviewer            # lowercase + hyphens, unique
description: When to delegate here (use "proactively" to encourage delegation)
tools: Read, Grep, Glob, Bash  # allowlist; inherits all if omitted
disallowedTools: Write, Edit   # denylist (applied before tools)
model: inherit                 # sonnet|opus|haiku|fable|full-id|inherit
permissionMode: default        # default|acceptEdits|auto|dontAsk|bypassPermissions|plan
maxTurns: 20
skills: [api-conventions]      # preload full skill content at startup
mcpServers: [github, {playwright: {type: stdio, command: npx, args: [...]}}]
hooks: { PreToolUse: [...] }   # lifecycle hooks (Stop → SubagentStop)
memory: project                # user|project|local → persistent agent memory dir
isolation: worktree            # run in temp git worktree
background: true
effort: high
color: blue
initialPrompt: "..."           # only when run as main session via --agent
---
You are a senior code reviewer. When invoked, ...
```

### Delegation & restriction
- **Automatic** based on task + `description` + context.
- **Explicit:** name it in prompt, `@"name (agent)"`, or run whole session as it via `claude --agent <name>` / `agent` setting.
- **Tool restriction:** `tools` (allowlist) and/or `disallowedTools` (denylist). Always-unavailable to subagents: `Agent`, `AskUserQuestion`, `EnterPlanMode`, etc. Subagents **cannot spawn other subagents**.
- **Disable:** `permissions.deny: ["Agent(name)"]`.
- Loaded at session start — restart (or `/agents` UI / `/reload-plugins` for plugins) to pick up new files.

> **Plugin caveat:** plugin subagents **ignore** `hooks`, `mcpServers`, and
> `permissionMode` frontmatter (security). Copy into `.claude/agents/` if you
> need those.

**Mapping verdict:** Generic agent-markdown maps cleanly. Rename frontmatter to
Claude's field names (`tools`/`disallowedTools`/`model`/`permissionMode`). Body =
system prompt. Pi's deterministic worker agents → `.claude/agents/*.md` or plugin
`agents/`. Use `skills:` to preload Cartographer conventions and `mcpServers:` to
scope the Cartographer MCP server to specific agents only.

---

## 4. PROJECT MEMORY → CLAUDE.md (+ AGENTS.md support)

[Source: Memory docs](https://code.claude.com/docs/en/memory)

### Locations (load order: broad → specific; all concatenated, not overridden)
| Scope | Location |
| --- | --- |
| Managed policy | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`; Linux/WSL `/etc/claude-code/CLAUDE.md`; Windows `C:\Program Files\ClaudeCode\CLAUDE.md` |
| User | `~/.claude/CLAUDE.md` |
| Project | `./CLAUDE.md` **or** `./.claude/CLAUDE.md` |
| Local (gitignored) | `./CLAUDE.local.md` |

**Precedence model:** files are **concatenated**, ordered filesystem-root → cwd,
so instructions closer to cwd are read **last** (effective priority). Walks up the
tree; subdirectory CLAUDE.md files load **on demand** when Claude reads files
there. Project-root CLAUDE.md survives `/compact` (re-injected); nested ones do
not until re-read. Target < 200 lines per file.

### Imports
`@path/to/file` syntax expands files into context at launch (relative to the
importing file; absolute and `~/` allowed; max depth 4). First external import
prompts for approval.

### AGENTS.md support
**Claude Code reads `CLAUDE.md`, not `AGENTS.md`.** Bridge it:
```markdown
@AGENTS.md

## Claude Code
Use plan mode for changes under `src/billing/`.
```
Or symlink (`ln -s AGENTS.md CLAUDE.md`) if no Claude-specific content. `/init`
reads an existing `AGENTS.md` (and `.cursorrules`, `.windsurfrules`, etc.) when
generating CLAUDE.md.

### Related
- **`.claude/rules/*.md`** — modular rules, optionally path-scoped via `paths:` frontmatter glob (same format as skill `paths`). User-level `~/.claude/rules/`.
- **Auto memory** (v2.1.59+, on by default) — Claude writes its own notes to `~/.claude/projects/<project>/memory/MEMORY.md` (first 200 lines / 25KB loaded each session). Toggle via `/memory` or `autoMemoryEnabled`.
- `claudeMdExcludes` to skip ancestor files in monorepos; managed `claudeMd` key for org-wide content.

**Mapping verdict:** If Pi Cartographer already emits `AGENTS.md`, add a thin
`CLAUDE.md` that does `@AGENTS.md` plus any Claude-specific notes. Long procedural
content belongs in **skills**, path-specific rules in `.claude/rules/`, not
CLAUDE.md.

---

## 5. PLUGINS + MARKETPLACES → the distribution vehicle

A **plugin** is one directory bundling skills + agents + hooks + MCP servers +
slash commands (+ LSP servers, monitors, settings). This is the ideal way to ship
Pi Cartographer as a unit. [Source: Plugins docs](https://code.claude.com/docs/en/plugins),
[Marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces)

### Plugin directory layout
```
cartographer-plugin/
├── .claude-plugin/
│   └── plugin.json        # manifest — ONLY this goes inside .claude-plugin/
├── skills/<name>/SKILL.md  # namespaced /cartographer-plugin:<name>
├── agents/*.md
├── commands/*.md           # flat-file skills (legacy; prefer skills/)
├── hooks/hooks.json
├── .mcp.json               # bundled MCP servers
├── .lsp.json               # optional LSP servers
├── monitors/monitors.json  # optional background monitors
├── bin/                    # executables added to Bash PATH while enabled
└── settings.json           # default settings (only `agent`, `subagentStatusLine`)
```
> **Common mistake:** only `plugin.json` lives in `.claude-plugin/`; all other
> dirs (`skills/`, `agents/`, `hooks/`, `.mcp.json`) sit at the **plugin root**.

### `plugin.json` manifest
```json
{
  "name": "cartographer",
  "description": "Pi Cartographer: planning + cross-agent workflow",
  "version": "1.0.0",
  "author": { "name": "..." },
  "homepage": "...", "repository": "...", "license": "MIT",
  "mcpServers": {
    "cartographer": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/cartographer",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"]
    }
  }
}
```
- `name` = unique id + **skill namespace** (`/cartographer:<skill>`).
- `version` — if set, users only update when bumped; **bump every release** or omit to use the git commit SHA (every commit = new version).
- MCP servers can be inline in `plugin.json` or in a root `.mcp.json`. Use `${CLAUDE_PLUGIN_ROOT}` (bundled files), `${CLAUDE_PLUGIN_DATA}` (persistent state across updates), `${CLAUDE_PROJECT_DIR}`.

### Hooks (`hooks/hooks.json`) — same schema as settings.json
```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Write|Edit",
        "hooks": [{ "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/scripts/validate.sh" }] }
    ]
  }
}
```
Hook input arrives as JSON on stdin; exit code 2 blocks the action. Events include
`PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `InstructionsLoaded`,
`Stop`, `Elicitation`, etc. Hooks let you enforce Cartographer state-discipline
deterministically (e.g. block manual edits to `.plan/` JSONL).

### Slash commands
Slash commands ARE skills now: a `commands/foo.md` flat file or
`skills/foo/SKILL.md` both produce `/cartographer:foo`. Use `disable-model-invocation: true`
for user-only workflow commands (e.g. `/cartographer:plan`, `/cartographer:validate`).

### Marketplace (`.claude-plugin/marketplace.json`)
```json
{
  "name": "pi-tools",
  "owner": { "name": "Pi Team", "email": "..." },
  "plugins": [
    { "name": "cartographer",
      "source": "./plugins/cartographer",
      "description": "Pi Cartographer planning workflow",
      "version": "1.0.0" }
  ]
}
```
Plugin `source` types: relative path (`./...`, must start with `./`), `github`
({repo, ref?, sha?}), `url` (git URL), `git-subdir` ({url, path} — sparse clone
for monorepos), `npm` ({package, version?, registry?}). `strict: false` lets the
marketplace entry fully define components without a `plugin.json`.

### Install / dev / distribution
```bash
# Local dev — no install
claude --plugin-dir ./cartographer-plugin   # also accepts .zip
/reload-plugins                              # hot-reload during session

# Scaffold a skills-dir plugin (auto-loads, no marketplace)
claude plugin init my-tool                    # → ~/.claude/skills/my-tool/

# Distribute
/plugin marketplace add your-org/pi-tools
/plugin install cartographer@pi-tools
claude plugin validate .                      # validate before publishing
```
Team auto-provisioning via `.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "pi-tools": { "source": { "source": "github", "repo": "your-org/pi-tools" } }
  },
  "enabledPlugins": { "cartographer@pi-tools": true }
}
```
Managed lockdown via `strictKnownMarketplaces` in managed settings;
`CLAUDE_CODE_PLUGIN_SEED_DIR` to pre-bake plugins into containers/CI.

**Mapping verdict — recommended packaging for Pi Cartographer:** one plugin
containing (a) `.mcp.json` with the stdio Cartographer MCP server wrapping the ~20
CLI scripts, (b) `skills/` from your ported pi `SKILL.md` files, (c) `agents/`
worker definitions, (d) `commands/` or user-only skills for the deterministic
workflow gates (`/proposal`, `/plan`, `/validation`, `/handoff`, `/transition`),
and (e) `hooks/hooks.json` to enforce state discipline. Distribute via a private
GitHub marketplace; pin `version` and bump per release.

---

## Surface mapping cheat-sheet (Pi → Claude Code)

| Pi Cartographer surface | Claude Code equivalent | Ship in plugin as |
| --- | --- | --- |
| ~20 deterministic CLI tools | stdio MCP server | `.mcp.json` / `plugin.json mcpServers` |
| `SKILL.md` (pi format) | Agent Skills (`SKILL.md`) | `skills/<name>/SKILL.md` |
| Agents | Subagents (md+frontmatter) | `agents/*.md` |
| Project memory / AGENTS.md | `CLAUDE.md` (imports `@AGENTS.md`) | n/a (repo-level) |
| Workflow gate commands | Slash commands = user-only skills | `commands/` or `skills/` w/ `disable-model-invocation` |
| State-discipline enforcement | Hooks | `hooks/hooks.json` |
| Whole-product distribution | Plugin + marketplace | `marketplace.json` |

---

## Sources
- **Kept: Connect Claude Code to tools via MCP** (https://code.claude.com/docs/en/mcp) — authoritative MCP transport, `.mcp.json` schema, scopes, precedence, plugin MCP, tool search.
- **Kept: Extend Claude with skills** (https://code.claude.com/docs/en/skills) — full frontmatter table, locations, invocation, substitutions, Agent Skills standard note, command merge.
- **Kept: Create custom subagents** (https://code.claude.com/docs/en/sub-agents) — frontmatter fields, scopes/priority, delegation, tool restriction, plugin caveats.
- **Kept: How Claude remembers your project** (https://code.claude.com/docs/en/memory) — CLAUDE.md locations, concatenation precedence, imports, explicit AGENTS.md guidance, rules, auto memory.
- **Kept: Create plugins** (https://code.claude.com/docs/en/plugins) — plugin.json, directory layout, components, dev/test flags, conversion.
- **Kept: Create and distribute a plugin marketplace** (https://code.claude.com/docs/en/plugin-marketplaces) — marketplace.json schema, plugin sources, hooks/MCP examples, install/distribution, managed restrictions.
- Dropped: Lintel JSON-schema catalog, builder.io blog, reopt/thepromptshelf/ccaf third-party guides — superseded by primary docs (used only to confirm field names).

## Gaps
- **Hooks reference (`/en/hooks`) not deep-fetched** — full hook event catalog, exact `hooks.json` matcher semantics, and `InstructionsLoaded`/`Elicitation` payloads. Brief covers the subset shown in MCP/subagent/plugin docs. Next step: fetch `code.claude.com/docs/en/hooks.md` if Cartographer needs precise hook enforcement schemas.
- **Plugins reference (`/en/plugins-reference`)** — exhaustive plugin manifest schema, `${CLAUDE_PLUGIN_DATA}` persistence, skills-dir plugin rules, path-behavior rules. Fetch if you need the complete manifest field list.
- **MCP server SDK specifics** — how to author the stdio server itself (tool registration, schemas) is MCP-spec territory (modelcontextprotocol.io), not Claude Code docs. Anthropic's `mcp-server-dev` plugin can scaffold one.
