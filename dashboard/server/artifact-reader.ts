import { promises as fs } from "node:fs";
import path from "node:path";
import type {
	AdrCollection,
	AdrSummary,
	DashboardDocument,
	DashboardOverview,
	EvidenceSummary,
	GraphEdge,
	GraphNode,
	GraphRecordSource,
	HealthIssue,
	HealthReport,
	IndexManifestSummary,
	JsonObject,
	ContextPackSummary,
	ReceiptSummary,
	TopicArtifacts,
	TopicGraph,
	TopicSummary,
} from "../shared/models.js";
import {
	asJsonObject,
	collectPrivateReferenceIssues,
	dedupeIssues,
	getNumber,
	getString,
	getStringArray,
	makeIssue,
	normalizeEdge,
	normalizeNode,
	parseJsonl,
	sanitizePrivateText,
} from "./jsonl.js";
import { PathSafetyError, canonicalizeRoot, safeReadDirectory, safeReadTextFile } from "./safety.js";

type OptionalText = {
	content: string;
	absolutePath: string;
	relativePath: string;
	sizeBytes: number;
	modifiedAt?: string;
};

type OptionalReadResult = {
	file?: OptionalText;
	issues: HealthIssue[];
};

type JsonlReadResult = {
	records: JsonObject[];
	issues: HealthIssue[];
};

type TopicDocumentKind = "proposal" | "plan";

type GraphFileSpec = {
	source: GraphRecordSource;
	relativePath: string;
	kind: "node" | "edge";
};

const TOPIC_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertTopicName(topic: string, root: string): void {
	if (!TOPIC_NAME_RE.test(topic) || topic.startsWith("_")) {
		throw new PathSafetyError({
			code: "outside-root",
			message: `Invalid topic name: ${topic}`,
			root,
			requestedPath: topic,
		});
	}
}

