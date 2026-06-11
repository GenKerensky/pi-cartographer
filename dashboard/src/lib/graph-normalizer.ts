import type { Edge, Node } from "@xyflow/react";
import type {
	AdrCollection,
	GraphEdge,
	GraphNode,
	JsonValue,
	ReceiptSummary,
	TopicArtifacts,
} from "../shared/models.js";

export type GraphLayer =
	| "map"
	| "facts"
	| "plan"
	| "requirements"
	| "design"
	| "receipts"
	| "context"
	| "evidence"
	| "adr";

export type NormalizedGraphNode = {
	id: string;
	originalId: string;
	label: string;
	type: string;
	layer: GraphLayer;
	status?: string;
	phaseId?: string;
	path?: string;
	warnings: string[];
	raw: GraphNode | ReceiptSummary | Record<string, unknown>;
};

export type NormalizedGraphEdge = {
	id: string;
	originalId: string;
	from: string;
	to: string;
	type: string;
	layer: GraphLayer;
	unresolved: boolean;
	warnings: string[];
	raw: GraphEdge | Record<string, unknown>;
};

export type NormalizedGraph = {
	nodes: NormalizedGraphNode[];
	edges: NormalizedGraphEdge[];
	unresolvedEdges: NormalizedGraphEdge[];
	layers: GraphLayer[];
	types: string[];
	relationships: string[];
};

export type GraphFilters = {
	layers?: GraphLayer[];
	types?: string[];
	relationships?: string[];
	query?: string;
	status?: string[];
};

export type HighlightChain = {
	nodeIds: Set<string>;
	edgeIds: Set<string>;
};

function layerForSource(source: string): GraphLayer {
	if (source.startsWith("fact")) return "facts";
	if (source.startsWith("plan")) return "plan";
	if (source.startsWith("requirements")) return "requirements";
	if (source.startsWith("design")) return "design";
	if (source.startsWith("adr")) return "adr";
	return "map";
}

function labelForNode(node: GraphNode): string {
	const rawLabel = node.label ?? node.raw.title ?? node.raw.name ?? node.raw.description ?? node.id;
	return typeof rawLabel === "string" ? rawLabel : node.id;
}

