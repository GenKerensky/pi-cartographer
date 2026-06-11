import { createCollection, type Collection } from "@tanstack/db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createElement, useMemo, type ReactNode } from "react";
import type {
	AdrSummary,
	DashboardDocument,
	DashboardOverview,
	HealthIssue,
	HealthReport,
	IndexManifestSummary,
	LiveReloadEvent,
	LiveReloadStatus,
	TopicArtifacts,
	TopicGraph,
	TopicSummary,
} from "../../../shared/models.js";
import { dashboardApi } from "./api.js";

type RawCollection = Collection;
type DashboardCollectionOptions = {
	queryClient?: QueryClient;
	enabled?: boolean;
};

export const dashboardOverviewQueryKey = ["dashboard", "overview"] as const;
export const dashboardTopicsQueryKey = ["dashboard", "topics"] as const;
export const dashboardAdrsQueryKey = ["dashboard", "adrs"] as const;
export const dashboardHealthQueryKey = ["dashboard", "health"] as const;
export const dashboardLiveStatusQueryKey = ["dashboard", "events", "status"] as const;
export const dashboardLiveEventQueryKey = ["dashboard", "events", "latest"] as const;
export const dashboardTopicArtifactsQueryKey = (topic: string) => ["dashboard", "topic", topic, "artifacts"] as const;
export const dashboardTopicDocumentsQueryKey = (topic: string) => ["dashboard", "topic", topic, "documents"] as const;
export const dashboardTopicDocumentQueryKey = (topic: string, kind: "proposal" | "plan") =>
	["dashboard", "topic", topic, "docs", kind] as const;
export const dashboardTopicGraphQueryKey = (topic: string) => ["dashboard", "topic", topic, "graph"] as const;
export const dashboardIndexManifestQueryKey = ["dashboard", "index"] as const;

const queryClientDefaults = {
	queries: {
		staleTime: 10_000,
		gcTime: 60_000,
		refetchOnWindowFocus: false,
		retry: 1,
	},
};

export function createQueryClient(): QueryClient {
	return new QueryClient({ defaultOptions: queryClientDefaults });
}

export const dashboardQueryClient = createQueryClient();

function throwReadOnlyMutation(): never {
	throw new Error("Dashboard collections are read-only in this mode.");
}

function markReadOnly(collection: RawCollection): RawCollection {
	const utils = (collection as any).utils as Record<string, (...args: unknown[]) => never>;
	for (const method of ["writeInsert", "writeUpdate", "writeDelete", "writeUpsert", "writeBatch"] as const) {
		if (typeof utils?.[method] === "function") {
			utils[method] = throwReadOnlyMutation;
		}
	}
	return collection;
}

let latestLiveReloadEvent: LiveReloadEvent | null = null;

function createReadOnlyCollection(config: any, queryClient: QueryClient): RawCollection {
	const baseConfig = queryCollectionOptions(config);
	const collection = createCollection({
		...baseConfig,
		queryClient,
	} as any);
	return markReadOnly(collection);
}

