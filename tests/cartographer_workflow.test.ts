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
	assertHumanLabel,
	createWorkflowFixture,
	parseMinimalToml,
	resolveApprover,
	updateJsonAtomic,
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
		fs.writeFileSync(path.join(root, ".cartographer", "config.toml"), '[transition]\napproved_by = "Config User"\n', "utf8");

		const resolved = resolveApprover({
			root,
			gitUserName: () => "Git User",
			systemUserName: () => "System User",
		});

		expect(resolved).toEqual({ approvedBy: "Config User", source: "config" });
	});

	it("falls back to git user.name and then system username", () => {
		const root = tempRoot();
		expect(
			resolveApprover({ root, gitUserName: () => "Git User", systemUserName: () => "System User" }),
		).toEqual({ approvedBy: "Git User", source: "git" });
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
		expect(fs.readFileSync(jsonlPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))).toEqual([
			{ id: "a" },
			{ id: "b" },
		]);
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
