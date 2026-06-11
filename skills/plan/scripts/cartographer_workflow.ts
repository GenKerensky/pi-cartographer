import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const LIFECYCLE_STATES = [
	"proposal-draft",
	"proposal-ready-for-human-review",
	"proposal-approved",
	"plan-draft",
	"plan-ready-for-human-review",
	"plan-approved",
	"implementation-in-progress",
	"phase-in-progress",
	"phase-ready-for-human-review",
	"phase-approved",
	"implementation-ready-for-human-review",
	"implemented",
	"blocked",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
export type TransitionGate = "proposal" | "plan" | "phase" | "implementation";

export const HUMAN_APPROVAL_GATES = ["proposal", "plan", "phase", "implementation"] as const satisfies readonly TransitionGate[];

export const RECEIPT_KINDS = [
	"approval",
	"audit",
	"compass",
	"decision",
	"fallback",
	"legacy-bypass",
	"no-op",
	"output-capture",
	"phase",
	"rejection",
	"residual-risk",
	"timeout",
	"transition",
	"validation",
] as const;

export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

export type ApprovalMetadata = {
	approved_by: string;
	approved_at: string;
	summary: string;
	gate: TransitionGate;
	phase_id?: string;
	accepted_residual_risk?: string;
};

export type GatePrerequisite = {
	id: string;
	description: string;
	required: boolean;
};

export const GATE_PREREQUISITES: Record<TransitionGate, GatePrerequisite[]> = {
	proposal: [
		{ id: "proposal-validate-topic", description: "Proposal topic validation passed", required: true },
		{ id: "proposal-context-pack", description: "Proposal context pack exists", required: true },
		{ id: "proposal-auditor-pass", description: "Proposal auditor PASS or approved fallback exists", required: true },
	],
	plan: [
		{ id: "plan-validate-topic", description: "Plan topic validation passed", required: true },
		{ id: "plan-validate-graph", description: "Planning graph validation passed", required: true },
		{ id: "plan-context-pack", description: "Plan context pack exists", required: true },
		{ id: "plan-auditor-pass", description: "Plan auditor PASS or approved fallback exists", required: true },
	],
	phase: [
		{ id: "phase-validation-receipts", description: "Phase validation receipts exist", required: true },
		{ id: "phase-status-sync", description: "plan.md and plan.nodes.jsonl status are synchronized", required: true },
		{ id: "phase-context-pack", description: "Phase context pack exists", required: true },
		{ id: "phase-auditor-pass", description: "Phase auditor PASS or approved fallback exists", required: true },
	],
	implementation: [
		{ id: "implementation-full-validation", description: "Full project validation passed", required: true },
		{ id: "implementation-topic-validation", description: "Topic and planning graph validation passed", required: true },
		{ id: "implementation-final-audit", description: "Final auditor PASS or approved fallback exists", required: true },
		{ id: "implementation-adr", description: "Required ADR handling is complete", required: true },
	],
};

export type ResolveApproverOptions = {
	root: string;
	explicitApprovedBy?: string;
	env?: NodeJS.ProcessEnv;
	gitUserName?: () => string | undefined;
	systemUserName?: () => string | undefined;
};

export type ResolvedApprover = {
	approvedBy: string;
	source: "explicit" | "config" | "git" | "system";
};

const SECRET_LIKE_RE = /(?:token|secret|password|passwd|apikey|api[_-]?key|bearer\s+[a-z0-9._-]+)/i;

export function assertHumanLabel(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error("Approver label must not be empty");
	if (trimmed.length > 120) throw new Error("Approver label is too long");
	if (SECRET_LIKE_RE.test(trimmed)) throw new Error("Approver label appears to contain a secret-like value");
	return trimmed;
}

export function readCartographerConfig(root: string): Record<string, unknown> {
	const configPath = path.join(root, ".cartographer", "config.toml");
	if (!fs.existsSync(configPath)) return {};
	return parseMinimalToml(fs.readFileSync(configPath, "utf8"));
}

export function parseMinimalToml(text: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	let section: Record<string, unknown> = result;
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/\s+#.*$/, "").trim();
		if (!line) continue;
		const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)]$/);
		if (sectionMatch) {
			const names = sectionMatch[1].split(".");
			section = result;
			for (const name of names) {
				const existing = section[name];
				if (existing && (typeof existing !== "object" || Array.isArray(existing)))
					throw new Error(`Invalid TOML section collision: ${sectionMatch[1]}`);
				section[name] = (existing as Record<string, unknown> | undefined) ?? {};
				section = section[name] as Record<string, unknown>;
			}
			continue;
		}
		const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
		if (!assignment) throw new Error(`Unsupported config.toml line: ${rawLine}`);
		section[assignment[1]] = parseTomlValue(assignment[2]);
	}
	return result;
}

function parseTomlValue(raw: string): unknown {
	const value = raw.trim();
	const stringMatch = value.match(/^"((?:[^"\\]|\\.)*)"$/) ?? value.match(/^'([^']*)'$/);
	if (stringMatch) return stringMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
	if (value === "true") return true;
	if (value === "false") return false;
	if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
	throw new Error(`Unsupported config.toml value: ${raw}`);
}

