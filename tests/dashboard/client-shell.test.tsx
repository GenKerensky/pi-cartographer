import { afterEach, describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { DashboardShell } from "../../dashboard/client/src/App.js";
import type { DashboardOverview, TopicArtifacts } from "../../dashboard/shared/models.js";
import { Button } from "../../dashboard/client/src/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../dashboard/client/src/components/ui/card.js";
import "../../dashboard/client/src/styles/globals.css";

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

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	for (const container of containers.splice(0)) container.remove();
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

	it("activates left navigation and switches document/graph tabs", async () => {
		document.documentElement.classList.add("dark");
		const container = render(
			<DashboardShell
				liveStateOverride="connected"
				initialOverview={overviewFixture()}
				initialTopic={topicFixture()}
				disableDataFetch
			/>,
		);
		await nextFrame();

		const graphNav = container.querySelector<HTMLButtonElement>('[data-nav-item="graph"]');
		expect(graphNav).toBeTruthy();
		graphNav?.click();
		await nextFrame();

		expect(graphNav?.getAttribute("data-nav-active")).toBe("true");
		const activeTab = container.querySelector('[role="tab"][data-state="active"]');
		expect(activeTab?.textContent).toContain("Graph");
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
