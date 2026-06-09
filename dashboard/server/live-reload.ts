import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { Hono } from "hono";
import { apiSuccess } from "../shared/api.js";
import type { LiveReloadEvent, LiveReloadStatus } from "../shared/models.js";
import { canonicalizeRoot } from "./safety.js";

export type ChokidarEventName = "add" | "addDir" | "change" | "unlink" | "unlinkDir";

export type LiveReloadServiceOptions = {
	root: string;
	debounceMs?: number;
	heartbeatMs?: number;
	watch?: boolean;
};

export type LiveReloadService = {
	readonly root: string;
	readonly debounceMs: number;
	readonly heartbeatMs: number;
	start: () => Promise<void>;
	close: () => Promise<void>;
	status: () => LiveReloadStatus;
	subscribe: (listener: (event: LiveReloadEvent) => void) => () => void;
	publishForTest: (eventName: ChokidarEventName, filePath: string) => void;
};

type NormalizedWatchPath = {
	resource: "topic" | "global" | "index";
	topic?: string;
	path?: string;
};

type PendingEvent = {
	resource: "topic" | "global" | "index";
	topic?: string;
	paths: Set<string>;
	events: Set<ChokidarEventName>;
};

const DEFAULT_DEBOUNCE_MS = 75;
const DEFAULT_HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

