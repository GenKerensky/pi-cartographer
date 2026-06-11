#!/usr/bin/env node --experimental-strip-types
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FACT_CITATION_RE = /\[(F\d+)\]/g;
const REQUIREMENT_CITATION_RE = /\[((?:REQ|SCN|AC)-[A-Z0-9][A-Z0-9_.-]*)\]/g;
const REFERENCE_RE = /(^|\s|[`([])([A-Za-z0-9_./@+-]+\.[A-Za-z0-9_./@+-]+):(\d+)/g;
const LIFECYCLE_STATES = new Set(["draft", "accepted", "planned", "in-progress", "implemented", "superseded", "stale"]);
const MISS_FAILURE_TYPES = new Set([
	"vocabulary_mismatch",
	"generic_noise",
	"missing_context",
	"stale_artifact",
	"ranking_failure",
	"tool_failure",
]);
const MISS_RESOLUTIONS = new Set(["query_expansion", "path_constraint", "manual_read", "user_hint", "unresolved"]);
const RAW_MISS_FIELDS = new Set(["text", "snippet", "raw_snippet", "content", "raw_content"]);
const SECRET_PATTERNS: Array<[string, RegExp]> = [
	["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	["github-token", /\b(?:github_pat|gh[pousr])_[A-Za-z0-9_]{20,}\b/],
	["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
	["jwt", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
	["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b/i],
	["connection-string", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s`"']+/i],
];
const ACTUAL_PRIVATE_PATH_RE = /\.plan\/_private\/(?!<topic>|_inbox\/<)[^\s`"')\]]+/g;

type JsonRecord = Record<string, unknown>;
type ValidateReport = {
	ok: boolean;
	topic?: string;
	file?: string;
	errors: string[];
	warnings?: string[];
	count?: number;
	counts?: Record<string, number>;
};

function parseArgs(argv: string[]): {
	command: string;
	options: Record<string, string | boolean | string[]>;
} {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") usage(0);
	const options: Record<string, string | boolean | string[]> = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
		const name = token.slice(2);
		if (["json", "require-id", "merge", "no-merge"].includes(name)) {
			options[name] = true;
			continue;
		}
		const value = rest[index + 1];
		if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
		index += 1;
		if (name === "key") {
			const current = options[name];
			options[name] = Array.isArray(current) ? [...current, value] : [value];
		} else {
			options[name] = value;
		}
	}
	if (options["no-merge"]) options.merge = false;
	return { command, options };
}

function usage(exitCode: number): never {
	const script = path.basename(fileURLToPath(import.meta.url));
	console.log(`Usage:
  ${script} validate-topic --root <root> --topic <topic> [--json]
  ${script} validate-file --file <path> [--require-id] [--json]
  ${script} validate-misses --root <root> [--json]
  ${script} list-misses --root <root> [--limit 20] [--json]
  ${script} upsert --file <path> --record '<json>' [--key id] [--no-merge] [--json]
  ${script} list --file <path> [--limit 20] [--json]
  ${script} list-records --root <root> --topic <topic> --artifact <name> [--limit 20] [--json]
  ${script} show-record --root <root> --topic <topic> --artifact <name> --id <id> [--json]
  ${script} validate-topic-summary --root <root> --topic <topic> [--json]
  ${script} fact-citation-summary --root <root> --topic <topic> [--json]
  ${script} receipt-summary --root <root> --topic <topic> [--limit 20] [--json]
  ${script} context-pack-summary --root <root> --topic <topic> [--limit 20] [--json]
  ${script} evidence-manifest-summary --root <root> --topic <topic> [--limit 20] [--json]
  ${script} phase-summary --root <root> --topic <topic> [--phase-id <id>] [--json]
  ${script} seed-pi-facts --root <root> --topic <topic> [--json]`);
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

function readJsonl(filePath: string, required = false): { records: JsonRecord[]; errors: string[] } {
	const errors: string[] = [];
	if (!fs.existsSync(filePath)) {
		if (required) errors.push(`Missing required JSONL file: ${filePath}`);
		return { records: [], errors };
	}
	const records: JsonRecord[] = [];
	const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line) continue;
		try {
			const value: unknown = JSON.parse(line);
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				errors.push(`JSONL record must be an object in ${filePath}:${index + 1}`);
			} else {
				records.push(value as JsonRecord);
			}
		} catch (error) {
			errors.push(`Invalid JSONL in ${filePath}:${index + 1}: ${String(error)}`);
		}
	}
	return { records, errors };
}

function writeJsonlAtomic(filePath: string, records: JsonRecord[]): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = path.join(path.dirname(filePath), `.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
	const text = records.map((record) => `${JSON.stringify(sortObject(record))}\n`).join("");
	fs.writeFileSync(tmp, text, "utf8");
	fs.renameSync(tmp, filePath);
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortObject);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => [key, sortObject(item)]),
	);
}

function defaultKeysFor(filePath: string, record: JsonRecord): string[] {
	if ("id" in record) return ["id"];
	if ("from" in record && "to" in record && "type" in record) return ["from", "to", "type"];
	if (filePath.endsWith(".edges.jsonl")) return ["from", "to", "type"];
	return ["id"];
}

function recordKey(record: JsonRecord, keys: string[]): string {
	return JSON.stringify(keys.map((key) => record[key] ?? null));
}

function upsert(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const filePath = path.resolve(optString(options, "file"));
	const record = JSON.parse(optString(options, "record")) as unknown;
	if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("--record must be a JSON object");
	const parsed = readJsonl(filePath);
	if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
	const jsonRecord = record as JsonRecord;
	const keys = Array.isArray(options.key) ? options.key : defaultKeysFor(filePath, jsonRecord);
	for (const key of keys)
		if (jsonRecord[key] === undefined || jsonRecord[key] === null)
			throw new Error(`Record is missing key field: ${key}`);
	const target = recordKey(jsonRecord, keys);
	let action = "inserted";
	const merge = options.merge !== false;
	const records = parsed.records;
	const existingIndex = records.findIndex((item) => recordKey(item, keys) === target);
	if (existingIndex >= 0) {
		records[existingIndex] = merge ? { ...records[existingIndex], ...jsonRecord } : jsonRecord;
		action = "updated";
	} else {
		records.push(jsonRecord);
	}
	writeJsonlAtomic(filePath, records);
	return { ok: true, action, file: filePath, keys, count: records.length };
}

function validateUnique(records: JsonRecord[], label: string, errors: string[]): Set<string> {
	const ids = new Set<string>();
	records.forEach((record, index) => {
		const id = record.id;
		if (!id) {
			errors.push(`Missing id in ${label} record ${index + 1}`);
			return;
		}
		const text = String(id);
		if (ids.has(text)) errors.push(`Duplicate id ${JSON.stringify(text)} in ${label}`);
		ids.add(text);
	});
	return ids;
}

function validateEdges(records: JsonRecord[], label: string, allowed: Set<string>, errors: string[]): void {
	records.forEach((record, index) => {
		for (const key of ["from", "to", "type"])
			if (!record[key]) errors.push(`Missing ${JSON.stringify(key)} in ${label} record ${index + 1}`);
		for (const endpoint of ["from", "to"]) {
			const value = record[endpoint];
			const text = value === undefined || value === null ? "" : String(value);
			if (text && !allowed.has(text) && !/^(file|doc|symbol|dependency):/.test(text))
				errors.push(`Unresolved edge endpoint ${JSON.stringify(text)} in ${label} record ${index + 1}`);
		}
	});
}

