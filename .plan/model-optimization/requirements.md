# model-optimization Requirements

## Scope

This requirements artifact defines the behavioral contract, configuration surface, fallback semantics, escalation rules, and validation expectations for model/reasoning optimization of Pi Cartographer on an OpenAI Codex subscription.

The accepted proposal (`.plan/model-optimization/proposal.md`) sets `requirements_required: true` because this changes cross-cutting Cartographer workflow policy affecting proposal, planning, implementation, audit, redaction, and subagent handoff behavior.

## Decisions Already Resolved

The following user-owned decisions were resolved during proposal exploration and do not require further interview:

| Decision | Resolution | Source |
|----------|-----------|--------|
| Parent orchestrator fallback behavior | Auto-fallback chain through configurable models; log deterministic receipt | User decision during proposal |
| Cross-provider fallback guard | Requires explicit user approval before falling back from Codex to API-key provider | User decision during proposal |
| Config location | User settings (`~/.pi/agent/settings.json`) — applies across all repos | User decision during proposal |
| Parent fallback config key | `cartographer.parentFallbackModels` array in user settings | User decision during proposal |
| Subagent fallback mechanism | pi-subagents `subagents.agentOverrides.fallbackModels` | Existing pi-subagents support [F008] |
| Default subagent model assignments | Per the routing table in proposal (auditor/compass/redactor on gpt-5.5, drafter on Spark, archivist on gpt-5.4-mini) | Proposal table |

## Requirements

### REQ-01: Parent orchestrator default model

The parent/current orchestrator shall default to `openai-codex/gpt-5.5` at `medium` thinking level.

- **Why**: Parent orchestrator handles tool-use, long-context reasoning, and cross-artifact judgment — worth paying for by default.
- **Source**: Proposal routing table; [F001]
- **Validation**: Parse `.pi/agents/*.md`, active project/user settings, and verify no parent-agent model pin contradicts this without documented override.

### REQ-02: No xhigh default

The parent orchestrator shall never default to `xhigh` thinking. No Cartographer agent shall configure `xhigh` as a default.

- **Why**: xhigh is disproportionately expensive and latency-heavy; OpenAI guidance says it should only be used when evals show measurable quality gain [F002].
- **Source**: [F002]
- **Fold target**: README or ADR must call out the xhigh restriction explicitly.
- **Validation**: Scripted check that no `.pi/agents/*.md`, `settings.json`, or skill default sets `thinking: xhigh` for any Cartographer role.

### REQ-03: xhigh requires explicit approval

Using `xhigh` for any Cartographer workflow step shall require explicit human approval, recorded as a deterministic receipt with justification.

- **Why**: Prevents accidental cost spikes while allowing rare justified use (e.g., complex architecture review).
- **Validation**: Receipt trail must include `approved_by` and `reason` for any xhigh usage.

### REQ-04: Medium → high escalation guard

Escalation from `medium` to `high` thinking for any Codex model shall require documented justification in a deterministic receipt. The justification shall cite the specific quality gap or failure that prompted escalation.

- **Why**: Medium is the recommended balanced starting point [F002]; high should be intentional, not habitual.
- **Validation**: Receipts for high-level steps include a `reason` field.

### REQ-05: gpt-5.3-codex-spark is text-only

`gpt-5.3-codex-spark` shall not be used for vision/image tasks.

- **Source**: [F003]
- **Validation**: If any agent with image-related responsibilities lists Spark as a model, flag as violation.

### REQ-06: Drafting subagent model

`cartographer-drafter` shall default to `openai-codex/gpt-5.3-codex-spark` at `medium` thinking (or `low` for repeated polish loops).

- **Why**: Spark is 15× faster, optimized for real-time iteration, proposal/plan text, and quick edits [F003].
- **Fallback**: `openai-codex/gpt-5.4-mini` if Spark causes repeated factual or structural rework.
- **Validation**: Subagent override config for `drafter` exists in user settings.

### REQ-07: Auditor subagent model

`cartographer-auditor` shall default to `openai-codex/gpt-5.5` at `medium` thinking. `high` is permitted for final implementation/ADR gates, repeated validation drift, or complex cross-artifact contradictions.

- **Why**: Audits are high-stakes semantic gates that need the strongest model.
- **Fallback**: `openai-codex/gpt-5.4-mini` → `opencode/big-pickle` (cross-provider requires approval).
- **Validation**: Subagent override config for `auditor` includes model and fallbackModels.

### REQ-08: Compass subagent model

`cartographer-compass` shall default to `openai-codex/gpt-5.5` at `medium` thinking. `high` is permitted for unresolved architecture, workflow policy, or repeated failure decisions.

- **Why**: Decision consistency and escalation advisor — needs the strongest available reasoning.
- **Fallback**: `openai-codex/gpt-5.4-mini`.
- **Validation**: Subagent override config for `compass` includes model and fallbackModels.

### REQ-09: Redactor subagent model

`cartographer-redactor` shall default to `openai-codex/gpt-5.5` at `medium` thinking.

