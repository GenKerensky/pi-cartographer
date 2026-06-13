#!/usr/bin/env node --experimental-strip-types
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const CARTOGRAPHER_ROLE_PREFIX = "cartographer-";

type JsonObject = Record<string, unknown>;

export type AvailableModel = {
	id: string;
	reasoning?: boolean;
	thinking?: boolean | string[];
	input?: string[];
	costTier?: "free" | "subscription" | "cheap" | "paid" | "unknown";
};

export type AgentOverride = {
	model?: string;
	thinking?: string;
	fallbackModels?: string[];
	requiredInputs?: string[];
};

export type ModelConfigProposal = {
	subagents?: {
		agentOverrides?: Record<string, AgentOverride>;
	};
	cartographer?: {
		parentFallbackModels?: string[];
		parentFallbackAllowCrossProvider?: boolean;
	};
};

export type ValidationIssue = {
	path: string;
	message: string;
};

export type ValidationResult = {
	ok: boolean;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
	recommendedFinalFallbacks: string[];
};

export type ApplyResult = ValidationResult & {
	changed: boolean;
	settingsPath: string;
	preview: JsonObject;
	written?: boolean;
};

export type ModelFailureMode = "usage-limit" | "model-unavailable" | "provider-error" | "non-retryable";

export type ModelFailure = {
	retryable: boolean;
	failureMode: ModelFailureMode;
	message: string;
	statusCode?: number;
	resetSeconds?: number;
	resetSecondarySeconds?: number;
};

export type FallbackReceiptEvent = {
	failure_mode: Exclude<ModelFailureMode, "non-retryable">;
	from_model: string;
	to_model: string;
	approved_by: "auto" | "user" | "pre-approved";
	reset_seconds?: number;
	reset_secondary_seconds?: number;
};

export class ModelFallbackError extends Error {
	constructor(
		message: string,
		readonly failure: ModelFailure,
		readonly attempts: string[],
	) {
		super(message);
	}
}

export class CrossProviderApprovalRequiredError extends Error {
	constructor(
		readonly fromModel: string,
		readonly toModel: string,
		readonly failure: ModelFailure,
	) {
		super(`Cross-provider fallback requires approval: ${fromModel} -> ${toModel}`);
	}
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile(filePath: string, fallback: JsonObject = {}): JsonObject {
	if (!fs.existsSync(filePath)) return fallback;
	const raw = fs.readFileSync(filePath, "utf8");
	if (!raw.trim()) return fallback;
	const parsed = JSON.parse(raw) as unknown;
	if (!isObject(parsed)) throw new Error(`${filePath} must contain a JSON object`);
	return parsed;
}

function writeJsonAtomic(filePath: string, value: JsonObject): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
	fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	fs.renameSync(tempPath, filePath);
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function availableModelMap(models: AvailableModel[]): Map<string, AvailableModel> {
	return new Map(models.map((model) => [model.id, model]));
}

function thinkingAllowed(model: AvailableModel | undefined, thinking: string): boolean {
	if (!THINKING_LEVELS.has(thinking)) return false;
	if (!model) return false;
	if (Array.isArray(model.thinking)) return model.thinking.includes(thinking);
	if (model.thinking === true || model.reasoning === true) return true;
	return thinking === "off" || thinking === "minimal";
}

function supportsInputs(model: AvailableModel | undefined, requiredInputs: string[] | undefined): boolean {
	if (!requiredInputs?.length) return true;
	if (!model) return false;
	const supported = new Set(model.input ?? ["text"]);
	return requiredInputs.every((input) => supported.has(input));
}

function isFreeOrSubscriptionFallback(model: AvailableModel): boolean {
	if (model.costTier === "free" || model.costTier === "subscription" || model.costTier === "cheap") return true;
	return model.id === "opencode/big-pickle";
}

export function validateModelConfigProposal(proposal: ModelConfigProposal, models: AvailableModel[]): ValidationResult {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];
	const byId = availableModelMap(models);
	const recommendedFinalFallbacks = models.filter(isFreeOrSubscriptionFallback).map((model) => model.id);

	if (!isObject(proposal)) errors.push({ path: "$", message: "proposal must be an object" });
	const overrides = proposal.subagents?.agentOverrides ?? {};
	if (proposal.subagents !== undefined && !isObject(proposal.subagents)) {
		errors.push({ path: "subagents", message: "subagents must be an object" });
	}
	if (proposal.subagents?.agentOverrides !== undefined && !isObject(proposal.subagents.agentOverrides)) {
		errors.push({ path: "subagents.agentOverrides", message: "agentOverrides must be an object" });
	}

