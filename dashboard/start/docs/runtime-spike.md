# TanStack Start runtime spike

This directory is the P0 proof point for converting the dashboard to TanStack Start.

Current status:

- `dashboard/start/vite.config.ts` builds a minimal TanStack Start app with the Start Vite plugin before React, plus Nitro for a Node production server output.
- `dashboard/start/src/routes/__root.tsx`, `index.tsx`, and `topics/$topic.tsx` prove the route tree, SSR loader/server function, and topic deep-link shape.
- The existing Hono runtime in `dashboard/server/**` and the standalone Vite client in `dashboard/client/**` remain authoritative until later phases port CLI startup, server route parity, TanStack DB collections, Chokidar live reload, and the full UI.

Compatibility boundary:

- Do not remove `dashboard/server/**`, `dashboard/client/**`, or Hono dependencies during P0.
- Later phases should use this spike to decide how `cartographer-dashboard start` launches the production Start server without requiring a separate frontend process.
- TanStack DB must remain a read-only reactive projection of planning artifacts; `.plan/**` files remain the source of truth.
