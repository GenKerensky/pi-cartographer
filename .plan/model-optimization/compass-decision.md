I can’t write files in this run (read-only constraint for this role), but here are the decision findings.

## Decision Summary
**Recommendation status:** **In-scope** (policy change is clearly bounded to Cartographer agent/model usage), but currently blocked for execution planning by missing required planning artifacts in this topic scope (`plan/interview/requirements/design` JSONLs absent, no receipts/context-pack).

## Options Considered
- **(A) Parent default + explicit per-agent overrides**  
  + Fits goal: preserves high-reasoning for orchestration/critical review while routing fast work to `gpt-5.3-codex-spark` and lighter tasks to `gpt-5.4-mini`.
  + Supports explicit cost control and avoids blanket high/xhigh usage.

- **(B) Pin everything to gpt-5.5 high/xhigh**  
  + Simple but contradicts cost goals and `F002` guidance against unconditional high/xhigh without proven gains.

- **(C) Keep inheritance and rely on humans**  
  + No config cost, but does not satisfy explicit optimization objective and is non-deterministic.

## Recommendation
**Choose (A).**  
Set parent/orchestrator default to `openai-codex/gpt-5.5` at `thinking: medium` (not xhigh) and route specific agents with per-agent overrides.

### Role-by-Role Routing
- **Parent / current orchestrator (default)**: `openai-codex/gpt-5.5`, `thinking: medium`  
- **cartographer-drafter**: `openai-codex/gpt-5.3-codex-spark`, `thinking: medium` (or `low` for heavy iteration)
- **cartographer-archivist**: `openai-codex/gpt-5.4-mini`, `thinking: medium`
- **cartographer-auditor**: `openai-codex/gpt-5.5`, `thinking: medium` (escalate to `high` only if justified)
- **cartographer-compass**: `openai-codex/gpt-5.5`, `thinking: medium`
- **cartographer-redactor**: `openai-codex/gpt-5.5`, `thinking: medium`
- **cartographer-pathfinder** (deprecated): keep `gpt-5.3-codex-spark`, `thinking: medium` if ever invoked

## Stop Rules / Escalation Triggers
1. Escalate to user before any `gpt-5.5 high`/`xhigh` defaults or pinning all agents.
2. Escalate on evidence that `spark` degrades draft quality (e.g., repeated rework loops) → move that agent to `5.4-mini` or `5.5` with local override.
3. Escalate if `thinking: medium` is insufficient on `auditor/redactor/compass` for a concrete topic; uplift to `high` with explicit receipt-driven justification.
4. Stop to user to choose override mechanism before implementation (`.pi/agents` frontmatter vs global `subagents.agentOverrides`), since this has cross-tooling implications.
5. Require plan graph/receipts/context before implementation phase starts.

## New Subagents
**No new subagents needed.** Existing six Cartographer roles already cover reasoning-control decisions and execution paths.

## Artifact/Index Summaries Reviewed
- Reviewed: `.plan/model-optimization/proposal.md` (ADR metadata indicates ADR-required durable policy change)
- Reviewed: `.plan/model-optimization/facts.nodes.jsonl` and `.plan/model-optimization/facts.edges.jsonl` (F001–F009 used for model/reasoning recommendations and current agent baseline `thinking: medium`)
- Reviewed: `.plan/model-optimization/map.nodes.jsonl` and `.plan/model-optimization/map.edges.jsonl`
- Reviewed: `.pi/agents/cartographer-*.md` (all current agents have `thinking: medium`, no model pin)
- Reviewed: `validate-topic-summary`, `receipt-summary`, `context-pack-summary` (all zero receipts/context; no plan/receipts workflow evidence)
- Reviewed: missing-topic artifacts for `plan.nodes`, `plan.edges`, `requirements.*`, `design.*`, `interview.*` (all absent)

**Artifact note:** these absences are a planning/readiness blocker for moving cleanly into implementation despite the proposal’s narrow scope.