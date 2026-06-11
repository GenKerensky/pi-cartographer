import process from "node:process";
import {
	DashboardRuntimeError,
	DEFAULT_DASHBOARD_HOST,
	DEFAULT_DASHBOARD_PORT,
	getDashboardStatus,
	normalizeDashboardPort,
	openDashboardUrl,
	startDashboardServer,
	stopDashboardServer,
} from "./runtime.js";

export type DashboardCliCommand = "start" | "status" | "stop";

export type DashboardCliIo = {
	stdout?: NodeJS.WritableStream;
	stderr?: NodeJS.WritableStream;
	cwd?: string;
};

type ParsedCli = {
	command: DashboardCliCommand;
	root?: string;
	host?: string;
	port?: number;
	topic?: string;
	open: boolean;
	json: boolean;
	help: boolean;
};

class DashboardCliUsageError extends Error {
	readonly code = "usage";

	constructor(message: string) {
		super(message);
		this.name = "DashboardCliUsageError";
	}
}

const HELP_TEXT = `Usage: cartographer-dashboard <command> [options]

Commands:
  start   Start the read-only local dashboard server
  status  Print dashboard status for the selected root
  stop    Stop the dashboard server for the selected root

Options:
  --root <path>       Project root to inspect (default: current working directory)
  --host <host>       Loopback host to bind (default: ${DEFAULT_DASHBOARD_HOST})
  --port <port>       Port to bind, or 0 for an ephemeral port (default: ${DEFAULT_DASHBOARD_PORT})
  --topic <topic>     Include a topic deep link in start output
  --open              Open the dashboard URL in the default browser after start
  --json              Print newline-delimited JSON
  --help              Show this help text
`;

function isDashboardCommand(value: string): value is DashboardCliCommand {
	return value === "start" || value === "status" || value === "stop";
}

function takeOptionValue(argv: string[], index: number, option: string): { value: string; nextIndex: number } {
	const inlinePrefix = `${option}=`;
	const current = argv[index];
	if (current.startsWith(inlinePrefix)) return { value: current.slice(inlinePrefix.length), nextIndex: index };
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) throw new DashboardCliUsageError(`Missing value for ${option}`);
	return { value, nextIndex: index + 1 };
}

function parsePort(value: string): number {
	if (!/^\d+$/.test(value)) throw new DashboardCliUsageError(`Invalid --port value: ${value}`);
	return normalizeDashboardPort(Number(value));
}

function parseArgs(argv: string[]): ParsedCli {
	const command = argv.find((argument) => !argument.startsWith("--"));
	const help = argv.includes("--help") || argv.includes("-h");
	if (!command) {
		if (help) {
			return { command: "status", open: false, json: argv.includes("--json"), help };
		}
		throw new DashboardCliUsageError("Missing command: expected start, status, or stop");
	}
	if (!isDashboardCommand(command)) throw new DashboardCliUsageError(`Unknown command: ${command}`);

	const parsed: ParsedCli = {
		command,
		open: false,
		json: false,
		help,
	};
	const commandIndex = argv.indexOf(command);
	for (let index = 0; index < argv.length; index += 1) {
		if (index === commandIndex) continue;
		const argument = argv[index];
		if (argument === "--json") {
			parsed.json = true;
			continue;
		}
		if (argument === "--open") {
			parsed.open = true;
			continue;
		}
		if (argument === "--help" || argument === "-h") continue;
		if (argument === "--root" || argument.startsWith("--root=")) {
			const option = takeOptionValue(argv, index, "--root");
			parsed.root = option.value;
			index = option.nextIndex;
			continue;
		}
		if (argument === "--host" || argument.startsWith("--host=")) {
			const option = takeOptionValue(argv, index, "--host");
			parsed.host = option.value;
			index = option.nextIndex;
			continue;
		}
		if (argument === "--port" || argument.startsWith("--port=")) {
			const option = takeOptionValue(argv, index, "--port");
			parsed.port = parsePort(option.value);
			index = option.nextIndex;
			continue;
		}
		if (argument === "--topic" || argument.startsWith("--topic=")) {
			const option = takeOptionValue(argv, index, "--topic");
			parsed.topic = option.value;
			index = option.nextIndex;
			continue;
		}
		throw new DashboardCliUsageError(`Unknown option: ${argument}`);
	}
	return parsed;
}

