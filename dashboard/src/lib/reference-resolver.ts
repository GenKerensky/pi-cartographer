import type { AdrCollection, AdrSummary, GraphNode, TopicArtifacts } from "../shared/models.js";

export type ReferenceKind =
	| "fact"
	| "source"
	| "requirement"
	| "design"
	| "phase"
	| "task"
	| "validation"
	| "adr"
	| "file";
export type ReferenceStatus = "resolved" | "missing" | "ambiguous" | "blocked";

export type ResolvedReference = {
	input: string;
	kind: ReferenceKind;
	status: ReferenceStatus;
	id?: string;
	label?: string;
	path?: string;
	topic?: string;
	href?: string;
	external?: boolean;
	sourceId?: string;
	sourceLabel?: string;
	candidates?: string[];
	message?: string;
};

export type ReferenceIndex = {
	topic?: string;
	facts: Map<string, GraphNode>;
	sources: Map<string, GraphNode>;
	requirements: Map<string, GraphNode>;
	designs: Map<string, GraphNode>;
	phases: Map<string, GraphNode>;
	tasks: Map<string, GraphNode>;
	validations: Map<string, GraphNode>;
	adrs: Map<string, AdrSummary>;
	files: Set<string>;
	shortFacts: Map<string, string[]>;
	supportingSources: Map<string, GraphNode[]>;
};

function nodeLabel(node: GraphNode): string {
	return node.label ?? node.id;
}

function normalizedShortFact(id: string): string | undefined {
	const match = id.match(/^F0*([1-9]\d*)$/i);
	return match ? `F${Number(match[1])}` : undefined;
}

function maybeString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function addNode(map: Map<string, GraphNode>, node: GraphNode): void {
	map.set(node.id, node);
}

function stripLineReference(value: string): string {
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("mailto:")) return value;
	return value.replace(/:\d+(?::\d+)?$/, "");
}

function isPrivateOrOutsidePath(path: string): boolean {
	return path.includes(".plan/_private") || path.startsWith("..") || path.startsWith("/");
}

function safeFileHref(path: string): string | undefined {
	const stripped = stripLineReference(path);
	if (isPrivateOrOutsidePath(stripped)) return undefined;
	return `/api/files?path=${encodeURIComponent(stripped)}`;
}

function fileUrlToRelativePath(url: string): string | undefined {
	if (!url.startsWith("file://")) return undefined;
	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(url).pathname);
	} catch {
		return undefined;
	}
	const markers = ["/.plan/", "/docs/", "/skills/", "/dashboard/", "/tests/", "/README.md", "/package.json"];
	for (const marker of markers) {
		const index = pathname.indexOf(marker);
		if (index < 0) continue;
		return marker.startsWith("/") ? pathname.slice(index + 1) : pathname.slice(index);
	}
	return undefined;
}

function nodeSourcePath(node: GraphNode): string | undefined {
	const reference = maybeString(node.raw.reference);
	if (reference) return stripLineReference(reference);
	const path = maybeString(node.raw.path);
	if (path) return stripLineReference(path);
	const source = maybeString(node.raw.source);
	if (source && source !== "manual" && source !== "index" && source !== "plan.md") return stripLineReference(source);
	const url = maybeString(node.raw.url);
	return url ? fileUrlToRelativePath(url) : undefined;
}

function nodeHref(node: GraphNode): { href?: string; external?: boolean; path?: string } {
	const url = maybeString(node.raw.url);
	if (url?.startsWith("http://") || url?.startsWith("https://")) return { href: url, external: true };
	const path = nodeSourcePath(node);
	if (!path) return {};
	return { href: safeFileHref(path), external: false, path };
}

function referenceAnchor(id: string): string {
	return `#ref-${encodeURIComponent(id)}`;
}

