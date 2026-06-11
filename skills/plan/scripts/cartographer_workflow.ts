import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const HUMAN_APPROVAL_GATES = [
	"proposal",
	"plan",
	"phase",
	"implementation",
] as const satisfies readonly TransitionGate[];

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
		{
			id: "implementation-topic-validation",
			description: "Topic and planning graph validation passed",
			required: true,
		},
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
				section[name] = existing ?? {};
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
	if (options.explicitApprovedBy)
		return { approvedBy: assertHumanLabel(options.explicitApprovedBy), source: "explicit" };

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
		return execFileSync("git", ["config", "user.name"], {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
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

export function createWorkflowFixture(
	root: string,
	options: FixtureOptions = {},
): { root: string; topic: string; topicDir: string } {
	const topic = options.topic ?? "demo";
	const phaseIds = options.phaseIds ?? ["P0"];
	const topicDir = path.join(root, ".plan", topic);
	fs.mkdirSync(topicDir, { recursive: true });
	fs.mkdirSync(path.join(root, ".cartographer"), { recursive: true });
	const planMd = [`# ${topic} Plan`, "", "## Phases", ""];
	const nodes: Record<string, unknown>[] = [
		{ id: `plan:${topic}`, type: "plan", title: `${topic} Plan`, source: "plan.md" },
	];
	const edges: Record<string, unknown>[] = [];
	for (const [index, phaseId] of phaseIds.entries()) {
		planMd.push(
			`### Phase ${phaseId} — Fixture Phase ${index}`,
			"",
			"- **Status:** pending",
			`- **Depends on:** ${index ? phaseIds[index - 1] : "none"}`,
			"",
			"#### Checklist",
			`- [ ] **${phaseId}.T1** Fixture task.`,
			"",
			"#### Validation",
			`- [ ] **${phaseId}.V1** Fixture validation.`,
			"",
		);
		nodes.push({
			id: `phase:${phaseId}`,
			type: "phase",
			phase_id: phaseId,
			title: `Fixture Phase ${index}`,
			status: "pending",
			depends_on: index ? [phaseIds[index - 1]] : [],
			source: "plan.md",
		});
		nodes.push({
			id: `task:${phaseId}.T1`,
			type: "task",
			task_id: `${phaseId}.T1`,
			phase_id: phaseId,
			title: "Fixture task",
			status: "pending",
			source: "plan.md",
		});
		nodes.push({
			id: `validation:${phaseId}.V1`,
			type: "validation",
			validation_id: `${phaseId}.V1`,
			phase_id: phaseId,
			title: "Fixture validation",
			status: "pending",
			command: 'node -e "process.exit(0)"',
			source: "plan.md",
		});
		edges.push({ from: `plan:${topic}`, to: `phase:${phaseId}`, type: "contains" });
		edges.push({ from: `phase:${phaseId}`, to: `task:${phaseId}.T1`, type: "contains" });
		edges.push({ from: `phase:${phaseId}`, to: `validation:${phaseId}.V1`, type: "contains" });
		if (index) edges.push({ from: `phase:${phaseId}`, to: `phase:${phaseIds[index - 1]}`, type: "depends_on" });
	}
	fs.writeFileSync(path.join(topicDir, "proposal.md"), `# ${topic} Proposal\n`, "utf8");
	fs.writeFileSync(path.join(topicDir, "plan.md"), `${planMd.join("\n")}\n`, "utf8");
	fs.writeFileSync(
		path.join(topicDir, "plan.nodes.jsonl"),
		nodes.map((record) => JSON.stringify(record)).join("\n") + "\n",
		"utf8",
	);
	fs.writeFileSync(
		path.join(topicDir, "plan.edges.jsonl"),
		edges.map((record) => JSON.stringify(record)).join("\n") + "\n",
		"utf8",
	);
	for (const file of [
		"map.nodes.jsonl",
		"map.edges.jsonl",
		"facts.nodes.jsonl",
		"facts.edges.jsonl",
		"receipts.jsonl",
		"context-packs.jsonl",
	])
		fs.writeFileSync(path.join(topicDir, file), "", "utf8");
	return { root, topic, topicDir };
}

export type WorkflowCliResult = Record<string, unknown> & { ok: boolean; action: string; topic?: string };

type CliArgs = { command: string; options: Record<string, string | boolean | string[]> };

function parseCliArgs(argv: string[]): CliArgs {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") usage(0);
	const options: Record<string, string | boolean | string[]> = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
		const name = token.slice(2);
		if (["json", "ci"].includes(name)) {
			options[name] = true;
			continue;
		}
		const value = rest[index + 1];
		if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
		index += 1;
		if (["artifact", "validation-receipt", "receipt-id"].includes(name)) {
			const current = options[name];
			options[name] = Array.isArray(current) ? [...current, value] : [value];
		} else {
			options[name] = value;
		}
	}
	return { command, options };
}

function usage(exitCode: number): never {
	const script = path.basename(fileURLToPath(import.meta.url));
	console.log(`Usage:
  ${script} receipt-append --root <root> --topic <topic> --kind <kind> --summary <text> [--phase-id <id>] [--receipt-id <id>] [--json]
  ${script} context-pack-create --root <root> --topic <topic> --phase-id <id> --summary <text> [--artifact <path>] [--validation-receipt <id>] [--json]
  ${script} proposal-init --root <root> --topic <topic> [--title <title>] [--json]
  ${script} proposal-adr-sync --root <root> --topic <topic> --adr-required <true|false> --adr-reason <text> [--adr-options-status <text>] [--adr-tool-mode <text>] [--override-rationale <text>] [--json]
  ${script} proposal-finalize --root <root> --topic <topic> [--summary <text>] [--json]
  ${script} fact-add-source --root <root> --topic <topic> --title <text> [--url <url>] [--json]
  ${script} fact-add-fact --root <root> --topic <topic> --title <text> [--source-id <id>] [--json]
  ${script} fact-support-fact --root <root> --topic <topic> --fact-id <id> --source-id <id> [--json]
  ${script} plan-generate-graph --root <root> --topic <topic> [--json]
  ${script} plan-finalize --root <root> --topic <topic> [--summary <text>] [--json]
  ${script} plan-status-set --root <root> --topic <topic> --id <phase|task|validation id> --status <status> [--json]
  ${script} validation-complete-item --root <root> --topic <topic> --validation-id <id> [--json]
  ${script} implement-start --root <root> --topic <topic> [--json]
  ${script} implement-step --root <root> --topic <topic> [--path <path>] [--json]
  ${script} implement-record --root <root> --topic <topic> --receipt-id <id> [--json]
  ${script} implement-compact --root <root> --topic <topic> --trigger <name> [--summary <text>] [--json]
  ${script} implement-finalize --root <root> --topic <topic> [--summary <text>] [--json]
  ${script} transition-status --root <root> --topic <topic> [--json]
  ${script} transition-request-approval --root <root> --topic <topic> --gate <gate> [--phase-id <id>] [--summary <text>] [--json]
  ${script} transition-approve --root <root> --topic <topic> --gate <gate> --summary <text> [--phase-id <id>] [--approved-by <name>] [--ci] [--json]
  ${script} transition-reject --root <root> --topic <topic> --gate <gate> --reason <text> [--phase-id <id>] [--json]
  ${script} transition-advance --root <root> --topic <topic> --to <state> [--phase-id <id>] [--summary <text>] [--json]`);
	process.exit(exitCode);
}

function opt(options: Record<string, unknown>, name: string, fallback?: string): string {
	const value = options[name];
	if (typeof value === "string" && value.length > 0) return value;
	if (fallback !== undefined) return fallback;
	throw new Error(`Missing required --${name}`);
}

function optArray(options: Record<string, unknown>, name: string): string[] {
	const value = options[name];
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
	return typeof value === "string" ? [value] : [];
}

function workflowRoot(options: Record<string, unknown>): string {
	return path.resolve(opt(options, "root", "."));
}

function workflowTopic(options: Record<string, unknown>): string {
	const topic = opt(options, "topic");
	if (!/^[a-z0-9][a-z0-9-]*$/.test(topic)) throw new Error(`Invalid topic slug: ${topic}`);
	return topic;
}

function topicDir(root: string, topic: string): string {
	return path.join(root, ".plan", topic);
}

function receiptsPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "receipts.jsonl");
}

function contextPacksPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "context-packs.jsonl");
}

function readJsonlRecords(filePath: string): Record<string, unknown>[] {
	if (!fs.existsSync(filePath)) return [];
	return fs
		.readFileSync(filePath, "utf8")
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function writeJsonlRecordsAtomic(filePath: string, records: readonly Record<string, unknown>[]): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
	fs.writeFileSync(tmp, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
	fs.renameSync(tmp, filePath);
}

function workflowNow(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function assertNonEmptyString(value: string, name: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`${name} must not be empty`);
	return trimmed;
}

function safeIdPart(value: string): string {
	return value.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") || "record";
}

function ensureTopicArtifacts(root: string, topic: string): void {
	const dir = topicDir(root, topic);
	if (!fs.existsSync(dir)) throw new Error(`Missing topic directory for ${topic}`);
	if (!fs.existsSync(path.join(dir, "plan.md")) && !fs.existsSync(path.join(dir, "proposal.md"))) {
		throw new Error(`Missing plan.md or proposal.md for topic ${topic}`);
	}
	for (const file of ["receipts.jsonl", "context-packs.jsonl"]) {
		const fullPath = path.join(dir, file);
		if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, "", "utf8");
	}
}

export function appendWorkflowReceipt(params: {
	root: string;
	topic: string;
	kind: string;
	summary: string;
	phaseId?: string;
	id?: string;
	data?: Record<string, unknown>;
}): Record<string, unknown> {
	ensureTopicArtifacts(params.root, params.topic);
	if (!RECEIPT_KINDS.includes(params.kind as ReceiptKind)) throw new Error(`Unsupported receipt kind: ${params.kind}`);
	const now = workflowNow();
	let id = params.id || `receipt:${safeIdPart(params.topic)}:${safeIdPart(params.kind)}:${now}`;
	const filePath = receiptsPath(params.root, params.topic);
	const existing = readJsonlRecords(filePath);
	if (params.id && existing.some((record) => record.id === id)) throw new Error(`Receipt already exists: ${id}`);
	let counter = 2;
	while (existing.some((record) => record.id === id)) {
		id = `receipt:${safeIdPart(params.topic)}:${safeIdPart(params.kind)}:${now}:${counter}`;
		counter += 1;
	}
	const summary = assertNonEmptyString(params.summary, "summary");
	const record: Record<string, unknown> = {
		id,
		type: "workflow-receipt",
		kind: params.kind,
		topic: params.topic,
		phase_id: params.phaseId,
		status: params.kind === "audit" && /\bPASS\b/i.test(summary) ? "PASS" : "recorded",
		summary,
		created_at: now,
		verified: true,
		...(params.data || {}),
	};
	appendJsonlAtomic(filePath, [record]);
	return record;
}

function validateContextArtifacts(root: string, artifacts: string[]): void {
	const resolvedRoot = fs.realpathSync(root);
	for (const artifact of artifacts) {
		if (artifact.includes(".plan/_private/") || artifact.includes(".plan\\_private\\")) {
			throw new Error(`Context pack artifact must not reference private raw inputs: ${artifact}`);
		}
		const fullPath = path.isAbsolute(artifact) ? artifact : path.join(root, artifact);
		if (!fs.existsSync(fullPath)) throw new Error(`Context pack artifact does not exist: ${artifact}`);
		const resolvedArtifact = fs.realpathSync(fullPath);
		if (!resolvedArtifact.startsWith(`${resolvedRoot}${path.sep}`) && resolvedArtifact !== resolvedRoot) {
			throw new Error(`Context pack artifact must stay under project root: ${artifact}`);
		}
	}
}

function validateContextReceipts(root: string, topic: string, receiptIds: string[]): void {
	const receipts = readJsonlRecords(receiptsPath(root, topic));
	for (const receiptId of receiptIds) {
		if (!receipts.some((receipt) => receipt.id === receiptId)) {
			throw new Error(`Context pack validation receipt does not exist: ${receiptId}`);
		}
	}
}

export function upsertContextPack(params: {
	root: string;
	topic: string;
	phaseId: string;
	summary: string;
	artifacts?: string[];
	validationReceipts?: string[];
	mode?: "create" | "update";
}): Record<string, unknown> {
	ensureTopicArtifacts(params.root, params.topic);
	if (params.summary.length > 2000) throw new Error("Context pack summary must be 2000 characters or fewer");
	validateContextArtifacts(params.root, params.artifacts || []);
	validateContextReceipts(params.root, params.topic, params.validationReceipts || []);
	const filePath = contextPacksPath(params.root, params.topic);
	const records = readJsonlRecords(filePath);
	const id = `context-pack:${safeIdPart(params.topic)}:${safeIdPart(params.phaseId)}`;
	const existingIndex = records.findIndex((record) => record.id === id);
	if (params.mode === "create" && existingIndex >= 0) throw new Error(`Context pack already exists: ${id}`);
	const now = workflowNow();
	const nextRecord: Record<string, unknown> = {
		...(existingIndex >= 0 ? records[existingIndex] : {}),
		id,
		type: "context-pack",
		topic: params.topic,
		phase_id: params.phaseId,
		summary: assertNonEmptyString(params.summary, "summary"),
		artifacts: params.artifacts || [],
		validation_receipts: params.validationReceipts || [],
		updated_at: now,
		created_at: existingIndex >= 0 ? records[existingIndex].created_at || now : now,
	};
	if (existingIndex >= 0) records[existingIndex] = nextRecord;
	else records.push(nextRecord);
	writeJsonlRecordsAtomic(filePath, records);
	return nextRecord;
}


const PROPOSAL_SKELETON = `## Description

## Problem Statement

## Goals

## Non-Goals

## Background

## Viability

## ADR Metadata

- \`adr_required\`: false
- \`adr_reason\`: Routine implementation change unless evaluation proves durable architectural significance.
- \`adr_options_status\`: not-applicable
- \`adr_tool_mode\`: evaluate-only

## Design
`;

function proposalPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "proposal.md");
}

function factsNodesPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "facts.nodes.jsonl");
}

function factsEdgesPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "facts.edges.jsonl");
}

