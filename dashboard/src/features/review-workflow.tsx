import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, GitBranch, HeartPulse, ReceiptText } from "lucide-react";
import type {
	AdrCollection,
	DashboardDocument,
	DashboardOverview,
	TopicArtifacts,
	TopicSummary,
} from "../shared/models.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentViewer } from "@/features/document-viewer";
import { GraphExplorer } from "@/features/graph-explorer";
import { createReferenceIndex, referenceDomId } from "@/lib/reference-resolver";
import {
	dashboardTopicDocumentKinds,
	type DashboardPageId,
	type DashboardTopicDocumentKind,
} from "@/lib/dashboard-routes";

export type DashboardSectionId =
	| "overview"
	| "topics"
	| "topic"
	| "documents"
	| "facts"
	| "evidence"
	| "receipts"
	| "health"
	| "graph";

export type TopicWorkspaceTabId = "proposal" | "requirements" | "design" | "plan" | "facts" | "evidence" | "receipts" | "health" | "graph";

export type DashboardReviewWorkflowProps = {
	overview: DashboardOverview;
	selectedTopic?: TopicArtifacts;
	selectedTopicId?: string;
	adrs?: AdrCollection;
	activeSection?: DashboardSectionId;
	activeTopicTab?: TopicWorkspaceTabId;
	visibleSection?: DashboardSectionId | "all";
	onSectionChange?: (section: DashboardSectionId) => void;
	onTopicSelect?: (topicId: string) => void;
};

export type TopicPageFrameProps = {
	artifacts: TopicArtifacts;
	page: DashboardPageId;
	documentKind?: DashboardTopicDocumentKind;
	adrs?: AdrCollection;
};

export type TopicPageProps = TopicPageFrameProps & {
	page: DashboardPageId;
	documentKind?: DashboardTopicDocumentKind;
};

function totalFacts(topic: TopicSummary): number {
	return topic.counts.factNodes;
}

