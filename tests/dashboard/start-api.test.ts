import { ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
	ApiResponse,
	DashboardDocument,
	DashboardOverview,
	EvidenceSummary,
	HealthReport,
	IndexManifestSummary,
	LiveReloadEvent,
	LiveReloadStatus,
	TopicArtifacts,
	TopicGraph,
} from "../../dashboard/src/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

type StartPayload = {
	ok: boolean;
	command: "start";
	status: "running";
	root: string;
	url: string;
	topicUrl?: string;
};

type StartedDashboard = {
	child: ChildProcessWithoutNullStreams;
	runtimeDir: string;
	url: string;
	root: string;
	json: StartPayload;
};

const cliPath = path.resolve("bin", "cartographer-dashboard.js");
const started: StartedDashboard[] = [];

function createRuntimeDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-dashboard-runtime-"));
}

function cliEnv(runtimeDir: string): NodeJS.ProcessEnv {
	return { ...process.env, XDG_RUNTIME_DIR: runtimeDir };
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs = 5000): Promise<void> {
	if (child.exitCode !== null || child.killed) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error("Timed out waiting for dashboard child to exit"));
		}, timeoutMs);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

function stopDashboard(instance: StartedDashboard): void {
	const result = spawnSync(process.execPath, [cliPath, "stop", "--root", instance.root, "--json"], {
		cwd: path.resolve("."),
		env: cliEnv(instance.runtimeDir),
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(`Failed to stop dashboard for ${instance.root}: ${result.status}`);
	}
}

async function waitForJsonLine<T>(child: ChildProcessWithoutNullStreams, timeoutMs = 8000): Promise<T> {
	let stdout = "";
	let stderr = "";
	return new Promise<T>((resolve, reject) => {
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
				.map((entry) => entry.trim())
				.find((entry) => entry.length > 0);
			if (!line) return;
			try {
				resolve(JSON.parse(line) as T);
				cleanup();
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
			reject(new Error(`CLI exited before JSON with code ${code}. stdout=${stdout} stderr=${stderr}`));
		};
		child.stdout.on("data", onStdout);
		child.stderr.on("data", onStderr);
		child.on("exit", onExit);
	});
}

async function startDashboard(root: string, topic: string): Promise<StartedDashboard> {
	const runtimeDir = createRuntimeDir();
	const child = spawn(
		process.execPath,
		[cliPath, "start", "--root", root, "--host", "127.0.0.1", "--port", "0", "--topic", topic, "--json"],
		{ cwd: path.resolve("."), env: cliEnv(runtimeDir), stdio: ["pipe", "pipe", "pipe"] },
	);
	const json = await waitForJsonLine<StartPayload>(child);
	const startedInstance: StartedDashboard = {
		child,
		runtimeDir,
		root,
		url: json.url,
		json,
	};
	started.push(startedInstance);
	return startedInstance;
}

async function responseJson<T>(response: Response): Promise<ApiResponse<T>> {
	return (await response.json()) as ApiResponse<T>;
}

async function waitForSseReloadEvent(response: Response, timeoutMs = 20000): Promise<LiveReloadEvent> {
	const stream = response.body;
	if (!stream) throw new Error("Missing response body for event stream");
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const expiresAt = Date.now() + timeoutMs;
	try {
		while (Date.now() < expiresAt) {
			const { value, done } = await reader.read();
			if (done) throw new Error("SSE stream closed before reload event");
			buffer += decoder.decode(value, { stream: true });
			const blocks = buffer.split(/\r?\n\r?\n/);
			buffer = blocks.pop() ?? "";
			for (const block of blocks) {
				let eventType = "";
				let payload = "";
				for (const line of block.split(/\r?\n/)) {
					if (line.startsWith("event:")) {
						eventType = line.replace(/^event:\s*/, "").trim();
					} else if (line.startsWith("data:")) {
						payload = line.replace(/^data:\s*/, "").trim();
					}
				}
				if (eventType !== "reload" || !payload) continue;
				return JSON.parse(payload) as LiveReloadEvent;
			}
		}
		throw new Error("Timed out waiting for SSE reload event");
	} finally {
		reader.releaseLock();
		await stream.cancel().catch(() => undefined);
	}
}

afterEach(async () => {
	const toStop = [...started];
	started.length = 0;
	for (const instance of toStop) {
		stopDashboard(instance);
		await waitForExit(instance.child).catch(() => undefined);
	}
});

describe("dashboard Start read-only API parity", () => {
	it("serves the read-only endpoint contract with matching payload shapes", async () => {
		const fixture = createDashboardFixture();
		const { url } = await startDashboard(fixture.root, fixture.topic);

		const healthPayload = await responseJson<HealthReport>(await fetch(`${url}/api/health`));
		expect(healthPayload.ok).toBe(true);
		expect(healthPayload.data?.counts.topics).toBe(1);

		const overviewPayload = await responseJson<DashboardOverview>(await fetch(`${url}/api/overview`));
		expect(overviewPayload.ok).toBe(true);
		expect(overviewPayload.data?.topics.map((topic) => topic.id)).toEqual([fixture.topic]);

		const topicsPayload = await responseJson<{ topics: { id: string }[] }>(await fetch(`${url}/api/topics`));
		expect(topicsPayload.ok).toBe(true);
		expect(topicsPayload.data?.topics.map((topic) => topic.id)).toEqual([fixture.topic]);

		const topicPayload = await responseJson<TopicArtifacts>(await fetch(`${url}/api/topics/${fixture.topic}`));
		expect(topicPayload.ok).toBe(true);
		expect(topicPayload.data?.topic.id).toBe(fixture.topic);

		const docsPayload = await responseJson<{ documents: DashboardDocument[] }>(
			await fetch(`${url}/api/topics/${fixture.topic}/docs`),
		);
		expect(docsPayload.ok).toBe(true);
		expect(docsPayload.data?.documents.map((document) => document.kind)).toEqual(["proposal", "plan"]);

		const proposalPayload = await responseJson<DashboardDocument>(
			await fetch(`${url}/api/topics/${fixture.topic}/docs/proposal`),
		);
		expect(proposalPayload.ok).toBe(true);
		expect(proposalPayload.data?.kind).toBe("proposal");

		const unsupportedKindResponse = await fetch(`${url}/api/topics/${fixture.topic}/docs/summary`);
		expect(unsupportedKindResponse.status).toBe(404);
		const unsupportedPayload = (await unsupportedKindResponse.json()) as ApiResponse<never>;
		expect(unsupportedPayload.ok).toBe(false);
		expect(unsupportedPayload.error?.code).toBe("not-found");

		const graphPayload = await responseJson<TopicGraph>(await fetch(`${url}/api/topics/${fixture.topic}/graph`));
		expect(graphPayload.ok).toBe(true);
		expect(graphPayload.data?.nodes.map((node) => node.id)).toContain("phase:P0");

		const evidencePayload = await responseJson<EvidenceSummary>(
			await fetch(`${url}/api/topics/${fixture.topic}/evidence`),
		);
		expect(evidencePayload.ok).toBe(true);
		expect(Array.isArray(evidencePayload.data?.files)).toBe(true);

		const indexPayload = await responseJson<IndexManifestSummary>(await fetch(`${url}/api/index`));
		expect(indexPayload.ok).toBe(true);
		expect(indexPayload.data?.present).toBe(true);

		const adrsPayload = await responseJson<{ adrs: { id: string; adrId?: string }[] }>(await fetch(`${url}/api/adrs`));
		expect(adrsPayload.ok).toBe(true);
		const firstAdrId = adrsPayload.data?.adrs.at(0)?.id;
		expect(firstAdrId).toBeDefined();
		if (firstAdrId) {
			const adrPayload = await responseJson<{ id: string }>(await fetch(`${url}/api/adrs/${firstAdrId}`));
			expect(adrPayload.ok).toBe(true);
			expect(adrPayload.data?.id).toBe(firstAdrId);
		}

		const eventsStatusPayload = await responseJson<LiveReloadStatus>(await fetch(`${url}/api/events/status`));
		expect(eventsStatusPayload.ok).toBe(true);
		expect(["manual-refresh", "watching", "unavailable"]).toContain(eventsStatusPayload.data?.state);

		const eventsResponse = await fetch(`${url}/api/events`);
		expect(eventsResponse.status).toBe(200);
		expect(eventsResponse.headers.get("content-type") ?? "").toContain("text/event-stream");
		await eventsResponse.body?.cancel();
	});

	it("streams planning reload events when topic files change", async () => {
		const fixture = createDashboardFixture();
		const { url, root } = await startDashboard(fixture.root, fixture.topic);

		const eventsStatusPayload = await responseJson<LiveReloadStatus>(await fetch(`${url}/api/events/status`));
		if (eventsStatusPayload.data?.state !== "watching") {
			return;
		}

		const planPath = path.join(root, ".plan", fixture.topic, "plan.md");
		const eventsResponse = await fetch(`${url}/api/events`);
		expect(eventsResponse.status).toBe(200);
		expect(eventsResponse.headers.get("content-type") ?? "").toContain("text/event-stream");

		const reloadPromise = waitForSseReloadEvent(eventsResponse);
		await new Promise((resolve) => setTimeout(resolve, 250));
		fs.appendFileSync(planPath, "\n# Live-reload probe", "utf8");
		const reloadEvent = await reloadPromise;
		expect(reloadEvent.type).toBe("planning-artifacts-changed");
		expect(reloadEvent.resource).toBe("topic");
		expect(reloadEvent.topic).toBe(fixture.topic);
		await eventsResponse.body?.cancel();
	}, 30000);

	it("blocks private files and validates /api/files required query", async () => {
		const fixture = createDashboardFixture();
		const { url } = await startDashboard(fixture.root, fixture.topic);

		const privateResponse = await fetch(
			`${url}/api/files?path=${encodeURIComponent(`.plan/_private/${fixture.topic}/raw.log`)}`,
		);
		expect(privateResponse.status).toBe(403);
		const privatePayload = (await privateResponse.json()) as ApiResponse<never>;
		expect(privatePayload.ok).toBe(false);
		expect(privatePayload.error?.code).toBe("private-path");
		expect(privatePayload.error?.message).not.toContain("secret raw artifact");

		const missingPathResponse = await fetch(`${url}/api/files`);
		expect(missingPathResponse.status).toBe(400);
		const missingPayload = (await missingPathResponse.json()) as ApiResponse<never>;
		expect(missingPayload.error?.code).toBe("missing-path");
	});
});
