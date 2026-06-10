#!/usr/bin/env node --experimental-strip-types
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;
type SourceRef = { path: string; sha256: string };
type StateFile = JsonRecord & {
	schema_version: number;
	topic: string;
	source_status?: "hashes-valid" | "stale";
	source_refs: Record<string, SourceRef>;
	current_phase_id: string | null;
	active_task_ids: string[];
	active_validation_ids: string[];
	next_action: JsonRecord;
	working_set: WorkingSet;
	known_failures: JsonRecord[];
	last_validation_receipt_ids: string[];
	journal_refs: string[];
	resume: JsonRecord;
	updated_at: string;
};
type WorkingSet = {
	write_allowed: PathReason[];
	read_only: PathReason[];
	forbidden: PathReason[];
};
type PathReason = { path: string; reason?: string };
type ParsedArgs = { command: string; options: Record<string, string | boolean | string[]> };

type ValidationReport = {
	ok: boolean;
	topic: string;
	errors: string[];
	warnings: string[];
	state_path?: string;
	journal_path?: string;
	current_path?: string;
};

const SOURCE_REF_FILES = {
	plan_md: "plan.md",
	plan_nodes: "plan.nodes.jsonl",
	plan_edges: "plan.edges.jsonl",
	receipts: "receipts.jsonl",
	context_packs: "context-packs.jsonl",
} as const;
const STATE_TOP_LEVEL_FIELDS = new Set([
	"schema_version",
	"topic",
	"source_status",
	"source_refs",
	"current_phase_id",
	"active_task_ids",
	"active_validation_ids",
	"next_action",
	"working_set",
	"known_failures",
	"last_validation_receipt_ids",
	"journal_refs",
	"resume",
	"updated_at",
	"compaction",
	"stale_reason",
]);
const JOURNAL_KINDS = new Set([
	"gotcha",
	"insight",
	"failed_hypothesis",
	"constraint",
	"phase_summary",
	"tooling_lesson",
	"decision_note",
]);
const RAW_PRIVATE_PATH_RE = /\.plan\/_private\/(?!<topic>|_inbox\/<)[^\s`"')\]]+/;
const TRANSCRIPT_HINT_RE = /\b(tool call|assistant:|user:|stdout|stderr|full output|raw log|transcript)\b/i;

function parseArgs(argv: string[]): ParsedArgs {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") usage(0);
	const options: Record<string, string | boolean | string[]> = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
		const name = token.slice(2);
		if (["json"].includes(name)) {
			options[name] = true;
			continue;
		}
		const value = rest[index + 1];
		if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
		index += 1;
		if (["receipt-id", "journal-ref"].includes(name)) {
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
  ${script} state-init --root <root> --topic <topic> [--json]
  ${script} state-validate --root <root> --topic <topic> [--json]
  ${script} state-set-next --root <root> --topic <topic> --next-action-json '<json>' [--json]
  ${script} state-set-working-set --root <root> --topic <topic> --working-set-json '<json>' [--json]
  ${script} state-record-validation-ref --root <root> --topic <topic> --receipt-id <id> [--receipt-id <id> ...] [--json]
  ${script} state-mark-stale --root <root> --topic <topic> [--reason <text>] [--json]
  ${script} journal-append --root <root> --topic <topic> --record-json '<json>' [--json]
  ${script} current-set --root <root> --topic <topic> [--worktree-id <id>] [--git-branch <branch>] [--last-seen-commit <sha>] [--json]
  ${script} compact-generate --root <root> --topic <topic> --trigger <name> [--summary <text> --impact <text> --importance <1-5> --evidence-json '<json>'] [--json]
  ${script} state-resume --root <root> --topic <topic> [--max-journal <n>] [--json]`);
	process.exit(exitCode);
}

function optString(options: Record<string, unknown>, name: string, fallback?: string): string {
	const value = options[name];
	if (typeof value === "string" && value.length > 0) return value;
	if (fallback !== undefined) return fallback;
	throw new Error(`Missing required --${name}`);
}

