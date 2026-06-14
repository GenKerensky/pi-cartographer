import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../App.js";
import { TopicMissingArtifactsPanel, TopicPage } from "@/features/review-workflow";

export const Route = createFileRoute("/topics/$topic/facts")({
	component: DashboardTopicFactsRoute,
});

function DashboardTopicFactsRoute(): React.JSX.Element {
	const { topic } = Route.useParams();
	const navigate = useNavigate();
	return (
		<DashboardShell
			activePage="facts"
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
			renderContent={({ selectedTopic }) =>
				selectedTopic ? (
					<TopicPage artifacts={selectedTopic} page="facts" />
				) : (
					<TopicMissingArtifactsPanel topicName={topic} missing={["facts"]} />
				)
			}
		/>
	);
}