	for (const [agent, override] of Object.entries(overrides)) {
		const base = `subagents.agentOverrides.${agent}`;
		if (!agent.startsWith(CARTOGRAPHER_ROLE_PREFIX)) {
			warnings.push({ path: base, message: "non-Cartographer override will be preserved but is not managed" });
		}
		if (!isObject(override)) {
			errors.push({ path: base, message: "override must be an object" });
			continue;
		}
		if (override.model !== undefined) {
			if (typeof override.model !== "string" || !override.model) {
				errors.push({ path: `${base}.model`, message: "model must be a non-empty string" });
			} else if (!byId.has(override.model)) {
				errors.push({ path: `${base}.model`, message: `unknown model: ${override.model}` });
			}
		}
		if (override.thinking !== undefined) {
			if (typeof override.thinking !== "string" || !THINKING_LEVELS.has(override.thinking)) {
				errors.push({ path: `${base}.thinking`, message: "thinking must be one of off/minimal/low/medium/high/xhigh" });
			} else if (override.model && !thinkingAllowed(byId.get(override.model), override.thinking)) {
				errors.push({
					path: `${base}.thinking`,
					message: `thinking ${override.thinking} is not supported by ${override.model}`,
				});
			}
			if (override.thinking === "xhigh") {
				errors.push({ path: `${base}.thinking`, message: "xhigh must not be written as a default" });
			}
		}
		if (override.fallbackModels !== undefined) {
			if (!Array.isArray(override.fallbackModels)) {
				errors.push({ path: `${base}.fallbackModels`, message: "fallbackModels must be an array" });
			} else if (override.fallbackModels.length === 0 && agent.startsWith(CARTOGRAPHER_ROLE_PREFIX)) {
				warnings.push({ path: `${base}.fallbackModels`, message: "no fallback enabled for Cartographer agent" });
			} else {
				for (const [index, modelId] of override.fallbackModels.entries()) {
					if (typeof modelId !== "string" || !modelId) {
						errors.push({
							path: `${base}.fallbackModels.${index}`,
							message: "fallback model must be a non-empty string",
						});
					} else if (!byId.has(modelId)) {
						errors.push({ path: `${base}.fallbackModels.${index}`, message: `unknown fallback model: ${modelId}` });
					} else if (!supportsInputs(byId.get(modelId), override.requiredInputs)) {
						errors.push({
							path: `${base}.fallbackModels.${index}`,
							message: `${modelId} does not support required inputs`,
						});
					}
				}
			}
		} else if (agent.startsWith(CARTOGRAPHER_ROLE_PREFIX)) {
			warnings.push({ path: `${base}.fallbackModels`, message: "no fallback enabled for Cartographer agent" });
		}
		if (override.requiredInputs !== undefined && !Array.isArray(override.requiredInputs)) {
			errors.push({ path: `${base}.requiredInputs`, message: "requiredInputs must be an array" });
		} else if (override.model && !supportsInputs(byId.get(override.model), override.requiredInputs)) {
			errors.push({ path: `${base}.model`, message: `${override.model} does not support required inputs` });
		}
	}

	const cartographer = proposal.cartographer;
	if (cartographer !== undefined && !isObject(cartographer)) {
		errors.push({ path: "cartographer", message: "cartographer must be an object" });
	}
	const parentFallbackModels = cartographer?.parentFallbackModels;
	if (parentFallbackModels !== undefined) {
		if (!Array.isArray(parentFallbackModels)) {
			errors.push({ path: "cartographer.parentFallbackModels", message: "parentFallbackModels must be an array" });
		} else if (parentFallbackModels.length === 0) {
			warnings.push({ path: "cartographer.parentFallbackModels", message: "parent fallback chain is empty" });
		} else {
			for (const [index, modelId] of parentFallbackModels.entries()) {
				if (typeof modelId !== "string" || !modelId) {
					errors.push({
						path: `cartographer.parentFallbackModels.${index}`,
						message: "fallback model must be a non-empty string",
					});
				} else if (!byId.has(modelId)) {
					errors.push({
						path: `cartographer.parentFallbackModels.${index}`,
						message: `unknown fallback model: ${modelId}`,
					});
				}
			}
		}
	} else {
		warnings.push({ path: "cartographer.parentFallbackModels", message: "no parent fallback chain configured" });
	}
	if (
		cartographer?.parentFallbackAllowCrossProvider !== undefined &&
		typeof cartographer.parentFallbackAllowCrossProvider !== "boolean"
	) {
		errors.push({
			path: "cartographer.parentFallbackAllowCrossProvider",
			message: "parentFallbackAllowCrossProvider must be boolean",
		});
	}

