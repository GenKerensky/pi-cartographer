import type { GraphEdge, GraphNode, GraphRecordSource, HealthIssue, JsonObject } from "../shared/models.js";

const PRIVATE_PATH_RE = /(?:^|[\s"'`(])\.plan\/_private\/(?!<)[^\s"'`)\]]+/g;
const PRIVATE_FIELD_NAMES = new Set(["raw_archive_path", "source_path", "private_path_hint", "raw_content", "content"]);

export type JsonlParseResult = {
	records: JsonObject[];
	issues: HealthIssue[];
};

export function makeIssue(options: {
	severity: HealthIssue["severity"];
	code: string;
	message: string;
	path?: string;
	topic?: string;
	line?: number;
}): HealthIssue {
	const parts = [options.code, options.topic, options.path, options.line?.toString()].filter(
		(value): value is string => typeof value === "string" && value.length > 0,
	);
	return {
		id: parts.join(":"),
		severity: options.severity,
		code: options.code,
		message: options.message,
		path: options.path,
		topic: options.topic,
		line: options.line,
	};
}

export function sanitizePrivateText(text: string): string {
	return text.replace(PRIVATE_PATH_RE, (match) => {
		const prefix = match.startsWith(".plan/") ? "" : match.slice(0, 1);
		return `${prefix}.plan/_private/<redacted>`;
	});
}

export function sanitizeJsonValue(value: unknown): unknown {
	if (typeof value === "string") return sanitizePrivateText(value);
	if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
	if (!value || typeof value !== "object") return value;
	const output: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		output[key] = PRIVATE_FIELD_NAMES.has(key)
			? "<redacted-private-reference>"
			: (sanitizeJsonValue(item) as JsonObject[string]);
	}
	return output;
}

export function asJsonObject(value: unknown): JsonObject {
	const sanitized = sanitizeJsonValue(value);
	if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return {};
	return sanitized as JsonObject;
}

export function collectPrivateReferenceIssues(value: unknown, path: string, topic?: string): HealthIssue[] {
	const issues: HealthIssue[] = [];
	const visit = (candidate: unknown): void => {
		if (typeof candidate === "string") {
			if (PRIVATE_PATH_RE.test(candidate)) {
				issues.push(
					makeIssue({
						severity: "warning",
						code: "private-reference-redacted",
						message: "Private artifact reference was redacted from read-only output",
						path,
						topic,
					}),
				);
			}
			PRIVATE_PATH_RE.lastIndex = 0;
			return;
		}
		if (Array.isArray(candidate)) {
			for (const item of candidate) visit(item);
			return;
		}
		if (candidate && typeof candidate === "object") {
			for (const [key, item] of Object.entries(candidate)) {
				if (PRIVATE_FIELD_NAMES.has(key) && item !== undefined) {
					issues.push(
						makeIssue({
							severity: "warning",
							code: "private-field-redacted",
							message: `Private field ${key} was redacted from read-only output`,
							path,
							topic,
						}),
					);
				}
				visit(item);
			}
		}
	};
	visit(value);
	return dedupeIssues(issues);
}

export function dedupeIssues(issues: HealthIssue[]): HealthIssue[] {
	const seen = new Set<string>();
	const output: HealthIssue[] = [];
	for (const issue of issues) {
		const key = `${issue.code}:${issue.topic ?? ""}:${issue.path ?? ""}:${issue.line ?? ""}:${issue.message}`;
		if (seen.has(key)) continue;
		seen.add(key);
		output.push(issue);
	}
	return output;
}

export function parseJsonl(text: string, path: string, topic?: string): JsonlParseResult {
	const records: JsonObject[] = [];
	const issues: HealthIssue[] = [];
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (line.length === 0) continue;
		try {
			const parsed: unknown = JSON.parse(line);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				issues.push(
					makeIssue({
						severity: "error",
						code: "jsonl-record-not-object",
						message: "JSONL record must be an object",
						path,
						topic,
						line: index + 1,
					}),
				);
				continue;
			}
			issues.push(...collectPrivateReferenceIssues(parsed, path, topic));
			records.push(asJsonObject(parsed));
		} catch (error) {
			issues.push(
				makeIssue({
					severity: "error",
					code: "jsonl-parse-error",
					message: sanitizePrivateText(String(error)),
					path,
					topic,
					line: index + 1,
				}),
			);
		}
	}
	return { records, issues: dedupeIssues(issues) };
}

function stringField(record: JsonObject, field: string): string | undefined {
	const value = record[field];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(record: JsonObject, field: string): number | undefined {
	const value = record[field];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeNode(record: JsonObject, source: GraphRecordSource, index: number): GraphNode {
	const id = stringField(record, "id") ?? `${source}:${index + 1}`;
	return {
		id,
		type: stringField(record, "type") ?? "record",
		source,
		label: stringField(record, "title") ?? stringField(record, "summary") ?? stringField(record, "claim") ?? id,
		status: stringField(record, "status"),
		phaseId: stringField(record, "phase_id"),
		taskId: stringField(record, "task_id"),
		validationId: stringField(record, "validation_id"),
		raw: record,
	};
}

export function normalizeEdge(record: JsonObject, source: GraphRecordSource, index: number): GraphEdge {
	const from = stringField(record, "from") ?? "";
	const to = stringField(record, "to") ?? "";
	const type = stringField(record, "type") ?? "related_to";
	const id = stringField(record, "id") ?? `${source}:${from}->${to}:${type}:${index + 1}`;
	return { id, from, to, type, source, raw: record };
}

export function getStringArray(record: JsonObject, field: string): string[] {
	const value = record[field];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

export function getString(record: JsonObject, field: string): string | undefined {
	return stringField(record, field);
}

export function getNumber(record: JsonObject, field: string): number | undefined {
	return numberField(record, field);
}