export function createDashboardOverviewCollection(
	readOverview: () => Promise<DashboardOverview> = dashboardApi.overview,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardOverviewQueryKey,
			enabled: options.enabled,
			queryFn: async () => {
				const overview = await readOverview();
				return [overview];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (overview: DashboardOverview) => overview.root,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createTopicsCollection(
	readTopics: () => Promise<
		{ topics: TopicSummary[] } | { topics: TopicSummary[]; issues: unknown[] }
	> = dashboardApi.topics,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardTopicsQueryKey,
			queryFn: async () => {
				const payload = await readTopics();
				return payload.topics;
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (topic: TopicSummary) => topic.id,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createTopicArtifactsCollection(
	topic: string | undefined,
	readTopicArtifacts: (topic: string) => Promise<TopicArtifacts> = dashboardApi.topic,
	options: DashboardCollectionOptions = {},
): RawCollection {
	const topicKey = topic || "__no-topic__";
	return createReadOnlyCollection(
		{
			queryKey: dashboardTopicArtifactsQueryKey(topicKey),
			enabled: (options.enabled ?? true) && Boolean(topic),
			queryFn: async () => {
				if (!topic) return [];
				const artifacts = await readTopicArtifacts(topic);
				return [artifacts];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (artifact: TopicArtifacts) => artifact.topic.id,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createTopicDocumentsCollection(
	topic: string,
	readTopicDocs: (topic: string) => Promise<{ documents: DashboardDocument[]; issues: unknown[] }> = async (
		topic: string,
	) => {
		const artifacts = await dashboardApi.topic(topic);
		return { documents: artifacts.documents, issues: artifacts.evidence.warnings };
	},
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardTopicDocumentsQueryKey(topic),
			queryFn: async () => {
				const payload = await readTopicDocs(topic);
				return payload.documents;
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (document: DashboardDocument) => document.id,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createTopicDocumentCollection(
	topic: string,
	kind: "proposal" | "plan",
	readTopicDocument: (topic: string, kind: "proposal" | "plan") => Promise<DashboardDocument> = dashboardApi.document,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardTopicDocumentQueryKey(topic, kind),
			queryFn: async () => {
				const document = await readTopicDocument(topic, kind);
				return [document];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (document: DashboardDocument) => document.id,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createTopicGraphCollection(
	topic: string,
	readTopicGraph: (topic: string) => Promise<TopicGraph> = dashboardApi.graph,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardTopicGraphQueryKey(topic),
			queryFn: async () => {
				const graph = await readTopicGraph(topic);
				return [graph];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (graph: TopicGraph) => graph.topic,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createAdrSummaryCollection(
	readAdrs: () => Promise<
		{ adrs: AdrSummary[] } | { adrs: AdrSummary[]; graph: unknown; warnings: unknown[] }
	> = dashboardApi.adrs,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardAdrsQueryKey,
			enabled: options.enabled,
			queryFn: async () => {
				const payload = await readAdrs();
				return payload.adrs;
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (adr: AdrSummary) => adr.id,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createHealthCollection(
	readHealth = dashboardApi.health,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardHealthQueryKey,
			queryFn: async () => {
				const health = await readHealth();
				return [health];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (health: HealthReport) => health.root,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createLiveStatusCollection(
	readLiveStatus = dashboardApi.liveReloadStatus,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardLiveStatusQueryKey,
			enabled: options.enabled,
			queryFn: async () => {
				const status = await readLiveStatus();
				return [status];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: () => "status",
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function createLatestLiveReloadEventCollection(options: DashboardCollectionOptions = {}): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardLiveEventQueryKey,
			enabled: options.enabled,
			queryFn: () => (latestLiveReloadEvent ? [latestLiveReloadEvent] : []),
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: (event: LiveReloadEvent) => event.id,
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export function writeLiveStatus(status: LiveReloadStatus, queryClient: QueryClient = dashboardQueryClient): void {
	queryClient.setQueryData(dashboardLiveStatusQueryKey, [status]);
}

export function writeLatestLiveReloadEvent(
	event: LiveReloadEvent,
	queryClient: QueryClient = dashboardQueryClient,
): void {
	latestLiveReloadEvent = event;
	queryClient.setQueryData(dashboardLiveEventQueryKey, [event]);
}

export function createIndexManifestCollection(
	readIndex: () => Promise<IndexManifestSummary> = dashboardApi.index,
	options: DashboardCollectionOptions = {},
): RawCollection {
	return createReadOnlyCollection(
		{
			queryKey: dashboardIndexManifestQueryKey,
			queryFn: async () => {
				const manifest = await readIndex();
				return [manifest];
			},
			queryClient: options.queryClient ?? dashboardQueryClient,
			getKey: () => "index",
		},
		options.queryClient ?? dashboardQueryClient,
	);
}

export const overviewCollection = createDashboardOverviewCollection();
export const topicsCollection = createTopicsCollection();
export const adrsCollection = createAdrSummaryCollection();
export const healthCollection = createHealthCollection();
export const liveStatusCollection = createLiveStatusCollection();
export const latestLiveReloadEventCollection = createLatestLiveReloadEventCollection();

export function DashboardQueryProvider({ children }: { children: ReactNode }): ReactNode {
	return createElement(QueryClientProvider, { client: dashboardQueryClient, children });
}

export const DashboardQueryClientProvider = DashboardQueryProvider;

export type DashboardCollectionSnapshot<T extends Record<string, unknown>> = {
	collection: RawCollection;
	rows: T[];
	status: "ready" | "loading" | "error" | "idle" | "disabled";
	isLoading: boolean;
	isReady: boolean;
	isError: boolean;
	isIdle: boolean;
};

type RawLiveQuerySnapshot = {
	collection?: RawCollection;
	data?: unknown;
	status?: string;
	isLoading: boolean;
	isReady: boolean;
	isError: boolean;
	isIdle: boolean;
};

function toStatus(snapshot: RawLiveQuerySnapshot): DashboardCollectionSnapshot<Record<string, unknown>>["status"] {
	if (snapshot.isLoading) return "loading";
	if (snapshot.isReady) return "ready";
	if (snapshot.isError) return "error";
	if (snapshot.isIdle) return "idle";
	return "disabled";
}

function rowsFromSnapshot<T extends Record<string, unknown>>(snapshot: RawLiveQuerySnapshot): T[] {
	if (!snapshot || !Array.isArray(snapshot.data)) {
		return [];
	}
	return [...snapshot.data] as T[];
}

export function useDashboardOverview(enabled = true): DashboardCollectionSnapshot<DashboardOverview> & {
	overview?: DashboardOverview;
} {
	const collection = useMemo(
		() =>
			enabled
				? overviewCollection
				: createDashboardOverviewCollection(() => Promise.resolve(undefined as never), { enabled: false }),
		[enabled],
	);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<DashboardOverview>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		overview: rows[0],
		rows,
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useTopicsData(): DashboardCollectionSnapshot<TopicSummary> {
	const snapshot = useLiveQuery(topicsCollection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<TopicSummary>(snapshot);
	return {
		collection: snapshot.collection ?? topicsCollection,
		rows,
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useTopicArtifacts(
	topic: string | undefined,
	enabled = true,
): DashboardCollectionSnapshot<TopicArtifacts> & {
	artifacts?: TopicArtifacts;
} {
	const collection = useMemo(
		() => createTopicArtifactsCollection(topic, dashboardApi.topic, { enabled }),
		[enabled, topic],
	);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<TopicArtifacts>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		rows,
		artifacts: rows[0],
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useTopicDocuments(topic: string): DashboardCollectionSnapshot<DashboardDocument> {
	const collection = useMemo(() => createTopicDocumentsCollection(topic), [topic]);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<DashboardDocument>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		rows,
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useTopicGraph(topic: string): DashboardCollectionSnapshot<TopicGraph> & {
	graph?: TopicGraph;
} {
	const collection = useMemo(() => createTopicGraphCollection(topic), [topic]);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<TopicGraph>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		rows,
		graph: rows[0],
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useAdrs(enabled = true): DashboardCollectionSnapshot<AdrSummary> {
	const collection = useMemo(
		() =>
			enabled ? adrsCollection : createAdrSummaryCollection(() => Promise.resolve({ adrs: [] }), { enabled: false }),
		[enabled],
	);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<AdrSummary>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		rows,
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useHealth(): DashboardCollectionSnapshot<HealthReport> & {
	health?: HealthReport;
	warnings?: HealthIssue[];
} {
	const snapshot = useLiveQuery(healthCollection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<HealthReport>(snapshot);
	const health = rows[0];
	return {
		collection: snapshot.collection ?? healthCollection,
		health,
		warnings: health?.issues,
		rows,
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useLiveStatus(enabled = true): DashboardCollectionSnapshot<LiveReloadStatus> & {
	statusData?: LiveReloadStatus;
} {
	const collection = useMemo(
		() =>
			enabled
				? liveStatusCollection
				: createLiveStatusCollection(() => Promise.resolve(undefined as never), { enabled: false }),
		[enabled],
	);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<LiveReloadStatus>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		rows,
		statusData: rows[0],
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useLatestLiveReloadEvent(enabled = true): DashboardCollectionSnapshot<LiveReloadEvent> & {
	latestEvent?: LiveReloadEvent;
} {
	const collection = useMemo(
		() => (enabled ? latestLiveReloadEventCollection : createLatestLiveReloadEventCollection({ enabled: false })),
		[enabled],
	);
	const snapshot = useLiveQuery(collection as any) as RawLiveQuerySnapshot;
	const rows = rowsFromSnapshot<LiveReloadEvent>(snapshot);
	return {
		collection: snapshot.collection ?? collection,
		rows,
		latestEvent: rows[0],
		status: toStatus(snapshot),
		isLoading: snapshot.isLoading ?? false,
		isReady: snapshot.isReady ?? false,
		isError: snapshot.isError ?? false,
		isIdle: snapshot.isIdle ?? false,
	};
}

export function useOverviewMetrics(
	overview?: DashboardOverview,
): { topics: number; facts: number; receipts: number; warnings: number } | undefined {
	if (!overview) return undefined;
	let facts = 0;
	let receipts = 0;
	for (const topic of overview.topics) {
		facts += topic.counts.factNodes;
		receipts += topic.counts.receipts;
	}
	return {
		topics: overview.topics.length,
		facts,
		receipts,
		warnings: overview.health.counts.warnings,
	};
}
