# Research: OpenAI Codex CLI extensibility model (for porting Pi Cartographer)

> Verified June 2026 against official docs (developers.openai.com/codex) and the
> openai/codex repo. Codex CLI is the open-source Rust agent (`codex-rs`). Model
> family references in docs are GPT-5.x; the extensibility surfaces below are
> current as of the cited sources.

## Summary

Codex CLI is highly extensible and maps cleanly onto all four Pi Cartographer surfaces.
**Custom tools** → first-class MCP servers (stdio + streamable HTTP) declared in
`[mcp_servers]` of `~/.codex/config.toml`; Codex can also *be* an MCP server
(`codex mcp-server`) and an MCP client. **Skills/workflow prompts** → the new
**Skills** system (`SKILL.md` directories with progressive disclosure) replaces the
now-deprecated custom prompts/slash commands under `~/.codex/prompts/`. **Subagents**
→ genuinely native as of 2026: built-in `default`/`worker`/`explorer` agents plus
**custom agents** as TOML files under `~/.codex/agents/` (or `.codex/agents/`) with
per-agent model, instructions, sandbox, tools, and MCP. **Project memory** → Codex
reads a layered chain of `AGENTS.md` (+ `AGENTS.override.md`) files, global → repo →
cwd. The main porting risk is the **sandbox/approval model** for tools that shell out
and write files, which is governed independently of the tool definition.

---

## 1. Custom tools → MCP servers

**There is no plugin "register a native tool" SDK for the CLI itself; the supported
extension path for ~20 deterministic local CLI tools is MCP.** Codex is both an MCP
client (consumes external servers) and can run as an MCP server.

### MCP client config — `[mcp_servers]` in `~/.codex/config.toml`

Schema supports **two transports**: STDIO (launch a local process) and **Streamable
HTTP** (remote URL). Full field set from the official sample config:

```toml
# --- STDIO transport (best fit for shelling out to local Python/TS CLIs) ---
[mcp_servers.cartographer]
enabled = true                    # optional; default true
required = false                  # optional; fail startup/resume if it can't init
command = "python3"               # required: launcher command
args = ["-m", "cartographer_mcp"] # optional
env = { "PI_HOME" = "/x" }        # optional; key/value copied as-is
env_vars = ["LOCAL_TOKEN", { name = "REMOTE_TOKEN", source = "remote" }]  # forward parent env
cwd = "/path/to/server"           # optional working dir override
startup_timeout_sec = 10.0        # optional; default 10.0  (alias: startup_timeout_ms)
tool_timeout_sec = 60.0           # optional; default 60.0
enabled_tools = ["plan", "fact"]  # optional allow-list
disabled_tools = ["slow-tool"]    # optional deny-list (applied after allow-list)
scopes = ["read:docs"]            # optional OAuth scopes
oauth_resource = "https://docs.example.com/"  # optional OAuth resource
experimental_environment = "remote"           # experimental: run stdio via remote executor

# --- Streamable HTTP transport ---
[mcp_servers.github]
url = "https://github-mcp.example.com/mcp"    # required
bearer_token_env_var = "GITHUB_TOKEN"         # optional; Authorization: Bearer <token>
http_headers = { "X-Example" = "value" }      # optional static headers
env_http_headers = { "X-Auth" = "AUTH_ENV" }  # optional headers from env vars
enabled_tools = ["list_issues"]
disabled_tools = ["delete_issue"]
```

