#!/usr/bin/env node --experimental-strip-types
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FACT_CITATION_RE = /\[(F\d+)\]/g;
const REFERENCE_RE =
	/(^|\s|[`([])([A-Za-z0-9_./@+-]+\.[A-Za-z0-9_./@+-]+):(\d+)/g;
const LIFECYCLE_STATES = new Set([
	"draft",
	"accepted",
	"planned",
	"in-progress",
	"implemented",
	"superseded",
	"stale",
]);
const MISS_FAILURE_TYPES = new Set([
	"vocabulary_mismatch",
	"generic_noise",
	"missing_context",
	"stale_artifact",
	"ranking_failure",
	"tool_failure",
]);
const MISS_RESOLUTIONS = new Set([
	"query_expansion",
	"path_constraint",
	"manual_read",
	"user_hint",
	"unresolved",
]);
const RAW_MISS_FIELDS = new Set([
	"text",
	"snippet",
	"raw_snippet",
	"content",
	"raw_content",
]);
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
		if (!token.startsWith("--"))
			throw new Error(`Unexpected positional argument: ${token}`);
		const name = token.slice(2);
		if (["json", "require-id", "merge", "no-merge"].includes(name)) {
			options[name] = true;
			continue;
		}
		const value = rest[index + 1];
		if (value === undefined || value.startsWith("--"))
			throw new Error(`Missing value for --${name}`);
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
  ${script} seed-pi-facts --root <root> --topic <topic> [--json]`);
	process.exit(exitCode);
}

function optString(
	options: Record<string, unknown>,
	name: string,
	fallback?: string,
): string {
	const value = options[name];
	if (typeof value === "string" && value.length > 0) return value;
	if (fallback !== undefined) return fallback;
	throw new Error(`Missing required --${name}`);
}

function optNumber(
	options: Record<string, unknown>,
	name: string,
	fallback: number,
): number {
	const value = options[name];
	if (typeof value !== "string") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function readJsonl(
	filePath: string,
	required = false,
): { records: JsonRecord[]; errors: string[] } {
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
				errors.push(
					`JSONL record must be an object in ${filePath}:${index + 1}`,
				);
			} else {
				records.push(value as JsonRecord);
			}
		} catch (error) {
			errors.push(
				`Invalid JSONL in ${filePath}:${index + 1}: ${String(error)}`,
			);
		}
	}
	return { records, errors };
}

function writeJsonlAtomic(filePath: string, records: JsonRecord[]): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = path.join(
		path.dirname(filePath),
		`.tmp-${process.pid}-${Date.now()}-${path.basename(filePath)}`,
	);
	const text = records
		.map((record) => `${JSON.stringify(sortObject(record))}\n`)
		.join("");
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
	if ("from" in record && "to" in record && "type" in record)
		return ["from", "to", "type"];
	if (filePath.endsWith(".edges.jsonl")) return ["from", "to", "type"];
	return ["id"];
}

function recordKey(record: JsonRecord, keys: string[]): string {
	return JSON.stringify(keys.map((key) => record[key] ?? null));
}

function upsert(
	options: Record<string, string | boolean | string[]>,
): Record<string, unknown> {
	const filePath = path.resolve(optString(options, "file"));
	const record = JSON.parse(optString(options, "record")) as unknown;
	if (!record || typeof record !== "object" || Array.isArray(record))
		throw new Error("--record must be a JSON object");
	const parsed = readJsonl(filePath);
	if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
	const jsonRecord = record as JsonRecord;
	const keys = Array.isArray(options.key)
		? options.key
		: defaultKeysFor(filePath, jsonRecord);
	for (const key of keys)
		if (jsonRecord[key] === undefined || jsonRecord[key] === null)
			throw new Error(`Record is missing key field: ${key}`);
	const target = recordKey(jsonRecord, keys);
	let action = "inserted";
	const merge = options.merge !== false;
	const records = parsed.records;
	const existingIndex = records.findIndex(
		(item) => recordKey(item, keys) === target,
	);
	if (existingIndex >= 0) {
		records[existingIndex] = merge
			? { ...records[existingIndex], ...jsonRecord }
			: jsonRecord;
		action = "updated";
	} else {
		records.push(jsonRecord);
	}
	writeJsonlAtomic(filePath, records);
	return { ok: true, action, file: filePath, keys, count: records.length };
}