	return { ok: errors.length === 0, errors, warnings, recommendedFinalFallbacks };
}

function nestedString(value: unknown, pathParts: string[]): string | undefined {
	let current: unknown = value;
	for (const part of pathParts) {
		if (!isObject(current)) return undefined;
		current = current[part];
	}
	return typeof current === "string" ? current : undefined;
}

function nestedNumber(value: unknown, pathParts: string[]): number | undefined {
	let current: unknown = value;
	for (const part of pathParts) {
		if (!isObject(current)) return undefined;
		current = current[part];
	}
	return typeof current === "number" ? current : undefined;
}

function errorHeaders(error: unknown): Record<string, unknown> {
	if (!isObject(error)) return {};
	const headers = error.headers;
	return isObject(headers) ? headers : {};
}

function headerNumber(headers: Record<string, unknown>, name: string): number | undefined {
	const value = headers[name] ?? headers[name.toLowerCase()];
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

export function classifyModelError(error: unknown): ModelFailure {
	const statusCode = nestedNumber(error, ["status_code"]) ?? nestedNumber(error, ["statusCode"]);
	const type = nestedString(error, ["error", "type"]) ?? nestedString(error, ["type"]);
	const message =
		nestedString(error, ["error", "message"]) ??
		nestedString(error, ["message"]) ??
		(error instanceof Error ? error.message : String(error));
	const headers = errorHeaders(error);
	const resetSeconds = headerNumber(headers, "X-Codex-Primary-Reset-After-Seconds");
	const resetSecondarySeconds = headerNumber(headers, "X-Codex-Secondary-Reset-After-Seconds");
	const lower = message.toLowerCase();

	if (statusCode === 429 || type === "usage_limit_reached" || lower.includes("usage_limit_reached")) {
		return { retryable: true, failureMode: "usage-limit", message, statusCode, resetSeconds, resetSecondarySeconds };
	}
	if (
		type === "model_not_found" ||
		lower.includes("model not found") ||
		lower.includes("model not supported") ||
		lower.includes("model unavailable")
	) {
		return {
			retryable: true,
			failureMode: "model-unavailable",
			message,
			statusCode,
			resetSeconds,
			resetSecondarySeconds,
		};
	}
	if (statusCode === 503 || statusCode === 502 || statusCode === 504 || lower.includes("timeout")) {
		return { retryable: true, failureMode: "provider-error", message, statusCode, resetSeconds, resetSecondarySeconds };
	}
	return { retryable: false, failureMode: "non-retryable", message, statusCode, resetSeconds, resetSecondarySeconds };
}

function providerOf(modelId: string): string {
	return modelId.split("/")[0] ?? modelId;
}

export function crossesProvider(fromModel: string, toModel: string): boolean {
	return providerOf(fromModel) !== providerOf(toModel);
}

export async function executeWithModelFallback<T>(params: {
	models: string[];
	invoke: (model: string, attemptIndex: number) => Promise<T>;
	allowCrossProvider?: boolean;
	approveCrossProvider?: (event: {
		fromModel: string;
		toModel: string;
		failure: ModelFailure;
	}) => Promise<boolean> | boolean;
	onFallback?: (event: FallbackReceiptEvent) => Promise<void> | void;
}): Promise<T> {
	const attempts: string[] = [];
	let lastFailure: ModelFailure | undefined;
	for (let index = 0; index < params.models.length; index += 1) {
		const model = params.models[index];
		attempts.push(model);
		try {
			return await params.invoke(model, index);
		} catch (error) {
			const failure = classifyModelError(error);
			lastFailure = failure;
			const nextModel = params.models[index + 1];
			if (!failure.retryable || !nextModel) {
				throw new ModelFallbackError(
					`Model call failed after ${attempts.length} attempt(s): ${failure.message}`,
					failure,
					attempts,
				);
			}
			let approvedBy: FallbackReceiptEvent["approved_by"] = "auto";
			if (crossesProvider(model, nextModel)) {
				if (params.allowCrossProvider) approvedBy = "pre-approved";
				else {
					const approved = await params.approveCrossProvider?.({ fromModel: model, toModel: nextModel, failure });
					if (!approved) throw new CrossProviderApprovalRequiredError(model, nextModel, failure);
					approvedBy = "user";
				}
			}
			await params.onFallback?.({
				failure_mode: failure.failureMode as Exclude<ModelFailureMode, "non-retryable">,
				from_model: model,
				to_model: nextModel,
				approved_by: approvedBy,
				reset_seconds: failure.resetSeconds,
				reset_secondary_seconds: failure.resetSecondarySeconds,
			});
		}
	}
	throw new ModelFallbackError(
		"Model call failed with exhausted fallback chain",
		lastFailure ?? {
			retryable: false,
			failureMode: "non-retryable",
			message: "no models configured",
		},
		attempts,
	);
}

export function mergeSettings(
	existing: JsonObject,
	proposal: ModelConfigProposal,
	options: { force?: boolean } = {},
): JsonObject {
	const merged = cloneJson(existing);
	if (!isObject(merged.subagents)) merged.subagents = {};
	const subagents = merged.subagents as JsonObject;
	if (!isObject(subagents.agentOverrides)) subagents.agentOverrides = {};
	const existingOverrides = subagents.agentOverrides as JsonObject;
	for (const [agent, override] of Object.entries(proposal.subagents?.agentOverrides ?? {})) {
		const current = isObject(existingOverrides[agent]) ? (existingOverrides[agent] as JsonObject) : {};
		existingOverrides[agent] = options.force ? { ...current, ...override } : { ...override, ...current };
	}
	if (!isObject(merged.cartographer)) merged.cartographer = {};
	const cartographer = merged.cartographer as JsonObject;
	for (const [key, value] of Object.entries(proposal.cartographer ?? {})) {
		if (options.force || cartographer[key] === undefined) cartographer[key] = value;
	}
	return merged;
}

export function previewSettingsUpdate(params: {
	settingsPath: string;
	proposal: ModelConfigProposal;
	models: AvailableModel[];
	force?: boolean;
}): ApplyResult {
	const validation = validateModelConfigProposal(params.proposal, params.models);
	const existing = readJsonFile(params.settingsPath, {});
	const preview = validation.ok ? mergeSettings(existing, params.proposal, { force: params.force }) : existing;
	return {
		...validation,
		changed: JSON.stringify(existing) !== JSON.stringify(preview),
		settingsPath: params.settingsPath,
		preview,
	};
}

export function applySettingsUpdate(params: {
	settingsPath: string;
	proposal: ModelConfigProposal;
	models: AvailableModel[];
	force?: boolean;
}): ApplyResult {
	const result = previewSettingsUpdate(params);
	if (!result.ok) return { ...result, written: false };
	writeJsonAtomic(params.settingsPath, result.preview);
	return { ...result, written: true };
}

function parseArgs(argv: string[]): { command: string; options: Record<string, string | boolean> } {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") usage(0);
	const options: Record<string, string | boolean> = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
		const name = token.slice(2);
		if (["json", "force"].includes(name)) {
			options[name] = true;
			continue;
		}
		const value = rest[index + 1];
		if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
		options[name] = value;
		index += 1;
	}
	return { command, options };
}