[Sample config](https://developers.openai.com/codex/config-sample) ·
[MCP servers guide](https://openai-codex.mintlify.app/configuration/mcp-servers) ·
[Config reference](https://developers.openai.com/codex/config-reference)

> **Note:** the published schema once exposed a `bearer_token` field that the runtime
> rejects — use `bearer_token_env_var` for HTTP auth.
> ([issue #19275](https://github.com/openai/codex/issues/19275))

### `codex mcp` CLI management

`codex mcp <subcommand>`: `list`, `get`, `add`, `remove`, `login` (OAuth), `logout`.
The `add` command has `AddMcpStdioArgs` (trailing `command` varargs + `--env`) and
`AddMcpStreamableHttpArgs` (`--url`), confirming both transports.
[codex mcp](https://openai-codex.mintlify.app/cli/mcp) ·
[mcp_cmd.rs](https://github.com/openai/codex/blob/eaf81d3f/codex-rs/cli/src/mcp_cmd.rs)

### Codex as an MCP server (and client)

- **Server:** `codex mcp-server` (binary alias `codex-mcp-server`) runs Codex itself
  as an experimental MCP server over stdio (JSON-RPC 2.0, line-delimited). Exposes a
  `codex` tool that runs a Codex session. Used by e.g. the OpenAI Agents SDK.
  [codex mcp-server](https://openai-codex.mintlify.app/cli/mcp-server) ·
  [MCP interface spec](https://github.com/openai/codex/blob/main/codex-rs/docs/codex_mcp_interface.md) ·
  [Agents SDK guide](https://developers.openai.com/codex/guides/agents-sdk)
- **Caveat:** wiring Codex CLI → `codex mcp-server` directly is known to hang on
  `/mcp` listing; community workaround is an HTTP wrapper.
  ([issue #6664](https://github.com/openai/codex/issues/6664))
- **Client:** yes — that is the `[mcp_servers]` mechanism above. MCP servers were
  added in [PR #829](https://github.com/openai/codex/pull/829).

**Porting takeaway:** wrap Cartographer's ~20 deterministic Python/TS CLI scripts as
**one stdio MCP server** exposing them as tools. Use `enabled_tools` to scope, `env`/
`env_vars`/`cwd` to wire process context. Per-server `tool_timeout_sec` matters for
slow deterministic jobs (graph builds).

---

## 2. Skills / workflow prompts

Codex has **two relevant mechanisms**: the modern **Skills** system, and the
**deprecated custom prompts** (slash commands). For on-demand markdown workflow
instructions, **Skills is the intended target**.

### Skills (current, recommended)

A skill is a directory with a required `SKILL.md` (YAML frontmatter `name` +
`description`, then markdown body) plus optional `scripts/`, `references/`, `assets/`,
and `agents/openai.yaml`. Built on the open [agentskills.io](https://agentskills.io/)
standard.

```
my-skill/
├── SKILL.md        # required: frontmatter (name, description) + instructions
├── scripts/        # optional executable code (Python/Bash/etc.)
├── references/     # optional docs loaded on demand
├── assets/         # optional templates
└── agents/openai.yaml  # optional UI metadata, invocation policy, tool deps
```

```markdown
---
name: cartographer-plan
description: Explain exactly when this skill should and should not trigger.
---

Skill instructions for Codex to follow.
```

- **Progressive disclosure:** only name + description + path are injected at startup
  (capped ~2% of context window / 8 KB); full `SKILL.md` is loaded only when the skill
  is selected. This directly matches Pi Cartographer's "on-demand markdown workflow
  instructions" model.
- **Invocation:** explicit (`/skills`, or `$skill-name` mention) or implicit (matched
  by `description`). `allow_implicit_invocation: false` in `agents/openai.yaml`
  restricts to explicit-only.
- **Discovery locations** (scanned automatically):

  | Scope | Location |
  | --- | --- |
  | REPO | `$CWD/.agents/skills`, parent dirs up to repo root, `$REPO_ROOT/.agents/skills` |
  | USER | `$HOME/.agents/skills` |
  | ADMIN | `/etc/codex/skills` |
  | SYSTEM | bundled by OpenAI (skill-creator, plan, etc.) |

- **Per-skill toggle** in `~/.codex/config.toml`:
  ```toml
  [[skills.config]]
  path = "/path/to/skill/SKILL.md"
  enabled = false
  ```
- **Authoring/distribution:** `$skill-creator` to scaffold, `$skill-installer` to pull
  curated skills, and **plugins** as the installable distribution unit (a plugin can
  bundle multiple skills + MCP config + app mappings).
- **Status flag:** historically behind an experimental `skills` feature flag (disabled
  by default in `docs/skills.md`), but the current docs present Skills as a GA
  feature available in CLI/IDE/app. Verify with your installed version.

[Agent Skills](https://developers.openai.com/codex/skills) ·
[Customization](https://developers.openai.com/codex/concepts/customization) ·
[github.com/openai/skills](https://github.com/openai/skills) ·
[skill-creator SKILL.md](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md)

### Custom prompts / slash commands (deprecated)

- Markdown files in `$CODEX_HOME/prompts/` (defaults `~/.codex/prompts/`), invoked as
  `/<filename>` slash commands. Only `.md` files loaded; support frontmatter
  `description`/`argument-hint` and named arguments. Local-only (not shared via repo).
- **OpenAI explicitly deprecated custom prompts in favor of skills.** Existing prompts
  still work but new workflow logic should be authored as skills.
- Built-in slash commands remain: `/review`, `/fork`, `/side`, `/model`, `/fast`,
  `/personality`, `/permissions`, `/raw`, `/agent`, `/skills`, `/mcp`, `/feedback`.

[Custom Prompts (deprecated)](https://developers.openai.com/codex/custom-prompts) ·
[Slash commands](https://developers.openai.com/codex/cli/slash-commands) ·
[PR #2696](https://github.com/openai/codex/pull/2696) ·
[issue #5039](https://github.com/openai/codex/issues/5039)

**Porting takeaway:** port Cartographer workflow prompts to **Skills** (`SKILL.md` +
optional `scripts/`), not the deprecated `~/.codex/prompts/`. Repo-scoped workflows go
in `.agents/skills/`; user-global in `~/.agents/skills/`.

---

## 3. Subagents → native custom agents

**Codex has a genuine native subagent system as of 2026 — this is no longer a gap.**
Subagent workflows are enabled by default; Codex spawns subagents only when the user
explicitly asks. Codex orchestrates spawning, routing, waiting, and thread closing,
then returns a consolidated response.

### Built-in agents
- `default` — general-purpose fallback
- `worker` — execution/implementation focused
- `explorer` — read-heavy codebase exploration

### Custom agents (the Pi Cartographer fit)

Standalone TOML files: `~/.codex/agents/` (personal) or `.codex/agents/` (project).
One agent per file. **Required:** `name`, `description`, `developer_instructions`.
Other `config.toml` keys are allowed and **override** the parent session per-agent —
this is exactly "specialist agents with restricted tools and custom system prompts":

```toml
# .codex/agents/reviewer.toml
name = "reviewer"
description = "PR reviewer focused on correctness, security, and missing tests."
developer_instructions = """
Review code like an owner.
Prioritize correctness, security, behavior regressions, and missing test coverage.
"""
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"          # per-agent sandbox restriction
nickname_candidates = ["Atlas", "Delta", "Echo"]

[mcp_servers.openaiDeveloperDocs]   # per-agent MCP server (restricted tool surface)
url = "https://developers.openai.com/mcp"

[[skills.config]]                    # per-agent skill enable/disable
path = "/Users/me/.agents/skills/docs-editor/SKILL.md"
enabled = false
```

Optional fields (`model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`,
`skills.config`, `nickname_candidates`) **inherit from parent when omitted**. A custom
agent whose `name` matches a built-in (e.g. `explorer`) takes precedence.

### Global `[agents]` settings (in `config.toml`)

```toml
[agents]
max_threads = 6              # concurrent open agent threads (default 6)
max_depth = 1                # nested spawn depth; root=0, default 1 (1 = children can't recurse)
job_max_runtime_seconds = 1800  # default per-worker timeout for spawn_agents_on_csv
```

Also: `[agents.reviewer]` blocks in the main config can register an agent via a
`config_file` pointer + `description` + `nickname_candidates`.

### Important behavioral constraints (gaps to be honest about)
- **Subagents inherit the parent's sandbox policy**, and Codex **reapplies the parent
  turn's live runtime overrides** (`/permissions`, `--yolo`) onto children — even
  overriding a custom agent file's declared `sandbox_mode`. You can tighten a child to
  read-only via its file, but you cannot rely on a child being *more* permissive than
  the live parent override.
- **No native per-agent allow/deny tool ACL beyond MCP `enabled_tools` + sandbox.** A
  requested feature for "per-agent tool access control" / orchestrator read-only mode
  was **closed not-planned / consolidated**
  ([#12460](https://github.com/openai/codex/issues/12460),
  [#18105](https://github.com/openai/codex/issues/18105)). Restrict a subagent's tools
  by giving it only specific `mcp_servers`/`enabled_tools` and a tight `sandbox_mode`.
- **No autonomous/always-on delegation** — spawning requires explicit user instruction
  (opt-in autonomous delegation requested in
  [#18513](https://github.com/openai/codex/issues/18513), still open/closed-as-feature).
- **Per-subagent model/provider/profile routing** is partial; full per-subagent
  provider selection is a [requested gap](https://github.com/openai/codex/issues/14039)
  (model + reasoning effort + sandbox + mcp do work per-agent today).
- `spawn_agents_on_csv` provides batch fan-out (one worker per CSV row, structured
  JSON output) — useful for Cartographer-style bulk audits.

[Subagents](https://developers.openai.com/codex/subagents) ·
[Subagent concepts](https://developers.openai.com/codex/concepts/subagents)

**Porting takeaway:** Cartographer's specialist agents (auditor, planner, etc.) map
directly to `.codex/agents/*.toml` with `developer_instructions` as the system prompt,
`sandbox_mode = "read-only"` for review/audit roles, and scoped `[mcp_servers]` for
the restricted tool surface. Accept that tool restriction = sandbox + MCP allow-list
(no fine-grained per-tool ACL), and that the parent's live permission overrides win.

---

## 4. Project memory → AGENTS.md

**Yes, Codex reads `AGENTS.md` natively, before any work**, building an instruction
chain once per run (once per TUI session). It also supports `AGENTS.override.md`.

### Precedence / discovery (authoritative)

1. **Global scope** (`~/.codex`, or `$CODEX_HOME`): reads `AGENTS.override.md` if
   present, else `AGENTS.md`. Only the **first non-empty file** at this level.
2. **Project scope:** from project root (typically git root) walking *down* to cwd. In
   each directory, checks `AGENTS.override.md`, then `AGENTS.md`, then any
   `project_doc_fallback_filenames`. **At most one file per directory.**
3. **Merge:** concatenated root → cwd, joined by blank lines. **Files closer to cwd
   override earlier ones** (they appear later in the combined prompt).

So effective precedence (later wins): `~/.codex/AGENTS[.override].md` → repo-root
`AGENTS.md` → nested-dir `AGENTS.md` → cwd `AGENTS.md`. `AGENTS.override.md` at a level
suppresses the regular `AGENTS.md` at that same level.

### Related config knobs (`config.toml`)
```toml
project_doc_max_bytes = 32768        # max bytes embedded into first turn (default 32 KiB)
project_doc_fallback_filenames = []  # e.g. ["TEAM_GUIDE.md", ".agents.md"]
project_root_markers = [".git"]      # markers used to find project root
developer_instructions = ""          # injected BEFORE AGENTS.md
```
- Empty files skipped; once combined size hits `project_doc_max_bytes`, no more files
  are added.
- `developer_instructions` (config key) is injected *before* AGENTS.md.
- Source of truth in repo: `codex-rs/core/src/agents_md.rs` and `prompt.md`.

[AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) ·
[agents_md.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/agents_md.rs) ·
[prompt.md](https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md)

**Porting takeaway:** Cartographer global guidance → `~/.codex/AGENTS.md`; project
guidance → repo-root `AGENTS.md`; subsystem rules → nested `AGENTS.md` /
`AGENTS.override.md`. Watch the 32 KiB cap — split large guidance across directories.

---

## 5. config.toml schema, profiles, sandbox/approval (cross-cutting)

### Config locations & precedence
- User-level: `~/.codex/config.toml` (`$CODEX_HOME` overrides home).
- Project-scoped overrides: `.codex/config.toml` in the repo — **loaded only when you
  trust the project** (`[projects."/abs/path"].trust_level = "trusted"`).
- CLI overrides: `--model` (dedicated flags) or generic `-c key=value` (value is TOML),
  e.g. `codex -c sandbox_workspace_write.network_access=true`.

[Config basics](https://developers.openai.com/codex/config-basic) ·
[Advanced config](https://developers.openai.com/codex/config-advanced)

### Profiles
Profiles are **separate files** under `$CODEX_HOME`: `--profile ci` loads
`~/.codex/config.toml` then overlays `~/.codex/ci.config.toml`. Names allow letters,
digits, hyphens, underscores.

### Approval & sandbox (critical for a tool that shells out + writes files)

Two independent axes that compose:

- **`sandbox_mode`** = what Codex *can* touch:
  - `read-only` (default) — inspect only
  - `workspace-write` — edit + run commands inside the workspace (cwd), **no network by
    default**
  - `danger-full-access` — no sandbox (network + full FS); isolated envs only
- **`approval_policy`** = *when* Codex asks first: `untrusted` | `on-request`
  (default) | `never` | `{ granular = {...} }`.

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = []          # extra writable dirs beyond cwd
network_access = false       # outbound net inside sandbox (off by default)
exclude_tmpdir_env_var = false
exclude_slash_tmp = false
```

Presets: `--full-auto` = `workspace-write` + `on-request` (good default for an agent
that writes files locally); `--yolo` / `-a never` + `danger-full-access` removes all
guardrails. There is also a **newer permission-profiles system** (`default_permissions`
+ `[permissions.*]`) that does **not** compose with the legacy `sandbox_mode` —
configure one or the other, not both. The legacy `sandbox_mode` wins if present.

[Sandbox docs](https://github.com/openai/codex/blob/main/docs/sandbox.md) ·
[Permissions](https://developers.openai.com/codex/permissions) ·
[Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)

**Porting takeaway — biggest operational risk:** Cartographer tools shell out to local
Python/TS and write `.plan/` / `.cartographer/` artifacts. Under default `read-only`
+ `on-request`, every write/exec prompts. For unattended/automated Cartographer runs
use `sandbox_mode = "workspace-write"` (add `.plan`/`.cartographer` paths to
`writable_roots` if outside cwd) and set `network_access = true` only if a tool needs
it. MCP tool calls are also subject to the sandbox policy. Subagents inherit this, and
live `/permissions` overrides propagate to children.

### How Codex is extended & distributed (summary)
- **Tools:** MCP servers (stdio/HTTP), `[tools]` toggles (e.g. `view_image`), `[apps]`
  connectors.
- **Workflows:** Skills (`SKILL.md`), distributed as **plugins**.
- **Agents:** built-in + custom `.toml` agents.
- **Hooks:** lifecycle hooks (`[hooks]` / sibling `hooks.json`, e.g. `PreToolUse`) —
  another extension point for policy enforcement around tool calls.
- **Feature flags:** `[features]` table (`multi_agent`, `hooks`, `shell_tool`,
  `unified_exec`, `network_proxy`, etc.).
- **Memories:** `[memories]` (opt-in learned context, separate from AGENTS.md).
- **Model providers:** `[model_providers]` (openai, ollama, lmstudio, amazon-bedrock,
  Azure, custom).

---

## Sources

**Kept (official / primary):**
- [Sample config.toml](https://developers.openai.com/codex/config-sample) — complete annotated schema incl. `[mcp_servers]`, `[agents]`, `[skills.config]`, sandbox, `[features]`.
- [MCP servers guide](https://openai-codex.mintlify.app/configuration/mcp-servers) + [config reference](https://developers.openai.com/codex/config-reference) — MCP field semantics.
- [codex mcp](https://openai-codex.mintlify.app/cli/mcp) / [codex mcp-server](https://openai-codex.mintlify.app/cli/mcp-server) / [MCP interface spec](https://github.com/openai/codex/blob/main/codex-rs/docs/codex_mcp_interface.md) — Codex as MCP client + server.
- [Agent Skills](https://developers.openai.com/codex/skills) + [Customization](https://developers.openai.com/codex/concepts/customization) — Skills model, locations, plugins.
- [Custom Prompts (deprecated)](https://developers.openai.com/codex/custom-prompts) — confirms deprecation in favor of skills.
- [Subagents](https://developers.openai.com/codex/subagents) + [concepts](https://developers.openai.com/codex/concepts/subagents) — custom agent TOML schema, `[agents]`.
- [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) + [agents_md.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/agents_md.rs) — precedence/discovery.
- [Sandbox docs](https://github.com/openai/codex/blob/main/docs/sandbox.md) + [Permissions](https://developers.openai.com/codex/permissions) — sandbox/approval model.
- Repo issues #12460 / #18105 / #18513 / #14039 — honest scope of subagent ACL/delegation gaps.

**Dropped:**
- Third-party blogs (ofox.ai, kingy.ai, thepromptshelf, verdent, vibecoding) — useful corroboration but superseded by official docs; risk of staleness.
- `denysvitali/codex-mcp` — community wrapper, not needed (native `codex mcp-server` exists).

## Gaps
- **Exact GA vs experimental status of Skills** varies between `docs/skills.md` (feature flag, disabled by default) and the polished docs site (presented as GA). Confirm against the specific installed Codex version (`codex --version`) and check `[features]` flags.
- **Per-subagent fine-grained tool ACL** is not natively supported beyond MCP allow-lists + sandbox; orchestrator-read-only requests were closed. If Cartographer needs hard per-agent tool whitelisting, plan to enforce via separate MCP servers per agent + sandbox, or via `[hooks]` PreToolUse policy.
- **Did not hands-on verify** the running binary's behavior in this WSL environment (no Codex install inspected). Suggested next step: install Codex, run `codex mcp list`, `codex --version`, and a `$skill-creator` smoke test to confirm the live feature surface before committing the port.
