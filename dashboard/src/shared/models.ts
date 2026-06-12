export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type HealthSeverity = "info" | "warning" | "error";

export type HealthIssue = {
	id: string;
	severity: HealthSeverity;
	code: string;
	message: string;
	path?: string;
	topic?: string;
	line?: number;
};

export type HealthStatus = "ok" | "warn" | "error";

export type HealthReport = {
	status: HealthStatus;
	root: string;
	generatedAt: string;
	issues: HealthIssue[];
	counts: {
		topics: number;
		adrs: number;
		warnings: number;
		errors: number;
	};
};

export type ApiError = {
	code: string;
	message: string;
	path?: string;
};

export type ApiResponse<T> = {
	ok: boolean;
	data?: T;
	error?: ApiError;
	warnings: HealthIssue[];
};

export type TopicSummary = {
	id: string;
	name: string;
	path: string;
	hasProposal: boolean;
	hasPlan: boolean;
	counts: {
		mapNodes: number;
		mapEdges: number;
		factNodes: number;
		factEdges: number;
		planNodes: number;
		planEdges: number;
		requirementNodes: number;
		requirementEdges: number;
		designNodes: number;
		designEdges: number;
		receipts: number;
		contextPacks: number;
		evidenceFiles: number;
	};
	warnings: HealthIssue[];
};

export type DashboardOverview = {
	root: string;
	generatedAt: string;
	topics: TopicSummary[];
	indexManifest?: IndexManifestSummary;
	adrCount: number;
	health: HealthReport;
};

export type DocumentKind = "proposal" | "requirements" | "design" | "plan" | "adr" | "evidence" | "file";

export type DashboardDocument = {
	id: string;
	kind: DocumentKind;
	path: string;
	topic?: string;
	title?: string;
	content: string;
	sizeBytes: number;
	modifiedAt?: string;
	warnings: HealthIssue[];
};

export type GraphRecordSource =
	| "map.nodes"
	| "map.edges"
	| "facts.nodes"
	| "facts.edges"
	| "plan.nodes"
	| "plan.edges"
	| "requirements.nodes"
	| "requirements.edges"
	| "design.nodes"
	| "design.edges"
	| "adr.nodes"
	| "adr.edges";

export type GraphNode = {
	id: string;
	type: string;
	source: GraphRecordSource;
	label?: string;
	status?: string;
	phaseId?: string;
	taskId?: string;
	validationId?: string;
	raw: JsonObject;
};

export type GraphEdge = {
	id: string;
	from: string;
	to: string;
	type: string;
	source: GraphRecordSource;
	raw: JsonObject;
};

export type TopicGraph = {
	topic: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	warnings: HealthIssue[];
};

export type ReceiptSummary = {
	id: string;
	type?: string;
	status?: string;
	phaseId?: string;
	summary?: string;
	commands: {
		command?: string;
		result?: string;
	}[];
	raw: JsonObject;
};

export type ContextPackSummary = {
	id: string;
	phaseId?: string;
	summary?: string;
	budgetTokens?: number;
	references: string[];
	verifiedFiles: string[];
	raw: JsonObject;
};

export type EvidenceSummary = {
	topic: string;
	files: {
		path: string;
		kind: "markdown" | "jsonl";
		sizeBytes: number;
		modifiedAt?: string;
	}[];
	manifestRecords: JsonObject[];
	warnings: HealthIssue[];
};

export type IndexManifestSummary = {
	path: string;
	present: boolean;
	generatedAt?: string;
	schemaVersion?: string | number;
	database?: string;
	rootMatches?: boolean;
	counts?: JsonObject;
	settings?: JsonObject;
	warnings: HealthIssue[];
};

export type AdrSummary = {
	id: string;
	adrId?: string;
	number?: number;
	title: string;
	status?: string;
	decisionDate?: string;
	path?: string;
	domains: string[];
	keywords: string[];
	raw?: JsonObject;
};

export type AdrGraph = {
	nodes: GraphNode[];
	edges: GraphEdge[];
	warnings: HealthIssue[];
};

export type AdrCollection = {
	adrs: AdrSummary[];
	graph: AdrGraph;
	warnings: HealthIssue[];
};

export type LiveReloadEvent = {
	id: string;
	type: "planning-artifacts-changed" | "index-stale";
	resource: "topic" | "global" | "index";
	topic?: string;
	paths: string[];
	events: string[];
	changedAt: string;
};

export type LiveReloadStatus = {
	enabled: boolean;
	state: "idle" | "watching" | "unavailable" | "closed" | "manual-refresh";
	root?: string;
	debounceMs: number;
	heartbeatMs: number;
	ignored: string[];
	indexEvents: "summarized-as-stale-index";
};

export type TopicArtifacts = {
	topic: TopicSummary;
	documents: DashboardDocument[];
	graph: TopicGraph;
	receipts: ReceiptSummary[];
	contextPacks: ContextPackSummary[];
	evidence: EvidenceSummary;
	indexManifest: IndexManifestSummary;
	health: HealthReport;
};
