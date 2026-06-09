import { describe, expect, it } from "vitest";
import { createDashboardApp, READ_ONLY_ROUTES } from "../../dashboard/server/app.ts";
import type { ApiResponse, DashboardDocument, HealthReport, TopicGraph } from "../../dashboard/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

async function responseJson<T>(response: Response): Promise<ApiResponse<T>> {
	return (await response.json()) as ApiResponse<T>;
}

describe("dashboard Hono API", () => {
	it("serves health, overview, docs, and graph data from temp fixtures", async () => {
		const fixture = createDashboardFixture();
		const app = createDashboardApp({ root: fixture.root });

		const healthResponse = await app.request("/api/health");
		const health = await responseJson<HealthReport>(healthResponse);
		expect(healthResponse.status).toBe(200);
		expect(health.ok).toBe(true);
		expect(health.data?.counts.topics).toBe(1);

		const overview = await responseJson<{ topics: { id: string }[] }>(await app.request("/api/overview"));
		expect(overview.data?.topics.map((topic) => topic.id)).toEqual([fixture.topic]);

		const proposal = await responseJson<DashboardDocument>(
			await app.request(`/api/topics/${fixture.topic}/docs/proposal`),
		);
		expect(proposal.data?.title).toBe("Demo Proposal");

		const graph = await responseJson<TopicGraph>(await app.request(`/api/topics/${fixture.topic}/graph`));
		expect(graph.data?.nodes.map((node) => node.id)).toContain("phase:P0");
		expect(graph.data?.edges.map((edge) => edge.type)).toContain("contains");
	});

	it("rejects private file reads and exposes only read-only route definitions", async () => {
		const fixture = createDashboardFixture();
		const app = createDashboardApp({ root: fixture.root });

		const privateResponse = await app.request(
			`/api/files?path=${encodeURIComponent(`.plan/_private/${fixture.topic}/raw.log`)}`,
		);
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
