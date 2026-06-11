import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hasBuiltStartOutput = fs.existsSync("dashboard/start/.output/server/index.mjs");

describe.skipIf(!hasBuiltStartOutput)("dashboard package assets", () => {
	it("includes dashboard runtime, built Start output, bin, and skill in npm pack dry-run", () => {
		const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
		expect(result.status, result.stderr).toBe(0);
		const [pack] = JSON.parse(result.stdout) as [{ files: { path: string }[] }];
		const files = new Set(pack.files.map((file) => file.path));

		expect(files.has("bin/cartographer-dashboard.js")).toBe(true);
		expect(files.has("dashboard/server/cli.ts")).toBe(true);
		expect(files.has("dashboard/start/.output/server/index.mjs")).toBe(true);
		expect([...files].some((file) => file.startsWith("dashboard/start/.output/public/"))).toBe(true);
		expect(files.has("skills/dashboard/SKILL.md")).toBe(true);
		expect(files.has("package.json")).toBe(true);
		expect(files.has("README.md")).toBe(true);
		expect([...files].some((file) => file.startsWith(".plan/"))).toBe(false);
		expect([...files].some((file) => file.startsWith("tests/"))).toBe(false);
	});
});