function ensureProposalArtifacts(root: string, topic: string, title?: string): void {
	const dir = topicDir(root, topic);
	fs.mkdirSync(path.join(dir, "evidence"), { recursive: true });
	const proposalFile = proposalPath(root, topic);
	if (!fs.existsSync(proposalFile)) {
		fs.writeFileSync(proposalFile, `# ${title || topic} Proposal\n\n${PROPOSAL_SKELETON}\n`, "utf8");
	} else {
		let text = fs.readFileSync(proposalFile, "utf8");
		for (const heading of [
			"## Description",
			"## Problem Statement",
			"## Goals",
			"## Non-Goals",
			"## Background",
			"## Viability",
			"## ADR Metadata",
			"## Design",
		]) {
			if (!text.includes(heading)) text += `\n${heading}\n`;
		}
		fs.writeFileSync(proposalFile, text.endsWith("\n") ? text : `${text}\n`, "utf8");
	}
	for (const file of [
		"map.nodes.jsonl",
		"map.edges.jsonl",
		"facts.nodes.jsonl",
		"facts.edges.jsonl",
		"receipts.jsonl",
		"context-packs.jsonl",
	]) {
		const fullPath = path.join(dir, file);
		if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, "", "utf8");
	}
}

export function initProposal(params: { root: string; topic: string; title?: string }): Record<string, unknown> {
	ensureProposalArtifacts(params.root, params.topic, params.title);
	return {
		id: `proposal:${params.topic}`,
		topic: params.topic,
		proposal: path.relative(params.root, proposalPath(params.root, params.topic)),
		facts_nodes: path.relative(params.root, factsNodesPath(params.root, params.topic)),
		facts_edges: path.relative(params.root, factsEdgesPath(params.root, params.topic)),
		evidence_dir: path.relative(params.root, path.join(topicDir(params.root, params.topic), "evidence")),
	};
}

