import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeToHtml } from "shiki";
import type { ReferenceIndex, ResolvedReference } from "./reference-resolver.js";
import { extractReferenceTokens, referenceDomId, resolveReference } from "./reference-resolver.js";

export type MarkdownRenderResult = {
	references: ResolvedReference[];
};

type MarkdownAstNode = {
	type: string;
	value?: string;
	url?: string;
	title?: string | null;
	children?: MarkdownAstNode[];
};

const REFERENCE_TOKEN_RE =
	/\[([FS]\d+)\]|\b(phase:[A-Za-z0-9._:-]+|task:[A-Za-z0-9._:-]+|validation:[A-Za-z0-9._:-]+|ADR-\d{4})\b/gi;
const SKIP_REFERENCE_CHILDREN = new Set(["code", "inlineCode", "link", "linkReference", "definition"]);

function makeReferenceUrl(token: string): string {
	return `cartographer-ref:${encodeURIComponent(token)}`;
}

function splitReferenceText(value: string): MarkdownAstNode[] {
	const nodes: MarkdownAstNode[] = [];
	let cursor = 0;
	for (const match of value.matchAll(REFERENCE_TOKEN_RE)) {
		const index = match.index ?? 0;
		const token = match[1] ?? match[2];
		if (!token) continue;
		if (index > cursor) nodes.push({ type: "text", value: value.slice(cursor, index) });
		const visible = match[1] ? `[${token}]` : token;
		nodes.push({
			type: "link",
			url: makeReferenceUrl(token),
			title: null,
			children: [{ type: "text", value: visible }],
		});
		cursor = index + match[0].length;
	}
	if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
	return nodes.length > 0 ? nodes : [{ type: "text", value }];
}

function referenceLinkRemarkPlugin() {
	return (tree: MarkdownAstNode): void => {
		const visit = (node: MarkdownAstNode): void => {
			if (!node.children || SKIP_REFERENCE_CHILDREN.has(node.type)) return;
			const nextChildren: MarkdownAstNode[] = [];
			for (const child of node.children) {
				if (child.type === "text" && child.value) nextChildren.push(...splitReferenceText(child.value));
				else {
					visit(child);
					nextChildren.push(child);
				}
			}
			node.children = nextChildren;
		};
		visit(tree);
	};
}

function stripLineReference(value: string): string {
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("mailto:")) return value;
	return value.replace(/:\d+(?::\d+)?$/, "");
}

function isBlockedLocalPath(path: string): boolean {
	return path.includes(".plan/_private") || path.startsWith("..") || path.startsWith("/");
}

function localFileHref(path: string): string | undefined {
	const stripped = stripLineReference(path);
	if (isBlockedLocalPath(stripped)) return undefined;
	return `/api/files?path=${encodeURIComponent(stripped)}`;
}

function safeMarkdownHref(href: string | undefined): { href?: string; external?: boolean } {
	if (!href) return {};
	if (href.startsWith("#") || href.startsWith("/api/files?")) return { href, external: false };
	if (href.startsWith("http://") || href.startsWith("https://")) return { href, external: true };
	if (href.startsWith("mailto:")) return { href, external: true };
	if (href.startsWith("file://")) return {};
	return { href: localFileHref(href), external: false };
}

function markdownUrlTransform(url: string): string {
	if (url.startsWith("cartographer-ref:")) return url;
	return safeMarkdownHref(url).href ?? "#blocked-link";
}

function referenceTitle(reference: ResolvedReference): string {
	const parts = [
		reference.label,
		reference.sourceLabel ? `Source: ${reference.sourceLabel}` : undefined,
		reference.path,
	]
		.filter(Boolean)
		.join(" · ");
	return parts || reference.message || reference.input;
}

function referenceLinkProps(
	href: string | undefined,
	referenceIndex: ReferenceIndex | undefined,
): {
	href?: string;
	external?: boolean;
	reference?: ResolvedReference;
} {
	if (!href?.startsWith("cartographer-ref:")) return safeMarkdownHref(href);
	const token = decodeURIComponent(href.slice("cartographer-ref:".length));
	const reference = referenceIndex
		? resolveReference(token, referenceIndex)
		: ({
				input: token,
				kind: "file",
				status: "missing",
				message: `No reference index for ${token}`,
			} satisfies ResolvedReference);
	if (reference.status === "resolved" && reference.href)
		return { href: reference.href, external: reference.external, reference };
	return { href: `#${referenceDomId(reference.id ?? reference.input)}`, external: false, reference };
}

