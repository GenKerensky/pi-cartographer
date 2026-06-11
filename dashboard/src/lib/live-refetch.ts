import type { QueryClient } from "@tanstack/react-query";
import {
	dashboardAdrsQueryKey,
	dashboardHealthQueryKey,
	dashboardIndexManifestQueryKey,
	dashboardLiveStatusQueryKey,
	dashboardOverviewQueryKey,
	dashboardTopicArtifactsQueryKey,
	dashboardTopicDocumentQueryKey,
	dashboardTopicDocumentsQueryKey,
	dashboardTopicGraphQueryKey,
	dashboardTopicsQueryKey,
} from "./dashboard-db.js";
import type { LiveReloadEvent } from "../shared/models.js";

export type VisibleDashboardResource = {
	kind: "overview" | "topic" | "document" | "health";
	topic?: string;
	path?: string;
};

export type RefetchDecision = {
	shouldRefetch: boolean;
	reason: "topic-match" | "path-match" | "global-change" | "index-stale" | "unaffected";
};

export type LiveReloadCollectionInvalidationOptions = {
	activeTopic?: string;
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

function topicFromPath(eventPath: string): string | undefined {
	const normalized = eventPath.replace(/^\/+/, "");
	const [rootDir, topic] = normalized.split("/");
	if (rootDir !== ".plan" || !topic || topic.startsWith("_")) return undefined;
	return topic;
}

function addQueryKeyUnique(keys: Set<string>, out: string[][], key: readonly unknown[]): void {
	const serialized = JSON.stringify(key);
	if (keys.has(serialized)) return;
	keys.add(serialized);
	out.push(Array.isArray(key) ? [...key] : [key]);
}

export function collectionKeysForLiveReloadEvent(
	event: LiveReloadEvent,
	{ activeTopic }: LiveReloadCollectionInvalidationOptions = {},
): string[][] {
	const keys: string[][] = [];
	const seen = new Set<string>();

	addQueryKeyUnique(seen, keys, [...dashboardOverviewQueryKey]);
	addQueryKeyUnique(seen, keys, [...dashboardTopicsQueryKey]);
	addQueryKeyUnique(seen, keys, [...dashboardHealthQueryKey]);
	addQueryKeyUnique(seen, keys, [...dashboardAdrsQueryKey]);
	addQueryKeyUnique(seen, keys, [...dashboardLiveStatusQueryKey]);

	if (event.type === "index-stale" || event.resource === "index") {
		addQueryKeyUnique(seen, keys, [...dashboardIndexManifestQueryKey]);
	}

	const affectedTopics = new Set<string>();
	if (event.topic && !event.topic.startsWith("_")) affectedTopics.add(event.topic);
	for (const eventPath of event.paths) {
		const topic = topicFromPath(eventPath);
		if (topic) affectedTopics.add(topic);
	}

	if (activeTopic && !affectedTopics.size) {
		affectedTopics.add(activeTopic);
	}

	for (const topic of affectedTopics) {
		addQueryKeyUnique(seen, keys, dashboardTopicArtifactsQueryKey(topic));
		addQueryKeyUnique(seen, keys, dashboardTopicDocumentsQueryKey(topic));
		addQueryKeyUnique(seen, keys, dashboardTopicDocumentQueryKey(topic, "proposal"));
		addQueryKeyUnique(seen, keys, dashboardTopicDocumentQueryKey(topic, "plan"));
		addQueryKeyUnique(seen, keys, dashboardTopicGraphQueryKey(topic));
	}

	return keys;
}

export async function invalidateCollectionsForLiveReloadEvent(
	event: LiveReloadEvent,
	queryClient: QueryClient,
	options: LiveReloadCollectionInvalidationOptions = {},
): Promise<string[][]> {
	const keys = collectionKeysForLiveReloadEvent(event, options);
	await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: "all" })));
	return keys;
}
