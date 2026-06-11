import fs from "node:fs";
import path from "node:path";
import { apiFailure, apiSuccess } from "../shared/api.js";
import type { DocumentKind, LiveReloadStatus } from "../shared/models.js";
import {
	discoverTopics,
	readAdrCollection,
	readEvidence,
	readHealth,
	readIndexManifest,
	readOverview,
	readSafeFile,
	readTopicArtifacts,
	readTopicDocument,
	readTopicDocuments,
	readTopicGraph,
} from "./artifact-reader.js";
import { createLiveReloadService, createLiveReloadStream, type LiveReloadService } from "./live-reload.js";
import { PathSafetyError } from "./safety.js";

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
	{ method: "GET", path: "/api/events", description: "Server-sent live reload stream for safe planning changes" },
	{ method: "GET", path: "/api/events/status", description: "Live reload connection/watch status metadata" },
];

export function dashboardRoot(): string {
	if (process.env.CARTOGRAPHER_DASHBOARD_ROOT) return process.env.CARTOGRAPHER_DASHBOARD_ROOT;
	const cwd = process.cwd();
	const parent = path.dirname(cwd);
	if (path.basename(cwd) === "dashboard" && fs.existsSync(path.join(parent, ".plan"))) return parent;
	return cwd;
}

function nodeErrorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}

function statusForError(error: unknown): number {
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

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"cache-control": "no-store",
			"content-type": "application/json; charset=utf-8",
		},
	});
}

export async function routeJson<T>(load: () => Promise<T>): Promise<Response> {
	try {
		return jsonResponse(apiSuccess(await load()));
	} catch (error) {
		return jsonResponse(
			apiFailure({ code: codeForError(error), message: messageForError(error) }),
			statusForError(error),
		);
	}
}

export function missingPathResponse(): Response {
	return jsonResponse(apiFailure({ code: "missing-path", message: "Query parameter path is required" }), 400);
}

export function unsupportedDocumentKindResponse(kind: string): Response {
	return jsonResponse(apiFailure({ code: "not-found", message: `Unsupported document kind: ${kind}` }), 404);
}

export function supportedTopicDocumentKind(kind: string): kind is Extract<DocumentKind, "proposal" | "plan"> {
	return kind === "proposal" || kind === "plan";
}

export const dashboardLoaders = {
	health: () => readHealth(dashboardRoot()),
	overview: () => readOverview(dashboardRoot()),
	topics: () => discoverTopics(dashboardRoot()),
	topic: (topic: string) => readTopicArtifacts(dashboardRoot(), topic),
	topicDocuments: (topic: string) => readTopicDocuments(dashboardRoot(), topic),
	topicDocument: (topic: string, kind: Extract<DocumentKind, "proposal" | "plan">) =>
		readTopicDocument(dashboardRoot(), topic, kind),
	topicGraph: (topic: string) => readTopicGraph(dashboardRoot(), topic),
	evidence: (topic: string) => readEvidence(dashboardRoot(), topic),
	file: (requestedPath: string) => readSafeFile(dashboardRoot(), requestedPath),
	adrs: () => readAdrCollection(dashboardRoot()),
	index: () => readIndexManifest(dashboardRoot()),
};

export function notFoundError(requestedPath: string, message: string): PathSafetyError {
	return new PathSafetyError({
		code: "not-a-file",
		message,
		root: dashboardRoot(),
		requestedPath,
	});
}

export async function readAdrById(id: string) {
	const collection = await dashboardLoaders.adrs();
	const adr = collection.adrs.find((item) => item.id === id || item.adrId === id);
	if (!adr) {
		throw notFoundError(id, `ADR not found: ${id}`);
	}
	return adr;
}

const LIVE_RELOAD_DEFAULTS: LiveReloadStatus = {
	enabled: false,
	state: "manual-refresh",
	root: undefined,
	debounceMs: 75,
	heartbeatMs: 15_000,
	ignored: [".plan/_private/**"],
	indexEvents: "summarized-as-stale-index",
};

let liveReloadServicePromise: Promise<LiveReloadService> | undefined;

function startLiveReloadService(): Promise<LiveReloadService> {
	const root = dashboardRoot();
	const servicePromise = createLiveReloadService({ root }).then(async (service) => {
		await service.start();
		return service;
	});
	servicePromise.catch(() => {
		liveReloadServicePromise = undefined;
	});
	return servicePromise;
}

function getLiveReloadService(): Promise<LiveReloadService> {
	if (!liveReloadServicePromise) liveReloadServicePromise = startLiveReloadService();
	return liveReloadServicePromise;
}

export async function liveReloadStatus(): Promise<LiveReloadStatus> {
	try {
		const service = await getLiveReloadService();
		return service.status();
	} catch {
		return LIVE_RELOAD_DEFAULTS;
	}
}

export async function liveReloadStreamResponse(): Promise<Response> {
	let service: LiveReloadService | undefined;
	try {
		service = await getLiveReloadService();
	} catch {
		service = undefined;
	}
	return new Response(createLiveReloadStream(service), {
		headers: {
			"cache-control": "no-store",
			connection: "keep-alive",
			"content-type": "text/event-stream; charset=utf-8",
			"x-accel-buffering": "no",
		},
	});
}
