#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as moduleApi from "node:module";

const stripTypesFlag = "--experimental-strip-types";
const stripTypesMarker = "CARTOGRAPHER_DASHBOARD_STRIP_TYPES";
const scriptPath = fileURLToPath(import.meta.url);

function hasStripTypesFlag() {
	return process.execArgv.some((argument) => argument === stripTypesFlag || argument.startsWith(`${stripTypesFlag}=`));
}

function respawnWithTypeStrippingIfNeeded() {
	if (process.env[stripTypesMarker] === "1" || hasStripTypesFlag()) return;
	const result = spawnSync(
		process.execPath,
		[stripTypesFlag, ...process.execArgv, scriptPath, ...process.argv.slice(2)],
		{
			env: { ...process.env, [stripTypesMarker]: "1" },
			stdio: "inherit",
		},
	);
	if (result.signal) process.kill(process.pid, result.signal);
	process.exit(result.status ?? 1);
}

function registerSourceCheckoutResolver() {
	const resolveHook = (specifier, context, nextResolve) => {
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js")) {
				return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
			}
			throw error;
		}
	};

	if (typeof moduleApi.registerHooks === "function") {
		moduleApi.registerHooks({ resolve: resolveHook });
		return;
	}

	const loaderSource = [
		"export async function resolve(specifier, context, nextResolve) {",
		"  try {",
		"    return await nextResolve(specifier, context);",
		"  } catch (error) {",
		'    if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js")) {',
		"      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);",
		"    }",
		"    throw error;",
		"  }",
		"}",
	].join("\n");
	moduleApi.register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);
}

respawnWithTypeStrippingIfNeeded();
registerSourceCheckoutResolver();

const { runDashboardCli } = await import("../dashboard/server/cli.ts");
const exitCode = await runDashboardCli(process.argv.slice(2));
if (exitCode !== 0) process.exitCode = exitCode;
