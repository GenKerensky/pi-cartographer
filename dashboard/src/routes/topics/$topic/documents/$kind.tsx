import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../../App.js";
import { type DashboardTopicDocumentKind } from "../../../../lib/dashboard-routes.js";

export const Route = createFileRoute("/topics/$topic/documents/$kind")({
	component: DashboardTopicDocumentRoute,
});

function DashboardTopicDocumentRoute(): React.JSX.Element {
	const { topic, kind } = Route.useParams();
	const navigate = useNavigate();
	const activeDocumentKind: DashboardTopicDocumentKind =
		kind === "proposal" || kind === "requirements" || kind === "design" || kind === "plan" ? kind : "proposal";
	return (
		<DashboardShell
			activePage="documents"
			activeDocumentKind={activeDocumentKind}
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
		/>
	);
}
