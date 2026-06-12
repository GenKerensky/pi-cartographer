import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type DashboardFixture = {
	root: string;
	topic: string;
	outsideFile: string;
	privateFile: string;
};

function writeJsonl(filePath: string, records: Record<string, unknown>[]): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

export function createDashboardFixture(topic = "demo"): DashboardFixture {
	const parent = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-dashboard-"));
	const root = path.join(parent, "repo");
	const topicDir = path.join(root, ".plan", topic);
	const evidenceDir = path.join(topicDir, "evidence");
	const privateDir = path.join(root, ".plan", "_private", topic);
	const indexDir = path.join(root, ".plan", "_index");
	const adrGraphDir = path.join(root, "docs", "adr", "_graph");
	fs.mkdirSync(evidenceDir, { recursive: true });
	fs.mkdirSync(privateDir, { recursive: true });
	fs.mkdirSync(indexDir, { recursive: true });
	fs.mkdirSync(adrGraphDir, { recursive: true });

	fs.writeFileSync(path.join(root, "README.md"), "# Fixture repo\n", "utf8");
	fs.writeFileSync(path.join(topicDir, "proposal.md"), "# Demo Proposal\n\nUses [F001] and [F002].\n", "utf8");
	fs.writeFileSync(
		path.join(topicDir, "requirements.md"),
		"# Demo Requirements\n\nImplements [REQ-DEMO-001].\n",
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "design.md"),
		"# Demo Design\n\n## Decision One\n\nSatisfies [REQ-DEMO-001].\n",
		"utf8",
	);
	fs.writeFileSync(path.join(topicDir, "plan.md"), "# Demo Plan\n\n### Phase P0 — Build\n", "utf8");
	const privateFile = path.join(privateDir, "raw.log");
	fs.writeFileSync(privateFile, "secret raw artifact\n", "utf8");

	writeJsonl(path.join(topicDir, "map.nodes.jsonl"), [
		{ id: `topic:${topic}`, type: "topic", title: "Demo topic", lifecycle: "planned" },
	]);
	writeJsonl(path.join(topicDir, "map.edges.jsonl"), [{ from: `topic:${topic}`, to: "phase:P0", type: "contains" }]);
	writeJsonl(path.join(topicDir, "facts.nodes.jsonl"), [
		{ id: "S001", type: "source", title: "README", reference: "README.md:1" },
		{
			id: "S002",
			type: "source",
			title: "React Flow docs",
			url: "https://reactflow.dev/examples/overview",
		},
		{ id: "F001", type: "fact", title: "Fact", raw_archive_path: `.plan/_private/${topic}/raw.log` },
		{ id: "F002", type: "fact", title: "External graph source" },
	]);
	writeJsonl(path.join(topicDir, "facts.edges.jsonl"), [
		{ from: "F001", to: "S001", type: "supported_by" },
		{ from: "F002", to: "S002", type: "supported_by" },
	]);
	writeJsonl(path.join(topicDir, "plan.nodes.jsonl"), [
		{ id: "phase:P0", type: "phase", phase_id: "P0", status: "in-progress", title: "Build" },
		{ id: "task:P0.T1", type: "task", task_id: "P0.T1", phase_id: "P0", title: "Task" },
	]);
	writeJsonl(path.join(topicDir, "plan.edges.jsonl"), [{ from: "phase:P0", to: "task:P0.T1", type: "contains" }]);
	writeJsonl(path.join(topicDir, "requirements.nodes.jsonl"), [
		{
			id: "REQ-DEMO-001",
			type: "requirement",
			title: "Demo requirement",
			statement: "The system MUST expose requirements in dashboard fixtures.",
			change_type: "ADDED",
			domain: "dashboard",
			priority: "must",
			status: "accepted",
		},
	]);
	writeJsonl(path.join(topicDir, "requirements.edges.jsonl"), [
		{ from: "REQ-DEMO-001", to: "F001", type: "supported_by" },
	]);
	writeJsonl(path.join(topicDir, "design.nodes.jsonl"), [
		{
			id: "DES-DEMO-001",
			type: "design-decision",
			status: "accepted",
			title: "Show requirements",
			summary: "Dashboard graph includes requirements and design layers.",
			source: "design.md#decision-one",
			requirement_refs: ["REQ-DEMO-001"],
		},
	]);
	writeJsonl(path.join(topicDir, "design.edges.jsonl"), [
		{ from: "DES-DEMO-001", to: "REQ-DEMO-001", type: "satisfies" },
	]);
	writeJsonl(path.join(topicDir, "receipts.jsonl"), [
		{
			id: "receipt:P0.V1",
			type: "validation-receipt",
			status: "passed",
			phase_id: "P0",
			summary: "Tests passed",
			commands: [{ command: "npm run test:ts", result: "passed", output: `.plan/_private/${topic}/out.log` }],
		},
	]);
	writeJsonl(path.join(topicDir, "context-packs.jsonl"), [
		{
			id: "context:demo:P0",
			type: "context-pack",
			phase_id: "P0",
			summary: "Compact context",
			budget_tokens: 1000,
			references: ["README.md:1", `.plan/_private/${topic}/raw.log`],
			verified_files: ["README.md"],
		},
	]);
	fs.writeFileSync(
		path.join(evidenceDir, "analysis.md"),
		"# Evidence Analysis\n\n## Source Handling\n- Redaction status: passed\n",
		"utf8",
	);
	writeJsonl(path.join(evidenceDir, "manifest.jsonl"), [
		{ id: "evidence:1", path: `.plan/_private/${topic}/raw.log`, summary: "Imported and sanitized" },
	]);

	fs.writeFileSync(
		path.join(indexDir, "project-graph-manifest.json"),
		JSON.stringify(
			{
				generated_at: "2026-06-09T00:00:00.000Z",
				root,
				database: ".plan/_index/project-index.sqlite",
				schema_version: 1,
				counts: { files: 3, nodes: 2, edges: 1 },
				settings: { scope: "fixture" },
			},
			null,
			2,
		) + "\n",
		"utf8",
	);

	fs.writeFileSync(
		path.join(root, "docs", "adr", "0001-test-dashboard.md"),
		[
			"---",
			"adr_id: ADR-0001",
			"status: accepted",
			"decision_date: 2026-06-09",
			"domains: [dashboard]",
			"keywords: [read-only]",
			"---",
			"",
			"# ADR-0001: Test Dashboard",
			"",
			"## Decision",
			"Use a read-only dashboard fixture.",
		].join("\n"),
		"utf8",
	);
	writeJsonl(path.join(adrGraphDir, "adr.nodes.jsonl"), [
		{
			id: "adr:0001",
			adr_id: "ADR-0001",
			number: 1,
			type: "adr",
			title: "Test Dashboard",
			status: "accepted",
			decision_date: "2026-06-09",
			path: "docs/adr/0001-test-dashboard.md",
			domains: ["dashboard"],
			keywords: ["read-only"],
		},
	]);
	writeJsonl(path.join(adrGraphDir, "adr.edges.jsonl"), []);

	const outsideFile = path.join(parent, "outside.txt");
	fs.writeFileSync(outsideFile, "outside\n", "utf8");
	return { root, topic, outsideFile, privateFile };
}
