import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";

export type DashboardAssetOptions = {
	root: string;
	clientDistPath?: string;
};

const DEFAULT_CLIENT_DIST_PATH = fileURLToPath(new URL("../client/dist/", import.meta.url));

const MIME_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webp": "image/webp",
};

function isInsideDirectory(directory: string, target: string): boolean {
	const relative = path.relative(directory, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function contentTypeFor(filePath: string): string {
	return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error) {
			const code = String((error as NodeJS.ErrnoException).code);
			if (code === "ENOENT" || code === "ENOTDIR") return false;
		}
		throw error;
	}
}

async function serveFile(filePath: string): Promise<Response> {
	const content = await fs.readFile(filePath);
	return new Response(new Uint8Array(content), {
		headers: {
			"cache-control": "no-store",
			"content-type": contentTypeFor(filePath),
		},
	});
}

function renderFallbackPage(options: DashboardAssetOptions, topic?: string): string {
	const safeRoot = escapeHtml(options.root);
	const safeTopic = topic ? escapeHtml(topic) : undefined;
	const topicApi = topic ? `/api/topics/${encodeURIComponent(topic)}` : "/api/topics";
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Pi Cartographer Dashboard</title>
	<style>
		:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
		body { margin: 2rem; max-width: 56rem; line-height: 1.5; }
		code { background: color-mix(in srgb, CanvasText 10%, transparent); padding: 0.1rem 0.25rem; border-radius: 0.25rem; }
		.card { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 0.75rem; padding: 1rem; }
	</style>
</head>
<body>
	<main class="card" data-cartographer-dashboard-root="${safeRoot}" data-cartographer-dashboard-mode="read-only">
		<h1>Pi Cartographer Dashboard</h1>
		<p>The dashboard server is running in <strong>read-only</strong> mode.</p>
		<p>The built TanStack Start dashboard output is not available, so this source-checkout compatibility fallback is serving read-only API links only. Run <code>npm run dashboard:build</code> to produce <code>dashboard/start/.output</code> for normal full-stack startup.</p>
		${safeTopic ? `<p>Topic deep link: <strong>${safeTopic}</strong></p>` : ""}
		<ul>
			<li><a href="/api/health">API health</a></li>
			<li><a href="/api/overview">Dashboard overview</a></li>
			<li><a href="${topicApi}">${safeTopic ? "Topic API" : "Topics API"}</a></li>
		</ul>
	</main>
</body>
</html>`;
}

async function serveIndex(options: DashboardAssetOptions, topic?: string): Promise<Response> {
	const distPath = path.resolve(options.clientDistPath ?? DEFAULT_CLIENT_DIST_PATH);
	const indexPath = path.join(distPath, "index.html");
	if (await fileExists(indexPath)) return serveFile(indexPath);
	return new Response(renderFallbackPage(options, topic), {
		headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" },
	});
}

async function serveDistAsset(options: DashboardAssetOptions, assetPath: string): Promise<Response> {
	const distPath = path.resolve(options.clientDistPath ?? DEFAULT_CLIENT_DIST_PATH);
	const targetPath = path.resolve(distPath, assetPath);
	if (!isInsideDirectory(distPath, targetPath)) return new Response("Not found", { status: 404 });
	if (!(await fileExists(targetPath))) return new Response("Not found", { status: 404 });
	return serveFile(targetPath);
}

export function registerDashboardAssetRoutes(app: Hono, options: DashboardAssetOptions): void {
	app.get("/", () => serveIndex(options));
	app.get("/topics/:topic", (context) => serveIndex(options, context.req.param("topic")));
	app.get("/assets/*", (context) => serveDistAsset(options, context.req.path.replace(/^\/assets\//, "assets/")));
	app.get("/favicon.ico", () => serveDistAsset(options, "favicon.ico"));
}