function topicPath(topic: string, ...segments: string[]): string {
	return path.join(".plan", topic, ...segments);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function missingIssue(relativePath: string, topic?: string): HealthIssue {
	return makeIssue({
		severity: "warning",
		code: "artifact-missing",
		message: `Artifact is missing: ${relativePath}`,
		path: relativePath,
		topic,
	});
}

function safetyIssue(error: PathSafetyError, topic?: string): HealthIssue {
	return makeIssue({
		severity: error.code === "private-path" ? "warning" : "error",
		code: error.code,
		message: sanitizePrivateText(error.message),
		path: error.relativePath,
		topic,
	});
}

function issueFromError(error: unknown, relativePath: string, topic?: string): HealthIssue {
	if (error instanceof PathSafetyError) return safetyIssue(error, topic);
	if (isNodeError(error) && error.code === "ENOENT") return missingIssue(relativePath, topic);
	return makeIssue({
		severity: "error",
		code: "artifact-read-error",
		message: sanitizePrivateText(String(error)),
		path: relativePath,
		topic,
	});
}

async function readOptionalText(root: string, relativePath: string, topic?: string): Promise<OptionalReadResult> {
	try {
		const read = await safeReadTextFile(root, relativePath);
		const stat = await fs.stat(read.absolutePath);
		return {
			file: {
				content: read.content,
				absolutePath: read.absolutePath,
				relativePath: read.relativePath,
				sizeBytes: stat.size,
				modifiedAt: stat.mtime.toISOString(),
			},
			issues: collectPrivateReferenceIssues(read.content, read.relativePath, topic),
		};
	} catch (error) {
		return { issues: [issueFromError(error, relativePath, topic)] };
	}
}

async function readJsonlFile(root: string, relativePath: string, topic?: string): Promise<JsonlReadResult> {
	const read = await readOptionalText(root, relativePath, topic);
	if (!read.file) return { records: [], issues: read.issues };
	const parsed = parseJsonl(read.file.content, read.file.relativePath, topic);
	return { records: parsed.records, issues: dedupeIssues([...read.issues, ...parsed.issues]) };
}

function titleFromMarkdown(content: string): string | undefined {
	const match = content.match(/^#\s+(.+)$/m);
	return match?.[1]?.trim();
}

function toDocument(
	kind: TopicDocumentKind,
	topic: string,
	file: OptionalText,
	warnings: HealthIssue[],
): DashboardDocument {
	return {
		id: `${topic}:${kind}`,
		kind,
		path: file.relativePath,
		topic,
		title: titleFromMarkdown(file.content),
		content: sanitizePrivateText(file.content),
		sizeBytes: file.sizeBytes,
		modifiedAt: file.modifiedAt,
		warnings,
	};
}

async function topicDocument(
	root: string,
	topic: string,
	kind: TopicDocumentKind,
): Promise<{ document?: DashboardDocument; issues: HealthIssue[] }> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const relativePath = topicPath(topic, `${kind}.md`);
	const read = await readOptionalText(safeRoot, relativePath, topic);
	if (!read.file) return { issues: read.issues };
	return { document: toDocument(kind, topic, read.file, read.issues), issues: read.issues };
}

export async function readTopicDocument(
	root: string,
	topic: string,
	kind: TopicDocumentKind,
): Promise<{ document?: DashboardDocument; issues: HealthIssue[] }> {
	return topicDocument(root, topic, kind);
}

export async function readTopicDocuments(
	root: string,
	topic: string,
): Promise<{ documents: DashboardDocument[]; issues: HealthIssue[] }> {
	const proposal = await topicDocument(root, topic, "proposal");
	const plan = await topicDocument(root, topic, "plan");
	return {
		documents: [proposal.document, plan.document].filter(
			(document): document is DashboardDocument => document !== undefined,
		),
		issues: dedupeIssues([...proposal.issues, ...plan.issues]),
	};
}

function topicGraphSpecs(topic: string): GraphFileSpec[] {
	return [
		{ source: "map.nodes", relativePath: topicPath(topic, "map.nodes.jsonl"), kind: "node" },
		{ source: "map.edges", relativePath: topicPath(topic, "map.edges.jsonl"), kind: "edge" },
		{ source: "facts.nodes", relativePath: topicPath(topic, "facts.nodes.jsonl"), kind: "node" },
		{ source: "facts.edges", relativePath: topicPath(topic, "facts.edges.jsonl"), kind: "edge" },
		{ source: "plan.nodes", relativePath: topicPath(topic, "plan.nodes.jsonl"), kind: "node" },
		{ source: "plan.edges", relativePath: topicPath(topic, "plan.edges.jsonl"), kind: "edge" },
	];
}

export async function readTopicGraph(root: string, topic: string): Promise<TopicGraph> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const issues: HealthIssue[] = [];
	for (const spec of topicGraphSpecs(topic)) {
		const result = await readJsonlFile(safeRoot, spec.relativePath, topic);
		issues.push(...result.issues);
		if (spec.kind === "node") {
			nodes.push(...result.records.map((record, index) => normalizeNode(record, spec.source, index)));
		} else {
			edges.push(...result.records.map((record, index) => normalizeEdge(record, spec.source, index)));
		}
	}
	return { topic, nodes, edges, warnings: dedupeIssues(issues) };
}

function commandSummaries(record: JsonObject): ReceiptSummary["commands"] {
	const value = record.commands;
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item))
		.map((item) => ({ command: getString(item, "command"), result: getString(item, "result") }));
}

export async function readReceipts(
	root: string,
	topic: string,
): Promise<{ receipts: ReceiptSummary[]; issues: HealthIssue[] }> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const result = await readJsonlFile(safeRoot, topicPath(topic, "receipts.jsonl"), topic);
	return {
		receipts: result.records.map((record, index) => ({
			id: getString(record, "id") ?? `receipt:${topic}:${index + 1}`,
			type: getString(record, "type"),
			status: getString(record, "status"),
			phaseId: getString(record, "phase_id"),
			summary: getString(record, "summary"),
			commands: commandSummaries(record),
			raw: record,
		})),
		issues: result.issues,
	};
}

