import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../App.js";

export const Route = createFileRoute("/topics/")({
	component: DashboardTopicsRoute,
});

function DashboardTopicsRoute(): React.JSX.Element {
	const navigate = useNavigate();
	return (
		<DashboardShell
			activePage="topics"
			useRouterLinks
			onTopicNavigate={(topic) => {
				void navigate({ to: "/topics/$topic", params: { topic } });
			}}
		/>
	);
}
