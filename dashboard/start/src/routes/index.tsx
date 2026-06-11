import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../../client/src/App.js";

export const Route = createFileRoute("/")({
	component: DashboardStartRoute,
});

function DashboardStartRoute(): React.JSX.Element {
	const navigate = useNavigate();
	return (
		<DashboardShell
			onTopicNavigate={(topic) => {
				void navigate({ to: "/topics/$topic", params: { topic } });
			}}
		/>
	);
}
