import type {
	AdrCollection,
	ApiResponse,
	DashboardDocument,
	DashboardOverview,
	HealthReport,
	LiveReloadStatus,
	TopicArtifacts,
	TopicGraph,
	TopicSummary,
} from "../../../shared/models.js";

async function getJson<T>(path: string): Promise<T> {
	const response = await fetch(path, { headers: { accept: "application/json" } });
	const payload = (await response.json()) as ApiResponse<T>;
	if (!payload.ok || payload.data === undefined) {
		throw new Error(payload.error?.message ?? `Request failed: ${path}`);
	}
	return payload.data;
}

export const dashboardApi = {
	health: () => getJson<HealthReport>("/api/health"),
	overview: () => getJson<DashboardOverview>("/api/overview"),
	topics: () => getJson<{ topics: TopicSummary[]; issues: unknown[] }>("/api/topics"),
	topic: (topic: string) => getJson<TopicArtifacts>(`/api/topics/${encodeURIComponent(topic)}`),
	document: (topic: string, kind: "proposal" | "plan") =>
		getJson<DashboardDocument>(`/api/topics/${encodeURIComponent(topic)}/docs/${kind}`),
	graph: (topic: string) => getJson<TopicGraph>(`/api/topics/${encodeURIComponent(topic)}/graph`),
	adrs: () => getJson<AdrCollection>("/api/adrs"),
	file: (path: string) => getJson<DashboardDocument>(`/api/files?path=${encodeURIComponent(path)}`),
	liveReloadStatus: () => getJson<LiveReloadStatus>("/api/events/status"),
};
