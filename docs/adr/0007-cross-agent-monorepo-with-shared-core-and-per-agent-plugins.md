---
adr_id: ADR-0007
title: Cross-agent monorepo with shared core and per-agent plugins
status: proposed
decision_date: 2026-06-11
generated_from_topic: cross-agent-port
adr_required_source: proposal
legacy_import: false
source_commits: []
validation_receipts: []
domains:
  - architecture
  - packaging
  - tooling
  - cross-agent
keywords:
  - monorepo
  - shared-core
  - mcp
  - plugin
  - opencode
  - codex
  - claude-code
  - cursor
  - AGENTS.md
  - skills
  - subagents
decision_kind: feature-architecture
supersedes: []
related: []
precursors: []
children: []
confidence: ""
---

# ADR-0007: Cross-agent monorepo with shared core and per-agent plugins

## Status

Proposed on 2026-06-11.

## Decision

Restructure into a monorepo with a shared core package (packages/core) plus individual per-agent plugin packages (plugin-claude, plugin-cursor, plugin-codex, plugin-opencode, plugin-pi), a single stdio MCP server package (mcp-server) wrapping the core, canonical skills/agents/AGENTS.md authored once and emitted per agent, and an npx config-fanout installer.

## Context

Pi Cartographer is currently a single pi package: a thin pi adapter (extensions/cartographer-tools.ts) registering ~20 cartographer_* tools over PiApi.registerTool and shelling out to portable Python/TS CLI scripts, plus pi skills, pi subagents (.pi/agents), the .plan artifact model, and a React dashboard. We want to run Cartographer across opencode, OpenAI Codex CLI, Claude Code, and Cursor. Research (.plan/cross-agent-port/evidence/) shows the capability is already agent-agnostic; only the integration/packaging layer is pi-specific. The four agents converge on MCP-over-stdio tools and SKILL.md, but diverge on subagent tool restriction (Cursor cannot do it declaratively), plugin packaging (Claude/Cursor/Codex use declarative plugin+marketplace bundles and Codex mirrors .claude-plugin; opencode plugins are JS/TS code modules; Codex plugins have no agents/ slot), and project memory (AGENTS.md native for three, CLAUDE.md bridge for Claude Code).

## Considered Options

- Monorepo with shared core + per-agent plugin packages (chosen)
- Status quo: single pi package, copy logic per agent
- Polyrepo: one repo per agent plugin + published core dependency
- Single package with multiple entrypoints (no workspaces)

## Why This Decision

The core is already agent-agnostic, so a single packages/core consumed by one shared MCP server prevents a four-way fork that the thin-adapter design specifically avoids. The plugin targets are genuinely separate deliverables with different formats and lifecycles, so separate workspace packages let each version, test, and publish independently while sharing core. Canonical skills/agents/AGENTS.md give author-once/emit-per-agent. Status quo guarantees the fork; polyrepo adds cross-repo version coordination and fragments the shared skills/agents/AGENTS.md source of truth (reasonable future split, unnecessary now); single-package multi-entrypoint couples unrelated plugin dependency trees (Cursor/Claude JSON vs opencode Bun/@opencode-ai/plugin vs Codex TOML).

## Consequences

- One shared core prevents divergence; per-agent packaging stays independent.
- No universal single install artifact: Codex ships subagents adjacent to its plugin (no agents/ slot) and opencode needs split delivery (code module + .opencode files).
- Cursor cannot enforce per-agent subagent tool restriction declaratively; must emulate via readonly + beforeMCPExecution hook.
- Build the Claude Code plugin first as canonical; derive Cursor/Codex manifests with thin deltas since they mirror .claude-plugin.
- Requires monorepo tooling (workspaces) and CI fan-out across packages.
- Existing pi integration must be preserved as plugin-pi and not regress.

## How to Use This Decision

Use this decision when working in architecture, packaging, tooling, cross-agent.

## Validation

Deterministic validate-topic PASS (receipt:cross-agent-port:validation:2026-06-11T20:17:39Z) and cartographer-auditor PASS (receipt:cross-agent-port:audit:2026-06-11T20:20:21Z) on the cross-agent-port proposal. ADR remains proposed (not accepted) pending roadmap placement.
