import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
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
});