function escapeText(value: string): string {
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

function textFromChildren(children: React.ReactNode): string {
	if (typeof children === "string" || typeof children === "number") return String(children);
	if (Array.isArray(children)) return children.map((child) => textFromChildren(child)).join("");
	return "";
}

function ShikiCodeBlock({ code, lang }: { code: string; lang: string }): React.JSX.Element {
	const [html, setHtml] = useState<string | undefined>();
	useEffect(() => {
		let cancelled = false;
		void codeToHtml(code, {
			lang: lang || "text",
			themes: { light: "github-light", dark: "github-dark" },
			defaultColor: "dark",
		})
			.then((highlighted) => {
				if (!cancelled) {
					setHtml(
						highlighted.replace(
							"<pre",
							'<pre data-code-viewer="shiki" class="max-w-full overflow-x-auto rounded-lg p-4 text-sm"',
						),
					);
				}
			})
			.catch(() => {
				if (!cancelled) setHtml(undefined);
			});
		return () => {
			cancelled = true;
		};
	}, [code, lang]);

	if (html) {
		return (
			<div
				className="overflow-hidden rounded-lg border"
				data-code-viewer="shiki"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		);
	}
	return (
		<pre className="overflow-auto rounded-lg border bg-muted/40 p-4 text-sm" data-code-viewer="shiki">
			<code className={lang ? `language-${lang}` : undefined}>{code}</code>
		</pre>
	);
}

export function collectMarkdownReferences(markdown: string, index?: ReferenceIndex): MarkdownRenderResult {
	return { references: index ? extractReferenceTokens(markdown).map((token) => resolveReference(token, index)) : [] };
}

export function MarkdownPreview({
	markdown,
	referenceIndex,
}: {
	markdown: string;
	referenceIndex?: ReferenceIndex;
}): React.JSX.Element {
	const components = useMemo<Components>(
		() => ({
			a({ href, children, ...props }) {
				const link = referenceLinkProps(href, referenceIndex);
				const reference = link.reference;
				return (
					<a
						{...props}
						href={link.href}
						target={link.external ? "_blank" : undefined}
						rel={link.external ? "noreferrer" : undefined}
						className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
						data-reference={reference?.input}
						data-reference-status={reference?.status}
						data-reference-kind={reference?.kind}
						title={reference ? referenceTitle(reference) : undefined}
					>
						{children}
						{reference?.sourceLabel ? <span className="sr-only"> source {reference.sourceLabel}</span> : null}
					</a>
				);
			},
			h1({ children, ...props }) {
				return (
					<h1 id={slugify(textFromChildren(children))} className="mt-0 scroll-mt-24 text-3xl font-semibold" {...props}>
						{children}
					</h1>
				);
			},
			h2({ children, ...props }) {
				return (
					<h2
						id={slugify(textFromChildren(children))}
						className="scroll-mt-24 border-b pb-2 text-2xl font-semibold"
						{...props}
					>
						{children}
					</h2>
				);
			},
			h3({ children, ...props }) {
				return (
					<h3 id={slugify(textFromChildren(children))} className="scroll-mt-24 text-xl font-semibold" {...props}>
						{children}
					</h3>
				);
			},
			code({ className, children, ...props }) {
				const code = textFromChildren(children).replace(/\n$/, "");
				const match = /language-([A-Za-z0-9_-]+)/.exec(className ?? "");
				if (match) return <ShikiCodeBlock code={code} lang={match[1] ?? "text"} />;
				return (
					<code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em] text-foreground" {...props}>
						{children}
					</code>
				);
			},
			pre({ children }) {
				return <>{children}</>;
			},
			table({ children, ...props }) {
				return (
					<div className="min-w-0 max-w-full overflow-x-auto rounded-lg border">
						<table className="min-w-full text-sm" {...props}>
							{children}
						</table>
					</div>
				);
			},
			blockquote({ children, ...props }) {
				return (
					<blockquote
						className="rounded-r-lg border-l-4 border-primary/60 bg-muted/30 px-4 py-2 text-muted-foreground"
						{...props}
					>
						{children}
					</blockquote>
				);
			},
			input({ ...props }) {
				return <input {...props} disabled className="mr-2 align-middle" />;
			},
		}),
		[referenceIndex],
	);

	return (
		<Markdown
			components={components}
			remarkPlugins={[remarkGfm, referenceLinkRemarkPlugin]}
			urlTransform={markdownUrlTransform}
		>
			{markdown}
		</Markdown>
	);
}

export async function renderMarkdownToHtml(
	markdown: string,
	index?: ReferenceIndex,
): Promise<{ html: string; references: ResolvedReference[] }> {
	const references = collectMarkdownReferences(markdown, index).references;
	const { renderToStaticMarkup } = await import("react-dom/server");
	const html = renderToStaticMarkup(<MarkdownPreview markdown={markdown} referenceIndex={index} />);
	return { html: html.replace(/<script/gi, "&lt;script"), references };
}

export function privateOrOutsideBlockedMessage(path: string): string | undefined {
	if (path.includes(".plan/_private")) return "Private planning inputs are blocked.";
	if (path.startsWith("..") || path.startsWith("/")) return "Outside-root files are blocked.";
	return undefined;
}

export function escapeMarkdownTextForTest(value: string): string {
	return escapeText(value);
}
