import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
	metadata: DashboardServerMetadata;
	child?: ChildProcess;
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
const START_SERVER_ENTRY_PATH = fileURLToPath(new URL("../start/.output/server/index.mjs", import.meta.url));

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

async function reservePort(host: string, requestedPort: number): Promise<number> {
	if (requestedPort !== 0) return requestedPort;
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, host, () => resolve());
	});
	const address = server.address();
	await new Promise<void>((resolve, reject) => {
		server.close((error?: Error) => (error ? reject(error) : resolve()));
	});
	if (!address || typeof address === "string") {
		throw new DashboardRuntimeError("invalid-port", "Unable to reserve an ephemeral dashboard port");
	}
	return address.port;
}

async function waitForHttpReady(url: string, child: ChildProcess, timeoutMs = 8000): Promise<void> {
	const started = Date.now();
	let lastError: unknown;
	while (Date.now() - started < timeoutMs) {
		if (child.exitCode !== null) {
			throw new DashboardRuntimeError(
				"metadata-error",
				`Dashboard child exited before becoming ready: ${child.exitCode}`,
			);
		}
		try {
			const response = await fetch(url, { headers: { accept: "text/html" } });
			if (response.ok) return;
			lastError = new Error(`Dashboard readiness returned HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new DashboardRuntimeError("metadata-error", "Timed out waiting for TanStack Start dashboard to become ready", {
		url,
		lastError: lastError instanceof Error ? lastError.message : String(lastError),
	});
}

function metadataFor(
	location: DashboardMetadataLocation,
	host: string,
	actualPort: number,
	pid: number,
	processStartToken?: string,
	topic?: string,
): DashboardServerMetadata {
	const url = dashboardUrl(host, actualPort);
	const metadata: DashboardServerMetadata = {
		pid,
		root: location.root,
		rootHash: location.rootHash,
		host,
		port: actualPort,
		url,
		mode: DASHBOARD_MODE,
		startedAt: new Date().toISOString(),
		metadataPath: location.metadataPath,
		processStartToken,
	};
	if (topic) {
		metadata.topic = topic;
		metadata.topicUrl = topicUrl(url, topic);
	}
	return metadata;
}

async function startTanStackDashboardServer(
	location: DashboardMetadataLocation,
	host: string,
	port: number,
	options: StartDashboardServerOptions,
): Promise<DashboardServerHandle> {
	const actualPort = await reservePort(host, port);
	const child = spawn(process.execPath, [START_SERVER_ENTRY_PATH], {
		detached: true,
		env: {
			...process.env,
			HOST: host,
			PORT: String(actualPort),
			CARTOGRAPHER_DASHBOARD_ROOT: location.root,
		},
		stdio: "ignore",
	});
	child.unref();
	if (!child.pid) {
		throw new DashboardRuntimeError("metadata-error", "Unable to start TanStack dashboard child process");
	}
	try {
		await waitForHttpReady(dashboardUrl(host, actualPort), child);
	} catch (error) {
		if (child.pid) process.kill(child.pid, "SIGTERM");
		throw error;
	}

	const metadata = metadataFor(
		location,
		host,
		actualPort,
		child.pid,
		await readProcessStartToken(child.pid),
		options.topic,
	);
	let stopped = false;
	const handle: DashboardServerHandle = {
		metadata,
		child,
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
			if (isProcessAlive(metadata.pid)) process.kill(metadata.pid, "SIGTERM");
			await waitForStopped(metadata, 3000);
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
	await writeMetadata(location, metadata);
	activeHandles.set(metadata.rootHash, handle);
	return handle;
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

	try {
		await fs.access(START_SERVER_ENTRY_PATH);
	} catch (error) {
		throw new DashboardRuntimeError(
			"metadata-error",
			"Built TanStack Start dashboard output is missing; run npm run dashboard:build before starting the packaged dashboard.",
			{
				entry: START_SERVER_ENTRY_PATH,
				cause: error instanceof Error ? error.message : String(error),
			},
		);
	}

	const handle = await startTanStackDashboardServer(location, host, port, options);
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
	if (
		command &&
		!command.includes("cartographer-dashboard") &&
		!command.includes("dashboard/server/cli") &&
		!command.includes("dashboard/start/.output/server/index.mjs")
	) {
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
		await removeMetadata(status.metadataPath);
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
