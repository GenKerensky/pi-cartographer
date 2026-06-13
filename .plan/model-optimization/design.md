# model-optimization Design

## Overview

This design implements the approved requirements for Cartographer model routing, reasoning-level governance, and automated fallback behavior under an OpenAI Codex subscription. It keeps subscription management user-owned, preserves Cartographer's parent single-writer discipline, and uses deterministic receipts for every non-default escalation or fallback.

## Decision D001 User Scope Settings as Canonical Config

Use `~/.pi/agent/settings.json` as the canonical configuration surface for model optimization. This keeps subscription limits, API-key provider preferences, fallback chains, and personal budget controls under the end user's control across repositories.

Configuration responsibilities:

- `subagents.agentOverrides` remains the existing subagent override mechanism for `model`, `thinking`, and `fallbackModels` [REQ-11].
- Add `cartographer.parentFallbackModels` for parent/workflow fallback retry ordering [REQ-15].
- Add optional `cartographer.parentFallbackAllowCrossProvider` for pre-approved non-interactive/CI cross-provider fallback [REQ-13].

Rejected default: project `.pi/settings.json` as the primary location. Project defaults are useful for shared documentation, but subscription/provider fallback is personal and may create surprise cost if committed as shared policy.

Example:

```json
{
  "subagents": {
    "agentOverrides": {
      "cartographer-drafter": {
        "model": "openai-codex/gpt-5.3-codex-spark",
        "thinking": "medium",
        "fallbackModels": ["openai-codex/gpt-5.4-mini"]
      },
      "cartographer-auditor": {
        "model": "openai-codex/gpt-5.5",
        "thinking": "medium",
        "fallbackModels": ["openai-codex/gpt-5.4-mini", "opencode/big-pickle"]
      }
    }
  },
  "cartographer": {
    "parentFallbackModels": [
      "openai-codex/gpt-5.5",
      "openai-codex/gpt-5.4-mini",
      "opencode/big-pickle"
    ],
    "parentFallbackAllowCrossProvider": false
  }
}
```

## Decision D002 Role Based Model Routing Matrix

Use a fixed role-based routing matrix as the default policy. This matrix is encoded in docs/examples and in user settings, not by editing every agent prompt unless packaging later requires self-contained defaults.

| Role | Default model | Thinking | Fallback |
| --- | --- | --- | --- |
| Parent/current orchestrator | `openai-codex/gpt-5.5` | `medium` | `cartographer.parentFallbackModels` |
| `cartographer-drafter` | `openai-codex/gpt-5.3-codex-spark` | `medium`, optionally `low` | `openai-codex/gpt-5.4-mini` |
| `cartographer-archivist` | `openai-codex/gpt-5.4-mini` | `medium` | `opencode/big-pickle` |
| `cartographer-auditor` | `openai-codex/gpt-5.5` | `medium` | `openai-codex/gpt-5.4-mini`, then approved cross-provider fallback |
| `cartographer-compass` | `openai-codex/gpt-5.5` | `medium` | `openai-codex/gpt-5.4-mini` |
| `cartographer-redactor` | `openai-codex/gpt-5.5` | `medium` | `openai-codex/gpt-5.4-mini`; cross-provider only with explicit approval |

This satisfies the parent, drafter, auditor, compass, redactor, and archivist routing requirements [REQ-01] [REQ-06] [REQ-07] [REQ-08] [REQ-09] [REQ-10].

## Decision D003 Workflow Fallback Wrapper

Add a Cartographer-owned fallback wrapper around model-using handoff/workflow steps. The wrapper does not replace Pi's core model selection. Instead, it wraps Cartographer's own subagent/handoff invocations and retryable workflow steps.

Wrapper flow:

1. Execute the intended model call.
2. If it succeeds, return normally.
3. If it fails with `usage_limit_reached`, HTTP 429, model unavailable, or transient provider failure, classify the failure.
4. Parse provider metadata, including Codex reset headers when present.
5. Choose the next fallback model from the configured chain.
6. If the fallback crosses provider boundary, route through the approval gate.
7. Append fallback receipt.
8. Retry the same logical step with the fallback model.
9. Stop once the chain is exhausted or user declines cross-provider fallback.

The wrapper keeps retries bounded by the chain length and records each fallback attempt [REQ-12] [REQ-14].

## Decision D004 Cross Provider Approval Gate

Cross-provider fallback is allowed only after explicit approval, unless `cartographer.parentFallbackAllowCrossProvider` or an equivalent CLI flag pre-approves it for CI/non-interactive runs.

Interactive prompt content:

- failed model and provider;
- proposed fallback model and provider;
- Codex primary/secondary reset time if available;
- warning that API-key provider fallback may incur direct token cost;
- approve/decline choice.

Within-Codex fallback is approved automatically and recorded as `approved_by: "auto"`. Cross-provider fallback records `approved_by: "user"` or `approved_by: "pre-approved"` [REQ-13].

