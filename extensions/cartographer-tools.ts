import { execFile } from "node:child_process";
import type { ExecFileException } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Type } from "typebox";

type TextContent = { type: "text"; text: string };
type ToolResult = {
	content: TextContent[];
	details: Record<string, unknown>;
	isError?: boolean;
};

type OutputShapeParams = {
	maxOutputChars?: number;
	outputPath?: string;
	raw?: boolean;
};

type CartographerIndexParams = OutputShapeParams & {
	action: "ensure" | "query" | "context" | "repo-map" | "search" | "read" | "slice-jsonl" | "status" | "log-miss";
	root?: string;
	topic?: string;
	path?: string;
	nodeId?: string;
	outDir?: string;
	limit?: number;
	maxTokens?: number;
	pattern?: string;
	mode?: "fixed" | "regex";
	paths?: string[];
	context?: boolean;
	caseSensitive?: boolean;
	scope?: "code" | "plans" | "all";
	includeRawSlice?: boolean;
	workflow?: "proposal" | "plan" | "implement" | "manual";
	originalQuery?: string;
	expandedQuery?: string[];
	retrievalMode?: string[];
	failureType?:
		| "vocabulary_mismatch"
		| "generic_noise"
		| "missing_context"
		| "stale_artifact"
		| "ranking_failure"
		| "tool_failure";
	expectedTerm?: string[];
	eventualHit?: string;
	resolution?:
		| "query_expansion"
		| "path_constraint"
		| "manual_read"
		| "user_hint"
		| "unresolved";
	notes?: string;
};

type CartographerJsonlParams = OutputShapeParams & {
	action:
		| "validate-topic"
		| "validate-file"
		| "validate-misses"
		| "list-misses"
		| "list"
		| "upsert"
		| "seed-pi-facts";
	root?: string;
	topic?: string;
	file?: string;
	record?: unknown;
	key?: string[];
	limit?: number;
	requireId?: boolean;
	merge?: boolean;
};

type CartographerEvidenceParams = OutputShapeParams & {
	action: "import" | "list";
	root?: string;
	topic?: string;
	input?: string[];
	move?: boolean;
	basenameMode?: "preserve" | "sanitize" | "opaque";
	hash?: boolean;
	inbox?: boolean;
	inboxId?: string;
	sensitivity?: "unknown" | "low" | "medium" | "high";
	limit?: number;
};

type CartographerSessionParams = OutputShapeParams & {
	action: "analyze";
	input?: string;
	out?: string;
	jsonOut?: string;
};

type AdrStatus = "accepted" | "accepted-legacy" | "draft" | "proposed" | "rejected" | "superseded";
type AdrRelationType = "child_of" | "conflicts_with" | "depends_on" | "precursor_to" | "related_to" | "supersedes";

type CartographerAdrParams = OutputShapeParams & {
	action: "evaluate" | "draft" | "create" | "write" | "list" | "query" | "show" | "relate" | "import" | "validate";
	root?: string;
	adrDir?: string;
	topic?: string;
	request?: string;
	force?: boolean;
	number?: number;
	title?: string;
	decision?: string;
	context?: string;
	options?: string[];
	rationale?: string;
	consequences?: string[];
	usage?: string;
	validation?: string;
	domains?: string[];
	keywords?: string[];
	status?: AdrStatus;
	decisionDate?: string;
	decisionKind?: string;
	confidence?: string;
	sourceCommits?: string[];
	validationReceipts?: string[];
	includeSuperseded?: boolean;
	limit?: number;
	query?: string;
	target?: string;
	from?: string;
	to?: string;
	relationType?: AdrRelationType;
	reason?: string;
	evidence?: string[];
	confirm?: boolean;
	path?: string;
	legacy?: boolean;
	importNote?: string;
};

type ToolRegistration = {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal?: AbortSignal,
	) => Promise<ToolResult>;
};

type PiApi = {
	registerTool(tool: ToolRegistration): void;
};

const execFileAsync = promisify(execFile);
const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.dirname(extensionDir);
const indexScript = path.join(
	packageRoot,
	"skills",
	"index-project",
	"scripts",
	"index_project.py",
);
const jsonlScript = path.join(
	packageRoot,
	"skills",
	"plan",
	"scripts",
	"manage_jsonl.ts",
);
const evidenceScript = path.join(
	packageRoot,
	"skills",
	"plan",
	"scripts",
	"private_artifacts.py",
);
const sessionScript = path.join(
	packageRoot,
	"skills",
	"plan",
	"scripts",
	"analyze_session.py",
);
const adrScript = path.join(
	packageRoot,
	"skills",
	"plan",
	"scripts",
	"adr_records.py",
);