export function OverviewMetrics({ overview }: { overview: DashboardOverview }): React.JSX.Element {
	const factCount = overview.topics.reduce((total, topic) => total + totalFacts(topic), 0);
	const receiptCount = overview.topics.reduce((total, topic) => total + topic.counts.receipts, 0);
	const metrics = [
		{ label: "Topics", value: overview.topics.length, icon: GitBranch, tone: "text-sky-200" },
		{ label: "Facts", value: factCount, icon: CheckCircle2, tone: "text-emerald-200" },
		{ label: "Receipts", value: receiptCount, icon: ReceiptText, tone: "text-violet-200" },
		{ label: "Warnings", value: overview.health.counts.warnings, icon: AlertTriangle, tone: "text-amber-200" },
	];
	return (
		<section id="dashboard-section-overview" className="min-w-0 scroll-mt-24" data-overview-metrics>
			<div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{metrics.map((metric) => (
					<Card key={metric.label} className="min-w-0 bg-card/75">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardDescription>{metric.label}</CardDescription>
								<metric.icon className="size-4 text-muted-foreground" />
							</div>
							<CardTitle className={`text-3xl ${metric.tone}`}>{metric.value}</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>
		</section>
	);
}

function topicStatus(topic: TopicSummary): "success" | "warning" {
	return topic.warnings.length > 0 ? "warning" : "success";
}

export function TopicsList({
	topics,
	selectedTopicId,
	onTopicSelect,
}: {
	topics: TopicSummary[];
	selectedTopicId?: string;
	onTopicSelect?: (topicId: string) => void;
}): React.JSX.Element {
	return (
		<Card id="dashboard-section-topics" className="min-w-0 scroll-mt-24" data-topics-list>
			<CardHeader>
				<CardTitle>Plans and topics</CardTitle>
				<CardDescription>Proposal/plan readiness, graph counts, evidence, receipts, and health.</CardDescription>
			</CardHeader>
			<CardContent className="min-w-0 space-y-3">
				{topics.map((topic) => (
					<button
						key={topic.id}
						type="button"
						onClick={() => onTopicSelect?.(topic.id)}
						className="block min-w-0 max-w-full rounded-lg border bg-background/40 p-4 text-left transition hover:border-primary/60 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						data-topic-selected={topic.id === selectedTopicId}
					>
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-semibold">{topic.name}</h3>
							<Badge variant={topic.id === selectedTopicId ? "secondary" : "outline"}>
								{topic.id === selectedTopicId ? "selected" : "open"}
							</Badge>
							<Badge variant={topicStatus(topic)}>{topic.warnings.length > 0 ? "warnings" : "healthy"}</Badge>
							<Badge variant={topic.hasPlan ? "success" : "warning"}>{topic.hasPlan ? "plan" : "missing plan"}</Badge>
							<Badge variant={topic.hasProposal ? "success" : "warning"}>
								{topic.hasProposal ? "proposal" : "missing proposal"}
							</Badge>
						</div>
						<dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-3 lg:grid-cols-5">
							<div>
								<dt>Facts</dt>
								<dd className="text-foreground">{topic.counts.factNodes}</dd>
							</div>
							<div>
								<dt>Plan nodes</dt>
								<dd className="text-foreground">{topic.counts.planNodes}</dd>
							</div>
							<div>
								<dt>Receipts</dt>
								<dd className="text-foreground">{topic.counts.receipts}</dd>
							</div>
							<div>
								<dt>Evidence</dt>
								<dd className="text-foreground">{topic.counts.evidenceFiles}</dd>
							</div>
							<div>
								<dt>Graph edges</dt>
								<dd className="text-foreground">
									{topic.counts.mapEdges + topic.counts.factEdges + topic.counts.planEdges}
								</dd>
							</div>
						</dl>
					</button>
				))}
			</CardContent>
		</Card>
	);
}

function tabForSection(section?: DashboardSectionId): TopicWorkspaceTabId | undefined {
	if (section === "topic" || section === "documents") return "proposal";
	if (section === "facts" || section === "evidence" || section === "receipts" || section === "health" || section === "graph") {
		return section;
	}
	return undefined;
}

function sectionForTab(tab: string): DashboardSectionId {
	if (tab === "facts" || tab === "evidence" || tab === "receipts" || tab === "health" || tab === "graph") return tab;
	return "documents";
}

function isTopicWorkspaceSection(section: DashboardSectionId | "all"): boolean {
	return section === "topic" || section === "documents" || section === "facts" || section === "evidence" || section === "receipts" || section === "health" || section === "graph";
}

export function TopicWorkspace({
	artifacts,
	adrs,
	activeSection,
	activeTab,
	onSectionChange,
}: {
	artifacts: TopicArtifacts;
	adrs?: AdrCollection;
	activeSection?: DashboardSectionId;
	activeTab?: TopicWorkspaceTabId;
	onSectionChange?: (section: DashboardSectionId) => void;
}): React.JSX.Element {
	const [selectedTab, setSelectedTab] = useState(activeTab ?? tabForSection(activeSection) ?? "proposal");
	useEffect(() => {
		const nextTab = activeTab ?? tabForSection(activeSection);
		if (nextTab) setSelectedTab(nextTab);
	}, [activeSection, activeTab]);
	return (
		<Card id="dashboard-section-documents" className="min-w-0 max-w-full scroll-mt-24" data-topic-workspace>
			<CardHeader>
				<CardTitle className="break-words">{artifacts.topic.name}</CardTitle>
				<CardDescription>
					Proposal, requirements, design, plan, facts, evidence, receipts, health, graph, and file entry points.
				</CardDescription>
			</CardHeader>
			<CardContent className="min-w-0">
				<Tabs
					value={selectedTab}
					onValueChange={(value) => {
						setSelectedTab(value as TopicWorkspaceTabId);
						onSectionChange?.(sectionForTab(value));
					}}
				>
					<TabsList className="max-w-full justify-start overflow-x-auto">
						<TabsTrigger value="proposal">Proposal</TabsTrigger>
						<TabsTrigger value="requirements">Requirements</TabsTrigger>
						<TabsTrigger value="design">Design</TabsTrigger>
						<TabsTrigger value="plan">Plan</TabsTrigger>
						<TabsTrigger value="facts">Facts</TabsTrigger>
						<TabsTrigger value="evidence">Evidence</TabsTrigger>
						<TabsTrigger value="receipts">Receipts</TabsTrigger>
						<TabsTrigger value="health">Health</TabsTrigger>
						<TabsTrigger value="graph">Graph</TabsTrigger>
					</TabsList>
					<TabsContent value="proposal" className="pt-4">
						<TopicDocumentPanel artifacts={artifacts} adrs={adrs} kind="proposal" />
					</TabsContent>
					<TabsContent value="requirements" className="pt-4">
						<TopicDocumentPanel artifacts={artifacts} adrs={adrs} kind="requirements" />
					</TabsContent>
					<TabsContent value="design" className="pt-4">
						<TopicDocumentPanel artifacts={artifacts} adrs={adrs} kind="design" />
					</TabsContent>
					<TabsContent value="plan" className="pt-4">
						<TopicDocumentPanel artifacts={artifacts} adrs={adrs} kind="plan" />
					</TabsContent>
					<TabsContent value="facts" className="pt-4">
						<TopicFactsPanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent value="evidence" className="pt-4">
						<TopicEvidencePanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent value="receipts" className="pt-4">
						<TopicReceiptsPanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent value="health" className="pt-4">
						<TopicHealthPanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent id="dashboard-section-graph" value="graph" className="scroll-mt-24 pt-4">
						<TopicGraphPanel artifacts={artifacts} adrs={adrs} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

function RecordList({
	title,
	records,
	emptyMessage,
}: {
	title: string;
	records: { id: string; label?: string; type: string }[];
	emptyMessage?: string;
}): React.JSX.Element {
	return (
		<ScrollArea className="h-72 rounded-lg border bg-background/40 p-3">
			<h3 className="mb-3 font-medium">{title}</h3>
			{records.length === 0 ? (
				<p className="text-sm text-muted-foreground" data-record-list-empty>
					{emptyMessage ?? "No records."}
				</p>
			) : (
				<div className="space-y-2">
					{records.map((record) => (
						<div key={record.id} id={referenceDomId(record.id)} className="scroll-mt-24 rounded border p-2 text-sm">
							<Badge variant="outline">{record.type}</Badge> <span>{record.id}</span>
							<p className="text-muted-foreground">{record.label}</p>
						</div>
					))}
				</div>
			)}
		</ScrollArea>
	);
}

function EvidencePanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<RecordList
			title="Evidence"
			records={artifacts.evidence.files.map((file) => ({
				id: file.path,
				label: `${file.kind} · ${file.sizeBytes} bytes`,
				type: "evidence",
			}))}
		/>
	);
}

function ReceiptPanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<RecordList
			title="Receipts"
			records={artifacts.receipts.map((receipt) => ({
				id: receipt.id,
				label: receipt.summary ?? receipt.status,
				type: receipt.status ?? "receipt",
			}))}
		/>
	);
}

function HealthPanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<div className="space-y-3" data-health-panel>
			<Badge variant={artifacts.health.status === "ok" ? "success" : "warning"}>
				<HeartPulse className="mr-1 size-3" />
				{artifacts.health.status}
			</Badge>
			{artifacts.health.issues.map((issue) => (
				<div key={issue.id} className="rounded border p-2 text-sm">
					<Badge variant={issue.severity === "error" ? "destructive" : "warning"}>{issue.severity}</Badge>{" "}
					{issue.message}
				</div>
			))}
		</div>
	);
}

