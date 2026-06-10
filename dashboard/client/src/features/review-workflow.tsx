import { AlertTriangle, CheckCircle2, GitBranch, HeartPulse, ReceiptText } from "lucide-react";
import type { DashboardOverview, TopicArtifacts, TopicSummary } from "../../../shared/models.js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentViewer } from "@/features/document-viewer";
import { createReferenceIndex } from "@/lib/reference-resolver";

export type DashboardReviewWorkflowProps = {
	overview: DashboardOverview;
	selectedTopic?: TopicArtifacts;
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
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-overview-metrics>
			{metrics.map((metric) => (
				<Card key={metric.label} className="bg-card/75">
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
	);
}

function topicStatus(topic: TopicSummary): "success" | "warning" {
	return topic.warnings.length > 0 ? "warning" : "success";
}

export function TopicsList({ topics }: { topics: TopicSummary[] }): React.JSX.Element {
	return (
		<Card data-topics-list>
			<CardHeader>
				<CardTitle>Plans and topics</CardTitle>
				<CardDescription>Proposal/plan readiness, graph counts, evidence, receipts, and health.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{topics.map((topic) => (
					<div key={topic.id} className="rounded-lg border bg-background/40 p-4">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-semibold">{topic.name}</h3>
							<Badge variant={topicStatus(topic)}>{topic.warnings.length > 0 ? "warnings" : "healthy"}</Badge>
							<Badge variant={topic.hasPlan ? "success" : "warning"}>{topic.hasPlan ? "plan" : "missing plan"}</Badge>
							<Badge variant={topic.hasProposal ? "success" : "warning"}>
								{topic.hasProposal ? "proposal" : "missing proposal"}
							</Badge>
						</div>
						<dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground md:grid-cols-5">
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
					</div>
				))}
			</CardContent>
		</Card>
	);
}

export function TopicWorkspace({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	const referenceIndex = createReferenceIndex(artifacts);
	const proposal = artifacts.documents.find((document) => document.kind === "proposal");
	const plan = artifacts.documents.find((document) => document.kind === "plan");
	return (
		<Card data-topic-workspace>
			<CardHeader>
				<CardTitle>{artifacts.topic.name}</CardTitle>
				<CardDescription>
					Proposal, plan, facts, evidence, receipts, health, graph, and file entry points.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="proposal">
					<TabsList className="flex flex-wrap">
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
					<TabsContent value="graph" className="pt-4">
						<GraphSummary artifacts={artifacts} />
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
					<div key={record.id} className="rounded border p-2 text-sm">
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

function GraphSummary({ artifacts }: { artifacts: TopicArtifacts }): React.JSX.Element {
	return (
		<div className="grid gap-3 md:grid-cols-2" data-graph-summary>
			<Card>
				<CardHeader>
					<CardTitle>{artifacts.graph.nodes.length}</CardTitle>
					<CardDescription>Graph nodes</CardDescription>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{artifacts.graph.edges.length}</CardTitle>
					<CardDescription>Graph edges</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}

export function DashboardReviewWorkflow({ overview, selectedTopic }: DashboardReviewWorkflowProps): React.JSX.Element {
	return (
		<div className="space-y-5" data-review-workflow>
			<OverviewMetrics overview={overview} />
			<TopicsList topics={overview.topics} />
			{selectedTopic ? <TopicWorkspace artifacts={selectedTopic} /> : null}
		</div>
	);
}