function isExecFileException(error: unknown): error is ExecFileException & {
	stdout?: string;
	stderr?: string;
} {
	return typeof error === "object" && error !== null;
}

type OutputShapeOptions = {
	maxOutputChars?: number;
	outputPath?: string;
	raw?: boolean;
	summaryMode?: "query" | "receipt";
	nextActions?: string[];
	label?: string;
	exitCode?: number;
	isError?: boolean;
};

type ShapedOutput = {
	text: string;
	details: Record<string, unknown>;
};

function defaultOutputPath(label = "tool-output"): string {
	const dir = path.join(os.tmpdir(), "pi-cartographer-runs");
	fs.mkdirSync(dir, { recursive: true });
	const safeLabel = label.replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 48) || "tool-output";
	return path.join(dir, `${safeLabel}-${Date.now()}.log`);
}

function resolveOutputPath(outputPath: string | undefined, label?: string): string {
	if (!outputPath) return defaultOutputPath(label);
	return path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
}

function querySummary(stdout: string): Record<string, unknown> | undefined {
	try {
		const parsed = JSON.parse(stdout) as unknown;
		if (!Array.isArray(parsed)) return undefined;
		const top = parsed.slice(0, 5).map((item) => {
			if (!item || typeof item !== "object") return item;
			const record = item as Record<string, unknown>;
			return {
				path: record.path,
				score: record.score,
				matches: Array.isArray(record.matches) ? record.matches.length : undefined,
				candidate: record.candidate,
				verified: record.verified,
			};
		});
		return {
			summary: `cartographer_index query returned ${parsed.length} result(s).`,
			counts: { results: parsed.length },
			top_results: top,
			next_actions: [
				"Use cartographer_index context for compact snippets.",
				"Use cartographer_index read for a specific path or node before citing/editing.",
			],
		};
	} catch {
		return undefined;
	}
}

export function shapeToolOutput(stdout: string, stderr = "", options: OutputShapeOptions = {}): ShapedOutput {
	const combined = stdout || stderr || "OK\n";
	const maxOutputChars = options.maxOutputChars ?? 8000;
	const tokenEstimate = Math.ceil(combined.length / 4);
	const queryReceipt = options.summaryMode === "query" && !options.raw ? querySummary(stdout) : undefined;
	const shouldSummarize = Boolean(queryReceipt) || (!options.raw && combined.length > maxOutputChars);
	if (!shouldSummarize) {
		return {
			text: combined,
			details: {
				stdout,
				stderr,
				exitCode: options.exitCode ?? 0,
				truncated: false,
				token_estimate: tokenEstimate,
			},
		};
	}

	const fullOutputPath = resolveOutputPath(options.outputPath, options.label);
	fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
	fs.writeFileSync(fullOutputPath, combined, "utf8");
	const receipt = {
		summary:
			(queryReceipt?.summary as string | undefined) ||
			`${options.label || "Tool command"} produced ${combined.length} character(s); full output was saved to a file.`,
		counts: {
			outputChars: combined.length,
			stdoutChars: stdout.length,
			stderrChars: stderr.length,
			omittedChars: Math.max(0, combined.length - maxOutputChars),
			...((queryReceipt?.counts as Record<string, unknown> | undefined) || {}),
		},
		token_estimate: tokenEstimate,
		truncated: true,
		maxOutputChars,
		full_output_path: fullOutputPath,
		exitCode: options.exitCode ?? 0,
		isError: options.isError || undefined,
		top_results: queryReceipt?.top_results,
		next_actions: options.nextActions || queryReceipt?.next_actions || [],
	};
	return {
		text: JSON.stringify(receipt, null, 2),
		details: {
			stdout: options.raw ? stdout : undefined,
			stderr: options.raw ? stderr : undefined,
			exitCode: options.exitCode ?? 0,
			truncated: true,
			fullOutputPath,
			receipt,
		},
	};
}

async function runCommand(
	command: string,
	args: string[],
	signal?: AbortSignal,
	shapeOptions: OutputShapeOptions = {},
): Promise<ToolResult> {
	try {
		const result = await execFileAsync(command, args, {
			cwd: process.cwd(),
			signal,
			maxBuffer: 10 * 1024 * 1024,
		});
		const shaped = shapeToolOutput(result.stdout, result.stderr, { ...shapeOptions, exitCode: 0 });
		return {
			content: [{ type: "text", text: shaped.text }],
			details: shaped.details,
		};
	} catch (error: unknown) {
		const stdout = isExecFileException(error) && error.stdout ? error.stdout : "";
		const stderr = isExecFileException(error) && error.stderr ? error.stderr : String(error);
		const rawExitCode = isExecFileException(error) && error.code ? error.code : 1;
		const exitCode = typeof rawExitCode === "number" ? rawExitCode : 1;
		const shaped = shapeToolOutput(stdout, stderr, { ...shapeOptions, exitCode, isError: true });
		return {
			content: [{ type: "text", text: shaped.text }],
			details: shaped.details,
			isError: true,
		};
	}
}

