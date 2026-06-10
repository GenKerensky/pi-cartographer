import { useMemo, useState } from "react";
import { Copy, FileWarning } from "lucide-react";
import type { DashboardDocument } from "../../../shared/models.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	collectMarkdownReferences,
	MarkdownPreview,
	privateOrOutsideBlockedMessage,
	type MarkdownRenderResult,
} from "@/lib/markdown";
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
			className="grid min-w-max grid-cols-[3rem_minmax(20rem,1fr)] gap-3 rounded px-2 py-0.5 hover:bg-muted/40"
		>
			<span className="select-none text-right text-muted-foreground">{index + 1}</span>
			<code>{line || " "}</code>
		</a>
	));
}

export function DocumentViewer({ document, referenceIndex, rendered }: DocumentViewerProps): React.JSX.Element {
	const [mode, setMode] = useState<"preview" | "source">("preview");
	const blocked = document ? privateOrOutsideBlockedMessage(document.path) : undefined;
	const computedRendered = useMemo(
		() => (document && !blocked ? collectMarkdownReferences(document.content, referenceIndex) : { references: [] }),
		[blocked, document, referenceIndex],
	);
	const referenceSummary = rendered ?? computedRendered;

	const warningCount = document?.warnings.length ?? 0;
	const title = document?.title ?? document?.path ?? "No document selected";
	const references = referenceSummary.references;

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
		<Card data-document-viewer="ready" id={`document-${document.kind}`} className="min-w-0">
			<CardHeader>
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div className="min-w-0">
						<CardTitle className="break-words">{title}</CardTitle>
						<CardDescription className="break-all">{document.path}</CardDescription>
					</div>
					<div className="flex shrink-0 flex-wrap gap-2">
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
			<CardContent className="min-w-0">
				<Tabs value={mode} onValueChange={(value) => setMode(value as "preview" | "source")}>
					<TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
						<TabsTrigger value="preview">Preview</TabsTrigger>
						<TabsTrigger value="source">Source</TabsTrigger>
					</TabsList>
					<TabsContent value="preview" className="space-y-4 pt-4">
						<article className="markdown-preview min-w-0 space-y-4 rounded-lg border bg-background/40 p-4 text-sm leading-7 break-words sm:text-base">
							<MarkdownPreview markdown={document.content} referenceIndex={referenceIndex} />
						</article>
						{references.length > 0 ? (
							<div className="flex flex-wrap gap-2" data-reference-summary>
								{references.map((reference) => (
									<a
										key={`${reference.input}:${reference.status}:${reference.href ?? ""}`}
										href={reference.href}
										target={reference.external ? "_blank" : undefined}
										rel={reference.external ? "noreferrer" : undefined}
										className="rounded-full focus-visible:ring-2 focus-visible:ring-ring"
									>
										<Badge variant={reference.status === "resolved" ? "success" : "warning"}>
											{reference.input}: {reference.status}
											{reference.sourceLabel ? ` → ${reference.sourceLabel}` : ""}
										</Badge>
									</a>
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
	return useMemo(
		() => (document ? collectMarkdownReferences(document.content, referenceIndex) : undefined),
		[document, referenceIndex],
	);
}
