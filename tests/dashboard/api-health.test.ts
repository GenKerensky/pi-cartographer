import { describe, expect, it } from "vitest";
import { dashboardLoaders, READ_ONLY_ROUTES, routeJson } from "../../dashboard/start/src/server/dashboard-api.ts";
import type { ApiResponse, DashboardDocument, HealthReport, TopicGraph } from "../../dashboard/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

async function responseJson<T>(response: Response): Promise<ApiResponse<T>> {
	return (await response.json()) as ApiResponse<T>;
}

async function withDashboardRoot<T>(root: string, run: () => Promise<T>): Promise<T> {
	const previous = process.env.CARTOGRAPHER_DASHBOARD_ROOT;
	process.env.CARTOGRAPHER_DASHBOARD_ROOT = root;
	try {
		return await run();
	} finally {
		if (previous === undefined) delete process.env.CARTOGRAPHER_DASHBOARD_ROOT;
		else process.env.CARTOGRAPHER_DASHBOARD_ROOT = previous;
	}
}

describe("dashboard Start API helpers", () => {
	it("serves health, overview, docs, and graph data from temp fixtures", async () => {
		const fixture = createDashboardFixture();
		await withDashboardRoot(fixture.root, async () => {
			const healthResponse = await routeJson(dashboardLoaders.health);
			const health = await responseJson<HealthReport>(healthResponse);
			expect(healthResponse.status).toBe(200);
			expect(health.ok).toBe(true);
			expect(health.data?.counts.topics).toBe(1);

			const overview = await responseJson<{ topics: { id: string }[] }>(await routeJson(dashboardLoaders.overview));
			expect(overview.data?.topics.map((topic) => topic.id)).toEqual([fixture.topic]);

			const proposal = await responseJson<DashboardDocument>(
				await routeJson(async () => {
					const result = await dashboardLoaders.topicDocument(fixture.topic, "proposal");
					if (!result.document) throw new Error("missing proposal");
					return result.document;
				}),
			);
			expect(proposal.data?.title).toBe("Demo Proposal");

			const graph = await responseJson<TopicGraph>(await routeJson(() => dashboardLoaders.topicGraph(fixture.topic)));
			expect(graph.data?.nodes.map((node) => node.id)).toContain("phase:P0");
			expect(graph.data?.edges.map((edge) => edge.type)).toContain("contains");
		});
	});

	it("rejects private file reads and exposes only read-only route definitions", async () => {
		const fixture = createDashboardFixture();
		await withDashboardRoot(fixture.root, async () => {
			const privateResponse = await routeJson(() => dashboardLoaders.file(`.plan/_private/${fixture.topic}/raw.log`));
			const privatePayload = await privateResponse.text();

			expect(privateResponse.status).toBe(403);
			expect(privatePayload).not.toContain("secret raw artifact");
			expect(READ_ONLY_ROUTES.every((route) => route.method === "GET")).toBe(true);
			expect(READ_ONLY_ROUTES.map((route) => route.path)).toEqual(
				expect.arrayContaining([
					"/api/health",
					"/api/overview",
					"/api/topics/:topic/docs/:kind",
					"/api/topics/:topic/graph",
					"/api/files",
					"/api/adrs",
				]),
			);
		});
	});
});
