import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { DashboardShell } from "../../dashboard/src/App.js";
import { dashboardRouteDescriptors, defaultDashboardNavHref } from "../../dashboard/src/lib/dashboard-routes.js";
import {
	dashboardAdrsQueryKey,
	dashboardLiveStatusQueryKey,
	dashboardOverviewQueryKey,
	dashboardQueryClient,
} from "../../dashboard/src/lib/dashboard-db.js";
import { getRouter } from "../../dashboard/src/router.js";
import type { DashboardOverview, TopicArtifacts } from "../../dashboard/src/shared/models.js";
import { Button } from "../../dashboard/src/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../dashboard/src/components/ui/card.js";
import "../../dashboard/src/styles/globals.css";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function render(element: React.ReactNode): HTMLElement {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	roots.push(root);
	containers.push(container);
	flushSync(() => root.render(element));
	return container;
}

async function nextFrame(): Promise<void> {
	await new Promise((resolve) => requestAnimationFrame(resolve));
}

function overviewFixture(): DashboardOverview {
	return {
		root: "/tmp/demo",
		generatedAt: "2026-06-10T00:00:00.000Z",
		adrCount: 0,
		topics: [
			{
				id: "demo",
				name: "demo",
				path: ".plan/demo",
				hasProposal: true,
				hasPlan: true,
				counts: {
					mapNodes: 1,
					mapEdges: 0,
					factNodes: 1,
					factEdges: 1,
					planNodes: 1,
					planEdges: 0,
					requirementNodes: 0,
					requirementEdges: 0,
					designNodes: 0,
					designEdges: 0,
					receipts: 1,
					contextPacks: 0,
					evidenceFiles: 0,
				},
				warnings: [],
			},
		],
		health: {
			status: "ok",
			root: "/tmp/demo",
			generatedAt: "2026-06-10T00:00:00.000Z",
			issues: [],
			counts: { topics: 1, adrs: 0, warnings: 0, errors: 0 },
		},
	};
}

function topicFixture(): TopicArtifacts {
	const overview = overviewFixture();
	const topic = overview.topics[0];
	if (!topic) throw new Error("missing topic fixture");
	return {
		topic,
		documents: [
			{
				id: "demo:proposal",
				kind: "proposal",
				path: ".plan/demo/proposal.md",
				topic: "demo",
				title: "Demo Proposal",
				content: "# Demo Proposal\n\nUses [F001].",
				sizeBytes: 32,
				warnings: [],
			},
		],
		graph: {
			topic: "demo",
			nodes: [
				{ id: "S001", type: "source", source: "facts.nodes", label: "README", raw: { reference: "README.md:1" } },
				{ id: "F001", type: "fact", source: "facts.nodes", label: "Fact", raw: {} },
			],
			edges: [{ id: "edge:1", from: "F001", to: "S001", type: "supported_by", source: "facts.edges", raw: {} }],
			warnings: [],
		},
		receipts: [],
		contextPacks: [],
		evidence: { topic: "demo", files: [], manifestRecords: [], warnings: [] },
		indexManifest: { path: ".plan/_index/project-graph-manifest.json", present: false, warnings: [] },
		health: overview.health,
	};
}

function installDashboardFetchMock(): void {
	const overview = overviewFixture();
	const topic = topicFixture();
	dashboardQueryClient.setQueryData(dashboardOverviewQueryKey, [overview]);
	dashboardQueryClient.setQueryData(dashboardAdrsQueryKey, []);
	dashboardQueryClient.setQueryData(dashboardLiveStatusQueryKey, [{ state: "manual-refresh", enabled: false }]);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? new URL(input, "http://localhost") : new URL(input instanceof URL ? input : input.url);
			const payload =
				url.pathname === "/api/overview"
					? overview
					: url.pathname === "/api/topics"
						? { topics: overview.topics, issues: [] }
						: url.pathname === "/api/topics/demo"
							? topic
							: url.pathname === "/api/adrs"
								? { adrs: [], graph: { nodes: [], edges: [], warnings: [] }, warnings: [] }
								: url.pathname === "/api/events/status"
									? { state: "manual-refresh", enabled: false }
									: overview.health;
			return new Response(JSON.stringify({ ok: true, data: payload }), {
				headers: { "content-type": "application/json" },
			});
		}),
	);
}

async function waitFor(assertion: () => void, timeoutMs = 1000): Promise<void> {
	const start = performance.now();
	let lastError: unknown;
	while (performance.now() - start < timeoutMs) {
		try {
			assertion();
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}
	throw lastError;
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	for (const container of containers.splice(0)) container.remove();
	dashboardQueryClient.clear();
	vi.unstubAllGlobals();
	document.documentElement.className = "";
});