export async function readContextPacks(
	root: string,
	topic: string,
): Promise<{ contextPacks: ContextPackSummary[]; issues: HealthIssue[] }> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const result = await readJsonlFile(safeRoot, topicPath(topic, "context-packs.jsonl"), topic);
	return {
		contextPacks: result.records.map((record, index) => ({
			id: getString(record, "id") ?? `context:${topic}:${index + 1}`,
			phaseId: getString(record, "phase_id"),
			summary: getString(record, "summary"),
			budgetTokens: getNumber(record, "budget_tokens"),
			references: getStringArray(record, "references"),
			verifiedFiles: getStringArray(record, "verified_files"),
			raw: record,
		})),
		issues: result.issues,
	};
}

async function walkFiles(root: string, relativeDir: string): Promise<{ files: string[]; issues: HealthIssue[] }> {
	const output: string[] = [];
	const issues: HealthIssue[] = [];
	async function visit(currentRelativeDir: string): Promise<void> {
		try {
			const directory = await safeReadDirectory(root, currentRelativeDir);
			for (const entry of directory.entries) {
				const childRelativePath = path.join(directory.relativePath, entry.name);
				if (entry.isDirectory()) await visit(childRelativePath);
				else if (entry.isFile()) output.push(childRelativePath);
			}
		} catch (error) {
			issues.push(issueFromError(error, currentRelativeDir));
		}
	}
	await visit(relativeDir);
	return { files: output.sort(), issues: dedupeIssues(issues) };
}

export async function readEvidence(root: string, topic: string): Promise<EvidenceSummary> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const evidenceDir = topicPath(topic, "evidence");
	const walked = await walkFiles(safeRoot, evidenceDir);
	const issues = [...walked.issues];
	const visibleFiles = walked.files.filter((file) => /\.(?:md|jsonl)$/i.test(file));
	const files: EvidenceSummary["files"] = [];
	for (const file of visibleFiles) {
		try {
			const read = await safeReadTextFile(safeRoot, file);
			const stat = await fs.stat(read.absolutePath);
			issues.push(...collectPrivateReferenceIssues(read.content, read.relativePath, topic));
			files.push({
				path: read.relativePath,
				kind: read.relativePath.endsWith(".jsonl") ? "jsonl" : "markdown",
				sizeBytes: stat.size,
				modifiedAt: stat.mtime.toISOString(),
			});
		} catch (error) {
			issues.push(issueFromError(error, file, topic));
		}
	}
	const manifest = await readJsonlFile(safeRoot, topicPath(topic, "evidence", "manifest.jsonl"), topic);
	issues.push(...manifest.issues);
	return { topic, files, manifestRecords: manifest.records, warnings: dedupeIssues(issues) };
}

