import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
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
import {
	dashboardQueryClient,
	useAdrs,
	useDashboardOverview,
	useLatestLiveReloadEvent,
	useLiveStatus,
	useTopicArtifacts,
} from "@/lib/dashboard-db";
import { useLiveConnection, type LiveConnectionState } from "@/lib/events";
import { invalidateCollectionsForLiveReloadEvent } from "@/lib/live-refetch";
import {
	dashboardRouteLinkTarget,
	defaultDashboardNavHref,
	routeDescriptor,
	topicTabForPage,
	type DashboardPageId,
	type DashboardRouteDescriptor,
	type DashboardTopicDocumentKind,
} from "@/lib/dashboard-routes";
import { cn } from "@/lib/utils";
import type { AdrCollection, DashboardOverview, TopicArtifacts } from "./shared/models.js";

type DashboardNavItem = DashboardRouteDescriptor & {
	icon: typeof Activity;
	status: "ready";
};

export const dashboardNavigation: DashboardNavItem[] = [
	{ ...routeDescriptor("overview"), icon: Activity, status: "ready" },
	{ ...routeDescriptor("topics"), icon: Boxes, status: "ready" },
	{ ...routeDescriptor("documents"), icon: FileText, status: "ready" },
	{ ...routeDescriptor("graph"), icon: GitBranch, status: "ready" },
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

function liveStatusToConnectionState(statusState?: string, enabled = true): LiveConnectionState | undefined {
	if (!statusState) return undefined;
	if (!enabled || statusState === "manual-refresh") return "manual-refresh";
	if (statusState === "watching" || statusState === "idle") return "connected";
	if (statusState === "unavailable" || statusState === "closed") return "disconnected";
	return undefined;
}

export type DashboardShellProps = {
	liveStateOverride?: LiveConnectionState;
	initialOverview?: DashboardOverview;
	initialTopic?: TopicArtifacts;
	initialAdrs?: AdrCollection;
	disableDataFetch?: boolean;
	routeTopicId?: string;
	activePage?: DashboardPageId;
	activeDocumentKind?: DashboardTopicDocumentKind;
	useRouterLinks?: boolean;
	navigationHref?: (page: DashboardPageId, topicId?: string, documentKind?: DashboardTopicDocumentKind) => string;
	onTopicNavigate?: (topicId: string) => void;
	renderContent?: (context: DashboardShellContentContext) => React.ReactNode;
};

export type DashboardShellContentContext = {
	overview: DashboardOverview | undefined;
	selectedTopic: TopicArtifacts | undefined;
	selectedTopicId: string | undefined;
	adrs: AdrCollection | undefined;
	activePage: DashboardPageId;
	activeDocumentKind: DashboardTopicDocumentKind;
};

export function DashboardShell({
	liveStateOverride,
	initialOverview,
	initialTopic,
	initialAdrs,
	disableDataFetch = false,
	routeTopicId,
	activePage,
	activeDocumentKind = "proposal",
	useRouterLinks = false,
	navigationHref = defaultDashboardNavHref,
	onTopicNavigate,
	renderContent,
}: DashboardShellProps): React.JSX.Element {
	const activeSection = activePage ?? (routeTopicId ? "topic" : "overview");
	const live = useLiveConnection(liveStateOverride === undefined);
	const liveStatusSnapshot = useLiveStatus(!disableDataFetch);
	const liveEventSnapshot = useLatestLiveReloadEvent(!disableDataFetch);
	const collectionLiveState = liveStatusToConnectionState(
		liveStatusSnapshot.statusData?.state,
		liveStatusSnapshot.statusData?.enabled,
	);
	const liveState = liveStateOverride ?? collectionLiveState ?? live.state;
	const overviewSnapshot = useDashboardOverview(!disableDataFetch);
	const adrsSnapshot = useAdrs(!disableDataFetch);
	const overview = disableDataFetch ? initialOverview : (overviewSnapshot.overview ?? initialOverview);
	const routeRequiresTopic = routeDescriptor(activeSection).requiresTopic === true;
	const effectiveTopicId =
		routeTopicId ?? initialTopic?.topic.id ?? (routeRequiresTopic ? overview?.topics[0]?.id : undefined);
	const selectedTopicSnapshot = useTopicArtifacts(effectiveTopicId, !disableDataFetch && routeRequiresTopic);
	const selectedTopic = routeRequiresTopic
		? disableDataFetch
			? initialTopic
			: (selectedTopicSnapshot.artifacts ?? initialTopic)
		: undefined;
	const adrs = useMemo<AdrCollection | undefined>(() => {
		if (disableDataFetch) return initialAdrs;
		return {
			adrs: adrsSnapshot.rows,
			graph: initialAdrs?.graph ?? { nodes: [], edges: [], warnings: [] },
			warnings: initialAdrs?.warnings ?? [],
		};
	}, [adrsSnapshot.rows, disableDataFetch, initialAdrs]);
	const snapshots = routeRequiresTopic
		? [overviewSnapshot, selectedTopicSnapshot, adrsSnapshot]
		: [overviewSnapshot, adrsSnapshot];
	const loadError = snapshots.some((snapshot) => snapshot.isError) ? "Dashboard collection load failed" : undefined;

	useEffect(() => {
		if (disableDataFetch || !live.lastEvent) return;
		void invalidateCollectionsForLiveReloadEvent(live.lastEvent, dashboardQueryClient, {
			activeTopic: effectiveTopicId,
		}).catch(() => undefined);
	}, [disableDataFetch, effectiveTopicId, live.lastEvent]);

	const handleTopicSelect = (topicId: string): void => {
		onTopicNavigate?.(topicId);
	};
	const activeTopicTab = topicTabForPage(activeSection, activeDocumentKind);

	return (
		<TooltipProvider>
			<div className="min-h-screen text-foreground" data-dashboard-shell>
				<a
					className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
					href="#dashboard-main"
				>
					Skip to dashboard content
				</a>
				<div className="grid min-h-screen grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)]">
					<aside className="border-b border-border/80 bg-card/70 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
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
						<nav className="flex gap-2 overflow-x-auto p-3 lg:grid lg:overflow-visible" aria-label="Dashboard sections">
							{dashboardNavigation.map((item) => {
								const href = navigationHref(item.id, effectiveTopicId, activeDocumentKind);
								const target = dashboardRouteLinkTarget(item.id, effectiveTopicId, activeDocumentKind);
								const active = activeSection === item.id || (item.id === "documents" && activeSection === "topic");
								const unavailable = item.requiresTopic && !effectiveTopicId;
								const className = cn(
									"inline-flex h-9 shrink-0 items-center justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:w-full",
									active
										? "bg-secondary text-secondary-foreground"
										: "text-foreground hover:bg-muted/60 hover:text-foreground",
									unavailable ? "pointer-events-none opacity-60" : undefined,
								);
								const content = (
									<>
										<item.icon className="size-4" />
										<span>{item.label}</span>
										<Badge variant="success" className="ml-auto hidden sm:inline-flex">
											{item.status}
										</Badge>
									</>
								);
								const commonProps = {
									"aria-current": active ? ("page" as const) : undefined,
									"aria-disabled": unavailable ? true : undefined,
									className,
									"data-nav-item": item.id,
									"data-nav-active": active,
								};
								return useRouterLinks && !unavailable ? (
									<Link key={item.label} to={target.to} params={target.params as never} {...commonProps}>
										{content}
									</Link>
								) : (
									<a key={item.label} href={href} {...commonProps}>
										{content}
									</a>
								);
							})}
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
										<TooltipContent>
											{liveEventSnapshot.latestEvent
												? `Latest ${liveEventSnapshot.latestEvent.resource} refresh: ${liveEventSnapshot.latestEvent.events.join(", ")}`
												: "Safe .plan changes refresh visible data without write access."}
										</TooltipContent>
									</Tooltip>
									<Button variant="outline" size="sm">
										<ShieldCheck className="size-4" />
										Read-only
									</Button>
								</div>
							</div>
						</header>

						<main
							id="dashboard-main"
							className="grid min-w-0 flex-1 gap-5 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_22rem]"
						>
							<section className="min-w-0 space-y-5">
								{overview ? (
									renderContent ? (
										renderContent({
											overview,
											selectedTopic,
											selectedTopicId: effectiveTopicId,
											adrs,
											activePage: activeSection,
											activeDocumentKind,
										})
									) : (
										<DashboardReviewWorkflow
											overview={overview}
											selectedTopic={selectedTopic}
											selectedTopicId={effectiveTopicId}
											adrs={adrs}
											activeSection={activeSection}
											activeTopicTab={activeTopicTab}
											visibleSection={activeSection}
											onTopicSelect={handleTopicSelect}
										/>
									)
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

							<aside className="min-w-0 max-w-full xl:block">
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
