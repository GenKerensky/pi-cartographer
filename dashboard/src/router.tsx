import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.js";

export function getRouter(options: { history?: RouterHistory } = {}) {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		...options,
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