- **Why**: Privacy/safety failures are more expensive than token usage. Redaction quality must not be sacrificed for cost.
- **Fallback**: `openai-codex/gpt-5.4-mini`. Cross-provider fallback not recommended for redactor; if necessary, require explicit approval.
- **Validation**: Subagent override config for `redactor` includes model.

### REQ-10: Archivist subagent model

`cartographer-archivist` shall default to `openai-codex/gpt-5.4-mini` at `medium` thinking.

- **Why**: Routine research compression is a lighter coding task suitable for gpt-5.4-mini [F001].
- **Escalation**: `gpt-5.5 medium` for conflicting sources, ambiguous evidence, or high-impact dependency/security research.
- **Fallback**: `opencode/big-pickle`.
- **Validation**: Subagent override config for `archivist` includes model and fallbackModels.

### REQ-11: Subagent model config surface

Subagent model, thinking level, and fallback chain shall be configurable via `subagents.agentOverrides.<name>` in `~/.pi/agent/settings.json`.

- **Why**: pi-subagents already supports this [F008]; user scope keeps subscription management personal.
- **Supported fields**: `model`, `thinking`, `fallbackModels`.
- **Validation**: Parsing test for `~/.pi/agent/settings.json` that validates the `subagents.agentOverrides` schema.

### REQ-12: Parent auto-fallback on usage limit

When a Cartographer workflow step using an `openai-codex/gpt-*` model fails with `usage_limit_reached` (HTTP 429), the workflow wrapper shall:

1. Detect the error and parse the rate-limit headers.
2. Log a deterministic fallback receipt with error details, reset time, and intended fallback model.
3. Automatically retry the step with the next model in `cartographer.parentFallbackModels`.
4. If the retry also fails, continue down the chain.
5. Cap retries to the length of the configured chain — no infinite loops.

- **Why**: The proposal's auto-fallback chain approach.
- **Validation**: Unit test simulating HTTP 429 and verifying retry + receipt.

### REQ-13: Cross-provider guard

Falling back from a Codex subscription model (`openai-codex/gpt-*`) to an API-key-backed provider (`opencode/*`, `openai/*`, etc.) shall require explicit user approval before proceeding.

- **Approval UX**: Interactive prompt showing the pending fallback model, provider, and estimated cost impact.
- **CI mode**: A `--allow-cross-provider` flag or `cartographer.parentFallbackAllowCrossProvider: true` in settings may pre-approve cross-provider fallback.
- **Receipt**: The fallback receipt shall include `approved_by: "user"` (interactive) or `approved_by: "pre-approved"` (CI).
- **Validation**: Simulate cross-provider fallback and verify approval gate.

### REQ-14: Fallback receipt schema

Every fallback event shall produce a deterministic receipt in `.plan/<topic>/receipts.jsonl` with:

| Field | Description |
|-------|-------------|
| `type` | `workflow-receipt` |
| `kind` | `fallback` |
| `failure_mode` | `usage-limit`, `model-unavailable`, or `provider-error` |
| `from_model` | The model that failed |
| `to_model` | The model used on retry |
| `reset_seconds` | Seconds until the primary Codex window resets (from `X-Codex-Primary-Reset-After-Seconds`) |
| `reset_secondary_seconds` | Seconds until the secondary (weekly) window resets |
| `approved_by` | `auto` (within-Codex), `user` (interactive), or `pre-approved` (CI flag) |
| `phase_id` | The workflow phase that triggered the fallback |

- **Validation**: Schema compliance check on receipts.jsonl after fallback simulation.

### REQ-15: Parent fallback config key

The parent orchestrator fallback chain shall be configurable via `cartographer.parentFallbackModels` in `~/.pi/agent/settings.json`.

- **Format**: Array of model IDs in priority order. Example:
  ```json
  {
    "cartographer": {
      "parentFallbackModels": [
        "openai-codex/gpt-5.5",
        "openai-codex/gpt-5.4-mini",
        "opencode/big-pickle"
      ]
    }
  }
  ```
- **Validation**: Parse `~/.pi/agent/settings.json` for the key and validate entries are recognized models.

### REQ-16: Reset-time awareness

During any fallback event, the user shall be shown the remaining cooldown time before the primary Codex window resets, allowing them to decide whether to wait or proceed with a cross-provider fallback.

- **Why**: If the window resets in a few minutes, waiting may be preferable to incurring API-key costs.
- **Validation**: UX inspection after simulated fallback.

### REQ-17: Interactive config bootstrap workflow

When Cartographer detects missing or partial model-routing configuration, the main agent shall invoke an interactive setup workflow/skill rather than silently writing settings or requiring users to hand-edit JSON.

The workflow shall:

