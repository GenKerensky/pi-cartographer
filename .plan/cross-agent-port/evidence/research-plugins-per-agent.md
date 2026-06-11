# Plugin Packaging Per Agent — Can Cartographer Ship as a Single Plugin?

> Deep-dive companion to `research-cross-agent-plan.md`. Answers the specific
> question: **can Pi Cartographer be packaged as one plugin per target agent, and
> how much custom work / lost functionality results per platform?** Sourced from
> official plugin docs fetched 2026-06-11:
> Claude Code (`code.claude.com/docs/en/plugins`), Codex
> (`developers.openai.com/codex/plugins` + `/plugins/build`), opencode
> (`opencode.ai/docs/plugins/`), Cursor (`cursor.com/docs/plugins`).
>
> AI disclosure: Pi Coding Agent: Claude Opus 4.8 (US) (AWS Bedrock US)

## TL;DR verdict

| Agent | Single-plugin? | Bundles MCP | Skills | Subagents | Sub-agent tool restriction | Commands | Hooks | Custom work | Lost functionality |
|---|---|---|---|---|---|---|---|---|---|
| **Claude Code** | ✅ **Yes, fully** | ✓ `.mcp.json` | ✓ `skills/` | ✓ `agents/` | ✓ **declarative** | ✓ `commands/` | ✓ `hooks/` | **Low** | **None** |
| **Cursor** | ✅ Yes (declarative) | ✓ `mcp.json` | ✓ `skills/` | ✓ `agents/` | ✗ only `readonly` | ✓ `commands/` | ✓ `hooks.json` | **Low–Med** | Per-agent tool isolation; bin/PATH; tool-cap risk |
| **Codex** | ⚠️ Mostly (one gap) | ✓ `.mcp.json` | ✓ `skills/` | ✗ **not in bundle** | ⚠ via per-agent MCP+sandbox | ⚠ folds into skills | ✓ `hooks/` | **Medium** | Bundled subagents; public publishing "coming soon" |
| **opencode** | ❌ No — split delivery | (tools native, no MCP needed) | ✗ separate files | ✗ separate files | ✓ declarative (when present) | ✗ separate files | ✓ in module | **Highest** | Single-artifact install (plugin is code-only) |

**Bottom line:** Claude Code is the reference target — Cartographer ships as one
plugin with zero lost functionality. **Cursor and Codex are declarative
plugin-directory systems that deliberately mirror Claude Code's `.claude-plugin`
layout** (Codex even reads `.claude-plugin/marketplace.json` and sets
`CLAUDE_PLUGIN_ROOT`), so ~80–90% of the Claude plugin is reusable with thin
adaptation. **opencode is the outlier**: its "plugin" is a JS/TS code module (tools +
event hooks), not a directory bundle, so skills/subagents/commands must be delivered
as separate files — opencode needs the most packaging work even though its runtime
capabilities are strong.

## Cartographer's components → plugin slots

The thing being packaged: ~20 `cartographer_*` tools (today shelled out via
`extensions/cartographer-tools.ts`), 5 skills (`proposal`, `plan`, `implement`,
`index-project`, `dashboard`), 6 subagents (`.pi/agents/cartographer-*.md`,
several read-only with tight tool allowlists), workflow slash commands, state-
discipline enforcement, `AGENTS.md` memory, and the `cartographer-dashboard` CLI.

---

## 1. Claude Code — full single-plugin (reference target)

**Manifest:** `.claude-plugin/plugin.json` (only `name` required; `version`,
`description`, `author`, `homepage`, `repository`, `license` optional). Components
live at the **plugin root**, not inside `.claude-plugin/`.

**Directory slots (all of Cartographer fits):**

| Slot | Purpose | Cartographer use |
|---|---|---|
| `.mcp.json` | MCP servers | the stdio Cartographer MCP server (~20 tools) |
| `skills/<name>/SKILL.md` | Agent Skills | the 5 skills, namespaced `/cartographer:<skill>` |
| `agents/*.md` | Subagents **with `tools:`/`disallowedTools:`** | auditor/compass/drafter/archivist/redactor — **tool restriction preserved** |
| `commands/*.md` | Slash commands (≈ user-only skills) | `/cartographer:proposal`, `:plan`, `:validate`, `:handoff` |
| `hooks/hooks.json` | Lifecycle hooks | enforce "never hand-edit JSONL / route through wrappers" (PreToolUse exit 2 = block) |
| `bin/` | Executables added to Bash `PATH` while enabled | `cartographer-dashboard` CLI |
| `.lsp.json`, `monitors/`, `settings.json` | LSP / background monitors / default settings | optional (e.g. monitor `.plan/` health) |

- Use `${CLAUDE_PLUGIN_ROOT}` for bundled binary/script paths; `${CLAUDE_PLUGIN_DATA}`
  for persistent state across updates.