## Decision D005 Reasoning Escalation Policy

Keep `medium` as the default reasoning level for all high-quality Codex roles. `high` requires a recorded justification, and `xhigh` requires explicit human approval.

Escalation rules:

- `medium -> high`: allowed when prior validation/audit failed, repeated contradictions exist, or the step is a final architecture/ADR/policy gate [REQ-04].
- `high -> xhigh`: never automatic; requires approval receipt and reason [REQ-03].
- `xhigh` cannot appear in default settings, agent frontmatter, or routing examples [REQ-02].
- Spark is not used for image/vision tasks [REQ-05].

## Alternative A001 Project Settings as Primary Config

Project `.pi/settings.json` was considered as the primary config surface. It was rejected because subscription/provider fallback is personal, and committed repo config could push surprise provider costs onto users. Project config may still contain examples or recommended snippets, but user settings are canonical.

## Alternative A002 Agent Frontmatter Pins

Agent frontmatter model pins were considered. They were rejected as the primary mechanism because they are less flexible for end users and make subscription/provider preferences harder to override globally. Frontmatter pins may be revisited only if Cartographer packages need self-describing defaults.

## Alternative A003 Pi Core Parent Fallback

Adding fallback directly to Pi's parent model runtime was considered. It is out of scope for Cartographer. Cartographer will implement a workflow-level wrapper for Cartographer-controlled handoffs and retryable workflow steps.

## Alternative A004 No Automatic Fallback

Stopping immediately on usage limits was considered. It was rejected because it interrupts long-running Cartographer workflows and forces manual resumption even when a safe same-provider fallback exists.

## Components

### Component C001 Settings Reader

Reads `~/.pi/agent/settings.json` and extracts `subagents.agentOverrides`, `cartographer.parentFallbackModels`, and `cartographer.parentFallbackAllowCrossProvider`. It must tolerate missing config and fall back to documented defaults.

### Component C007 Config Setup Workflow Skill

Provides an interactive setup workflow/skill invoked by the main agent when `~/.pi/agent/settings.json` is missing, or when required Cartographer model-routing keys are missing or partial. It replaces a blind CLI bootstrap with a guided provider/model selection flow.

Invocation behavior:

1. Runtime/config validation detects missing or partial `subagents.agentOverrides` or `cartographer.parentFallbackModels`.
2. The main agent invokes a dedicated setup skill/workflow, for example `cartographer model setup` or a `model-config` skill.
3. The workflow reads available providers/models from Pi model metadata and existing user settings.
4. The workflow asks the user which providers they want Cartographer to use.
5. For the selected providers, the workflow recommends models for each Cartographer role using role-specific criteria:
   - cost/subscription impact;
   - speed/latency;
   - thinking/reasoning capability;
   - context window;
   - text/image modality;
   - privacy/safety sensitivity.
6. The workflow recommends a main orchestrator model and thinking level for the user to select in Pi.
7. The workflow presents a preview/diff of the proposed `~/.pi/agent/settings.json` changes.
8. The workflow warns if any Cartographer role or parent fallback chain would have no fallback enabled.
9. If a subscription-backed/free provider model is available (for example OpenCode Zen `opencode/big-pickle`), the workflow recommends it as a final fallback for suitable agents and parent fallback chains. For privacy-sensitive roles such as `cartographer-redactor`, it must clearly mark this as opt-in and explain the quality/privacy tradeoff.
10. The workflow asks for confirmation before writing.
11. On write, it calls a deterministic settings writer script that preserves unrelated settings, avoids overwriting existing user choices unless explicitly approved, validates inputs, and writes atomically via temp file + rename.

Deterministic writer requirements:

- Accept proposed settings as structured JSON input from the setup workflow.
- Validate the proposed settings against a JSON Schema before writing.
- Validate provider/model IDs programmatically against Pi's available model list for the current user/session.
- Reject unknown models, unsupported thinking levels, malformed fallback chains, or incompatible modality choices.
- Emit a machine-readable summary of changes, warnings, and validation failures.
- Never let the LLM directly edit `~/.pi/agent/settings.json` free-form.

Provider menu example:

- OpenAI Codex subscription: recommended for Cartographer defaults when available.
- Existing default provider: recommended as fallback if user approves direct-cost/cross-provider use.
- API-key providers: offered only when credentials/models are available; marked as possible direct token cost.
- Local models: allowed for low-risk drafting/research if available, but not recommended for audit/redaction unless user explicitly accepts quality tradeoff.

Recommendation output example:

