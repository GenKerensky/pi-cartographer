import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDashboardApp, READ_ONLY_ROUTES } from "../../dashboard/server/app.ts";
import { readTopicArtifacts } from "../../dashboard/server/artifact-reader.ts";
import type { ApiResponse, TopicGraph } from "../../dashboard/shared/models.ts";
import { GraphExplorer } from "../../dashboard/client/src/features/graph-explorer.js";
import { DocumentViewer } from "../../dashboard/client/src/features/document-viewer.js";
import { privateOrOutsideBlockedMessage, renderMarkdownToHtml } from "../../dashboard/client/src/lib/markdown.js";
import { createReferenceIndex, resolveReference } from "../../dashboard/client/src/lib/reference-resolver.js";
import { createLiveReloadService } from "../../dashboard/server/live-reload.ts";
import { createDashboardFixture } from "./fixtures.ts";

async function json<T>(response: Response): Promise<ApiResponse<T>> {
	return (await response.json()) as ApiResponse<T>;
}

describe("dashboard privacy and read-only regressions", () => {
	it("blocks private/outside file API reads and exposes no mutating routes", async () => {
		const fixture = createDashboardFixture();
		const app = createDashboardApp({ root: fixture.root });
		const privateResponse = await app.request(
			`/api/files?path=${encodeURIComponent(`.plan/_private/${fixture.topic}/raw.log`)}`,
		);
		const traversalResponse = await app.request(`/api/files?path=${encodeURIComponent("../package.json")}`);

		expect(privateResponse.status).toBe(403);
		expect(await privateResponse.text()).not.toContain("secret raw artifact");
		expect(traversalResponse.status).toBeGreaterThanOrEqual(400);
		expect(await traversalResponse.text()).not.toContain("pi-cartographer");
		expect(READ_ONLY_ROUTES.every((route) => route.method === "GET")).toBe(true);
	});

	it("keeps private paths out of graph and rendered Markdown UI surfaces", async () => {
		const fixture = createDashboardFixture();
		const app = createDashboardApp({ root: fixture.root });
		const graphPayload = await json<TopicGraph>(await app.request(`/api/topics/${fixture.topic}/graph`));
		const graphText = JSON.stringify(graphPayload);
		expect(graphText).not.toContain("secret raw artifact");

		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const graphHtml = renderToStaticMarkup(<GraphExplorer artifacts={artifacts} />);
		expect(graphHtml).not.toContain(".plan/_private");
		expect(graphHtml).not.toContain("raw.log");

		const firstDocument = artifacts.documents.at(0);
		expect(firstDocument).toBeDefined();
		if (!firstDocument) return;
		const blockedHtml = renderToStaticMarkup(
			<DocumentViewer document={{ ...firstDocument, path: `.plan/_private/${fixture.topic}/raw.log` }} />,
		);
		expect(blockedHtml).toContain("Blocked file");
		expect(blockedHtml).not.toContain("secret raw artifact");

		const index = createReferenceIndex(artifacts);
		expect(resolveReference(`.plan/_private/${fixture.topic}/raw.log`, index).message).not.toContain("raw.log");
		const rendered = await renderMarkdownToHtml("Uses [F001] and `<script>bad()</script>`.", index);
		expect(rendered.html).not.toContain("<script>");
	});

	it("summarizes private live reload paths without emitting raw file names", async () => {
		const fixture = createDashboardFixture();
		const service = await createLiveReloadService({ root: fixture.root, debounceMs: 25, heartbeatMs: 10_000 });
		const events: unknown[] = [];
		const unsubscribe = service.subscribe((event) => events.push(event));
		try {
			await service.start();
			const privatePath = `.plan/_private/${fixture.topic}/raw.log`;
			service.publishForTest("change", `${fixture.root}/${privatePath}`);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(service.status().state).toBe("watching");
			expect(events).toHaveLength(0);
			expect(privateOrOutsideBlockedMessage(privatePath)).toContain("Private planning inputs");
		} finally {
			unsubscribe();
			await service.close();
		}
	});
});
