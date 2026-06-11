import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createLiveReloadService,
	createLiveReloadStream,
	type LiveReloadService,
} from "../../dashboard/src/server/live-reload.ts";
import type { LiveReloadEvent } from "../../dashboard/src/shared/models.ts";
import { createDashboardFixture } from "./fixtures.ts";

const services: LiveReloadService[] = [];

async function startService(root: string): Promise<LiveReloadService> {
	const service = await createLiveReloadService({ root, debounceMs: 25, heartbeatMs: 2000 });
	await service.start();
	services.push(service);
	return service;
}

function waitForEvent(service: LiveReloadService, action: () => void, timeoutMs = 4000): Promise<LiveReloadEvent> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			unsubscribe();
			reject(new Error("Timed out waiting for live reload event"));
		}, timeoutMs);
		const unsubscribe = service.subscribe((event) => {
			clearTimeout(timeout);
			unsubscribe();
			resolve(event);
		});
		action();
	});
}

async function readSseChunk(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	try {
		const chunk = await reader.read();
		if (!chunk.value) throw new Error("SSE response had no chunk");
		return new TextDecoder().decode(chunk.value);
	} finally {
		await reader.cancel();
	}
}

afterEach(async () => {
	await Promise.all(services.splice(0).map((service) => service.close()));
});

describe("dashboard live reload service", () => {
	it("coalesces safe .plan topic changes and exposes an SSE status stream", async () => {
		const fixture = createDashboardFixture();
		const service = await startService(fixture.root);

		expect(service.status()).toMatchObject({ enabled: true, state: "watching", root: fixture.root });
		expect(await readSseChunk(createLiveReloadStream(service))).toContain("event: status");

		const planPath = path.join(fixture.root, ".plan", fixture.topic, "plan.md");
		const event = await waitForEvent(service, () => {
			fs.appendFileSync(planPath, "\nReload me.\n", "utf8");
		});

		expect(event).toMatchObject({
			type: "planning-artifacts-changed",
			resource: "topic",
			topic: fixture.topic,
		});
		expect(event.paths).toEqual([`.plan/${fixture.topic}/plan.md`]);
		expect(event.events.length).toBeGreaterThan(0);
	});

	it("classifies create/delete changes from temp topic fixtures", async () => {
		const fixture = createDashboardFixture();
		const service = await startService(fixture.root);
		const transientPath = path.join(fixture.root, ".plan", fixture.topic, "transient.jsonl");

		const addEvent = await waitForEvent(service, () => {
			fs.writeFileSync(transientPath, '{"id":"tmp"}\n', "utf8");
		});
		expect(addEvent.paths).toEqual([`.plan/${fixture.topic}/transient.jsonl`]);
		expect(addEvent.topic).toBe(fixture.topic);

		const deleteEvent = await waitForEvent(service, () => {
			fs.unlinkSync(transientPath);
		});
		expect(deleteEvent.paths).toEqual([`.plan/${fixture.topic}/transient.jsonl`]);
		expect(deleteEvent.topic).toBe(fixture.topic);
	});
});
