import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../App.js";
import { TopicMissingArtifactsPanel, TopicPage } from "@/features/review-workflow";

export const Route = createFileRoute("/topics/$topic/graph")({
	component: DashboardTopicGraphRoute,
});

function DashboardTopicGraphRoute(): React.JSX.Element {
	const { topic } = Route.useParams();
	const navigate = useNavigate();
	return (
		<DashboardShell
			activePage="graph"
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
			renderContent={({ selectedTopic, adrs }) =>
				selectedTopic ? (
					<TopicPage artifacts={selectedTopic} adrs={adrs} page="graph" />
				) : (
					<TopicMissingArtifactsPanel topicName={topic} missing={["graph"]} />
				)
			}
		/>
	);
}
