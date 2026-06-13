import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	CrossProviderApprovalRequiredError,
	ModelFallbackError,
	applySettingsUpdate,
	classifyModelError,
	executeWithModelFallback,
	mergeSettings,
	previewSettingsUpdate,
	validateModelConfigProposal,
	type AvailableModel,
	type ModelConfigProposal,
} from "../skills/plan/scripts/model_config.ts";

const models: AvailableModel[] = [
	{
		id: "openai-codex/gpt-5.5",
		reasoning: true,
		thinking: ["minimal", "low", "medium", "high", "xhigh"],
		input: ["text", "image"],
		costTier: "subscription",
	},
	{
		id: "openai-codex/gpt-5.4-mini",
		reasoning: true,
		thinking: ["minimal", "low", "medium", "high"],
		input: ["text", "image"],
		costTier: "subscription",
	},
	{
		id: "openai-codex/gpt-5.3-codex-spark",
		reasoning: true,
		thinking: ["minimal", "low", "medium"],
		input: ["text"],
		costTier: "subscription",
	},
	{
		id: "opencode/big-pickle",
		reasoning: true,
		thinking: ["minimal", "low", "medium"],
		input: ["text"],
		costTier: "free",
	},
];

function tempSettingsPath(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "model-config-")), "settings.json");
}

function validProposal(): ModelConfigProposal {
	return {
		subagents: {
			agentOverrides: {
				"cartographer-drafter": {
					model: "openai-codex/gpt-5.3-codex-spark",
					thinking: "medium",
					fallbackModels: ["openai-codex/gpt-5.4-mini", "opencode/big-pickle"],
				},
				"cartographer-auditor": {
					model: "openai-codex/gpt-5.5",
					thinking: "medium",
					fallbackModels: ["openai-codex/gpt-5.4-mini", "opencode/big-pickle"],
				},
			},
		},
		cartographer: {
			parentFallbackModels: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4-mini", "opencode/big-pickle"],
			parentFallbackAllowCrossProvider: false,
		},
	};
}

describe("model config validation", () => {
	it("accepts a valid Cartographer model config proposal and recommends free/subscription fallbacks", () => {
		const result = validateModelConfigProposal(validProposal(), models);
		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.recommendedFinalFallbacks).toContain("opencode/big-pickle");
	});

	it("rejects unknown model ids, invalid thinking levels, and xhigh defaults", () => {
		const result = validateModelConfigProposal(
			{
				subagents: {
					agentOverrides: {
						"cartographer-auditor": {
							model: "missing/model",
							thinking: "xhigh",
							fallbackModels: ["also/missing"],
						},
					},
				},
				cartographer: { parentFallbackModels: ["missing/model"] },
			},
			models,
		);
		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.message).join("\n")).toContain("unknown model");
		expect(result.errors.map((error) => error.message).join("\n")).toContain("xhigh must not be written as a default");
	});

	it("rejects model/input modality mismatches such as Spark for image roles", () => {
		const result = validateModelConfigProposal(
			{
				subagents: {
					agentOverrides: {
						"cartographer-drafter": {
							model: "openai-codex/gpt-5.3-codex-spark",
							thinking: "medium",
							fallbackModels: ["openai-codex/gpt-5.4-mini"],
							requiredInputs: ["image"],
						},
					},
				},
				cartographer: { parentFallbackModels: ["openai-codex/gpt-5.5"] },
			},
			models,
		);
		expect(result.ok).toBe(false);
		expect(result.errors.some((error) => error.message.includes("does not support required inputs"))).toBe(true);
	});

	it("warns when Cartographer roles or parent fallback have no fallback enabled", () => {
		const result = validateModelConfigProposal(
			{
				subagents: {
					agentOverrides: { "cartographer-auditor": { model: "openai-codex/gpt-5.5", thinking: "medium" } },
				},
				cartographer: { parentFallbackModels: [] },
			},
			models,
		);
		expect(result.ok).toBe(true);
		expect(result.warnings.map((warning) => warning.message)).toContain("no fallback enabled for Cartographer agent");
		expect(result.warnings.map((warning) => warning.message)).toContain("parent fallback chain is empty");
	});

	it("warns when Cartographer fallbackModels is explicitly empty", () => {
		const result = validateModelConfigProposal(
			{
				subagents: {
					agentOverrides: {
						"cartographer-auditor": {
							model: "openai-codex/gpt-5.5",
							thinking: "medium",
							fallbackModels: [],
						},
					},
				},
				cartographer: { parentFallbackModels: ["openai-codex/gpt-5.5"] },
			},
			models,
		);
		expect(result.ok).toBe(true);
		expect(result.warnings.map((warning) => warning.message)).toContain("no fallback enabled for Cartographer agent");
	});

	it("rejects fallback models that do not support required inputs", () => {
		const result = validateModelConfigProposal(
			{
				subagents: {
					agentOverrides: {
						"cartographer-auditor": {
							model: "openai-codex/gpt-5.5",
							thinking: "medium",
							fallbackModels: ["opencode/big-pickle"],
							requiredInputs: ["image"],
						},
					},
				},
				cartographer: { parentFallbackModels: ["openai-codex/gpt-5.5"] },
			},
			models,
		);
		expect(result.ok).toBe(false);
		expect(
			result.errors.some((error) => error.message.includes("opencode/big-pickle does not support required inputs")),
		).toBe(true);
	});
});

