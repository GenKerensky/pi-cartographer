import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { DashboardShell } from "../../App.js";

export const Route = createFileRoute("/topics/$topic")({
	loader: () => ({}),
	component: DashboardTopicRoute,
});

function DashboardTopicRoute(): React.JSX.Element {
	const { topic } = useParams({ from: "/topics/$topic" });
	const navigate = useNavigate();
	return (
		<DashboardShell
			routeTopicId={topic}
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
		/>
	);
}
