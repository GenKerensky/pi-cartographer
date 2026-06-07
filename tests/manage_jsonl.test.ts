import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.resolve("skills/plan/scripts/manage_jsonl.ts");

function runJson(args: string[], cwd = process.cwd()): any {
	const stdout = execFileSync(
		"node",
		["--experimental-strip-types", script, ...args, "--json"],
		{
			cwd,
			encoding: "utf8",
		},
	);
	return JSON.parse(stdout);
}

function runJsonUnchecked(args: string[], cwd = process.cwd()): any {
	const result = spawnSync(
		"node",
		["--experimental-strip-types", script, ...args, "--json"],
		{ cwd, encoding: "utf8" },
	);
	return { status: result.status, payload: JSON.parse(result.stdout) };
}

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-jsonl-"));
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
		expect(records).toEqual([
			{ description: "Merged", id: "N1", title: "Old", type: "thing" },
		]);

		const validation = runJson([
			"validate-file",
			"--file",
			file,
			"--require-id",
		]);
		expect(validation.ok).toBe(true);
	});

	it("seeds reusable Pi docs facts", () => {
		const root = tempDir();
		fs.mkdirSync(path.join(root, ".plan", "demo"), { recursive: true });

		const seeded = runJson([
			"seed-pi-facts",
			"--root",
			root,
			"--topic",
			"demo",
		]);
		expect(seeded.ok).toBe(true);
		expect(seeded.nodes.count).toBeGreaterThanOrEqual(11);

		const facts = fs.readFileSync(
			path.join(root, ".plan", "demo", "facts.nodes.jsonl"),
			"utf8",
		);
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

		fs.appendFileSync(
			missFile,
			`${JSON.stringify({ id: "miss:2", failure_type: "bad", text: "raw" })}\n`,
			"utf8",
		);
		const invalidMisses = runJsonUnchecked(["validate-misses", "--root", root]);
		expect(invalidMisses.status).not.toBe(0);
		expect(invalidMisses.payload.ok).toBe(false);
		expect(invalidMisses.payload.errors.join("\n")).toContain("Invalid failure_type");
		expect(invalidMisses.payload.errors.join("\n")).toContain("Raw snippet");
	});

	it("validates topic fact citations and support edges", () => {
		const root = tempDir();
		const topicDir = path.join(root, ".plan", "demo");
		fs.mkdirSync(topicDir, { recursive: true });
		fs.writeFileSync(path.join(root, "README.md"), "hello\n", "utf8");
		fs.writeFileSync(
			path.join(topicDir, "proposal.md"),
			"# Demo\n\nUses [F001].\n",
			"utf8",
		);
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

		const report = runJson([
			"validate-topic",
			"--root",
			root,
			"--topic",
			"demo",
		]);
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
		fs.writeFileSync(path.join(topicDir, "map.nodes.jsonl"), `${JSON.stringify({ id: "topic:demo", type: "topic", title: "Demo" })}\n`, "utf8");
		fs.writeFileSync(path.join(topicDir, "map.edges.jsonl"), "", "utf8");
		fs.writeFileSync(path.join(evidenceDir, "artifact-analysis.md"), "# Evidence Analysis: artifact\n\n## Source Handling\n- Redaction status: passed\n", "utf8");
		fs.writeFileSync(
			path.join(topicDir, "facts.nodes.jsonl"),
			`${JSON.stringify({ id: "S001", type: "source", title: "Evidence", source_kind: "sanitized_evidence", reference: ".plan/demo/evidence/artifact-analysis.md:1" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact" })}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(topicDir, "facts.edges.jsonl"), `${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`, "utf8");

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
		fs.writeFileSync(path.join(topicDir, "map.nodes.jsonl"), `${JSON.stringify({ id: "topic:demo", type: "topic", title: "Demo" })}\n`, "utf8");
		fs.writeFileSync(path.join(topicDir, "map.edges.jsonl"), "", "utf8");
		const fakeToken = `ghp_${"123456789012345678901234567890123456"}`;
		fs.writeFileSync(path.join(evidenceDir, "artifact-analysis.md"), `# Evidence Analysis: artifact\n\n${fakeToken}\n`, "utf8");
		fs.writeFileSync(
			path.join(topicDir, "facts.nodes.jsonl"),
			`${JSON.stringify({ id: "S001", type: "source", title: "Evidence", source_kind: "sanitized_evidence", reference: ".plan/demo/evidence/artifact-analysis.md:1" })}\n${JSON.stringify({ id: "F001", type: "fact", title: "Fact", raw_archive_path: ".plan/_private/demo/raw.log" })}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(topicDir, "facts.edges.jsonl"), `${JSON.stringify({ from: "F001", to: "S001", type: "supported_by" })}\n`, "utf8");

		const report = runJsonUnchecked(["validate-topic", "--root", root, "--topic", "demo"]);
		expect(report.status).not.toBe(0);
		expect(report.payload.errors.join("\n")).toContain("Potential secret pattern");
		expect(report.payload.errors.join("\n")).toContain("Direct private artifact reference");
		expect(report.payload.errors.join("\n")).toContain("lacks Redaction status");
	});
});
