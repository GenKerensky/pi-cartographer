import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, HeartPulse, ReceiptText } from "lucide-react";
import type { AdrCollection, DashboardOverview, TopicArtifacts, TopicSummary } from "../../../shared/models.js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentViewer } from "@/features/document-viewer";
import { GraphExplorer } from "@/features/graph-explorer";
import { createReferenceIndex, referenceDomId } from "@/lib/reference-resolver";

export type DashboardSectionId = "overview" | "topics" | "documents" | "graph";

export type DashboardReviewWorkflowProps = {
	overview: DashboardOverview;
	selectedTopic?: TopicArtifacts;
	selectedTopicId?: string;
	adrs?: AdrCollection;
	activeSection?: DashboardSectionId;
	onSectionChange?: (section: DashboardSectionId) => void;
	onTopicSelect?: (topicId: string) => void;
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

function tabForSection(section?: DashboardSectionId): string | undefined {
	if (section === "graph") return "graph";
	if (section === "documents") return "proposal";
	return undefined;
}

export function TopicWorkspace({
	artifacts,
	adrs,
	activeSection,
	onSectionChange,
}: {
	artifacts: TopicArtifacts;
	adrs?: AdrCollection;
	activeSection?: DashboardSectionId;
	onSectionChange?: (section: DashboardSectionId) => void;
}): React.JSX.Element {
	const referenceIndex = createReferenceIndex(artifacts, adrs);
	const proposal = artifacts.documents.find((document) => document.kind === "proposal");
	const plan = artifacts.documents.find((document) => document.kind === "plan");
	const [selectedTab, setSelectedTab] = useState(tabForSection(activeSection) ?? "proposal");
	useEffect(() => {
		const nextTab = tabForSection(activeSection);
		if (nextTab) setSelectedTab(nextTab);
	}, [activeSection]);
	return (
		<Card id="dashboard-section-documents" className="min-w-0 max-w-full scroll-mt-24" data-topic-workspace>
			<CardHeader>
				<CardTitle className="break-words">{artifacts.topic.name}</CardTitle>
				<CardDescription>
					Proposal, plan, facts, evidence, receipts, health, graph, and file entry points.
				</CardDescription>
			</CardHeader>
			<CardContent className="min-w-0">
				<Tabs
					value={selectedTab}
					onValueChange={(value) => {
						setSelectedTab(value);
						onSectionChange?.(value === "graph" ? "graph" : "documents");
					}}
				>
					<TabsList className="max-w-full justify-start overflow-x-auto">
						<TabsTrigger value="proposal">Proposal</TabsTrigger>
						<TabsTrigger value="plan">Plan</TabsTrigger>
						<TabsTrigger value="facts">Facts</TabsTrigger>
						<TabsTrigger value="evidence">Evidence</TabsTrigger>
						<TabsTrigger value="receipts">Receipts</TabsTrigger>
						<TabsTrigger value="health">Health</TabsTrigger>
						<TabsTrigger value="graph">Graph</TabsTrigger>
					</TabsList>
					<TabsContent value="proposal" className="pt-4">
						<DocumentViewer document={proposal} referenceIndex={referenceIndex} />
					</TabsContent>
					<TabsContent value="plan" className="pt-4">
						<DocumentViewer document={plan} referenceIndex={referenceIndex} />
					</TabsContent>
					<TabsContent value="facts" className="pt-4">
						<RecordList title="Facts" records={artifacts.graph.nodes.filter((node) => node.id.startsWith("F"))} />
					</TabsContent>
					<TabsContent value="evidence" className="pt-4">
						<EvidencePanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent value="receipts" className="pt-4">
						<ReceiptPanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent value="health" className="pt-4">
						<HealthPanel artifacts={artifacts} />
					</TabsContent>
					<TabsContent id="dashboard-section-graph" value="graph" className="scroll-mt-24 pt-4">
						<GraphExplorer artifacts={artifacts} adrs={adrs} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

function RecordList({
	title,
	records,
}: {
	title: string;
	records: { id: string; label?: string; type: string }[];
}): React.JSX.Element {
	return (
		<ScrollArea className="h-72 rounded-lg border bg-background/40 p-3">
			<h3 className="mb-3 font-medium">{title}</h3>
			<div className="space-y-2">
				{records.map((record) => (
					<div key={record.id} id={referenceDomId(record.id)} className="scroll-mt-24 rounded border p-2 text-sm">
						<Badge variant="outline">{record.type}</Badge> <span>{record.id}</span>
						<p className="text-muted-foreground">{record.label}</p>
					</div>
				))}
			</div>
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

export function DashboardReviewWorkflow({
	overview,
	selectedTopic,
	selectedTopicId,
	adrs,
	activeSection,
	onSectionChange,
	onTopicSelect,
}: DashboardReviewWorkflowProps): React.JSX.Element {
	return (
		<div className="min-w-0 space-y-5" data-review-workflow>
			<OverviewMetrics overview={overview} />
			<TopicsList topics={overview.topics} selectedTopicId={selectedTopicId} onTopicSelect={onTopicSelect} />
			{selectedTopic ? (
				<TopicWorkspace
					artifacts={selectedTopic}
					adrs={adrs}
					activeSection={activeSection}
					onSectionChange={onSectionChange}
				/>
			) : null}
		</div>
	);
}
