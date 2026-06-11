import { createFileRoute } from "@tanstack/react-router";

type AdrParams = {
	id: string;
};

export const Route = createFileRoute("/api/adrs/$id")({
	server: {
		handlers: {
			GET: async ({ params }: { params: AdrParams }) => {
				const { readAdrById, routeJson } = await import("../../../server/dashboard-api.js");
				return routeJson(() => readAdrById(params.id));
			},
		},
	},
});
