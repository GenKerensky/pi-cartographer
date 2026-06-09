import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import { createDashboardApp } from "./app.js";
import { createLiveReloadService, type LiveReloadService } from "./live-reload.js";
import { canonicalizeRoot } from "./safety.js";

export const DASHBOARD_MODE = "read-only" as const;
export const DEFAULT_DASHBOARD_HOST = "127.0.0.1";
export const DEFAULT_DASHBOARD_PORT = 0;

export type DashboardRuntimeErrorCode =
	| "already-running"
	| "invalid-port"
	| "metadata-error"
	| "missing-root"
	| "non-loopback-host"
	| "stop-timeout"
	| "unsafe-pid";

export class DashboardRuntimeError extends Error {
	readonly code: DashboardRuntimeErrorCode;
	readonly details?: Record<string, unknown>;

	constructor(code: DashboardRuntimeErrorCode, message: string, details?: Record<string, unknown>) {
		super(message);
		this.name = "DashboardRuntimeError";
		this.code = code;
		this.details = details;
	}
}

export type DashboardServerMetadata = {
	pid: number;
	root: string;
	rootHash: string;
	host: string;
	port: number;
	url: string;
	mode: typeof DASHBOARD_MODE;
	startedAt: string;
	metadataPath: string;
	topic?: string;
	topicUrl?: string;
	processStartToken?: string;
};

export type DashboardMetadataLocation = {
	root: string;
	rootHash: string;
	metadataDir: string;
	metadataPath: string;
};

export type StartDashboardServerOptions = {
	root?: string;
	host?: string;
	port?: number;
	topic?: string;
	runtimeDir?: string;
	installSignalHandlers?: boolean;
};

export type DashboardServerHandle = {
	app: Hono;
	metadata: DashboardServerMetadata;
	server: ServerType;
	liveReload: LiveReloadService;
	stop: () => Promise<DashboardStopResult>;
};

export type DashboardRunningStatus = DashboardServerMetadata & {
	status: "running";
	running: true;
};

export type DashboardStoppedStatus = {
	status: "stopped";
	running: false;
	root: string;
	rootHash: string;
	metadataPath: string;
	stalePid?: number;
	message?: string;
};

export type DashboardStatusResult = DashboardRunningStatus | DashboardStoppedStatus;

export type DashboardStopResult = {
	status: "stopped" | "stopping";
	stopped: boolean;
	root: string;
	rootHash: string;
	metadataPath: string;
	previous?: DashboardServerMetadata;
	message?: string;
};

const activeHandles = new Map<string, DashboardServerHandle>();

function nodeErrorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}

function isInsideDirectory(directory: string, target: string): boolean {
	const relative = path.relative(directory, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hashRoot(root: string): string {
	return createHash("sha256").update(root).digest("hex").slice(0, 24);
}

function selectRuntimeBaseDir(root: string, runtimeDir?: string): string {
	const candidate = runtimeDir ?? process.env.XDG_RUNTIME_DIR ?? os.tmpdir();
	const resolved = path.resolve(candidate);
	const planDir = path.join(root, ".plan");
	if (isInsideDirectory(planDir, resolved)) {
		return path.join(os.tmpdir(), "pi-cartographer-runtime");
	}
	return resolved;
}

export async function resolveDashboardMetadataLocation(
	options: {
		root?: string;
		runtimeDir?: string;
	} = {},
): Promise<DashboardMetadataLocation> {
	const root = await canonicalizeRoot(options.root ?? process.cwd());
	const rootHash = hashRoot(root);
	const runtimeBaseDir = selectRuntimeBaseDir(root, options.runtimeDir);
	const metadataDir = path.join(runtimeBaseDir, "pi-cartographer", "dashboard");
	return {
		root,
		rootHash,
		metadataDir,
		metadataPath: path.join(metadataDir, `${rootHash}.json`),
	};
}

function isValidIPv4Loopback(host: string): boolean {
	const octets = host.split(".");
	if (octets.length !== 4) return false;
	const values = octets.map((octet) => Number(octet));
	return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) && values[0] === 127;
}

export function normalizeLoopbackHost(host = DEFAULT_DASHBOARD_HOST): string {
	const normalized = host
		.trim()
		.toLowerCase()
		.replace(/^\[(.*)\]$/, "$1");
	if (normalized === "localhost") return "localhost";
	if (normalized === "::1") return "::1";
	if (isValidIPv4Loopback(normalized)) return normalized;
	throw new DashboardRuntimeError("non-loopback-host", `Dashboard host must be loopback-only; rejected host: ${host}`, {
		host,
	});
}

export function normalizeDashboardPort(port = DEFAULT_DASHBOARD_PORT): number {
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new DashboardRuntimeError("invalid-port", `Dashboard port must be an integer from 0 to 65535: ${port}`, {
			port,
		});
	}
	return port;
}

