import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cartographerTools, { shapeToolOutput } from "../extensions/cartographer-tools.ts";

function tempFile(name: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-tools-"));
	return path.join(dir, name);
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
