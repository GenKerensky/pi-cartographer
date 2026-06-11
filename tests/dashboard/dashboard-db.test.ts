import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
	dashboardHealthQueryKey,
	dashboardLiveEventQueryKey,
	dashboardLiveStatusQueryKey,
	dashboardOverviewQueryKey,
	dashboardTopicArtifactsQueryKey,
	dashboardTopicDocumentsQueryKey,
	createDashboardOverviewCollection,
	createTopicArtifactsCollection,
	createTopicDocumentsCollection,
	createTopicsCollection,
	writeLatestLiveReloadEvent,
	writeLiveStatus,
	useOverviewMetrics,
} from "../../dashboard/src/lib/dashboard-db.js";
import type {
	DashboardOverview,
	HealthIssue,
	LiveReloadEvent,
	LiveReloadStatus,
	TopicArtifacts,
	TopicSummary,
} from "../../dashboard/src/shared/models.ts";

describe("dashboard TanStack DB collections", () => {
	it("uses stable query keys for overview and topic collections", () => {
		expect(dashboardOverviewQueryKey).toEqual(["dashboard", "overview"]);
		expect(dashboardTopicArtifactsQueryKey("demo")).toEqual(["dashboard", "topic", "demo", "artifacts"]);
		expect(dashboardTopicDocumentsQueryKey("demo")).toEqual(["dashboard", "topic", "demo", "documents"]);
		expect(dashboardHealthQueryKey).toEqual(["dashboard", "health"]);
		expect(dashboardLiveStatusQueryKey).toEqual(["dashboard", "events", "status"]);
		expect(dashboardLiveEventQueryKey).toEqual(["dashboard", "events", "latest"]);
	});

	it("writes live status and latest SSE reload event into DB-backed query keys", () => {
		const client = new QueryClient();
		const status: LiveReloadStatus = {
			enabled: true,
			state: "watching",
			root: "/tmp/demo",
			debounceMs: 75,
			heartbeatMs: 15_000,
			ignored: [".plan/_private/**"],
			indexEvents: "summarized-as-stale-index",
		};
		const lastEvent: LiveReloadEvent = {
			id: "reload:1",
			type: "planning-artifacts-changed",
			resource: "topic",
			topic: "demo",
			paths: [".plan/demo/plan.md"],
			events: ["change"],
			changedAt: "2026-06-10T00:00:00.000Z",
		};

		writeLiveStatus(status, client);
		writeLatestLiveReloadEvent(lastEvent, client);

		expect(client.getQueryData(dashboardLiveStatusQueryKey)).toMatchObject([status]);
		expect(client.getQueryData(dashboardLiveEventQueryKey)).toMatchObject([lastEvent]);
	});

	it("loads overview and topic artifacts from collection loaders", async () => {
		const client = new QueryClient();
		const warnings: HealthIssue[] = [];
		const fixtureOverview: DashboardOverview = {
			root: "/tmp/example",
			generatedAt: "2026-06-10T00:00:00.000Z",
			adrCount: 1,
			topics: [
				{
					id: "demo",
					name: "Demo",
					path: ".plan/demo",
					hasProposal: true,
					hasPlan: true,
					counts: {
						mapNodes: 1,
						mapEdges: 0,
						factNodes: 2,
						factEdges: 1,
						receipts: 2,
						planNodes: 5,
						planEdges: 0,
						contextPacks: 0,
						evidenceFiles: 0,
					},
					warnings,
				},
			],
			health: {
				status: "ok",
				root: "/tmp/example",
				generatedAt: "2026-06-10T00:00:00.000Z",
				issues: warnings,
				counts: { topics: 1, adrs: 1, warnings: 0, errors: 0 },
			},
		};
		const fixtureArtifacts: TopicArtifacts = {
			topic: fixtureOverview.topics[0],
			documents: [],
			graph: { topic: "demo", nodes: [], edges: [], warnings },
			receipts: [],
			contextPacks: [],
			evidence: { topic: "demo", files: [], manifestRecords: [], warnings },
			indexManifest: { path: "project-index.json", present: false, warnings: [] },
			health: fixtureOverview.health,
		};

		const overviewCollection = createDashboardOverviewCollection(() => Promise.resolve(fixtureOverview), {
			queryClient: client,
		});
		await overviewCollection.preload();

		const artifactsCollection = createTopicArtifactsCollection("demo", () => Promise.resolve(fixtureArtifacts), {
			queryClient: client,
		});
		await artifactsCollection.preload();

		const documentsCollection = createTopicDocumentsCollection(
			"demo",
			() => Promise.resolve({ documents: [], issues: [] }),
			{
				queryClient: client,
			},
		);
		await documentsCollection.preload();

		const [overviewKey, overviewRow] = Array.from(overviewCollection.entries())[0] ?? [];
		const [artifactsKey, artifactRow] = Array.from(artifactsCollection.entries())[0] ?? [];
		const documentEntries = Array.from(documentsCollection.entries());

		expect(overviewKey).toBe("/tmp/example");
		expect(overviewRow?.root).toBe("/tmp/example");
		expect(artifactsKey).toBe("demo");
		expect((artifactRow as unknown as TopicArtifacts | undefined)?.topic.id).toBe("demo");
		expect(documentEntries).toHaveLength(0);
	});

	it("blocks read-only mutation helpers on write operations", async () => {
		const client = new QueryClient();
		const topic: TopicSummary = {
			id: "demo",
			name: "Demo",
			path: ".plan/demo",
			hasProposal: true,
			hasPlan: false,
			counts: {
				mapNodes: 1,
				mapEdges: 0,
				factNodes: 0,
				factEdges: 0,
				receipts: 0,
				planNodes: 0,
				planEdges: 0,
				contextPacks: 0,
				evidenceFiles: 0,
			},
			warnings: [],
		};
		const collection = createTopicsCollection(() => Promise.resolve({ topics: [topic], issues: [] }), {
			queryClient: client,
		});
		await collection.preload();

		expect(() => collection.utils.writeInsert(topic)).toThrow("read-only");
		expect(() => collection.utils.writeUpdate(topic)).toThrow("read-only");
		expect(() => collection.utils.writeDelete("demo")).toThrow("read-only");
		expect(() => collection.utils.writeUpsert(topic)).toThrow("read-only");
	});

	it("tracks preload errors from collection query failures", async () => {
		const client = new QueryClient();
		const boom = new Error("network down");
		const collection = createDashboardOverviewCollection(() => Promise.reject(boom), { queryClient: client });
		await collection.preload();
		expect((collection.utils as { isError: boolean }).isError).toBe(true);
		expect((collection.utils as { lastError?: { message: string } }).lastError?.message).toBe("network down");
	});

	it("computes overview metrics selector from overview payload", () => {
		const metrics = useOverviewMetrics({
			root: "/tmp/example",
			generatedAt: "2026-06-10T00:00:00.000Z",
			adrCount: 2,
			topics: [
				{
					id: "demo",
					name: "Demo",
					path: ".plan/demo",
					hasProposal: true,
					hasPlan: true,
					counts: {
						mapNodes: 1,
						mapEdges: 0,
						factNodes: 12,
						factEdges: 6,
						receipts: 1,
						planNodes: 0,
						planEdges: 2,
						contextPacks: 0,
						evidenceFiles: 0,
					},
					warnings: [],
				},
			],
			health: {
				status: "warn",
				root: "/tmp/example",
				generatedAt: "2026-06-10T00:00:00.000Z",
				issues: [],
				counts: { topics: 1, adrs: 2, warnings: 4, errors: 0 },
			},
		});

		expect(metrics).toMatchObject({ topics: 1, facts: 12, receipts: 1, warnings: 4 });
	});
});