| Role | Recommendation basis |
| --- | --- |
| Main orchestrator | Best available reasoning + tool reliability at balanced thinking; recommend `gpt-5.5 medium` when Codex is selected. If a free/subscription fallback such as `opencode/big-pickle` is available, suggest it as final fallback after Codex models. |
| Drafter | Prefer fastest low-cost text coding model with adequate context; recommend Spark when available. Suggest free/subscription fallback when available. |
| Archivist | Prefer lower-cost medium-context model; recommend `gpt-5.4-mini`. Suggest free/subscription fallback when available. |
| Auditor/Compass | Prefer strongest reasoning model; recommend `gpt-5.5 medium`, high only with justification. Suggest free/subscription fallback only as final fallback with quality caveat. |
| Redactor | Prefer privacy/safety reliability over cost; recommend `gpt-5.5 medium`. Warn before any non-Codex/free-provider fallback due to privacy and quality tradeoffs. |

The setup workflow is assistance, not hidden mutation. Runtime fallback should warn on missing config and invite the user to run the workflow; it should not silently rewrite settings mid-workflow.

### Component C008 Deterministic Settings Writer

A deterministic script owns writes to `~/.pi/agent/settings.json`. The setup workflow gathers user preferences and produces structured proposed settings, but this script validates and applies them.

Writer responsibilities:

- Define and enforce a JSON Schema for `cartographer.parentFallbackModels`, `cartographer.parentFallbackAllowCrossProvider`, and Cartographer-relevant `subagents.agentOverrides` entries.
- Query or receive Pi's available model list for the current user/session.
- Validate every provider/model ID in `model` and `fallbackModels` against available models.
- Validate supported thinking levels against model capabilities.
- Validate modality constraints, especially preventing Spark from being selected for image/vision roles.
- Warn when a role has no fallback model.
- Detect subscription/free models such as `opencode/big-pickle` when available and report whether they are suitable final fallback candidates.
- Preserve unrelated settings.
- Write atomically via temporary file + rename.
- Emit machine-readable JSON output describing changes, warnings, rejected entries, and final status.

### Component C002 Failure Classifier

Normalizes provider/model errors into `usage-limit`, `model-unavailable`, `provider-error`, or non-retryable failure. It parses Codex headers such as `X-Codex-Primary-Reset-After-Seconds` and `X-Codex-Secondary-Reset-After-Seconds`.

### Component C003 Fallback Executor

Runs the bounded retry loop for Cartographer-owned model calls, selects the next fallback model, invokes the approval gate when needed, records receipts, and stops when the chain is exhausted.

### Component C004 Approval Gate

Handles interactive and non-interactive cross-provider approval. It displays reset-time and cost warnings and returns approved/declined/pre-approved outcomes.

### Component C005 Receipt Writer

Appends deterministic fallback and escalation receipts with the schema required by [REQ-14]. Existing `cartographer_handoff fallback` should be reused where compatible; otherwise add a wrapper-compatible receipt helper.

### Component C006 Validation Checks

Adds tests or scripts that verify no `xhigh` defaults, expected model routing examples, fallback receipt schema, cross-provider guard behavior, simulated Codex 429 retry behavior, and config bootstrap behavior for missing/partial user settings.

## Risks and Mitigations

### Risk R001 User Settings Schema Drift

`cartographer.parentFallbackModels` is new and may not be recognized by existing tooling. Mitigation: implement a small settings reader with validation and warnings for unknown or malformed fallback entries.

### Risk R002 Surprise API Cost

Cross-provider fallback could incur direct token cost. Mitigation: require approval by default, show provider/cost warning, and keep CI pre-approval explicit.

### Risk R003 Unsafe Redactor Fallback

Fallback for `cartographer-redactor` could weaken privacy review. Mitigation: prefer within-Codex fallback only, require explicit approval for cross-provider redactor fallback, and keep redaction quality over cost.

### Risk R004 Fallback Loops

Retrying could loop indefinitely if all providers fail. Mitigation: bound retries to the configured fallback chain and record exhausted fallback state.

### Risk R005 Wrapper Scope Confusion

Users may expect parent session model hot-swapping, which Pi does not provide. Mitigation: document that the wrapper retries Cartographer-controlled steps with fallback models; it does not change Pi's active parent model mid-response.

## Validation Strategy

Implementation should include deterministic tests or scripts for:

- parsing user settings for `cartographer.parentFallbackModels` and `subagents.agentOverrides`;
- invoking the setup workflow when user settings are missing or partial;
- verifying the setup workflow shows provider choices, role-specific recommendations, main-orchestrator recommendation, no-fallback warnings, subscription/free final fallback suggestions, preview/diff, and confirmation gate;
- validating the deterministic settings writer JSON Schema checks and available-model checks;
- confirming no `xhigh` defaults in settings/examples/agent frontmatter;
- simulating Codex `usage_limit_reached` and verifying same-provider fallback retry;
- simulating cross-provider fallback and verifying approval gate;
- validating fallback receipt schema fields;
- verifying the role-based routing matrix appears in docs/examples.

## Design Outcome

Accepted design: user-scope settings plus a Cartographer workflow fallback wrapper. This satisfies the requirements while keeping provider subscription controls personal, preserving deterministic receipts, and avoiding unnecessary `xhigh` usage.
