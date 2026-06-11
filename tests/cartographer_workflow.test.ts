import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	GATE_PREREQUISITES,
	HUMAN_APPROVAL_GATES,
	LIFECYCLE_STATES,
	RECEIPT_KINDS,
	appendJsonlAtomic,
	addFact,
	addFactSource,
	appendWorkflowReceipt,
	assertHumanLabel,
	captureAuditorHandoff,
	captureCompassHandoff,
	captureHandoffOutput,
	captureRoleHandoff,
	createWorkflowFixture,
	finalizePlan,
	finalizeProposal,
	finalizeImplementation,
	generatePlanGraph,
	getWorkflowStatus,
	implementCompact,
	implementRecord,
	implementStep,
	initProposal,
	parseMinimalToml,
	recordHandoffDependencyEvaluation,
	recordHandoffFallback,
	recordWorkflowTransition,
	resolveApprover,
	runWorkflowCli,
	setPlanStatus,
	startImplementation,
	supportFact,
	syncProposalAdr,
	completeValidationItem,
	updateJsonAtomic,
	upsertContextPack,
	writeJsonAtomic,
} from "../skills/plan/scripts/cartographer_workflow.ts";

function tempRoot(prefix = "cartographer-workflow-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("cartographer workflow contracts", () => {
	it("defines lifecycle gates, receipt kinds, and prerequisites", () => {
		expect(LIFECYCLE_STATES).toContain("proposal-draft");
		expect(LIFECYCLE_STATES).toContain("implemented");
		expect(HUMAN_APPROVAL_GATES).toEqual(["proposal", "plan", "phase", "implementation"]);
		expect(RECEIPT_KINDS).toContain("approval");
		expect(RECEIPT_KINDS).toContain("output-capture");
		expect(GATE_PREREQUISITES.plan.map((item) => item.id)).toContain("plan-validate-graph");
		expect(GATE_PREREQUISITES.implementation.every((item) => item.required)).toBe(true);
	});

	it("parses the small supported config.toml subset", () => {
		expect(parseMinimalToml('approver = "John Doe"\n').approver).toBe("John Doe");
		expect(parseMinimalToml('[transition]\napproved_by = "Jane Doe"\n')).toEqual({
			transition: { approved_by: "Jane Doe" },
		});
	});
});

describe("approver resolution", () => {
	it("prefers explicit approver over config, git, and system fallbacks", () => {
		const root = tempRoot();
		fs.mkdirSync(path.join(root, ".cartographer"), { recursive: true });
		fs.writeFileSync(path.join(root, ".cartographer", "config.toml"), 'approver = "Config User"\n', "utf8");

		const resolved = resolveApprover({
			root,
			explicitApprovedBy: "Explicit User",
			gitUserName: () => "Git User",
			systemUserName: () => "System User",
		});

		expect(resolved).toEqual({ approvedBy: "Explicit User", source: "explicit" });
	});

	it("uses .cartographer/config.toml before git and system fallbacks", () => {
		const root = tempRoot();
		fs.mkdirSync(path.join(root, ".cartographer"), { recursive: true });
		fs.writeFileSync(
			path.join(root, ".cartographer", "config.toml"),
			'[transition]\napproved_by = "Config User"\n',
			"utf8",
		);

		const resolved = resolveApprover({
			root,
			gitUserName: () => "Git User",
			systemUserName: () => "System User",
		});

		expect(resolved).toEqual({ approvedBy: "Config User", source: "config" });
	});

	it("falls back to git user.name and then system username", () => {
		const root = tempRoot();
		expect(resolveApprover({ root, gitUserName: () => "Git User", systemUserName: () => "System User" })).toEqual({
			approvedBy: "Git User",
			source: "git",
		});
		expect(resolveApprover({ root, gitUserName: () => undefined, systemUserName: () => "System User" })).toEqual({
			approvedBy: "System User",
			source: "system",
		});
	});

	it("rejects empty, too long, and secret-like approver labels", () => {
		expect(() => assertHumanLabel("   ")).toThrow("empty");
		expect(() => assertHumanLabel("x".repeat(121))).toThrow("too long");
		expect(() => assertHumanLabel("api_key=abc123")).toThrow("secret-like");
	});
});

