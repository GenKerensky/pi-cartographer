import { useEffect, useMemo, useState } from "react";
import { Copy, FileWarning } from "lucide-react";
import type { DashboardDocument } from "../../../shared/models.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { privateOrOutsideBlockedMessage, renderMarkdownToHtml, type MarkdownRenderResult } from "@/lib/markdown";
import type { ReferenceIndex } from "@/lib/reference-resolver";

export type DocumentViewerProps = {
	document?: DashboardDocument;
	referenceIndex?: ReferenceIndex;
	rendered?: MarkdownRenderResult;
};

function numberedSource(content: string): React.JSX.Element[] {
	return content.split(/\r?\n/).map((line, index) => (
		<a
			key={index}
			id={`L${index + 1}`}
			href={`#L${index + 1}`}
			className="grid grid-cols-[3rem_1fr] gap-3 rounded px-2 py-0.5 hover:bg-muted/40"
		>
			<span className="select-none text-right text-muted-foreground">{index + 1}</span>
			<code>{line || " "}</code>
		</a>
	));
}

export function DocumentViewer({ document, referenceIndex, rendered }: DocumentViewerProps): React.JSX.Element {
	const [mode, setMode] = useState<"preview" | "source">("preview");
	const [asyncRendered, setAsyncRendered] = useState<MarkdownRenderResult | undefined>(rendered);
	const blocked = document ? privateOrOutsideBlockedMessage(document.path) : undefined;

	useEffect(() => {
		let cancelled = false;
		if (!document || rendered || blocked) return undefined;
		void renderMarkdownToHtml(document.content, referenceIndex).then((result) => {
			if (!cancelled) setAsyncRendered(result);
		});
		return () => {
			cancelled = true;
		};
	}, [blocked, document, referenceIndex, rendered]);

	const warningCount = document?.warnings.length ?? 0;
	const title = document?.title ?? document?.path ?? "No document selected";
	const previewHtml = asyncRendered?.html ?? "<p>Rendering preview…</p>";
	const references = asyncRendered?.references ?? [];

	if (!document) {
		return (
			<Card data-document-viewer="empty">
				<CardHeader>
					<CardTitle>No document selected</CardTitle>
					<CardDescription>Select a proposal, plan, evidence, or file to inspect.</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (blocked) {
		return (
			<Card data-document-viewer="blocked">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileWarning className="size-5 text-destructive" />
						Blocked file
					</CardTitle>
					<CardDescription>{blocked}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card data-document-viewer="ready">
			<CardHeader>
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<CardTitle>{title}</CardTitle>
						<CardDescription>{document.path}</CardDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge variant={warningCount > 0 ? "warning" : "success"}>{warningCount} warnings</Badge>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void navigator.clipboard?.writeText(document.path)}
						>
							<Copy className="size-4" /> Copy path
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<Tabs value={mode} onValueChange={(value) => setMode(value as "preview" | "source")}>
					<TabsList>
						<TabsTrigger value="preview">Preview</TabsTrigger>
						<TabsTrigger value="source">Source</TabsTrigger>
					</TabsList>
					<TabsContent value="preview" className="space-y-4 pt-4">
						<article
							className="prose prose-invert max-w-none rounded-lg border bg-background/40 p-4"
							dangerouslySetInnerHTML={{ __html: previewHtml }}
						/>
						{references.length > 0 ? (
							<div className="grid gap-2" data-reference-summary>
								{references.map((reference) => (
									<Badge
										key={`${reference.input}:${reference.status}`}
										variant={reference.status === "resolved" ? "success" : "warning"}
									>
										{reference.input}: {reference.status}
									</Badge>
								))}
							</div>
						) : null}
					</TabsContent>
					<TabsContent value="source" className="pt-4">
						<pre
							className="max-h-[36rem] overflow-auto rounded-lg border bg-background/70 p-2 text-xs leading-6"
							data-source-view
						>
							{numberedSource(document.content)}
						</pre>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

export function useRenderedMarkdown(
	document: DashboardDocument | undefined,
	referenceIndex?: ReferenceIndex,
): MarkdownRenderResult | undefined {
	const [rendered, setRendered] = useState<MarkdownRenderResult | undefined>();
	const key = useMemo(() => `${document?.path ?? ""}:${document?.content.length ?? 0}`, [document]);
	useEffect(() => {
		let cancelled = false;
		setRendered(undefined);
		if (!document) return undefined;
		void renderMarkdownToHtml(document.content, referenceIndex).then((result) => {
			if (!cancelled) setRendered(result);
		});
		return () => {
			cancelled = true;
		};
	}, [document, key, referenceIndex]);
	return rendered;
}