function optNumber(options: Record<string, unknown>, name: string, fallback: number): number {
	const value = options[name];
	if (typeof value !== "string") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function rootFrom(options: Record<string, unknown>): string {
	return path.resolve(optString(options, "root", "."));
}

function topicFrom(options: Record<string, unknown>): string {
	const topic = optString(options, "topic");
	if (!/^[a-z0-9][a-z0-9-]*$/.test(topic)) throw new Error(`Invalid topic slug: ${topic}`);
	return topic;
}

function topicPlanDir(root: string, topic: string): string {
	return path.join(root, ".plan", topic);
}

function topicCartographerDir(root: string, topic: string): string {
	return path.join(root, ".cartographer", topic);
}

function statePath(root: string, topic: string): string {
	return path.join(topicCartographerDir(root, topic), "state.json");
}

function journalPath(root: string, topic: string): string {
	return path.join(topicCartographerDir(root, topic), "journal.jsonl");
}

function currentPath(root: string): string {
	return path.join(root, ".cartographer", "current.json");
}

function rel(root: string, absPath: string): string {
	return path.relative(root, absPath).split(path.sep).join("/");
}

function utcNow(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sha256File(filePath: string): string {
	return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function readJson(filePath: string): JsonRecord {
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonRecord;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
	fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	fs.renameSync(tmp, filePath);
}

function readJsonl(filePath: string): JsonRecord[] {
	if (!fs.existsSync(filePath)) return [];
	return fs
		.readFileSync(filePath, "utf8")
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as JsonRecord);
}

function writeJsonlAtomic(filePath: string, records: JsonRecord[]): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
	fs.writeFileSync(tmp, records.map((record) => `${JSON.stringify(record)}\n`).join(""), "utf8");
	fs.renameSync(tmp, filePath);
}

function buildSourceRefs(root: string, topic: string): Record<string, SourceRef> {
	const refs: Record<string, SourceRef> = {};
	for (const [key, filename] of Object.entries(SOURCE_REF_FILES)) {
		const abs = path.join(topicPlanDir(root, topic), filename);
		if (!fs.existsSync(abs)) throw new Error(`Missing required .plan artifact for state source ref: ${rel(root, abs)}`);
		refs[key] = { path: rel(root, abs), sha256: sha256File(abs) };
	}
	return refs;
}

function defaultSchemas(): { state: JsonRecord; journal: JsonRecord } {
	return {
		state: {
			$schema: "https://json-schema.org/draft/2020-12/schema",
			title: "Cartographer execution state",
			type: "object",
			required: ["schema_version", "topic", "source_refs", "next_action", "working_set", "resume", "updated_at"],
			additionalProperties: false,
			description:
				"Compact execution/resume snapshot that references authoritative .plan artifacts instead of duplicating the plan graph.",
		},
		journal: {
			$schema: "https://json-schema.org/draft/2020-12/schema",
			title: "Cartographer curated journal record",
			type: "object",
			required: ["id", "ts", "kind", "summary", "impact", "evidence", "importance", "status"],
			additionalProperties: false,
			description: "Append-only curated durable lessons/gotchas/constraints; not a transcript or receipt log.",
		},
	};
}

function writeSchemas(root: string, topic: string): void {
	const schemas = defaultSchemas();
	const schemasDir = path.join(topicCartographerDir(root, topic), "schemas");
	writeJsonAtomic(path.join(schemasDir, "state.schema.json"), schemas.state);
	writeJsonAtomic(path.join(schemasDir, "journal.schema.json"), schemas.journal);
}

function firstPhaseId(root: string, topic: string): string | null {
	const nodes = readJsonl(path.join(topicPlanDir(root, topic), "plan.nodes.jsonl"));
	const phase = nodes.find((record) => record.type === "phase" && typeof record.phase_id === "string");
	return typeof phase?.phase_id === "string" ? phase.phase_id : null;
}

function initialState(root: string, topic: string): StateFile {
	const phase = firstPhaseId(root, topic);
	return {
		schema_version: 1,
		topic,
		source_status: "hashes-valid",
		source_refs: buildSourceRefs(root, topic),
		current_phase_id: phase,
		active_task_ids: [],
		active_validation_ids: [],
		next_action: {
			id: phase ? `next:${phase}.orient` : "next:orient",
			kind: "orient",
			summary: "Load state, selected journal records, and authoritative .plan artifacts before editing.",
			phase_id: phase,
		},
		working_set: {
			write_allowed: [],
			read_only: [],
			forbidden: [{ path: ".plan/_private/**", reason: "Raw private inputs are never loaded into working context." }],
		},
		known_failures: [],
		last_validation_receipt_ids: [],
		journal_refs: [],
		resume: {
			template_id: "cartographer.single_writer.resume.v1",
			resume_order: [
				`.cartographer/${topic}/state.json`,
				`.cartographer/${topic}/journal.jsonl`,
				`.plan/${topic}/plan.md`,
				`.plan/${topic}/receipts.jsonl`,
			],
			expected_first_response: ["current_phase", "next_action", "files_to_inspect"],
			must_ignore: ["prior chat speculation", "stale generated snippets"],
		},
		updated_at: utcNow(),
	};
}

function stateInit(root: string, topic: string): JsonRecord {
	const dir = topicCartographerDir(root, topic);
	fs.mkdirSync(dir, { recursive: true });
	writeSchemas(root, topic);
	if (!fs.existsSync(journalPath(root, topic))) fs.writeFileSync(journalPath(root, topic), "", "utf8");
	if (!fs.existsSync(statePath(root, topic))) writeJsonAtomic(statePath(root, topic), initialState(root, topic));
	const report = validateState(root, topic, { includeCurrent: false });
	return { ...report, action: "state-init" };
}

function hasRawPrivatePath(value: unknown): boolean {
	if (typeof value === "string") {
		if (value === ".plan/_private/**" || value.startsWith(".plan/_private/<topic>")) return false;
		return RAW_PRIVATE_PATH_RE.test(value);
	}
	if (Array.isArray(value)) return value.some(hasRawPrivatePath);
	if (value && typeof value === "object") return Object.values(value as JsonRecord).some(hasRawPrivatePath);
	return false;
}

function validateJournalRecord(record: JsonRecord, index: number, receiptIds: Set<string>, errors: string[]): void {
	const label = `journal record ${index}`;
	for (const field of ["id", "ts", "kind", "summary", "impact", "evidence", "importance", "status"]) {
		if (!(field in record)) errors.push(`${label} missing ${field}`);
	}
	if (typeof record.id !== "string" || !record.id.startsWith("journal:"))
		errors.push(`${label} id must start with journal:`);
	if (typeof record.kind !== "string" || !JOURNAL_KINDS.has(record.kind))
		errors.push(`${label} has unsupported kind ${String(record.kind)}`);
	if (typeof record.summary !== "string" || record.summary.length > 280 || record.summary.includes("\n"))
		errors.push(`${label} summary must be one bounded line <= 280 chars`);
	if (typeof record.impact !== "string" || record.impact.length > 500)
		errors.push(`${label} impact must be <= 500 chars`);
	if (typeof record.importance !== "number" || record.importance < 1 || record.importance > 5)
		errors.push(`${label} importance must be a number from 1 to 5`);
	if (!Array.isArray(record.evidence) || record.evidence.length === 0) errors.push(`${label} requires evidence[]`);
	if (typeof record.summary === "string" && TRANSCRIPT_HINT_RE.test(record.summary))
		errors.push(`${label} looks like transcript/log content instead of a durable lesson`);
	if (typeof record.impact === "string" && TRANSCRIPT_HINT_RE.test(record.impact))
		errors.push(`${label} impact looks like transcript/log content instead of a durable lesson`);
	if (hasRawPrivatePath(record)) errors.push(`${label} contains a raw .plan/_private path`);
	if (Array.isArray(record.evidence)) {
		for (const evidence of record.evidence) {
			if (evidence && typeof evidence === "object" && "receipt_id" in evidence) {
				const receiptId = (evidence as JsonRecord).receipt_id;
				if (typeof receiptId === "string" && !receiptIds.has(receiptId))
					errors.push(`${label} references unknown receipt ${receiptId}`);
			}
		}
	}
}

function planIds(root: string, topic: string): { phases: Set<string>; tasks: Set<string>; validations: Set<string> } {
	const records = readJsonl(path.join(topicPlanDir(root, topic), "plan.nodes.jsonl"));
	const phases = new Set<string>();
	const tasks = new Set<string>();
	const validations = new Set<string>();
	for (const record of records) {
		if (record.type === "phase" && typeof record.phase_id === "string") phases.add(record.phase_id);
		if (record.type === "task" && typeof record.task_id === "string") tasks.add(record.task_id);
		if (record.type === "validation" && typeof record.validation_id === "string") validations.add(record.validation_id);
	}
	return { phases, tasks, validations };
}

function receiptIds(root: string, topic: string): Set<string> {
	return new Set(
		readJsonl(path.join(topicPlanDir(root, topic), "receipts.jsonl"))
			.map((record) => record.id)
			.filter((id): id is string => typeof id === "string"),
	);
}

function validatePathReasonArray(root: string, label: string, value: unknown, errors: string[]): PathReason[] {
	if (!Array.isArray(value)) {
		errors.push(`working_set.${label} must be an array`);
		return [];
	}
	const paths: PathReason[] = [];
	for (const [index, item] of value.entries()) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			errors.push(`working_set.${label}[${index}] must be an object`);
			continue;
		}
		const record = item as JsonRecord;
		if (typeof record.path !== "string" || record.path.length === 0) {
			errors.push(`working_set.${label}[${index}].path is required`);
			continue;
		}
		if (hasRawPrivatePath(record.path) && !(label === "forbidden" && record.path === ".plan/_private/**"))
			errors.push(`working_set.${label}[${index}] contains a raw .plan/_private path`);
		if (!record.path.includes("*") && label !== "forbidden" && !fs.existsSync(path.join(root, record.path)))
			errors.push(`working_set.${label}[${index}] path does not exist and is not a glob: ${record.path}`);
		paths.push({ path: record.path, reason: typeof record.reason === "string" ? record.reason : undefined });
	}
	return paths;
}