describe("atomic helpers and fixtures", () => {
	it("writes JSON and appends JSONL atomically", () => {
		const root = tempRoot();
		const jsonPath = path.join(root, "state.json");
		writeJsonAtomic(jsonPath, { count: 1 });
		expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toEqual({ count: 1 });
		updateJsonAtomic<{ count: number }>(jsonPath, (current) => ({ count: current.count + 1 }));
		expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toEqual({ count: 2 });

		const jsonlPath = path.join(root, "records.jsonl");
		appendJsonlAtomic(jsonlPath, [{ id: "a" }, { id: "b" }]);
		expect(
			fs
				.readFileSync(jsonlPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line)),
		).toEqual([{ id: "a" }, { id: "b" }]);
	});

	it("creates temp-root workflow fixtures without touching the repository", () => {
		const root = tempRoot();
		const fixture = createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0", "P1"] });

		expect(fixture.topic).toBe("demo");
		expect(fs.existsSync(path.join(root, ".plan", "demo", "plan.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, ".cartographer"))).toBe(true);
		const nodes = fs
			.readFileSync(path.join(root, ".plan", "demo", "plan.nodes.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(nodes.some((node) => node.id === "phase:P1" && node.depends_on?.[0] === "P0")).toBe(true);
		expect(fs.existsSync(path.join(process.cwd(), ".cartographer", "demo", "state.json"))).toBe(false);
	});
});

describe("proposal and fact wrappers", () => {
	it("initializes proposal artifacts without truncating existing prose", () => {
		const root = tempRoot();
		const topicDir = path.join(root, ".plan", "demo");
		fs.mkdirSync(topicDir, { recursive: true });
		fs.writeFileSync(path.join(topicDir, "proposal.md"), "# demo Proposal\n\nExisting design.\n", "utf8");

		const result = initProposal({ root, topic: "demo" });
		const proposal = fs.readFileSync(path.join(topicDir, "proposal.md"), "utf8");

		expect(result.proposal).toBe(".plan/demo/proposal.md");
		expect(proposal).toContain("Existing design.");
		expect(proposal).toContain("## ADR Metadata");
		expect(fs.existsSync(path.join(topicDir, "evidence"))).toBe(true);
		for (const file of ["map.nodes.jsonl", "map.edges.jsonl", "facts.nodes.jsonl", "facts.edges.jsonl"]) {
			expect(fs.existsSync(path.join(topicDir, file))).toBe(true);
		}
	});

	it("adds source-backed facts and rejects invalid support references", () => {
		const root = tempRoot();
		initProposal({ root, topic: "demo" });

		const source = addFactSource({ root, topic: "demo", title: "Design doc", url: "https://example.test/design" });
		const fact = addFact({ root, topic: "demo", title: "Wrappers own artifact writes", sourceId: String(source.id) });
		expect(source.id).toBe("S001");
		expect(fact.id).toBe("F001");
		expect(() => supportFact({ root, topic: "demo", factId: "F999", sourceId: String(source.id) })).toThrow(
			"Fact node does not exist",
		);

		const edges = fs
			.readFileSync(path.join(root, ".plan", "demo", "facts.edges.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(edges).toEqual([{ from: "F001", to: "S001", type: "supported_by" }]);
	});

	it("syncs ADR metadata with explicit override rationale", () => {
		const root = tempRoot();
		initProposal({ root, topic: "demo" });
		syncProposalAdr({
			root,
			topic: "demo",
			adrRequired: "true",
			adrReason: "Cross-cutting workflow policy change.",
			adrOptionsStatus: "evaluated",
			adrToolMode: "write-after-validation",
			overrideRationale: "User accepted durable workflow enforcement scope.",
		});

		const proposal = fs.readFileSync(path.join(root, ".plan", "demo", "proposal.md"), "utf8");
		expect(proposal).toContain("`adr_required`: true");
		expect(proposal).toContain("`adr_override_rationale`: User accepted durable workflow enforcement scope.");
	});

	it("finalize blocks until validation, context, audit, and approval request prerequisites exist", () => {
		const root = tempRoot();
		initProposal({ root, topic: "demo" });
		const source = addFactSource({ root, topic: "demo", title: "Source" });
		addFact({ root, topic: "demo", title: "Proposal is supported", sourceId: String(source.id) });
		expect(() => finalizeProposal({ root, topic: "demo" })).toThrow("auditor PASS");
		fs.writeFileSync(path.join(root, ".plan", "demo", "auditor-report-proposal.md"), "PASS\n", "utf8");
		appendWorkflowReceipt({
			root,
			topic: "demo",
			kind: "audit",
			phaseId: "proposal",
			summary: "proposal auditor PASS",
			data: { report_path: ".plan/demo/auditor-report-proposal.md" },
		});

		const result = finalizeProposal({ root, topic: "demo", summary: "Proposal ready" });
		expect(String(result.validation_receipt)).toContain("receipt:demo:validation:");
		expect(String(result.audit_receipt)).toContain("receipt:demo:audit:");
		expect(String(result.transition_receipt)).toContain("receipt:demo:transition:");
		expect(getWorkflowStatus({ root, topic: "demo" }).pending_human_approvals).toEqual([
			{ gate: "proposal", phase_id: "proposal" },
		]);
	});

	it("finalize enforces fact citations, supported_by edges, sanitized evidence, and auditor report path", () => {
		const root = tempRoot();
		initProposal({ root, topic: "demo" });
		fs.appendFileSync(path.join(root, ".plan", "demo", "proposal.md"), "\nUses [F001].\n", "utf8");
		expect(() => finalizeProposal({ root, topic: "demo" })).toThrow("missing fact ids");
		addFact({ root, topic: "demo", title: "Unbacked fact" });
		expect(() => finalizeProposal({ root, topic: "demo" })).toThrow("supported_by");
		const source = addFactSource({ root, topic: "demo", title: "Source" });
		supportFact({ root, topic: "demo", factId: "F001", sourceId: String(source.id) });
		fs.appendFileSync(path.join(root, ".plan", "demo", "context-packs.jsonl"), 
			`${JSON.stringify({ id: "context:bad", references: [".plan/_private/demo/raw.log"] })}\n`,
			"utf8",
		);
		expect(() => finalizeProposal({ root, topic: "demo" })).toThrow("private raw inputs");
	});

	it("supports proposal and fact CLI aliases", () => {
		const root = tempRoot();
		expect(runWorkflowCli(["proposal-init", "--root", root, "--topic", "demo"]).ok).toBe(true);
		const source = runWorkflowCli([
			"fact-add-source",
			"--root",
			root,
			"--topic",
			"demo",
			"--title",
			"Source",
		]);
		expect(source.id).toBe("S001");
		expect(
			runWorkflowCli([
				"fact-add-fact",
				"--root",
				root,
				"--topic",
				"demo",
				"--title",
				"Fact",
				"--source-id",
				"S001",
			]).id,
		).toBe("F001");
	});
});

describe("plan graph, status, and validation wrappers", () => {
	it("generates plan graph records from Markdown phases, dependencies, tasks, and validations", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0", "P1"] });
		const planPath = path.join(root, ".plan", "demo", "plan.md");
		fs.writeFileSync(
			planPath,
			fs.readFileSync(planPath, "utf8").replace("- **Depends on:** P0", "- **Depends on:** P0\n- **Primary references:** [F021] [F024]"),
			"utf8",
		);
		const result = generatePlanGraph({ root, topic: "demo" });
		expect(result.nodes).toBe(7);
		expect(result.edges).toBe(11);
		const edges = fs
			.readFileSync(path.join(root, ".plan", "demo", "plan.edges.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(edges).toContainEqual({ from: "phase:P1", to: "phase:P0", type: "depends_on" });
		expect(edges).toContainEqual({ from: "phase:P1", to: "F021", type: "references" });
		const nodes = fs
			.readFileSync(path.join(root, ".plan", "demo", "plan.nodes.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(nodes.find((node) => node.id === "phase:P1")?.references).toEqual(["F021", "F024"]);
	});

	it("sets plan phase/task status atomically in Markdown and JSONL", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		setPlanStatus({ root, topic: "demo", id: "P0", status: "in-progress" });
		setPlanStatus({ root, topic: "demo", id: "P0.T1", status: "complete" });
		const markdown = fs.readFileSync(path.join(root, ".plan", "demo", "plan.md"), "utf8");
		expect(markdown).toContain("- **Status:** in-progress");
		expect(markdown).toContain("- [x] **P0.T1** Fixture task.");
		expect(() => setPlanStatus({ root, topic: "demo", id: "P0.T404", status: "complete" })).toThrow(
			"Missing checklist item",
		);
		expect(fs.readFileSync(path.join(root, ".plan", "demo", "plan.md"), "utf8")).toContain(
			"- [x] **P0.T1** Fixture task.",
		);
	});

	it("completes validation items only with matching passed receipts", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		expect(() => completeValidationItem({ root, topic: "demo", validationId: "P0.V1" })).toThrow("Missing passed");
		appendJsonlAtomic(path.join(root, ".plan", "demo", "receipts.jsonl"), [
			{ id: "receipt:P0.V1", type: "validation-receipt", status: "failed", validation_ids: ["P0.V1"] },
		]);
		expect(() => completeValidationItem({ root, topic: "demo", validationId: "P0.V1" })).toThrow("Missing passed");
		appendJsonlAtomic(path.join(root, ".plan", "demo", "receipts.jsonl"), [
			{ id: "receipt:P0.V1:pass", type: "validation-receipt", status: "passed", validation_ids: ["P0.V1"] },
		]);
		const result = completeValidationItem({ root, topic: "demo", validationId: "P0.V1" });
		expect(result.validation_receipt).toBe("receipt:P0.V1:pass");
		expect(fs.readFileSync(path.join(root, ".plan", "demo", "plan.md"), "utf8")).toContain(
			"- [x] **P0.V1** Fixture validation.",
		);
	});

	it("finalizes plans through graph generation, validation, context pack, audit, and approval request", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		expect(() => finalizePlan({ root, topic: "demo" })).toThrow("auditor PASS");
		fs.writeFileSync(path.join(root, ".plan", "demo", "auditor-report-plan.md"), "PASS\n", "utf8");
		appendWorkflowReceipt({
			root,
			topic: "demo",
			kind: "audit",
			phaseId: "plan",
			summary: "plan auditor PASS",
			data: { report_path: ".plan/demo/auditor-report-plan.md" },
		});
		const result = finalizePlan({ root, topic: "demo", summary: "Plan ready" });
		expect(String(result.validation_receipt)).toContain("receipt:demo:validation:");
		expect(String(result.transition_receipt)).toContain("receipt:demo:transition:");
		expect(getWorkflowStatus({ root, topic: "demo" }).pending_human_approvals).toEqual([
			{ gate: "plan", phase_id: "plan" },
		]);
	});

	it("supports plan/status/validation CLI aliases", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		expect(runWorkflowCli(["plan-generate-graph", "--root", root, "--topic", "demo"]).ok).toBe(true);
		expect(
			runWorkflowCli([
				"plan-status-set",
				"--root",
				root,
				"--topic",
				"demo",
				"--id",
				"P0.T1",
				"--status",
				"complete",
			]).status,
		).toBe("complete");
	});
});

describe("implement runner and guard wrappers", () => {
	function approvePlanForImplementation(root: string, topic = "demo"): void {
		upsertContextPack({ root, topic, phaseId: "plan", summary: "Plan context" });
		appendWorkflowReceipt({ root, topic, kind: "validation", phaseId: "plan", summary: "plan validation" });
		appendWorkflowReceipt({ root, topic, kind: "audit", phaseId: "plan", summary: "plan auditor PASS" });
		recordWorkflowTransition({ root, topic, action: "request-approval", gate: "plan", summary: "Plan ready" });
		recordWorkflowTransition({ root, topic, action: "approve", gate: "plan", summary: "Plan approved", approvedBy: "Tester" });
	}

	it("starts implementation only after plan approval and initializes state/current pointer", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0", "P1"] });
		expect(() => startImplementation({ root, topic: "demo" })).toThrow("plan approval");
		approvePlanForImplementation(root);
		const result = startImplementation({ root, topic: "demo" });
		expect(result.phase_id).toBe("P0");
		expect(fs.existsSync(path.join(root, ".cartographer", "demo", "state.json"))).toBe(true);
		expect(fs.existsSync(path.join(root, ".cartographer", "current.json"))).toBe(true);
		expect(fs.readFileSync(path.join(root, ".plan", "demo", "plan.md"), "utf8")).toContain("- **Status:** in-progress");
	});

	it("start keeps selected later phase aligned in state and step output", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0", "P1"] });
		setPlanStatus({ root, topic: "demo", id: "P0", status: "complete" });
		approvePlanForImplementation(root);
		const result = startImplementation({ root, topic: "demo" });
		expect(result.phase_id).toBe("P1");
		const state = JSON.parse(fs.readFileSync(path.join(root, ".cartographer", "demo", "state.json"), "utf8"));
		expect(state.current_phase_id).toBe("P1");
		expect(implementStep({ root, topic: "demo" }).current_phase_id).toBe("P1");
	});

	it("step refuses missing state and reports working-set path guardrails", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		expect(() => implementStep({ root, topic: "demo" })).toThrow("Missing active implementation state");
		approvePlanForImplementation(root);
		startImplementation({ root, topic: "demo" });
		expect(implementStep({ root, topic: "demo", path: "skills/plan/scripts/cartographer_workflow.ts" }).guard).toMatchObject({
			mode: "write-allowed",
		});
		expect(() => implementStep({ root, topic: "demo", path: ".plan/_private/demo/raw.log" })).toThrow("forbidden");
	});

	it("records validation refs, compacts resume state, and blocks finalize with pending phases", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		approvePlanForImplementation(root);
		startImplementation({ root, topic: "demo" });
		appendWorkflowReceipt({ root, topic: "demo", kind: "validation", phaseId: "P0", id: "receipt:P0", summary: "P0 validation" });
		expect(implementRecord({ root, topic: "demo", receiptIds: ["receipt:P0"] }).ok).toBe(true);
		expect(implementCompact({ root, topic: "demo", trigger: "test", summary: "Compact" }).resume).toMatchObject({ ok: true });
		expect(() => finalizeImplementation({ root, topic: "demo" })).toThrow("pending phases");
	});

	it("finalize requests final approval only after completed phases, full validation, audit, and ADR handling", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		setPlanStatus({ root, topic: "demo", id: "P0", status: "complete" });
		expect(() => finalizeImplementation({ root, topic: "demo" })).toThrow("full validation");
		appendJsonlAtomic(path.join(root, ".plan", "demo", "receipts.jsonl"), [
			{ id: "receipt:implementation-full-validation", type: "validation-receipt", status: "passed", phase_id: "implementation", validation_ids: ["implementation-full-validation"], commands: [{ command: "npm run check", result: "passed" }] },
		]);
		expect(() => finalizeImplementation({ root, topic: "demo" })).toThrow("ADR handling");
		appendWorkflowReceipt({ root, topic: "demo", kind: "decision", phaseId: "implementation", id: "receipt:adr-handled", summary: "ADR handling complete" });
		fs.writeFileSync(path.join(root, ".plan", "demo", "auditor-report-implementation.md"), "PASS\n", "utf8");
		appendWorkflowReceipt({ root, topic: "demo", kind: "audit", phaseId: "implementation", summary: "implementation auditor PASS", data: { report_path: ".plan/demo/auditor-report-implementation.md" } });
		const result = finalizeImplementation({ root, topic: "demo", summary: "Implementation ready" });
		expect(String(result.transition_receipt)).toContain("receipt:demo:transition:");
		expect(getWorkflowStatus({ root, topic: "demo" }).pending_human_approvals).toEqual([
			{ gate: "implementation", phase_id: "implementation" },
		]);
	});

	it("supports implement CLI aliases", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		approvePlanForImplementation(root);
		expect(runWorkflowCli(["implement-start", "--root", root, "--topic", "demo"]).phase_id).toBe("P0");
		expect(runWorkflowCli(["implement-step", "--root", root, "--topic", "demo"]).ok).toBe(true);
	});
});