export function TopicPageFrame({ artifacts, page, documentKind, children }: TopicPageFrameProps & { children: React.ReactNode }): React.JSX.Element {
	const heading = pageHeading(page, documentKind);
	return (
		<Card
			id={`dashboard-section-${page}`}
			className="min-w-0 max-w-full scroll-mt-24"
			data-topic-page-frame
			data-topic-page={page}
			data-topic-page-document-kind={documentKind}
		>
			<CardHeader>
				<CardTitle className="break-words">{heading.title(artifacts)}</CardTitle>
				<CardDescription>{heading.description}</CardDescription>
			</CardHeader>
			<CardContent className="min-w-0">{children}</CardContent>
		</Card>
	);
}

function pageHeading(
	page: DashboardPageId,
	documentKind?: DashboardTopicDocumentKind,
): { title: (artifacts: TopicArtifacts) => string; description: string } {
	switch (page) {
		case "documents": {
			const kind = documentKind ?? "proposal";
			const label = kind.charAt(0).toUpperCase() + kind.slice(1);
			return {
				title: (artifacts) => `${label}: ${artifacts.topic.name}`,
				description: `Read-only view of the topic's ${kind} document.`,
			};
		}
		case "topic":
			return {
				title: (artifacts) => artifacts.topic.name,
				description: "Proposal, requirements, design, plan, facts, evidence, receipts, health, and graph.",
			};
		case "facts":
			return {
				title: (artifacts) => `Facts: ${artifacts.topic.name}`,
				description: "Fact records, sources, and supported_by edges for this topic.",
			};
		case "evidence":
			return {
				title: (artifacts) => `Evidence: ${artifacts.topic.name}`,
				description: "Sanitized evidence files and manifest records for this topic.",
			};
		case "receipts":
			return {
				title: (artifacts) => `Receipts: ${artifacts.topic.name}`,
				description: "Validation, audit, and workflow receipts recorded for this topic.",
			};
		case "health":
			return {
				title: (artifacts) => `Health: ${artifacts.topic.name}`,
				description: "Parse, missing-artifact, and private-path warnings for this topic.",
			};
		case "graph":
			return {
				title: (artifacts) => `Graph: ${artifacts.topic.name}`,
				description: "Static and interactive graph views of this topic's planning graph.",
			};
		default:
			return {
				title: (artifacts) => artifacts.topic.name,
				description: "Topic review surface.",
			};
	}
}

