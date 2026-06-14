import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";
import { createDashboardFixture } from "./fixtures.ts";

const cliPath = path.resolve("bin", "cartographer-dashboard.js");
const hasBuiltAssets = fs.existsSync("dashboard/.output/server/index.mjs");
const children: ChildProcessWithoutNullStreams[] = [];

type StartedDashboard = {
	ok: true;
	status: "running";
	url: string;
	topicUrl: string;
	root: string;
	metadataPath: string;
};

function runtimeDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cartographer-dashboard-smoke-runtime-"));
}

function env(runtime: string): NodeJS.ProcessEnv {
	return { ...process.env, XDG_RUNTIME_DIR: runtime };
}

function waitForJsonLine<T>(child: ChildProcessWithoutNullStreams, timeoutMs = 10_000): Promise<T> {
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
			resolve(JSON.parse(line) as T);
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

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs = 5000): Promise<void> {
	if (child.exitCode !== null || child.killed) return;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timed out waiting for dashboard process exit")), timeoutMs);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

function snapshotPlan(root: string): Map<string, string> {
	const planRoot = path.join(root, ".plan");
	const entries = new Map<string, string>();
	const visit = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const absolute = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(absolute);
			} else if (entry.isFile()) {
				const relative = path.relative(planRoot, absolute).split(path.sep).join("/");
				entries.set(relative, crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"));
			}
		}
	};
	visit(planRoot);
	return entries;
}

function changedPlanFiles(before: Map<string, string>, after: Map<string, string>): string[] {
	const keys = new Set([...before.keys(), ...after.keys()]);
	return [...keys].filter((key) => before.get(key) !== after.get(key)).sort();
}

afterEach(async () => {
	await Promise.all(
		children.splice(0).map(async (child) => {
			if (child.exitCode !== null || child.killed) return;
			child.kill("SIGTERM");
			try {
				await waitForExit(child, 2000);
			} catch {
				child.kill("SIGKILL");
			}
		}),
	);
});

describe.skipIf(!hasBuiltAssets)("dashboard Start browser smoke", () => {
	it("starts via CLI, renders dashboard surfaces, live reloads a safe topic document, and stops without dashboard writes", async () => {
		const fixture = createDashboardFixture();
		const runtime = runtimeDir();
		const before = snapshotPlan(fixture.root);
		const child = spawn(
			process.execPath,
			[
				cliPath,
				"start",
				"--root",
				fixture.root,
				"--topic",
				fixture.topic,
				"--host",
				"127.0.0.1",
				"--port",
				"0",
				"--json",
			],
			{ cwd: path.resolve("."), env: env(runtime) },
		);
		children.push(child);
		const started = await waitForJsonLine<StartedDashboard>(child);
		expect(started).toMatchObject({ ok: true, status: "running", root: fixture.root });

		const browser = await chromium.launch({ headless: true });
		try {
			const topicResponse = await fetch(started.topicUrl);
			expect(topicResponse.status).toBe(200);
			const page = await browser.newPage();
			await page.goto(started.topicUrl);
			await expect.poll(async () => page.locator("[data-dashboard-shell]").count(), { timeout: 10_000 }).toBe(1);
			await page.getByRole("heading", { name: "Planning Dashboard" }).waitFor();
			await page.getByRole("heading", { name: "Demo Proposal" }).first().waitFor();
			await page.locator("[data-nav-item='graph']").click();
			await page.locator("[data-topic-graph-panel]").waitFor({ timeout: 10_000 });
			await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(`/topics/${fixture.topic}/graph`);
			await page.locator("[data-graph-explorer]").waitFor();
			await page.locator("[data-nav-item='documents']").click();
			await page.locator("[data-topic-document-panel]").waitFor({ timeout: 10_000 });
			await expect
				.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
				.toBe(`/topics/${fixture.topic}/documents/proposal`);
			await expect
				.poll(async () =>
					page
						.locator("[role='tab'][data-state='active']")
						.evaluateAll((tabs) => tabs.map((tab) => tab.textContent ?? "")),
				)
				.toContain("Preview");
			await expect
				.poll(async () => page.locator("a[data-reference='F002']").first().getAttribute("href"))
				.toContain("https://reactflow.dev/examples/overview");
			await page.setViewportSize({ width: 390, height: 850 });
			await page.locator("[data-nav-item='overview']").click();
			await expect
				.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
				.toBeLessThanOrEqual(4);
			await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe("/");

			await page.goto(`${started.topicUrl}/documents/proposal`);
			await page.locator("[data-topic-document-panel]").waitFor({ timeout: 10_000 });

			const proposalPath = path.join(fixture.root, ".plan", fixture.topic, "proposal.md");
			fs.writeFileSync(proposalPath, "# Demo Proposal Reloaded\n\nUpdated by smoke test for live reload.\n");
			await page.getByRole("heading", { name: "Demo Proposal Reloaded" }).first().waitFor({ timeout: 10_000 });
		} finally {
			await browser.close();
		}

		const stopped = spawnSync(process.execPath, [cliPath, "stop", "--root", fixture.root, "--json"], {
			cwd: path.resolve("."),
			env: env(runtime),
			encoding: "utf8",
		});
		expect(stopped.status, stopped.stderr).toBe(0);
		await waitForExit(child);
		expect(fs.existsSync(started.metadataPath)).toBe(false);

		const after = snapshotPlan(fixture.root);
		expect(changedPlanFiles(before, after)).toEqual([`${fixture.topic}/proposal.md`]);
	});
});
