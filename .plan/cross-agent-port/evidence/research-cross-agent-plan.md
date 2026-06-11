# Pi Cartographer → Cross-Agent Porting Plan

> Consolidated synthesis of five research briefs (`research-opencode.md`,
> `research-codex.md`, `research-claude-code.md`, `research-cursor.md`,
> `research-mcp-portability.md`). Targets: **opencode**, **OpenAI Codex CLI**,
> **Claude Code**, **Cursor**. Current as of 2026-06-11.
>
> AI disclosure: Pi Coding Agent: Claude Opus 4.8 (US) (AWS Bedrock US)

## 1. The core insight

Pi Cartographer is already structured for this. Its capability lives in **portable
CLI scripts** (Python stdlib + `node --experimental-strip-types` TS) under
`skills/*/scripts/`. The pi-specific layer is a thin adapter
(`extensions/cartographer-tools.ts`, a ~20-tool `pi.registerTool` wrapper that just
shells out to those scripts and shapes output). Porting = **replace the one thin
adapter with adapters/configs for each target agent.** The scripts, the `.plan/`
artifact model, and the React dashboard do not change.

The lowest-common-denominator capability layer is **MCP over stdio** — all four
agents speak it. So the central work item is: build **one stdio MCP server** that
re-exposes the same ~20 tools by shelling out to the existing scripts. Everything
else (skills, subagents, memory) is per-agent file fan-out.

## 2. Capability gap matrix

✓ supported · ⚠ partial/unreliable · ✗ not supported

| Capability | Claude Code | opencode | Codex CLI | Cursor |
|---|:---:|:---:|:---:|:---:|
| Native non-MCP custom tools | ✗ (MCP/hooks only) | ✓ (`.opencode/tools/*.ts`) | ✗ (MCP only) | ✗ (MCP only) |
| **MCP tools** (model-visible) | ✓ | ✓ | ✓ | ✓ (⚠ ~40–80 active-tool cap) |
| MCP prompts (autonomous) | ✗ slash-only, model can't see | ✗ tools-only | ✗ uses own prompts dir | ⚠ buggy |
| **Skills (`SKILL.md`)** | ✓ | ✓ | ✓ | ✓ (shipped 2.4) |
| Custom slash commands | ✓ `.claude/commands/` | ✓ `.opencode/commands/` | ✓ `~/.codex/prompts/` | ✓ `.cursor/commands/` |
| **Subagents (create + delegate)** | ✓ | ✓ | ✓ (manual trigger) | ✓ (`.cursor/agents/*.md`) |
| **Per-subagent tool restriction** | ✓ `tools:`/`disallowedTools` | ✓ `permission`/`tools` | ⚠ via per-agent MCP scope + sandbox | ✗ inherits ALL tools; only `readonly` |
| AGENTS.md project memory | ⚠ fallback (CLAUDE.md primary) | ✓ native | ✓ native | ✓ native |
| Hooks (deterministic enforcement) | ✓ | ✓ | ✓ (`[hooks]`) | ✓ (`hooks.json`) |
| Plugin/marketplace packaging | ✓ strong | ✓ npm plugin | ✓ plugins | ✓ `.cursor-plugin/` + marketplace |

**Two takeaways:**
1. **MCP tools + `SKILL.md` + AGENTS.md** are portable across all four with minor
   per-agent path differences. This covers ~80% of Cartographer.
2. The **only hard wall is per-subagent tool restriction**, and it bites exactly
   one target — **Cursor**. Subagents themselves are creatable everywhere.

## 3. Surface-by-surface mapping

### 3a. Custom tools (~20 `cartographer_*`) → one stdio MCP server

Build `bin/cartographer-mcp.ts` with the **TypeScript MCP SDK**
(`@modelcontextprotocol/sdk`) — chosen because Node is already a hard dependency, so
no new runtime, and distribution converges on npm/npx. The server is a pure adapter:
one MCP tool per existing verb, Zod-validated args, handler `spawn`s
`python3 scripts/*.py` or `node --experimental-strip-types scripts/*.ts`, returns
stdout. This mirrors today's `cartographer-tools.ts` almost line-for-line.