function addRoot(args: string[], root?: string): void {
	args.push("--root", root || process.cwd());
}

function requireString(value: unknown, message: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(message);
	return value;
}

function optionalNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function addAdrCommonArgs(args: string[], params: CartographerAdrParams): void {
	addRoot(args, params.root);
	if (params.adrDir) args.push("--adr-dir", params.adrDir);
	args.push("--json");
}

function addRepeated(args: string[], flag: string, values?: string[]): void {
	for (const value of values || []) args.push(flag, value);
}

function addAdrRecordArgs(args: string[], params: CartographerAdrParams, required: boolean): void {
	if (required || params.title) args.push("--title", requireString(params.title, "cartographer_adr action requires title"));
	if (required || params.decision)
		args.push("--decision", requireString(params.decision, "cartographer_adr action requires decision"));
	if (required || params.context)
		args.push("--context", requireString(params.context, "cartographer_adr action requires context"));
	addRepeated(args, "--option", params.options);
	if (params.rationale) args.push("--rationale", params.rationale);
	addRepeated(args, "--consequence", params.consequences);
	if (params.usage) args.push("--usage", params.usage);
	if (params.validation) args.push("--validation", params.validation);
	addRepeated(args, "--domain", params.domains);
	addRepeated(args, "--keyword", params.keywords);
	if (params.status) args.push("--status", params.status);
	if (params.decisionDate) args.push("--decision-date", params.decisionDate);
	if (params.decisionKind) args.push("--decision-kind", params.decisionKind);
	if (params.confidence) args.push("--confidence", params.confidence);
	addRepeated(args, "--source-commit", params.sourceCommits);
	addRepeated(args, "--validation-receipt", params.validationReceipts);
}

function buildAdrArgs(params: CartographerAdrParams): string[] {
	const args: string[] = [params.action];
	if (params.action === "evaluate") {
		addAdrCommonArgs(args, params);
		if (params.topic) args.push("--topic", params.topic);
		if (params.request) args.push("--request", params.request);
	} else if (params.action === "draft") {
		addAdrCommonArgs(args, params);
		args.push("--topic", requireString(params.topic, "cartographer_adr draft requires topic"));
		if (params.force) args.push("--force");
		if (typeof params.number === "number") args.push("--number", String(params.number));
		addAdrRecordArgs(args, params, false);
	} else if (params.action === "create") {
		addAdrCommonArgs(args, params);
		addAdrRecordArgs(args, params, true);
	} else if (params.action === "write") {
		addAdrCommonArgs(args, params);
		if (params.topic) args.push("--topic", params.topic);
		if (params.force) args.push("--force");
		addAdrRecordArgs(args, params, true);
	} else if (params.action === "list") {
		addAdrCommonArgs(args, params);
		if (params.includeSuperseded) args.push("--include-superseded");
	} else if (params.action === "query") {
		addAdrCommonArgs(args, params);
		if (params.includeSuperseded) args.push("--include-superseded");
		args.push("--limit", String(optionalNumber(params.limit, 10)));
		args.push(requireString(params.query, "cartographer_adr query requires query"));
	} else if (params.action === "show") {
		addAdrCommonArgs(args, params);
		if (params.includeSuperseded) args.push("--include-superseded");
		args.push(requireString(params.target, "cartographer_adr show requires target"));
	} else if (params.action === "relate") {
		addAdrCommonArgs(args, params);
		args.push(
			"--from",
			requireString(params.from, "cartographer_adr relate requires from"),
			"--to",
			requireString(params.to, "cartographer_adr relate requires to"),
			"--type",
			requireString(params.relationType, "cartographer_adr relate requires relationType"),
		);
		if (params.reason) args.push("--reason", params.reason);
		addRepeated(args, "--evidence", params.evidence);
		if (params.confirm) args.push("--confirm");
	} else if (params.action === "import") {
		addAdrCommonArgs(args, params);
		args.push("--path", requireString(params.path, "cartographer_adr import requires path"));
		if (params.legacy) args.push("--legacy");
		if (params.importNote) args.push("--import-note", params.importNote);
	} else if (params.action === "validate") {
		addAdrCommonArgs(args, params);
	}
	return args;
}