function formatHostForUrl(host: string): string {
	return host.includes(":") ? `[${host}]` : host;
}

function dashboardUrl(host: string, port: number): string {
	return `http://${formatHostForUrl(host)}:${port}`;
}

function topicUrl(baseUrl: string, topic?: string): string | undefined {
	return topic ? `${baseUrl}/topics/${encodeURIComponent(topic)}` : undefined;
}

async function readProcessStartToken(pid: number): Promise<string | undefined> {
	try {
		const stat = await fs.readFile(`/proc/${pid}/stat`, "utf8");
		const commandEnd = stat.lastIndexOf(")");
		if (commandEnd < 0) return undefined;
		const fieldsAfterCommand = stat
			.slice(commandEnd + 2)
			.trim()
			.split(/\s+/);
		return fieldsAfterCommand[19];
	} catch {
		return undefined;
	}
}

async function readProcessCommand(pid: number): Promise<string | undefined> {
	try {
		const commandLine = await fs.readFile(`/proc/${pid}/cmdline`, "utf8");
		return commandLine.replaceAll("\0", " ").trim();
	} catch {
		return undefined;
	}
}

function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return nodeErrorCode(error) === "EPERM";
	}
}

async function processStaleReason(metadata: DashboardServerMetadata): Promise<string | undefined> {
	if (!isProcessAlive(metadata.pid)) return "metadata pid is not alive";
	if (!metadata.processStartToken) return undefined;
	const currentStartToken = await readProcessStartToken(metadata.pid);
	if (currentStartToken && currentStartToken !== metadata.processStartToken) {
		return "metadata pid belongs to a different process start token";
	}
	return undefined;
}

function isMetadataRecord(value: unknown): value is DashboardServerMetadata {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.pid === "number" &&
		typeof record.root === "string" &&
		typeof record.rootHash === "string" &&
		typeof record.host === "string" &&
		typeof record.port === "number" &&
		typeof record.url === "string" &&
		record.mode === DASHBOARD_MODE &&
		typeof record.startedAt === "string" &&
		typeof record.metadataPath === "string"
	);
}

async function readMetadata(location: DashboardMetadataLocation): Promise<DashboardServerMetadata | undefined> {
	try {
		const content = await fs.readFile(location.metadataPath, "utf8");
		const parsed = JSON.parse(content) as unknown;
		if (!isMetadataRecord(parsed)) {
			await removeMetadata(location.metadataPath);
			return undefined;
		}
		return parsed;
	} catch (error) {
		if (nodeErrorCode(error) === "ENOENT") return undefined;
		throw new DashboardRuntimeError("metadata-error", `Unable to read dashboard metadata: ${location.metadataPath}`, {
			cause: error instanceof Error ? error.message : String(error),
		});
	}
}

async function writeMetadata(location: DashboardMetadataLocation, metadata: DashboardServerMetadata): Promise<void> {
	await fs.mkdir(location.metadataDir, { recursive: true, mode: 0o700 });
	const temporaryPath = `${location.metadataPath}.${process.pid}.tmp`;
	await fs.writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
	await fs.rename(temporaryPath, location.metadataPath);
}

async function removeMetadata(metadataPath: string): Promise<void> {
	try {
		await fs.unlink(metadataPath);
	} catch (error) {
		if (nodeErrorCode(error) !== "ENOENT") throw error;
	}
}