function nextSequentialId(records: Record<string, unknown>[], prefix: "S" | "F"): string {
	const max = records.reduce((value, record) => {
		const id = optionalString(record.id);
		const match = id.match(new RegExp(`^${prefix}(\\d+)$`));
		return match ? Math.max(value, Number(match[1])) : value;
	}, 0);
	return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function upsertJsonlRecord(filePath: string, record: Record<string, unknown>, keys = ["id"]): Record<string, unknown> {
	const records = readJsonlRecords(filePath);
	const index = records.findIndex((existing) => keys.every((key) => existing[key] === record[key]));
	if (index >= 0) records[index] = { ...records[index], ...record };
	else records.push(record);
	writeJsonlRecordsAtomic(filePath, records);
	return index >= 0 ? records[index] : record;
}

export function addFactSource(params: { root: string; topic: string; title: string; url?: string; id?: string }): Record<string, unknown> {
	ensureProposalArtifacts(params.root, params.topic);
	const filePath = factsNodesPath(params.root, params.topic);
	const records = readJsonlRecords(filePath);
	const id = params.id || nextSequentialId(records, "S");
	return upsertJsonlRecord(filePath, {
		id,
		type: "source",
		title: assertNonEmptyString(params.title, "title"),
		url: params.url,
		created_at: workflowNow(),
	});
}

export function addFact(params: {
	root: string;
	topic: string;
	title: string;
	sourceId?: string;
	id?: string;
}): Record<string, unknown> {
	ensureProposalArtifacts(params.root, params.topic);
	const nodeFile = factsNodesPath(params.root, params.topic);
	const records = readJsonlRecords(nodeFile);
	const id = params.id || nextSequentialId(records, "F");
	const fact = upsertJsonlRecord(nodeFile, {
		id,
		type: "fact",
		title: assertNonEmptyString(params.title, "title"),
		created_at: workflowNow(),
	});
	if (params.sourceId) supportFact({ root: params.root, topic: params.topic, factId: id, sourceId: params.sourceId });
	return fact;
}

export function supportFact(params: { root: string; topic: string; factId: string; sourceId: string }): Record<string, unknown> {
	ensureProposalArtifacts(params.root, params.topic);
	const nodes = readJsonlRecords(factsNodesPath(params.root, params.topic));
	const fact = nodes.find((node) => node.id === params.factId && node.type === "fact");
	if (!fact) throw new Error(`Fact node does not exist: ${params.factId}`);
	const source = nodes.find((node) => node.id === params.sourceId && node.type === "source");
	if (!source) throw new Error(`Source node does not exist: ${params.sourceId}`);
	return upsertJsonlRecord(
		factsEdgesPath(params.root, params.topic),
		{ from: params.factId, to: params.sourceId, type: "supported_by" },
		["from", "to", "type"],
	);
}

function replaceAdrMetadata(text: string, metadata: Record<string, string>): string {
	const block = [
		"## ADR Metadata",
		"",
		`- \`adr_required\`: ${metadata.adr_required}`,
		`- \`adr_reason\`: ${metadata.adr_reason}`,
		`- \`adr_options_status\`: ${metadata.adr_options_status}`,
		`- \`adr_tool_mode\`: ${metadata.adr_tool_mode}`,
		metadata.override_rationale ? `- \`adr_override_rationale\`: ${metadata.override_rationale}` : undefined,
	]
		.filter(Boolean)
		.join("\n");
	const pattern = /## ADR Metadata\n[\s\S]*?(?=\n## |$)/;
	if (pattern.test(text)) return text.replace(pattern, block);
	return `${text.trimEnd()}\n\n${block}\n`;
}

export function syncProposalAdr(params: {
	root: string;
	topic: string;
	adrRequired: string;
	adrReason: string;
	adrOptionsStatus?: string;
	adrToolMode?: string;
	overrideRationale?: string;
}): Record<string, unknown> {
	ensureProposalArtifacts(params.root, params.topic);
	if (!["true", "false"].includes(params.adrRequired)) throw new Error("adr-required must be true or false");
	if (params.overrideRationale !== undefined) assertNonEmptyString(params.overrideRationale, "override-rationale");
	const filePath = proposalPath(params.root, params.topic);
	const next = replaceAdrMetadata(fs.readFileSync(filePath, "utf8"), {
		adr_required: params.adrRequired,
		adr_reason: assertNonEmptyString(params.adrReason, "adr-reason"),
		adr_options_status: params.adrOptionsStatus || "not-applicable",
		adr_tool_mode: params.adrToolMode || "evaluate-only",
		override_rationale: params.overrideRationale || "",
	});
	fs.writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
	return { proposal: path.relative(params.root, filePath), adr_required: params.adrRequired === "true" };
}

function runTopicValidation(root: string, topic: string): string {
	const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "manage_jsonl.ts");
	return execFileSync("node", ["--experimental-strip-types", script, "validate-topic", "--root", root, "--topic", topic, "--json"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}


function assertFactCitationSummary(root: string, topic: string): Record<string, unknown> {
	const proposal = fs.readFileSync(proposalPath(root, topic), "utf8");
	const citations = [...new Set([...proposal.matchAll(/\[(F\d{3})\]/g)].map((match) => match[1]))];
	const nodes = readJsonlRecords(factsNodesPath(root, topic));
	const edges = readJsonlRecords(factsEdgesPath(root, topic));
	const facts = nodes.filter((node) => node.type === "fact").map((node) => String(node.id));
	const sources = new Set(nodes.filter((node) => node.type === "source").map((node) => node.id));
	const missing = citations.filter((id) => !facts.includes(id));
	if (missing.length) throw new Error(`Proposal cites missing fact ids: ${missing.join(", ")}`);
	const unsupported = facts.filter(
		(id) => !edges.some((edge) => edge.from === id && edge.type === "supported_by" && sources.has(edge.to)),
	);
	if (unsupported.length) throw new Error(`Facts lack supported_by source edges: ${unsupported.join(", ")}`);
	return { cited_facts: citations.length, total_facts: facts.length, supported_facts: facts.length - unsupported.length };
}

function assertSanitizedEvidence(root: string, topic: string): Record<string, unknown> {
	const dir = topicDir(root, topic);
	const checked: string[] = [];
	for (const relative of ["proposal.md", "context-packs.jsonl", "facts.nodes.jsonl", "facts.edges.jsonl"]) {
		const filePath = path.join(dir, relative);
		if (!fs.existsSync(filePath)) continue;
		checked.push(`.plan/${topic}/${relative}`);
		const text = fs.readFileSync(filePath, "utf8");
		if (text.includes(".plan/_private/") || text.includes(".plan\\_private\\")) {
			throw new Error(`Commit-safe artifact references private raw inputs: .plan/${topic}/${relative}`);
		}
	}
	return { checked_artifacts: checked };
}

function findAuditorPassReceipt(root: string, topic: string, phaseId: string): Record<string, unknown> {
	const receipts = readJsonlRecords(receiptsPath(root, topic));
	const receipt = receipts.find((candidate) => {
		const result = optionalString(candidate.status || candidate.result || candidate.decision).toLowerCase();
		return (
			(candidate.kind === "audit" || candidate.type === "auditor-receipt") &&
			candidate.phase_id === phaseId &&
			(result === "pass" || result.includes("pass"))
		);
	});
	if (!receipt) throw new Error(`Missing required ${phaseId} auditor PASS receipt`);
	const reportPath = optionalString(receipt.report_path);
	if (!reportPath) throw new Error(`Missing required ${phaseId} auditor report_path`);
	if (reportPath.includes(".plan/_private/") || reportPath.includes(".plan\\_private\\")) {
		throw new Error(`Auditor report path must not reference private raw inputs: ${reportPath}`);
	}
	const fullPath = path.isAbsolute(reportPath) ? reportPath : path.join(root, reportPath);
	if (!fs.existsSync(fullPath)) throw new Error(`Auditor report path does not exist: ${reportPath}`);
	return receipt;
}

export function finalizeProposal(params: { root: string; topic: string; summary?: string }): Record<string, unknown> {
	ensureProposalArtifacts(params.root, params.topic);
	const factCitationSummary = assertFactCitationSummary(params.root, params.topic);
	const evidenceSummary = assertSanitizedEvidence(params.root, params.topic);
	const validationOutput = runTopicValidation(params.root, params.topic);
	const validationReceipt = appendWorkflowReceipt({
		root: params.root,
		topic: params.topic,
		kind: "validation",
		phaseId: "proposal",
		summary: `proposal finalize checks passed: ${JSON.stringify({ factCitationSummary, evidenceSummary })}; validate-topic: ${validationOutput.slice(0, 200)}`,
	});
	upsertContextPack({
		root: params.root,
		topic: params.topic,
		phaseId: "proposal",
		summary: params.summary || "Proposal finalization context.",
		artifacts: [`.plan/${params.topic}/proposal.md`],
		validationReceipts: [String(validationReceipt.id)],
		mode: "update",
	});
	const auditReceipt = findAuditorPassReceipt(params.root, params.topic, "proposal");
	const transition = recordWorkflowTransition({
		root: params.root,
		topic: params.topic,
		action: "request-approval",
		gate: "proposal",
		phaseId: "proposal",
		summary: params.summary || "Proposal ready for human review.",
	});
	return { validation_receipt: validationReceipt.id, audit_receipt: auditReceipt.id, transition_receipt: transition.id };
}

export function getWorkflowStatus(params: { root: string; topic: string }): Record<string, unknown> {
	ensureTopicArtifacts(params.root, params.topic);
	const planPath = path.join(topicDir(params.root, params.topic), "plan.md");
	const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8") : "";
	const phaseMatches = [...plan.matchAll(/^### Phase (P\d+)\s+—\s+(.+)$/gm)];
	const phases = phaseMatches.map((match) => {
		const start = match.index || 0;
		const next = phaseMatches.find((candidate) => (candidate.index || 0) > start);
		const block = plan.slice(start, next?.index || plan.length);
		const status = block.match(/^- \*\*Status:\*\*\s+(.+)$/m)?.[1]?.trim() || "unknown";
		return { phase_id: match[1], title: match[2], status };
	});
	const receipts = readJsonlRecords(receiptsPath(params.root, params.topic));
	const contextPacks = readJsonlRecords(contextPacksPath(params.root, params.topic));
	const missing_context_packs = phases
		.filter((phase) => !contextPacks.some((pack) => pack.phase_id === phase.phase_id))
		.map((phase) => phase.phase_id);
	const rejected_gates = receipts
		.filter((receipt) => receipt.action === "reject")
		.map((receipt) => ({ gate: receipt.gate, phase_id: receipt.phase_id }));
	const pending_human_approvals = receipts
		.filter((receipt) => {
			if (receipt.kind !== "transition" || receipt.action !== "request-approval") return false;
			const resolved = receipts.some(
				(other) =>
					["approve", "reject"].includes(optionalString(other.action)) &&
					other.gate === receipt.gate &&
					optionalString(other.created_at) >= optionalString(receipt.created_at),
			);
			return !resolved;
		})
		.map((receipt) => ({ gate: receipt.gate, phase_id: receipt.phase_id }));
	const lifecycle_receipts = receipts.filter((receipt) => typeof receipt.to_state === "string");
	const current_lifecycle_state =
		(lifecycle_receipts.at(-1)?.to_state as string | undefined) ||
		(phases.some((phase) => phase.status === "complete") ? "implementation-in-progress" : "plan-approved");
	return {
		ok: true,
		topic: params.topic,
		current_lifecycle_state,
		lifecycle_states: LIFECYCLE_STATES,
		human_approval_gates: HUMAN_APPROVAL_GATES,
		phases,
		receipts: receipts.length,
		context_packs: contextPacks.length,
		missing_context_packs,
		pending_human_approvals,
		rejected_gates,
		next_allowed_commands: [
			"cartographer_context_pack update",
			"cartographer_receipt append",
			"cartographer_transition request-approval",
			"cartographer_transition approve",
			"cartographer_transition advance",
		],
	};
}

function hasReceipt(
	receipts: Record<string, unknown>[],
	predicate: (receipt: Record<string, unknown>) => boolean,
): boolean {
	return receipts.some((receipt) => predicate(receipt));
}

function optionalString(value: unknown): string {
	return typeof value === "string" ? value : "";
}


function planMdPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "plan.md");
}

function planNodesPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "plan.nodes.jsonl");
}

function planEdgesPath(root: string, topic: string): string {
	return path.join(topicDir(root, topic), "plan.edges.jsonl");
}

type ParsedPlan = { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };

function checkboxStatus(mark: string): string {
	return mark.toLowerCase() === "x" ? "complete" : "pending";
}