export function TopicDocumentPanel({
	artifacts,
	adrs,
	kind,
}: {
	artifacts: TopicArtifacts;
	adrs?: AdrCollection;
	kind: DashboardTopicDocumentKind;
}): React.JSX.Element {
	const referenceIndex = createReferenceIndex(artifacts, adrs);
	const document = artifacts.documents.find((doc) => doc.kind === kind);
	return <TopicDocumentPanelContent document={document} referenceIndex={referenceIndex} />;
}

function TopicDocumentPanelContent({
	document,
	referenceIndex,
}: {
	document?: DashboardDocument;
	referenceIndex?: ReturnType<typeof createReferenceIndex>;
}): React.JSX.Element {
	return (
		<div data-topic-document-panel data-document-kind={document?.kind ?? "missing"}>
			<DocumentViewer document={document} referenceIndex={referenceIndex} />
		</div>
	);
}

export function TopicMissingDocumentPanel({
	kind,
	topicName,
}: {
	kind: DashboardTopicDocumentKind;
	topicName: string;
}): React.JSX.Element {
	return (
		<Card data-topic-document-missing data-missing-document-kind={kind}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FileWarning className="size-5 text-warning" />
					Missing {kind}
				</CardTitle>
				<CardDescription>
					No {kind} document is available for {topicName}. This topic is either pre-proposal, gated, or the
					artifact has not been written yet.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button asChild variant="outline" size="sm">
					<a href="/topics">Back to topics</a>
				</Button>
			</CardContent>
		</Card>
	);
}

export function TopicFactsPanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	const facts = artifacts.graph.nodes.filter((node) => node.id.startsWith("F"));
	return (
		<div data-topic-facts-panel>
			<RecordList title="Facts" records={facts} emptyMessage="No fact records for this topic." />
		</div>
	);
}

export function TopicEvidencePanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<div data-topic-evidence-panel>
			<EvidencePanel artifacts={artifacts} />
		</div>
	);
}