function validateUnique(
	records: JsonRecord[],
	label: string,
	errors: string[],
): Set<string> {
	const ids = new Set<string>();
	records.forEach((record, index) => {
		const id = record.id;
		if (!id) {
			errors.push(`Missing id in ${label} record ${index + 1}`);
			return;
		}
		const text = String(id);
		if (ids.has(text))
			errors.push(`Duplicate id ${JSON.stringify(text)} in ${label}`);
		ids.add(text);
	});
	return ids;
}

function validateEdges(
	records: JsonRecord[],
	label: string,
	allowed: Set<string>,
	errors: string[],
): void {
	records.forEach((record, index) => {
		for (const key of ["from", "to", "type"])
			if (!record[key])
				errors.push(
					`Missing ${JSON.stringify(key)} in ${label} record ${index + 1}`,
				);
		for (const endpoint of ["from", "to"]) {
			const value = record[endpoint];
			const text = value === undefined || value === null ? "" : String(value);
			if (
				text &&
				!allowed.has(text) &&
				!/^(file|doc|symbol|dependency):/.test(text)
			)
				errors.push(
					`Unresolved edge endpoint ${JSON.stringify(text)} in ${label} record ${index + 1}`,
				);
		}
	});
}

function validateFileRefs(
	root: string,
	records: JsonRecord[],
	errors: string[],
): void {
	for (const record of records) {
		for (const field of ["reference", "evidence"]) {
			const value = record[field];
			if (typeof value !== "string") continue;
			for (const match of value.matchAll(REFERENCE_RE)) {
				const pathText = match[2];
				const lineText = match[3];
				let resolved = path.isAbsolute(pathText)
					? pathText
					: path.join(root, pathText);
				if (
					!fs.existsSync(resolved) &&
					typeof record.url === "string" &&
					record.url.startsWith("file://")
				) {
					const urlPath = fileURLToPath(record.url);
					if (path.basename(urlPath) === path.basename(pathText))
						resolved = urlPath;
				}
				if (!fs.existsSync(resolved)) {
					errors.push(`Missing referenced file: ${pathText}`);
					continue;
				}
				const lineCount = fs
					.readFileSync(resolved, "utf8")
					.split(/\r?\n/).length;
				if (Number(lineText) > lineCount)
					errors.push(`Reference line out of range: ${pathText}:${lineText}`);
			}
		}
	}
}

function hasVerificationEvidence(record: JsonRecord): boolean {
	const verification = record.verification;
	if (!verification || typeof verification !== "object" || Array.isArray(verification))
		return false;
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
				errors.push(
					`Invalid lifecycle state ${JSON.stringify(value)} in ${label} record ${index + 1}`,
				);
		}
		if (record.verified === true && !hasVerificationEvidence(record))
			errors.push(
				`verified=true lacks read/rg/validation evidence in ${label} record ${index + 1}`,
			);
		const highImpactCandidate =
			record.candidate === true &&
			record.verified !== true &&
			(["file", "symbol", "dependency"].includes(String(record.type)) ||
				["depends_on", "imports", "references", "relevant_to"].includes(
					String(record.type),
				));
		if (highImpactCandidate)
			warnings.push(
				`High-impact candidate-only reference in ${label} record ${index + 1}`,
			);
		const usedForImplementation =
			record.implementation_guidance === true ||
			record.used_as === "implementation_guidance" ||
			(Array.isArray(record.used_as) &&
				record.used_as.includes("implementation_guidance"));
		if (usedForImplementation) {
			const state = field ? String(record[field]) : undefined;
			if (!state || ["draft", "superseded", "stale"].includes(state) || !record.last_verified_at)
				warnings.push(
					`Implementation guidance uses stale/unverified rationale in ${label} record ${index + 1}`,
				);
		}
	});
}

