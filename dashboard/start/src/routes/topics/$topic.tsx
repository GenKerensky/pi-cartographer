import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getTopicRuntimeProbe = createServerFn({ method: "GET" })
	.validator((topic: string) => topic)
	.handler(({ data: topic }) => ({
		topic,
		message: `TanStack Start topic route is available for ${topic}.`,
		mode: "read-only" as const,
	}));

export const Route = createFileRoute("/topics/$topic")({
	loader: ({ params }) => getTopicRuntimeProbe({ data: params.topic }),
	component: TopicStartProbe,
});

function TopicStartProbe(): React.JSX.Element {
	const probe = Route.useLoaderData();
	return (
		<main className="min-h-screen bg-background p-6 text-foreground" data-dashboard-start-topic-probe={probe.topic}>
			<section className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-xl">
				<p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">topic route probe</p>
				<h1 className="mt-3 text-3xl font-semibold tracking-tight">{probe.topic}</h1>
				<p className="mt-3 text-muted-foreground">{probe.message}</p>
				<p className="mt-2 text-sm text-muted-foreground">Runtime mode: {probe.mode}</p>
				<Link className="mt-5 inline-flex rounded-md border border-border px-3 py-2 text-sm" to="/">
					Back to dashboard overview
				</Link>
			</section>
		</main>
	);
}
