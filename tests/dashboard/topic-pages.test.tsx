import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readOverview, readTopicArtifacts } from "../../dashboard/src/server/artifact-reader.ts";
import {
	DashboardReviewWorkflow,
	OverviewMetrics,
	TopicWorkspace,
	TopicsList,
} from "../../dashboard/src/features/review-workflow.js";
import { createDashboardFixture } from "./fixtures.ts";

describe("dashboard topic review pages", () => {
	it("renders overview metrics, topics list, and topic workspace from temp fixtures", async () => {
		const fixture = createDashboardFixture();
		const overview = await readOverview(fixture.root);
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		const html = renderToStaticMarkup(<DashboardReviewWorkflow overview={overview} selectedTopic={artifacts} />);

		expect(html).toContain("data-overview-metrics");
		expect(html).toContain("data-topics-list");
		expect(html).toContain("data-topic-workspace");
		expect(html).toContain("Demo Proposal");
		expect(html).toContain("Receipts");
		expect(html).toContain("Evidence");
		expect(html).toContain("Graph");
	});

	it("renders focused summary panels with graph, receipt, evidence, and health fields", async () => {
		const fixture = createDashboardFixture();
		const overview = await readOverview(fixture.root);
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		expect(renderToStaticMarkup(<OverviewMetrics overview={overview} />)).toContain("Warnings");
		expect(renderToStaticMarkup(<TopicsList topics={overview.topics} />)).toContain("Graph edges");
		expect(renderToStaticMarkup(<TopicWorkspace artifacts={artifacts} />)).toContain("Health");
	});

	it("can render route-focused workflow sections without the full giant page", async () => {
		const fixture = createDashboardFixture();
		const overview = await readOverview(fixture.root);
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		const topicsHtml = renderToStaticMarkup(
			<DashboardReviewWorkflow overview={overview} selectedTopic={artifacts} visibleSection="topics" />,
		);
		expect(topicsHtml).toContain('data-visible-section="topics"');
		expect(topicsHtml).toContain("data-topics-list");
		expect(topicsHtml).not.toContain("data-overview-metrics");
		expect(topicsHtml).not.toContain("data-topic-workspace");

		const documentsHtml = renderToStaticMarkup(
			<DashboardReviewWorkflow overview={overview} selectedTopic={artifacts} visibleSection="documents" />,
		);
		expect(documentsHtml).toContain('data-visible-section="documents"');
		expect(documentsHtml).toContain("data-topic-workspace");
		expect(documentsHtml).not.toContain("data-overview-metrics");
		expect(documentsHtml).not.toContain("data-topics-list");
	});
});
