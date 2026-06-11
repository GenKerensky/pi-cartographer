# TanStack Start runtime spike

This directory began as the P0 proof point for converting the dashboard to TanStack Start and is now the full dashboard runtime.

Current status:

- `dashboard/start/vite.config.ts` builds the TanStack Start app with the Start Vite plugin before React, plus Nitro for a Node production server output.
- `dashboard/start/src/routes/**` owns UI routing, API routes, and live event endpoints.
- `cartographer-dashboard start` launches the built Start output from `dashboard/start/.output/server/index.mjs`.
- Package-level dashboard scripts intentionally mirror TanStack Start defaults from this directory: `dashboard:dev` → `vite dev`, `dashboard:build` → `vite build`, `dashboard:start` → `node .output/server/index.mjs`, and `dashboard:preview` → `vite preview`.

Runtime boundary:

- The old Hono server/app/assets path has been removed.
- `dashboard/client/**` remains the shared React UI and state code consumed by the Start app.
- TanStack DB remains a read-only reactive projection of planning artifacts; `.plan/**` files remain the source of truth.
