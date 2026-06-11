import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createLiveReloadService,
	shouldIgnorePlanWatchPath,
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

function collectEvents(service: LiveReloadService): LiveReloadEvent[] {
	const events: LiveReloadEvent[] = [];
	service.subscribe((event) => events.push(event));
	return events;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
	await Promise.all(services.splice(0).map((service) => service.close()));
});

describe("dashboard private live reload watch behavior", () => {
	it("ignores .plan/_private changes and outside-root candidates", async () => {
		const fixture = createDashboardFixture();
		const service = await startService(fixture.root);
		const events = collectEvents(service);

		expect(shouldIgnorePlanWatchPath(fixture.root, fixture.privateFile)).toBe(true);
		expect(shouldIgnorePlanWatchPath(fixture.root, fixture.outsideFile)).toBe(true);
		fs.appendFileSync(fixture.privateFile, "secret change\n", "utf8");
		await delay(250);

		expect(JSON.stringify(events)).not.toContain("_private");
		expect(events).toEqual([]);
	});

	it("summarizes .plan/_index changes without exposing raw index paths", async () => {
		const fixture = createDashboardFixture();
		const service = await startService(fixture.root);
		const indexPath = path.join(fixture.root, ".plan", "_index", "project-graph-manifest.json");
		const eventPromise = new Promise<LiveReloadEvent>((resolve) => {
			const unsubscribe = service.subscribe((event) => {
				unsubscribe();
				resolve(event);
			});
		});

		fs.appendFileSync(indexPath, "\n", "utf8");
		const event = await eventPromise;

		expect(event).toMatchObject({ type: "index-stale", resource: "index", paths: [] });
		expect(JSON.stringify(event)).not.toContain("_index");
	});
});
