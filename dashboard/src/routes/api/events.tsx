import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events")({
	server: {
		handlers: {
			GET: async () => {
				const { liveReloadStreamResponse } = await import("../../server/dashboard-api.js");
				return liveReloadStreamResponse();
			},
		},
	},
});