function commandFromValidationTitle(title: string): string | undefined {
	const backtick = title.match(/`([^`]+)`/);
	if (backtick) return backtick[1];
	const run = title.match(/\bRun\s+(.+?)(?:;|\.|$)/i);
	return run ? run[1].trim() : undefined;
}

export function parsePlanMarkdown(topic: string, markdown: string): ParsedPlan {
	const nodes: Record<string, unknown>[] = [
		{ id: `plan:${topic}`, type: "plan", title: `${topic} Plan`, source: "plan.md" },
	];
	const edges: Record<string, unknown>[] = [];
	const phaseMatches = [...markdown.matchAll(/^### Phase (P\d+)\s+—\s+(.+)$/gm)];
	for (const [index, match] of phaseMatches.entries()) {
		const phaseId = match[1];
		const title = match[2].trim();
		const start = match.index || 0;
		const end = phaseMatches[index + 1]?.index || markdown.length;
		const block = markdown.slice(start, end);
		const status = block.match(/^- \*\*Status:\*\*\s+(.+)$/m)?.[1]?.trim() || "pending";
		const dependsText = block.match(/^- \*\*Depends on:\*\*\s+(.+)$/m)?.[1]?.trim() || "none";
		const dependsOn = dependsText.toLowerCase() === "none" ? [] : [...dependsText.matchAll(/P\d+/g)].map((item) => item[0]);
		const unlocksText = block.match(/^- \*\*Unlocks:\*\*\s+(.+)$/m)?.[1]?.trim() || "none";
		const unlocks = unlocksText.toLowerCase() === "none" ? [] : [...unlocksText.matchAll(/P\d+/g)].map((item) => item[0]);
		const referenceText = block.match(/^- \*\*Primary references:\*\*\s+(.+)$/m)?.[1] || "";
		const references = [...new Set([...referenceText.matchAll(/\[(F\d+)\]/g)].map((item) => item[1]))];
		const phaseNode: Record<string, unknown> = { id: `phase:${phaseId}`, type: "phase", phase_id: phaseId, title, status, depends_on: dependsOn, source: "plan.md" };
		if (references.length) phaseNode.references = references;
		nodes.push(phaseNode);
		edges.push({ from: `plan:${topic}`, to: `phase:${phaseId}`, type: "contains" });
		for (const dep of dependsOn) edges.push({ from: `phase:${phaseId}`, to: `phase:${dep}`, type: "depends_on" });
		for (const unlock of unlocks) edges.push({ from: `phase:${phaseId}`, to: `phase:${unlock}`, type: "unlocks" });
		for (const reference of references) edges.push({ from: `phase:${phaseId}`, to: reference, type: "references" });
		for (const task of block.matchAll(/^- \[([ xX])\] \*\*((P\d+\.T\d+))\*\*\s*(.+)$/gm)) {
			const taskId = task[2];
			nodes.push({ id: `task:${taskId}`, type: "task", task_id: taskId, phase_id: phaseId, title: task[3].trim(), status: checkboxStatus(task[1]), source: "plan.md" });
			edges.push({ from: `phase:${phaseId}`, to: `task:${taskId}`, type: "contains" });
		}
		for (const validation of block.matchAll(/^- \[([ xX])\] \*\*((P\d+\.V\d+))\*\*\s*(.+)$/gm)) {
			const validationId = validation[2];
			const validationTitle = validation[3].trim();
			const node: Record<string, unknown> = { id: `validation:${validationId}`, type: "validation", validation_id: validationId, phase_id: phaseId, title: validationTitle, status: checkboxStatus(validation[1]), source: "plan.md" };
			const command = commandFromValidationTitle(validationTitle);
			if (command) node.command = command;
			nodes.push(node);
			edges.push({ from: `phase:${phaseId}`, to: `validation:${validationId}`, type: "contains" });
			edges.push({ from: `validation:${validationId}`, to: `phase:${phaseId}`, type: "validates" });
		}
	}
	if (phaseMatches.length === 0) throw new Error("No plan phases found in plan.md");
	return { nodes, edges };
}

export function generatePlanGraph(params: { root: string; topic: string }): Record<string, unknown> {
	ensureTopicArtifacts(params.root, params.topic);
	const markdown = fs.readFileSync(planMdPath(params.root, params.topic), "utf8");
	const parsed = parsePlanMarkdown(params.topic, markdown);
	writeJsonlRecordsAtomic(planNodesPath(params.root, params.topic), parsed.nodes);
	writeJsonlRecordsAtomic(planEdgesPath(params.root, params.topic), parsed.edges);
	return { nodes: parsed.nodes.length, edges: parsed.edges.length, plan_nodes: path.relative(params.root, planNodesPath(params.root, params.topic)), plan_edges: path.relative(params.root, planEdgesPath(params.root, params.topic)) };
}

function replacePlanItemStatus(markdown: string, id: string, status: string): string {
	if (/^P\d+$/.test(id)) {
		const phasePattern = new RegExp(`(### Phase ${id}\\s+—[\\s\\S]*?^- \\*\\*Status:\\*\\*\\s+)(.+)$`, "m");
		if (!phasePattern.test(markdown)) throw new Error(`Missing phase in plan.md: ${id}`);
		return markdown.replace(phasePattern, `$1${status}`);
	}
	const checked = status === "complete" ? "x" : " ";
	const itemPattern = new RegExp(`^- \\[([ xX])\\] (\\*\\*${id.replace(".", "\\.")}\\*\\*)`, "m");
	if (!itemPattern.test(markdown)) throw new Error(`Missing checklist item in plan.md: ${id}`);
	return markdown.replace(itemPattern, `- [${checked}] $2`);
}

export function setPlanStatus(params: { root: string; topic: string; id: string; status: string }): Record<string, unknown> {
	ensureTopicArtifacts(params.root, params.topic);
	const allowed = new Set(["pending", "in-progress", "complete", "blocked"]);
	if (!allowed.has(params.status)) throw new Error(`Unsupported plan status: ${params.status}`);
	const mdPath = planMdPath(params.root, params.topic);
	const nodesPath = planNodesPath(params.root, params.topic);
	const oldMd = fs.readFileSync(mdPath, "utf8");
	const oldNodes = fs.existsSync(nodesPath) ? fs.readFileSync(nodesPath, "utf8") : "";
	try {
		const nextMd = replacePlanItemStatus(oldMd, params.id, params.status);
		fs.writeFileSync(mdPath, nextMd, "utf8");
		const records = readJsonlRecords(nodesPath);
		const nodeId = params.id.includes(".T") ? `task:${params.id}` : params.id.includes(".V") ? `validation:${params.id}` : `phase:${params.id}`;
		const index = records.findIndex((record) => record.id === nodeId);
		if (index < 0) throw new Error(`Missing plan node: ${nodeId}`);
		records[index] = { ...records[index], status: params.status };
		writeJsonlRecordsAtomic(nodesPath, records);
		parsePlanMarkdown(params.topic, nextMd);
		return { id: params.id, status: params.status };
	} catch (error) {
		fs.writeFileSync(mdPath, oldMd, "utf8");
		fs.writeFileSync(nodesPath, oldNodes, "utf8");
		throw error;
	}
}

function findPassedValidationReceipt(root: string, topic: string, validationId: string): Record<string, unknown> {
	const receipts = readJsonlRecords(receiptsPath(root, topic));
	const receipt = receipts.find((candidate) => {
		const status = optionalString(candidate.status).toLowerCase();
		const ids = Array.isArray(candidate.validation_ids) ? candidate.validation_ids.map(String) : [];
		return (status === "passed" || candidate.verified === true) && (ids.includes(validationId) || optionalString(candidate.id).includes(validationId));
	});
	if (!receipt) throw new Error(`Missing passed validation receipt for ${validationId}`);
	return receipt;
}

export function completeValidationItem(params: { root: string; topic: string; validationId: string }): Record<string, unknown> {
	const receipt = findPassedValidationReceipt(params.root, params.topic, params.validationId);
	const status = setPlanStatus({ root: params.root, topic: params.topic, id: params.validationId, status: "complete" });
	return { ...status, validation_receipt: receipt.id };
}