function pathForRaw(raw: Record<string, JsonValue | undefined>): string | undefined {
	const candidate = raw.path ?? raw.file ?? raw.source;
	return typeof candidate === "string" ? candidate : undefined;
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeGraphNode(node: GraphNode): NormalizedGraphNode {
	return {
		id: node.id,
		originalId: node.id,
		label: labelForNode(node),
		type: node.type,
		layer: layerForSource(node.source),
		status: node.status,
		phaseId: node.phaseId,
		path: pathForRaw(node.raw),
		warnings: [],
		raw: node,
	};
}

function normalizeGraphEdge(edge: GraphEdge, knownIds: Set<string>): NormalizedGraphEdge {
	const unresolved = !knownIds.has(edge.from) || !knownIds.has(edge.to);
	return {
		id: edge.id,
		originalId: edge.id,
		from: edge.from,
		to: edge.to,
		type: edge.type,
		layer: layerForSource(edge.source),
		unresolved,
		warnings: unresolved ? [`Unresolved endpoint: ${!knownIds.has(edge.from) ? edge.from : edge.to}`] : [],
		raw: edge,
	};
}

function validationIdsForReceipt(receipt: ReceiptSummary): string[] {
	const validationIds = receipt.raw.validation_ids;
	if (Array.isArray(validationIds)) return validationIds.filter((value): value is string => typeof value === "string");
	const verification = receipt.raw.verification;
	if (verification && typeof verification === "object" && !Array.isArray(verification)) {
		const validation = verification.validation;
		if (Array.isArray(validation)) return validation.filter((value): value is string => typeof value === "string");
	}
	return [];
}

function receiptNodesAndEdges(
	receipts: ReceiptSummary[],
	knownIds: Set<string>,
): { nodes: NormalizedGraphNode[]; edges: NormalizedGraphEdge[] } {
	const nodes: NormalizedGraphNode[] = [];
	const edges: NormalizedGraphEdge[] = [];
	for (const receipt of receipts) {
		nodes.push({
			id: receipt.id,
			originalId: receipt.id,
			label: receipt.summary ?? receipt.id,
			type: receipt.type ?? "receipt",
			layer: "receipts",
			status: receipt.status,
			phaseId: receipt.phaseId,
			warnings: [],
			raw: receipt,
		});
		knownIds.add(receipt.id);
	}
	for (const receipt of receipts) {
		const validationIds = validationIdsForReceipt(receipt);
		for (const validationId of validationIds) {
			const from = validationId.startsWith("validation:") ? validationId : `validation:${validationId}`;
			const unresolved = !knownIds.has(from);
			edges.push({
				id: `${from}->${receipt.id}`,
				originalId: `${from}->${receipt.id}`,
				from,
				to: receipt.id,
				type: "validated_by_receipt",
				layer: "receipts",
				unresolved,
				warnings: unresolved ? [`Unresolved endpoint: ${from}`] : [],
				raw: { from, to: receipt.id, type: "validated_by_receipt" },
			});
		}
		if (validationIds.length === 0 && receipt.phaseId) {
			const from = `phase:${receipt.phaseId}`;
			const unresolved = !knownIds.has(from);
			edges.push({
				id: `${from}->${receipt.id}`,
				originalId: `${from}->${receipt.id}`,
				from,
				to: receipt.id,
				type: "phase_receipt",
				layer: "receipts",
				unresolved,
				warnings: unresolved ? [`Unresolved endpoint: ${from}`] : [],
				raw: { from, to: receipt.id, type: "phase_receipt" },
			});
		}
	}
	return { nodes, edges };
}

function evidenceNodes(artifacts: TopicArtifacts): NormalizedGraphNode[] {
	return artifacts.evidence.files.map((file) => ({
		id: `evidence:${file.path}`,
		originalId: file.path,
		label: file.path.split("/").at(-1) ?? file.path,
		type: "evidence-file",
		layer: "evidence" as const,
		path: file.path,
		warnings: [],
		raw: file,
	}));
}

function contextNodes(artifacts: TopicArtifacts): NormalizedGraphNode[] {
	return artifacts.contextPacks.map((pack) => ({
		id: pack.id,
		originalId: pack.id,
		label: pack.summary ?? pack.id,
		type: "context-pack",
		layer: "context" as const,
		phaseId: pack.phaseId,
		warnings: [],
		raw: pack.raw,
	}));
}

function adrNodesAndEdges(adrs?: AdrCollection): { nodes: NormalizedGraphNode[]; edges: NormalizedGraphEdge[] } {
	if (!adrs) return { nodes: [], edges: [] };
	const nodes = adrs.adrs.map((adr) => ({
		id: adr.adrId ?? adr.id,
		originalId: adr.id,
		label: adr.title,
		type: "adr",
		layer: "adr" as const,
		status: adr.status,
		path: adr.path,
		warnings: [],
		raw: adr.raw ?? {},
	}));
	const known = new Set([...adrs.graph.nodes.map((node) => node.id), ...nodes.map((node) => node.id)]);
	const edges = adrs.graph.edges.map((edge) => normalizeGraphEdge(edge, known));
	return { nodes, edges };
}

export function normalizeTopicGraph(artifacts: TopicArtifacts, adrs?: AdrCollection): NormalizedGraph {
	const nodes = artifacts.graph.nodes.map(normalizeGraphNode);
	const knownIds = new Set(nodes.map((node) => node.id));
	const receiptGraph = receiptNodesAndEdges(artifacts.receipts, knownIds);
	const extraNodes = [...receiptGraph.nodes, ...contextNodes(artifacts), ...evidenceNodes(artifacts)];
	for (const node of extraNodes) knownIds.add(node.id);
	const adrGraph = adrNodesAndEdges(adrs);
	for (const node of adrGraph.nodes) knownIds.add(node.id);
	const edges = [
		...artifacts.graph.edges.map((edge) => normalizeGraphEdge(edge, knownIds)),
		...receiptGraph.edges,
		...adrGraph.edges,
	];
	const allNodes = [...nodes, ...extraNodes, ...adrGraph.nodes];
	return {
		nodes: allNodes,
		edges,
		unresolvedEdges: edges.filter((edge) => edge.unresolved),
		layers: unique(allNodes.map((node) => node.layer)) as GraphLayer[],
		types: unique(allNodes.map((node) => node.type)),
		relationships: unique(edges.map((edge) => edge.type)),
	};
}

export function filterNormalizedGraph(graph: NormalizedGraph, filters: GraphFilters): NormalizedGraph {
	const layerSet = new Set(filters.layers ?? graph.layers);
	const typeSet = new Set(filters.types ?? graph.types);
	const relationshipSet = new Set(filters.relationships ?? graph.relationships);
	const statusSet = new Set(filters.status ?? []);
	const query = filters.query?.trim().toLowerCase();
	const nodes = graph.nodes.filter((node) => {
		if (!layerSet.has(node.layer) || !typeSet.has(node.type)) return false;
		if (statusSet.size > 0 && (!node.status || !statusSet.has(node.status))) return false;
		if (!query) return true;
		return [node.id, node.label, node.type, node.status, node.path]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
			.includes(query);
	});
	const visibleIds = new Set(nodes.map((node) => node.id));
	const edges = graph.edges.filter(
		(edge) => relationshipSet.has(edge.type) && visibleIds.has(edge.from) && visibleIds.has(edge.to),
	);
	return {
		nodes,
		edges,
		unresolvedEdges: edges.filter((edge) => edge.unresolved),
		layers: unique(nodes.map((node) => node.layer)) as GraphLayer[],
		types: unique(nodes.map((node) => node.type)),
		relationships: unique(edges.map((edge) => edge.type)),
	};
}

export function buildHighlightChain(graph: NormalizedGraph, selectedId: string): HighlightChain {
	const nodeIds = new Set<string>([selectedId]);
	const edgeIds = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const edge of graph.edges) {
			if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) {
				if (!edgeIds.has(edge.id)) {
					edgeIds.add(edge.id);
					changed = true;
				}
				if (!nodeIds.has(edge.from)) {
					nodeIds.add(edge.from);
					changed = true;
				}
				if (!nodeIds.has(edge.to)) {
					nodeIds.add(edge.to);
					changed = true;
				}
			}
		}
	}
	return { nodeIds, edgeIds };
}