describe("dashboard React shell", () => {
	it("renders the tactile shell, navigation, inspector, and live state", async () => {
		document.documentElement.classList.add("dark");
		const container = render(<DashboardShell liveStateOverride="connected" />);
		await nextFrame();

		expect(container.querySelector("[data-dashboard-shell]")).toBeTruthy();
		expect(container.textContent).toContain("Planning Dashboard");
		expect(container.textContent).toContain("Inspector");
		expect(container.querySelectorAll("[data-nav-item]").length).toBeGreaterThanOrEqual(4);
		expect(container.querySelector("[data-live-state='connected']")?.textContent).toContain("Live: connected");
	});

	it("defines route targets for primary and topic review surfaces", () => {
		expect(dashboardRouteDescriptors.map((descriptor) => descriptor.id)).toEqual([
			"overview",
			"topics",
			"topic",
			"documents",
			"facts",
			"evidence",
			"receipts",
			"health",
			"graph",
		]);
		expect(defaultDashboardNavHref("topic", "demo")).toBe("/topics/demo");
		expect(defaultDashboardNavHref("documents", "demo", "requirements")).toBe("/topics/demo/documents/requirements");
		expect(defaultDashboardNavHref("facts", "demo")).toBe("/topics/demo/facts");
		expect(defaultDashboardNavHref("evidence", "demo")).toBe("/topics/demo/evidence");
		expect(defaultDashboardNavHref("receipts", "demo")).toBe("/topics/demo/receipts");
		expect(defaultDashboardNavHref("health", "demo")).toBe("/topics/demo/health");
		expect(defaultDashboardNavHref("graph", "demo")).toBe("/topics/demo/graph");
	});

	it("exposes route-owned navigation links and active state", async () => {
		document.documentElement.classList.add("dark");
		const container = render(
			<DashboardShell
				liveStateOverride="connected"
				initialOverview={overviewFixture()}
				initialTopic={topicFixture()}
				disableDataFetch
				activePage="topics"
			/>,
		);
		await nextFrame();

		const topicsNav = container.querySelector<HTMLAnchorElement>('a[data-nav-item="topics"]');
		const graphNav = container.querySelector<HTMLAnchorElement>('a[data-nav-item="graph"]');
		expect(topicsNav).toBeTruthy();
		expect(graphNav).toBeTruthy();
		expect(topicsNav?.getAttribute("href")).toBe("/topics");
		expect(topicsNav?.getAttribute("aria-current")).toBe("page");
		expect(topicsNav?.getAttribute("data-nav-active")).toBe("true");
		expect(graphNav?.getAttribute("href")).toBe("/topics/demo/graph");
		expect(container.querySelector("[data-review-workflow]")?.getAttribute("data-visible-section")).toBe("topics");
		expect(container.querySelector("[data-topics-list]")).toBeTruthy();
		expect(container.querySelector("[data-topic-workspace]")).toBeFalsy();
	});

	it("mounts the generated TanStack route tree for overview and topics navigation", async () => {
		document.documentElement.classList.add("dark");
		installDashboardFetchMock();
		const history = createMemoryHistory({ initialEntries: ["/"] });
		const router = getRouter({ history });
		const container = render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(container.querySelector('[data-nav-item="overview"]')?.getAttribute("aria-current")).toBe("page");
			expect(router.state.location.pathname).toBe("/");
		});

		const topicsNav = container.querySelector<HTMLAnchorElement>('[data-nav-item="topics"]');
		expect(topicsNav?.getAttribute("href")).toBe("/topics");
		topicsNav?.click();

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/topics");
			expect(container.querySelector("[data-dashboard-shell]")).toBeTruthy();
			expect(container.querySelector('[data-nav-item="topics"]')?.getAttribute("aria-current")).toBe("page");
		});
	});

	it("exposes Tailwind/shadcn tokens, focus styles, and reduced-motion classes", async () => {
		document.documentElement.classList.add("dark");
		const container = render(
			<Card>
				<CardHeader>
					<CardTitle>Token test</CardTitle>
				</CardHeader>
				<CardContent>
					<Button>Focusable action</Button>
				</CardContent>
			</Card>,
		);
		await nextFrame();

		const styles = getComputedStyle(document.documentElement);
		expect(styles.getPropertyValue("--background").trim()).not.toBe("");
		const button = container.querySelector("button");
		expect(button?.className).toContain("focus-visible:ring");
		expect(button?.className).toContain("motion-reduce:transition-none");
		button?.focus();
		expect(document.activeElement).toBe(button);
	});
});
