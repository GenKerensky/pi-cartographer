import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../../App.js";
import { TopicMissingArtifactsPanel, TopicPage } from "@/features/review-workflow";
import {
	dashboardTopicDocumentKinds,
	type DashboardTopicDocumentKind,
} from "../../../../lib/dashboard-routes.js";

export const Route = createFileRoute("/topics/$topic/documents/$kind")({
	component: DashboardTopicDocumentRoute,
});

function DashboardTopicDocumentRoute(): React.JSX.Element {
	const { topic, kind } = Route.useParams();
	const navigate = useNavigate();
	const activeDocumentKind: DashboardTopicDocumentKind = (dashboardTopicDocumentKinds as readonly string[]).includes(
		kind,
	)
		? (kind as DashboardTopicDocumentKind)
		: "proposal";
	return (
		<DashboardShell
			activePage="documents"
			activeDocumentKind={activeDocumentKind}
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
			renderContent={({ selectedTopic }) => {
				if (!selectedTopic) {
					return <TopicMissingArtifactsPanel topicName={topic} missing={["documents"]} />;
				}
				return <TopicPage artifacts={selectedTopic} page="documents" documentKind={activeDocumentKind} />;
			}}
		/>
	);
}
