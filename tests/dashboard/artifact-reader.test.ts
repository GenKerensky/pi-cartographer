import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	discoverTopics,
	readAdrCollection,
	readIndexManifest,
	readSafeFile,
	readTopicArtifacts,
	readTopicGraph,
} from "../../dashboard/server/artifact-reader.ts";
import { PathSafetyError } from "../../dashboard/server/safety.ts";
import { createDashboardFixture } from "./fixtures.ts";

describe("dashboard artifact reader", () => {
	it("discovers topics and normalizes planning artifacts without leaking private paths", async () => {
		const fixture = createDashboardFixture();

		const discovered = await discoverTopics(fixture.root);
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const serialized = JSON.stringify(artifacts);

		expect(discovered.topics.map((topic) => topic.id)).toEqual([fixture.topic]);
		expect(artifacts.topic.counts.factNodes).toBe(4);
		expect(artifacts.documents.map((document) => document.kind)).toEqual(["proposal", "plan"]);
		expect(artifacts.graph.nodes.map((node) => node.id)).toContain("F001");
		expect(artifacts.graph.edges.map((edge) => edge.type)).toContain("supported_by");
		expect(artifacts.receipts[0].id).toBe("receipt:P0.V1");
		expect(artifacts.contextPacks[0].id).toBe("context:demo:P0");
		expect(artifacts.evidence.manifestRecords[0].path).toBe(".plan/_private/<redacted>");
		expect(serialized).not.toContain(`.plan/_private/${fixture.topic}/raw.log`);
		expect(artifacts.topic.warnings.some((issue) => issue.code.includes("private"))).toBe(true);
	});

	it("blocks outside-root and .plan/_private reads", async () => {
		const fixture = createDashboardFixture();

		await expect(readSafeFile(fixture.root, path.relative(fixture.root, fixture.outsideFile))).rejects.toBeInstanceOf(
			PathSafetyError,
		);
		await expect(readSafeFile(fixture.root, `.plan/_private/${fixture.topic}/raw.log`)).rejects.toMatchObject({
			code: "private-path",
		});
	});

	it("surfaces JSONL parse errors as graph health issues", async () => {
		const fixture = createDashboardFixture();
		fs.appendFileSync(path.join(fixture.root, ".plan", fixture.topic, "plan.nodes.jsonl"), "{bad json\n", "utf8");

		const graph = await readTopicGraph(fixture.root, fixture.topic);

		expect(graph.nodes.map((node) => node.id)).toContain("phase:P0");
		expect(graph.warnings).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "jsonl-parse-error", severity: "error" })]),
		);
	});

	it("reads index manifest and ADR graph/Markdown summaries", async () => {
		const fixture = createDashboardFixture();

		const indexManifest = await readIndexManifest(fixture.root);
		const adrs = await readAdrCollection(fixture.root);

		expect(indexManifest.present).toBe(true);
		expect(indexManifest.rootMatches).toBe(true);
		expect(indexManifest.counts?.files).toBe(3);
		expect(adrs.adrs[0]).toMatchObject({ adrId: "ADR-0001", title: "Test Dashboard", status: "accepted" });
		expect(adrs.graph.nodes[0].id).toBe("adr:0001");
	});
});
