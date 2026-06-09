import type { ApiResponse, DashboardOverview, HealthReport, LiveReloadStatus } from "../../../shared/models.js";

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
	liveReloadStatus: () => getJson<LiveReloadStatus>("/api/events/status"),
};
