# Pi Compaction and Harness Hook Research

Redaction status: public/local documentation only; no private raw transcript content included.

## Sources reviewed

- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md`
- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md`
- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`
- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/sessions.md`
- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/trigger-compact.ts`
- `/var/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-compaction.ts`
- local project files: `extensions/cartographer-tools.ts`, `skills/plan/scripts/cartographer_workflow.ts`, `skills/implement/SKILL.md`, `package.json`
- prior sanitized evidence: `.plan/compaction-failure-analysis/evidence/compaction-failure-findings.md`

## Relevant Pi behavior

Pi has a real context compaction mechanism separate from Cartographer's `.cartographer` state snapshot. Real compaction appends a session `type: "compaction"` entry, stores `summary`, `firstKeptEntryId`, and `tokensBefore`, then reloads context from the summary plus kept messages.

Auto-compaction is near-limit by default: `contextTokens > contextWindow - reserveTokens`. The default reserve is 16,384 tokens and `keepRecentTokens` defaults to 20,000. This is a safety trigger, not a proactive 60% workflow checkpoint.

Manual compaction is available through `/compact [prompt]`. Extension contexts expose `ctx.compact({ customInstructions, onComplete, onError })`, which triggers the same actual Pi compaction path without awaiting completion.

Extensions can inspect current usage with `ctx.getContextUsage()`, subscribe to `turn_end`, `agent_end`, `tool_call`, `tool_result`, `session_before_compact`, and `session_compact`, and can register tools or commands.

The included `trigger-compact.ts` example demonstrates a threshold-based extension: on `turn_end`, read `ctx.getContextUsage()`, detect crossing a token threshold, and call `ctx.compact()`.

Custom compaction is also possible through `session_before_compact`, but the phase-compaction problem does not require replacing Pi's summarizer. It only requires triggering Pi's existing compaction at safer moments with focused instructions.

## Relevant Cartographer behavior

The current package already ships a Pi extension via `package.json` `pi.extensions: ["extensions/cartographer-tools.ts"]`.

`extensions/cartographer-tools.ts` registers Cartographer workflow tools, including `cartographer_state`, whose prompt guidance says `compact-generate` is for validated state compaction and `state-resume` is for bounded context injection.

`skills/plan/scripts/cartographer_workflow.ts` implements `implementCompact()` by running `state-mark-stale`, `compact-generate`, and `state-resume`. This produces durable resume context but does not invoke Pi's `ctx.compact()`.

The implement skill currently says the loop is `Orient → Select → Narrow → Inspect → Act → Validate → Record → Compact → Continue` and says compaction triggers include phase start/end and a configurable context-usage threshold. In practice, that instruction currently maps only to Cartographer state snapshots unless a Pi extension/tool bridge is added.

## Recommended proposal direction

Add a Cartographer-owned Pi extension hook/tool layer that bridges workflow milestones to actual Pi context compaction:

1. Keep Cartographer state snapshots as prerequisites: write context pack/state/journal first.
2. Add a Pi-side trigger that can call `ctx.compact()` after phase-end or final-implementation compact events.
3. Add a proactive threshold trigger using `ctx.getContextUsage()`, ideally configurable by percentage and/or absolute token fallback.
4. Prefer post-turn hooks such as `turn_end`/`agent_end`, because `ctx.compact()` is fire-and-forget and Pi's manual compaction aborts active agent operations when invoked directly.
5. Use additive focused custom instructions rather than replacing Pi's summarizer by default: preserve Cartographer topic, current phase, last receipts, current plan status, next action, working set, and state-resume guidance; tell the next assistant to continue with the implement skill; distinguish actual Pi compaction from Cartographer state snapshot.
6. Prefer bounded `state-resume` output or selected `state.json` fields over dumping full artifacts/logs into the compaction prompt.
7. Record observable evidence through session `session_compact` notifications or lightweight custom entries/receipts where feasible, but do not write raw transcript summaries into `.plan/`.

## Open design questions for the downstream design phase

- Should phase-end actual compaction be triggered by an LLM-callable tool such as `cartographer_compact_context`, by wrapping `cartographer_implement compact`, or by an extension event that watches Cartographer tool results?
- The published `ContextUsage` type exposes `tokens`, `contextWindow`, and `percent`, so a percentage threshold can use `ctx.getContextUsage()?.percent` when available, with an absolute-token fallback if needed.
- Should threshold compaction run at 60%, 70%, or be configurable with a default such as 60% for implementation sessions and disabled outside active Cartographer workflows?
- Should actual compaction be auto-triggered after every phase or only after phase-end plus threshold/large-output conditions to avoid over-compaction churn?