function isInsideRoot(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toPosixPath(value: string): string {
	return value.split(path.sep).join("/");
}

function relativeSegments(relativePath: string): string[] {
	return relativePath.split(/[\\/]+/).filter(Boolean);
}

function isPrivatePlanRelativePath(relativePath: string): boolean {
	const segments = relativeSegments(relativePath);
	return segments[0] === ".plan" && segments[1] === "_private";
}

function isIndexPlanRelativePath(relativePath: string): boolean {
	const segments = relativeSegments(relativePath);
	return segments[0] === ".plan" && segments[1] === "_index";
}

export function shouldIgnorePlanWatchPath(root: string, candidatePath: string): boolean {
	const absolutePath = path.resolve(candidatePath);
	if (!isInsideRoot(root, absolutePath)) return true;
	const relativePath = toPosixPath(path.relative(root, absolutePath));
	return isPrivatePlanRelativePath(relativePath);
}

function normalizeWatchPath(root: string, candidatePath: string): NormalizedWatchPath | undefined {
	const absolutePath = path.resolve(candidatePath);
	if (!isInsideRoot(root, absolutePath)) return undefined;
	const relativePath = toPosixPath(path.relative(root, absolutePath));
	const segments = relativeSegments(relativePath);
	if (segments[0] !== ".plan") return undefined;
	if (isPrivatePlanRelativePath(relativePath)) return undefined;
	if (isIndexPlanRelativePath(relativePath)) return { resource: "index" };
	const maybeTopic = segments[1];
	if (maybeTopic && !maybeTopic.startsWith("_")) {
		return { resource: "topic", topic: maybeTopic, path: relativePath };
	}
	return { resource: "global", path: relativePath };
}

function pendingKey(normalized: NormalizedWatchPath): string {
	if (normalized.resource === "topic") return `topic:${normalized.topic ?? "unknown"}`;
	return normalized.resource;
}

function eventTypeFor(resource: PendingEvent["resource"]): LiveReloadEvent["type"] {
	return resource === "index" ? "index-stale" : "planning-artifacts-changed";
}

function statusForState(
	root: string,
	state: LiveReloadStatus["state"],
	options: LiveReloadServiceOptions,
): LiveReloadStatus {
	return {
		enabled: options.watch !== false,
		state,
		root,
		debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
		heartbeatMs: options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
		ignored: [".plan/_private/**"],
		indexEvents: "summarized-as-stale-index",
	};
}

export async function createLiveReloadService(options: LiveReloadServiceOptions): Promise<LiveReloadService> {
	const root = await canonicalizeRoot(options.root);
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
	const listeners = new Set<(event: LiveReloadEvent) => void>();
	const pending = new Map<string, PendingEvent>();
	let watcher: FSWatcher | undefined;
	let state: LiveReloadStatus["state"] = options.watch === false ? "manual-refresh" : "idle";
	let flushTimer: NodeJS.Timeout | undefined;
	let sequence = 0;

	const publish = (event: LiveReloadEvent): void => {
		for (const listener of listeners) listener(event);
	};

	const flush = (): void => {
		flushTimer = undefined;
		const changedAt = new Date().toISOString();
		for (const event of pending.values()) {
			sequence += 1;
			publish({
				id: `reload:${sequence}`,
				type: eventTypeFor(event.resource),
				resource: event.resource,
				topic: event.topic,
				paths: [...event.paths].sort(),
				events: [...event.events].sort(),
				changedAt,
			});
		}
		pending.clear();
	};

	const schedule = (): void => {
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = setTimeout(flush, debounceMs);
	};

	const handleRawEvent = (eventName: ChokidarEventName, filePath: string): void => {
		const normalized = normalizeWatchPath(root, filePath);
		if (!normalized) return;
		const key = pendingKey(normalized);
		const event =
			pending.get(key) ??
			({
				resource: normalized.resource,
				topic: normalized.topic,
				paths: new Set<string>(),
				events: new Set<ChokidarEventName>(),
			} satisfies PendingEvent);
		if (normalized.path) event.paths.add(normalized.path);
		event.events.add(eventName);
		pending.set(key, event);
		schedule();
	};

	return {
		root,
		debounceMs,
		heartbeatMs,
		start: async (): Promise<void> => {
			if (options.watch === false || watcher) return;
			const planDir = path.join(root, ".plan");
			watcher = chokidar.watch(planDir, {
				ignoreInitial: true,
				persistent: true,
				atomic: true,
				awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
				ignored: (candidatePath) => shouldIgnorePlanWatchPath(root, candidatePath),
			});
			watcher.on("all", (eventName, filePath) => handleRawEvent(eventName as ChokidarEventName, filePath));
			watcher.on("error", () => {
				state = "unavailable";
			});
			await new Promise<void>((resolve) => watcher?.once("ready", resolve));
			state = "watching";
		},
		close: async (): Promise<void> => {
			if (flushTimer) clearTimeout(flushTimer);
			flushTimer = undefined;
			pending.clear();
			if (watcher) await watcher.close();
			watcher = undefined;
			state = "closed";
		},
		status: (): LiveReloadStatus => statusForState(root, state, { ...options, debounceMs, heartbeatMs }),
		subscribe: (listener): (() => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		publishForTest: handleRawEvent,
	};
}

function sseMessage(event: string, data: unknown, id?: string): Uint8Array {
	const idLine = id ? `id: ${id}\n` : "";
	return encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createLiveReloadStream(service?: LiveReloadService): ReadableStream<Uint8Array> {
	let cleanup = (): void => undefined;
	return new ReadableStream<Uint8Array>({
		start(controller): void {
			const status: LiveReloadStatus = service
				? service.status()
				: {
						enabled: false,
						state: "manual-refresh",
						root: undefined,
						debounceMs: DEFAULT_DEBOUNCE_MS,
						heartbeatMs: DEFAULT_HEARTBEAT_MS,
						ignored: [".plan/_private/**"],
						indexEvents: "summarized-as-stale-index",
					};
			controller.enqueue(sseMessage("status", status));
			const unsubscribe = service?.subscribe((event) => controller.enqueue(sseMessage("reload", event, event.id)));
			const heartbeat = setInterval(() => {
				controller.enqueue(
					sseMessage("heartbeat", { status: service?.status() ?? status, changedAt: new Date().toISOString() }),
				);
			}, service?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
			cleanup = (): void => {
				clearInterval(heartbeat);
				unsubscribe?.();
			};
		},
		cancel(): void {
			cleanup();
		},
	});
}

export function registerLiveReloadRoutes(app: Hono, service?: LiveReloadService): void {
	app.get(
		"/api/events",
		() =>
			new Response(createLiveReloadStream(service), {
				headers: {
					"cache-control": "no-store",
					connection: "keep-alive",
					"content-type": "text/event-stream; charset=utf-8",
					"x-accel-buffering": "no",
				},
			}),
	);
	app.get("/api/events/status", (context) =>
		context.json(
			apiSuccess(
				service?.status() ??
					({
						enabled: false,
						state: "manual-refresh",
						root: undefined,
						debounceMs: DEFAULT_DEBOUNCE_MS,
						heartbeatMs: DEFAULT_HEARTBEAT_MS,
						ignored: [".plan/_private/**"],
						indexEvents: "summarized-as-stale-index",
					} satisfies LiveReloadStatus),
			),
		),
	);
}
