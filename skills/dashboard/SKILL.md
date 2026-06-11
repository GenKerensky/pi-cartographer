---
name: "dashboard"
description: "Start, open, inspect, or stop the local read-only Pi Cartographer planning dashboard. Use when the user asks for a planning dashboard, topic dashboard, browser view, dashboard status, or dashboard stop command."
version: 1
created: "2026-06-10"
updated: "2026-06-10"
---

# Pi Cartographer Dashboard

## When to Use

Use this skill when the user asks to start, open, view, inspect, check status for, or stop the Pi Cartographer planning dashboard.

The dashboard is a **local, loopback-only, read-only** view over Cartographer planning artifacts. Normal use is a single TanStack Start full-stack app launched by the CLI; it must not mutate `.plan/`, ADRs, index/cache files, or source files.

## Contract

This skill is a thin procedure around the packaged CLI. Do **not** reimplement server startup, process management, route handling, file watching, or artifact parsing inside the skill. Delegate to:

```bash
cartographer-dashboard <command> [options]
```

If `cartographer-dashboard` is not on `PATH`, resolve the package-relative fallback `../../bin/cartographer-dashboard.js` from this `SKILL.md` directory and run it with Node:

```bash
node --experimental-strip-types <package-root>/bin/cartographer-dashboard.js <command> [options]
```

Report missing `PATH` and fallback failures clearly.

## Common Flows

### Start dashboard for the current repository

```bash
cartographer-dashboard start --root "$PWD" --host 127.0.0.1 --port 0 --json
```

- `--host 127.0.0.1` keeps the server loopback-only.
- `--port 0` asks the OS for an available local port.
- `--json` returns a machine-readable contract with the URL, root, host, port, PID, and runtime metadata.
- Add `--open` only when the user explicitly asks to open a browser.

### Start dashboard deep-linked to a topic

```bash
cartographer-dashboard start --root "$PWD" --topic planning-dashboard --host 127.0.0.1 --port 0 --json
```

Use the topic slug from `.plan/<topic>/`. If the user gives a fuzzy topic name, list or inspect `.plan/` topic directories first, without reading `.plan/_private/`.

### Check dashboard status

```bash
cartographer-dashboard status --root "$PWD" --json
```

Summarize whether a dashboard is running, stale, or absent. Include the URL when available.

### Stop dashboard

```bash
cartographer-dashboard stop --root "$PWD" --json
```

Summarize whether a process was stopped, was already absent, or had stale metadata. Do not kill unrelated processes manually; rely on the CLI guardrails.

## Response Guidance

When reporting results to the user:

- State that the dashboard is read-only and local-only.
- Show the URL from the JSON output when start/status succeeds.
- Show the selected topic deep link when `--topic` was used.
- Mention that live reload watches safe `.plan/**` files and excludes `.plan/_private/**`.
- If startup falls back or fails because the built TanStack Start output is missing in a source checkout, suggest running `npm run dashboard:build` from the package root.

## Safety Rules

- Do not pass non-loopback hosts such as `0.0.0.0`, `::`, or LAN/public addresses.
- Do not add write endpoints, edit planning artifacts, or modify `.plan/` as part of starting/stopping the dashboard.
- Do not inspect raw private evidence under `.plan/_private/`; the dashboard and skill should reference sanitized proposal/evidence artifacts only.
- Keep this skill as documentation/procedure. Future server behavior belongs in `bin/cartographer-dashboard.js`, `dashboard/start/*`, and shared `dashboard/server/*` runtime helpers, not here.