function pathOverlap(writePath: string, forbiddenPath: string): boolean {
	if (writePath === forbiddenPath) return true;
	if (forbiddenPath.endsWith("/**"))
		return writePath === forbiddenPath.slice(0, -3) || writePath.startsWith(forbiddenPath.slice(0, -2));
	if (writePath.endsWith("/**"))
		return forbiddenPath === writePath.slice(0, -3) || forbiddenPath.startsWith(writePath.slice(0, -2));
	return false;
}

function validateState(root: string, topic: string, options: { includeCurrent?: boolean } = {}): ValidationReport {
	const errors: string[] = [];
	const warnings: string[] = [];
	const stateFile = statePath(root, topic);
	const journalFile = journalPath(root, topic);
	if (!fs.existsSync(stateFile)) errors.push(`Missing state file: ${rel(root, stateFile)}`);
	if (!fs.existsSync(journalFile)) errors.push(`Missing journal file: ${rel(root, journalFile)}`);
	if (errors.length)
		return {
			ok: false,
			topic,
			errors,
			warnings,
			state_path: rel(root, stateFile),
			journal_path: rel(root, journalFile),
		};

	const state = readJson(stateFile) as StateFile;
	for (const key of Object.keys(state))
		if (!STATE_TOP_LEVEL_FIELDS.has(key)) errors.push(`Unknown state field: ${key}`);
	if (state.schema_version !== 1) errors.push("state.schema_version must be 1");
	if (state.topic !== topic) errors.push(`state.topic ${state.topic} does not match ${topic}`);
	if (hasRawPrivatePath(state)) errors.push("state contains a raw .plan/_private path");
	if (
		(state.source_refs as JsonRecord)?.plan_json ||
		fs.existsSync(path.join(topicCartographerDir(root, topic), "plan.json"))
	)
		errors.push("state must not introduce duplicate plan truth such as plan.json");

	const ids = planIds(root, topic);
	if (state.current_phase_id !== null && (!state.current_phase_id || !ids.phases.has(state.current_phase_id))) {
		const phaseId = state.current_phase_id || "<empty>";
		errors.push(`current_phase_id does not resolve in plan.nodes.jsonl: ${phaseId}`);
	}
	for (const taskId of state.active_task_ids || [])
		if (!ids.tasks.has(taskId)) errors.push(`active_task_id does not resolve: ${taskId}`);
	for (const validationId of state.active_validation_ids || [])
		if (!ids.validations.has(validationId)) errors.push(`active_validation_id does not resolve: ${validationId}`);
	if (!state.next_action || typeof state.next_action !== "object" || Array.isArray(state.next_action)) {
		errors.push("state must have exactly one next_action object");
	} else {
		const next = state.next_action;
		for (const field of ["id", "kind", "summary"])
			if (typeof next[field] !== "string") errors.push(`next_action.${field} must be a string`);
		if (typeof next.task_id === "string" && !ids.tasks.has(next.task_id))
			errors.push(`next_action.task_id does not resolve: ${next.task_id}`);
		if (typeof next.phase_id === "string" && !ids.phases.has(next.phase_id))
			errors.push(`next_action.phase_id does not resolve: ${next.phase_id}`);
	}

	if (!state.working_set || typeof state.working_set !== "object" || Array.isArray(state.working_set)) {
		errors.push("working_set must be an object");
	} else {
		const workingSet = state.working_set as JsonRecord;
		const writeAllowed = validatePathReasonArray(root, "write_allowed", workingSet.write_allowed, errors);
		validatePathReasonArray(root, "read_only", workingSet.read_only, errors);
		const forbidden = validatePathReasonArray(root, "forbidden", workingSet.forbidden, errors);
		for (const writePath of writeAllowed) {
			for (const forbiddenPath of forbidden) {
				if (pathOverlap(writePath.path, forbiddenPath.path))
					errors.push(`write_allowed path overlaps forbidden path: ${writePath.path}`);
			}
		}
	}

	for (const [key, ref] of Object.entries(state.source_refs || {})) {
		if (!ref || typeof ref !== "object" || typeof ref.path !== "string" || typeof ref.sha256 !== "string") {
			errors.push(`source_refs.${key} must include path and sha256`);
			continue;
		}
		if (hasRawPrivatePath(ref.path)) errors.push(`source_refs.${key} points at raw private path`);
		const abs = path.join(root, ref.path);
		if (!fs.existsSync(abs)) {
			errors.push(`source_refs.${key} path does not exist: ${ref.path}`);
			continue;
		}
		const digest = sha256File(abs);
		if (digest !== ref.sha256 && state.source_status !== "stale")
			errors.push(`source_refs.${key} hash mismatch; mark state stale or regenerate`);
	}

	const receipts = receiptIds(root, topic);
	for (const receiptId of state.last_validation_receipt_ids || [])
		if (!receipts.has(receiptId)) errors.push(`last_validation_receipt_id does not resolve: ${receiptId}`);

	const journal = readJsonl(journalFile);
	const journalIds = new Set<string>();
	journal.forEach((record, index) => {
		if (typeof record.id === "string") journalIds.add(record.id);
		validateJournalRecord(record, index + 1, receipts, errors);
	});
	for (const journalId of state.journal_refs || [])
		if (!journalIds.has(journalId)) errors.push(`journal_ref does not resolve: ${journalId}`);

	if (options.includeCurrent) {
		const current = currentPath(root);
		if (fs.existsSync(current)) {
			const pointer = readJson(current);
			if (pointer.active_topic === topic && pointer.state_path !== rel(root, stateFile))
				warnings.push("current.json active_topic matches but state_path differs from expected path");
		}
	}
	return {
		ok: errors.length === 0,
		topic,
		errors,
		warnings,
		state_path: rel(root, stateFile),
		journal_path: rel(root, journalFile),
	};
}