describe("subagent handoff wrappers", () => {
	it("captures auditor PASS/FAIL reports with context pack and validation receipt evidence", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		const receipt = appendWorkflowReceipt({ root, topic: "demo", kind: "validation", phaseId: "P0", summary: "P0 validation" });
		upsertContextPack({ root, topic: "demo", phaseId: "P0", summary: "P0 context", validationReceipts: [String(receipt.id)] });
		const result = captureAuditorHandoff({ root, topic: "demo", phaseId: "P0", decision: "PASS", reportPath: ".plan/demo/auditor-P0.md", summary: "Auditor passed", validationReceipts: [String(receipt.id)], artifactSummaries: ["plan summary"], acceptanceCriteria: ["P0 complete"] });
		expect(result.status).toBe("PASS");
		const semanticFail = captureAuditorHandoff({ root, topic: "demo", phaseId: "P0", decision: "FAIL", reportPath: ".plan/demo/auditor-P0-fail.md", summary: "Required correction", validationReceipts: [String(receipt.id)], artifactSummaries: ["plan summary"], acceptanceCriteria: ["P0 complete"] });
		expect(semanticFail.decision).toBe("FAIL");
		expect(semanticFail.status).toBe("recorded");
		const report = fs.readFileSync(path.join(root, ".plan", "demo", "auditor-P0.md"), "utf8");
		expect(report).toContain("DECISION: PASS");
		expect(report).toContain("REQUIRED_CORRECTIONS:");
		expect(() => captureAuditorHandoff({ root, topic: "demo", phaseId: "P0", decision: "PASS", reportPath: ".plan/demo/no-receipts.md", summary: "bad" })).toThrow("validation receipt IDs");
		expect(() => captureAuditorHandoff({ root, topic: "demo", phaseId: "P0", decision: "PASS", reportPath: ".plan/demo/no-artifacts.md", summary: "bad", validationReceipts: [String(receipt.id)] })).toThrow("artifact summaries");
		expect(() => captureAuditorHandoff({ root, topic: "demo", phaseId: "P0", decision: "PASS", reportPath: ".plan/demo/../_private/raw.md", summary: "bad", validationReceipts: [String(receipt.id)], artifactSummaries: ["plan"], acceptanceCriteria: ["done"] })).toThrow("private raw inputs");
		expect(() => captureAuditorHandoff({ root, topic: "demo", phaseId: "P0", decision: "PASS", reportPath: ".plan/_private", summary: "bad", validationReceipts: [String(receipt.id)], artifactSummaries: ["plan"], acceptanceCriteria: ["done"] })).toThrow("private raw inputs");
	});

	it("captures compass structured decisions and fallback reliability metrics", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		expect(captureCompassHandoff({ root, topic: "demo", phaseId: "P0", decision: "within_scope", summary: "Continue" }).decision).toBe("within_scope");
		expect(() => captureCompassHandoff({ root, topic: "demo", phaseId: "P0", decision: "maybe", summary: "bad" })).toThrow("Unsupported");
		const fallback = recordHandoffFallback({ root, topic: "demo", phaseId: "P0", failureMode: "timeout", summary: "Auditor timed out", fallback: "reviewer" });
		expect(fallback.failure_mode).toBe("timeout");
		expect(fallback.reliability_metric).toMatchObject({ failures: 1, recommendation: "fallback-used" });
		expect(() => captureHandoffOutput({ root, topic: "demo", phaseId: "P0", role: "auditor", output: "", reportPath: ".plan/demo/out.md" })).toThrow("empty output");
		expect(() => captureHandoffOutput({ root, topic: "demo", phaseId: "P0", role: "auditor", output: "hello", reportPath: ".plan/demo/out.md" })).toThrow("schema mismatch");
		expect(() => captureHandoffOutput({ root, topic: "demo", phaseId: "P0", role: "auditor", output: "DECISION: PASS", reportPath: ".plan/demo/out.md" })).toThrow("schema mismatch");
		expect(captureHandoffOutput({ root, topic: "demo", phaseId: "P0", role: "auditor", output: "DECISION: PASS\nSUMMARY: ok\nREQUIRED_CORRECTIONS:\n- None", reportPath: ".plan/demo/out.md" }).schema_valid).toBe(true);
		expect(captureRoleHandoff({ root, topic: "demo", phaseId: "P0", role: "archivist", summary: "Research compressed" }).role).toBe("archivist");
		expect(recordHandoffDependencyEvaluation({ root, topic: "demo", phaseId: "P0", recommendation: "keep", summary: "Subagent dependency acceptable" }).recommendation).toBe("keep");
	});

	it("supports handoff CLI aliases", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P0"] });
		const receipt = appendWorkflowReceipt({ root, topic: "demo", kind: "validation", phaseId: "P0", summary: "P0 validation" });
		upsertContextPack({ root, topic: "demo", phaseId: "P0", summary: "P0 context", validationReceipts: [String(receipt.id)] });
		expect(runWorkflowCli(["handoff-auditor", "--root", root, "--topic", "demo", "--phase-id", "P0", "--decision", "PASS", "--report-path", ".plan/demo/auditor-cli.md", "--summary", "ok", "--validation-receipt", String(receipt.id), "--artifact", "plan summary", "--acceptance-criterion", "P0 complete"]).status).toBe("PASS");
	});
});