describe("model fallback runtime helpers", () => {
	it("classifies Codex usage-limit errors and extracts reset headers", () => {
		const failure = classifyModelError({
			status_code: 429,
			error: { type: "usage_limit_reached", message: "The usage limit has been reached" },
			headers: {
				"X-Codex-Primary-Reset-After-Seconds": "123",
				"X-Codex-Secondary-Reset-After-Seconds": "456",
			},
		});
		expect(failure.retryable).toBe(true);
		expect(failure.failureMode).toBe("usage-limit");
		expect(failure.resetSeconds).toBe(123);
		expect(failure.resetSecondarySeconds).toBe(456);
	});

	it("classifies model-unavailable and provider-transient errors", () => {
		expect(classifyModelError({ error: { type: "model_not_found", message: "model not supported" } })).toMatchObject({
			retryable: true,
			failureMode: "model-unavailable",
		});
		expect(classifyModelError({ status_code: 503, message: "provider unavailable" })).toMatchObject({
			retryable: true,
			failureMode: "provider-error",
		});
		expect(classifyModelError({ message: "request timeout" })).toMatchObject({
			retryable: true,
			failureMode: "provider-error",
		});
	});

	it("retries same-provider fallback automatically and records a receipt event", async () => {
		const events: unknown[] = [];
		const attempts: string[] = [];
		const result = await executeWithModelFallback({
			models: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4-mini"],
			invoke: async (model) => {
				attempts.push(model);
				if (model === "openai-codex/gpt-5.5") throw { status_code: 429, error: { type: "usage_limit_reached" } };
				return "ok";
			},
			onFallback: (event) => events.push(event),
		});
		expect(result).toBe("ok");
		expect(attempts).toEqual(["openai-codex/gpt-5.5", "openai-codex/gpt-5.4-mini"]);
		expect(events).toEqual([
			{
				failure_mode: "usage-limit",
				from_model: "openai-codex/gpt-5.5",
				to_model: "openai-codex/gpt-5.4-mini",
				approved_by: "auto",
				reset_seconds: undefined,
				reset_secondary_seconds: undefined,
			},
		]);
	});

	it("requires approval before cross-provider fallback and proceeds when approved", async () => {
		const events: unknown[] = [];
		const result = await executeWithModelFallback({
			models: ["openai-codex/gpt-5.5", "opencode/big-pickle"],
			invoke: async (model) => {
				if (model === "openai-codex/gpt-5.5") throw { status_code: 429, error: { type: "usage_limit_reached" } };
				return model;
			},
			approveCrossProvider: () => true,
			onFallback: (event) => events.push(event),
		});
		expect(result).toBe("opencode/big-pickle");
		expect(events).toMatchObject([{ approved_by: "user", to_model: "opencode/big-pickle" }]);
	});

	it("uses pre-approved mode for cross-provider fallback when allowed", async () => {
		const events: unknown[] = [];
		let approvalCalls = 0;
		const result = await executeWithModelFallback({
			models: ["openai-codex/gpt-5.5", "opencode/big-pickle"],
			allowCrossProvider: true,
			invoke: async (model) => {
				if (model === "openai-codex/gpt-5.5") throw { status_code: 429, error: { type: "usage_limit_reached" } };
				return model;
			},
			approveCrossProvider: () => {
				approvalCalls += 1;
				return false;
			},
			onFallback: (event) => events.push(event),
		});
		expect(result).toBe("opencode/big-pickle");
		expect(approvalCalls).toBe(0);
		expect(events).toMatchObject([{ approved_by: "pre-approved", to_model: "opencode/big-pickle" }]);
	});

	it("stops before cross-provider fallback when approval is declined", async () => {
		await expect(
			executeWithModelFallback({
				models: ["openai-codex/gpt-5.5", "opencode/big-pickle"],
				invoke: async () => {
					throw { status_code: 429, error: { type: "usage_limit_reached" } };
				},
				approveCrossProvider: () => false,
			}),
		).rejects.toBeInstanceOf(CrossProviderApprovalRequiredError);
	});

	it("throws with attempts when fallback chain is exhausted", async () => {
		await expect(
			executeWithModelFallback({
				models: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4-mini"],
				invoke: async () => {
					throw { status_code: 503, message: "provider timeout" };
				},
			}),
		).rejects.toMatchObject({ attempts: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4-mini"] });
	});

	it("does not retry non-retryable errors", async () => {
		const attempts: string[] = [];
		await expect(
			executeWithModelFallback({
				models: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4-mini"],
				invoke: async (model) => {
					attempts.push(model);
					throw new Error("bad request");
				},
			}),
		).rejects.toMatchObject({ attempts: ["openai-codex/gpt-5.5"] });
		expect(attempts).toEqual(["openai-codex/gpt-5.5"]);
	});
});

describe("model config settings writes", () => {
	it("creates a missing settings file atomically from a valid proposal", () => {
		const settingsPath = tempSettingsPath();
		const result = applySettingsUpdate({ settingsPath, proposal: validProposal(), models });
		expect(result.ok).toBe(true);
		expect(result.written).toBe(true);
		const written = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
		expect(written.cartographer.parentFallbackModels).toEqual([
			"openai-codex/gpt-5.5",
			"openai-codex/gpt-5.4-mini",
			"opencode/big-pickle",
		]);
		expect(written.subagents.agentOverrides["cartographer-drafter"].model).toBe("openai-codex/gpt-5.3-codex-spark");
	});

	it("preserves unrelated settings and existing user overrides unless force is supplied", () => {
		const existing = {
			theme: "catppuccin",
			subagents: { agentOverrides: { "cartographer-drafter": { model: "opencode/big-pickle" } } },
			cartographer: { parentFallbackModels: ["opencode/big-pickle"] },
		};
		const merged = mergeSettings(existing, validProposal());
		expect(merged.theme).toBe("catppuccin");
		expect((merged.subagents as any).agentOverrides["cartographer-drafter"].model).toBe("opencode/big-pickle");
		expect((merged.cartographer as any).parentFallbackModels).toEqual(["opencode/big-pickle"]);

		const forced = mergeSettings(existing, validProposal(), { force: true });
		expect((forced.subagents as any).agentOverrides["cartographer-drafter"].model).toBe(
			"openai-codex/gpt-5.3-codex-spark",
		);
	});

	it("preview mode does not write a settings file", () => {
		const settingsPath = tempSettingsPath();
		const result = previewSettingsUpdate({ settingsPath, proposal: validProposal(), models });
		expect(result.ok).toBe(true);
		expect(result.changed).toBe(true);
		expect(fs.existsSync(settingsPath)).toBe(false);
	});
});