function requireReadableState(root: string, topic: string): StateFile {
	const filePath = statePath(root, topic);
	if (!fs.existsSync(filePath)) throw new Error(`Missing state file: ${rel(root, filePath)}`);
	return readJson(filePath) as StateFile;
}

function requireValid(root: string, topic: string): StateFile {
	const report = validateState(root, topic, { includeCurrent: true });
	if (!report.ok) throw new Error(report.errors.join("\n"));
	return readJson(statePath(root, topic)) as StateFile;
}

function updateState(
	root: string,
	topic: string,
	mutate: (state: StateFile) => void,
	options: { refreshSourceRefs?: boolean } = {},
): JsonRecord {
	const state = requireReadableState(root, topic);
	mutate(state);
	if (options.refreshSourceRefs !== false) {
		state.source_refs = buildSourceRefs(root, topic);
		state.source_status = "hashes-valid";
	}
	state.updated_at = utcNow();
	writeJsonAtomic(statePath(root, topic), state);
	const report = validateState(root, topic, { includeCurrent: true });
	if (!report.ok) throw new Error(report.errors.join("\n"));
	return report;
}

function stateSetNext(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	const next = JSON.parse(optString(options, "next-action-json")) as unknown;
	if (!next || typeof next !== "object" || Array.isArray(next))
		throw new Error("--next-action-json must be a JSON object");
	return {
		...updateState(root, topic, (state) => void (state.next_action = next as JsonRecord)),
		action: "state-set-next",
	};
}

