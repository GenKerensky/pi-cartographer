import { useEffect, useState } from "react";
import { Activity, Boxes, FileText, GitBranch, Radar, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { DashboardReviewWorkflow } from "@/features/review-workflow";
import { dashboardApi } from "@/lib/api";
import { useLiveConnection, type LiveConnectionState } from "@/lib/events";
import { createLiveRefetchPlan } from "@/lib/live-refetch";
import type { DashboardOverview, TopicArtifacts } from "../../shared/models.js";

const navigation = [
	{ label: "Overview", icon: Activity, status: "ready" },
	{ label: "Topics", icon: Boxes, status: "ready" },
	{ label: "Documents", icon: FileText, status: "ready" },
	{ label: "Graph", icon: GitBranch, status: "planned" },
];

const metrics = [
	{ label: "Topics", value: "—", tone: "text-sky-200" },
	{ label: "Facts", value: "—", tone: "text-emerald-200" },
	{ label: "Receipts", value: "—", tone: "text-violet-200" },
];

function statusVariant(state: LiveConnectionState): "success" | "warning" | "secondary" {
	if (state === "connected") return "success";
	if (state === "reconnecting") return "warning";
	return "secondary";
}

export type DashboardShellProps = {
	liveStateOverride?: LiveConnectionState;
	initialOverview?: DashboardOverview;
	initialTopic?: TopicArtifacts;
	disableDataFetch?: boolean;
};

export function DashboardShell({
	liveStateOverride,
	initialOverview,
	initialTopic,
	disableDataFetch = false,
}: DashboardShellProps): React.JSX.Element {
	const live = useLiveConnection(liveStateOverride === undefined);
	const liveState = liveStateOverride ?? live.state;
	const [overview, setOverview] = useState<DashboardOverview | undefined>(initialOverview);
	const [selectedTopic, setSelectedTopic] = useState<TopicArtifacts | undefined>(initialTopic);
	const [loadError, setLoadError] = useState<string | undefined>();

	useEffect(() => {
		if (disableDataFetch) return undefined;
		let cancelled = false;
		async function load(): Promise<void> {
			try {
				const nextOverview = await dashboardApi.overview();
				if (cancelled) return;
				setOverview(nextOverview);
				const firstTopic = nextOverview.topics[0]?.id;
				if (firstTopic) setSelectedTopic(await dashboardApi.topic(firstTopic));
				setLoadError(undefined);
			} catch (error) {
				if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [disableDataFetch]);

	useEffect(() => {
		if (disableDataFetch || !live.lastEvent) return;
		const resources = [
			{ kind: "overview" as const },
			{ kind: "health" as const },
			...(selectedTopic ? [{ kind: "topic" as const, topic: selectedTopic.topic.id }] : []),
		];
		if (createLiveRefetchPlan(resources, live.lastEvent).length === 0) return;
		void dashboardApi
			.overview()
			.then(setOverview)
			.catch(() => undefined);
		if (selectedTopic)
			void dashboardApi
				.topic(selectedTopic.topic.id)
				.then(setSelectedTopic)
				.catch(() => undefined);
	}, [disableDataFetch, live.lastEvent, selectedTopic]);

	return (
		<TooltipProvider>
			<div className="min-h-screen text-foreground" data-dashboard-shell>
				<a
					className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
					href="#dashboard-main"
				>
					Skip to dashboard content
				</a>
				<div className="grid min-h-screen grid-cols-1 lg:grid-cols-[17rem_1fr]">
					<aside className="border-b border-border/80 bg-card/70 backdrop-blur lg:border-b-0 lg:border-r">
						<div className="flex h-16 items-center gap-3 px-5">
							<div className="status-gradient flex size-10 items-center justify-center rounded-xl text-background shadow-lg shadow-cyan-500/20">
								<Radar className="size-5" />
							</div>
							<div>
								<p className="text-sm font-semibold tracking-wide">Cartographer</p>
								<p className="text-xs text-muted-foreground">Planning cockpit</p>
							</div>
						</div>
						<Separator />
						<nav className="grid gap-1 p-3" aria-label="Dashboard sections">
							{navigation.map((item) => (
								<Button
									key={item.label}
									variant="ghost"
									className="justify-start gap-3 rounded-lg px-3"
									data-nav-item={item.label.toLowerCase()}
								>
									<item.icon className="size-4" />
									<span>{item.label}</span>
									<Badge variant={item.status === "ready" ? "success" : "outline"} className="ml-auto">
										{item.status}
									</Badge>
								</Button>
							))}
						</nav>
					</aside>

					<div className="flex min-w-0 flex-col">
						<header className="sticky top-0 z-20 border-b bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
							<div className="flex min-h-16 flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between">
								<div>
									<p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">read-only local dashboard</p>
									<h1 className="text-2xl font-semibold tracking-tight">Planning Dashboard</h1>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<Badge
												variant={statusVariant(liveState)}
												data-live-state={liveState}
												aria-label={`Live reload ${liveState}`}
											>
												<span className="mr-1 size-2 rounded-full bg-current" />
												Live: {liveState}
											</Badge>
										</TooltipTrigger>
										<TooltipContent>Safe .plan changes refresh visible data without write access.</TooltipContent>
									</Tooltip>
									<Button variant="outline" size="sm">
										<ShieldCheck className="size-4" />
										Read-only
									</Button>
								</div>
							</div>
						</header>

						<main id="dashboard-main" className="grid flex-1 gap-5 p-5 xl:grid-cols-[1fr_22rem]">
							<section className="space-y-5">
								{overview ? (
									<DashboardReviewWorkflow overview={overview} selectedTopic={selectedTopic} />
								) : (
									<div className="grid gap-4 md:grid-cols-3">
										{metrics.map((metric) => (
											<Card key={metric.label} className="bg-card/75">
												<CardHeader className="pb-2">
													<CardDescription>{metric.label}</CardDescription>
													<CardTitle className={`text-3xl ${metric.tone}`}>{metric.value}</CardTitle>
												</CardHeader>
											</Card>
										))}
									</div>
								)}

								{loadError ? <Badge variant="warning">API unavailable: {loadError}</Badge> : null}
								{!overview ? (
									<Card className="overflow-hidden bg-card/80">
										<CardHeader>
											<div className="flex items-center justify-between gap-3">
												<div>
													<CardTitle>Workspace shell</CardTitle>
													<CardDescription>
														Foundation for overview, topic, document, health, and graph pages.
													</CardDescription>
												</div>
												<Sparkles className="size-5 text-primary" />
											</div>
										</CardHeader>
										<CardContent>
											<Tabs defaultValue="overview">
												<TabsList aria-label="Workspace tabs">
													<TabsTrigger value="overview">Overview</TabsTrigger>
													<TabsTrigger value="topic">Topic</TabsTrigger>
													<TabsTrigger value="health">Health</TabsTrigger>
												</TabsList>
												<TabsContent value="overview" className="space-y-4 pt-4">
													<Input aria-label="Search planning artifacts" placeholder="Search topics, facts, phases..." />
													<div className="grid gap-3 md:grid-cols-2">
														<Skeleton className="h-28" />
														<Skeleton className="h-28" />
													</div>
												</TabsContent>
												<TabsContent value="topic" className="pt-4 text-sm text-muted-foreground">
													Topic routes and documents will bind to the P0 API in P4.
												</TabsContent>
												<TabsContent value="health" className="pt-4 text-sm text-muted-foreground">
													Health panels will surface parse, missing artifact, private-path, and stale-index warnings.
												</TabsContent>
											</Tabs>
										</CardContent>
									</Card>
								) : null}
							</section>

							<aside className="min-w-0">
								<Card className="h-full bg-card/70">
									<CardHeader>
										<CardTitle>Inspector</CardTitle>
										<CardDescription>Selection details, references, and validation trails.</CardDescription>
									</CardHeader>
									<CardContent>
										<ScrollArea className="h-72 rounded-lg border bg-background/40 p-4">
											<div className="space-y-3 text-sm text-muted-foreground motion-reduce:transition-none">
												<p>No node selected.</p>
												<p>
													Keyboard focus rings, reduced-motion classes, and non-color status labels are active in the
													shell.
												</p>
											</div>
										</ScrollArea>
									</CardContent>
								</Card>
							</aside>
						</main>
					</div>
				</div>
				<Toaster />
			</div>
		</TooltipProvider>
	);
}

export default DashboardShell;
