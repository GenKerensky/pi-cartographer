import { useMemo, useState } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type NodeProps, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, GitBranch, Search } from "lucide-react";
import type { AdrCollection, TopicArtifacts } from "../../../shared/models.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	buildHighlightChain,
	filterNormalizedGraph,
	normalizeTopicGraph,
	toReactFlowElements,
	type GraphLayer,
	type NormalizedGraphNode,
} from "@/lib/graph-normalizer";
import { privateOrOutsideBlockedMessage } from "@/lib/markdown";

export type GraphExplorerProps = {
	artifacts: TopicArtifacts;
	adrs?: AdrCollection;
};

type CartographerNodeData = {
	label: string;
	type: string;
	layer: GraphLayer;
	status?: string;
	highlighted?: boolean;
	warning?: string;
};

const layerLabels: Record<GraphLayer, string> = {
	map: "Map",
	facts: "Facts",
	plan: "Plan",
	receipts: "Receipts",
	context: "Context",
	evidence: "Evidence",
	adr: "ADRs",
};

function layerVariant(layer: GraphLayer): "secondary" | "success" | "warning" | "outline" {
	if (layer === "facts") return "success";
	if (layer === "plan") return "secondary";
	if (layer === "receipts" || layer === "evidence") return "warning";
	return "outline";
}

function CartographerNode({ data, selected }: NodeProps<Node<CartographerNodeData>>): React.JSX.Element {
	return (
		<div
			className={`min-w-48 rounded-xl border bg-card/95 p-3 text-xs shadow-lg ${selected || data.highlighted ? "ring-2 ring-primary" : ""}`}
		>
			<Handle type="target" position={Position.Left} />
			<div className="flex items-center justify-between gap-2">
				<Badge variant={layerVariant(data.layer)}>{layerLabels[data.layer]}</Badge>
				{data.warning ? <AlertTriangle className="size-3 text-destructive" /> : null}
			</div>
			<p className="mt-2 line-clamp-3 font-medium">{data.label}</p>
			<div className="mt-2 flex flex-wrap gap-1 text-muted-foreground">
				<span>{data.type}</span>
				{data.status ? <span>· {data.status}</span> : null}
			</div>
			<Handle type="source" position={Position.Right} />
		</div>
	);
}

const nodeTypes = { cartographerNode: CartographerNode };

function toggle<T>(values: T[], value: T): T[] {
	return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function Inspector({ node }: { node?: NormalizedGraphNode }): React.JSX.Element {
	if (!node) {
		return (
			<Card data-graph-inspector="empty">
				<CardHeader>
					<CardTitle>Graph inspector</CardTitle>
					<CardDescription>Select a node to inspect references, files, status, and raw IDs.</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	const blocked = node.path ? privateOrOutsideBlockedMessage(node.path) : undefined;
	return (
		<Card data-graph-inspector="node">
			<CardHeader>
				<CardTitle>{node.label}</CardTitle>
				<CardDescription>{node.originalId}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<div className="flex flex-wrap gap-2">
					<Badge variant={layerVariant(node.layer)}>{layerLabels[node.layer]}</Badge>
					<Badge variant="outline">{node.type}</Badge>
					{node.status ? <Badge variant="secondary">{node.status}</Badge> : null}
				</div>
				{node.path ? (
					<div className="rounded-lg border bg-background/40 p-3">
						<p className="text-muted-foreground">Path</p>
						<p>{node.path}</p>
						{blocked ? (
							<Badge variant="destructive">{blocked}</Badge>
						) : (
							<Badge variant="success">safe route target</Badge>
						)}
					</div>
				) : null}
				{node.warnings.map((warning) => (
					<div key={warning} className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
						{warning}
					</div>
				))}
			</CardContent>
		</Card>
	);
}

export function GraphExplorer({ artifacts, adrs }: GraphExplorerProps): React.JSX.Element {
	const graph = useMemo(() => normalizeTopicGraph(artifacts, adrs), [adrs, artifacts]);
	const [query, setQuery] = useState("");
	const [layers, setLayers] = useState<GraphLayer[]>(graph.layers);
	const [selectedId, setSelectedId] = useState<string | undefined>();
	const selectedChain = selectedId ? buildHighlightChain(graph, selectedId) : undefined;
	const filtered = useMemo(() => filterNormalizedGraph(graph, { layers, query }), [graph, layers, query]);
	const flow = useMemo(() => toReactFlowElements(filtered, selectedChain), [filtered, selectedChain]);
	const selectedNode = graph.nodes.find((node) => node.id === selectedId);
	const canRenderCanvas = typeof window !== "undefined";

	return (
		<div className="grid gap-4 xl:grid-cols-[1fr_20rem]" data-graph-explorer>
			<Card className="min-w-0">
				<CardHeader>
					<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<GitBranch className="size-5" /> Graph explorer
							</CardTitle>
							<CardDescription>
								{filtered.nodes.length} nodes, {filtered.edges.length} edges, {graph.unresolvedEdges.length} unresolved
								endpoints.
							</CardDescription>
						</div>
						<Badge variant={graph.unresolvedEdges.length > 0 ? "warning" : "success"}>
							{graph.unresolvedEdges.length} unresolved
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
						<label className="relative flex-1">
							<Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
							<Input
								aria-label="Search graph"
								className="pl-9"
								placeholder="Search IDs, labels, paths, statuses..."
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</label>
						<div className="flex flex-wrap gap-2" aria-label="Graph layer filters">
							{graph.layers.map((layer) => (
								<Button
									key={layer}
									type="button"
									variant={layers.includes(layer) ? "secondary" : "outline"}
									size="sm"
									onClick={() => setLayers(toggle(layers, layer))}
								>
									{layerLabels[layer]}
								</Button>
							))}
						</div>
					</div>
					<Separator />
					{canRenderCanvas ? (
						<div className="h-[36rem] overflow-hidden rounded-xl border bg-background/50" data-react-flow-canvas>
							<ReactFlow
								nodes={flow.nodes}
								edges={flow.edges}
								nodeTypes={nodeTypes}
								fitView
								onNodeClick={(_event, node) => setSelectedId(node.id)}
								aria-label="Cartographer planning graph"
							>
								<MiniMap zoomable pannable />
								<Controls />
								<Background />
							</ReactFlow>
						</div>
					) : (
						<ScrollArea className="h-96 rounded-xl border bg-background/40 p-3" data-graph-static-list>
							<div className="space-y-2">
								{filtered.nodes.map((node) => (
									<button
										key={node.id}
										type="button"
										className="w-full rounded-lg border p-3 text-left hover:bg-muted/40"
										onClick={() => setSelectedId(node.id)}
									>
										<Badge variant={layerVariant(node.layer)}>{layerLabels[node.layer]}</Badge>
										<p className="mt-2 font-medium">{node.label}</p>
										<p className="text-xs text-muted-foreground">{node.id}</p>
									</button>
								))}
							</div>
						</ScrollArea>
					)}
					<div className="flex flex-wrap gap-2" data-graph-legend>
						{graph.relationships.slice(0, 12).map((relationship) => (
							<Badge key={relationship} variant="outline">
								{relationship}
							</Badge>
						))}
					</div>
				</CardContent>
			</Card>
			<Inspector node={selectedNode} />
		</div>
	);
}