- **Caveat:** plugin-provided subagents **ignore** `hooks`, `mcpServers`, and
  `permissionMode` frontmatter (security) — but `tools:`/`disallowedTools:` (the
  restriction Cartographer needs) **do** apply. So read-only specialists port faithfully.
- **Distribution:** `.claude-plugin/marketplace.json` catalog → `/plugin install
  cartographer@<marketplace>`; dev via `--plugin-dir ./cartographer` (also `.zip` /
  `--plugin-url`), hot-reload with `/reload-plugins`. Public via `claude-community`
  (reviewed) or private GitHub marketplace; `claude plugin validate` before submit.

**Custom work: low. Lost functionality: none.** This is the canonical bundle; build
it first and treat it as the source of truth.

## 2. Cursor — full declarative bundle, one capability degrades

**Manifest:** `.cursor-plugin/plugin.json` (only `name` required). Components
auto-discovered from default dirs at plugin root (or custom paths in manifest).
Official component list: **Rules, Skills, Agents, Commands, MCP Servers, Hooks.**

**Directory slots:**

| Slot | Cartographer use | Notes |
|---|---|---|
| `mcp.json` | MCP server | ⚠ ~40–80 active-tool cap; per-call approval (allowlist in `permissions.json`) |
| `skills/<name>/SKILL.md` | the 5 skills | format compatible (also reads `.claude/skills`) |
| `agents/*.md` | the 6 subagents | ✗ **no `tools:` field — inherit ALL MCP tools**; only `readonly: true` |
| `commands/*.md` | workflow slash commands | plain markdown |
| `rules/*.mdc` | state-discipline guardrails | Always/Auto-Attached `.mdc` |
| `hooks.json` | enforcement | `beforeMCPExecution` to **emulate** per-agent tool isolation |

- **Lost vs Claude:** (1) declarative per-subagent tool restriction → emulate with
  `readonly: true` + a `beforeMCPExecution` hook that blocks mutating `cartographer_*`
  calls for read-only roles; (2) no `bin/`-to-PATH → dashboard launched manually or
  from a skill script; (3) tool-cap risk → keep to one lean MCP server.
- **Distribution:** plugins are Git repos; public via Cursor Marketplace (manual
  security review); org via team marketplace (can mark **Required**, SCIM groups).
  Local dev: `~/.cursor/plugins/local/<name>` (symlink + reload).

**Custom work: low–medium** (mainly the hook to recover tool isolation).
**Lost functionality: declarative subagent tool restriction; auto-PATH dashboard.**

## 3. Codex — mostly one plugin, subagents fall outside the bundle

**Manifest:** `.codex-plugin/plugin.json` (`name` + `version` typical; `skills`,
`mcpServers`, `apps`, `hooks` point to components; rich `interface` block for
listing metadata). Only `plugin.json` lives in `.codex-plugin/`; components at root.

**Directory slots:**

| Slot | Cartographer use | Notes |
|---|---|---|
| `.mcp.json` (`mcpServers`) | MCP server (~20 tools) | plugin-scoped policy via `[plugins."cartographer".mcp_servers.*]` (`enabled_tools`, approval modes) |
| `skills/<name>/SKILL.md` (`skills`) | the 5 skills | invoked implicitly or `@skill` / `$skill` |
| `hooks/hooks.json` (`hooks`) | enforcement | gets `PLUGIN_ROOT`/`PLUGIN_DATA` (+ `CLAUDE_PLUGIN_ROOT` for compat); trust-gated |
| `.app.json` (`apps`) | app/connector mappings | not needed by Cartographer |
| `assets/` | icons/screenshots | listing polish |

- **The gap — subagents are NOT a plugin component.** Codex plugin structure has
  **no `agents/` slot**; custom subagents live at `~/.codex/agents/*.toml` /
  `.codex/agents/*.toml` and are installed/managed **separately** from the plugin.
  So a "single plugin" delivers tools + skills + hooks, but Cartographer's specialist
  agents must ship as a separate `.codex/agents/` drop (or be created by a skill).
  Tool restriction there = per-agent scoped MCP + `sandbox_mode = "read-only"`.
- **Slash commands fold into skills** (Codex deprecated `~/.codex/prompts/` in favor
  of skills) — no `commands/` slot; expose workflow entry points as skills (`$name`).
- **Sandbox/approval:** tools writing `.plan/`/`.cartographer/` need
  `sandbox_mode = "workspace-write"` — a user config step, not a plugin field.
- **High Claude convergence:** Codex reads a **legacy-compatible
  `.claude-plugin/marketplace.json`**, resolves Git/`git-subdir`/local sources, and
  sets `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` for hook compat. A Claude marketplace
  can double as a Codex marketplace.
