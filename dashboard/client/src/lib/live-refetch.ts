import type { LiveReloadEvent } from "../../../shared/models.js";

export type VisibleDashboardResource = {
	kind: "overview" | "topic" | "document" | "health";
	topic?: string;
	path?: string;
};

export type RefetchDecision = {
	shouldRefetch: boolean;
	reason: "topic-match" | "path-match" | "global-change" | "index-stale" | "unaffected";
};

export function shouldRefetchForLiveEvent(resource: VisibleDashboardResource, event: LiveReloadEvent): RefetchDecision {
	if (event.type === "index-stale") return { shouldRefetch: true, reason: "index-stale" };
	if (resource.kind === "overview" || resource.kind === "health")
		return { shouldRefetch: true, reason: "global-change" };
	if (resource.topic && event.topic === resource.topic) return { shouldRefetch: true, reason: "topic-match" };
	if (resource.path && event.paths.includes(resource.path)) return { shouldRefetch: true, reason: "path-match" };
	return { shouldRefetch: false, reason: "unaffected" };
}

export function createLiveRefetchPlan(
	resources: VisibleDashboardResource[],
	event: LiveReloadEvent,
): VisibleDashboardResource[] {
	return resources.filter((resource) => shouldRefetchForLiveEvent(resource, event).shouldRefetch);
}
