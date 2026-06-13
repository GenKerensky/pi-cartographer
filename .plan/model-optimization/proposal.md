# model-optimization Proposal

## Description

Optimize Pi Cartographer's parent orchestrator, subagent model choices, and reasoning levels for an OpenAI Codex subscription. The proposal should make model use intentional: reserve `openai-codex/gpt-5.5` and elevated reasoning for the places where Cartographer needs hard judgment, while routing drafting, routine research compression, and fast iteration to cheaper/faster Codex models such as `openai-codex/gpt-5.3-codex-spark` or `openai-codex/gpt-5.4-mini`.

The recommended policy is a tiered routing model:

| Role / workflow moment | Recommended default | Reasoning | Escalation |
| --- | --- | --- | --- |
| Main parent/current orchestrator | `openai-codex/gpt-5.5` | `medium` | `high` only for final architecture/policy decisions, persistent failures, or ambiguous multi-artifact gates; never `xhigh` by default |
| Proposal/plan drafting (`cartographer-drafter`) | `openai-codex/gpt-5.3-codex-spark` | `medium`, optionally `low` for repeated polish loops | Escalate to `gpt-5.4-mini` or parent `gpt-5.5` if Spark causes repeated factual or structural rework |
| Research compression (`cartographer-archivist`) | `openai-codex/gpt-5.4-mini` | `medium` | Escalate to `gpt-5.5 medium` for conflicting sources, ambiguous evidence, or high-impact dependency/security research |
| Semantic audit (`cartographer-auditor`) | `openai-codex/gpt-5.5` | `medium` | `high` for final implementation/ADR gates, repeated validation drift, or complex cross-artifact contradictions |
| Decision advice (`cartographer-compass`) | `openai-codex/gpt-5.5` | `medium` | `high` only for unresolved architecture, workflow policy, or repeated failure decisions |
| Private evidence redaction (`cartographer-redactor`) | `openai-codex/gpt-5.5` | `medium` | Keep quality/safety over cost; use `high` only for sensitive/ambiguous redaction failures |
| Deprecated writer (`cartographer-pathfinder`) | Do not optimize as a default path | `medium` if explicitly invoked | Prefer parent single-writer; if legacy opt-in happens, cap to `gpt-5.4-mini`/Spark unless the task itself justifies more |

## Problem Statement

Cartographer currently has narrow project-scoped subagents, but their frontmatter sets `thinking: medium` and does not pin a model, so they inherit whatever model the parent session is using. That is simple, but it makes cost and subscription usage unpredictable: if the parent is running `gpt-5.5:xhigh`, every child can inherit an expensive setting even for routine drafting or evidence compression. Local model discovery shows the OpenAI Codex subscription provider exposes `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.5`, all with thinking support [F006].

The workflow needs explicit policy and implementation hooks that keep the parent in control, avoid blanket `gpt-5.5 high/xhigh`, and preserve Cartographer's existing validation and read-only specialist guarantees.

## Goals

- Define a durable model/reasoning routing policy for Cartographer workflows on an OpenAI Codex subscription.
- Recommend a main parent orchestrator model: `openai-codex/gpt-5.5` at `medium` reasoning by default, with explicit escalation rather than persistent `high`/`xhigh`.
- Route low-risk drafting and fast iteration to `gpt-5.3-codex-spark` where its speed profile fits, especially `cartographer-drafter` [F003].
- Route routine subagent work that still needs solid coding/context capability to `gpt-5.4-mini`, consistent with OpenAI Codex guidance for lighter coding tasks and subagents [F001].
- Keep high-reasoning `gpt-5.5` for parent orchestration, semantic audits, decision consistency, private-evidence safety, ADR-worthy decisions, and repeated-failure analysis.
- Add escalation rules so `high` and especially `xhigh` are opt-in, evidence-backed choices rather than inherited defaults [F002].
- Preserve existing Cartographer principles: parent/current agent is the default writer, child agents remain narrow and least-privilege, and deterministic validation precedes semantic gates [F009].

## Non-Goals

- Do not replace Cartographer's parent single-writer implementation model with a new autonomous subagent runner.
- Do not pin every Cartographer role to `gpt-5.5 high` or `xhigh`.
- Do not optimize generic built-in subagents globally unless they are explicitly used as approved fallbacks in this project.
- Do not use `gpt-5.3-codex-spark` for vision/image tasks; local model discovery and external docs identify it as text-only/no-images [F003] [F006].
- Do not implement the configuration in this proposal; downstream design/plan artifacts should decide exact settings/frontmatter changes and tests.

## Background

Pi supports OpenAI ChatGPT Plus/Pro Codex as a subscription provider [F005]. Local Pi model discovery in this checkout shows an `openai-codex` model set containing `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.5`, with thinking support available for all four listed Codex models [F006]. Pi also supports explicit model reasoning metadata and thinking levels including `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`, which makes a policy enforceable through model config, per-run model selection, and subagent configuration [F004].