1. Detect configured/available providers and existing `~/.pi/agent/settings.json` values.
2. Present a user menu for which providers should be used for Cartographer.
3. For selected providers, recommend models per Cartographer role based on cost, speed, context/reasoning capability, input modality, and safety needs.
4. Recommend a main orchestrator model and thinking level for the user to select in Pi.
5. Preview the resulting `subagents.agentOverrides` and `cartographer.parentFallbackModels` settings.
6. Ask confirmation before writing.
7. Preserve unrelated settings and avoid overwriting user-provided values unless explicitly approved.
8. Delegate actual settings writes to a deterministic script rather than free-form LLM editing.
9. Validate proposed config with JSON Schema before writing.
10. Validate proposed provider/model IDs programmatically against available Pi models before writing.
11. Warn when any Cartographer agent or parent fallback chain has no fallback enabled.
12. If the user has a subscription-backed/free provider model available (for example `opencode/big-pickle` from OpenCode Zen), recommend it as a final fallback option for all suitable agents, with explicit caveats for redaction/privacy-sensitive flows.

- **Why**: Setup is a user-owned preference decision. A workflow/skill can explain tradeoffs better than a blind bootstrap command, while deterministic scripts prevent malformed settings and hallucinated model IDs.
- **Validation**: Simulated missing/partial settings test verifies the workflow presents provider choices, recommended role mappings, orchestrator recommendation, no-fallback warnings, free/subscription final fallback suggestions, preview, JSON Schema validation, available-model validation, and confirmation gate.

## Scenarios

### SCN-01: Auto-fallback within Codex

**Given** the user starts a Cartographer workflow using `openai-codex/gpt-5.5`  
**When** the Codex subscription primary window is exhausted (HTTP 429, `usage_limit_reached`)  
**Then** the workflow wrapper detects the error, logs a fallback receipt, and retries with `openai-codex/gpt-5.4-mini`  
**And** the retry succeeds  
**And** the user is not prompted for approval (same provider)  
**And** the receipt includes `approved_by: "auto"`

### SCN-02: Cross-provider fallback with approval

**Given** the Codex subscription limits are reached for both `gpt-5.5` and `gpt-5.4-mini`  
**When** the workflow wrapper attempts to fall back to `opencode/big-pickle`  
**Then** the wrapper pauses and shows the user the pending fallback, provider name, and estimated cost  
**And** the user approves (or declines)  
**If** approved, the retry proceeds and the receipt includes `approved_by: "user"`  
**If** declined, the workflow stops with a blocked-state receipt

### SCN-03: Subagent launch uses configured model

**Given** the user has `subagents.agentOverrides` configured in `~/.pi/agent/settings.json`  
**When** Cartographer launches a subagent (e.g., `cartographer-auditor`) via pi-subagents  
**Then** the subagent uses the configured `model`, `thinking`, and `fallbackModels` from the override  
**And** does not inherit the parent session model

### SCN-04: Auditor runs on recommended model

**Given** the user has configured `subagents.agentOverrides.auditor.model: "openai-codex/gpt-5.5"` and `thinking: "medium"`  
**When** `cartographer-auditor` is invoked during a proposal or plan gate  
**Then** it runs on `openai-codex/gpt-5.5 medium`

### SCN-05: Drafter runs on Spark

**Given** the user has configured `subagents.agentOverrides.drafter.model: "openai-codex/gpt-5.3-codex-spark"`  
**When** `cartographer-drafter` is invoked for proposal/plan drafting  
**Then** it runs on `openai-codex/gpt-5.3-codex-spark` at `medium` or `low` thinking

### SCN-06: Fallback receipt recorded

**Given** a fallback event occurs (usage limit on a Codex model)  
**When** the workflow wrapper retries with the fallback model  
**Then** a receipt is appended to `.plan/<topic>/receipts.jsonl`  
**And** the receipt conforms to the schema in REQ-14

### SCN-07: Reset time displayed during fallback

**Given** a fallback event occurs due to Codex usage limit  
**When** the wrapper detects `X-Codex-Primary-Reset-After-Seconds` in the error response  
**Then** it displays the remaining cooldown time to the user  
**And** if the cooldown is short (≤ 5 minutes), suggests waiting as an alternative to cross-provider fallback

## Requirement Fold Targets

When accepted and implemented, durable policy decisions should be folded into:

| Target | Content |
|--------|---------|
| `docs/adr/` (new ADR) | Durable policy: model routing, reasoning levels, xhigh restriction, fallback chain, cross-provider guard |
| `README.md` | Operational guidance: config example, fallback chain setup, troubleshooting usage limits |
| `.pi/settings.json` example in README | Canonical config example for user settings |

## References

- Proposal: `.plan/model-optimization/proposal.md`
- Compass decision: `.plan/model-optimization/compass-decision.md`
- Fact F001: OpenAI Codex model guidance (gpt-5.5 flagship, gpt-5.4-mini lighter)
- Fact F002: OpenAI GPT-5.5 thinking levels (medium recommended, high/xhigh eval-gated)
- Fact F003: GPT-5.3-Codex-Spark real-time coding, text-only
- Fact F004: Pi explicit reasoning metadata and thinking levels
- Fact F005: Pi supports OpenAI Codex subscription provider
- Fact F006: Local model discovery — openai-codex models available
- Fact F007: Cartographer agent frontmatter — inherits model, sets thinking:medium
- Fact F008: pi-subagents supports model, fallbackModels, thinking in agentOverrides
- Fact F009: Cartographer policy — parent single-writer, read-only specialists, deterministic validation before audit
