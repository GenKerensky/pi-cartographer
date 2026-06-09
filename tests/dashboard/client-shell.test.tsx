import { afterEach, describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { DashboardShell } from "../../dashboard/client/src/App.js";
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