| Agent | MCP config file | Key | Format |
|---|---|---|---|
| Claude Code | `.mcp.json` (project) / `~/.claude.json` (user) | `mcpServers` | JSON |
| Cursor | `.cursor/mcp.json` / `~/.cursor/mcp.json` | `mcpServers` | JSON |
| Codex | `~/.codex/config.toml` (+ `.codex/config.toml`) | `[mcp_servers.*]` | TOML |
| opencode | `opencode.json` / `~/.config/opencode/` | `mcp` | JSON |

- **opencode** can alternatively register tools natively (`.opencode/tools/*.ts` or a
  plugin `tool:` map) — preferable there (no extra process, cleaner names), but the
  MCP server is the universal path and fine for v1.
- **Cursor caveat:** ~40–80 active-tool ceiling and per-call approval. Keep to ONE
  lean server; document allowlisting Cartographer tools in `permissions.json`.
- **Codex caveat:** tools run under the sandbox/approval model — needs
  `sandbox_mode = "workspace-write"` (+ `.plan`/`.cartographer` in `writable_roots`)
  for unattended writes.

### 3b. Skills (`skills/*/SKILL.md`) → near-drop-in everywhere

`SKILL.md` is an open standard read by all four. Author **one canonical set**; the
installer copies into each agent's skills dir:

