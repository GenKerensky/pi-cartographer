import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events/status")({
	server: {
		handlers: {
			GET: async () => {
				const { routeJson, liveReloadStatus } = await import("../../../server/dashboard-api.js");
				return routeJson(() => Promise.resolve(liveReloadStatus()));
			},
		},
	},
});
