import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "../../App.js";
import { TopicMissingArtifactsPanel, TopicPage } from "@/features/review-workflow";

export const Route = createFileRoute("/topics/$topic")({
	loader: () => ({}),
	component: DashboardTopicRoute,
});

const TOPIC_CHILD_SUFFIXES = [
	"/graph",
	"/facts",
	"/evidence",
	"/receipts",
	"/health",
	"/documents",
] as const;

function isChildTopicPath(pathname: string, topic: string): boolean {
	const prefix = `/topics/${encodeURIComponent(topic)}`;
	if (pathname === prefix) return false;
	if (!pathname.startsWith(`${prefix}/`)) return false;
	return TOPIC_CHILD_SUFFIXES.some((suffix) => pathname === `${prefix}${suffix}` || pathname.startsWith(`${prefix}${suffix}/`));
}

function DashboardTopicRoute(): React.JSX.Element {
	const { topic } = Route.useParams();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const childActive = isChildTopicPath(pathname, topic);
	if (childActive) {
		return <Outlet />;
	}
	return (
		<DashboardShell
			activePage="topic"
			routeTopicId={topic}
			useRouterLinks
			onTopicNavigate={(nextTopic) => {
				void navigate({ to: "/topics/$topic", params: { topic: nextTopic } });
			}}
			renderContent={({ selectedTopic }) =>
				selectedTopic ? <TopicPage artifacts={selectedTopic} page="topic" /> : <TopicMissingArtifactsPanel topicName={topic} missing={["topic"]} />
			}
		/>
	);
}
