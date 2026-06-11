import { createFileRoute } from "@tanstack/react-router";

type TopicParams = {
	topic: string;
};

export const Route = createFileRoute("/api/topics/$topic/evidence")({
	server: {
		handlers: {
			GET: async ({ params }: { params: TopicParams }) => {
				const { dashboardLoaders, routeJson } = await import("../../../../server/dashboard-api.js");
				return routeJson(() => dashboardLoaders.evidence(params.topic));
			},
		},
	},
});
