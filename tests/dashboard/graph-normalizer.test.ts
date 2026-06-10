import { describe, expect, it } from "vitest";
import { readTopicArtifacts } from "../../dashboard/server/artifact-reader.ts";
import type { AdrCollection, TopicArtifacts } from "../../dashboard/shared/models.ts";
import {
	buildHighlightChain,
	filterNormalizedGraph,
	normalizeTopicGraph,
	toReactFlowElements,
} from "../../dashboard/client/src/lib/graph-normalizer.js";
import { createDashboardFixture } from "./fixtures.ts";

function adrFixture(): AdrCollection {
	return {
		adrs: [
			{
				id: "adr:0001",
				adrId: "ADR-0001",
				number: 1,
				title: "Use local dashboard",
				status: "accepted",
				path: "docs/adr/0001-use-local-dashboard.md",
				domains: ["dashboard"],
				keywords: ["local"],
				raw: {},
			},
		],
		graph: {
			nodes: [],
			edges: [{ id: "adr-edge:1", from: "ADR-0001", to: "phase:P0", type: "related_to", source: "adr.edges", raw: {} }],
			warnings: [],
		},
		warnings: [],
	};
}

describe("dashboard graph normalizer", () => {
	it("normalizes topic graph records, receipts, evidence, context packs, and ADRs", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const graph = normalizeTopicGraph(artifacts, adrFixture());

		expect(graph.nodes.some((node) => node.id === "F001" && node.layer === "facts")).toBe(true);
		expect(graph.nodes.some((node) => node.layer === "receipts")).toBe(true);
		expect(graph.nodes.some((node) => node.layer === "evidence")).toBe(true);
		expect(graph.nodes.some((node) => node.layer === "context")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "ADR-0001" && node.layer === "adr")).toBe(true);
		expect(graph.edges.some((edge) => edge.layer === "receipts")).toBe(true);
		expect(graph.relationships).toContain("related_to");
	});

	it("preserves unresolved endpoint warnings and original IDs", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const withBrokenEdge: TopicArtifacts = {
			...artifacts,
			graph: {
				...artifacts.graph,
				edges: [
					...artifacts.graph.edges,
					{ id: "broken-edge", from: "F001", to: "missing-node", type: "supports", source: "facts.edges", raw: {} },
				],
			},
		};
		const graph = normalizeTopicGraph(withBrokenEdge);

		expect(graph.unresolvedEdges).toHaveLength(1);
		expect(graph.unresolvedEdges[0]).toMatchObject({ id: "broken-edge", originalId: "broken-edge", unresolved: true });
		expect(graph.unresolvedEdges[0]?.warnings[0]).toContain("missing-node");
	});

	it("filters graph records and builds React Flow/highlight elements", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const graph = normalizeTopicGraph(artifacts);
		const filtered = filterNormalizedGraph(graph, { query: "F001", layers: ["facts"] });
		const chain = buildHighlightChain(graph, "F001");
		const flow = toReactFlowElements(filtered, chain);

		expect(filtered.nodes.every((node) => node.layer === "facts")).toBe(true);
		expect(filtered.nodes.some((node) => node.id === "F001")).toBe(true);
		expect(chain.nodeIds.has("F001")).toBe(true);
		expect(flow.nodes.every((node) => node.type === "cartographerNode")).toBe(true);
	});
});
