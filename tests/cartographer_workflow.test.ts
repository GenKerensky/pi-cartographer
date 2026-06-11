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
	createWorkflowFixture,
	finalizeProposal,
	getWorkflowStatus,
	initProposal,
	parseMinimalToml,
	recordWorkflowTransition,
	resolveApprover,
	runWorkflowCli,
	supportFact,
	syncProposalAdr,
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