export function resolveApprover(options: ResolveApproverOptions): ResolvedApprover {
	if (options.explicitApprovedBy) return { approvedBy: assertHumanLabel(options.explicitApprovedBy), source: "explicit" };

	const config = readCartographerConfig(options.root);
	const configApprover = approverFromConfig(config);
	if (configApprover) return { approvedBy: assertHumanLabel(configApprover), source: "config" };

	const gitUser = options.gitUserName ? options.gitUserName() : gitConfigUserName(options.root);
	if (gitUser) return { approvedBy: assertHumanLabel(gitUser), source: "git" };

	const systemUser = options.systemUserName ? options.systemUserName() : systemUserName(options.env ?? process.env);
	if (systemUser) return { approvedBy: assertHumanLabel(systemUser), source: "system" };

	throw new Error("Could not resolve approver identity");
}

function approverFromConfig(config: Record<string, unknown>): string | undefined {
	if (typeof config.approver === "string") return config.approver;
	const transition = config.transition;
	if (transition && typeof transition === "object" && !Array.isArray(transition)) {
		const approvedBy = (transition as Record<string, unknown>).approved_by;
		if (typeof approvedBy === "string") return approvedBy;
	}
	return undefined;
}

function gitConfigUserName(root: string): string | undefined {
	try {
		return execFileSync("git", ["config", "user.name"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

function systemUserName(env: NodeJS.ProcessEnv): string | undefined {
	return env.USER || env.LOGNAME || env.USERNAME || os.userInfo().username;
}

export function writeJsonAtomic(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
	fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	fs.renameSync(tmp, filePath);
}

export function appendJsonlAtomic(filePath: string, records: readonly Record<string, unknown>[]): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
	const suffix = records.map((record) => `${JSON.stringify(record)}\n`).join("");
	const tmp = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
	fs.writeFileSync(tmp, `${existing}${suffix}`, "utf8");
	fs.renameSync(tmp, filePath);
}

export function updateJsonAtomic<T>(filePath: string, update: (current: T) => T): T {
	const current = JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
	const next = update(current);
	writeJsonAtomic(filePath, next);
	return next;
}

export type FixtureOptions = {
	topic?: string;
	phaseIds?: string[];
};

export function createWorkflowFixture(root: string, options: FixtureOptions = {}): { root: string; topic: string; topicDir: string } {
	const topic = options.topic ?? "demo";
	const phaseIds = options.phaseIds ?? ["P0"];
	const topicDir = path.join(root, ".plan", topic);
	fs.mkdirSync(topicDir, { recursive: true });
	fs.mkdirSync(path.join(root, ".cartographer"), { recursive: true });
	const planMd = [`# ${topic} Plan`, "", "## Phases", ""];
	const nodes: Record<string, unknown>[] = [{ id: `plan:${topic}`, type: "plan", title: `${topic} Plan`, source: "plan.md" }];
	const edges: Record<string, unknown>[] = [];
	for (const [index, phaseId] of phaseIds.entries()) {
		planMd.push(`### Phase ${phaseId} — Fixture Phase ${index}`, "", "- **Status:** pending", "", "#### Checklist", `- [ ] **${phaseId}.T1** Fixture task.`, "", "#### Validation", `- [ ] **${phaseId}.V1** Fixture validation.`, "");
		nodes.push({ id: `phase:${phaseId}`, type: "phase", phase_id: phaseId, title: `Fixture Phase ${index}`, status: "pending", depends_on: index ? [phaseIds[index - 1]] : [], source: "plan.md" });
		nodes.push({ id: `task:${phaseId}.T1`, type: "task", task_id: `${phaseId}.T1`, phase_id: phaseId, title: "Fixture task", status: "pending", source: "plan.md" });
		nodes.push({ id: `validation:${phaseId}.V1`, type: "validation", validation_id: `${phaseId}.V1`, phase_id: phaseId, title: "Fixture validation", status: "pending", command: "node -e \"process.exit(0)\"", source: "plan.md" });
		edges.push({ from: `plan:${topic}`, to: `phase:${phaseId}`, type: "contains" });
		edges.push({ from: `phase:${phaseId}`, to: `task:${phaseId}.T1`, type: "contains" });
		edges.push({ from: `phase:${phaseId}`, to: `validation:${phaseId}.V1`, type: "contains" });
		if (index) edges.push({ from: `phase:${phaseId}`, to: `phase:${phaseIds[index - 1]}`, type: "depends_on" });
	}
	fs.writeFileSync(path.join(topicDir, "proposal.md"), `# ${topic} Proposal\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.md"), `${planMd.join("\n")}\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.nodes.jsonl"), nodes.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.edges.jsonl"), edges.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
	for (const file of ["map.nodes.jsonl", "map.edges.jsonl", "facts.nodes.jsonl", "facts.edges.jsonl", "receipts.jsonl", "context-packs.jsonl"])
		fs.writeFileSync(path.join(topicDir, file), "", "utf8");
	return { root, topic, topicDir };
}
