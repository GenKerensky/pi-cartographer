import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readTopicArtifacts } from "../../dashboard/server/artifact-reader.ts";
import { GraphExplorer } from "../../dashboard/client/src/features/graph-explorer.js";
import { TopicWorkspace } from "../../dashboard/client/src/features/review-workflow.js";
import { createDashboardFixture } from "./fixtures.ts";

describe("dashboard graph explorer", () => {
	it("renders graph explorer, filters, legend, static fallback, and inspector", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const html = renderToStaticMarkup(<GraphExplorer artifacts={artifacts} />);

		expect(html).toContain("data-graph-explorer");
		expect(html).toContain("Graph explorer");
		expect(html).toContain("Search graph");
		expect(html).toContain("data-graph-static-list");
		expect(html).toContain('data-graph-inspector="empty"');
		expect(html).toContain("data-graph-legend");
	});

	it("is integrated into the topic workspace graph tab", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const html = renderToStaticMarkup(<TopicWorkspace artifacts={artifacts} activeSection="graph" />);

		expect(html).toContain("Graph");
		expect(html).toContain("data-graph-explorer");
	});
});