export function referenceDomId(id: string): string {
	return `ref-${id.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

export function createReferenceIndex(topicArtifacts: TopicArtifacts, adrs?: AdrCollection): ReferenceIndex {
	const index: ReferenceIndex = {
		topic: topicArtifacts.topic.id,
		facts: new Map(),
		sources: new Map(),
		requirements: new Map(),
		designs: new Map(),
		phases: new Map(),
		tasks: new Map(),
		validations: new Map(),
		adrs: new Map(),
		files: new Set(topicArtifacts.documents.map((document) => document.path)),
		shortFacts: new Map(),
		supportingSources: new Map(),
	};
	for (const adr of adrs?.adrs ?? []) {
		index.adrs.set(adr.adrId ?? adr.id, adr);
		index.adrs.set(adr.id, adr);
	}
	for (const node of topicArtifacts.graph.nodes) {
		if (node.id.startsWith("F")) addNode(index.facts, node);
		if (node.id.startsWith("S")) addNode(index.sources, node);
		if (/^(REQ|SCN|AC)-/.test(node.id)) addNode(index.requirements, node);
		if (node.id.startsWith("DES-")) addNode(index.designs, node);
		if (node.phaseId || node.id.startsWith("phase:")) addNode(index.phases, node);
		if (node.taskId || node.id.startsWith("task:")) addNode(index.tasks, node);
		if (node.validationId || node.id.startsWith("validation:")) addNode(index.validations, node);
		const sourcePath = nodeSourcePath(node);
		if (sourcePath && !isPrivateOrOutsidePath(sourcePath)) index.files.add(sourcePath);
	}
	for (const edge of topicArtifacts.graph.edges) {
		if (edge.type !== "supported_by") continue;
		const source = index.sources.get(edge.to);
		if (!source) continue;
		index.supportingSources.set(edge.from, [...(index.supportingSources.get(edge.from) ?? []), source]);
	}
	for (const file of topicArtifacts.evidence.files) index.files.add(file.path);
	for (const [id] of index.facts) {
		const short = normalizedShortFact(id);
		if (!short) continue;
		index.shortFacts.set(short, [...(index.shortFacts.get(short) ?? []), id]);
	}
	return index;
}

function resolvedNode(input: string, kind: ReferenceKind, node: GraphNode, index: ReferenceIndex): ResolvedReference {
	const ownLink = nodeHref(node);
	const supportingSource =
		kind === "fact" ? index.supportingSources.get(node.id)?.find((source) => nodeHref(source).href) : undefined;
	const sourceLink = supportingSource ? nodeHref(supportingSource) : undefined;
	const href = sourceLink?.href ?? ownLink.href ?? referenceAnchor(node.id);
	return {
		input,
		kind,
		status: "resolved",
		id: node.id,
		label: nodeLabel(node),
		topic: index.topic,
		href,
		external: sourceLink?.external ?? ownLink.external ?? false,
		path: sourceLink?.path ?? ownLink.path,
		sourceId: supportingSource?.id,
		sourceLabel: supportingSource ? nodeLabel(supportingSource) : undefined,
	};
}

function resolveMap(
	input: string,
	kind: ReferenceKind,
	map: Map<string, GraphNode>,
	index: ReferenceIndex,
): ResolvedReference {
	const node = map.get(input);
	if (!node) return { input, kind, status: "missing", message: `No ${kind} reference found for ${input}` };
	return resolvedNode(input, kind, node, index);
}

export function resolveReference(input: string, index: ReferenceIndex): ResolvedReference {
	const trimmed = input.trim();
	if (trimmed.includes(".plan/_private")) {
		return { input: trimmed, kind: "file", status: "blocked", message: "Private planning inputs are not linkable" };
	}
	if (/^F\d+$/i.test(trimmed)) {
		if (index.facts.has(trimmed)) return resolveMap(trimmed, "fact", index.facts, index);
		const short = normalizedShortFact(trimmed) ?? trimmed.toUpperCase();
		const candidates = index.shortFacts.get(short) ?? [];
		if (candidates.length === 1) {
			const candidate = candidates.at(0);
			if (candidate) return resolveMap(candidate, "fact", index.facts, index);
		}
		if (candidates.length > 1) return { input: trimmed, kind: "fact", status: "ambiguous", candidates };
		return { input: trimmed, kind: "fact", status: "missing", message: `No fact reference found for ${trimmed}` };
	}
	if (/^S\d+$/i.test(trimmed)) return resolveMap(trimmed, "source", index.sources, index);
	if (/^(REQ|SCN|AC)-[A-Z0-9_.-]+$/i.test(trimmed))
		return resolveMap(trimmed.toUpperCase(), "requirement", index.requirements, index);
	if (/^DES-[A-Z0-9_.-]+$/i.test(trimmed)) return resolveMap(trimmed.toUpperCase(), "design", index.designs, index);
	if (trimmed.startsWith("phase:")) return resolveMap(trimmed, "phase", index.phases, index);
	if (trimmed.startsWith("task:")) return resolveMap(trimmed, "task", index.tasks, index);
	if (trimmed.startsWith("validation:")) return resolveMap(trimmed, "validation", index.validations, index);
	if (trimmed.startsWith("ADR-")) {
		const adr = index.adrs.get(trimmed);
		if (!adr)
			return { input: trimmed, kind: "adr", status: "missing", message: `No ADR reference found for ${trimmed}` };
		const href = adr.path ? safeFileHref(adr.path) : referenceAnchor(adr.id);
		return {
			input: trimmed,
			kind: "adr",
			status: "resolved",
			id: adr.adrId ?? adr.id,
			label: adr.title,
			path: adr.path,
			href,
		};
	}
	if (index.files.has(stripLineReference(trimmed))) {
		const path = stripLineReference(trimmed);
		return { input: trimmed, kind: "file", status: "resolved", path, label: path, href: safeFileHref(path) };
	}
	return { input: trimmed, kind: "file", status: "missing", message: `No file reference found for ${trimmed}` };
}

export function extractReferenceTokens(markdown: string): string[] {
	const tokens = new Set<string>();
	for (const match of markdown.matchAll(/\[((?:[FS]\d+)|(?:(?:REQ|SCN|AC|DES)-[A-Z0-9_.-]+))\]/gi)) {
		const token = match.at(1);
		if (token) tokens.add(token);
	}
	for (const match of markdown.matchAll(
		/\b(phase:[A-Za-z0-9._:-]+|task:[A-Za-z0-9._:-]+|validation:[A-Za-z0-9._:-]+|ADR-\d{4})\b/g,
	)) {
		const token = match.at(1);
		if (token) tokens.add(token);
	}
	return [...tokens];
}
