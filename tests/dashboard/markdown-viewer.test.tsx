import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readTopicArtifacts } from "../../dashboard/src/server/artifact-reader.ts";
import { DocumentViewer } from "../../dashboard/src/features/document-viewer.js";
import { privateOrOutsideBlockedMessage, renderMarkdownToHtml } from "../../dashboard/src/lib/markdown.js";
import { createReferenceIndex } from "../../dashboard/src/lib/reference-resolver.js";
import type { DashboardDocument } from "../../dashboard/src/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

describe("dashboard Markdown and document viewer", () => {
	it("renders safe Markdown, fact links, and Shiki code fences", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const index = createReferenceIndex(artifacts);
		const markdown = [
			"# Title",
			"",
			"Uses [F001] and [F002].",
			"",
			"| Feature | Status |",
			"| --- | --- |",
			"| Tables | work |",
			"",
			"- [x] task lists",
			"",
			"```ts",
			"const safe = true",
			"```",
			"",
			"<script>alert('x')</script>",
		].join("\n");

		const rendered = await renderMarkdownToHtml(markdown, index);

		expect(rendered.html).toContain('data-reference="F001"');
		expect(rendered.html).toContain('data-reference-popover');
		expect(rendered.html).toContain('data-reference-status="resolved"');
		expect(rendered.html).toContain('href="/api/files?path=README.md"');
		expect(rendered.html).toContain('href="https://reactflow.dev/examples/overview"');
		expect(rendered.html).toContain("<table");
		expect(rendered.html).toContain('type="checkbox"');
		expect(rendered.html).toContain('data-code-viewer="shiki"');
		expect(rendered.html).toContain("const");
		expect(rendered.html).not.toContain("<script>");
		expect(rendered.html).not.toMatch(/data-reference="F001"[^>]*\btitle=/);
		expect(rendered.references[0]).toMatchObject({ input: "F001", status: "resolved" });
	});

	it("renders reference popover, removes native title, and preserves safe hrefs", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const index = createReferenceIndex(artifacts);
		const markdown = "Reference to [F001] and external https://reactflow.dev/examples/overview";
		const rendered = await renderMarkdownToHtml(markdown, index);
		expect(rendered.html).toContain('data-reference="F001"');
		expect(rendered.html).toContain('data-reference-popover="true"');
		expect(rendered.html).toContain('data-reference-status="resolved"');
		expect(rendered.html).toContain('aria-label=');
		// Popover content is portal-rendered; in SSR it is not part of the HTML string.
		expect(rendered.html).not.toContain("data-reference-popover-content");
		// The native title attribute is removed from reference anchors.
		expect(rendered.html).not.toMatch(/data-reference="F001"[^>]*\btitle=/);
		// External links should still target a new tab.
		expect(rendered.html).toContain('target="_blank"');
		expect(rendered.html).toContain('rel="noreferrer"');
	});

	it("renders missing and blocked reference popover markers without native title", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const index = createReferenceIndex(artifacts);
		const markdown = "Missing [F999] and blocked [.plan/_private/demo/raw.log](.plan/_private/demo/raw.log)";
		const rendered = await renderMarkdownToHtml(markdown, index);
		expect(rendered.html).toContain('data-reference="F999"');
		expect(rendered.html).toContain('data-reference-status="missing"');
		expect(rendered.html).toContain('data-reference-status="blocked"');
		expect(rendered.html).not.toMatch(/data-reference="F999"[^>]*\btitle=/);
	});

	it("keeps ordinary links without reference markers and without popover", async () => {
		const rendered = await renderMarkdownToHtml("[Ordinary link](https://example.com) and no popover");
		expect(rendered.html).toContain('href="https://example.com"');
		expect(rendered.html).toContain('target="_blank"');
		expect(rendered.html).not.toContain("data-reference-popover");
	});

	it("renders document preview/source controls and blocked states", async () => {
		const document: DashboardDocument = {
			id: "demo:proposal",
			kind: "proposal",
			path: ".plan/demo/proposal.md",
			topic: "demo",
			title: "Demo Proposal",
			content: "# Demo Proposal\n\nUses [F001].",
			sizeBytes: 32,
			warnings: [],
		};
		const rendered = await renderMarkdownToHtml(document.content);
		const html = renderToStaticMarkup(<DocumentViewer document={document} rendered={rendered} />);

		expect(html).toContain('data-document-viewer="ready"');
		expect(html).toContain("Copy path");
		expect(html).toContain("Preview");
		expect(html).toContain("Source");

		const blockedHtml = renderToStaticMarkup(
			<DocumentViewer document={{ ...document, path: ".plan/_private/demo/raw.log" }} />,
		);
		expect(blockedHtml).toContain('data-document-viewer="blocked"');
		expect(privateOrOutsideBlockedMessage("../outside.txt")).toContain("Outside-root");
	});
});