OpenAI's Codex model guidance says `gpt-5.5` is the flagship model for complex coding, reasoning, tool use, and agentic workflows, while `gpt-5.4-mini` is the faster lower-cost option for lighter coding tasks or subagents [F001]. OpenAI's GPT-5.5 guidance also says `medium` reasoning is the recommended balanced starting point and that `high` or `xhigh` should be increased only when evals show a measurable quality gain that justifies cost and latency [F002].

For fast interaction, GPT-5.3-Codex-Spark is described as a real-time coding model with 128k context, optimized for near-instant iteration, precise edits, plan revision, contextual questions, styling/layout changes, and other latency-sensitive work [F003]. That profile fits drafting and iterative proposal/plan text much better than final semantic gates.

In the current project, Cartographer-specific agents live under `.pi/agents/`, are intentionally narrow, and currently inherit the selected model while setting `thinking: medium` [F007]. The pi-subagents package supports per-run model overrides plus persistent `subagents.agentOverrides` for `model`, `thinking`, and `fallbackModels`, so implementation can avoid copying generic agents or relying on human memory [F008]. Existing Cartographer policy keeps parent orchestration and canonical writes in the parent/current agent, while subagents provide read-only audit, drafting, research compression, redaction, or decision advice [F009].

## Viability

This is viable with small, targeted configuration and documentation changes. No new core runtime is required because Pi and pi-subagents already expose the needed knobs: model selection, thinking levels, per-agent frontmatter, and `subagents.agentOverrides` [F004] [F008]. The project already has discrete Cartographer agents with clear role boundaries, so a matrix can be applied role-by-role instead of inventing new generic clones [F007] [F009].

The main implementation choice is where to encode the policy:

1. **Project `.pi/settings.json` `subagents.agentOverrides`** — best for durable project defaults without editing each agent prompt. This should be the preferred first implementation target.
2. **Agent frontmatter model/thinking pins** — useful if Cartographer wants the agents themselves to be self-describing when copied as a package, but it is noisier and harder to override per repository.
3. **Runtime per-call overrides in skill workflows** — useful for escalation paths and one-off high reasoning, but should not be the only control because it depends on every workflow remembering to pass overrides.

A good implementation should likely combine (1) for normal defaults with (3) for explicit escalation. It should avoid making `xhigh` part of any default path. The only reasonable `xhigh` use cases are rare, explicit, asynchronous investigations where `gpt-5.5 high` failed or where a human approves a high-cost policy/architecture review.

### Proposed default routing policy

- **Parent/current orchestrator:** run `openai-codex/gpt-5.5:medium`. This is the one place where stronger tool-use, long-context reasoning, and cross-artifact judgment are worth paying for by default. The cost guard is to keep the parent at `medium`, not `high`/`xhigh`, and to route children down.
- **Drafting loop:** run `cartographer-drafter` on `openai-codex/gpt-5.3-codex-spark:medium` for first-pass proposal/plan text, section rewrites, table generation, and quick polish. Spark should not be the final authority for citations or cross-artifact correctness.
- **Routine research compression:** run `cartographer-archivist` on `openai-codex/gpt-5.4-mini:medium`, escalating only when sources conflict or the topic is security/privacy/architecture-sensitive.
- **Audits and decision gates:** run `cartographer-auditor` and `cartographer-compass` on `openai-codex/gpt-5.5:medium`, with `high` only for final ADR/policy gates or repeated-failure decisions.
- **Private evidence:** run `cartographer-redactor` on `openai-codex/gpt-5.5:medium` because privacy/safety failures are more expensive than token usage. If redaction is purely mechanical and sanitized summaries are already available, downstream design may evaluate whether `gpt-5.4-mini` is safe for a subset.
- **Deprecated pathfinder:** keep it deprecated. If explicitly invoked, use the cheapest model that satisfies the exact task; do not let it inherit `gpt-5.5:xhigh` accidentally.

### New subagents

No new default subagents are recommended. The existing role set already maps cleanly to the desired cost/quality tiers. If implementation later finds recurring model-routing decisions are hard to keep consistent, add a lightweight `cartographer-model-router` advisory prompt/template rather than a broad new autonomous agent. Its job would be to recommend a model/reasoning override for a specific handoff from a fixed matrix; it should not edit artifacts.

### Validation approach

Downstream implementation should include tests or scripted checks that parse `.pi/agents/*.md`, project `.pi/settings.json` when present, and relevant skill docs to verify:

- no Cartographer default pins `thinking: xhigh`;
- `cartographer-drafter` is routed to Spark or another explicitly approved fast drafting model;
- `cartographer-auditor` and `cartographer-compass` use `gpt-5.5 medium` by default with documented escalation to `high`;
- the parent recommendation is documented in README/skill guidance;
- the fallback path for unavailable Codex models is explicit.

## Fallback Design

### Parent orchestrator auto-fallback chain

When the Codex subscription hits a usage limit (HTTP 429 with `usage_limit_reached`), the parent session should not hard-fail. Cartographer needs a workflow-level wrapper that:

1. **Detects** `usage_limit_reached` / `model_not_found` / HTTP 429/503 from any provider call during a Cartographer workflow step.
2. **Logs** a deterministic fallback receipt with the error, rate-limit reset time (from `resets_in_seconds` / `X-Codex-Primary-Reset-After-Seconds` headers), and which fallback model it will try next.
3. **Retries** the same step with the next model in the fallback chain using a fresh subagent call — the parent session model does not change, only the subagent or escalation step retries with the fallback.
4. **Requires user approval** before crossing from Codex subscription models to API-key-backed providers (e.g., `opencode` or `openai`), to avoid surprise spend.
5. **Caps retries** to the configured chain length — no infinite loops.

### Subagent fallbacks (already supported)

pi-subagents already supports `fallbackModels` per agent via `subagents.agentOverrides` [F008]. This is the mechanism for `cartographer-drafter`, `cartographer-auditor`, and other read-only specialists. No new subagent code is needed, only configuration.

### Config surface: user settings

The fallback chain lives in `~/.pi/agent/settings.json` (user scope, applies across all repos). This keeps subscription management personal — the user controls which models are in their fallback chain without touching per-repo config:

```json
{
  "subagents": {
    "agentOverrides": {
      "drafter": {
        "model": "openai-codex/gpt-5.3-codex-spark",
        "fallbackModels": ["openai-codex/gpt-5.4-mini"]
      },
      "auditor": {
        "model": "openai-codex/gpt-5.5",
        "thinking": "medium",
        "fallbackModels": ["openai-codex/gpt-5.4-mini", "opencode/big-pickle"]
      },
      "archivist": {
        "model": "openai-codex/gpt-5.4-mini",
        "fallbackModels": ["opencode/big-pickle"]
      },
      "compass": {
        "model": "openai-codex/gpt-5.5",
        "fallbackModels": ["openai-codex/gpt-5.4-mini"]
      },
      "redactor": {
        "model": "openai-codex/gpt-5.5",
        "fallbackModels": ["openai-codex/gpt-5.4-mini"]
      }
    }
  },
  "cartographer": {
    "parentFallbackModels": [
      "openai-codex/gpt-5.5",
      "openai-codex/gpt-5.4-mini",
      "opencode/big-pickle"
    ]
  }
}
```

### Cross-provider guard

Falling back from a subscription model (`openai-codex/gpt-*`) to an API-key provider (`opencode/*`, `openai/*`) incurs direct per-token cost. The workflow wrapper should:

- Pause and show the user the pending fallback with estimated cost impact before proceeding.
- Require explicit approval (`Y/n`) or a recorded `approvedBy` decision in the fallback receipt.
- Provide a `--allow-cross-provider` flag for CI/non-interactive sessions where the user has pre-approved cross-provider fallback.

### Reset-time awareness

The Codex API returns headers with reset timestamps:
- `X-Codex-Primary-Reset-After-Seconds` — primary usage window cooldown
- `X-Codex-Secondary-Reset-After-Seconds` — secondary (weekly) window cooldown

The workflow wrapper should surface these to the user so they know when Codex models will be available again. If the primary window resets within a few minutes, a brief pause may be preferable to a cross-provider fallback.

### Receipt trail

Every fallback event produces a deterministic receipt with:
- `failure_mode`: `usage-limit`, `model-unavailable`, `provider-error`
- `from_model`: the model that failed
- `to_model`: the model used on retry
- `reset_seconds`: time until the primary Codex window resets
- `approved_by`: user handle or `auto` for within-Codex fallbacks

This preserves Cartographer's auditability requirement.

## ADR Metadata
- `adr_required`: true
- `adr_reason`: Durable Cartographer workflow policy for model routing, reasoning levels, setup workflow, deterministic settings writes, and fallback behavior.
- `adr_options_status`: accepted-adr-written
- `adr_tool_mode`: created
## Scope Gate

- `requirements_required`: true
- `requirements_reason`: This changes cross-cutting Cartographer workflow policy and affects proposal, planning, implementation, audit, redaction, and subagent handoff behavior. Requirements/design artifacts should define the behavioral contract, exact configuration surface, fallback semantics, escalation rules, and validation expectations before implementation.

## Next Artifacts

Use the scoped no-interview path unless downstream requirements reveal unresolved user-owned decisions: `proposal -> research -> interview skip decision -> requirements gate -> design gate -> plan -> implement -> fold accepted deltas into docs/requirements.md`.

Known downstream decisions for requirements/design:

- **Fallback chain is now resolved**: auto-fallback chain in `~/.pi/agent/settings.json` with cross-provider guard. Subagent fallbacks use pi-subagents `fallbackModels`. Parent fallback uses a new `cartographer.parentFallbackModels` key in the same user settings file.
- Define exact fallback models for each Cartographer subagent in `subagents.agentOverrides` (per the table in Fallback Design above).
- Encode the cross-provider approval UX: interactive prompt vs `--allow-cross-provider` flag.
- Implement the Cartographer workflow wrapper that reads `cartographer.parentFallbackModels` from `~/.pi/agent/settings.json` and retries on usage-limit errors.
- Define measurable triggers for promoting `medium -> high` and for forbidding or requiring explicit approval for `xhigh`.

## Design
