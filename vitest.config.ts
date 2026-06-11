import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const clientSrc = fileURLToPath(new URL("./dashboard/src", import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@": clientSrc,
		},
	},
	test: {
		exclude: ["tests/dashboard/client-shell.test.tsx", "**/node_modules/**", "**/.git/**"],
	},
});
