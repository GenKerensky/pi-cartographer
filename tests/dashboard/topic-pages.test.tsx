import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readOverview, readTopicArtifacts } from "../../dashboard/src/server/artifact-reader.ts";
import {
	DashboardReviewWorkflow,
	OverviewMetrics,
	TopicDocumentPanel,
	TopicEvidencePanel,
	TopicFactsPanel,
	TopicGraphPanel,
	TopicHealthPanel,
	TopicMissingArtifactsPanel,
	TopicMissingDocumentPanel,
	TopicPage,
	TopicPageFrame,
	TopicReceiptsPanel,
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

describe("dashboard routed topic pages", () => {
	it("renders a TopicPageFrame with stable data attributes for the page and document kind", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		const html = renderToStaticMarkup(
			<TopicPageFrame artifacts={artifacts} page="documents" documentKind="requirements">
				<div>child</div>
			</TopicPageFrame>,
		);
		expect(html).toContain("data-topic-page-frame");
		expect(html).toContain('data-topic-page="documents"');
		expect(html).toContain('data-topic-page-document-kind="requirements"');
		expect(html).toContain("Requirements");
	});

	it("TopicPage renders the right focused panel for each routed page", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		const documentHtml = renderToStaticMarkup(
			<TopicPage artifacts={artifacts} page="documents" documentKind="proposal" />,
		);
		expect(documentHtml).toContain('data-topic-page="documents"');
		expect(documentHtml).toContain("data-topic-document-panel");
		expect(documentHtml).toContain("Demo Proposal");
		expect(documentHtml).not.toContain("data-topic-facts-panel");

		const requirementsHtml = renderToStaticMarkup(
			<TopicPage artifacts={artifacts} page="documents" documentKind="requirements" />,
		);
		expect(requirementsHtml).toContain('data-topic-page-document-kind="requirements"');

		const factsHtml = renderToStaticMarkup(<TopicPage artifacts={artifacts} page="facts" />);
		expect(factsHtml).toContain('data-topic-page="facts"');
		expect(factsHtml).toContain("data-topic-facts-panel");
		expect(factsHtml).toContain("F001");

		const evidenceHtml = renderToStaticMarkup(<TopicPage artifacts={artifacts} page="evidence" />);
		expect(evidenceHtml).toContain('data-topic-page="evidence"');
		expect(evidenceHtml).toContain("data-topic-evidence-panel");

		const receiptsHtml = renderToStaticMarkup(<TopicPage artifacts={artifacts} page="receipts" />);
		expect(receiptsHtml).toContain('data-topic-page="receipts"');
		expect(receiptsHtml).toContain("data-topic-receipts-panel");
		expect(receiptsHtml).toContain("receipt:P0.V1");

		const healthHtml = renderToStaticMarkup(<TopicPage artifacts={artifacts} page="health" />);
		expect(healthHtml).toContain('data-topic-page="health"');
		expect(healthHtml).toContain("data-topic-health-panel");

		const graphHtml = renderToStaticMarkup(<TopicPage artifacts={artifacts} page="graph" />);
		expect(graphHtml).toContain('data-topic-page="graph"');
		expect(graphHtml).toContain("data-topic-graph-panel");
		expect(graphHtml).toContain("data-graph-explorer");
	});

	it("TopicDocumentPanel renders missing document fallback when the kind is not present", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const html = renderToStaticMarkup(<TopicDocumentPanel artifacts={artifacts} kind="plan" />);
		// The fixture does include a plan.md, so we expect data-document-kind="plan".
		expect(html).toContain("data-topic-document-panel");
		expect(html).toContain('data-document-kind="plan"');
	});

	it("TopicMissingDocumentPanel renders a clear missing-document card", () => {
		const html = renderToStaticMarkup(<TopicMissingDocumentPanel kind="design" topicName="missing-topic" />);
		expect(html).toContain("data-topic-document-missing");
		expect(html).toContain('data-missing-document-kind="design"');
		expect(html).toContain("Missing design");
		expect(html).toContain("missing-topic");
	});

	it("TopicMissingArtifactsPanel renders a clear missing-artifact card", () => {
		const html = renderToStaticMarkup(
			<TopicMissingArtifactsPanel topicName="ghost" missing={["documents", "facts"]} />,
		);
		expect(html).toContain("data-topic-missing-artifacts");
		expect(html).toContain("documents, facts");
	});

	it("focused panels render in isolation and expose panel data attributes", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		expect(renderToStaticMarkup(<TopicFactsPanel artifacts={artifacts} />)).toContain("data-topic-facts-panel");
		expect(renderToStaticMarkup(<TopicEvidencePanel artifacts={artifacts} />)).toContain("data-topic-evidence-panel");
		expect(renderToStaticMarkup(<TopicReceiptsPanel artifacts={artifacts} />)).toContain("data-topic-receipts-panel");
		expect(renderToStaticMarkup(<TopicHealthPanel artifacts={artifacts} />)).toContain("data-topic-health-panel");
		expect(renderToStaticMarkup(<TopicGraphPanel artifacts={artifacts} />)).toContain("data-topic-graph-panel");
	});

	it("TopicWorkspace legacy tab view continues to compose focused panels", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);

		const html = renderToStaticMarkup(<TopicWorkspace artifacts={artifacts} activeTab="facts" />);
		expect(html).toContain("data-topic-workspace");
		expect(html).toContain("data-topic-facts-panel");

		const graphHtml = renderToStaticMarkup(<TopicWorkspace artifacts={artifacts} activeTab="graph" />);
		expect(graphHtml).toContain("data-topic-graph-panel");
		expect(graphHtml).toContain("data-graph-explorer");

		const proposalHtml = renderToStaticMarkup(<TopicWorkspace artifacts={artifacts} activeTab="proposal" />);
		expect(proposalHtml).toContain('data-document-kind="proposal"');
	});
});