const layerX: Record<GraphLayer, number> = {
	map: 0,
	facts: 300,
	plan: 600,
	requirements: 750,
	design: 825,
	receipts: 900,
	context: 900,
	evidence: 1200,
	adr: 1200,
};

export function toReactFlowElements(
	graph: NormalizedGraph,
	highlighted?: HighlightChain,
): { nodes: Node[]; edges: Edge[] } {
	const layerCounts = new Map<GraphLayer, number>();
	const nodes: Node[] = graph.nodes.map((node) => {
		const index = layerCounts.get(node.layer) ?? 0;
		layerCounts.set(node.layer, index + 1);
		return {
			id: node.id,
			type: "cartographerNode",
			position: { x: layerX[node.layer], y: index * 96 },
			data: {
				label: node.label,
				type: node.type,
				layer: node.layer,
				status: node.status,
				highlighted: highlighted?.nodeIds.has(node.id) ?? false,
				warning: node.warnings.at(0),
			},
		};
	});
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges: Edge[] = graph.edges
		.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
		.map((edge) => ({
			id: edge.id,
			source: edge.from,
			target: edge.to,
			label: edge.type,
			animated: highlighted?.edgeIds.has(edge.id) ?? false,
			style: edge.unresolved ? { strokeDasharray: "6 4", stroke: "hsl(var(--destructive))" } : undefined,
		}));
	return { nodes, edges };
}
