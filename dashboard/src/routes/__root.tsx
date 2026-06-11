/// <reference types="vite/client" />

import type { ReactNode } from "react";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { DashboardQueryProvider } from "../lib/dashboard-db.js";
import appCss from "../styles/globals.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Pi Cartographer Dashboard" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent(): React.JSX.Element {
	return (
		<RootDocument>
			<DashboardQueryProvider>
				<Outlet />
			</DashboardQueryProvider>
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				<nav className="sr-only" aria-label="Dashboard routes">
					<Link to="/">Overview</Link>
					<Link to="/topics/$topic" params={{ topic: "demo" }}>
						Demo topic
					</Link>
				</nav>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
