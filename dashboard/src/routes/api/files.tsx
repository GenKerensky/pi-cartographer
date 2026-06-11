import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/files")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { dashboardLoaders, missingPathResponse, routeJson } = await import("../../server/dashboard-api.js");
				const url = new URL(request.url);
				const requestedPath = url.searchParams.get("path");
				if (!requestedPath) return missingPathResponse();
				return routeJson(() => dashboardLoaders.file(requestedPath));
			},
		},
	},
});