function validateFileRefs(root: string, records: JsonRecord[], errors: string[]): void {
	for (const record of records) {
		for (const field of ["reference", "evidence"]) {
			const value = record[field];
			if (typeof value !== "string") continue;
			for (const match of value.matchAll(REFERENCE_RE)) {
				const pathText = match[2];
				const lineText = match[3];
				let resolved = path.isAbsolute(pathText) ? pathText : path.join(root, pathText);
				if (!fs.existsSync(resolved) && typeof record.url === "string" && record.url.startsWith("file://")) {
					const urlPath = fileURLToPath(record.url);
					if (path.basename(urlPath) === path.basename(pathText)) resolved = urlPath;
				}
				if (!fs.existsSync(resolved)) {
					errors.push(`Missing referenced file: ${pathText}`);
					continue;
				}
				const lineCount = fs.readFileSync(resolved, "utf8").split(/\r?\n/).length;
				if (Number(lineText) > lineCount) errors.push(`Reference line out of range: ${pathText}:${lineText}`);
			}
		}
	}
}

function hasVerificationEvidence(record: JsonRecord): boolean {
	const verification = record.verification;
	if (!verification || typeof verification !== "object" || Array.isArray(verification)) return false;
	return ["read", "rg", "validation"].some((key) => {
		const value = (verification as JsonRecord)[key];
		return Array.isArray(value) ? value.length > 0 : Boolean(value);
	});
}

function lifecycleField(record: JsonRecord): string | undefined {
	for (const field of ["lifecycle", "lifecycle_status", "artifact_status"])
		if (record[field] !== undefined) return field;
	const recordType = typeof record.type === "string" ? record.type : "";
	const id = typeof record.id === "string" ? record.id : "";
	if (
		record.status !== undefined &&
		!id.startsWith("phase:") &&
		!id.startsWith("task:") &&
		!id.startsWith("validation:") &&
		["proposal", "plan", "map", "fact", "source", "artifact", "rationale"].includes(recordType)
	)
		return "status";
	return undefined;
}

function validateLifecycleAndRetrievalMetadata(
	records: JsonRecord[],
	label: string,
	errors: string[],
	warnings: string[],
): void {
	records.forEach((record, index) => {
		const field = lifecycleField(record);
		if (field) {
			const value = String(record[field]);
			if (!LIFECYCLE_STATES.has(value))
				errors.push(`Invalid lifecycle state ${JSON.stringify(value)} in ${label} record ${index + 1}`);
		}
		if (record.verified === true && !hasVerificationEvidence(record))
			errors.push(`verified=true lacks read/rg/validation evidence in ${label} record ${index + 1}`);
		const highImpactCandidate =
			record.candidate === true &&
			record.verified !== true &&
			(["file", "symbol", "dependency"].includes(String(record.type)) ||
				["depends_on", "imports", "references", "relevant_to"].includes(String(record.type)));
		if (highImpactCandidate) warnings.push(`High-impact candidate-only reference in ${label} record ${index + 1}`);
		const usedForImplementation =
			record.implementation_guidance === true ||
			record.used_as === "implementation_guidance" ||
			(Array.isArray(record.used_as) && record.used_as.includes("implementation_guidance"));
		if (usedForImplementation) {
			const state = field ? String(record[field]) : undefined;
			if (!state || ["draft", "superseded", "stale"].includes(state) || !record.last_verified_at)
				warnings.push(`Implementation guidance uses stale/unverified rationale in ${label} record ${index + 1}`);
		}
	});
}

function validateMissRecords(records: JsonRecord[], label: string, errors: string[]): void {
	records.forEach((record, index) => {
		for (const field of ["id", "created_at", "original_query", "failure_type", "resolution"])
			if (!record[field]) errors.push(`Missing ${field} in ${label} record ${index + 1}`);
		if (record.failure_type && !MISS_FAILURE_TYPES.has(String(record.failure_type)))
			errors.push(`Invalid failure_type ${JSON.stringify(record.failure_type)} in ${label} record ${index + 1}`);
		if (record.resolution && !MISS_RESOLUTIONS.has(String(record.resolution)))
			errors.push(`Invalid resolution ${JSON.stringify(record.resolution)} in ${label} record ${index + 1}`);
		for (const field of Object.keys(record))
			if (RAW_MISS_FIELDS.has(field))
				errors.push(`Raw snippet/content field ${field} is not allowed in ${label} record ${index + 1}`);
	});
}

function collectStrings(value: unknown, output: string[] = []): string[] {
	if (typeof value === "string") output.push(value);
	else if (Array.isArray(value)) for (const item of value) collectStrings(item, output);
	else if (value && typeof value === "object")
		for (const item of Object.values(value as JsonRecord)) collectStrings(item, output);
	return output;
}

function validateNoPrivateArtifactRefs(records: JsonRecord[], label: string, errors: string[]): void {
	const checkedFields = [
		"reference",
		"evidence",
		"url",
		"path",
		"raw_archive_path",
		"source_path",
		"private_path_hint",
	];
	records.forEach((record, index) => {
		for (const field of checkedFields) {
			for (const text of collectStrings(record[field])) {
				for (const match of text.matchAll(ACTUAL_PRIVATE_PATH_RE)) {
					if (String(record.id || "").startsWith("private:")) continue;
					errors.push(
						`Direct private artifact reference ${JSON.stringify(match[0])} in ${label} record ${index + 1} field ${field}`,
					);
				}
			}
		}
	});
}

function validateSecretPatterns(text: string, label: string, errors: string[]): void {
	for (const [name, pattern] of SECRET_PATTERNS)
		if (pattern.test(text)) errors.push(`Potential secret pattern ${name} in ${label}`);
}

function evidenceFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	const files: string[] = [];
	const walk = (current: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && /\.(md|jsonl)$/i.test(entry.name)) files.push(full);
		}
	};
	walk(dir);
	return files.sort();
}

function referencePath(root: string, reference: unknown): string | undefined {
	if (typeof reference !== "string") return undefined;
	const match = reference.match(/([^:]+):(\d+)$/);
	if (!match) return undefined;
	const refPath = match[1];
	if (refPath.startsWith("http://") || refPath.startsWith("https://")) return undefined;
	return path.isAbsolute(refPath) ? refPath : path.join(root, refPath);
}

function validateEvidenceArtifacts(root: string, topic: string, factNodes: JsonRecord[], errors: string[]): number {
	const dir = path.join(root, ".plan", topic, "evidence");
	const files = evidenceFiles(dir);
	for (const file of files) {
		const text = fs.readFileSync(file, "utf8");
		validateSecretPatterns(text, path.relative(root, file), errors);
		if (path.basename(file) !== "manifest.jsonl") {
			for (const match of text.matchAll(ACTUAL_PRIVATE_PATH_RE))
				errors.push(`Direct private artifact reference ${JSON.stringify(match[0])} in ${path.relative(root, file)}`);
		}
	}
	for (const source of factNodes) {
		if (source.type !== "source" || source.source_kind !== "sanitized_evidence") continue;
		const sourcePath = referencePath(root, source.reference);
		if (!sourcePath || !fs.existsSync(sourcePath)) {
			errors.push(`Sanitized evidence source ${String(source.id)} lacks a valid evidence file reference`);
			continue;
		}
		const text = fs.readFileSync(sourcePath, "utf8");
		if (!/Redaction status:/i.test(text))
			errors.push(
				`Sanitized evidence source ${String(source.id)} lacks Redaction status in ${path.relative(root, sourcePath)}`,
			);
	}
	return files.length;
}