function objectField(record: JsonObject, field: string): JsonObject | undefined {
	const value = record[field];
	return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

export async function readIndexManifest(root: string): Promise<IndexManifestSummary> {
	const safeRoot = await canonicalizeRoot(root);
	const relativePath = path.join(".plan", "_index", "project-graph-manifest.json");
	const read = await readOptionalText(safeRoot, relativePath);
	if (!read.file) {
		const warnings = read.issues.map((issue) =>
			issue.code === "artifact-missing"
				? {
						...issue,
						id: `index-manifest-missing:${relativePath}`,
						code: "index-manifest-missing",
						message: "Project index manifest is missing; refresh the Cartographer index for current data.",
					}
				: issue,
		);
		return { path: relativePath, present: false, warnings };
	}
	const issues = [...read.issues];
	try {
		const parsed = asJsonObject(JSON.parse(read.file.content));
		issues.push(...collectPrivateReferenceIssues(parsed, read.file.relativePath));
		const manifestRoot = getString(parsed, "root");
		const rootMatches = manifestRoot ? path.resolve(manifestRoot) === safeRoot : undefined;
		if (rootMatches === false) {
			issues.push(
				makeIssue({
					severity: "warning",
					code: "index-root-mismatch",
					message: "Index manifest root differs from the selected dashboard root",
					path: read.file.relativePath,
				}),
			);
		}
		return {
			path: read.file.relativePath,
			present: true,
			generatedAt: getString(parsed, "generated_at"),
			schemaVersion: getString(parsed, "schema_version") ?? getNumber(parsed, "schema_version"),
			database: getString(parsed, "database"),
			rootMatches,
			counts: objectField(parsed, "counts"),
			settings: objectField(parsed, "settings"),
			warnings: dedupeIssues(issues),
		};
	} catch (error) {
		issues.push(
			makeIssue({
				severity: "error",
				code: "index-manifest-parse-error",
				message: sanitizePrivateText(String(error)),
				path: read.file.relativePath,
			}),
		);
		return { path: read.file.relativePath, present: true, warnings: dedupeIssues(issues) };
	}
}

function parseStringList(value: string): string[] {
	const trimmed = value.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
			.filter(Boolean);
	}
	return trimmed.length > 0 ? [trimmed.replace(/^['"]|['"]$/g, "")] : [];
}

function parseFrontMatter(content: string): JsonObject {
	if (!content.startsWith("---\n")) return {};
	const end = content.indexOf("\n---", 4);
	if (end < 0) return {};
	const frontMatter = content.slice(4, end).split(/\r?\n/);
	const output: JsonObject = {};
	for (const line of frontMatter) {
		const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!match) continue;
		const key = match[1];
		const value = match[2];
		if (key === "domains" || key === "keywords" || key === "validation_receipts") output[key] = parseStringList(value);
		else output[key] = value.replace(/^['"]|['"]$/g, "");
	}
	return output;
}

function adrNumberFromPath(relativePath: string): number | undefined {
	const match = path.basename(relativePath).match(/^(\d{4})-/);
	return match ? Number.parseInt(match[1], 10) : undefined;
}

function adrIdFromMarkdown(content: string, fallbackNumber?: number): string | undefined {
	const h1 = content.match(/^#\s+(ADR-\d{4}|\d{4})\b/im);
	if (h1?.[1]) return h1[1].startsWith("ADR-") ? h1[1] : `ADR-${h1[1]}`;
	return fallbackNumber === undefined ? undefined : `ADR-${fallbackNumber.toString().padStart(4, "0")}`;
}

function adrSummaryFromNode(record: JsonObject, index: number): AdrSummary {
	const number = getNumber(record, "number") ?? adrNumberFromPath(getString(record, "path") ?? "");
	const adrId =
		getString(record, "adr_id") ?? (number === undefined ? undefined : `ADR-${number.toString().padStart(4, "0")}`);
	const id = getString(record, "id") ?? adrId ?? `adr:${index + 1}`;
	return {
		id,
		adrId,
		number,
		title: getString(record, "title") ?? id,
		status: getString(record, "status"),
		decisionDate: getString(record, "decision_date"),
		path: getString(record, "path"),
		domains: getStringArray(record, "domains"),
		keywords: getStringArray(record, "keywords"),
		raw: record,
	};
}

function adrSummaryFromDocument(file: OptionalText): AdrSummary {
	const frontMatter = parseFrontMatter(file.content);
	const number = getNumber(frontMatter, "number") ?? adrNumberFromPath(file.relativePath);
	const adrId = getString(frontMatter, "adr_id") ?? adrIdFromMarkdown(file.content, number);
	return {
		id: adrId ?? file.relativePath,
		adrId,
		number,
		title: getString(frontMatter, "title") ?? titleFromMarkdown(file.content) ?? path.basename(file.relativePath),
		status: getString(frontMatter, "status"),
		decisionDate: getString(frontMatter, "decision_date"),
		path: file.relativePath,
		domains: getStringArray(frontMatter, "domains"),
		keywords: getStringArray(frontMatter, "keywords"),
	};
}

export async function readAdrCollection(root: string): Promise<AdrCollection> {
	const safeRoot = await canonicalizeRoot(root);
	const nodeResult = await readJsonlFile(safeRoot, path.join("docs", "adr", "_graph", "adr.nodes.jsonl"));
	const edgeResult = await readJsonlFile(safeRoot, path.join("docs", "adr", "_graph", "adr.edges.jsonl"));
	const warnings: HealthIssue[] = [...nodeResult.issues, ...edgeResult.issues];
	const graphNodes = nodeResult.records.map((record, index) => normalizeNode(record, "adr.nodes", index));
	const graphEdges = edgeResult.records.map((record, index) => normalizeEdge(record, "adr.edges", index));
	const adrsByKey = new Map<string, AdrSummary>();
	for (const [index, record] of nodeResult.records.entries()) {
		const summary = adrSummaryFromNode(record, index);
		adrsByKey.set(summary.adrId ?? summary.id, summary);
	}
	const walked = await walkFiles(safeRoot, path.join("docs", "adr"));
	warnings.push(...walked.issues);
	const markdownFiles = walked.files.filter(
		(file) => file.endsWith(".md") && !file.includes(`${path.sep}_graph${path.sep}`),
	);
	for (const file of markdownFiles) {
		const read = await readOptionalText(safeRoot, file);
		warnings.push(...read.issues);
		if (!read.file) continue;
		const summary = adrSummaryFromDocument(read.file);
		const key = summary.adrId ?? summary.id;
		const existing = adrsByKey.get(key);
		adrsByKey.set(key, { ...summary, ...existing, path: existing?.path ?? summary.path });
	}
	const adrs = [...adrsByKey.values()].sort((left, right) => {
		const leftNumber = left.number ?? Number.MAX_SAFE_INTEGER;
		const rightNumber = right.number ?? Number.MAX_SAFE_INTEGER;
		return leftNumber - rightNumber || left.id.localeCompare(right.id);
	});
	const graphWarnings = dedupeIssues([...nodeResult.issues, ...edgeResult.issues]);
	return {
		adrs,
		graph: { nodes: graphNodes, edges: graphEdges, warnings: graphWarnings },
		warnings: dedupeIssues(warnings),
	};
}

async function topicSummary(root: string, topic: string): Promise<TopicSummary> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const documents = await readTopicDocuments(safeRoot, topic);
	const graphResults = await Promise.all(
		topicGraphSpecs(topic).map((spec) => readJsonlFile(safeRoot, spec.relativePath, topic)),
	);
	const receipts = await readJsonlFile(safeRoot, topicPath(topic, "receipts.jsonl"), topic);
	const contextPacks = await readJsonlFile(safeRoot, topicPath(topic, "context-packs.jsonl"), topic);
	const evidence = await readEvidence(safeRoot, topic);
	const [mapNodes, mapEdges, factNodes, factEdges, planNodes, planEdges] = graphResults;
	return {
		id: topic,
		name: topic,
		path: topicPath(topic),
		hasProposal: documents.documents.some((document) => document.kind === "proposal"),
		hasPlan: documents.documents.some((document) => document.kind === "plan"),
		counts: {
			mapNodes: mapNodes?.records.length ?? 0,
			mapEdges: mapEdges?.records.length ?? 0,
			factNodes: factNodes?.records.length ?? 0,
			factEdges: factEdges?.records.length ?? 0,
			planNodes: planNodes?.records.length ?? 0,
			planEdges: planEdges?.records.length ?? 0,
			receipts: receipts.records.length,
			contextPacks: contextPacks.records.length,
			evidenceFiles: evidence.files.length,
		},
		warnings: dedupeIssues([
			...documents.issues,
			...graphResults.flatMap((result) => result.issues),
			...receipts.issues,
			...contextPacks.issues,
			...evidence.warnings,
		]),
	};
}

export async function discoverTopics(root: string): Promise<{ topics: TopicSummary[]; issues: HealthIssue[] }> {
	const safeRoot = await canonicalizeRoot(root);
	try {
		const directory = await safeReadDirectory(safeRoot, ".plan");
		const topicNames = directory.entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
			.map((entry) => entry.name)
			.filter((name) => TOPIC_NAME_RE.test(name))
			.sort();
		const topics = await Promise.all(topicNames.map((topic) => topicSummary(safeRoot, topic)));
		return { topics, issues: topics.flatMap((topic) => topic.warnings) };
	} catch (error) {
		return { topics: [], issues: [issueFromError(error, ".plan")] };
	}
}

function healthStatus(issues: HealthIssue[]): HealthReport["status"] {
	if (issues.some((issue) => issue.severity === "error")) return "error";
	if (issues.some((issue) => issue.severity === "warning")) return "warn";
	return "ok";
}

export async function readHealth(root: string): Promise<HealthReport> {
	const safeRoot = await canonicalizeRoot(root);
	const discovered = await discoverTopics(safeRoot);
	const indexManifest = await readIndexManifest(safeRoot);
	const adrs = await readAdrCollection(safeRoot);
	const issues = dedupeIssues([...discovered.issues, ...indexManifest.warnings, ...adrs.warnings]);
	return {
		status: healthStatus(issues),
		root: safeRoot,
		generatedAt: new Date().toISOString(),
		issues,
		counts: {
			topics: discovered.topics.length,
			adrs: adrs.adrs.length,
			warnings: issues.filter((issue) => issue.severity === "warning").length,
			errors: issues.filter((issue) => issue.severity === "error").length,
		},
	};
}

export async function readOverview(root: string): Promise<DashboardOverview> {
	const safeRoot = await canonicalizeRoot(root);
	const [discovered, indexManifest, adrs, health] = await Promise.all([
		discoverTopics(safeRoot),
		readIndexManifest(safeRoot),
		readAdrCollection(safeRoot),
		readHealth(safeRoot),
	]);
	return {
		root: safeRoot,
		generatedAt: new Date().toISOString(),
		topics: discovered.topics,
		indexManifest,
		adrCount: adrs.adrs.length,
		health,
	};
}

export async function readTopicArtifacts(root: string, topic: string): Promise<TopicArtifacts> {
	const safeRoot = await canonicalizeRoot(root);
	assertTopicName(topic, safeRoot);
	const [summary, documents, graph, receipts, contextPacks, evidence, indexManifest, health] = await Promise.all([
		topicSummary(safeRoot, topic),
		readTopicDocuments(safeRoot, topic),
		readTopicGraph(safeRoot, topic),
		readReceipts(safeRoot, topic),
		readContextPacks(safeRoot, topic),
		readEvidence(safeRoot, topic),
		readIndexManifest(safeRoot),
		readHealth(safeRoot),
	]);
	return {
		topic: summary,
		documents: documents.documents,
		graph,
		receipts: receipts.receipts,
		contextPacks: contextPacks.contextPacks,
		evidence,
		indexManifest,
		health,
	};
}

export async function readSafeFile(root: string, requestedPath: string): Promise<DashboardDocument> {
	const safeRoot = await canonicalizeRoot(root);
	const read = await safeReadTextFile(safeRoot, requestedPath);
	const stat = await fs.stat(read.absolutePath);
	const warnings = collectPrivateReferenceIssues(read.content, read.relativePath);
	return {
		id: read.relativePath,
		kind: "file",
		path: read.relativePath,
		title: path.basename(read.relativePath),
		content: sanitizePrivateText(read.content),
		sizeBytes: stat.size,
		modifiedAt: stat.mtime.toISOString(),
		warnings,
	};
}