async function removeMetadataIfCurrent(metadata: DashboardServerMetadata): Promise<void> {
	const location: DashboardMetadataLocation = {
		root: metadata.root,
		rootHash: metadata.rootHash,
		metadataDir: path.dirname(metadata.metadataPath),
		metadataPath: metadata.metadataPath,
	};
	const current = await readMetadata(location);
	if (!current) return;
	if (current.pid === metadata.pid && current.rootHash === metadata.rootHash) {
		await removeMetadata(metadata.metadataPath);
	}
}

function closeServer(server: ServerType): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

function onceListening(app: Hono, host: string, port: number): Promise<{ server: ServerType; address: AddressInfo }> {
	let server!: ServerType;
	return new Promise((resolve, reject) => {
		let settled = false;
		const onError = (error: Error): void => {
			if (settled) return;
			settled = true;
			reject(error);
		};
		server = serve({ fetch: app.fetch, hostname: host, port }, (address) => {
			if (settled) return;
			settled = true;
			server.off("error", onError);
			resolve({ server, address });
		});
		server.once("error", onError);
	});
}

function installSignalHandlers(handle: DashboardServerHandle): void {
	let shuttingDown = false;
	const shutdown = (signal: NodeJS.Signals): void => {
		if (shuttingDown) return;
		shuttingDown = true;
		void handle.stop().finally(() => {
			process.exit(signal === "SIGINT" ? 130 : 0);
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

export async function startDashboardServer(options: StartDashboardServerOptions = {}): Promise<DashboardServerHandle> {
	const host = normalizeLoopbackHost(options.host);
	const port = normalizeDashboardPort(options.port);
	const location = await resolveDashboardMetadataLocation(options);
	const currentStatus = await getDashboardStatus({ root: location.root, runtimeDir: options.runtimeDir });
	if (currentStatus.status === "running") {
		throw new DashboardRuntimeError("already-running", `Dashboard is already running for root: ${location.root}`, {
			pid: currentStatus.pid,
			metadataPath: currentStatus.metadataPath,
		});
	}

	const liveReload = await createLiveReloadService({ root: location.root });
	await liveReload.start();
	const app = createDashboardApp({ root: location.root, liveReload });
	let listened: Awaited<ReturnType<typeof onceListening>>;
	try {
		listened = await onceListening(app, host, port);
	} catch (error) {
		await liveReload.close();
		throw error;
	}
	const { server, address } = listened;
	const actualPort = address.port;
	const url = dashboardUrl(host, actualPort);
	const metadata: DashboardServerMetadata = {
		pid: process.pid,
		root: location.root,
		rootHash: location.rootHash,
		host,
		port: actualPort,
		url,
		mode: DASHBOARD_MODE,
		startedAt: new Date().toISOString(),
		metadataPath: location.metadataPath,
		processStartToken: await readProcessStartToken(process.pid),
	};
	if (options.topic) {
		metadata.topic = options.topic;
		metadata.topicUrl = topicUrl(url, options.topic);
	}

	let stopped = false;
	const handle: DashboardServerHandle = {
		app,
		metadata,
		server,
		liveReload,
		stop: async (): Promise<DashboardStopResult> => {
			if (stopped) {
				return {
					status: "stopped",
					stopped: true,
					root: metadata.root,
					rootHash: metadata.rootHash,
					metadataPath: metadata.metadataPath,
					previous: metadata,
				};
			}
			stopped = true;
			activeHandles.delete(metadata.rootHash);
			await closeServer(server);
			await liveReload.close();
			await removeMetadataIfCurrent(metadata);
			return {
				status: "stopped",
				stopped: true,
				root: metadata.root,
				rootHash: metadata.rootHash,
				metadataPath: metadata.metadataPath,
				previous: metadata,
			};
		},
	};

	try {
		await writeMetadata(location, metadata);
	} catch (error) {
		await closeServer(server);
		await liveReload.close();
		throw error;
	}
	activeHandles.set(metadata.rootHash, handle);
	if (options.installSignalHandlers === true) installSignalHandlers(handle);
	return handle;
}

export async function getDashboardStatus(
	options: {
		root?: string;
		runtimeDir?: string;
	} = {},
): Promise<DashboardStatusResult> {
	const location = await resolveDashboardMetadataLocation(options);
	const metadata = await readMetadata(location);
	if (!metadata) {
		return {
			status: "stopped",
			running: false,
			root: location.root,
			rootHash: location.rootHash,
			metadataPath: location.metadataPath,
		};
	}
	if (
		metadata.root !== location.root ||
		metadata.rootHash !== location.rootHash ||
		metadata.metadataPath !== location.metadataPath
	) {
		await removeMetadata(location.metadataPath);
		return {
			status: "stopped",
			running: false,
			root: location.root,
			rootHash: location.rootHash,
			metadataPath: location.metadataPath,
			stalePid: metadata.pid,
			message: "removed mismatched dashboard metadata",
		};
	}
	const staleReason = await processStaleReason(metadata);
	if (staleReason) {
		await removeMetadata(location.metadataPath);
		return {
			status: "stopped",
			running: false,
			root: location.root,
			rootHash: location.rootHash,
			metadataPath: location.metadataPath,
			stalePid: metadata.pid,
			message: staleReason,
		};
	}
	return { status: "running", running: true, ...metadata };
}

async function assertSafeToSignal(metadata: DashboardServerMetadata): Promise<void> {
	const staleReason = await processStaleReason(metadata);
	if (staleReason) {
		await removeMetadata(metadata.metadataPath);
		throw new DashboardRuntimeError("unsafe-pid", `Refusing to signal stale dashboard pid: ${staleReason}`, {
			pid: metadata.pid,
			metadataPath: metadata.metadataPath,
		});
	}
	const command = await readProcessCommand(metadata.pid);
	if (command && !command.includes("cartographer-dashboard") && !command.includes("dashboard/server/cli")) {
		throw new DashboardRuntimeError(
			"unsafe-pid",
			"Refusing to signal a pid that does not look like cartographer-dashboard",
			{
				pid: metadata.pid,
				command,
				metadataPath: metadata.metadataPath,
			},
		);
	}
}

async function waitForStopped(metadata: DashboardServerMetadata, timeoutMs: number): Promise<boolean> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (!isProcessAlive(metadata.pid)) return true;
		const currentMetadata = await readMetadata({
			root: metadata.root,
			rootHash: metadata.rootHash,
			metadataDir: path.dirname(metadata.metadataPath),
			metadataPath: metadata.metadataPath,
		});
		if (!currentMetadata) return true;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return false;
}

export async function stopDashboardServer(
	options: {
		root?: string;
		runtimeDir?: string;
		timeoutMs?: number;
	} = {},
): Promise<DashboardStopResult> {
	const status = await getDashboardStatus(options);
	if (status.status === "stopped") {
		return {
			status: "stopped",
			stopped: true,
			root: status.root,
			rootHash: status.rootHash,
			metadataPath: status.metadataPath,
			message: status.message ?? "dashboard was not running",
		};
	}

	const activeHandle = activeHandles.get(status.rootHash);
	if (activeHandle && activeHandle.metadata.pid === status.pid) return activeHandle.stop();

	await assertSafeToSignal(status);
	try {
		process.kill(status.pid, "SIGTERM");
	} catch (error) {
		if (nodeErrorCode(error) === "ESRCH") {
			await removeMetadata(status.metadataPath);
			return {
				status: "stopped",
				stopped: true,
				root: status.root,
				rootHash: status.rootHash,
				metadataPath: status.metadataPath,
				previous: status,
				message: "removed stale dashboard metadata",
			};
		}
		throw error;
	}

	if (await waitForStopped(status, options.timeoutMs ?? 3000)) {
		return {
			status: "stopped",
			stopped: true,
			root: status.root,
			rootHash: status.rootHash,
			metadataPath: status.metadataPath,
			previous: status,
		};
	}

	return {
		status: "stopping",
		stopped: false,
		root: status.root,
		rootHash: status.rootHash,
		metadataPath: status.metadataPath,
		previous: status,
		message: `dashboard pid ${status.pid} did not exit within ${options.timeoutMs ?? 3000}ms`,
	};
}

export function openDashboardUrl(url: string): void {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => undefined);
	child.unref();
}
