import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { apiFailure, apiSuccess } from "../shared/api.js";
import type { DocumentKind } from "../shared/models.js";
import {
	discoverTopics,
	readAdrCollection,
	readHealth,
	readIndexManifest,
	readOverview,
	readSafeFile,
	readEvidence,
	readTopicArtifacts,
	readTopicDocument,
	readTopicDocuments,
	readTopicGraph,
} from "./artifact-reader.js";
import { PathSafetyError } from "./safety.js";

export type DashboardAppOptions = {
	root?: string;
};

export type ReadOnlyRouteDefinition = {
	method: "GET";
	path: string;
	description: string;
};

export const READ_ONLY_ROUTES: ReadOnlyRouteDefinition[] = [
	{ method: "GET", path: "/api/health", description: "Dashboard artifact health diagnostics" },
	{ method: "GET", path: "/api/overview", description: "Topic, index, ADR, and health overview" },
	{ method: "GET", path: "/api/topics", description: "Discovered planning topics" },
	{ method: "GET", path: "/api/topics/:topic", description: "Normalized topic artifact bundle" },
	{ method: "GET", path: "/api/topics/:topic/docs", description: "Proposal and plan documents" },
	{ method: "GET", path: "/api/topics/:topic/docs/:kind", description: "Single proposal or plan document" },
	{ method: "GET", path: "/api/topics/:topic/graph", description: "Map/fact/plan graph records" },
	{ method: "GET", path: "/api/topics/:topic/evidence", description: "Sanitized evidence manifest and file list" },
	{ method: "GET", path: "/api/files", description: "Safe read-only file content by relative path query" },
	{ method: "GET", path: "/api/adrs", description: "ADR Markdown and graph records" },
	{ method: "GET", path: "/api/adrs/:id", description: "Single ADR by graph id or ADR id" },
	{ method: "GET", path: "/api/index", description: "Project index manifest summary" },
];

function nodeErrorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}

function statusForError(error: unknown): ContentfulStatusCode {
	if (error instanceof PathSafetyError) {
		if (error.code === "private-path" || error.code === "outside-root") return 403;
		if (error.code === "not-a-file") return 400;
		return 500;
	}
	if (nodeErrorCode(error) === "ENOENT") return 404;
	return 500;
}

function codeForError(error: unknown): string {
	if (error instanceof PathSafetyError) return error.code;
	if (nodeErrorCode(error) === "ENOENT") return "not-found";
	return "internal-error";
}

function messageForError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function routeJson<T>(context: Context, load: () => Promise<T>): Promise<Response> {
	try {
		const data = await load();
		return context.json(apiSuccess(data));
	} catch (error) {
		return context.json(
			apiFailure({ code: codeForError(error), message: messageForError(error) }),
			statusForError(error),
		);
	}
}

function supportedTopicDocumentKind(kind: string): kind is Extract<DocumentKind, "proposal" | "plan"> {
	return kind === "proposal" || kind === "plan";
}

export function createDashboardApp(options: DashboardAppOptions = {}): Hono {
	const root = options.root ?? process.cwd();
	const app = new Hono();

	app.get("/api/health", (context) => routeJson(context, () => readHealth(root)));
	app.get("/api/overview", (context) => routeJson(context, () => readOverview(root)));
	app.get("/api/topics", (context) => routeJson(context, () => discoverTopics(root)));
	app.get("/api/topics/:topic", (context) =>
		routeJson(context, () => readTopicArtifacts(root, context.req.param("topic"))),
	);
	app.get("/api/topics/:topic/docs", (context) =>
		routeJson(context, () => readTopicDocuments(root, context.req.param("topic"))),
	);
	app.get("/api/topics/:topic/docs/:kind", (context) => {
		const kind = context.req.param("kind");
		if (!supportedTopicDocumentKind(kind)) {
			return context.json(apiFailure({ code: "not-found", message: `Unsupported document kind: ${kind}` }), 404);
		}
		return routeJson(context, async () => {
			const result = await readTopicDocument(root, context.req.param("topic"), kind);
			if (!result.document) {
				throw new PathSafetyError({
					code: "not-a-file",
					message: `${kind} document not found`,
					root,
					requestedPath: kind,
				});
			}
			return result.document;
		});
	});
	app.get("/api/topics/:topic/graph", (context) =>
		routeJson(context, () => readTopicGraph(root, context.req.param("topic"))),
	);
	app.get("/api/topics/:topic/evidence", (context) =>
		routeJson(context, () => readEvidence(root, context.req.param("topic"))),
	);
	app.get("/api/files", (context) => {
		const requestedPath = context.req.query("path");
		if (!requestedPath) {
			return context.json(apiFailure({ code: "missing-path", message: "Query parameter path is required" }), 400);
		}
		return routeJson(context, () => readSafeFile(root, requestedPath));
	});
	app.get("/api/adrs", (context) => routeJson(context, () => readAdrCollection(root)));
	app.get("/api/adrs/:id", (context) =>
		routeJson(context, async () => {
			const collection = await readAdrCollection(root);
			const id = context.req.param("id");
			const adr = collection.adrs.find((item) => item.id === id || item.adrId === id);
			if (!adr) {
				throw new PathSafetyError({
					code: "not-a-file",
					message: `ADR not found: ${id}`,
					root,
					requestedPath: id,
				});
			}
			return adr;
		}),
	);
	app.get("/api/index", (context) => routeJson(context, () => readIndexManifest(root)));

	return app;
}
