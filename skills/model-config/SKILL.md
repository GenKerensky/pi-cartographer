---
name: "model-config"
description: "Interactive Cartographer model routing setup workflow for user-scope provider/model settings, fallback chains, and orchestrator recommendations."
version: 1
created: "2026-06-13"
updated: "2026-06-13"
---

# Pi Cartographer Model Config Setup

## When to Use

Use this skill when Cartographer detects missing or partial model-routing configuration in `~/.pi/agent/settings.json`, or when the user asks to configure Cartographer models, reasoning levels, providers, or fallback chains.

This skill is invoked by the main agent. It is an interactive setup workflow: the main agent explains provider/model tradeoffs, asks the user to choose which providers Cartographer may use, previews the resulting settings, then delegates writes to the deterministic settings writer script.

Do **not** edit `~/.pi/agent/settings.json` free-form. All settings writes must go through `skills/plan/scripts/model_config.ts`.

## Inputs

- Current user settings path: `~/.pi/agent/settings.json`
- Available Pi providers/models for the current user/session
- Existing `subagents.agentOverrides` and `cartographer` settings when present
- User provider preferences and cross-provider approval preference

## Outputs

- Preview of proposed user settings changes
- Optional write to `~/.pi/agent/settings.json`, performed by `model_config.ts apply`
- Warnings for missing fallbacks, paid/cross-provider fallback, privacy-sensitive fallback, and unavailable models

## Workflow

1. **Detect missing or partial config**
   - Missing settings file.
   - Missing `subagents.agentOverrides` for Cartographer agents.
   - Missing `cartographer.parentFallbackModels`.
   - Empty `fallbackModels` for any Cartographer agent.

2. **Inspect available providers/models**
   - Use Pi model/provider metadata when available.
   - Keep provider/model IDs exact.
   - Do not invent model IDs.
   - Capture model capabilities when available: thinking/reasoning support, input modality, context window, cost/subscription class, and speed/latency class.

3. **Ask provider menu**
   - Ask the user which providers Cartographer may use.
   - Recommend Codex subscription models when available for the default route.
   - If a subscription/free fallback exists, such as OpenCode Zen `opencode/big-pickle`, suggest it as a final fallback for suitable agents.
   - Mark API-key providers or direct-token providers as possible paid usage.
   - For privacy-sensitive flows, especially `cartographer-redactor`, warn before recommending non-Codex/free-provider fallback.

4. **Recommend role-specific models**

   | Role                     | Recommendation criteria                                                                                                                             |
   | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Main orchestrator        | Best available reasoning and tool reliability at balanced thinking. Recommend `openai-codex/gpt-5.5` with `medium` thinking when Codex is selected. |
   | `cartographer-drafter`   | Fastest low-cost text coding model with adequate context. Recommend `openai-codex/gpt-5.3-codex-spark` when available.                              |
   | `cartographer-archivist` | Lower-cost model suitable for research compression. Recommend `openai-codex/gpt-5.4-mini` when available.                                           |
   | `cartographer-auditor`   | Strong reasoning model. Recommend `openai-codex/gpt-5.5` with `medium`; escalate to `high` only with justification.                                 |
   | `cartographer-compass`   | Strong reasoning model for decisions. Recommend `openai-codex/gpt-5.5` with `medium`.                                                               |
   | `cartographer-redactor`  | Prioritize privacy/safety reliability over cost. Recommend `openai-codex/gpt-5.5` with `medium`; require explicit caveat for non-Codex fallback.    |

5. **Recommend main orchestrator model**
   - Recommend a thinking-capable model for the user to select as the main Pi orchestrator.
   - For OpenAI Codex subscription, recommend `openai-codex/gpt-5.5` with `medium` thinking.
   - Explain that this does not automatically hot-swap Pi's active model; the user must select it in Pi when desired.

6. **Warn on no fallback**
   - Warn if parent fallback chain is absent or empty.
   - Warn if any Cartographer agent has no fallback enabled.
   - Suggest a final fallback such as `opencode/big-pickle` when available and suitable.

7. **Preview settings**
   - Generate a structured proposal JSON.
   - Run:
     ```bash
     node --experimental-strip-types skills/plan/scripts/model_config.ts preview \
       --settings "$HOME/.pi/agent/settings.json" \
       --proposal <proposal-json-file> \
       --models <available-models-json-file> \
       --json
     ```
   - Show the diff/preview and warnings to the user.

8. **Confirm and apply**
   - Ask for confirmation before writing.
   - If approved, run:
     ```bash
     node --experimental-strip-types skills/plan/scripts/model_config.ts apply \
       --settings "$HOME/.pi/agent/settings.json" \
       --proposal <proposal-json-file> \
       --models <available-models-json-file> \
       --json
     ```
   - Use `--force` only when the user explicitly approves overwriting existing values.

## Deterministic Writer Contract

The setup workflow must use `skills/plan/scripts/model_config.ts` for settings writes. The script validates:

- proposed config shape;
- model IDs against the available Pi model list;
- thinking levels against model capabilities;
- modality constraints, including Spark not being used for image/vision-required roles;
- fallback model compatibility with required inputs;
- no `xhigh` defaults;
- missing or empty fallback chains.

The script preserves unrelated settings, writes atomically, and emits machine-readable JSON output. It should be tested with temp settings paths only.

## Safety Rules

- Do not silently mutate user settings.
- Do not write settings during runtime fallback.
- Do not use direct LLM edits for JSON settings.
- Do not recommend paid/cross-provider fallback without a clear cost warning.
- Do not recommend non-Codex redactor fallback without a privacy/safety caveat.
- Do not use `xhigh` as a default.

## Verification Checklist

Before considering setup complete:

- Provider choices were shown to the user.
- Role-specific recommendations were shown.
- Main orchestrator model/thinking recommendation was shown.
- No-fallback warnings were shown when applicable.
- Free/subscription final fallback suggestions were shown when available.
- Preview was validated by `model_config.ts preview`.
- User confirmed before `model_config.ts apply`.
- The apply command succeeded or the workflow stopped with a clear error.
