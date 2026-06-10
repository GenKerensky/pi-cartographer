import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STATE_SCRIPT = path.join(ROOT, "skills", "plan", "scripts", "cartographer_state.ts");

type JsonRecord = Record<string, unknown>;

function runState(args: string[], root: string, expectFailure = false): JsonRecord {
	try {
		const output = execFileSync("node", ["--experimental-strip-types", STATE_SCRIPT, ...args, "--json"], {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (expectFailure) throw new Error(`Expected failure but command passed: ${args.join(" ")}`);
		return JSON.parse(output) as JsonRecord;
	} catch (error) {
		if (!expectFailure) throw error;
		const childError = error as { stderr?: string; stdout?: string };
		return JSON.parse(childError.stderr || childError.stdout || "{}") as JsonRecord;
	}
}

function makeProject(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-state-"));
	const topicDir = path.join(root, ".plan", "demo");
	fs.mkdirSync(topicDir, { recursive: true });
	fs.writeFileSync(path.join(topicDir, "plan.md"), "# demo Plan\n", "utf8");
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
				title: "Check",
			},
		]
			.map((record) => JSON.stringify(record))
			.join("\n") + "\n",
		"utf8",
	);
	fs.writeFileSync(path.join(topicDir, "plan.edges.jsonl"), "", "utf8");
	fs.writeFileSync(
		path.join(topicDir, "receipts.jsonl"),
		`${JSON.stringify({ id: "receipt:P0", type: "validation-receipt", status: "passed", commands: [{ command: "ok", result: "passed" }] })}\n`,
		"utf8",
	);
	fs.writeFileSync(path.join(topicDir, "context-packs.jsonl"), "", "utf8");
	fs.writeFileSync(path.join(root, "README.md"), "fixture\n", "utf8");
	return root;
}

function digest(filePath: string): string | null {
	return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

describe("cartographer_state CLI", () => {
	it("initializes and validates minimal state, journal, schemas, and ignored current pointer shape in a temp project", () => {
		const project = makeProject();
		const result = runState(["state-init", "--root", project, "--topic", "demo"], project);

		expect(result.ok).toBe(true);
		expect(fs.existsSync(path.join(project, ".cartographer", "demo", "state.json"))).toBe(true);
		expect(fs.existsSync(path.join(project, ".cartographer", "demo", "journal.jsonl"))).toBe(true);
		expect(fs.existsSync(path.join(project, ".cartographer", "demo", "schemas", "state.schema.json"))).toBe(true);
		expect(fs.existsSync(path.join(ROOT, ".cartographer", "demo", "state.json"))).toBe(false);

		const current = runState(["current-set", "--root", project, "--topic", "demo", "--git-branch", "test"], project);
		expect(current.ok).toBe(true);
		const pointer = JSON.parse(fs.readFileSync(path.join(project, ".cartographer", "current.json"), "utf8"));
		expect(pointer.active_topic).toBe("demo");
		expect(pointer.state_path).toBe(".cartographer/demo/state.json");
	});

	it("rejects duplicate plan truth, raw private journal paths, and multiple next actions", () => {
		const project = makeProject();
		runState(["state-init", "--root", project, "--topic", "demo"], project);
		fs.writeFileSync(path.join(project, ".cartographer", "demo", "plan.json"), "{}\n", "utf8");
		const duplicate = runState(["state-validate", "--root", project, "--topic", "demo"], project, true);
		expect(duplicate.error || JSON.stringify(duplicate)).toContain("plan.json");
		fs.unlinkSync(path.join(project, ".cartographer", "demo", "plan.json"));

		const invalidJournal = runState(
			[
				"journal-append",
				"--root",
				project,
				"--topic",
				"demo",
				"--record-json",
				JSON.stringify({
					id: "journal:bad",
					ts: "2026-06-10T00:00:00Z",
					kind: "gotcha",
					summary: "tool call raw log",
					impact: "See .plan/_private/demo/raw.log",
					evidence: [{ path: ".plan/_private/demo/raw.log" }],
					importance: 4,
					status: "active",
				}),
			],
			project,
			true,
		);
		expect(invalidJournal.error || JSON.stringify(invalidJournal)).toContain("raw .plan/_private");

		const statePath = path.join(project, ".cartographer", "demo", "state.json");
		const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
		state.next_action = [{ id: "next:bad" }];
		fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
		const multiNext = runState(["state-validate", "--root", project, "--topic", "demo"], project, true);
		expect(multiNext.error || JSON.stringify(multiNext)).toContain("next_action");
	});

	it("mutates state through semantic commands and renders resume context read-only", () => {
		const project = makeProject();
		runState(["state-init", "--root", project, "--topic", "demo"], project);
		const next = runState(
			[
				"state-set-next",
				"--root",
				project,
				"--topic",
				"demo",
				"--next-action-json",
				JSON.stringify({ id: "next:P0.T1", kind: "inspect", summary: "Inspect README.", task_id: "P0.T1" }),
			],
			project,
		);
		expect(next.ok).toBe(true);

		const workingSet = runState(
			[
				"state-set-working-set",
				"--root",
				project,
				"--topic",
				"demo",
				"--working-set-json",
				JSON.stringify({
					write_allowed: [{ path: "README.md", reason: "fixture" }],
					read_only: [],
					forbidden: [{ path: ".plan/_private/**", reason: "private" }],
				}),
			],
			project,
		);
		expect(workingSet.ok).toBe(true);

		runState(
			[
				"journal-append",
				"--root",
				project,
				"--topic",
				"demo",
				"--record-json",
				JSON.stringify({
					id: "journal:lesson",
					ts: "2026-06-10T00:00:00Z",
					kind: "constraint",
					summary: "Keep the journal curated.",
					impact: "Do not store raw logs or routine receipts.",
					evidence: [{ receipt_id: "receipt:P0" }],
					importance: 5,
					status: "active",
				}),
			],
			project,
		);
		const files = [
			path.join(project, ".cartographer", "demo", "state.json"),
			path.join(project, ".cartographer", "demo", "journal.jsonl"),
			path.join(project, ".cartographer", "current.json"),
		];
		const before = files.map(digest);
		const resume = runState(["state-resume", "--root", project, "--topic", "demo"], project);
		const after = files.map(digest);

		expect(resume.ok).toBe(true);
		expect(resume.read_only).toBe(true);
		expect(resume.context).toContain("CARTOGRAPHER_RESUME_CONTEXT");
		expect(resume.context).toContain("Required first response");
		expect(JSON.stringify(before)).toBe(JSON.stringify(after));
	});
});