function retrievalMissPath(root: string): string {
	return path.join(root, ".plan", "_retrieval", "misses.jsonl");
}

function hasValidationEvidence(record: JsonRecord): boolean {
	const verification = record.verification;
	return (
		Array.isArray(record.commands) ||
		(Array.isArray((verification as JsonRecord | undefined)?.validation) &&
			((verification as JsonRecord).validation as unknown[]).length > 0)
	);
}

function validateReceiptRecords(records: JsonRecord[], label: string, errors: string[]): void {
	for (const [index, record] of records.entries()) {
		for (const field of ["id", "type", "status"]) {
			if (!record[field]) errors.push(`Missing ${field} in ${label} record ${index + 1}`);
		}
		if (record.type === "validation-receipt" && !hasValidationEvidence(record))
			errors.push(`validation-receipt lacks commands or validation evidence in ${label} record ${index + 1}`);
		if (record.truncated === true) {
			if (!record.full_output_path)
				errors.push(`truncated receipt lacks full_output_path in ${label} record ${index + 1}`);
			if (!record.maxOutputChars && !record.max_output_chars)
				errors.push(`truncated receipt lacks maxOutputChars in ${label} record ${index + 1}`);
			if (!record.token_estimate) errors.push(`truncated receipt lacks token_estimate in ${label} record ${index + 1}`);
		}
		const timedOut = record.timedOut === true || record.status === "timed-out" || record.status === "timeout";
		const failed = record.status === "failed" || record.status === "failure";
		if (timedOut && !record.narrowed_retry && !record.serial_fallback && !record.user_escalation && !record.decision)
			errors.push(`timeout receipt lacks fallback decision in ${label} record ${index + 1}`);
		if (failed && !record.narrowed_retry && !record.serial_fallback && !record.user_escalation && !record.decision)
			errors.push(`failure receipt lacks fallback decision in ${label} record ${index + 1}`);
	}
}

function validateContextPackRecords(records: JsonRecord[], label: string, errors: string[]): void {
	for (const [index, record] of records.entries()) {
		for (const field of ["id", "type", "phase_id", "summary"]) {
			if (!record[field]) errors.push(`Missing ${field} in ${label} record ${index + 1}`);
		}
		if (record.type !== "context-pack")
			errors.push(`Context pack record ${index + 1} has type ${JSON.stringify(record.type)}`);
		if (record.budget_tokens !== undefined && typeof record.budget_tokens !== "number")
			errors.push(`context-pack budget_tokens must be numeric in ${label} record ${index + 1}`);
		if (record.references !== undefined && !Array.isArray(record.references))
			errors.push(`context-pack references must be an array in ${label} record ${index + 1}`);
	}
}