function runPlanningGraphValidation(root: string, topic: string): string {
	const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "validate_planning_graph.py");
	return execFileSync("python", [script, "--root", root, "--topic", topic, "--json"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

export function finalizePlan(params: { root: string; topic: string; summary?: string }): Record<string, unknown> {
	const graph = generatePlanGraph({ root: params.root, topic: params.topic });
	const topicValidation = runTopicValidation(params.root, params.topic);
	const graphValidation = runPlanningGraphValidation(params.root, params.topic);
	const validationReceipt = appendWorkflowReceipt({
		root: params.root,
		topic: params.topic,
		kind: "validation",
		phaseId: "plan",
		summary: `plan finalize checks passed: ${JSON.stringify(graph)}; validate-topic: ${topicValidation.slice(0, 160)}; validate-graph: ${graphValidation.slice(0, 160)}`,
	});
	upsertContextPack({
		root: params.root,
		topic: params.topic,
		phaseId: "plan",
		summary: params.summary || "Plan finalization context.",
		artifacts: [`.plan/${params.topic}/plan.md`, `.plan/${params.topic}/plan.nodes.jsonl`, `.plan/${params.topic}/plan.edges.jsonl`],
		validationReceipts: [String(validationReceipt.id)],
		mode: "update",
	});
	const auditReceipt = findAuditorPassReceipt(params.root, params.topic, "plan");
	const transition = recordWorkflowTransition({
		root: params.root,
		topic: params.topic,
		action: "request-approval",
		gate: "plan",
		phaseId: "plan",
		summary: params.summary || "Plan ready for human review.",
	});
	return { validation_receipt: validationReceipt.id, audit_receipt: auditReceipt.id, transition_receipt: transition.id };
}


function stateScriptPath(): string {
	return path.join(path.dirname(fileURLToPath(import.meta.url)), "cartographer_state.ts");
}

function runStateCommand(root: string, topic: string, command: string, extra: string[] = []): Record<string, unknown> {
	const output = execFileSync("node", ["--experimental-strip-types", stateScriptPath(), command, "--root", root, "--topic", topic, "--json", ...extra], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return JSON.parse(output) as Record<string, unknown>;
}

function currentPointerPath(root: string): string {
	return path.join(root, ".cartographer", "current.json");
}

function planPhaseRecords(root: string, topic: string): Record<string, unknown>[] {
	return readJsonlRecords(planNodesPath(root, topic)).filter((record) => record.type === "phase");
}

function firstExecutablePhase(root: string, topic: string): Record<string, unknown> {
	const phases = planPhaseRecords(root, topic);
	for (const phase of phases) {
		if (phase.status === "complete") continue;
		const deps = Array.isArray(phase.depends_on) ? phase.depends_on.map(String) : [];
		const ready = deps.every((dep) => phases.some((candidate) => candidate.phase_id === dep && candidate.status === "complete"));
		if (ready) return phase;
	}
	throw new Error("No executable incomplete phase found");
}

function hasPlanApproval(root: string, topic: string): boolean {
	const receipts = readJsonlRecords(receiptsPath(root, topic));
	return receipts.some((receipt) => receipt.action === "approve" && receipt.gate === "plan");
}

function defaultImplementWorkingSet(topic: string, phaseId: string): Record<string, unknown> {
	return {
		write_allowed: [
			{ path: "skills/plan/scripts/*.ts", reason: `${phaseId} implementation wrapper work` },
			{ path: "tests/*.test.ts", reason: `${phaseId} wrapper tests` },
			{ path: "extensions/*.ts", reason: `${phaseId} extension tool registration` },
			{ path: `.plan/${topic}/plan.md`, reason: `${phaseId} plan status updates` },
			{ path: `.plan/${topic}/plan.nodes.jsonl`, reason: `${phaseId} plan node status updates` },
			{ path: `.plan/${topic}/receipts.jsonl`, reason: `${phaseId} receipts` },
			{ path: `.plan/${topic}/context-packs.jsonl`, reason: `${phaseId} context pack` },
		],
		read_only: [{ path: `.plan/${topic}/plan.edges.jsonl`, reason: "dependency graph reference" }],
		forbidden: [
			{ path: ".plan/_private/**", reason: "raw private inputs are off-limits" },
			{ path: ".plan/_index/**", reason: "generated index/cache artifacts" },
		],
	};
}

export function startImplementation(params: { root: string; topic: string }): Record<string, unknown> {
	ensureTopicArtifacts(params.root, params.topic);
	if (!hasPlanApproval(params.root, params.topic)) throw new Error("Missing plan approval receipt");
	const phase = firstExecutablePhase(params.root, params.topic);
	const phaseId = String(phase.phase_id);
	setPlanStatus({ root: params.root, topic: params.topic, id: phaseId, status: "in-progress" });
	appendWorkflowReceipt({ root: params.root, topic: params.topic, kind: "phase", phaseId, summary: `Started implementation phase ${phaseId}.`, data: { action: "start", gate: "phase", to_state: "phase-in-progress" } });
	runStateCommand(params.root, params.topic, "state-init");
	updateJsonAtomic<Record<string, unknown>>(path.join(params.root, ".cartographer", params.topic, "state.json"), (state) => ({ ...state, current_phase_id: phaseId }));
	runStateCommand(params.root, params.topic, "state-validate");
	const nextAction = { id: `${phaseId}.T1`, kind: "implementation-task", summary: `Start ${phaseId} implementation.`, phase_id: phaseId, task_id: `${phaseId}.T1`, files_to_inspect: [`.plan/${params.topic}/plan.md`, "skills/plan/scripts/cartographer_workflow.ts", "extensions/cartographer-tools.ts", "tests/cartographer_workflow.test.ts"] };
	const workingSet = defaultImplementWorkingSet(params.topic, phaseId);
	runStateCommand(params.root, params.topic, "current-set");
	runStateCommand(params.root, params.topic, "state-set-next", ["--next-action-json", JSON.stringify(nextAction)]);
	runStateCommand(params.root, params.topic, "state-set-working-set", ["--working-set-json", JSON.stringify(workingSet)]);
	return { phase_id: phaseId, next_action: nextAction, working_set: workingSet, current_pointer: path.relative(params.root, currentPointerPath(params.root)) };
}

function readState(root: string, topic: string): Record<string, unknown> {
	const filePath = path.join(root, ".cartographer", topic, "state.json");
	if (!fs.existsSync(filePath)) throw new Error("Missing active implementation state");
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function pathMatches(pattern: string, candidate: string): boolean {
	if (pattern.endsWith("/**")) return candidate.startsWith(pattern.slice(0, -3));
	if (pattern.includes("*")) {
		const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
		return regex.test(candidate);
	}
	return candidate === pattern || candidate.startsWith(`${pattern}/`);
}

export function assertImplementPathAllowed(params: { root: string; topic: string; path: string }): Record<string, unknown> {
	const state = readState(params.root, params.topic);
	const workingSet = state.working_set as Record<string, unknown> | undefined;
	if (!workingSet) throw new Error("Missing active working_set");
	const candidate = params.path.split(path.sep).join("/");
	const forbidden = Array.isArray(workingSet.forbidden) ? workingSet.forbidden as Record<string, unknown>[] : [];
	if (forbidden.some((entry) => pathMatches(String(entry.path), candidate))) throw new Error(`Path is forbidden by working_set: ${candidate}`);
	const allowed = Array.isArray(workingSet.write_allowed) ? workingSet.write_allowed as Record<string, unknown>[] : [];
	return { path: candidate, allowed: allowed.some((entry) => pathMatches(String(entry.path), candidate)), mode: allowed.some((entry) => pathMatches(String(entry.path), candidate)) ? "write-allowed" : "warn-outside-working-set" };
}

export function implementStep(params: { root: string; topic: string; path?: string }): Record<string, unknown> {
	const state = readState(params.root, params.topic);
	const validation = runStateCommand(params.root, params.topic, "state-validate");
	if (!state.next_action || Array.isArray(state.next_action)) throw new Error("Missing singular next_action");
	if (!state.working_set) throw new Error("Missing active working_set");
	const guard = params.path ? assertImplementPathAllowed({ root: params.root, topic: params.topic, path: params.path }) : undefined;
	return { validation, current_phase_id: state.current_phase_id, next_action: state.next_action, working_set: state.working_set, guard };
}

export function implementRecord(params: { root: string; topic: string; receiptIds: string[] }): Record<string, unknown> {
	for (const receiptId of params.receiptIds) {
		if (!readJsonlRecords(receiptsPath(params.root, params.topic)).some((receipt) => receipt.id === receiptId)) {
			throw new Error(`Receipt does not exist: ${receiptId}`);
		}
	}
	return runStateCommand(params.root, params.topic, "state-record-validation-ref", params.receiptIds.flatMap((id) => ["--receipt-id", id]));
}

export function implementCompact(params: { root: string; topic: string; trigger: string; summary?: string }): Record<string, unknown> {
	runStateCommand(params.root, params.topic, "state-mark-stale", ["--reason", "Implementation compact requested after artifact updates."]);
	const compact = runStateCommand(params.root, params.topic, "compact-generate", ["--trigger", params.trigger, ...(params.summary ? ["--summary", params.summary, "--impact", "Implementation context compacted for resume.", "--importance", "3"] : [])]);
	const resume = runStateCommand(params.root, params.topic, "state-resume");
	return { compact, resume };
}


function requireImplementationFullValidation(root: string, topic: string): Record<string, unknown> {
	const receipt = readJsonlRecords(receiptsPath(root, topic)).find((candidate) => {
		const ids = Array.isArray(candidate.validation_ids) ? candidate.validation_ids.map(String) : [];
		return candidate.status === "passed" && (candidate.phase_id === "implementation" || ids.includes("implementation-full-validation") || optionalString(candidate.id).includes("implementation-full-validation"));
	});
	if (!receipt) throw new Error("Missing implementation full validation receipt");
	return receipt;
}

function requireAdrHandling(root: string, topic: string): Record<string, unknown> {
	const receipt = readJsonlRecords(receiptsPath(root, topic)).find((candidate) =>
		optionalString(candidate.kind).includes("adr") || optionalString(candidate.id).includes("adr") || optionalString(candidate.summary).toLowerCase().includes("adr"),
	);
	if (!receipt) throw new Error("Missing ADR handling receipt");
	return receipt;
}

export function finalizeImplementation(params: { root: string; topic: string; summary?: string }): Record<string, unknown> {
	const pending = planPhaseRecords(params.root, params.topic).filter((phase) => phase.status !== "complete");
	if (pending.length) throw new Error(`Cannot finalize with pending phases: ${pending.map((phase) => phase.phase_id).join(", ")}`);
	const fullValidationReceipt = requireImplementationFullValidation(params.root, params.topic);
	const adrReceipt = requireAdrHandling(params.root, params.topic);
	const topicValidation = runTopicValidation(params.root, params.topic);
	const graphValidation = runPlanningGraphValidation(params.root, params.topic);
	const validationReceipt = appendWorkflowReceipt({ root: params.root, topic: params.topic, kind: "validation", phaseId: "implementation", summary: `implementation finalize validations passed with ${String(fullValidationReceipt.id)} and ${String(adrReceipt.id)}: ${topicValidation.slice(0, 160)}; ${graphValidation.slice(0, 160)}` });
	upsertContextPack({ root: params.root, topic: params.topic, phaseId: "implementation", summary: params.summary || "Implementation finalization context.", artifacts: [`.plan/${params.topic}/plan.md`], validationReceipts: [String(validationReceipt.id)], mode: "update" });
	const auditReceipt = findAuditorPassReceipt(params.root, params.topic, "implementation");
	const transition = recordWorkflowTransition({ root: params.root, topic: params.topic, action: "request-approval", gate: "implementation", phaseId: "implementation", summary: params.summary || "Implementation ready for human review." });
	return { validation_receipt: validationReceipt.id, audit_receipt: auditReceipt.id, transition_receipt: transition.id };
}

function assertTransitionPrerequisites(params: {
	root: string;
	topic: string;
	action: "request-approval" | "approve" | "reject" | "advance";
	gate?: string;
	phaseId?: string;
}): void {
	const receipts = readJsonlRecords(receiptsPath(params.root, params.topic));
	const contextPacks = readJsonlRecords(contextPacksPath(params.root, params.topic));
	const contextKey = params.phaseId || params.gate;
	if (["request-approval", "approve", "advance"].includes(params.action) && contextKey) {
		const hasContextPack = contextPacks.some(
			(pack) =>
				pack.phase_id === contextKey ||
				pack.gate === contextKey ||
				(typeof pack.id === "string" && pack.id.endsWith(`:${contextKey}`)),
		);
		if (!hasContextPack) throw new Error(`Missing required context pack for ${contextKey}`);
	}
	if (["request-approval", "advance"].includes(params.action)) {
		const evidenceKey = params.phaseId || params.gate;
		const hasValidation = hasReceipt(
			receipts,
			(receipt) =>
				(receipt.kind === "validation" || receipt.type === "validation-receipt") &&
				(!evidenceKey ||
					receipt.phase_id === evidenceKey ||
					optionalString(receipt.id).includes(evidenceKey) ||
					(Array.isArray(receipt.validation_ids) &&
						receipt.validation_ids.some((id) => optionalString(id).includes(evidenceKey)))),
		);
		if (!hasValidation) throw new Error(`Missing required validation receipt for ${evidenceKey || "transition"}`);
		const hasAudit = hasReceipt(receipts, (receipt) => {
			const result = optionalString(receipt.status || receipt.result || receipt.decision).toLowerCase();
			return (
				(receipt.kind === "audit" || receipt.type === "auditor-receipt") &&
				(result === "pass" || result.includes("pass")) &&
				(!evidenceKey || receipt.phase_id === evidenceKey || optionalString(receipt.id).includes(evidenceKey))
			);
		});
		if (!hasAudit) throw new Error(`Missing required auditor PASS receipt for ${evidenceKey || "transition"}`);
	}
	if (params.action === "approve") {
		const hasRequest = receipts.some(
			(receipt) => receipt.action === "request-approval" && (!params.gate || receipt.gate === params.gate),
		);
		if (!hasRequest) throw new Error(`Missing approval request receipt for ${params.gate || "gate"}`);
	}
	if (params.action === "advance") {
		const rejected = receipts.some(
			(receipt) => receipt.action === "reject" && (!params.gate || receipt.gate === params.gate),
		);
		if (rejected) throw new Error(`Rejected gate blocks advance for ${params.gate || "gate"}`);
		const needsApproval = receipts.some(
			(receipt) => receipt.action === "request-approval" && (!params.gate || receipt.gate === params.gate),
		);
		if (needsApproval) {
			const approved = receipts.some(
				(receipt) => receipt.action === "approve" && (!params.gate || receipt.gate === params.gate),
			);
			if (!approved) throw new Error(`Pending human approval blocks advance for ${params.gate || "gate"}`);
		}
	}
}

export function recordWorkflowTransition(params: {
	root: string;
	topic: string;
	action: "request-approval" | "approve" | "reject" | "advance";
	gate?: string;
	phaseId?: string;
	toState?: string;
	summary: string;
	approvedBy?: string;
	ci?: boolean;
}): Record<string, unknown> {
	if (params.action === "approve" && !params.approvedBy && params.ci) {
		throw new Error("--approved-by is required for transition approval in CI/non-interactive mode");
	}
	if (params.toState && !LIFECYCLE_STATES.includes(params.toState as LifecycleState)) {
		throw new Error(`Unsupported lifecycle state: ${params.toState}`);
	}
	if (params.action === "request-approval" && (params.phaseId || params.gate)) {
		upsertContextPack({
			root: params.root,
			topic: params.topic,
			phaseId: params.phaseId || String(params.gate),
			summary: params.summary,
			mode: "update",
		});
	}
	assertTransitionPrerequisites(params);
	const approver =
		params.action === "approve"
			? resolveApprover({ root: params.root, explicitApprovedBy: params.approvedBy })
			: undefined;
	const kind = params.action === "approve" ? "approval" : params.action === "reject" ? "rejection" : "transition";
	return appendWorkflowReceipt({
		root: params.root,
		topic: params.topic,
		kind,
		phaseId: params.phaseId,
		summary: params.summary,
		data: {
			action: params.action,
			gate: params.gate,
			to_state: params.toState,
			approved_by: approver,
		},
	});
}

export function runWorkflowCli(argv = process.argv.slice(2)): WorkflowCliResult {
	const { command, options } = parseCliArgs(argv);
	const root = workflowRoot(options);
	const topic = workflowTopic(options);
	let result: Record<string, unknown>;
	if (command === "receipt-append" || command === "receipt_append") {
		result = appendWorkflowReceipt({
			root,
			topic,
			kind: opt(options, "kind"),
			summary: opt(options, "summary"),
			phaseId: typeof options["phase-id"] === "string" ? options["phase-id"] : undefined,
			id: optArray(options, "receipt-id")[0],
		});
	} else if (
		["context-pack-create", "context_pack_create", "context-pack-update", "context_pack_update"].includes(command)
	) {
		result = upsertContextPack({
			root,
			topic,
			phaseId: opt(options, "phase-id"),
			summary: opt(options, "summary"),
			artifacts: optArray(options, "artifact"),
			validationReceipts: optArray(options, "validation-receipt"),
			mode: command.includes("create") ? "create" : "update",
		});
	} else if (command === "proposal-init" || command === "proposal_init") {
		result = initProposal({ root, topic, title: typeof options.title === "string" ? options.title : undefined });
	} else if (command === "proposal-adr-sync" || command === "proposal_adr_sync") {
		result = syncProposalAdr({
			root,
			topic,
			adrRequired: opt(options, "adr-required"),
			adrReason: opt(options, "adr-reason"),
			adrOptionsStatus: typeof options["adr-options-status"] === "string" ? options["adr-options-status"] : undefined,
			adrToolMode: typeof options["adr-tool-mode"] === "string" ? options["adr-tool-mode"] : undefined,
			overrideRationale:
				typeof options["override-rationale"] === "string" ? options["override-rationale"] : undefined,
		});
	} else if (command === "proposal-finalize" || command === "proposal_finalize") {
		result = finalizeProposal({ root, topic, summary: typeof options.summary === "string" ? options.summary : undefined });
	} else if (command === "fact-add-source" || command === "fact_add_source") {
		result = addFactSource({
			root,
			topic,
			title: opt(options, "title"),
			url: typeof options.url === "string" ? options.url : undefined,
			id: typeof options.id === "string" ? options.id : undefined,
		});
	} else if (command === "fact-add-fact" || command === "fact_add_fact") {
		result = addFact({
			root,
			topic,
			title: opt(options, "title"),
			sourceId: typeof options["source-id"] === "string" ? options["source-id"] : undefined,
			id: typeof options.id === "string" ? options.id : undefined,
		});
	} else if (command === "fact-support-fact" || command === "fact_support_fact") {
		result = supportFact({ root, topic, factId: opt(options, "fact-id"), sourceId: opt(options, "source-id") });
	} else if (command === "plan-generate-graph" || command === "plan_generate_graph") {
		result = generatePlanGraph({ root, topic });
	} else if (command === "plan-finalize" || command === "plan_finalize") {
		result = finalizePlan({ root, topic, summary: typeof options.summary === "string" ? options.summary : undefined });
	} else if (command === "plan-status-set" || command === "plan_status_set") {
		result = setPlanStatus({ root, topic, id: opt(options, "id"), status: opt(options, "status") });
	} else if (command === "validation-complete-item" || command === "validation_complete_item") {
		result = completeValidationItem({ root, topic, validationId: opt(options, "validation-id") });
	} else if (command === "implement-start" || command === "implement_start") {
		result = startImplementation({ root, topic });
	} else if (command === "implement-step" || command === "implement_step") {
		result = implementStep({ root, topic, path: typeof options.path === "string" ? options.path : undefined });
	} else if (command === "implement-record" || command === "implement_record") {
		result = implementRecord({ root, topic, receiptIds: optArray(options, "receipt-id") });
	} else if (command === "implement-compact" || command === "implement_compact") {
		result = implementCompact({ root, topic, trigger: opt(options, "trigger"), summary: typeof options.summary === "string" ? options.summary : undefined });
	} else if (command === "implement-finalize" || command === "implement_finalize") {
		result = finalizeImplementation({ root, topic, summary: typeof options.summary === "string" ? options.summary : undefined });
	} else if (command === "transition-status" || command === "transition_status") {
		result = getWorkflowStatus({ root, topic });
	} else if (command === "transition-request-approval" || command === "transition_request_approval") {
		result = recordWorkflowTransition({
			root,
			topic,
			action: "request-approval",
			gate: opt(options, "gate"),
			phaseId: typeof options["phase-id"] === "string" ? options["phase-id"] : undefined,
			summary: opt(options, "summary", `Approval requested for ${opt(options, "gate")}`),
		});
	} else if (command === "transition-approve" || command === "transition_approve") {
		result = recordWorkflowTransition({
			root,
			topic,
			action: "approve",
			gate: opt(options, "gate"),
			phaseId: typeof options["phase-id"] === "string" ? options["phase-id"] : undefined,
			summary: opt(options, "summary"),
			approvedBy: typeof options["approved-by"] === "string" ? options["approved-by"] : undefined,
			ci: Boolean(options.ci),
		});
	} else if (command === "transition-reject" || command === "transition_reject") {
		result = recordWorkflowTransition({
			root,
			topic,
			action: "reject",
			gate: opt(options, "gate"),
			phaseId: typeof options["phase-id"] === "string" ? options["phase-id"] : undefined,
			summary: opt(options, "reason"),
		});
	} else if (command === "transition-advance" || command === "transition_advance") {
		result = recordWorkflowTransition({
			root,
			topic,
			action: "advance",
			gate: typeof options.gate === "string" ? options.gate : undefined,
			phaseId: typeof options["phase-id"] === "string" ? options["phase-id"] : undefined,
			toState: opt(options, "to"),
			summary: opt(options, "summary", `Advanced to ${opt(options, "to")}`),
		});
	} else {
		throw new Error(`Unknown workflow command: ${command}`);
	}
	return { ok: true, action: command, topic, ...result };
}

const isDirectWorkflowCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectWorkflowCli) {
	try {
		const result = runWorkflowCli();
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(
			JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2),
		);
		process.exitCode = 1;
	}
}
