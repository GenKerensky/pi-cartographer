import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../App.js";
import { TopicMissingArtifactsPanel, TopicPage } from "@/features/review-workflow";

export const Route = createFileRoute("/topics/$topic/evidence")({
	component: DashboardTopicEvidenceRoute,
});

function DashboardTopicEvidenceRoute(): React.JSX.Element {
	const { topic } = Route.useParams();
	const navigate = useNavigate();
	return (
		<DashboardShell
			activePage="evidence"
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
			renderContent={({ selectedTopic }) =>
				selectedTopic ? <TopicPage artifacts={selectedTopic} page="evidence" /> : <TopicMissingArtifactsPanel topicName={topic} missing={["evidence"]} />
			}
		/>
	);
}
