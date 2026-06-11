import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "../../dashboard/src/components/ui/badge.js";
import {
	collectionKeysForLiveReloadEvent,
	createLiveRefetchPlan,
	shouldRefetchForLiveEvent,
} from "../../dashboard/src/lib/live-refetch.js";
import type { LiveReloadEvent } from "../../dashboard/src/shared/models.ts";

const topicEvent: LiveReloadEvent = {
	id: "reload:1",
	type: "planning-artifacts-changed",
	resource: "topic",
	topic: "demo",
	paths: [".plan/demo/plan.md"],
	events: ["change"],
	changedAt: "2026-06-09T00:00:00.000Z",
};

describe("dashboard live refetch decisions", () => {
	it("refetches visible overview, health, topic, and document resources affected by reload events", () => {
		expect(shouldRefetchForLiveEvent({ kind: "overview" }, topicEvent)).toMatchObject({
			shouldRefetch: true,
			reason: "global-change",
		});
		expect(shouldRefetchForLiveEvent({ kind: "health" }, topicEvent)).toMatchObject({
			shouldRefetch: true,
			reason: "global-change",
		});
		expect(shouldRefetchForLiveEvent({ kind: "topic", topic: "demo" }, topicEvent)).toMatchObject({
			shouldRefetch: true,
			reason: "topic-match",
		});
		expect(shouldRefetchForLiveEvent({ kind: "document", path: ".plan/demo/plan.md" }, topicEvent)).toMatchObject({
			shouldRefetch: true,
			reason: "path-match",
		});
		expect(shouldRefetchForLiveEvent({ kind: "topic", topic: "other" }, topicEvent)).toMatchObject({
			shouldRefetch: false,
			reason: "unaffected",
		});
	});

	it("creates a refetch plan and exposes manual-refresh UI language", () => {
		const plan = createLiveRefetchPlan(
			[{ kind: "overview" }, { kind: "topic", topic: "demo" }, { kind: "topic", topic: "other" }],
			topicEvent,
		);
		expect(plan).toHaveLength(2);

		const html = renderToStaticMarkup(
			<Badge variant="secondary" data-live-state="manual-refresh">
				Live: manual-refresh
			</Badge>,
		);
		expect(html).toContain("manual-refresh");
	});

	it("treats index-stale events as requiring visible data refresh", () => {
		const indexEvent: LiveReloadEvent = {
			...topicEvent,
			type: "index-stale",
			resource: "index",
			topic: undefined,
			paths: [],
		};
		expect(shouldRefetchForLiveEvent({ kind: "document", path: ".plan/demo/proposal.md" }, indexEvent)).toMatchObject({
			shouldRefetch: true,
			reason: "index-stale",
		});
	});

	it("maps live reload events to DB collection invalidation keys", () => {
		const keys = collectionKeysForLiveReloadEvent(topicEvent, { activeTopic: "demo" });
		expect(keys).toContainEqual(["dashboard", "overview"]);
		expect(keys).toContainEqual(["dashboard", "topics"]);
		expect(keys).toContainEqual(["dashboard", "health"]);
		expect(keys).toContainEqual(["dashboard", "adrs"]);
		expect(keys).toContainEqual(["dashboard", "events", "status"]);
		expect(keys).toContainEqual(["dashboard", "topic", "demo", "artifacts"]);
		expect(keys).toContainEqual(["dashboard", "topic", "demo", "documents"]);
		expect(keys).toContainEqual(["dashboard", "topic", "demo", "graph"]);
		expect(keys).toContainEqual(["dashboard", "topic", "demo", "docs", "proposal"]);
		expect(keys).toContainEqual(["dashboard", "topic", "demo", "docs", "plan"]);
	});
});