export default function cartographerTools(pi: PiApi): void {
	pi.registerTool({
		name: "cartographer_index",
		label: "Cartographer Index",
		description:
			"Ensure, query, or read the Pi Cartographer SQLite project index.",
		promptSnippet: "Read or refresh the Pi Cartographer SQLite project index",
		promptGuidelines: [
			"Use cartographer_index before manual file discovery when Pi Cartographer index context is needed.",
			"Treat cartographer_index query/context results as candidates; verify high-impact hits with read and focused rg/grep before citing or editing.",
			"Use scope=code for default source retrieval, scope=plans only for explicit .plan rationale retrieval, and scope=all for intentional combined review.",
			"Use action=context or action=repo-map for compact candidate snippets and graph-ranked overviews instead of reading large raw files.",
			"Use action=search with fixed mode for safe exact lexical checks, especially patterns that could be mistaken for shell flags.",
			"Use action=log-miss only for material retrieval misses; keep records concise and do not log secrets or raw snippets.",
			"Use lifecycle states draft, accepted, planned, in-progress, implemented, superseded, and stale when reasoning about planning artifacts.",
			"Use cartographer_index with action=ensure when the index may be stale; it re-indexes only when needed.",
			"Use cartographer_index with action=read to inspect indexed file/node context instead of reading large raw graph dumps.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("ensure"),
				Type.Literal("query"),
				Type.Literal("context"),
				Type.Literal("repo-map"),
				Type.Literal("search"),
				Type.Literal("read"),
				Type.Literal("slice-jsonl"),
				Type.Literal("status"),
				Type.Literal("log-miss"),
			]),
			root: Type.Optional(
				Type.String({
					description: "Project root. Defaults to current working directory.",
				}),
			),
			topic: Type.Optional(
				Type.String({
					description: "Topic/search text for query or slice-jsonl.",
				}),
			),
			path: Type.Optional(
				Type.String({ description: "Project-relative path for read." }),
			),
			nodeId: Type.Optional(
				Type.String({ description: "Indexed node ID for read." }),
			),
			outDir: Type.Optional(
				Type.String({ description: "Output directory for slice-jsonl." }),
			),
			limit: Type.Optional(Type.Number({ description: "Result limit." })),
			maxTokens: Type.Optional(
				Type.Number({ description: "Approximate context/repo-map token budget." }),
			),
			pattern: Type.Optional(Type.String({ description: "Pattern for search action." })),
			mode: Type.Optional(
				Type.Union([Type.Literal("fixed"), Type.Literal("regex")], { description: "Search mode. Defaults to fixed." }),
			),
			paths: Type.Optional(Type.Array(Type.String(), { description: "Project-relative paths for search." })),
			context: Type.Optional(Type.Boolean({ description: "Include line snippets for search results." })),
			caseSensitive: Type.Optional(Type.Boolean({ description: "Use case-sensitive search." })),
			scope: Type.Optional(
				Type.Union([Type.Literal("code"), Type.Literal("plans"), Type.Literal("all")], {
					description: "Retrieval scope. Defaults to code.",
				}),
			),
			workflow: Type.Optional(
				Type.Union([
					Type.Literal("proposal"),
					Type.Literal("plan"),
					Type.Literal("implement"),
					Type.Literal("manual"),
				]),
			),
			originalQuery: Type.Optional(Type.String({ description: "Missed original query for log-miss." })),
			expandedQuery: Type.Optional(Type.Array(Type.String())),
			retrievalMode: Type.Optional(Type.Array(Type.String())),
			failureType: Type.Optional(
				Type.Union([
					Type.Literal("vocabulary_mismatch"),
					Type.Literal("generic_noise"),
					Type.Literal("missing_context"),
					Type.Literal("stale_artifact"),
					Type.Literal("ranking_failure"),
					Type.Literal("tool_failure"),
				]),
			),
			expectedTerm: Type.Optional(Type.Array(Type.String())),
			eventualHit: Type.Optional(Type.String()),
			resolution: Type.Optional(
				Type.Union([
					Type.Literal("query_expansion"),
					Type.Literal("path_constraint"),
					Type.Literal("manual_read"),
					Type.Literal("user_hint"),
					Type.Literal("unresolved"),
				]),
			),
			notes: Type.Optional(Type.String()),
			includeRawSlice: Type.Optional(
				Type.Boolean({
					description: "Also write map.graph.json for slice-jsonl.",
				}),
			),
			maxOutputChars: Type.Optional(
				Type.Number({ description: "Inline output budget before saving a full-output receipt." }),
			),
			outputPath: Type.Optional(Type.String({ description: "Optional full-output path for oversized output." })),
			raw: Type.Optional(Type.Boolean({ description: "Return raw command output instead of a compact receipt." })),
		}),
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as CartographerIndexParams;
			const args: string[] = [params.action];
			addRoot(args, params.root);
			if (params.action === "ensure" || params.action === "status") {
				args.push("--json");
			} else if (params.action === "query" || params.action === "context") {
				args.push(
					"--topic",
					requireString(
						params.topic,
						`cartographer_index ${params.action} requires topic`,
					),
					"--scope",
					params.scope || "code",
					"--limit",
					String(optionalNumber(params.limit, params.action === "context" ? 8 : 10)),
				);
				if (params.action === "context")
					args.push("--max-tokens", String(optionalNumber(params.maxTokens, 3000)));
				args.push("--json");
			} else if (params.action === "repo-map") {
				args.push(
					"--topic",
					requireString(params.topic, "cartographer_index repo-map requires topic"),
					"--scope",
					params.scope || "code",
					"--limit",
					String(optionalNumber(params.limit, 12)),
					"--max-tokens",
					String(optionalNumber(params.maxTokens, 1500)),
					"--json",
				);
			} else if (params.action === "search") {
				args.push(
					"--pattern",
					requireString(params.pattern, "cartographer_index search requires pattern"),
					"--mode",
					params.mode || "fixed",
					"--scope",
					params.scope || "code",
					"--limit",
					String(optionalNumber(params.limit, 50)),
					"--json",
				);
				for (const searchPath of params.paths || []) args.push("--path", searchPath);
				if (params.context) args.push("--context");
				if (params.caseSensitive) args.push("--case-sensitive");
			} else if (params.action === "read") {
				if (params.path) args.push("--path", params.path);
				else if (params.nodeId) args.push("--node-id", params.nodeId);
				else throw new Error("cartographer_index read requires path or nodeId");
				args.push(
					"--limit",
					String(optionalNumber(params.limit, 50)),
					"--json",
				);
			} else if (params.action === "slice-jsonl") {
				args.push(
					"--topic",
					requireString(
						params.topic,
						"cartographer_index slice-jsonl requires topic",
					),
					"--out-dir",
					requireString(
						params.outDir,
						"cartographer_index slice-jsonl requires outDir",
					),
					"--limit",
					String(optionalNumber(params.limit, 30)),
					"--scope",
					params.scope || "code",
				);
				if (params.includeRawSlice) args.push("--include-raw-slice");
			} else if (params.action === "log-miss") {
				args.push(
					"--workflow",
					params.workflow || "manual",
					"--original-query",
					requireString(params.originalQuery, "cartographer_index log-miss requires originalQuery"),
					"--failure-type",
					requireString(params.failureType, "cartographer_index log-miss requires failureType"),
					"--resolution",
					params.resolution || "unresolved",
					"--json",
				);
				if (params.topic) args.push("--topic", params.topic);
				for (const query of params.expandedQuery || []) args.push("--expanded-query", query);
				for (const mode of params.retrievalMode || []) args.push("--retrieval-mode", mode);
				for (const term of params.expectedTerm || []) args.push("--expected-term", term);
				if (params.eventualHit) args.push("--eventual-hit", params.eventualHit);
				if (params.notes) args.push("--notes", params.notes);
			}
			return runCommand("python", [indexScript, ...args], signal, {
				maxOutputChars: params.maxOutputChars,
				outputPath: params.outputPath,
				raw: params.raw,
				summaryMode: params.action === "query" ? "query" : undefined,
				label: `cartographer-index-${params.action}`,
			});
		},
	});

	pi.registerTool({
		name: "cartographer_evidence",
		label: "Cartographer Evidence",
		description:
			"Import or list private proposal artifacts without exposing raw contents.",
		promptSnippet:
			"Safely import private artifacts into .plan/_private/<topic>/ and write evidence manifests",
		promptGuidelines: [
			"Use cartographer_evidence before reading user-provided private logs, transcripts, errors, screenshots, exports, or documents for a proposal.",
			"Derive or confirm the proposal topic before import when possible; use inbox only for explicit pre-topic staging.",
			"Do not read or quote raw private artifact contents in the parent context; let cartographer-redactor analyze imported artifacts and write sanitized evidence docs.",
			"Facts and proposal prose should cite .plan/<topic>/evidence/ analysis docs, not .plan/_private/ raw inputs.",
		],
		parameters: Type.Object({
			action: Type.Union([Type.Literal("import"), Type.Literal("list")]),
			root: Type.Optional(
				Type.String({ description: "Project root. Defaults to current working directory." }),
			),
			topic: Type.Optional(
				Type.String({ description: "Proposal topic slug for private/evidence directories." }),
			),
			input: Type.Optional(
				Type.Array(Type.String(), { description: "Private artifact file path(s) to import." }),
			),
			move: Type.Optional(
				Type.Boolean({ description: "Move instead of copy. Tracked repo files are refused." }),
			),
			basenameMode: Type.Optional(
				Type.Union([Type.Literal("preserve"), Type.Literal("sanitize"), Type.Literal("opaque")], {
					description: "Destination basename strategy. Defaults to preserve.",
				}),
			),
			hash: Type.Optional(
				Type.Boolean({ description: "Opt-in sha256 recording in the private manifest only." }),
			),
			inbox: Type.Optional(
				Type.Boolean({ description: "Use temporary .plan/_private/_inbox/<id>/ staging." }),
			),
			inboxId: Type.Optional(Type.String({ description: "Inbox id when inbox is true." })),
			sensitivity: Type.Optional(
				Type.Union([Type.Literal("unknown"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
			),
			limit: Type.Optional(Type.Number({ description: "Record limit for list." })),
			maxOutputChars: Type.Optional(
				Type.Number({ description: "Inline output budget before saving a full-output receipt." }),
			),
			outputPath: Type.Optional(Type.String({ description: "Optional full-output path for oversized output." })),
			raw: Type.Optional(Type.Boolean({ description: "Return raw command output instead of a compact receipt." })),
		}),
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as CartographerEvidenceParams;
			const args: string[] = [params.action];
			addRoot(args, params.root);
			if (params.action === "import") {
				if (!params.inbox)
					args.push("--topic", requireString(params.topic, "cartographer_evidence import requires topic unless inbox is true"));
				for (const input of params.input || []) args.push("--input", input);
				if (!params.input || params.input.length === 0)
					throw new Error("cartographer_evidence import requires at least one input");
				if (params.move) args.push("--move");
				args.push("--basename-mode", params.basenameMode || "preserve");
				if (params.hash) args.push("--hash");
				if (params.inbox) args.push("--inbox");
				if (params.inboxId) args.push("--inbox-id", params.inboxId);
				if (params.sensitivity) args.push("--sensitivity", params.sensitivity);
			} else if (params.action === "list") {
				args.push("--topic", requireString(params.topic, "cartographer_evidence list requires topic"));
				args.push("--limit", String(optionalNumber(params.limit, 20)));
			}
			args.push("--json");
			return runCommand("python", [evidenceScript, ...args], signal, {
				maxOutputChars: params.maxOutputChars,
				outputPath: params.outputPath,
				raw: params.raw,
				label: `cartographer-evidence-${params.action}`,
			});
		},
	});

	pi.registerTool({
		name: "cartographer_session",
		label: "Cartographer Session",
		description: "Analyze authorized Pi session JSONL into compact reports.",
		promptSnippet: "Summarize authorized Pi session JSONL without exposing raw transcript contents",
		promptGuidelines: [
			"Use cartographer_session only for authorized Pi session JSONL files.",
			"For private sessions, import or stage them through cartographer_evidence/private_artifacts first and write sanitized reports under .plan/<topic>/evidence/.",
			"Do not paste raw transcript contents into prompts; cite the generated report path and compact receipt instead.",
		],
		parameters: Type.Object({
			action: Type.Literal("analyze"),
			input: Type.Optional(Type.String({ description: "Authorized input Pi session JSONL file." })),
			out: Type.Optional(Type.String({ description: "Markdown report output path." })),
			jsonOut: Type.Optional(Type.String({ description: "Optional JSON summary output path." })),
			maxOutputChars: Type.Optional(
				Type.Number({ description: "Inline output budget before saving a full-output receipt." }),
			),
			outputPath: Type.Optional(Type.String({ description: "Optional full-output path for oversized output." })),
			raw: Type.Optional(Type.Boolean({ description: "Return raw command output instead of a compact receipt." })),
		}),
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as CartographerSessionParams;
			const args = [
				"--input",
				requireString(params.input, "cartographer_session analyze requires input"),
				"--out",
				requireString(params.out, "cartographer_session analyze requires out"),
				"--max-output-chars",
				String(optionalNumber(params.maxOutputChars, 8000)),
				"--json",
			];
			if (params.jsonOut) args.push("--json-out", params.jsonOut);
			return runCommand("python", [sessionScript, ...args], signal, {
				maxOutputChars: params.maxOutputChars,
				outputPath: params.outputPath,
				raw: params.raw,
				label: "cartographer-session-analyze",
			});
		},
	});

	pi.registerTool({
		name: "cartographer_adr",
		label: "Cartographer ADR",
		description: "Create, validate, search, and relate Architecture Decision Records.",
		promptSnippet: "Manage durable ADRs with safe workflow, manual, and legacy-import modes",
		promptGuidelines: [
			"Use cartographer_adr for ADR-specific evaluation, drafting, creation, lookup, relationships, import, and validation.",
			"Use workflow mode with topic only when proposal metadata and validation receipts support adr_required; otherwise use evaluate/draft before writing.",
			"Use standalone/manual create or write for user-directed ADRs that do not belong to a .plan topic, but still provide context, decision, options or rationale, domains, and keywords.",
			"Use import with legacy=true and an import note only for accepted legacy ADRs that intentionally lack validation receipts.",
			"Do not place raw .plan/_private paths or sensitive evidence in ADR Markdown or graph metadata; cite sanitized evidence docs or receipt ids instead.",
			"Keep cartographer_jsonl as the low-level JSONL utility; do not use it for normal ADR management when cartographer_adr can express the operation.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("evaluate"),
				Type.Literal("draft"),
				Type.Literal("create"),
				Type.Literal("write"),
				Type.Literal("list"),
				Type.Literal("query"),
				Type.Literal("show"),
				Type.Literal("relate"),
				Type.Literal("import"),
				Type.Literal("validate"),
			]),
			root: Type.Optional(Type.String({ description: "Project root. Defaults to current working directory." })),
			adrDir: Type.Optional(Type.String({ description: "Explicit ADR directory path relative to root." })),
			topic: Type.Optional(Type.String({ description: "Cartographer topic under .plan/ for workflow ADRs." })),
			request: Type.Optional(Type.String({ description: "User request/proposal text for evaluate." })),
			force: Type.Optional(Type.Boolean({ description: "Override ADR-required gate for draft/write." })),
			number: Type.Optional(Type.Number({ description: "Draft ADR number preview." })),
			title: Type.Optional(Type.String({ description: "ADR title." })),
			decision: Type.Optional(Type.String({ description: "Plain decision statement." })),
			context: Type.Optional(Type.String({ description: "Decision context/problem statement." })),
			options: Type.Optional(Type.Array(Type.String(), { description: "Considered options." })),
			rationale: Type.Optional(Type.String({ description: "Why this decision was made." })),
			consequences: Type.Optional(Type.Array(Type.String(), { description: "Decision consequences." })),
			usage: Type.Optional(Type.String({ description: "How future work should use this decision." })),
			validation: Type.Optional(Type.String({ description: "Validation/evidence summary." })),
			domains: Type.Optional(Type.Array(Type.String(), { description: "Search domains." })),
			keywords: Type.Optional(Type.Array(Type.String(), { description: "Search keywords." })),
			status: Type.Optional(
				Type.Union([
					Type.Literal("accepted"),
					Type.Literal("accepted-legacy"),
					Type.Literal("draft"),
					Type.Literal("proposed"),
					Type.Literal("rejected"),
					Type.Literal("superseded"),
				]),
			),
			decisionDate: Type.Optional(Type.String({ description: "Decision date YYYY-MM-DD." })),
			decisionKind: Type.Optional(Type.String({ description: "Decision kind metadata." })),
			confidence: Type.Optional(Type.String({ description: "Decision confidence metadata." })),
			sourceCommits: Type.Optional(Type.Array(Type.String(), { description: "Source commits." })),
			validationReceipts: Type.Optional(Type.Array(Type.String(), { description: "Validation receipt ids." })),
			includeSuperseded: Type.Optional(Type.Boolean({ description: "Include superseded/non-current ADRs." })),
			limit: Type.Optional(Type.Number({ description: "Query result limit." })),
			query: Type.Optional(Type.String({ description: "Search text for query." })),
			target: Type.Optional(Type.String({ description: "ADR id/node id/number/path for show." })),
			from: Type.Optional(Type.String({ description: "Source ADR graph node id for relate." })),
			to: Type.Optional(Type.String({ description: "Target ADR graph node id for relate." })),
			relationType: Type.Optional(
				Type.Union([
					Type.Literal("child_of"),
					Type.Literal("conflicts_with"),
					Type.Literal("depends_on"),
					Type.Literal("precursor_to"),
					Type.Literal("related_to"),
					Type.Literal("supersedes"),
				]),
			),
			reason: Type.Optional(Type.String({ description: "Relationship rationale." })),
			evidence: Type.Optional(Type.Array(Type.String(), { description: "Relationship evidence path/id." })),
			confirm: Type.Optional(Type.Boolean({ description: "Confirm supersedes/conflicts_with writes." })),
			path: Type.Optional(Type.String({ description: "Repo-relative ADR Markdown path for import." })),
			legacy: Type.Optional(Type.Boolean({ description: "Mark imported ADR as legacy." })),
			importNote: Type.Optional(Type.String({ description: "Required note for receiptless legacy import." })),
			maxOutputChars: Type.Optional(
				Type.Number({ description: "Inline output budget before saving a full-output receipt." }),
			),
			outputPath: Type.Optional(Type.String({ description: "Optional full-output path for oversized output." })),
			raw: Type.Optional(Type.Boolean({ description: "Return raw command output instead of a compact receipt." })),
		}),
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as CartographerAdrParams;
			const args = buildAdrArgs(params);
			return runCommand("python", [adrScript, ...args], signal, {
				maxOutputChars: params.maxOutputChars,
				outputPath: params.outputPath,
				raw: params.raw,
				label: `cartographer-adr-${params.action}`,
			});
		},
	});

	pi.registerTool({
		name: "cartographer_jsonl",
		label: "Cartographer JSONL",
		description:
			"Validate, list, or upsert Pi Cartographer JSONL graph artifacts.",
		promptSnippet:
			"Validate, list, or update Pi Cartographer JSONL graph artifacts",
		promptGuidelines: [
			"Use cartographer_jsonl to validate map/fact/plan JSONL instead of writing ad-hoc validation scripts.",
			"Use cartographer_jsonl validate-misses/list-misses for .plan/_retrieval/misses.jsonl records.",
			"Use cartographer_jsonl upsert to add or update individual JSONL nodes, edges, or miss records safely.",
			"Treat lifecycle and candidate-only warnings as review prompts even when validation succeeds.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("validate-topic"),
				Type.Literal("validate-file"),
				Type.Literal("validate-misses"),
				Type.Literal("list-misses"),
				Type.Literal("list"),
				Type.Literal("upsert"),
				Type.Literal("seed-pi-facts"),
			]),
			root: Type.Optional(
				Type.String({ description: "Project root for validate-topic, validate-misses, or list-misses." }),
			),
			topic: Type.Optional(
				Type.String({
					description: "Topic directory name for validate-topic.",
				}),
			),
			file: Type.Optional(
				Type.String({
					description: "JSONL file path for validate-file, list, or upsert.",
				}),
			),
			record: Type.Optional(
				Type.Any({ description: "JSON object to upsert." }),
			),
			key: Type.Optional(
				Type.Array(Type.String(), {
					description: "Key fields for upsert matching.",
				}),
			),
			limit: Type.Optional(
				Type.Number({ description: "Record limit for list." }),
			),
			requireId: Type.Optional(
				Type.Boolean({ description: "Require id fields for validate-file." }),
			),
			merge: Type.Optional(
				Type.Boolean({
					description: "Merge with existing record on upsert. Defaults true.",
				}),
			),
			maxOutputChars: Type.Optional(
				Type.Number({ description: "Inline output budget before saving a full-output receipt." }),
			),
			outputPath: Type.Optional(Type.String({ description: "Optional full-output path for oversized output." })),
			raw: Type.Optional(Type.Boolean({ description: "Return raw command output instead of a compact receipt." })),
		}),
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as CartographerJsonlParams;
			const args: string[] = [params.action];
			if (params.action === "validate-topic") {
				addRoot(args, params.root);
				args.push(
					"--topic",
					requireString(
						params.topic,
						"cartographer_jsonl validate-topic requires topic",
					),
					"--json",
				);
			} else if (params.action === "validate-file") {
				args.push(
					"--file",
					requireString(
						params.file,
						"cartographer_jsonl validate-file requires file",
					),
					"--json",
				);
				if (params.requireId) args.push("--require-id");
			} else if (params.action === "validate-misses") {
				addRoot(args, params.root);
				args.push("--json");
			} else if (params.action === "list-misses") {
				addRoot(args, params.root);
				args.push("--limit", String(optionalNumber(params.limit, 20)), "--json");
			} else if (params.action === "list") {
				args.push(
					"--file",
					requireString(params.file, "cartographer_jsonl list requires file"),
					"--limit",
					String(optionalNumber(params.limit, 20)),
					"--json",
				);
			} else if (params.action === "upsert") {
				if (params.record === undefined)
					throw new Error("cartographer_jsonl upsert requires record");
				args.push(
					"--file",
					requireString(params.file, "cartographer_jsonl upsert requires file"),
					"--record",
					JSON.stringify(params.record),
					"--json",
				);
				for (const key of params.key || []) args.push("--key", key);
				if (params.merge === false) args.push("--no-merge");
			} else if (params.action === "seed-pi-facts") {
				addRoot(args, params.root);
				args.push(
					"--topic",
					requireString(
						params.topic,
						"cartographer_jsonl seed-pi-facts requires topic",
					),
					"--json",
				);
			}
			return runCommand(
				"node",
				["--experimental-strip-types", jsonlScript, ...args],
				signal,
				{
					maxOutputChars: params.maxOutputChars,
					outputPath: params.outputPath,
					raw: params.raw,
					label: `cartographer-jsonl-${params.action}`,
				},
			);
		},
	});
}
