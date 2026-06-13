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
	fs.writeFileSync(
		path.join(topicDir, "facts.nodes.jsonl"),
		`${JSON.stringify({ id: "S001", type: "source" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact", raw_archive_path: ".plan/_private/demo/raw.log" })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "facts.edges.jsonl"),
		`${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "receipts.jsonl"),
		`${JSON.stringify({ id: "receipt:P1", type: "validation-receipt", status: "passed", phase_id: "P1", commands: [{ command: "test", result: "passed" }] })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "context-packs.jsonl"),
		`${JSON.stringify({ id: "context:P2", type: "context-pack", phase_id: "P2", summary: "Compact", references: [".plan/_private/demo/raw.log"] })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "plan.md"),
		`# demo Plan\n\n### Phase P0 — Build\n\n#### Checklist\n- [ ] **P0.T1** Implement.\n\n#### Validation\n- [ ] **P0.V1** npm run test:ts\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "plan.nodes.jsonl"),
		[
			{ id: "phase:P0", type: "phase", phase_id: "P0", title: "Build", status: "pending" },
			{ id: "task:P0.T1", type: "task", task_id: "P0.T1", phase_id: "P0", title: "Implement" },
			{
				id: "validation:P0.V1",
				type: "validation",
				validation_id: "P0.V1",
				phase_id: "P0",
				command: "npm run test:ts",
			},
		]
			.map((record) => JSON.stringify(record))
			.join("\n") + "\n",
		"utf8",
	);
	fs.writeFileSync(path.join(topicDir, "plan.edges.jsonl"), "", "utf8");
	return root;
}

type MockContext = {
	cwd?: string;
	compact?: (options?: { customInstructions?: string; onComplete?: () => void }) => void;
	getContextUsage?: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
	sendUserMessage?: (content: string, options?: { deliverAs?: "steer" | "followUp" }) => void;
	ui?: { notify?: (message: string, level?: string) => void };
};

type RegisteredTool = {
	name: string;
	promptGuidelines?: string[];
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal?: AbortSignal,
		onUpdate?: unknown,
		ctx?: MockContext,
	) => Promise<{ content: { text: string }[]; details?: Record<string, unknown>; isError?: boolean }>;
};

type RegisteredRuntime = {
	tools: RegisteredTool[];
	handlers: Record<string, (event: unknown, ctx: MockContext) => Promise<void> | void>;
};

function registeredRuntime(): RegisteredRuntime {
	const runtime: RegisteredRuntime = { tools: [], handlers: {} };
	cartographerTools({
		registerTool: (tool: RegisteredTool) => runtime.tools.push(tool),
		on: (event: string, handler: (event: unknown, ctx: MockContext) => Promise<void> | void) => {
			runtime.handlers[event] = handler;
		},
	});
	return runtime;
}

function registeredTools(): RegisteredTool[] {
	return registeredRuntime().tools;
}

describe("cartographer tool registration", () => {
	it("registers a read-only artifact helper without mutation actions", () => {
		const tools = registeredTools();
		const artifactTool = tools.find((tool) => tool.name === "cartographer_artifacts") as RegisteredTool & {
			parameters?: unknown;
		};

		expect(artifactTool).toBeTruthy();
		expect(artifactTool?.promptGuidelines?.join("\n")).toContain("read-only");
		expect(JSON.stringify(artifactTool?.parameters)).toContain("fact-citation-summary");
		expect(JSON.stringify(artifactTool?.parameters)).not.toContain("upsert");
	});

	it("registers a parent-owned validation wrapper", () => {
		const tools = registeredTools();
		const validationTool = tools.find((tool) => tool.name === "cartographer_validation") as RegisteredTool & {
			parameters?: unknown;
		};

		expect(validationTool).toBeTruthy();
		expect(validationTool?.promptGuidelines?.join("\n")).toContain("parent");
		expect(validationTool?.promptGuidelines?.join("\n")).toContain("does not implement signed receipt cryptography");
		expect(JSON.stringify(validationTool?.parameters)).toContain("timeoutSec");
	});

	it("registers proposal, fact, and plan wrappers", () => {
		const tools = registeredTools();
		const proposalTool = tools.find((tool) => tool.name === "cartographer_proposal") as RegisteredTool & {
			parameters?: unknown;
		};
		const factTool = tools.find((tool) => tool.name === "cartographer_fact") as RegisteredTool & {
			parameters?: unknown;
		};
		const planTool = tools.find((tool) => tool.name === "cartographer_plan") as RegisteredTool & {
			parameters?: unknown;
		};
		const statusTool = tools.find((tool) => tool.name === "cartographer_plan_status") as RegisteredTool & {
			parameters?: unknown;
		};

		expect(proposalTool).toBeTruthy();
		expect(proposalTool?.promptGuidelines?.join("\n")).toContain("init");
		expect(JSON.stringify(proposalTool?.parameters)).toContain("adr-sync");
		expect(factTool).toBeTruthy();
		expect(factTool?.promptGuidelines?.join("\n")).toContain("supported_by");
		expect(JSON.stringify(factTool?.parameters)).toContain("support-fact");
		expect(planTool).toBeTruthy();
		expect(JSON.stringify(planTool?.parameters)).toContain("generate-graph");
		expect(statusTool).toBeTruthy();
		expect(statusTool?.promptGuidelines?.join("\n")).toContain("manually editing plan status");
		const implementTool = tools.find((tool) => tool.name === "cartographer_implement") as RegisteredTool & {
			parameters?: unknown;
		};
		expect(implementTool).toBeTruthy();
		expect(JSON.stringify(implementTool?.parameters)).toContain("finalize");
		const handoffTool = tools.find((tool) => tool.name === "cartographer_handoff") as RegisteredTool & {
			parameters?: unknown;
		};
		expect(handoffTool).toBeTruthy();
		expect(JSON.stringify(handoffTool?.parameters)).toContain("auditor");
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

	it("registers and runs the Cartographer state tool in a temp project", async () => {
		const project = tempProjectWithTopic();
		const stateTool = registeredTools().find((tool) => tool.name === "cartographer_state");
		if (!stateTool) throw new Error("cartographer_state was not registered");

		expect(stateTool.promptGuidelines?.join("\n")).toContain("mutate them through cartographer_state commands");
		const init = await stateTool.execute("tool-call", { action: "state-init", root: project, topic: "demo" });
		const initPayload = JSON.parse(init.content[0].text);
		expect(init.isError).toBeUndefined();
		expect(initPayload.ok).toBe(true);

		const resume = await stateTool.execute("tool-call", { action: "state-resume", root: project, topic: "demo" });
		const resumePayload = JSON.parse(resume.content[0].text);
		expect(resume.isError).toBeUndefined();
		expect(resumePayload.context).toContain("CARTOGRAPHER_RESUME_CONTEXT");
		expect(resumePayload.read_only).toBe(true);
	});

	it("queues actual Pi compaction with Cartographer instructions", async () => {
		const project = tempProjectWithTopic();
		const compactTool = registeredTools().find((tool) => tool.name === "cartographer_compact_context");
		if (!compactTool) throw new Error("cartographer_compact_context was not registered");

		let compactInstructions = "";
		const result = await compactTool.execute(
			"tool-call",
			{
				action: "run",
				root: project,
				topic: "demo",
				trigger: "phase-end-P0",
				phaseId: "P0",
				summary: "P0 complete",
				includeStateResume: false,
				force: true,
			},
			undefined,
			undefined,
			{
				cwd: project,
				compact: (options) => {
					compactInstructions = options?.customInstructions ?? "";
				},
				getContextUsage: () => ({ tokens: 60_000, contextWindow: 100_000, percent: 60 }),
			},
		);
		const payload = JSON.parse(result.content[0].text);

		expect(payload.status).toBe("queued");
		expect(payload.topic).toBe("demo");
		expect(compactInstructions).toContain("continue with the Cartographer implement skill");
		expect(compactInstructions).toContain("phase-end-P0");
		expect(compactInstructions).toContain("compact-generate as Pi transcript compaction");
	});

	it("reprompts model to continue after compaction completes", async () => {
		const project = tempProjectWithTopic();
		const compactTool = registeredTools().find((tool) => tool.name === "cartographer_compact_context");
		if (!compactTool) throw new Error("cartographer_compact_context was not registered");

		let onCompleteCallback: (() => void) | undefined;
		let continuationMessage = "";
		let deliverAsOption: string | undefined;

		const result = await compactTool.execute(
			"tool-call",
			{
				action: "run",
				root: project,
				topic: "demo",
				trigger: "phase-end-P0",
				phaseId: "P0",
				summary: "P0 complete",
				includeStateResume: false,
				force: true,
			},
			undefined,
			undefined,
			{
				cwd: project,
				compact: (options) => {
					onCompleteCallback = options?.onComplete;
				},
				getContextUsage: () => ({ tokens: 60_000, contextWindow: 100_000, percent: 60 }),
				sendUserMessage: (content, options) => {
					continuationMessage = content;
					deliverAsOption = options?.deliverAs;
				},
			},
		);
		const payload = JSON.parse(result.content[0].text);

		expect(payload.status).toBe("queued");
		expect(onCompleteCallback).toBeDefined();

		// Simulate Pi calling the onComplete callback after compaction finishes
		onCompleteCallback!();

		// Verify sendUserMessage was called with continuation prompt
		expect(continuationMessage).toContain("Context compaction completed");
		expect(continuationMessage).toContain("demo");
		expect(continuationMessage).toContain("P0");
		expect(continuationMessage).toContain("Resume implementation immediately");
		expect(continuationMessage).toContain("state-resume");
		expect(deliverAsOption).toBe("followUp");
	});

	it("reports unavailable when Pi compact context is missing", async () => {
		const compactTool = registeredTools().find((tool) => tool.name === "cartographer_compact_context");
		if (!compactTool) throw new Error("cartographer_compact_context was not registered");

		const result = await compactTool.execute("tool-call", { topic: "demo", trigger: "phase-end-P0" });
		const payload = JSON.parse(result.content[0].text);

		expect(payload.status).toBe("unavailable");
		expect(payload.reason).toContain("ctx.compact");
	});

	it("queues threshold compaction only for active Cartographer state", async () => {
		const project = tempProjectWithTopic();
		const stateDir = path.join(project, ".cartographer", "threshold-demo");
		fs.mkdirSync(stateDir, { recursive: true });
		fs.writeFileSync(path.join(stateDir, "state.json"), "{}", "utf8");
		fs.writeFileSync(
			path.join(project, ".cartographer", "current.json"),
			JSON.stringify({ active_topic: "threshold-demo", state_path: ".cartographer/threshold-demo/state.json" }),
			"utf8",
		);
		const runtime = registeredRuntime();
		const turnEnd = runtime.handlers.turn_end;
		if (!turnEnd) throw new Error("turn_end handler was not registered");
		await runtime.handlers.session_compact?.({}, {});

		let compactions = 0;
		await turnEnd(
			{},
			{
				cwd: project,
				compact: () => {
					compactions += 1;
				},
				getContextUsage: () => ({ tokens: 61_000, contextWindow: 100_000, percent: 61 }),
			},
		);

		expect(compactions).toBe(1);
	});

	it("skips threshold compaction without active Cartographer state", async () => {
		const project = tempProjectWithTopic();
		const runtime = registeredRuntime();
		const turnEnd = runtime.handlers.turn_end;
		if (!turnEnd) throw new Error("turn_end handler was not registered");
		await runtime.handlers.session_compact?.({}, {});

		let compactions = 0;
		await turnEnd(
			{},
			{
				cwd: project,
				compact: () => {
					compactions += 1;
				},
				getContextUsage: () => ({ tokens: 61_000, contextWindow: 100_000, percent: 61 }),
			},
		);

		expect(compactions).toBe(0);
	});

	it("suppresses duplicate threshold compaction after crossing", async () => {
		const project = tempProjectWithTopic();
		const stateDir = path.join(project, ".cartographer", "duplicate-demo");
		fs.mkdirSync(stateDir, { recursive: true });
		fs.writeFileSync(path.join(stateDir, "state.json"), "{}", "utf8");
		fs.writeFileSync(
			path.join(project, ".cartographer", "current.json"),
			JSON.stringify({ active_topic: "duplicate-demo", state_path: ".cartographer/duplicate-demo/state.json" }),
			"utf8",
		);
		const runtime = registeredRuntime();
		const turnEnd = runtime.handlers.turn_end;
		if (!turnEnd) throw new Error("turn_end handler was not registered");
		await runtime.handlers.session_compact?.({}, {});

		let percent = 61;
		let compactions = 0;
		const ctx = {
			cwd: project,
			compact: () => {
				compactions += 1;
			},
			getContextUsage: () => ({ tokens: percent * 1000, contextWindow: 100_000, percent }),
		};
		await turnEnd({}, ctx);
		percent = 62;
		await turnEnd({}, ctx);

		expect(compactions).toBe(1);
	});

	it("skips threshold compaction below threshold", async () => {
		const project = tempProjectWithTopic();
		const runtime = registeredRuntime();
		const turnEnd = runtime.handlers.turn_end;
		if (!turnEnd) throw new Error("turn_end handler was not registered");
		await runtime.handlers.session_compact?.({}, {});

		let compactions = 0;
		await turnEnd(
			{},
			{
				cwd: project,
				compact: () => {
					compactions += 1;
				},
				getContextUsage: () => ({ tokens: 40_000, contextWindow: 100_000, percent: 40 }),
			},
		);

		expect(compactions).toBe(0);
	});

	it("runs validation wrapper and writes compatible receipts in a temp project", async () => {
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-validation-tool-"));
		const validationTool = registeredTools().find((tool) => tool.name === "cartographer_validation");
		if (!validationTool) throw new Error("cartographer_validation was not registered");

		const result = await validationTool.execute("tool-call", {
			action: "run",
			root: project,
			command: 'node -e "process.exit(0)"',
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
