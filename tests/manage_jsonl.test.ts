import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.resolve("skills/plan/scripts/manage_jsonl.ts");

function runJson(args: string[], cwd = process.cwd()): any {
	const stdout = execFileSync("node", ["--experimental-strip-types", script, ...args, "--json"], {
		cwd,
		encoding: "utf8",
	});
	return JSON.parse(stdout);
}

function runJsonUnchecked(args: string[], cwd = process.cwd()): any {
	const result = spawnSync("node", ["--experimental-strip-types", script, ...args, "--json"], {
		cwd,
		encoding: "utf8",
	});
	return { status: result.status, payload: JSON.parse(result.stdout) };
}

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-jsonl-"));
}

function writeTopicFixture(root: string, topic = "demo"): string {
	const topicDir = path.join(root, ".plan", topic);
	const evidenceDir = path.join(topicDir, "evidence");
	fs.mkdirSync(evidenceDir, { recursive: true });
	fs.writeFileSync(path.join(topicDir, "proposal.md"), "# Demo\n\nUses [F001] and [F999].\n", "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.md"), "# Plan\n\nUses [F001] and [F002].\n", "utf8");
	fs.writeFileSync(
		path.join(topicDir, "map.nodes.jsonl"),
		`${JSON.stringify({ id: "topic:demo", type: "topic", title: "Demo" })}\n`,
		"utf8",
	);
	fs.writeFileSync(path.join(topicDir, "map.edges.jsonl"), "", "utf8");
	fs.writeFileSync(
		path.join(topicDir, "facts.nodes.jsonl"),
		`${JSON.stringify({ id: "S001", type: "source", title: "Evidence", reference: ".plan/demo/evidence/analysis.md:1" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact", claim: "Claim", raw_archive_path: ".plan/_private/demo/raw.log" })}\n${JSON.stringify({ id: "F002", type: "fact", title: "Unsupported" })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "facts.edges.jsonl"),
		`${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "receipts.jsonl"),
		`${JSON.stringify({ id: "receipt:P1", type: "validation-receipt", status: "passed", phase_id: "P1", commands: [{ command: "test", result: "passed", output: ".plan/_private/demo/out.log" }] })}\n`,
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "context-packs.jsonl"),
		`${JSON.stringify({ id: "context:P2", type: "context-pack", phase_id: "P2", summary: "Compact", references: [".plan/_private/demo/raw.log", ".plan/demo/proposal.md"] })}\n`,
		"utf8",
	);
	fs.writeFileSync(path.join(evidenceDir, "analysis.md"), "# Evidence\n\n- Redaction status: passed\n", "utf8");
	fs.writeFileSync(
		path.join(evidenceDir, "manifest.jsonl"),
		`${JSON.stringify({ id: "evidence:1", path: ".plan/_private/demo/raw.log", summary: "Imported" })}\n`,
		"utf8",
	);
	return topicDir;
}