const REQUIREMENT_CHANGE_TYPES = new Set(["ADDED", "MODIFIED", "REMOVED", "RENAMED"]);
const REQUIREMENT_PRIORITIES = new Set(["must", "should", "may", "must-not", "should-not"]);
const REQUIREMENT_STATUSES = new Set(["draft", "accepted", "planned", "implemented", "superseded", "removed"]);
const REQUIREMENT_ID_RE = /^REQ-[A-Z0-9][A-Z0-9_.-]*$/;
const SCENARIO_ID_RE = /^SCN-[A-Z0-9][A-Z0-9_.-]*$/;
const ACCEPTANCE_CHECK_ID_RE = /^AC-[A-Z0-9][A-Z0-9_.-]*$/;
const DURABLE_REQUIREMENT_REF_RE = /^docs\/requirements(?:\.md|\/[A-Za-z0-9_.-]+\.md)(?:#[A-Za-z0-9_.-]+)?$/;
const REQUIREMENT_EDGE_TYPES = new Set([
	"satisfies_goal",
	"derived_from",
	"supported_by",
	"constrains",
	"supersedes",
	"modifies",
	"removes",
	"renames",
	"validated_by",
	"folds_into",
	"has_scenario",
	"accepts",
	"related_to",
]);

function validateRequirementRecords(
	records: JsonRecord[],
	label: string,
	factIds: Set<string>,
	sourceIds: Set<string>,
	errors: string[],
): void {
	const byId = new Map(records.filter((record) => record.id).map((record) => [String(record.id), record]));
	for (const [index, record] of records.entries()) {
		const id = String(record.id || "");
		const type = String(record.type || "");
		if (!id) errors.push(`Missing id in ${label} record ${index + 1}`);
		if (type === "requirement" && !REQUIREMENT_ID_RE.test(id))
			errors.push(`Invalid requirement id ${JSON.stringify(id)} in ${label} record ${index + 1}`);
		if (type === "scenario" && !SCENARIO_ID_RE.test(id))
			errors.push(`Invalid scenario id ${JSON.stringify(id)} in ${label} record ${index + 1}`);
		if (type === "acceptance-check" && !ACCEPTANCE_CHECK_ID_RE.test(id))
			errors.push(`Invalid acceptance-check id ${JSON.stringify(id)} in ${label} record ${index + 1}`);
		if (!["requirement", "scenario", "acceptance-check"].includes(type))
			errors.push(`Invalid requirement record type ${JSON.stringify(record.type)} in ${label} record ${index + 1}`);
		if (type === "requirement") {
			for (const field of ["title", "statement", "change_type", "domain", "priority", "status"])
				if (!record[field]) errors.push(`Missing ${field} in ${label} record ${index + 1}`);
			if (record.change_type && !REQUIREMENT_CHANGE_TYPES.has(String(record.change_type)))
				errors.push(`Invalid change_type ${JSON.stringify(record.change_type)} in ${label} record ${index + 1}`);
			if (record.priority && !REQUIREMENT_PRIORITIES.has(String(record.priority)))
				errors.push(`Invalid priority ${JSON.stringify(record.priority)} in ${label} record ${index + 1}`);
		}
		if (type === "scenario") {
			for (const field of ["title", "requirement_id"])
				if (!record[field]) errors.push(`Missing ${field} in ${label} record ${index + 1}`);
			if (record.requirement_id && String(byId.get(String(record.requirement_id))?.type) !== "requirement")
				errors.push(`Scenario ${id} references missing requirement_id ${JSON.stringify(record.requirement_id)}`);
		}
		if (record.status && !REQUIREMENT_STATUSES.has(String(record.status)))
			errors.push(`Invalid requirement status ${JSON.stringify(record.status)} in ${label} record ${index + 1}`);
		for (const field of ["scenario_refs", "fact_refs", "source_refs", "durable_refs"]) {
			if (record[field] !== undefined && !Array.isArray(record[field]))
				errors.push(`${field} must be an array in ${label} record ${index + 1}`);
		}
		for (const ref of Array.isArray(record.scenario_refs) ? record.scenario_refs : [])
			if (String(byId.get(String(ref))?.type) !== "scenario") errors.push(`Requirement ${id} references missing scenario ${JSON.stringify(ref)}`);
		for (const ref of Array.isArray(record.fact_refs) ? record.fact_refs : [])
			if (!factIds.has(String(ref))) errors.push(`Requirement ${id} references missing fact ${JSON.stringify(ref)}`);
		for (const ref of Array.isArray(record.source_refs) ? record.source_refs : [])
			if (!sourceIds.has(String(ref))) errors.push(`Requirement ${id} references missing source ${JSON.stringify(ref)}`);
		for (const ref of Array.isArray(record.durable_refs) ? record.durable_refs : [])
			if (!DURABLE_REQUIREMENT_REF_RE.test(String(ref))) errors.push(`Requirement ${id} has invalid durable ref ${JSON.stringify(ref)}`);
	}
}

function validateRequirementEdges(records: JsonRecord[], label: string, allowed: Set<string>, errors: string[]): void {
	for (const [index, record] of records.entries()) {
		if (!record.from || !record.to || !record.type) {
			errors.push(`Requirement edge in ${label} record ${index + 1} must include from, to, and type`);
			continue;
		}
		if (!REQUIREMENT_EDGE_TYPES.has(String(record.type)))
			errors.push(`Invalid requirement edge type ${JSON.stringify(record.type)} in ${label} record ${index + 1}`);
		for (const [endpointName, endpoint] of [["from", record.from], ["to", record.to]] as const) {
			const value = String(endpoint);
			if (allowed.has(value)) continue;
			if (DURABLE_REQUIREMENT_REF_RE.test(value)) continue;
			errors.push(`Unresolved ${endpointName} endpoint ${JSON.stringify(value)} in ${label} record ${index + 1}`);
		}
	}
}

const DESIGN_NODE_TYPES = new Set(["design-decision", "design-alternative", "design-component", "design-risk"]);
const DESIGN_STATUSES = new Set(["proposed", "accepted", "rejected", "superseded", "implemented"]);
const DESIGN_EDGE_TYPES = new Set([
	"satisfies",
	"supported_by",
	"constrained_by",
	"alternative_to",
	"mitigates",
	"risk_of",
	"related_to",
]);

function markdownAnchors(text: string): Set<string> {
	const anchors = new Set<string>();
	for (const line of text.split(/\r?\n/)) {
		const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
		if (!match) continue;
		const slug = match[2]
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.replace(/\s+/g, "-");
		anchors.add(slug);
	}
	return anchors;
}

function validateDesignSource(dir: string, source: unknown, label: string, index: number, errors: string[]): void {
	if (typeof source !== "string" || !source.trim()) {
		errors.push(`Design source in ${label} record ${index} must be a non-empty string using design.md#heading`);
		return;
	}
	const match = /^design\.md#([A-Za-z0-9_.-]+)$/.exec(source);
	if (!match) {
		errors.push(`Design source ${JSON.stringify(source)} in ${label} record ${index} must use design.md#heading`);
		return;
	}
	const designPath = path.join(dir, "design.md");
	if (!fs.existsSync(designPath)) {
		errors.push(`Design source ${JSON.stringify(source)} in ${label} record ${index} references missing design.md`);
		return;
	}
	if (!markdownAnchors(fs.readFileSync(designPath, "utf8")).has(match[1].toLowerCase()))
		errors.push(`Design source ${JSON.stringify(source)} in ${label} record ${index} references missing heading`);
}

function validateDesignRecords(
	dir: string,
	records: JsonRecord[],
	edges: JsonRecord[],
	label: string,
	requirementIds: Set<string>,
	factIds: Set<string>,
	errors: string[],
): void {
	const satisfyingEdges = new Set(
		edges
			.filter((edge) => edge.type === "satisfies" && requirementIds.has(String(edge.to)))
			.map((edge) => String(edge.from)),
	);
	for (const [index, record] of records.entries()) {
		const row = index + 1;
		const id = String(record.id || "");
		const type = String(record.type || "");
		if (!id) errors.push(`Missing id in ${label} record ${row}`);
		if (!DESIGN_NODE_TYPES.has(type)) errors.push(`Invalid design node type ${JSON.stringify(record.type)} in ${label} record ${row}`);
		for (const field of ["status", "title", "summary", "source"])
			if (!record[field]) errors.push(`Missing ${field} in ${label} record ${row}`);
		if (record.status && !DESIGN_STATUSES.has(String(record.status)))
			errors.push(`Invalid design status ${JSON.stringify(record.status)} in ${label} record ${row}`);
		for (const field of ["requirement_refs", "fact_refs", "alternatives", "fast_follow_refs"])
			if (record[field] !== undefined && !Array.isArray(record[field])) errors.push(`${field} must be an array in ${label} record ${row}`);
		for (const ref of Array.isArray(record.requirement_refs) ? record.requirement_refs : [])
			if (!requirementIds.has(String(ref))) errors.push(`Design node ${id} references missing requirement ${JSON.stringify(ref)}`);
		for (const ref of Array.isArray(record.fact_refs) ? record.fact_refs : [])
			if (!factIds.has(String(ref))) errors.push(`Design node ${id} references missing fact ${JSON.stringify(ref)}`);
		const infrastructureRationale = typeof record.infrastructure_only_rationale === "string" ? record.infrastructure_only_rationale.trim() : "";
		if (type === "design-decision" && record.status === "accepted" && !satisfyingEdges.has(id) && !infrastructureRationale)
			errors.push(`Accepted design decision ${id} must satisfy a requirement/scenario or include non-empty infrastructure_only_rationale`);
		validateDesignSource(dir, record.source, label, row, errors);
	}
}

function validateDesignEdges(records: JsonRecord[], label: string, allowed: Set<string>, errors: string[]): void {
	for (const [index, record] of records.entries()) {
		if (!record.from || !record.to || !record.type) {
			errors.push(`Design edge in ${label} record ${index + 1} must include from, to, and type`);
			continue;
		}
		if (!DESIGN_EDGE_TYPES.has(String(record.type)))
			errors.push(`Invalid design edge type ${JSON.stringify(record.type)} in ${label} record ${index + 1}`);
		for (const [endpointName, endpoint] of [["from", record.from], ["to", record.to]] as const) {
			const value = String(endpoint);
			if (allowed.has(value)) continue;
			if (/^(file|doc|symbol|dependency):/.test(value)) continue;
			errors.push(`Unresolved ${endpointName} endpoint ${JSON.stringify(value)} in ${label} record ${index + 1}`);
		}
	}
}

function validateRequirementCitations(dir: string, requirementIds: Set<string>, errors: string[]): void {
	for (const name of ["requirements.md", "design.md", "plan.md"]) {
		const filePath = path.join(dir, name);
		if (!fs.existsSync(filePath)) continue;
		const text = fs.readFileSync(filePath, "utf8");
		for (const match of text.matchAll(REQUIREMENT_CITATION_RE))
			if (!requirementIds.has(match[1])) errors.push(`${name} cites missing requirement/scenario [${match[1]}]`);
	}
}

function warnMissingWorkflowState(
	planNodes: JsonRecord[],
	receipts: JsonRecord[],
	contextPacks: JsonRecord[],
	warnings: string[],
): void {
	const receiptPhases = new Set(receipts.map((record) => String(record.phase_id || "")).filter(Boolean));
	const contextPhases = new Set(contextPacks.map((record) => String(record.phase_id || "")).filter(Boolean));
	for (const phase of planNodes.filter((record) => record.type === "phase")) {
		const phaseId = String(phase.phase_id || "");
		if (!phaseId || !["complete", "implemented"].includes(String(phase.status))) continue;
		if (!contextPhases.has(phaseId)) warnings.push(`Completed phase ${phaseId} lacks a context-pack record`);
		if (!receiptPhases.has(phaseId)) warnings.push(`Completed phase ${phaseId} lacks a receipt record`);
	}
}

function validateTopic(options: Record<string, string | boolean | string[]>): ValidateReport {
	const root = path.resolve(optString(options, "root", process.cwd()));
	const topic = optString(options, "topic");
	const dir = path.join(root, ".plan", topic);
	const errors: string[] = [];
	const warnings: string[] = [];
	const read = (name: string) => {
		const result = readJsonl(path.join(dir, name));
		errors.push(...result.errors);
		return result.records;
	};
	const mapNodes = read("map.nodes.jsonl");
	const mapEdges = read("map.edges.jsonl");
	const factNodes = read("facts.nodes.jsonl");
	const factEdges = read("facts.edges.jsonl");
	const planNodes = read("plan.nodes.jsonl");
	const planEdges = read("plan.edges.jsonl");
	const requirementNodes = read("requirements.nodes.jsonl");
	const requirementEdges = read("requirements.edges.jsonl");
	const designNodes = read("design.nodes.jsonl");
	const designEdges = read("design.edges.jsonl");
	const receiptResult = readJsonl(path.join(dir, "receipts.jsonl"));
	errors.push(...receiptResult.errors);
	const contextPackResult = readJsonl(path.join(dir, "context-packs.jsonl"));
	errors.push(...contextPackResult.errors);
	const missResult = readJsonl(retrievalMissPath(root));
	errors.push(...missResult.errors);

	const mapIds = validateUnique(mapNodes, "map.nodes.jsonl", errors);
	const factIdsAll = validateUnique(factNodes, "facts.nodes.jsonl", errors);
	const sourceIdsForRequirements = new Set(factNodes.filter((item) => item.type === "source" && item.id).map((item) => String(item.id)));
	const factIdsForRequirements = new Set(factNodes.filter((item) => item.type === "fact" && item.id).map((item) => String(item.id)));
	const planIds = validateUnique(planNodes, "plan.nodes.jsonl", errors);
	const requirementIds = validateUnique(requirementNodes, "requirements.nodes.jsonl", errors);
	const designIds = validateUnique(designNodes, "design.nodes.jsonl", errors);
	const allowed = new Set([...mapIds, ...factIdsAll, ...planIds, ...requirementIds, ...designIds]);
	validateEdges(mapEdges, "map.edges.jsonl", allowed, errors);
	validateEdges(factEdges, "facts.edges.jsonl", allowed, errors);
	validateEdges(planEdges, "plan.edges.jsonl", allowed, errors);
	validateRequirementRecords(requirementNodes, "requirements.nodes.jsonl", factIdsForRequirements, sourceIdsForRequirements, errors);
	validateRequirementEdges(requirementEdges, "requirements.edges.jsonl", allowed, errors);
	validateDesignRecords(dir, designNodes, designEdges, "design.nodes.jsonl", requirementIds, factIdsForRequirements, errors);
	validateDesignEdges(designEdges, "design.edges.jsonl", allowed, errors);
	validateFileRefs(root, [...mapNodes, ...mapEdges, ...factNodes, ...factEdges, ...planNodes, ...planEdges, ...requirementNodes, ...requirementEdges, ...designNodes, ...designEdges], errors);
	validateLifecycleAndRetrievalMetadata(mapNodes, "map.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(mapEdges, "map.edges.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(factNodes, "facts.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(factEdges, "facts.edges.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(planNodes, "plan.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(planEdges, "plan.edges.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(requirementNodes, "requirements.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(requirementEdges, "requirements.edges.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(designNodes, "design.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(designEdges, "design.edges.jsonl", errors, warnings);
	validateNoPrivateArtifactRefs(mapNodes, "map.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(mapEdges, "map.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(factNodes, "facts.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(factEdges, "facts.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(planNodes, "plan.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(planEdges, "plan.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(requirementNodes, "requirements.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(requirementEdges, "requirements.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(designNodes, "design.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(designEdges, "design.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(receiptResult.records, "receipts.jsonl", errors);
	validateNoPrivateArtifactRefs(contextPackResult.records, "context-packs.jsonl", errors);
	validateReceiptRecords(receiptResult.records, "receipts.jsonl", errors);
	validateContextPackRecords(contextPackResult.records, "context-packs.jsonl", errors);
	warnMissingWorkflowState(planNodes, receiptResult.records, contextPackResult.records, warnings);
	validateMissRecords(missResult.records, "misses.jsonl", errors);
	const evidenceFileCount = validateEvidenceArtifacts(root, topic, factNodes, errors);

	const factById = new Map(factNodes.filter((item) => item.id).map((item) => [String(item.id), item]));
	const sourceIds = new Set([...factById].filter(([, item]) => item.type === "source").map(([id]) => id));
	const factIds = new Set([...factById].filter(([, item]) => item.type === "fact").map(([id]) => id));
	const supported = new Set(
		factEdges
			.filter((edge) => edge.type === "supported_by" && sourceIds.has(String(edge.to)))
			.map((edge) => String(edge.from)),
	);
	for (const id of factIds)
		if (id.startsWith("F") && !supported.has(id)) errors.push(`Fact ${id} has no supported_by edge to a source node`);
	const proposalPath = path.join(dir, "proposal.md");
	if (fs.existsSync(proposalPath)) {
		const text = fs.readFileSync(proposalPath, "utf8");
		for (const match of text.matchAll(FACT_CITATION_RE))
			if (!factIds.has(match[1])) errors.push(`Proposal cites missing fact [${match[1]}]`);
	}
	validateRequirementCitations(dir, requirementIds, errors);
	return {
		ok: errors.length === 0,
		topic,
		errors,
		warnings,
		counts: {
			map_nodes: mapNodes.length,
			map_edges: mapEdges.length,
			fact_nodes: factNodes.length,
			fact_edges: factEdges.length,
			plan_nodes: planNodes.length,
			plan_edges: planEdges.length,
			requirement_nodes: requirementNodes.length,
			requirement_edges: requirementEdges.length,
			design_nodes: designNodes.length,
			design_edges: designEdges.length,
			receipts: receiptResult.records.length,
			context_packs: contextPackResult.records.length,
			evidence_files: evidenceFileCount,
			retrieval_misses: missResult.records.length,
		},
	};
}

function validateFile(options: Record<string, string | boolean | string[]>): ValidateReport {
	const filePath = path.resolve(optString(options, "file"));
	const result = readJsonl(filePath, true);
	const warnings: string[] = [];
	const label = path.basename(filePath);
	if (options["require-id"]) validateUnique(result.records, label, result.errors);
	validateLifecycleAndRetrievalMetadata(result.records, label, result.errors, warnings);
	if (filePath.endsWith(path.join("_retrieval", "misses.jsonl")) || label === "misses.jsonl")
		validateMissRecords(result.records, label, result.errors);
	if (label === "receipts.jsonl") validateReceiptRecords(result.records, label, result.errors);
	if (label === "context-packs.jsonl") validateContextPackRecords(result.records, label, result.errors);
	return {
		ok: result.errors.length === 0,
		file: filePath,
		errors: result.errors,
		warnings,
		count: result.records.length,
	};
}

function validateMisses(options: Record<string, string | boolean | string[]>): ValidateReport {
	const root = path.resolve(optString(options, "root", process.cwd()));
	const filePath = retrievalMissPath(root);
	return validateFile({ file: filePath, "require-id": true });
}

function listMisses(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const root = path.resolve(optString(options, "root", process.cwd()));
	return listRecords({ file: retrievalMissPath(root), limit: options.limit ?? "20" });
}

function listRecords(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const filePath = path.resolve(optString(options, "file"));
	const result = readJsonl(filePath, true);
	if (result.errors.length) return { ok: false, file: filePath, errors: result.errors, records: [] };
	const limit = Math.max(0, optNumber(options, "limit", 20));
	return {
		ok: true,
		file: filePath,
		count: result.records.length,
		records: limit ? result.records.slice(0, limit) : result.records,
	};
}

const READ_ONLY_ARTIFACT_FILES: Record<string, string> = {
	"map.nodes": "map.nodes.jsonl",
	"map.edges": "map.edges.jsonl",
	"facts.nodes": "facts.nodes.jsonl",
	"facts.edges": "facts.edges.jsonl",
	"plan.nodes": "plan.nodes.jsonl",
	"plan.edges": "plan.edges.jsonl",
	"requirements.nodes": "requirements.nodes.jsonl",
	"requirements.edges": "requirements.edges.jsonl",
	"design.nodes": "design.nodes.jsonl",
	"design.edges": "design.edges.jsonl",
	receipts: "receipts.jsonl",
	"context-packs": "context-packs.jsonl",
	"evidence-manifest": path.join("evidence", "manifest.jsonl"),
};
const PRIVATE_FIELD_NAMES = new Set(["raw_archive_path", "source_path", "private_path_hint", "raw_content", "content"]);

function topicDir(root: string, topic: string): string {
	return path.join(root, ".plan", topic);
}

function artifactFilePath(root: string, topic: string, artifact: string): string {
	const relative = READ_ONLY_ARTIFACT_FILES[artifact];
	if (!relative) throw new Error(`Unsupported read-only artifact ${JSON.stringify(artifact)}`);
	return path.join(topicDir(root, topic), relative);
}

function sanitizeText(text: string): string {
	return text.replace(ACTUAL_PRIVATE_PATH_RE, ".plan/_private/<redacted>");
}

function sanitizeForReadOnly(value: unknown): unknown {
	if (typeof value === "string") return sanitizeText(value);
	if (Array.isArray(value)) return value.map(sanitizeForReadOnly);
	if (!value || typeof value !== "object") return value;
	const output: JsonRecord = {};
	for (const [key, item] of Object.entries(value as JsonRecord)) {
		if (PRIVATE_FIELD_NAMES.has(key)) {
			output[key] = "<redacted-private-reference>";
			continue;
		}
		output[key] = sanitizeForReadOnly(item);
	}
	return output;
}

function compactRecord(record: JsonRecord): JsonRecord {
	const fields = [
		"id",
		"type",
		"status",
		"phase_id",
		"title",
		"summary",
		"claim",
		"from",
		"to",
		"budget_tokens",
		"references",
		"verified_files",
		"commands",
	];
	const output: JsonRecord = {};
	for (const field of fields) if (record[field] !== undefined) output[field] = record[field];
	return sanitizeForReadOnly(output) as JsonRecord;
}

function readOnlyTopicOptions(options: Record<string, string | boolean | string[]>): { root: string; topic: string } {
	return {
		root: path.resolve(optString(options, "root", process.cwd())),
		topic: optString(options, "topic"),
	};
}

function readOnlyListRecords(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const artifact = optString(options, "artifact");
	const filePath = artifactFilePath(root, topic, artifact);
	const result = readJsonl(filePath, true);
	const limit = Math.max(0, optNumber(options, "limit", 20));
	return {
		ok: result.errors.length === 0,
		topic,
		artifact,
		file: path.relative(root, filePath),
		count: result.records.length,
		errors: result.errors,
		records: result.records.slice(0, limit || result.records.length).map(compactRecord),
		truncated: limit > 0 && result.records.length > limit,
	};
}

function readOnlyShowRecord(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const artifact = optString(options, "artifact");
	const id = optString(options, "id");
	const filePath = artifactFilePath(root, topic, artifact);
	const result = readJsonl(filePath, true);
	const record = result.records.find((item) => String(item.id || item.from || "") === id);
	return {
		ok: result.errors.length === 0 && Boolean(record),
		topic,
		artifact,
		file: path.relative(root, filePath),
		id,
		errors: result.errors,
		record: record ? compactRecord(record) : undefined,
	};
}

function validateTopicSummary(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const report = validateTopic(options);
	return {
		ok: report.ok,
		topic: report.topic,
		counts: report.counts,
		error_count: report.errors.length,
		warning_count: (report.warnings || []).length,
		errors: report.errors.slice(0, 20).map(sanitizeText),
		warnings: (report.warnings || []).slice(0, 20).map(sanitizeText),
		truncated: report.errors.length > 20 || (report.warnings || []).length > 20,
	};
}

function markdownCitations(filePath: string): string[] {
	if (!fs.existsSync(filePath)) return [];
	return [...fs.readFileSync(filePath, "utf8").matchAll(FACT_CITATION_RE)].map((match) => match[1]);
}

function factCitationSummary(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const dir = topicDir(root, topic);
	const factNodes = readJsonl(path.join(dir, "facts.nodes.jsonl"), true);
	const factEdges = readJsonl(path.join(dir, "facts.edges.jsonl"), true);
	const errors = [...factNodes.errors, ...factEdges.errors];
	const factIds = new Set(
		factNodes.records.filter((record) => record.type === "fact").map((record) => String(record.id)),
	);
	const sourceIds = new Set(
		factNodes.records.filter((record) => record.type === "source").map((record) => String(record.id)),
	);
	const supportedFacts = new Set(
		factEdges.records
			.filter((edge) => edge.type === "supported_by" && sourceIds.has(String(edge.to)))
			.map((edge) => String(edge.from)),
	);
	const proposal = markdownCitations(path.join(dir, "proposal.md"));
	const plan = markdownCitations(path.join(dir, "plan.md"));
	const cited = [...new Set([...proposal, ...plan])].sort();
	const missing = cited.filter((id) => !factIds.has(id));
	const unsupported = cited.filter((id) => factIds.has(id) && !supportedFacts.has(id));
	return {
		ok: errors.length === 0 && missing.length === 0 && unsupported.length === 0,
		topic,
		counts: {
			facts: factIds.size,
			sources: sourceIds.size,
			supported_facts: supportedFacts.size,
			proposal_citations: proposal.length,
			plan_citations: plan.length,
			unique_citations: cited.length,
		},
		citations: { proposal: [...new Set(proposal)].sort(), plan: [...new Set(plan)].sort() },
		missing,
		unsupported,
		errors: errors.map(sanitizeText),
	};
}

function countBy(records: JsonRecord[], field: string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const record of records) {
		const key = String(record[field] || "unknown");
		counts[key] = (counts[key] || 0) + 1;
	}
	return counts;
}

function receiptSummary(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const result = readJsonl(path.join(topicDir(root, topic), "receipts.jsonl"));
	const limit = Math.max(0, optNumber(options, "limit", 20));
	return {
		ok: result.errors.length === 0,
		topic,
		count: result.records.length,
		counts: {
			by_status: countBy(result.records, "status"),
			by_type: countBy(result.records, "type"),
			by_phase: countBy(result.records, "phase_id"),
		},
		receipts: result.records.slice(0, limit || result.records.length).map(compactRecord),
		errors: result.errors.map(sanitizeText),
		truncated: limit > 0 && result.records.length > limit,
	};
}

function contextPackSummary(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const result = readJsonl(path.join(topicDir(root, topic), "context-packs.jsonl"));
	const limit = Math.max(0, optNumber(options, "limit", 20));
	return {
		ok: result.errors.length === 0,
		topic,
		count: result.records.length,
		counts: { by_phase: countBy(result.records, "phase_id") },
		context_packs: result.records.slice(0, limit || result.records.length).map(compactRecord),
		errors: result.errors.map(sanitizeText),
		truncated: limit > 0 && result.records.length > limit,
	};
}

function evidenceManifestSummary(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const evidenceDir = path.join(topicDir(root, topic), "evidence");
	const manifest = readJsonl(path.join(evidenceDir, "manifest.jsonl"));
	const files = evidenceFiles(evidenceDir)
		.map((file) => path.relative(root, file))
		.filter((file) => !file.includes(".plan/_private/"));
	const limit = Math.max(0, optNumber(options, "limit", 20));
	return {
		ok: manifest.errors.length === 0,
		topic,
		counts: { manifest_records: manifest.records.length, evidence_files: files.length },
		manifest_records: manifest.records.slice(0, limit || manifest.records.length).map(compactRecord),
		evidence_files: files.slice(0, limit || files.length).map(sanitizeText),
		errors: manifest.errors.map(sanitizeText),
		truncated: limit > 0 && (manifest.records.length > limit || files.length > limit),
	};
}

function normalizePhaseStatus(value: unknown): string {
	return String(value || "pending").toLowerCase();
}

function phaseComplete(status: unknown): boolean {
	return ["complete", "completed", "implemented", "done"].includes(normalizePhaseStatus(status));
}

function phaseBlocked(status: unknown): boolean {
	return ["blocked", "deferred", "superseded", "stale"].includes(normalizePhaseStatus(status));
}

function planMarkdownSection(text: string, phaseId: string): string {
	const pattern = new RegExp(`^###\\s+Phase\\s+${phaseId}\\b[^\\n]*\\n`, "m");
	const match = text.match(pattern);
	if (!match || match.index === undefined) return "";
	const start = match.index;
	const next = text.slice(start + match[0].length).search(/^###\s+Phase\s+\w+\b/m);
	return next >= 0 ? text.slice(start, start + match[0].length + next) : text.slice(start);
}

function markdownListAfterHeading(section: string, heading: string): string[] {
	const pattern = new RegExp(`^####\\s+${heading}\\s*$`, "mi");
	const match = section.match(pattern);
	if (!match || match.index === undefined) return [];
	const rest = section.slice(match.index + match[0].length);
	const end = rest.search(/^####\s+/m);
	const body = end >= 0 ? rest.slice(0, end) : rest;
	return body
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) =>
			line
				.replace(/^- \[[ xX]\]\s+/, "")
				.replace(/^-\s+/, "")
				.trim(),
		);
}

function firstParagraphAfterHeading(section: string, heading: string): string | undefined {
	const pattern = new RegExp(`^####\\s+${heading}\\s*$`, "mi");
	const match = section.match(pattern);
	if (!match || match.index === undefined) return undefined;
	const rest = section.slice(match.index + match[0].length);
	const end = rest.search(/^####\s+/m);
	const body = (end >= 0 ? rest.slice(0, end) : rest).trim();
	return (
		body
			.split(/\n\s*\n/)[0]
			?.replace(/\s+/g, " ")
			.trim() || undefined
	);
}

function fieldStrings(record: JsonRecord, field: string): string[] {
	const value = record[field];
	if (Array.isArray(value)) return value.map(String).filter(Boolean);
	return value === undefined || value === null || value === "" ? [] : [String(value)];
}

function phaseSummary(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const { root, topic } = readOnlyTopicOptions(options);
	const dir = topicDir(root, topic);
	const nodesResult = readJsonl(path.join(dir, "plan.nodes.jsonl"), true);
	const edgesResult = readJsonl(path.join(dir, "plan.edges.jsonl"), true);
	const errors = [...nodesResult.errors, ...edgesResult.errors];
	const phases = nodesResult.records.filter((record) => record.type === "phase" && record.phase_id);
	const byId = new Map(phases.map((phase) => [String(phase.phase_id), phase]));
	const order = new Map(phases.map((phase, index) => [String(phase.phase_id), index]));
	const depsFor = (phase: JsonRecord) => {
		const phaseId = String(phase.phase_id);
		return [
			...fieldStrings(phase, "depends_on"),
			...edgesResult.records
				.filter((edge) => edge.type === "depends_on" && edge.from === `phase:${phaseId}`)
				.map((edge) => String(edge.to).replace(/^phase:/, "")),
		].filter((value, index, array) => value && array.indexOf(value) === index);
	};
	const blockersFor = (phase: JsonRecord) => depsFor(phase).filter((dep) => !phaseComplete(byId.get(dep)?.status));
	const requested = typeof options["phase-id"] === "string" ? String(options["phase-id"]) : undefined;
	const candidates = requested ? phases.filter((phase) => phase.phase_id === requested) : phases;
	const selected =
		candidates.find(
			(phase) => !phaseComplete(phase.status) && !phaseBlocked(phase.status) && blockersFor(phase).length === 0,
		) ||
		candidates.find((phase) => !phaseComplete(phase.status) && !phaseBlocked(phase.status)) ||
		candidates[0];
	if (!selected) return { ok: false, topic, errors: [...errors, "No phase records found in plan.nodes.jsonl"] };
	const phaseId = String(selected.phase_id);
	const tasks = nodesResult.records
		.filter((record) => record.type === "task" && record.phase_id === phaseId)
		.sort((a, b) => String(a.task_id || a.id).localeCompare(String(b.task_id || b.id)))
		.map((record) => ({
			id: record.task_id || record.id,
			title: record.title,
			status: record.status || selected.status,
		}));
	const validations = nodesResult.records
		.filter((record) => record.type === "validation" && record.phase_id === phaseId)
		.sort((a, b) => String(a.validation_id || a.id).localeCompare(String(b.validation_id || b.id)))
		.map((record) => ({
			id: record.validation_id || record.id,
			title: record.title,
			command: record.command,
			status: record.status || selected.status,
		}));
	const planPath = path.join(dir, "plan.md");
	const planText = fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8") : "";
	const section = planText ? planMarkdownSection(planText, phaseId) : "";
	const checklistText = markdownListAfterHeading(section, "Checklist");
	const validationText = markdownListAfterHeading(section, "Validation");
	const blockedBy = blockersFor(selected);
	const references = [
		...fieldStrings(selected, "references"),
		...edgesResult.records
			.filter((edge) => edge.type === "references" && edge.from === `phase:${phaseId}`)
			.map((edge) => String(edge.to)),
	]
		.filter((value, index, array) => value && array.indexOf(value) === index)
		.map(sanitizeText);
	const verifyCommands = validations
		.map((validation) => validation.command)
		.filter((command): command is string => typeof command === "string" && command.length > 0);
	const suggestedAcceptanceCriteria = tasks.map((task) => ({
		id: String(task.id),
		criterion: `${String(task.id)} complete: ${task.title || "phase task is implemented"}`,
	}));
	return {
		ok: errors.length === 0,
		topic,
		phase: {
			id: phaseId,
			title: selected.title,
			status: selected.status,
			executable: !phaseComplete(selected.status) && !phaseBlocked(selected.status) && blockedBy.length === 0,
			blocked_by: blockedBy,
			depends_on: depsFor(selected),
			unlocks: fieldStrings(selected, "unlocks"),
			order: order.get(phaseId),
		},
		next_executable_phase_id:
			!phaseComplete(selected.status) && !phaseBlocked(selected.status) && blockedBy.length === 0 ? phaseId : undefined,
		objective: firstParagraphAfterHeading(section, "Objective"),
		scope: firstParagraphAfterHeading(section, "Scope"),
		references,
		checklist: tasks,
		checklist_text: checklistText,
		validations,
		validation_text: validationText,
		suggested_subagent_contract: {
			acceptance_criteria: suggestedAcceptanceCriteria,
			evidence: ["changed-files", "commands-run", "validation-output", "residual-risks", "diff-summary"],
			verify_commands: verifyCommands,
			stop_rules: [
				"Stop for product/scope/dependency decisions or changes outside the assigned phase.",
				"Do not mutate .plan/_private/** or .plan/_index/**.",
				"Keep canonical validation evidence parent-owned; workers may report non-canonical receipts only when explicitly assigned.",
			],
			structured_report_fields: [
				"criteriaSatisfied",
				"changedFiles",
				"commandsRun",
				"validationOutput",
				"residualRisks",
				"noStagedFiles",
				"diffSummary",
			],
		},
		errors: errors.map(sanitizeText),
	};
}

function upsertRecords(
	filePath: string,
	recordsToUpsert: JsonRecord[],
	keys: string[],
): { inserted: number; updated: number; count: number } {
	const parsed = readJsonl(filePath);
	if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
	const records = parsed.records;
	let inserted = 0;
	let updated = 0;
	for (const record of recordsToUpsert) {
		const target = recordKey(record, keys);
		const existingIndex = records.findIndex((item) => recordKey(item, keys) === target);
		if (existingIndex >= 0) {
			records[existingIndex] = { ...records[existingIndex], ...record };
			updated += 1;
		} else {
			records.push(record);
			inserted += 1;
		}
	}
	writeJsonlAtomic(filePath, records);
	return { inserted, updated, count: records.length };
}

function docSource(id: string, title: string, filePath: string, description: string): JsonRecord {
	return {
		id,
		type: "source",
		title,
		description,
		url: `file://${filePath}`,
		reference: `${filePath}:1`,
		source: "local_pi_docs_seed",
		confidence: "high",
	};
}

function fact(id: string, title: string, claim: string, sourceId: string, relevance: string): JsonRecord {
	return {
		id,
		type: "fact",
		title,
		claim,
		relevance,
		source: "local_pi_docs_seed",
		confidence: "high",
		supported_by: sourceId,
	};
}

function supportEdge(from: string, to: string, evidence: string): JsonRecord {
	return {
		from,
		to,
		type: "supported_by",
		evidence,
		source: "local_pi_docs_seed",
	};
}

function seedPiFacts(options: Record<string, string | boolean | string[]>): Record<string, unknown> {
	const root = path.resolve(optString(options, "root", process.cwd()));
	const topic = optString(options, "topic");
	const dir = path.join(root, ".plan", topic);
	const piDocs = "/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs";
	const subagentsSkill = "/home/falco/.pi/agent/npm/node_modules/pi-subagents/skills/pi-subagents/SKILL.md";
	const nodesPath = path.join(dir, "facts.nodes.jsonl");
	const edgesPath = path.join(dir, "facts.edges.jsonl");
	const nodes = [
		docSource(
			"S900",
			"Pi packages documentation",
			path.join(piDocs, "packages.md"),
			"Official Pi package manifest and gallery metadata documentation.",
		),
		docSource(
			"S901",
			"Pi skills documentation",
			path.join(piDocs, "skills.md"),
			"Official Pi skill structure, frontmatter, and validation documentation.",
		),
		docSource(
			"S902",
			"Pi extensions documentation",
			path.join(piDocs, "extensions.md"),
			"Official Pi extension and custom tool documentation.",
		),
		docSource(
			"S903",
			"Pi prompt templates documentation",
			path.join(piDocs, "prompt-templates.md"),
			"Official Pi prompt template packaging documentation.",
		),
		docSource("S904", "pi-subagents skill", subagentsSkill, "Official local pi-subagents orchestration guidance."),
		fact(
			"F900",
			"Pi packages bundle resources",
			"A Pi package can declare skills, extensions, prompts, and themes under the package.json pi manifest.",
			"S900",
			"Guides package layout and manifest design.",
		),
		fact(
			"F901",
			"Pi package gallery image",
			"Pi package gallery metadata supports an image field in the pi manifest for a static preview.",
			"S900",
			"Supports package presentation metadata.",
		),
		fact(
			"F902",
			"Skills are Markdown capability packages",
			"Pi skills are self-contained Markdown capability packages with frontmatter and optional helper scripts.",
			"S901",
			"Constrains skill entrypoint and helper layout.",
		),
		fact(
			"F903",
			"Extensions register custom tools",
			"Pi extensions can register custom tools with pi.registerTool and are distributed through package extension entries.",
			"S902",
			"Supports adding deterministic tool wrappers.",
		),
		fact(
			"F904",
			"Prompt templates are package resources",
			"Prompt templates can be included in package prompt directories or pi.prompts entries.",
			"S903",
			"Supports reusable prompt shortcuts when needed.",
		),
		fact(
			"F905",
			"Subagents should receive concrete role tasks",
			"pi-subagents guidance says parent orchestration should pass concrete role-specific tasks and keep orchestration authority in the parent session.",
			"S904",
			"Constrains agent workflow design and avoids child orchestration drift.",
		),
	];
	const edges = [
		supportEdge("F900", "S900", "packages.md describes package.json pi manifest resources."),
		supportEdge("F901", "S900", "packages.md documents gallery image metadata."),
		supportEdge("F902", "S901", "skills.md describes skill structure and frontmatter."),
		supportEdge("F903", "S902", "extensions.md documents pi.registerTool."),
		supportEdge("F904", "S903", "prompt-templates.md documents packaged prompt templates."),
		supportEdge(
			"F905",
			"S904",
			"pi-subagents guidance emphasizes concrete role-specific child tasks and parent orchestration.",
		),
	];
	const nodeResult = upsertRecords(nodesPath, nodes, ["id"]);
	const edgeResult = upsertRecords(edgesPath, edges, ["from", "to", "type"]);
	return { ok: true, topic, nodes: nodeResult, edges: edgeResult };
}

function printPayload(payload: Record<string, unknown>, asJson: boolean): void {
	if (asJson) console.log(JSON.stringify(payload, null, 2));
	else if (payload.ok) console.log(`OK ${JSON.stringify(payload)}`);
	else console.log(`FAILED ${JSON.stringify(payload)}`);
}

function main(): number {
	const { command, options } = parseArgs(process.argv.slice(2));
	let payload: Record<string, unknown>;
	if (command === "validate-topic") payload = validateTopic(options);
	else if (command === "validate-file") payload = validateFile(options);
	else if (command === "validate-misses") payload = validateMisses(options);
	else if (command === "list-misses") payload = listMisses(options);
	else if (command === "upsert") payload = upsert(options);
	else if (command === "list") payload = listRecords(options);
	else if (command === "list-records") payload = readOnlyListRecords(options);
	else if (command === "show-record") payload = readOnlyShowRecord(options);
	else if (command === "validate-topic-summary") payload = validateTopicSummary(options);
	else if (command === "fact-citation-summary") payload = factCitationSummary(options);
	else if (command === "receipt-summary") payload = receiptSummary(options);
	else if (command === "context-pack-summary") payload = contextPackSummary(options);
	else if (command === "evidence-manifest-summary") payload = evidenceManifestSummary(options);
	else if (command === "phase-summary") payload = phaseSummary(options);
	else if (command === "seed-pi-facts") payload = seedPiFacts(options);
	else throw new Error(`Unknown command: ${command}`);
	printPayload(payload, Boolean(options.json));
	return payload.ok === false ? 1 : 0;
}

try {
	process.exitCode = main();
} catch (error) {
	console.error(String(error));
	process.exitCode = 1;
}
