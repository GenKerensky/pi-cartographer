#!/usr/bin/env node --experimental-strip-types
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FACT_CITATION_RE = /\[(F\d+)\]/g;
const REFERENCE_RE =
	/(^|\s|[`([])([A-Za-z0-9_./@+-]+\.[A-Za-z0-9_./@+-]+):(\d+)/g;

type JsonRecord = Record<string, unknown>;
type ValidateReport = {
	ok: boolean;
	topic?: string;
	file?: string;
	errors: string[];
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

function validateTopic(
	options: Record<string, string | boolean | string[]>,
): ValidateReport {
	const root = path.resolve(optString(options, "root", process.cwd()));
	const topic = optString(options, "topic");
	const dir = path.join(root, ".plan", topic);
	const errors: string[] = [];
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
		counts: {
			map_nodes: mapNodes.length,
			map_edges: mapEdges.length,
			fact_nodes: factNodes.length,
			fact_edges: factEdges.length,
			plan_nodes: planNodes.length,
			plan_edges: planEdges.length,
		},
	};
}

function validateFile(
	options: Record<string, string | boolean | string[]>,
): ValidateReport {
	const filePath = path.resolve(optString(options, "file"));
	const result = readJsonl(filePath, true);
	if (options["require-id"])
		validateUnique(result.records, path.basename(filePath), result.errors);
	return {
		ok: result.errors.length === 0,
		file: filePath,
		errors: result.errors,
		count: result.records.length,
	};
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