function writeJson(
	stdout: NodeJS.WritableStream,
	command: DashboardCliCommand,
	payload: Record<string, unknown>,
): void {
	stdout.write(`${JSON.stringify({ ok: true, command, ...payload })}\n`);
}

function stringPayloadField(payload: Record<string, unknown>, field: string): string | undefined {
	const value = payload[field];
	return typeof value === "string" ? value : undefined;
}

function writeHuman(
	stdout: NodeJS.WritableStream,
	command: DashboardCliCommand,
	payload: Record<string, unknown>,
): void {
	const status = stringPayloadField(payload, "status") ?? "unknown";
	const message = stringPayloadField(payload, "message");
	if (command === "start" || command === "status") {
		stdout.write(`cartographer-dashboard ${status}: ${stringPayloadField(payload, "url") ?? message ?? ""}\n`);
		stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
		return;
	}
	stdout.write(`cartographer-dashboard ${status}${message ? `: ${message}` : ""}\n`);
}

function errorCode(error: unknown): string {
	if (error instanceof DashboardRuntimeError) return error.code;
	if (error instanceof DashboardCliUsageError) return error.code;
	return "error";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function writeError(
	stderr: NodeJS.WritableStream,
	stdout: NodeJS.WritableStream,
	command: DashboardCliCommand | "unknown",
	json: boolean,
	error: unknown,
): void {
	const payload = { ok: false, command, error: { code: errorCode(error), message: errorMessage(error) } };
	if (json) {
		stdout.write(`${JSON.stringify(payload)}\n`);
		return;
	}
	stderr.write(`${payload.error.code}: ${payload.error.message}\n`);
}

export async function runDashboardCli(argv = process.argv.slice(2), io: DashboardCliIo = {}): Promise<number> {
	const stdout = io.stdout ?? process.stdout;
	const stderr = io.stderr ?? process.stderr;
	const wantsJson = argv.includes("--json");
	let parsed: ParsedCli;
	try {
		parsed = parseArgs(argv);
	} catch (error) {
		writeError(stderr, stdout, "unknown", wantsJson, error);
		if (!wantsJson) stderr.write(`\n${HELP_TEXT}`);
		return 2;
	}

	if (parsed.help) {
		stdout.write(HELP_TEXT);
		return 0;
	}

	try {
		if (parsed.command === "start") {
			const handle = await startDashboardServer({
				root: parsed.root ?? io.cwd,
				host: parsed.host,
				port: parsed.port,
				topic: parsed.topic,
				installSignalHandlers: true,
			});
			if (parsed.open) openDashboardUrl(handle.metadata.topicUrl ?? handle.metadata.url);
			const payload = { status: "running", ...handle.metadata };
			if (parsed.json) writeJson(stdout, parsed.command, payload);
			else writeHuman(stdout, parsed.command, payload);
			return 0;
		}

		if (parsed.command === "status") {
			const status = await getDashboardStatus({ root: parsed.root ?? io.cwd });
			if (parsed.json) writeJson(stdout, parsed.command, status);
			else writeHuman(stdout, parsed.command, status);
			return 0;
		}

		const stop = await stopDashboardServer({ root: parsed.root ?? io.cwd });
		if (parsed.json) writeJson(stdout, parsed.command, stop);
		else writeHuman(stdout, parsed.command, stop);
		return stop.stopped ? 0 : 1;
	} catch (error) {
		writeError(stderr, stdout, parsed.command, parsed.json, error);
		return error instanceof DashboardCliUsageError ? 2 : 1;
	}
}
