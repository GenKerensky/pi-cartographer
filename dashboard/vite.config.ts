import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const dashboardRoot = fileURLToPath(new URL("./", import.meta.url));
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
	root: dashboardRoot,
	plugins: [tanstackStart(), nitro(), viteReact(), tailwindcss()],
	resolve: {
		alias: {
			"@": srcDir,
		},
	},
	server: {
		host: "127.0.0.1",
	},
});