- **Distribution:** repo marketplace `$REPO_ROOT/.agents/plugins/marketplace.json`
  (or `~/.agents/plugins/marketplace.json`); `codex plugin marketplace add owner/repo`;
  `@plugin-creator` scaffolds the manifest. **Public Plugin Directory publishing is
  "coming soon"** — today: workspace sharing + repo/CLI marketplaces.

**Custom work: medium** (separate subagent install; commands→skills; sandbox config).
**Lost from the single bundle: subagents (ship adjacent), dedicated slash commands.**

## 4. opencode — not a single bundle; plugin is code, components are files

**This is the structural outlier.** An opencode "plugin" is **a JavaScript/TypeScript
module** that exports `async (ctx) => ({ ...hooks })` and may register custom tools via
a returned `tool:` map. It is **not** a declarative directory bundle. Loaded from
`.opencode/plugins/*.ts` (local) or an npm package named in the `plugin: [...]` config
array (auto-installed via Bun).

**What the plugin module CAN do:**
- Register Cartographer's ~20 tools natively via the `tool:` map (`execute(args, ctx)`)
  — **no MCP server process needed** (opencode's strongest tool story).
- Subscribe to lifecycle events (`tool.execute.before/after`, `session.*`,
  `permission.*`, `experimental.session.compacting`) to enforce state discipline.

**What the plugin module CANNOT bundle (must ship as separate files):**
- **Skills** → `.opencode/skills/<name>/SKILL.md` (or `.claude/skills/`, `.agents/skills/`)
- **Subagents** → `.opencode/agents/*.md` (these DO support full tool restriction via
  `permission` + `tools:` allowlist — capability is strong, just not plugin-bundled)
- **Commands** → `.opencode/commands/*.md`

An npm plugin package may *contain* those files, but opencode discovers skills/agents/
commands from the `.opencode/` (or `~/.config/opencode/`) directories — **not from
`node_modules`** — so they need an install/copy step (or `OPENCODE_CONFIG_DIR`).

- **Verdict:** "one plugin" = the npm code module for tools+hooks, **plus** a file
  fan-out for skills/agents/commands. This is the **most packaging work** of the four,
  even though opencode's runtime capabilities (native tools + restricted subagents) are
  excellent. Mitigation: ship an `npx` installer (or `claude`-style copy step) alongside
  the npm plugin to place the `.opencode/` files; or lean on opencode's `.claude/skills`
  + `.agents/skills` compatibility to reuse the Claude bundle's skill files.

**Custom work: highest** (code module + separate file delivery).
**Lost functionality: single-artifact install only — runtime features are intact.**

---

## Cross-platform convergence & strategy

1. **Three of four share a declarative `<x>-plugin/plugin.json` + `marketplace.json`
   model** (Claude `.claude-plugin`, Cursor `.cursor-plugin`, Codex `.codex-plugin`),
   and **Codex+Cursor intentionally read Claude's `.claude-plugin` layout**. Build the
   **Claude Code plugin first as the canonical bundle**, then derive Cursor and Codex
   manifests from it with thin per-agent deltas (rename manifest dir, drop/relocate the
   slots each lacks).
2. **The only true single-plugin everywhere is impossible** because of two structural
   facts: Codex doesn't bundle subagents, and opencode plugins are code-not-directories.
   Plan for **"one canonical component set → four packaging targets,"** not one artifact.
3. **Subagent tool restriction is the recurring fidelity axis** (Claude ✓ declarative,
   opencode ✓ declarative, Codex ⚠ MCP+sandbox, Cursor ✗ hooks-emulated) — already the
   headline gap in the main plan; plugin packaging doesn't change it.
4. **An `npx` installer is still valuable** even with native plugins — it's the cleanest
   path for opencode's file fan-out, for Codex's separate `.codex/agents/` drop, for the
   `AGENTS.md`/`CLAUDE.md` memory bridge (no plugin slot owns repo memory), and for users
   who don't want a marketplace.

## Per-platform packaging checklist

- **Claude Code:** `.claude-plugin/plugin.json` + `.mcp.json` + `skills/` + `agents/`
  (with `tools:`) + `commands/` + `hooks/hooks.json` + `bin/cartographer-dashboard` +
  `marketplace.json`. Done.
- **Cursor:** `.cursor-plugin/plugin.json` + `mcp.json` + `skills/` + `agents/`
  (`readonly`) + `commands/` + `rules/` + `hooks.json` (tool-isolation gate). Dashboard
  launched manually.
- **Codex:** `.codex-plugin/plugin.json` + `.mcp.json` + `skills/` (incl. workflow
  entry-point skills) + `hooks/hooks.json`; **separately** ship `.codex/agents/*.toml`;
  document `sandbox_mode = "workspace-write"`. Reuse the Claude marketplace.json.
- **opencode:** npm plugin module (`tool:` map + hooks) **plus** installer that writes
  `.opencode/skills/`, `.opencode/agents/` (with `tools:` allowlists), `.opencode/commands/`.
