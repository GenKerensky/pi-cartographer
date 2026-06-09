import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiResponse, HealthReport } from "../../dashboard/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

const cliPath = path.resolve("bin", "cartographer-dashboard.js");
const spawnedChildren: ChildProcessWithoutNullStreams[] = [];

type CliResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

function createRuntimeDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-dashboard-runtime-"));
}

function cliEnv(runtimeDir: string): NodeJS.ProcessEnv {
	return { ...process.env, XDG_RUNTIME_DIR: runtimeDir };
}

function runCli(args: string[], runtimeDir: string): CliResult {
	const result = spawnSync(process.execPath, [cliPath, ...args], {
		encoding: "utf8",
		env: cliEnv(runtimeDir),
		cwd: path.resolve("."),
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseJsonLine(stdout: string): unknown {
	const line = stdout
		.split(/\r?\n/)
		.map((item) => item.trim())
		.find(Boolean);
	if (!line) throw new Error(`No JSON line found in stdout: ${stdout}`);
	return JSON.parse(line) as unknown;
}

function waitForJsonLine<T>(child: ChildProcessWithoutNullStreams, timeoutMs = 8000): Promise<T> {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for CLI JSON. stdout=${stdout} stderr=${stderr}`));
		}, timeoutMs);
		const cleanup = (): void => {
			clearTimeout(timeout);
			child.stdout.off("data", onStdout);
			child.stderr.off("data", onStderr);
			child.off("exit", onExit);
		};
		const tryResolve = (): void => {
			const line = stdout
				.split(/\r?\n/)
				.map((item) => item.trim())
				.find(Boolean);
			if (!line) return;
			cleanup();
			try {
				resolve(JSON.parse(line) as T);
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		};
		const onStdout = (chunk: Buffer): void => {
			stdout += chunk.toString("utf8");
			tryResolve();
		};
		const onStderr = (chunk: Buffer): void => {
			stderr += chunk.toString("utf8");
		};
		const onExit = (code: number | null): void => {
			cleanup();
			reject(new Error(`CLI exited before JSON line with code ${code}. stdout=${stdout} stderr=${stderr}`));
		};
		child.stdout.on("data", onStdout);
		child.stderr.on("data", onStderr);
		child.on("exit", onExit);
	});
}

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs = 8000): Promise<void> {
	if (child.exitCode !== null || child.killed) return;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`Timed out waiting for child ${child.pid ?? "unknown"} to exit`));
		}, timeoutMs);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

afterEach(async () => {
	await Promise.all(
		spawnedChildren.splice(0).map(async (child) => {
			if (child.exitCode !== null || child.killed) return;
			child.kill("SIGTERM");
			try {
				await waitForExit(child, 3000);
			} catch {
				child.kill("SIGKILL");
			}
		}),
	);
});

describe("cartographer-dashboard CLI", () => {
	it("starts, reports status, serves read-only health, and stops with metadata outside .plan", async () => {
		const fixture = createDashboardFixture();
		const runtimeDir = createRuntimeDir();
		const child = spawn(
			process.execPath,
			[
				cliPath,
				"start",
				"--root",
				fixture.root,
				"--host",
				"127.0.0.1",
				"--port",
				"0",
				"--topic",
				fixture.topic,
				"--json",
			],
			{ cwd: path.resolve("."), env: cliEnv(runtimeDir) },
		);
		spawnedChildren.push(child);

		const started = await waitForJsonLine<{
			ok: true;
			command: "start";
			status: "running";
			pid: number;
			root: string;
			host: string;
			port: number;
			url: string;
			mode: "read-only";
			metadataPath: string;
			topicUrl: string;
		}>(child);

		expect(started).toMatchObject({
			ok: true,
			command: "start",
			status: "running",
			root: fixture.root,
			host: "127.0.0.1",
			mode: "read-only",
		});
		expect(started.port).toBeGreaterThan(0);
		expect(started.url).toBe(`http://127.0.0.1:${started.port}`);
		expect(started.topicUrl).toBe(`${started.url}/topics/${fixture.topic}`);
		expect(started.metadataPath.startsWith(runtimeDir)).toBe(true);
		expect(started.metadataPath).not.toContain(`${path.sep}.plan${path.sep}`);
		expect(fs.existsSync(started.metadataPath)).toBe(true);

		const healthResponse = await fetch(`${started.url}/api/health`);
		const health = (await healthResponse.json()) as ApiResponse<HealthReport>;
		expect(healthResponse.status).toBe(200);
		expect(health.data?.counts.topics).toBe(1);

		const status = parseJsonLine(runCli(["status", "--root", fixture.root, "--json"], runtimeDir).stdout) as {
			ok: true;
			command: "status";
			status: "running";
			pid: number;
			metadataPath: string;
		};
		expect(status).toMatchObject({ ok: true, command: "status", status: "running", pid: started.pid });

		const stopped = runCli(["stop", "--root", fixture.root, "--json"], runtimeDir);
		expect(stopped.status).toBe(0);
		expect(
			parseJsonLine(stopped.stdout) as { ok: true; command: "stop"; status: "stopped"; stopped: true },
		).toMatchObject({
			ok: true,
			command: "stop",
			status: "stopped",
			stopped: true,
		});
		await waitForExit(child);
		expect(fs.existsSync(started.metadataPath)).toBe(false);
	});

	it("rejects non-loopback hosts before starting a server", () => {
		const fixture = createDashboardFixture();
		const runtimeDir = createRuntimeDir();

		for (const host of ["0.0.0.0", "::", "192.168.1.10"]) {
			const result = runCli(["start", "--root", fixture.root, "--host", host, "--port", "0", "--json"], runtimeDir);
			expect(result.status).toBe(1);
			expect(parseJsonLine(result.stdout) as { ok: false; error: { code: string; message: string } }).toMatchObject({
				ok: false,
				error: { code: "non-loopback-host" },
			});
		}
	});
});
