import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const clientRoot = fileURLToPath(new URL("./", import.meta.url));
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
	root: clientRoot,
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": srcDir,
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
	server: {
		host: "127.0.0.1",
	},
});
