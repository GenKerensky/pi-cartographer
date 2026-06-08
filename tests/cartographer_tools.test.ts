import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cartographerTools, { shapeToolOutput } from "../extensions/cartographer-tools.ts";

function tempFile(name: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-tools-"));
	return path.join(dir, name);
}

function tempProjectWithTopic(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-artifacts-tool-"));
	const topicDir = path.join(root, ".plan", "demo");
	fs.mkdirSync(topicDir, { recursive: true });
	fs.writeFileSync(path.join(topicDir, "proposal.md"), "# Demo\n\nUses [F001].\n", "utf8");
	fs.writeFileSync(path.join(topicDir, "facts.nodes.jsonl"), `${JSON.stringify({ id: "S001", type: "source" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact", raw_archive_path: ".plan/_private/demo/raw.log" })}\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "facts.edges.jsonl"), `${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "receipts.jsonl"), `${JSON.stringify({ id: "receipt:P1", type: "validation-receipt", status: "passed", phase_id: "P1", commands: [{ command: "test", result: "passed" }] })}\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "context-packs.jsonl"), `${JSON.stringify({ id: "context:P2", type: "context-pack", phase_id: "P2", summary: "Compact", references: [".plan/_private/demo/raw.log"] })}\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.md"), `# demo Plan\n\n### Phase P0 — Build\n\n#### Checklist\n- [ ] **P0.T1** Implement.\n\n#### Validation\n- [ ] **P0.V1** npm run test:ts\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.nodes.jsonl"), [
		{ id: "phase:P0", type: "phase", phase_id: "P0", title: "Build", status: "pending" },
		{ id: "task:P0.T1", type: "task", task_id: "P0.T1", phase_id: "P0", title: "Implement" },
		{ id: "validation:P0.V1", type: "validation", validation_id: "P0.V1", phase_id: "P0", command: "npm run test:ts" },
	].map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.edges.jsonl"), "", "utf8");
	return root;
}

type RegisteredTool = {
	name: string;
	promptGuidelines?: string[];
	execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
};

function registeredTools(): RegisteredTool[] {
	const tools: RegisteredTool[] = [];
	cartographerTools({ registerTool: (tool: RegisteredTool) => tools.push(tool) });
	return tools;
}

