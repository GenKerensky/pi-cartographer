import { createFileRoute } from "@tanstack/react-router";

type TopicDocParams = {
	topic: string;
	kind: string;
};

export const Route = createFileRoute("/api/topics/$topic/docs/$kind")({
	server: {
		handlers: {
			GET: async ({ params }: { params: TopicDocParams }) => {
				const {
					dashboardLoaders,
					routeJson,
					supportedTopicDocumentKind,
					unsupportedDocumentKindResponse,
					notFoundError,
				} = await import("../../../../../server/dashboard-api.js");
				if (!supportedTopicDocumentKind(params.kind)) {
					return unsupportedDocumentKindResponse(params.kind);
				}
				const kind = params.kind;
				return routeJson(async () => {
					const result = await dashboardLoaders.topicDocument(params.topic, kind);
					if (!result.document) {
						throw notFoundError(kind, `${kind} document not found`);
					}
					return result.document;
				});
			},
		},
	},
});