export function TopicReceiptsPanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<div data-topic-receipts-panel>
			<ReceiptPanel artifacts={artifacts} />
		</div>
	);
}

export function TopicHealthPanel({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<div data-topic-health-panel>
			<HealthPanel artifacts={artifacts} />
		</div>
	);
}

export function TopicGraphPanel({
	artifacts,
	adrs,
}: {
	artifacts: TopicArtifacts;
	adrs?: AdrCollection;
}): React.JSX.Element {
	return (
		<div id="dashboard-section-graph" className="scroll-mt-24" data-topic-graph-panel>
			<GraphExplorer artifacts={artifacts} adrs={adrs} />
		</div>
	);
}

export function TopicMissingArtifactsPanel({
	topicName,
	missing,
}: {
	topicName: string;
	missing: string[];
}): React.JSX.Element {
	return (
		<Card data-topic-missing-artifacts>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FileWarning className="size-5 text-warning" />
					Topic artifacts unavailable
				</CardTitle>
				<CardDescription>
					{topicName} does not have artifacts loaded yet. Missing: {missing.join(", ")}.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button asChild variant="outline" size="sm">
					<a href="/topics">Back to topics</a>
				</Button>
			</CardContent>
		</Card>
	);
}

export function TopicPage({ artifacts, page, documentKind, adrs }: TopicPageProps): React.JSX.Element {
	const resolvedKind: DashboardTopicDocumentKind | undefined =
		page === "documents" ? (documentKind ?? "proposal") : undefined;
	return (
		<div data-topic-page data-topic-page-rendered={page}>
			<TopicPageFrame artifacts={artifacts} page={page} documentKind={resolvedKind}>
				{resolvedKind ? <TopicDocumentPanel artifacts={artifacts} adrs={adrs} kind={resolvedKind} /> : null}
				{page === "facts" ? <TopicFactsPanel artifacts={artifacts} /> : null}
				{page === "evidence" ? <TopicEvidencePanel artifacts={artifacts} /> : null}
				{page === "receipts" ? <TopicReceiptsPanel artifacts={artifacts} /> : null}
				{page === "health" ? <TopicHealthPanel artifacts={artifacts} /> : null}
				{page === "graph" ? <TopicGraphPanel artifacts={artifacts} adrs={adrs} /> : null}
				{page === "topic" ? <TopicDocumentPanel artifacts={artifacts} adrs={adrs} kind="proposal" /> : null}
			</TopicPageFrame>
		</div>
	);
}

export function resolveTopicPageTopicId(artifacts?: TopicArtifacts): string | undefined {
	return artifacts?.topic.id;
}

export function listTopicDocumentKinds(): readonly DashboardTopicDocumentKind[] {
	return dashboardTopicDocumentKinds;
}

export function DashboardReviewWorkflow({
	overview,
	selectedTopic,
	selectedTopicId,
	adrs,
	activeSection,
	activeTopicTab,
	visibleSection = "all",
	onSectionChange,
	onTopicSelect,
}: DashboardReviewWorkflowProps): React.JSX.Element {
	const showOverview = visibleSection === "all" || visibleSection === "overview";
	const showTopics = visibleSection === "all" || visibleSection === "topics";
	const showTopicWorkspace = Boolean(selectedTopic) && (visibleSection === "all" || isTopicWorkspaceSection(visibleSection));
	return (
		<div className="min-w-0 space-y-5" data-review-workflow data-visible-section={visibleSection}>
			{showOverview ? <OverviewMetrics overview={overview} /> : null}
			{showTopics ? (
				<TopicsList topics={overview.topics} selectedTopicId={selectedTopicId} onTopicSelect={onTopicSelect} />
			) : null}
			{showTopicWorkspace && selectedTopic ? (
				<TopicWorkspace
					artifacts={selectedTopic}
					adrs={adrs}
					activeSection={activeSection}
					activeTab={activeTopicTab}
					onSectionChange={onSectionChange}
				/>
			) : null}
		</div>
	);
}