describe("manage_jsonl CLI", () => {
	it("upserts and merges records by id", () => {
		const dir = tempDir();
		const file = path.join(dir, "nodes.jsonl");

		const inserted = runJson([
			"upsert",
			"--file",
			file,
			"--record",
			JSON.stringify({ id: "N1", type: "thing", title: "Old" }),
		]);
		expect(inserted.action).toBe("inserted");

		const updated = runJson([
			"upsert",
			"--file",
			file,
			"--record",
			JSON.stringify({ id: "N1", description: "Merged" }),
		]);
		expect(updated.action).toBe("updated");

		const records = fs
			.readFileSync(file, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(records).toEqual([{ description: "Merged", id: "N1", title: "Old", type: "thing" }]);

		const validation = runJson(["validate-file", "--file", file, "--require-id"]);
		expect(validation.ok).toBe(true);
	});

	it("seeds reusable Pi docs facts", () => {
		const root = tempDir();
		fs.mkdirSync(path.join(root, ".plan", "demo"), { recursive: true });

		const seeded = runJson(["seed-pi-facts", "--root", root, "--topic", "demo"]);
		expect(seeded.ok).toBe(true);
		expect(seeded.nodes.count).toBeGreaterThanOrEqual(11);

		const facts = fs.readFileSync(path.join(root, ".plan", "demo", "facts.nodes.jsonl"), "utf8");
		expect(facts).toContain("F900");
		expect(facts).toContain("S904");
	});

	it("validates lifecycle, verification evidence, and miss logs", () => {
		const root = tempDir();
		const file = path.join(root, "nodes.jsonl");
		fs.writeFileSync(
			file,
			`${JSON.stringify({ id: "N1", type: "artifact", lifecycle: "bogus" })}\n${JSON.stringify({ id: "N2", type: "file", verified: true })}\n`,
			"utf8",
		);
		const validation = runJsonUnchecked(["validate-file", "--file", file]);
		expect(validation.status).not.toBe(0);
		expect(validation.payload.ok).toBe(false);
		expect(validation.payload.errors.join("\n")).toContain("Invalid lifecycle");
		expect(validation.payload.errors.join("\n")).toContain("verified=true");

		const missDir = path.join(root, ".plan", "_retrieval");
		fs.mkdirSync(missDir, { recursive: true });
		const missFile = path.join(missDir, "misses.jsonl");
		fs.writeFileSync(
			missFile,
			`${JSON.stringify({ id: "miss:1", created_at: "2026-06-07T00:00:00+00:00", original_query: "config", failure_type: "vocabulary_mismatch", resolution: "query_expansion" })}\n`,
			"utf8",
		);
		const missValidation = runJson(["validate-misses", "--root", root]);
		expect(missValidation.ok).toBe(true);
		const missList = runJson(["list-misses", "--root", root]);
		expect(missList.count).toBe(1);

		fs.appendFileSync(missFile, `${JSON.stringify({ id: "miss:2", failure_type: "bad", text: "raw" })}\n`, "utf8");
		const invalidMisses = runJsonUnchecked(["validate-misses", "--root", root]);
		expect(invalidMisses.status).not.toBe(0);
		expect(invalidMisses.payload.ok).toBe(false);
		expect(invalidMisses.payload.errors.join("\n")).toContain("Invalid failure_type");
		expect(invalidMisses.payload.errors.join("\n")).toContain("Raw snippet");
	});

	it("validates receipt and context pack files", () => {
		const root = tempDir();
		const receipts = path.join(root, "receipts.jsonl");
		fs.writeFileSync(
			receipts,
			`${JSON.stringify({ id: "receipt:P1", type: "validation-receipt", status: "passed", phase_id: "P1", commands: [{ command: "npm run test", result: "passed" }] })}\n`,
			"utf8",
		);
		expect(runJson(["validate-file", "--file", receipts]).ok).toBe(true);

		const contextPacks = path.join(root, "context-packs.jsonl");
		fs.writeFileSync(
			contextPacks,
			`${JSON.stringify({ id: "context:P1", type: "context-pack", phase_id: "P1", summary: "Focused context", budget_tokens: 1000, references: ["README.md:1"] })}\n`,
			"utf8",
		);
		expect(runJson(["validate-file", "--file", contextPacks]).ok).toBe(true);

		fs.writeFileSync(
			receipts,
			`${JSON.stringify({ id: "receipt:timeout", type: "subagent-receipt", status: "timed-out", phase_id: "P1" })}\n${JSON.stringify({ id: "receipt:failed", type: "validation-receipt", status: "failed", phase_id: "P1", commands: [{ command: "test", result: "failed" }] })}\n`,
			"utf8",
		);
		const invalid = runJsonUnchecked(["validate-file", "--file", receipts]);
		expect(invalid.status).not.toBe(0);
		expect(invalid.payload.errors.join("\n")).toContain("timeout receipt lacks fallback decision");
		expect(invalid.payload.errors.join("\n")).toContain("failure receipt lacks fallback decision");
	});

	it("validates topic fact citations and support edges", () => {
		const root = tempDir();
		const topicDir = path.join(root, ".plan", "demo");
		fs.mkdirSync(topicDir, { recursive: true });
		fs.writeFileSync(path.join(root, "README.md"), "hello\n", "utf8");
		fs.writeFileSync(path.join(topicDir, "proposal.md"), "# Demo\n\nUses [F001].\n", "utf8");
		fs.writeFileSync(
			path.join(topicDir, "map.nodes.jsonl"),
			`${JSON.stringify({ id: "topic:demo", type: "topic", title: "Demo" })}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(topicDir, "map.edges.jsonl"), "", "utf8");
		fs.writeFileSync(
			path.join(topicDir, "facts.nodes.jsonl"),
			`${JSON.stringify({ id: "S001", type: "source", title: "Readme", reference: "README.md:1" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact" })}\n`,
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "facts.edges.jsonl"),
			`${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`,
			"utf8",
		);

		const report = runJson(["validate-topic", "--root", root, "--topic", "demo"]);
		expect(report.ok).toBe(true);
		expect(report.counts.fact_nodes).toBe(2);
	});

	it("validates sanitized evidence sources", () => {
		const root = tempDir();
		const topicDir = path.join(root, ".plan", "demo");
		const evidenceDir = path.join(topicDir, "evidence");
		fs.mkdirSync(evidenceDir, { recursive: true });
		fs.writeFileSync(path.join(root, "README.md"), "hello\n", "utf8");
		fs.writeFileSync(path.join(topicDir, "proposal.md"), "# Demo\n\nUses [F001].\n", "utf8");
		fs.writeFileSync(
			path.join(topicDir, "map.nodes.jsonl"),
			`${JSON.stringify({ id: "topic:demo", type: "topic", title: "Demo" })}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(topicDir, "map.edges.jsonl"), "", "utf8");
		fs.writeFileSync(
			path.join(evidenceDir, "artifact-analysis.md"),
			"# Evidence Analysis: artifact\n\n## Source Handling\n- Redaction status: passed\n",
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "facts.nodes.jsonl"),
			`${JSON.stringify({ id: "S001", type: "source", title: "Evidence", source_kind: "sanitized_evidence", reference: ".plan/demo/evidence/artifact-analysis.md:1" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact" })}\n`,
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "facts.edges.jsonl"),
			`${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`,
			"utf8",
		);

		const report = runJson(["validate-topic", "--root", root, "--topic", "demo"]);
		expect(report.ok).toBe(true);
		expect(report.counts.evidence_files).toBe(1);
	});

	it("rejects unsafe evidence artifacts", () => {
		const root = tempDir();
		const topicDir = path.join(root, ".plan", "demo");
		const evidenceDir = path.join(topicDir, "evidence");
		fs.mkdirSync(evidenceDir, { recursive: true });
		fs.writeFileSync(path.join(topicDir, "proposal.md"), "# Demo\n\nUses [F001].\n", "utf8");
		fs.writeFileSync(
			path.join(topicDir, "map.nodes.jsonl"),
			`${JSON.stringify({ id: "topic:demo", type: "topic", title: "Demo" })}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(topicDir, "map.edges.jsonl"), "", "utf8");
		const fakeToken = `ghp_${"123456789012345678901234567890123456"}`;
		fs.writeFileSync(
			path.join(evidenceDir, "artifact-analysis.md"),
			`# Evidence Analysis: artifact\n\n${fakeToken}\n`,
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "facts.nodes.jsonl"),
			`${JSON.stringify({ id: "S001", type: "source", title: "Evidence", source_kind: "sanitized_evidence", reference: ".plan/demo/evidence/artifact-analysis.md:1" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact", raw_archive_path: ".plan/_private/demo/raw.log" })}\n`,
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "facts.edges.jsonl"),
			`${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`,
			"utf8",
		);

		const report = runJsonUnchecked(["validate-topic", "--root", root, "--topic", "demo"]);
		expect(report.status).not.toBe(0);
		expect(report.payload.errors.join("\n")).toContain("Potential secret pattern");
		expect(report.payload.errors.join("\n")).toContain("Direct private artifact reference");
		expect(report.payload.errors.join("\n")).toContain("lacks Redaction status");
	});

	it("provides compact read-only artifact summaries without private raw references", () => {
		const root = tempDir();
		writeTopicFixture(root);

		const list = runJson([
			"list-records",
			"--root",
			root,
			"--topic",
			"demo",
			"--artifact",
			"facts.nodes",
			"--limit",
			"1",
		]);
		expect(list.ok).toBe(true);
		expect(list.records).toHaveLength(1);
		expect(JSON.stringify(list)).not.toContain(".plan/_private/demo/raw.log");
		expect(JSON.stringify(list).length).toBeLessThan(1200);

		const shown = runJson([
			"show-record",
			"--root",
			root,
			"--topic",
			"demo",
			"--artifact",
			"facts.nodes",
			"--id",
			"F001",
		]);
		expect(shown.record.raw_archive_path).toBeUndefined();
		expect(JSON.stringify(shown)).not.toContain(".plan/_private/demo/raw.log");
	});

	it("summarizes fact citations, receipts, context packs, and evidence manifests read-only", () => {
		const root = tempDir();
		writeTopicFixture(root);

		const citationResult = runJsonUnchecked(["fact-citation-summary", "--root", root, "--topic", "demo"]);
		expect(citationResult.status).not.toBe(0);
		const citations = citationResult.payload;
		expect(citations.ok).toBe(false);
		expect(citations.missing).toEqual(["F999"]);
		expect(citations.unsupported).toEqual(["F002"]);
		expect(citations.counts.proposal_citations).toBe(2);

		const receipts = runJson(["receipt-summary", "--root", root, "--topic", "demo"]);
		expect(receipts.counts.by_status.passed).toBe(1);
		expect(JSON.stringify(receipts)).not.toContain(".plan/_private/demo/out.log");

		const packs = runJson(["context-pack-summary", "--root", root, "--topic", "demo"]);
		expect(packs.context_packs[0].references[0]).toBe(".plan/_private/<redacted>");

		const evidence = runJson(["evidence-manifest-summary", "--root", root, "--topic", "demo"]);
		expect(evidence.counts.manifest_records).toBe(1);
		expect(JSON.stringify(evidence)).not.toContain(".plan/_private/demo/raw.log");
	});

	it("does not expose upsert through read-only artifact commands", () => {
		const root = tempDir();
		writeTopicFixture(root);
		const before = fs.readFileSync(path.join(root, ".plan", "demo", "facts.nodes.jsonl"), "utf8");
		const result = spawnSync(
			"node",
			["--experimental-strip-types", script, "upsert-record", "--root", root, "--topic", "demo", "--json"],
			{ encoding: "utf8" },
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Unknown command");
		expect(fs.readFileSync(path.join(root, ".plan", "demo", "facts.nodes.jsonl"), "utf8")).toBe(before);
	});

	it("summarizes the next executable phase with acceptance contract fields", () => {
		const root = tempDir();
		const topicDir = path.join(root, ".plan", "demo");
		fs.mkdirSync(topicDir, { recursive: true });
		fs.writeFileSync(
			path.join(topicDir, "plan.md"),
			`# demo Plan\n\n## Phases\n\n### Phase P0 — Setup\n\n- **Status:** complete\n- **Depends on:** none\n\n#### Objective\nDone work.\n\n#### Checklist\n- [x] **P0.T1** Done.\n\n#### Validation\n- [x] **P0.V1** Done.\n\n### Phase P1 — Build\n\n- **Status:** pending\n- **Depends on:** P0\n\n#### Objective\nBuild the helper.\n\n#### Scope\nOnly helper files.\n\n#### Checklist\n- [ ] **P1.T1** Implement helper.\n\n#### Validation\n- [ ] **P1.V1** npm run test:ts\n`,
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "plan.nodes.jsonl"),
			[
				{ id: "plan:demo", type: "plan" },
				{ id: "phase:P0", type: "phase", phase_id: "P0", title: "Setup", status: "complete" },
				{
					id: "phase:P1",
					type: "phase",
					phase_id: "P1",
					title: "Build",
					status: "pending",
					depends_on: ["P0"],
					references: ["file:skills/plan/scripts/manage_jsonl.ts"],
				},
				{ id: "task:P1.T1", type: "task", task_id: "P1.T1", phase_id: "P1", title: "Implement helper" },
				{
					id: "validation:P1.V1",
					type: "validation",
					validation_id: "P1.V1",
					phase_id: "P1",
					title: "Run tests",
					command: "npm run test:ts",
				},
			]
				.map((record) => JSON.stringify(record))
				.join("\n") + "\n",
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "plan.edges.jsonl"),
			`${JSON.stringify({ from: "phase:P1", to: "phase:P0", type: "depends_on" })}\n`,
			"utf8",
		);

		const summary = runJson(["phase-summary", "--root", root, "--topic", "demo"]);
		expect(summary.ok).toBe(true);
		expect(summary.next_executable_phase_id).toBe("P1");
		expect(summary.phase.executable).toBe(true);
		expect(summary.checklist[0].id).toBe("P1.T1");
		expect(summary.validations[0].id).toBe("P1.V1");
		expect(summary.suggested_subagent_contract.acceptance_criteria[0].id).toBe("P1.T1");
		expect(summary.suggested_subagent_contract.evidence).toContain("validation-output");
		expect(summary.suggested_subagent_contract.verify_commands).toEqual(["npm run test:ts"]);
		expect(summary.suggested_subagent_contract.stop_rules.join("\n")).toContain("outside the assigned phase");
	});

	it("reports dependency blockers and does not mutate the real repository .plan", () => {
		const realPlan = path.resolve(".plan");
		const before = fs.existsSync(realPlan) ? fs.statSync(realPlan).mtimeMs : undefined;
		const root = tempDir();
		const topicDir = path.join(root, ".plan", "demo");
		fs.mkdirSync(topicDir, { recursive: true });
		fs.writeFileSync(
			path.join(topicDir, "plan.md"),
			"# demo Plan\n\n### Phase P0 — Setup\n\n#### Checklist\n- [ ] **P0.T1** Setup.\n\n### Phase P1 — Build\n\n#### Checklist\n- [ ] **P1.T1** Build.\n",
			"utf8",
		);
		fs.writeFileSync(
			path.join(topicDir, "plan.nodes.jsonl"),
			[
				{ id: "phase:P0", type: "phase", phase_id: "P0", status: "pending" },
				{ id: "phase:P1", type: "phase", phase_id: "P1", status: "pending", depends_on: ["P0"] },
				{ id: "task:P1.T1", type: "task", task_id: "P1.T1", phase_id: "P1", title: "Build" },
			]
				.map((record) => JSON.stringify(record))
				.join("\n") + "\n",
			"utf8",
		);
		fs.writeFileSync(path.join(topicDir, "plan.edges.jsonl"), "", "utf8");

		const blocked = runJson(["phase-summary", "--root", root, "--topic", "demo", "--phase-id", "P1"]);
		expect(blocked.phase.executable).toBe(false);
		expect(blocked.phase.blocked_by).toEqual(["P0"]);
		const after = fs.existsSync(realPlan) ? fs.statSync(realPlan).mtimeMs : undefined;
		expect(after).toBe(before);
	});
});