function stateSetWorkingSet(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	const workingSet = JSON.parse(optString(options, "working-set-json")) as unknown;
	if (!workingSet || typeof workingSet !== "object" || Array.isArray(workingSet))
		throw new Error("--working-set-json must be a JSON object");
	return {
		...updateState(root, topic, (state) => void (state.working_set = workingSet as WorkingSet)),
		action: "state-set-working-set",
	};
}

function stateRecordValidationRef(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	const raw = options["receipt-id"];
	const ids = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
	if (ids.length === 0) throw new Error("state-record-validation-ref requires --receipt-id");
	return {
		...updateState(root, topic, (state) => {
			for (const id of ids)
				if (typeof id === "string" && !state.last_validation_receipt_ids.includes(id))
					state.last_validation_receipt_ids.push(id);
		}),
		action: "state-record-validation-ref",
	};
}

function stateMarkStale(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	return {
		...updateState(
			root,
			topic,
			(state) => {
				state.source_status = "stale";
				if (typeof options.reason === "string" && options.reason) state.stale_reason = options.reason;
			},
			{ refreshSourceRefs: false },
		),
		action: "state-mark-stale",
	};
}

function journalAppend(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	requireValid(root, topic);
	const record = JSON.parse(optString(options, "record-json")) as unknown;
	if (!record || typeof record !== "object" || Array.isArray(record))
		throw new Error("--record-json must be a JSON object");
	const journalRecord = record as JsonRecord;
	const journalId = typeof journalRecord.id === "string" ? journalRecord.id : JSON.stringify(journalRecord.id);
	const records = readJsonl(journalPath(root, topic));
	if (records.some((item) => item.id === journalRecord.id)) throw new Error(`Duplicate journal id: ${journalId}`);
	records.push(journalRecord);
	writeJsonlAtomic(journalPath(root, topic), records);
	const report = validateState(root, topic, { includeCurrent: true });
	if (!report.ok) throw new Error(report.errors.join("\n"));
	return { ...report, action: "journal-append", journal_id: journalRecord.id };
}

