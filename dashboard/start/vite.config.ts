import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const startRoot = fileURLToPath(new URL("./", import.meta.url));
const clientSrc = fileURLToPath(new URL("../client/src", import.meta.url));

export default defineConfig({
	root: startRoot,
	plugins: [tanstackStart(), nitro(), viteReact(), tailwindcss()],
	resolve: {
		alias: {
			"@": clientSrc,
		},
	},
	server: {
		host: "127.0.0.1",
	},
});
