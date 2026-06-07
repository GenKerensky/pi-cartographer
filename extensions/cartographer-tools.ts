import { execFile } from "node:child_process";
import type { ExecFileException } from "node:child_process";
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

type CartographerIndexParams = {
	action: "ensure" | "query" | "read" | "slice-jsonl" | "status";
	root?: string;
	topic?: string;
	path?: string;
	nodeId?: string;
	outDir?: string;
	limit?: number;
	includeRawSlice?: boolean;
};

type CartographerJsonlParams = {
	action:
		| "validate-topic"
		| "validate-file"
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

function isExecFileException(error: unknown): error is ExecFileException & {
	stdout?: string;
	stderr?: string;
} {
	return typeof error === "object" && error !== null;
}

async function runCommand(
	command: string,
	args: string[],
	signal?: AbortSignal,
): Promise<ToolResult> {
	try {
		const result = await execFileAsync(command, args, {
			cwd: process.cwd(),
			signal,
			maxBuffer: 10 * 1024 * 1024,
		});
		return {
			content: [
				{ type: "text", text: result.stdout || result.stderr || "OK\n" },
			],
			details: { stdout: result.stdout, stderr: result.stderr, exitCode: 0 },
		};
	} catch (error: unknown) {
		const stdout =
			isExecFileException(error) && error.stdout ? error.stdout : "";
		const stderr =
			isExecFileException(error) && error.stderr ? error.stderr : String(error);
		const exitCode = isExecFileException(error) && error.code ? error.code : 1;
		return {
			content: [{ type: "text", text: stdout + stderr || String(error) }],
			details: { stdout, stderr, exitCode },
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

export default function cartographerTools(pi: PiApi): void {
	pi.registerTool({
		name: "cartographer_index",
		label: "Cartographer Index",
		description:
			"Ensure, query, or read the Pi Cartographer SQLite project index.",
		promptSnippet: "Read or refresh the Pi Cartographer SQLite project index",
		promptGuidelines: [
			"Use cartographer_index before manual file discovery when Pi Cartographer index context is needed.",
			"Treat cartographer_index query results as candidates; verify high-impact hits with read and focused rg/grep before citing or editing.",
			"Use code/plans/all retrieval scopes as the documented contract: code is default source retrieval, plans is explicit .plan rationale retrieval, all is intentional combined retrieval.",
			"Use lifecycle states draft, accepted, planned, in-progress, implemented, superseded, and stale when reasoning about planning artifacts.",
			"When retrieval materially misses, record concise miss evidence for .plan/_retrieval/misses.jsonl with failure_type, original_query, eventual_hit, and resolution when tooling supports it.",
			"Use cartographer_index with action=ensure when the index may be stale; it re-indexes only when needed.",
			"Use cartographer_index with action=read to inspect indexed file/node context instead of reading large raw graph dumps.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("ensure"),
				Type.Literal("query"),
				Type.Literal("read"),
				Type.Literal("slice-jsonl"),
				Type.Literal("status"),
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
			includeRawSlice: Type.Optional(
				Type.Boolean({
					description: "Also write map.graph.json for slice-jsonl.",
				}),
			),
		}),
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as CartographerIndexParams;
			const args: string[] = [params.action];
			addRoot(args, params.root);
			if (params.action === "ensure" || params.action === "status") {
				args.push("--json");
			} else if (params.action === "query") {
				args.push(
					"--topic",
					requireString(
						params.topic,
						"cartographer_index query requires topic",
					),
					"--limit",
					String(optionalNumber(params.limit, 10)),
					"--json",
				);
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
				);
				if (params.includeRawSlice) args.push("--include-raw-slice");
			}
			return runCommand("python", [indexScript, ...args], signal);
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
			"Use cartographer_jsonl upsert to add or update individual JSONL nodes or edges safely.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("validate-topic"),
				Type.Literal("validate-file"),
				Type.Literal("list"),
				Type.Literal("upsert"),
				Type.Literal("seed-pi-facts"),
			]),
			root: Type.Optional(
				Type.String({ description: "Project root for validate-topic." }),
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
			);
		},
	});
}
