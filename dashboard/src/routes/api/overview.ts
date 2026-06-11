import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/overview")({
	server: {
		handlers: {
			GET: async () => {
				const { dashboardLoaders, routeJson } = await import("../../server/dashboard-api.js");
				return routeJson(dashboardLoaders.overview);
			},
		},
	},
});