function usage(exitCode: number): never {
	console.log(`Usage:
  model_config.ts validate --proposal <json> --models <json> [--json]
  model_config.ts preview --settings <path> --proposal <json> --models <json> [--force] [--json]
  model_config.ts apply --settings <path> --proposal <json> --models <json> [--force] [--json]

The proposal and models paths must contain JSON. Tests should pass a temp --settings path, never real user settings.`);
	process.exit(exitCode);
}

function requiredString(options: Record<string, string | boolean>, name: string): string {
	const value = options[name];
	if (typeof value !== "string" || !value) throw new Error(`Missing --${name}`);
	return value;
}

function loadProposal(filePath: string): ModelConfigProposal {
	return readJsonFile(filePath, {}) as ModelConfigProposal;
}

function loadModels(filePath: string): AvailableModel[] {
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
	if (!Array.isArray(parsed)) throw new Error("models file must contain an array");
	return parsed as AvailableModel[];
}

function printResult(result: unknown, json: boolean): void {
	if (json) console.log(JSON.stringify(result, null, 2));
	else console.log(result);
}

function main(): number {
	const { command, options } = parseArgs(process.argv.slice(2));
	const proposal = loadProposal(requiredString(options, "proposal"));
	const models = loadModels(requiredString(options, "models"));
	let result: unknown;
	if (command === "validate") {
		result = validateModelConfigProposal(proposal, models);
	} else if (command === "preview" || command === "apply") {
		const settingsPath = requiredString(options, "settings");
		result =
			command === "preview"
				? previewSettingsUpdate({ settingsPath, proposal, models, force: Boolean(options.force) })
				: applySettingsUpdate({ settingsPath, proposal, models, force: Boolean(options.force) });
	} else {
		throw new Error(`Unknown command: ${command}`);
	}
	printResult(result, Boolean(options.json));
	return (result as { ok?: boolean }).ok === false ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
