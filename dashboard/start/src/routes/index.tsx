import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getDashboardRuntimeProbe = createServerFn({ method: "GET" }).handler(() => ({
	message: "TanStack Start dashboard runtime is available.",
	mode: "read-only" as const,
}));

export const Route = createFileRoute("/")({
	loader: () => getDashboardRuntimeProbe(),
	component: DashboardStartProbe,
});

function DashboardStartProbe(): React.JSX.Element {
	const probe = Route.useLoaderData();
	return (
		<main className="min-h-screen bg-background p-6 text-foreground" data-dashboard-start-probe>
			<section className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-xl">
				<p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">read-only local dashboard</p>
				<h1 className="mt-3 text-3xl font-semibold tracking-tight">Pi Cartographer Dashboard</h1>
				<p className="mt-3 text-muted-foreground">{probe.message}</p>
				<p className="mt-2 text-sm text-muted-foreground">Runtime mode: {probe.mode}</p>
				<Link
					className="mt-5 inline-flex rounded-md border border-border px-3 py-2 text-sm"
					to="/topics/$topic"
					params={{ topic: "demo" }}
				>
					Open demo topic route
				</Link>
			</section>
		</main>
	);
}
