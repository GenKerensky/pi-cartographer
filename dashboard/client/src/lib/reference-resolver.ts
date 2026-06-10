import type { AdrSummary, GraphNode, TopicArtifacts } from "../../../shared/models.js";

export type ReferenceKind = "fact" | "source" | "phase" | "task" | "validation" | "adr" | "file";
export type ReferenceStatus = "resolved" | "missing" | "ambiguous" | "blocked";

export type ResolvedReference = {
	input: string;
	kind: ReferenceKind;
	status: ReferenceStatus;
	id?: string;
	label?: string;
	path?: string;
	topic?: string;
	candidates?: string[];
	message?: string;
};

export type ReferenceIndex = {
	topic?: string;
	facts: Map<string, GraphNode>;
	sources: Map<string, GraphNode>;
	phases: Map<string, GraphNode>;
	tasks: Map<string, GraphNode>;
	validations: Map<string, GraphNode>;
	adrs: Map<string, AdrSummary>;
	files: Set<string>;
	shortFacts: Map<string, string[]>;
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

export function createReferenceIndex(topicArtifacts: TopicArtifacts): ReferenceIndex {
	const index: ReferenceIndex = {
		topic: topicArtifacts.topic.id,
		facts: new Map(),
		sources: new Map(),
		phases: new Map(),
		tasks: new Map(),
		validations: new Map(),
		adrs: new Map(),
		files: new Set(topicArtifacts.documents.map((document) => document.path)),
		shortFacts: new Map(),
	};
	for (const node of topicArtifacts.graph.nodes) {
		if (node.id.startsWith("F")) addNode(index.facts, node);
		if (node.id.startsWith("S")) addNode(index.sources, node);
		if (node.phaseId || node.id.startsWith("phase:")) addNode(index.phases, node);
		if (node.taskId || node.id.startsWith("task:")) addNode(index.tasks, node);
		if (node.validationId || node.id.startsWith("validation:")) addNode(index.validations, node);
		const sourcePath = maybeString(node.raw.reference) ?? maybeString(node.raw.path) ?? maybeString(node.raw.source);
		if (sourcePath) index.files.add(sourcePath.split(":").slice(0, -1).join(":") || sourcePath);
	}
	for (const file of topicArtifacts.evidence.files) index.files.add(file.path);
	for (const [id] of index.facts) {
		const short = normalizedShortFact(id);
		if (!short) continue;
		index.shortFacts.set(short, [...(index.shortFacts.get(short) ?? []), id]);
	}
	return index;
}

function resolvedNode(input: string, kind: ReferenceKind, node: GraphNode, topic?: string): ResolvedReference {
	return { input, kind, status: "resolved", id: node.id, label: nodeLabel(node), topic };
}

function resolveMap(
	input: string,
	kind: ReferenceKind,
	map: Map<string, GraphNode>,
	topic?: string,
): ResolvedReference {
	const node = map.get(input);
	if (!node) return { input, kind, status: "missing", message: `No ${kind} reference found for ${input}` };
	return resolvedNode(input, kind, node, topic);
}

export function resolveReference(input: string, index: ReferenceIndex): ResolvedReference {
	const trimmed = input.trim();
	if (trimmed.includes(".plan/_private")) {
		return { input: trimmed, kind: "file", status: "blocked", message: "Private planning inputs are not linkable" };
	}
	if (/^F\d+$/i.test(trimmed)) {
		if (index.facts.has(trimmed)) return resolveMap(trimmed, "fact", index.facts, index.topic);
		const short = normalizedShortFact(trimmed) ?? trimmed.toUpperCase();
		const candidates = index.shortFacts.get(short) ?? [];
		if (candidates.length === 1) {
			const candidate = candidates.at(0);
			if (candidate) return resolveMap(candidate, "fact", index.facts, index.topic);
		}
		if (candidates.length > 1) return { input: trimmed, kind: "fact", status: "ambiguous", candidates };
		return { input: trimmed, kind: "fact", status: "missing", message: `No fact reference found for ${trimmed}` };
	}
	if (/^S\d+$/i.test(trimmed)) return resolveMap(trimmed, "source", index.sources, index.topic);
	if (trimmed.startsWith("phase:")) return resolveMap(trimmed, "phase", index.phases, index.topic);
	if (trimmed.startsWith("task:")) return resolveMap(trimmed, "task", index.tasks, index.topic);
	if (trimmed.startsWith("validation:")) return resolveMap(trimmed, "validation", index.validations, index.topic);
	if (trimmed.startsWith("ADR-")) {
		const adr = index.adrs.get(trimmed);
		return adr
			? { input: trimmed, kind: "adr", status: "resolved", id: adr.adrId ?? adr.id, label: adr.title, path: adr.path }
			: { input: trimmed, kind: "adr", status: "missing", message: `No ADR reference found for ${trimmed}` };
	}
	if (index.files.has(trimmed))
		return { input: trimmed, kind: "file", status: "resolved", path: trimmed, label: trimmed };
	return { input: trimmed, kind: "file", status: "missing", message: `No file reference found for ${trimmed}` };
}

export function extractReferenceTokens(markdown: string): string[] {
	const tokens = new Set<string>();
	for (const match of markdown.matchAll(/\[([FS]\d+)\]/gi)) {
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
