import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../App.js";

export const Route = createFileRoute("/topics/$topic/health")({
	component: DashboardTopicHealthRoute,
});

function DashboardTopicHealthRoute(): React.JSX.Element {
	const { topic } = Route.useParams();
	const navigate = useNavigate();
	return (
		<DashboardShell
			activePage="health"
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
		/>
	);
}