function currentSet(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	const pointer = {
		schema_version: 1,
		active_topic: topic,
		state_path: `.cartographer/${topic}/state.json`,
		journal_path: `.cartographer/${topic}/journal.jsonl`,
		root,
		worktree_id: typeof options["worktree-id"] === "string" ? options["worktree-id"] : path.basename(root),
		git_branch: typeof options["git-branch"] === "string" ? options["git-branch"] : undefined,
		last_seen_commit: typeof options["last-seen-commit"] === "string" ? options["last-seen-commit"] : undefined,
		updated_at: utcNow(),
	};
	writeJsonAtomic(currentPath(root), pointer);
	const report = validateState(root, topic, { includeCurrent: true });
	return { ...report, action: "current-set", current_path: ".cartographer/current.json" };
}

function compactGenerate(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	const trigger = optString(options, "trigger");
	const state = requireValid(root, topic);
	state.source_refs = buildSourceRefs(root, topic);
	state.source_status = "hashes-valid";
	state.compaction = { trigger, compacted_at: utcNow() };
	state.updated_at = utcNow();
	writeJsonAtomic(statePath(root, topic), state);
	if (typeof options.summary === "string" && options.summary && typeof options.impact === "string" && options.impact) {
		const evidence =
			typeof options["evidence-json"] === "string"
				? JSON.parse(options["evidence-json"])
				: [{ path: `.cartographer/${topic}/state.json` }];
		const record: JsonRecord = {
			id: `journal:${utcNow().replace(/[-:]/g, "").replace("Z", "Z")}:compact`,
			ts: utcNow(),
			kind: "phase_summary",
			summary: options.summary,
			impact: options.impact,
			evidence,
			importance: optNumber(options, "importance", 3),
			status: "active",
			tags: ["compaction", trigger],
		};
		const records = readJsonl(journalPath(root, topic));
		records.push(record);
		writeJsonlAtomic(journalPath(root, topic), records);
		const refreshed = readJson(statePath(root, topic)) as StateFile;
		if (!refreshed.journal_refs.includes(record.id as string)) refreshed.journal_refs.push(record.id as string);
		writeJsonAtomic(statePath(root, topic), refreshed);
	}
	const report = validateState(root, topic, { includeCurrent: true });
	if (!report.ok) throw new Error(report.errors.join("\n"));
	return { ...report, action: "compact-generate", trigger };
}