describe("receipt, context pack, and transition wrappers", () => {
	it("appends schema-checked workflow receipts and context packs", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P1"] });

		const receipt = appendWorkflowReceipt({
			root,
			topic: "demo",
			kind: "validation",
			phaseId: "P1",
			summary: "P1 validation passed",
		});
		expect(receipt.id).toMatch(/^receipt:demo:validation:/);
		for (const kind of RECEIPT_KINDS.filter((item) => item !== "validation")) {
			expect(appendWorkflowReceipt({ root, topic: "demo", kind, phaseId: "P1", summary: `${kind} receipt` }).kind).toBe(
				kind,
			);
		}
		expect(
			appendWorkflowReceipt({ root, topic: "demo", kind: "audit", phaseId: "P1", summary: "auditor PASS" }).status,
		).toBe("PASS");
		expect(
			runWorkflowCli([
				"receipt-append",
				"--root",
				root,
				"--topic",
				"demo",
				"--kind",
				"no-op",
				"--summary",
				"explicit id",
				"--receipt-id",
				"receipt:demo:explicit",
			]).id,
		).toBe("receipt:demo:explicit");
		expect(() => appendWorkflowReceipt({ root, topic: "demo", kind: "not-a-kind", summary: "bad" })).toThrow(
			"Unsupported receipt kind",
		);

		const pack = upsertContextPack({
			root,
			topic: "demo",
			phaseId: "P1",
			summary: "P1 handoff context",
			validationReceipts: [String(receipt.id)],
		});
		expect(pack.id).toBe("context-pack:demo:P1");
		expect(getWorkflowStatus({ root, topic: "demo" }).context_packs).toBe(1);
		expect(() => upsertContextPack({ root, topic: "demo", phaseId: "P1", summary: "x".repeat(2001) })).toThrow(
			"2000 characters",
		);
		expect(() =>
			upsertContextPack({
				root,
				topic: "demo",
				phaseId: "P1",
				summary: "bad",
				validationReceipts: ["missing-receipt"],
			}),
		).toThrow("does not exist");
		expect(() =>
			upsertContextPack({ root, topic: "demo", phaseId: "P1", summary: "bad", artifacts: ["missing.md"] }),
		).toThrow("does not exist");
		expect(() =>
			upsertContextPack({
				root,
				topic: "demo",
				phaseId: "P1",
				summary: "bad",
				artifacts: [".plan/_private/demo/raw.log"],
			}),
		).toThrow("private raw inputs");
	});

	it("records approvals with deterministic approver fallback and requires explicit CI approvers", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P1"] });
		fs.mkdirSync(path.join(root, ".cartographer"), { recursive: true });
		fs.writeFileSync(path.join(root, ".cartographer", "config.toml"), 'approver = "John Doe"\n', "utf8");

		expect(() =>
			recordWorkflowTransition({
				root,
				topic: "demo",
				action: "advance",
				gate: "plan",
				toState: "implementation-in-progress",
				summary: "Unsafe advance",
			}),
		).toThrow("Missing required context pack");
		appendWorkflowReceipt({ root, topic: "demo", kind: "validation", phaseId: "plan", summary: "plan validation" });
		appendWorkflowReceipt({
			root,
			topic: "demo",
			kind: "audit",
			phaseId: "plan",
			summary: "plan auditor PASS",
			data: { status: "PASS" },
		});
		recordWorkflowTransition({
			root,
			topic: "demo",
			action: "request-approval",
			gate: "plan",
			summary: "Plan ready for approval",
		});
		const approval = recordWorkflowTransition({
			root,
			topic: "demo",
			action: "approve",
			gate: "plan",
			summary: "Plan approved",
		});
		expect(approval.kind).toBe("approval");
		expect(approval.approved_by).toEqual({ approvedBy: "John Doe", source: "config" });
		expect(() =>
			recordWorkflowTransition({
				root,
				topic: "demo",
				action: "approve",
				gate: "plan",
				summary: "Plan approved",
				ci: true,
			}),
		).toThrow("--approved-by is required");
		const advance = recordWorkflowTransition({
			root,
			topic: "demo",
			action: "advance",
			gate: "plan",
			toState: "implementation-in-progress",
			summary: "Advance after approval",
		});
		expect(advance.kind).toBe("transition");
	});

	it("supports shell-friendly hyphenated CLI aliases", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P1"] });

		const result = runWorkflowCli([
			"context-pack-create",
			"--root",
			root,
			"--topic",
			"demo",
			"--phase-id",
			"P1",
			"--summary",
			"CLI context",
		]);
		expect(result.ok).toBe(true);
		expect(result.id).toBe("context-pack:demo:P1");
	});

	it("CLI transition advance honors gate prerequisites and real receipt shapes", () => {
		const root = tempRoot();
		createWorkflowFixture(root, { topic: "demo", phaseIds: ["P1"] });
		const receiptsFile = path.join(root, ".plan", "demo", "receipts.jsonl");
		appendJsonlAtomic(receiptsFile, [
			{
				id: "receipt:plan:validation:demo",
				type: "validation-receipt",
				phase_id: "plan",
				status: "passed",
				validation_ids: ["plan-validate-graph"],
			},
			{
				id: "receipt:plan:audit:demo",
				type: "auditor-receipt",
				phase_id: "plan",
				decision: "PASS",
			},
		]);
		upsertContextPack({ root, topic: "demo", phaseId: "plan", summary: "Plan context" });

		const result = runWorkflowCli([
			"transition-advance",
			"--root",
			root,
			"--topic",
			"demo",
			"--gate",
			"plan",
			"--to",
			"implementation-in-progress",
			"--summary",
			"Advance from CLI",
		]);
		expect(result.ok).toBe(true);
		expect(result.gate).toBe("plan");
	});
});
