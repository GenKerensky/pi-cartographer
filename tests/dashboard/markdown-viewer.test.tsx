import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readTopicArtifacts } from "../../dashboard/server/artifact-reader.ts";
import { DocumentViewer } from "../../dashboard/client/src/features/document-viewer.js";
import { privateOrOutsideBlockedMessage, renderMarkdownToHtml } from "../../dashboard/client/src/lib/markdown.js";
import { createReferenceIndex } from "../../dashboard/client/src/lib/reference-resolver.js";
import type { DashboardDocument } from "../../dashboard/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

describe("dashboard Markdown and document viewer", () => {
	it("renders safe Markdown, fact links, and Shiki code fences", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const index = createReferenceIndex(artifacts);
		const markdown = "# Title\n\nUses [F001].\n\n```ts\nconst safe = true\n```\n\n<script>alert('x')</script>";

		const rendered = await renderMarkdownToHtml(markdown, index);

		expect(rendered.html).toContain('data-reference="F001"');
		expect(rendered.html).toContain('data-code-viewer="shiki"');
		expect(rendered.html).toContain("const");
		expect(rendered.html).not.toContain("<script>");
		expect(rendered.references[0]).toMatchObject({ input: "F001", status: "resolved" });
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