describe("cartographer tool registration", () => {
	it("registers a read-only artifact helper without mutation actions", () => {
		const tools = registeredTools();
		const artifactTool = tools.find((tool) => tool.name === "cartographer_artifacts") as RegisteredTool & { parameters?: unknown };

		expect(artifactTool).toBeTruthy();
		expect(artifactTool?.promptGuidelines?.join("\n")).toContain("read-only");
		expect(JSON.stringify(artifactTool?.parameters)).toContain("fact-citation-summary");
		expect(JSON.stringify(artifactTool?.parameters)).not.toContain("upsert");
	});

	it("registers a parent-owned validation wrapper", () => {
		const tools = registeredTools();
		const validationTool = tools.find((tool) => tool.name === "cartographer_validation") as RegisteredTool & { parameters?: unknown };

		expect(validationTool).toBeTruthy();
		expect(validationTool?.promptGuidelines?.join("\n")).toContain("parent");
		expect(validationTool?.promptGuidelines?.join("\n")).toContain("does not implement signed receipt cryptography");
		expect(JSON.stringify(validationTool?.parameters)).toContain("timeoutSec");
	});

	it("runs artifact summaries through the registered read-only tool", async () => {
		const project = tempProjectWithTopic();
		const artifactTool = registeredTools().find((tool) => tool.name === "cartographer_artifacts");
		if (!artifactTool) throw new Error("cartographer_artifacts was not registered");

		const result = await artifactTool.execute("tool-call", {
			action: "show-record",
			root: project,
			topic: "demo",
			artifact: "facts.nodes",
			id: "F001",
		});
		const payload = JSON.parse(result.content[0].text);

		expect(result.isError).toBeUndefined();
		expect(payload.ok).toBe(true);
		expect(payload.record.raw_archive_path).toBeUndefined();
		expect(result.content[0].text).not.toContain(".plan/_private/demo/raw.log");
		expect(result.content[0].text.length).toBeLessThan(1000);
	});

	it("runs phase-summary through the registered read-only tool", async () => {
		const project = tempProjectWithTopic();
		const artifactTool = registeredTools().find((tool) => tool.name === "cartographer_artifacts");
		if (!artifactTool) throw new Error("cartographer_artifacts was not registered");

		const result = await artifactTool.execute("tool-call", {
			action: "phase-summary",
			root: project,
			topic: "demo",
		});
		const payload = JSON.parse(result.content[0].text);

		expect(result.isError).toBeUndefined();
		expect(payload.next_executable_phase_id).toBe("P0");
		expect(payload.suggested_subagent_contract.acceptance_criteria[0].id).toBe("P0.T1");
		expect(payload.suggested_subagent_contract.verify_commands).toEqual(["npm run test:ts"]);
	});

	it("runs validation wrapper and writes compatible receipts in a temp project", async () => {
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-validation-tool-"));
		const validationTool = registeredTools().find((tool) => tool.name === "cartographer_validation");
		if (!validationTool) throw new Error("cartographer_validation was not registered");

		const result = await validationTool.execute("tool-call", {
			action: "run",
			root: project,
			command: "node -e \"process.exit(0)\"",
			phaseId: "P4",
			validationId: ["P4.V3"],
			receiptFile: ".plan/demo/receipts.jsonl",
		});
		const payload = JSON.parse(result.content[0].text);

		expect(result.isError).toBeUndefined();
		expect(payload.status).toBe("passed");
		expect(fs.existsSync(path.join(project, ".plan", "demo", "receipts.jsonl"))).toBe(true);
	});

	it("registers a dedicated ADR tool with domain guidance", () => {
		const tools = registeredTools();
		const adrTool = tools.find((tool) => tool.name === "cartographer_adr");

		expect(adrTool).toBeTruthy();
		expect(adrTool?.promptGuidelines?.join("\n")).toContain("standalone/manual");
		expect(adrTool?.promptGuidelines?.join("\n")).toContain("cartographer_jsonl");
	});

	it("runs ADR list through the registered tool", async () => {
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-adr-tool-"));
		const adrTool = registeredTools().find((tool) => tool.name === "cartographer_adr");
		if (!adrTool) throw new Error("cartographer_adr was not registered");

		const result = await adrTool.execute("tool-call", { action: "list", root: project });
		const payload = JSON.parse(result.content[0].text);

		expect(result.isError).toBeUndefined();
		expect(payload.ok).toBe(true);
		expect(payload.records).toEqual([]);
	});
});

describe("cartographer tool output shaping", () => {
	it("leaves under-budget output inline", () => {
		const shaped = shapeToolOutput("small output\n", "", { maxOutputChars: 100 });
		expect(shaped.text).toBe("small output\n");
		expect(shaped.details.truncated).toBe(false);
	});

	it("writes oversized output to an explicit path", () => {
		const outputPath = tempFile("full-output.log");
		const shaped = shapeToolOutput("x".repeat(120), "", {
			maxOutputChars: 20,
			outputPath,
			label: "test-output",
		});
		const receipt = JSON.parse(shaped.text);
		expect(receipt.truncated).toBe(true);
		expect(receipt.full_output_path).toBe(outputPath);
		expect(receipt.counts.outputChars).toBe(120);
		expect(fs.readFileSync(outputPath, "utf8")).toHaveLength(120);
		expect(shaped.text.length).toBeLessThan(1000);
	});

	it("summarizes query JSON by default", () => {
		const raw = JSON.stringify([
			{ path: "src/a.ts", score: 10, matches: [{ reference: "src/a.ts:1" }], candidate: true, verified: false },
			{ path: "src/b.ts", score: 4, matches: [], candidate: true, verified: true },
		]);
		const shaped = shapeToolOutput(raw, "", { summaryMode: "query", maxOutputChars: 10_000 });
		const receipt = JSON.parse(shaped.text);
		expect(receipt.summary).toContain("2 result");
		expect(receipt.top_results[0].path).toBe("src/a.ts");
		expect(receipt.truncated).toBe(true);
		expect(receipt.next_actions.join("\n")).toContain("context");
	});

	it("summarizes failure output without losing exit code", () => {
		const outputPath = tempFile("failure.log");
		const shaped = shapeToolOutput("", "error block".repeat(20), {
			maxOutputChars: 30,
			outputPath,
			exitCode: 2,
			isError: true,
		});
		const receipt = JSON.parse(shaped.text);
		expect(receipt.exitCode).toBe(2);
		expect(receipt.isError).toBe(true);
		expect(fs.existsSync(outputPath)).toBe(true);
	});
});