| Agent | Skills dir(s) |
|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/` |
| opencode | `.opencode/skills/`, also reads `.claude/skills/`, `.agents/skills/` |
| Codex | `.agents/skills/` (repo), `~/.agents/skills/` (user) |
| Cursor | `.cursor/skills/`, also reads `.claude/skills/`, `.codex/skills/`, `.agents/skills/` |

- Convergence: **opencode + Cursor both read `.agents/skills/` and `.claude/skills/`.**
  Writing to `.agents/skills/` + `.claude/skills/` may cover three of four with two dirs.
- Audit frontmatter: only `name`+`description` are universal. opencode has the
  narrowest schema (extra fields silently dropped) — move workflow metadata into the
  body or `metadata`. Use each agent's portable script-dir var (`${CLAUDE_SKILL_DIR}`
  etc.) for bundled script paths.

### 3c. Subagents (`.pi/agents/*.md`) → per-agent definitions; tool-restriction degrades on Cursor

| Agent | Location | Tool restriction mechanism |
|---|---|---|
| Claude Code | `.claude/agents/*.md` | `tools:` allowlist + `disallowedTools:` denylist (**strongest**) |
| opencode | `.opencode/agents/*.md` | `permission` block + `tools: {cartographer_*: true}` |
| Codex | `.codex/agents/*.toml` | per-agent `[mcp_servers]` + `enabled_tools` + `sandbox_mode = "read-only"` |
| Cursor | `.cursor/agents/*.md` | **none declarative** — only `readonly: true`; inherits all MCP tools |

Cartographer's read-only specialists (`cartographer-auditor`, `-compass`,
`-archivist`, `-redactor`, `-drafter`) port as agent definitions everywhere. The
restriction fidelity:
- **Claude Code / opencode:** faithful — port the exact tool allowlists.
- **Codex:** approximate — give the agent only a scoped MCP server + `read-only`
  sandbox; accept that the parent's live permission overrides win, and delegation is
  manual-trigger only.
- **Cursor:** **cannot enforce per-agent tool isolation.** Use `readonly: true` +
  a `hooks.json` `beforeMCPExecution` hook to block mutating `cartographer_*` calls
  from read-only roles. Document that isolation is hook-enforced, not declarative.

### 3d. Project memory (`AGENTS.md`) → canonical + Claude bridge

`AGENTS.md` is native for Codex, opencode, Cursor. Claude Code reads `CLAUDE.md`
first (AGENTS.md only as fallback). Strategy: **AGENTS.md is the single source of
truth**; add a `CLAUDE.md` that does `@AGENTS.md` (+ any Claude-only notes), or
symlink `ln -sfn AGENTS.md CLAUDE.md`. **Windows/WSL trap:** without
`git config core.symlinks true`, symlinks check out as plain text — installer should
write a real copy on Windows and add a CI lint (`test -L CLAUDE.md`).

## 4. Recommended distribution: `npx` config-fanout installer + per-agent plugins

Ship one npm package providing:
1. **The stdio MCP server** (`bin/cartographer-mcp.ts`).
2. **An installer** (`npx @genkerensky/cartographer-install`) that detects installed
   agents and idempotently fans out: MCP entry into all four config files (3× JSON +
   1× TOML emitter, merge-not-clobber); copies `SKILL.md` set into each skills dir;
   writes `AGENTS.md` + Claude bridge; emits subagent defs (skipping declarative
   tool-restriction on Cursor); optionally emits slash commands. Pattern proven by
   `add-mcp`, `mcpx-cli`, `ruler`.
3. **Native plugins per agent** (see `research-plugins-per-agent.md` for the full
   single-plugin analysis). Three of four agents use a declarative
   `<x>-plugin/plugin.json` + `marketplace.json` bundle, and **Codex + Cursor
   deliberately mirror Claude Code's `.claude-plugin` layout** (Codex even reads
   `.claude-plugin/marketplace.json` and sets `CLAUDE_PLUGIN_ROOT`). Build the
   **Claude Code plugin first as the canonical bundle**, then derive the others:
   - **Claude Code** — ✅ **full single plugin, zero lost functionality**:
     `.mcp.json` + `skills/` + `agents/` (with declarative `tools:` restriction) +
     `commands/` + `hooks/` + `bin/cartographer-dashboard`. Reference target.
   - **Cursor** — ✅ declarative `.cursor-plugin` bundle (rules+skills+agents+
     commands+MCP+hooks); **lost:** per-agent tool isolation (emulate via `readonly`
     + `beforeMCPExecution` hook) and `bin/`-to-PATH; **risk:** ~40–80 tool cap.
   - **Codex** — ⚠️ mostly one `.codex-plugin` bundle (skills+MCP+hooks+apps), but
     **subagents are NOT a plugin slot** — ship `.codex/agents/*.toml` separately;
     slash commands fold into skills; needs `sandbox_mode=workspace-write`. Can reuse
     the Claude marketplace.json.
   - **opencode** — ❌ **not a single declarative bundle**: a plugin is a JS/TS code
     module (native `tool:` map + hooks, no MCP process needed), so skills/subagents/
     commands ship as separate `.opencode/` files. Highest packaging effort; runtime
     capabilities (native tools + fully-restricted subagents) are excellent.

   **Net:** there is no single artifact that installs everywhere — plan for **one
   canonical component set → four packaging targets**. The `npx` fan-out installer
   (above) remains valuable even with plugins: it handles opencode's file delivery,
   Codex's separate `.codex/agents/` drop, and the `AGENTS.md`/`CLAUDE.md` memory
   bridge (no plugin slot owns repo memory).

### 4a. Cursor plugin packaging (the ideal Cursor distribution vehicle)

Cursor plugins (`https://cursor.com/docs/plugins`) package **exactly the components
Cartographer needs into one distributable bundle** — the official component list is
*Rules, Skills, Agents, Commands, MCP Servers, Hooks*. This is strictly better than
the loose-file fan-out for Cursor: one repo, one install, auto-component discovery.

**Plugin directory layout** (manifest in `.cursor-plugin/`, components at root in
their default dirs — discovered automatically, or custom paths declared in the
manifest):

```text
cartographer/
├── .cursor-plugin/
│   └── plugin.json          # manifest — only `name` is required
├── mcp.json                 # the stdio Cartographer MCP server (§3a)
├── skills/                  # canonical SKILL.md set (§3b)
│   ├── cartographer-proposal/SKILL.md
│   ├── cartographer-plan/SKILL.md
│   └── cartographer-implement/SKILL.md
├── agents/                  # specialist subagents (§3c) — readonly + prompt-level scope
│   ├── cartographer-auditor.md
│   └── cartographer-redactor.md
├── commands/                # workflow slash commands (/cartographer-validate, etc.)
├── rules/                   # .mdc guardrails (state discipline, AGENTS.md bridge)
│   └── cartographer-discipline.mdc
└── hooks.json               # beforeMCPExecution gating to emulate per-agent tool isolation
```

**Manifest** (`.cursor-plugin/plugin.json`):

```json
{
  "name": "cartographer",
  "description": "Pi Cartographer: graph-grounded planning, plans, and implementation routes",
  "version": "1.0.0",
  "author": { "name": "GenKerensky" }
}
```

**Why the plugin is the recommended Cursor path:**
- The `hooks.json` shipped *inside the plugin* is how Cartographer recovers the
  per-subagent tool restriction Cursor lacks declaratively — a `beforeMCPExecution`
  hook can block mutating `cartographer_*` calls when a read-only role is active,
  enforced for everyone who installs the plugin.
- Bundled `rules/*.mdc` can carry the "route mutations through wrappers / never
  hand-edit JSONL" discipline as Always-Apply or Auto-Attached rules.
- The same plugin repo doubles as the install artifact for the MCP server (`mcp.json`
  at plugin root), so Cursor users get tools + skills + agents + guardrails in one step.

**Local dev / test:** drop (or symlink) the plugin into `~/.cursor/plugins/local/`
with `.cursor-plugin/plugin.json` at root, then Developer: Reload Window.
```bash
ln -s /path/to/cartographer ~/.cursor/plugins/local/cartographer
```

**Distribution:** plugins are distributed as **Git repositories**. Public listing
goes through the Cursor Marketplace (manual security review). For org rollout, a
**team marketplace** (Teams/Enterprise) imports the GitHub repo and can mark the
plugin **Required** (auto-installed for a SCIM-controlled distribution group) or
optional. A `workspaceOpen` hook can even return plugin paths to load per-workspace.

**Packaging convergence across all four:** Claude Code (`plugin.json` +
`marketplace.json`), opencode (npm plugin), Codex (plugins bundling skills+MCP), and
now Cursor (`.cursor-plugin/plugin.json`) all support a single-bundle plugin format
covering MCP + skills + agents + commands + hooks. The recommended end state is
**one source-of-truth component set + four thin plugin manifests** (plus the `npx`
fan-out installer for users who don't want a plugin), all emitted from the same repo.

## 5. Suggested phasing

- **Phase 0 — Extract & harden the core.** Confirm every `cartographer_*` capability
  has a clean, agent-agnostic CLI entrypoint with stable JSON output. (Largely true
  already.) This is the contract the MCP server depends on.
- **Phase 1 — MCP server.** Build `bin/cartographer-mcp.ts` (TS SDK, stdio), one tool
  per verb, parity-tested against the current pi extension's outputs.
- **Phase 2 — Installer + memory.** `npx` fan-out for MCP configs + `AGENTS.md`/Claude
  bridge across all four. Idempotent, Windows-safe.
- **Phase 3 — Skills + commands.** Normalize `SKILL.md` frontmatter to the portable
  subset; fan out to skills dirs; emit workflow slash commands.
- **Phase 4 — Subagents + enforcement.** Translate `.pi/agents/*.md` per target;
  implement Cursor `hooks.json` gating to emulate read-only tool isolation.
- **Phase 5 — Native plugins.** Claude Code plugin/marketplace + opencode plugin +
  **Cursor plugin** (`.cursor-plugin/plugin.json` bundling mcp.json/skills/agents/
  commands/rules/hooks) for one-step install per agent (§4a).
- **Phase 6 — Dashboard.** Already portable (loopback Node server reading `.plan/`);
  document launch per agent. No code change expected.

## 6. Open risks / verify-at-build-time

- Cursor active-tool cap (40 vs 80, per-server vs global) — confirm empirically.
- Codex Skills GA vs experimental flag — confirm against installed `codex --version`.
- opencode `@opencode-ai/plugin` `execute` signature (no documented `signal`/abort) —
  inspect installed `.d.ts`.
- Cursor subagent tool-scoping is an open feature request — re-check the frontmatter
  table before finalizing; if `tools:`/`mcp_servers:` ships, drop the hook workaround.
- Per-agent skills-dir paths change fast — installer should verify dirs at write time.