function validateMissRecords(
	records: JsonRecord[],
	label: string,
	errors: string[],
): void {
	records.forEach((record, index) => {
		for (const field of ["id", "created_at", "original_query", "failure_type", "resolution"])
			if (!record[field])
				errors.push(`Missing ${field} in ${label} record ${index + 1}`);
		if (record.failure_type && !MISS_FAILURE_TYPES.has(String(record.failure_type)))
			errors.push(
				`Invalid failure_type ${JSON.stringify(record.failure_type)} in ${label} record ${index + 1}`,
			);
		if (record.resolution && !MISS_RESOLUTIONS.has(String(record.resolution)))
			errors.push(
				`Invalid resolution ${JSON.stringify(record.resolution)} in ${label} record ${index + 1}`,
			);
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
	const checkedFields = ["reference", "evidence", "url", "path", "raw_archive_path", "source_path", "private_path_hint"];
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

function validateEvidenceArtifacts(
	root: string,
	topic: string,
	factNodes: JsonRecord[],
	errors: string[],
): number {
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
			errors.push(`Sanitized evidence source ${String(source.id)} lacks Redaction status in ${path.relative(root, sourcePath)}`);
	}
	return files.length;
}

function retrievalMissPath(root: string): string {
	return path.join(root, ".plan", "_retrieval", "misses.jsonl");
}

function validateTopic(
	options: Record<string, string | boolean | string[]>,
): ValidateReport {
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
	const missResult = readJsonl(retrievalMissPath(root));
	errors.push(...missResult.errors);

	const mapIds = validateUnique(mapNodes, "map.nodes.jsonl", errors);
	const factIdsAll = validateUnique(factNodes, "facts.nodes.jsonl", errors);
	const planIds = validateUnique(planNodes, "plan.nodes.jsonl", errors);
	const allowed = new Set([...mapIds, ...factIdsAll, ...planIds]);
	validateEdges(mapEdges, "map.edges.jsonl", allowed, errors);
	validateEdges(factEdges, "facts.edges.jsonl", allowed, errors);
	validateEdges(planEdges, "plan.edges.jsonl", allowed, errors);
	validateFileRefs(
		root,
		[
			...mapNodes,
			...mapEdges,
			...factNodes,
			...factEdges,
			...planNodes,
			...planEdges,
		],
		errors,
	);
	validateLifecycleAndRetrievalMetadata(mapNodes, "map.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(mapEdges, "map.edges.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(factNodes, "facts.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(factEdges, "facts.edges.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(planNodes, "plan.nodes.jsonl", errors, warnings);
	validateLifecycleAndRetrievalMetadata(planEdges, "plan.edges.jsonl", errors, warnings);
	validateNoPrivateArtifactRefs(mapNodes, "map.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(mapEdges, "map.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(factNodes, "facts.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(factEdges, "facts.edges.jsonl", errors);
	validateNoPrivateArtifactRefs(planNodes, "plan.nodes.jsonl", errors);
	validateNoPrivateArtifactRefs(planEdges, "plan.edges.jsonl", errors);
	validateMissRecords(missResult.records, "misses.jsonl", errors);
	const evidenceFileCount = validateEvidenceArtifacts(root, topic, factNodes, errors);

	const factById = new Map(
		factNodes.filter((item) => item.id).map((item) => [String(item.id), item]),
	);
	const sourceIds = new Set(
		[...factById]
			.filter(([, item]) => item.type === "source")
			.map(([id]) => id),
	);
	const factIds = new Set(
		[...factById].filter(([, item]) => item.type === "fact").map(([id]) => id),
	);
	const supported = new Set(
		factEdges
			.filter(
				(edge) =>
					edge.type === "supported_by" && sourceIds.has(String(edge.to)),
			)
			.map((edge) => String(edge.from)),
	);
	for (const id of factIds)
		if (id.startsWith("F") && !supported.has(id))
			errors.push(`Fact ${id} has no supported_by edge to a source node`);
	const proposalPath = path.join(dir, "proposal.md");
	if (fs.existsSync(proposalPath)) {
		const text = fs.readFileSync(proposalPath, "utf8");
		for (const match of text.matchAll(FACT_CITATION_RE))
			if (!factIds.has(match[1]))
				errors.push(`Proposal cites missing fact [${match[1]}]`);
	}
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
			evidence_files: evidenceFileCount,
			retrieval_misses: missResult.records.length,
		},
	};
}

function validateFile(
	options: Record<string, string | boolean | string[]>,
): ValidateReport {
	const filePath = path.resolve(optString(options, "file"));
	const result = readJsonl(filePath, true);
	const warnings: string[] = [];
	const label = path.basename(filePath);
	if (options["require-id"]) validateUnique(result.records, label, result.errors);
	validateLifecycleAndRetrievalMetadata(result.records, label, result.errors, warnings);
	if (filePath.endsWith(path.join("_retrieval", "misses.jsonl")) || label === "misses.jsonl")
		validateMissRecords(result.records, label, result.errors);
	return {
		ok: result.errors.length === 0,
		file: filePath,
		errors: result.errors,
		warnings,
		count: result.records.length,
	};
}

function validateMisses(
	options: Record<string, string | boolean | string[]>,
): ValidateReport {
	const root = path.resolve(optString(options, "root", process.cwd()));
	const filePath = retrievalMissPath(root);
	return validateFile({ file: filePath, "require-id": true });
}

function listMisses(
	options: Record<string, string | boolean | string[]>,
): Record<string, unknown> {
	const root = path.resolve(optString(options, "root", process.cwd()));
	return listRecords({ file: retrievalMissPath(root), limit: options.limit ?? "20" });
}

function listRecords(
	options: Record<string, string | boolean | string[]>,
): Record<string, unknown> {
	const filePath = path.resolve(optString(options, "file"));
	const result = readJsonl(filePath, true);
	if (result.errors.length)
		return { ok: false, file: filePath, errors: result.errors, records: [] };
	const limit = Math.max(0, optNumber(options, "limit", 20));
	return {
		ok: true,
		file: filePath,
		count: result.records.length,
		records: limit ? result.records.slice(0, limit) : result.records,
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
		const existingIndex = records.findIndex(
			(item) => recordKey(item, keys) === target,
		);
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

function docSource(
	id: string,
	title: string,
	filePath: string,
	description: string,
): JsonRecord {
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

function fact(
	id: string,
	title: string,
	claim: string,
	sourceId: string,
	relevance: string,
): JsonRecord {
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

function seedPiFacts(
	options: Record<string, string | boolean | string[]>,
): Record<string, unknown> {
	const root = path.resolve(optString(options, "root", process.cwd()));
	const topic = optString(options, "topic");
	const dir = path.join(root, ".plan", topic);
	const piDocs =
		"/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs";
	const subagentsSkill =
		"/home/falco/.pi/agent/npm/node_modules/pi-subagents/skills/pi-subagents/SKILL.md";
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
		docSource(
			"S904",
			"pi-subagents skill",
			subagentsSkill,
			"Official local pi-subagents orchestration guidance.",
		),
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
		supportEdge(
			"F900",
			"S900",
			"packages.md describes package.json pi manifest resources.",
		),
		supportEdge(
			"F901",
			"S900",
			"packages.md documents gallery image metadata.",
		),
		supportEdge(
			"F902",
			"S901",
			"skills.md describes skill structure and frontmatter.",
		),
		supportEdge("F903", "S902", "extensions.md documents pi.registerTool."),
		supportEdge(
			"F904",
			"S903",
			"prompt-templates.md documents packaged prompt templates.",
		),
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