function stateResume(root: string, topic: string, options: Record<string, unknown>): JsonRecord {
	const before = fileDigests([statePath(root, topic), journalPath(root, topic), currentPath(root)]);
	const report = validateState(root, topic, { includeCurrent: true });
	const state = readJson(statePath(root, topic)) as StateFile;
	const journal = readJsonl(journalPath(root, topic));
	const maxJournal = optNumber(options, "max-journal", 5);
	const selectedJournal = journal
		.filter((record) => state.journal_refs.includes(String(record.id)) || Number(record.importance || 0) >= 4)
		.slice(0, maxJournal)
		.map((record) => ({
			id: record.id,
			kind: record.kind,
			summary: record.summary,
			impact: record.impact,
			importance: record.importance,
		}));
	const workingSet = state.working_set || { write_allowed: [], read_only: [], forbidden: [] };
	const context =
		`<CARTOGRAPHER_RESUME_CONTEXT version="1" source=".cartographer/${topic}/state.json">\n` +
		`Topic: ${topic}\n` +
		`Source status: ${report.ok ? state.source_status || "hashes-valid" : "invalid"}\n` +
		`Current phase: ${state.current_phase_id ?? "none"}\n` +
		`Active tasks: ${state.active_task_ids.join(", ") || "none"}\n` +
		`Active validations: ${state.active_validation_ids.join(", ") || "none"}\n` +
		`Next action: ${JSON.stringify(state.next_action)}\n` +
		`Working set: ${JSON.stringify(workingSet)}\n` +
		`Known failures: ${JSON.stringify(state.known_failures.slice(0, 5))}\n` +
		`Selected journal: ${JSON.stringify(selectedJournal)}\n` +
		`Validation refs: ${state.last_validation_receipt_ids.join(", ") || "none"}\n` +
		`Required first response: current phase, next action, files to inspect\n` +
		`</CARTOGRAPHER_RESUME_CONTEXT>`;
	const after = fileDigests([statePath(root, topic), journalPath(root, topic), currentPath(root)]);
	return { ...report, action: "state-resume", context, read_only: JSON.stringify(before) === JSON.stringify(after) };
}

function fileDigests(files: string[]): Record<string, string | null> {
	return Object.fromEntries(files.map((file) => [file, fs.existsSync(file) ? sha256File(file) : null]));
}

function main(): number {
	try {
		const { command, options } = parseArgs(process.argv.slice(2));
		const root = rootFrom(options);
		const topic = topicFrom(options);
		let result: JsonRecord;
		switch (command) {
			case "state-init":
				result = stateInit(root, topic);
				break;
			case "state-validate":
				result = { ...validateState(root, topic, { includeCurrent: true }), action: command };
				break;
			case "state-set-next":
				result = stateSetNext(root, topic, options);
				break;
			case "state-set-working-set":
				result = stateSetWorkingSet(root, topic, options);
				break;
			case "state-record-validation-ref":
				result = stateRecordValidationRef(root, topic, options);
				break;
			case "state-mark-stale":
				result = stateMarkStale(root, topic, options);
				break;
			case "journal-append":
				result = journalAppend(root, topic, options);
				break;
			case "current-set":
				result = currentSet(root, topic, options);
				break;
			case "compact-generate":
				result = compactGenerate(root, topic, options);
				break;
			case "state-resume":
				result = stateResume(root, topic, options);
				break;
			default:
				throw new Error(`Unknown command: ${command}`);
		}
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else console.log((result.ok === false ? "FAIL" : "OK") + "\n" + JSON.stringify(result, null, 2));
		return result.ok === false ? 1 : 0;
	} catch (error) {
		const result = { ok: false, error: error instanceof Error ? error.message : String(error) };
		console.error(JSON.stringify(result, null, 2));
		return 1;
	}
}

process.exitCode = main();
