import { codeToHtml } from "shiki";
import type { ReferenceIndex, ResolvedReference } from "./reference-resolver.js";
import { extractReferenceTokens, resolveReference } from "./reference-resolver.js";

export type MarkdownRenderResult = {
	html: string;
	references: ResolvedReference[];
};

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function renderInline(text: string, index?: ReferenceIndex): string {
	let output = escapeHtml(text);
	output = output.replace(/`([^`]+)`/g, (_match, code: string) => `<code>${escapeHtml(code)}</code>`);
	output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	if (index) {
		output = output.replace(/\[([FS]\d+)\]/gi, (_match, token: string) => {
			const reference = resolveReference(token, index);
			const status = reference.status === "resolved" ? "resolved" : reference.status;
			return `<a href="#ref-${escapeHtml(token)}" data-reference="${escapeHtml(token)}" data-reference-status="${status}">[${escapeHtml(token)}]</a>`;
		});
	}
	return output;
}

async function renderCodeFence(code: string, lang: string): Promise<string> {
	const highlighted = await codeToHtml(code, {
		lang: lang || "text",
		themes: { light: "github-light", dark: "github-dark" },
		defaultColor: "dark",
	});
	const lines = highlighted.replace("<pre", '<pre data-code-viewer="shiki"').split("\n");
	return lines
		.map((line, index) =>
			line.includes("<span") ? `<span id="L${index + 1}" data-line="${index + 1}">${line}</span>` : line,
		)
		.join("\n");
}

export async function renderMarkdownToHtml(markdown: string, index?: ReferenceIndex): Promise<MarkdownRenderResult> {
	const references = index ? extractReferenceTokens(markdown).map((token) => resolveReference(token, index)) : [];
	const blocks: string[] = [];
	const lines = markdown.split(/\r?\n/);
	let paragraph: string[] = [];
	let listItems: string[] = [];
	let inFence = false;
	let fenceLang = "text";
	let fenceLines: string[] = [];

	const flushParagraph = (): void => {
		if (paragraph.length === 0) return;
		blocks.push(`<p>${renderInline(paragraph.join(" "), index)}</p>`);
		paragraph = [];
	};
	const flushList = (): void => {
		if (listItems.length === 0) return;
		blocks.push(`<ul>${listItems.map((item) => `<li>${renderInline(item, index)}</li>`).join("")}</ul>`);
		listItems = [];
	};

	for (const line of lines) {
		const fence = line.match(/^```\s*([A-Za-z0-9_-]*)\s*$/);
		if (fence) {
			if (inFence) {
				blocks.push(await renderCodeFence(fenceLines.join("\n"), fenceLang));
				fenceLines = [];
				inFence = false;
				fenceLang = "text";
			} else {
				flushParagraph();
				flushList();
				inFence = true;
				fenceLang = fence[1] || "text";
			}
			continue;
		}
		if (inFence) {
			fenceLines.push(line);
			continue;
		}
		if (line.trim().length === 0) {
			flushParagraph();
			flushList();
			continue;
		}
		const heading = line.match(/^(#{1,4})\s+(.+)$/);
		if (heading) {
			flushParagraph();
			flushList();
			const marker = heading.at(1);
			const label = heading.at(2);
			if (!marker || !label) continue;
			const level = marker.length;
			blocks.push(`<h${level} id="${slugify(label)}">${renderInline(label, index)}</h${level}>`);
			continue;
		}
		const list = line.match(/^[-*]\s+(.+)$/);
		if (list) {
			flushParagraph();
			const item = list.at(1);
			if (item) listItems.push(item);
			continue;
		}
		paragraph.push(line.trim());
	}
	flushParagraph();
	flushList();
	if (inFence) blocks.push(await renderCodeFence(fenceLines.join("\n"), fenceLang));
	return { html: blocks.join("\n"), references };
}

export function privateOrOutsideBlockedMessage(path: string): string | undefined {
	if (path.includes(".plan/_private")) return "Private planning inputs are blocked.";
	if (path.startsWith("..") || path.startsWith("/")) return "Outside-root files are blocked.";
	return undefined;
}
