# Phase Compaction Hooks Proposal

## Description

Add a Cartographer-owned bridge from implementation phase milestones to **actual Pi context compaction**. The current workflow creates durable Cartographer resume snapshots, but those snapshots do not reduce the active Pi transcript. This proposal scopes a Pi extension/harness integration that can trigger `ctx.compact()` after implementation phase boundaries and when context usage crosses a proactive threshold.

The desired outcome is a safer long-horizon implementation loop: write Cartographer state/context-pack evidence first, trigger real Pi compaction at the right checkpoint, then resume from bounded `.cartographer` state rather than carrying a near-limit chat transcript.

## Problem Statement

Recent session evidence showed that Cartographer `compact-generate` calls are not the same as Pi session compactions: 12 Cartographer state compaction calls produced only 3 real Pi `type: "compaction"` entries, and those happened near the model limit [F009]. Pi's default auto-compaction is intentionally near-limit (`contextWindow - reserveTokens`) rather than a proactive 60% implementation checkpoint [F002].

As a result, the implementation loop can appear to be following “Compact” discipline while still retaining large tool outputs, validation logs, and subagent results in active context until Pi's automatic safeguard fires. This undermines the intended Cartographer pattern of phase-scoped work, clean resume context, and low-drift continuation.

## Goals

- Trigger **real Pi context compaction** from Cartographer phase checkpoints using Pi's documented extension APIs (`ctx.compact()`), not by manually editing session JSONL [F004].
- Add a proactive threshold path, defaulting around 60% context usage when available, using `ctx.getContextUsage().percent` or a safe fallback [F011].
- Preserve the current Cartographer resume-snapshot behavior: phase state, context packs, receipts, and journal records should be written before transcript compaction [F008].
- Make the distinction between “Cartographer state snapshot” and “Pi transcript compaction” explicit in user-facing skill/tool guidance.
- Provide deterministic tests for any new extension tool/hook behavior and workflow-doc guidance.
- Avoid custom summarizer complexity unless needed; prefer triggering Pi's existing default compaction path with Cartographer-specific `customInstructions` [F010] [F012].

## Non-Goals

- Do not replace Pi's default compaction algorithm or summary prompt in the first implementation.
- Do not directly append or rewrite `type: "compaction"` entries in Pi session JSONL.
- Do not require a hard fork of Pi or changes inside Pi core for the first pass.
- Do not compact after every small tool call or validation command; this proposal targets phase boundaries and threshold crossings.
- Do not store raw transcript summaries or raw private session contents in `.plan/` artifacts.

## Background

Pi real compaction appends a session compaction entry with `summary`, `firstKeptEntryId`, and `tokensBefore`, then rebuilds context from the summary plus kept messages [F001]. Auto-compaction uses the model context window minus reserved output tokens, with defaults documented as `reserveTokens: 16384` and `keepRecentTokens: 20000` [F003].

Pi extensions are the right integration surface. Extension contexts expose `ctx.getContextUsage()` and `ctx.compact()`, and Pi exposes `session_before_compact` / `session_compact` events for customization or observation [F004] [F006]. The official `trigger-compact.ts` example demonstrates threshold-based compaction from a `turn_end` event handler [F005].

Cartographer already ships a Pi extension through `package.json` and `extensions/cartographer-tools.ts` [F007]. That means this package can add the bridge as package-owned extension behavior rather than asking every user to install a separate global extension.

Current Cartographer implementation compaction is a state/resume operation: `implementCompact()` calls `state-mark-stale`, `compact-generate`, and `state-resume`, but it does not call Pi `ctx.compact()` [F008]. That behavior is valuable and should stay, but it must be paired with actual Pi compaction when context management is the goal.

## Viability

This is viable without modifying Pi core. Pi's extension API already exposes the needed pieces: context usage percentage, compaction triggering, turn/session lifecycle hooks, and post-compaction observation [F004] [F006] [F011]. The official trigger example is close to the threshold half of the desired behavior [F005].

The most likely implementation path is to extend `extensions/cartographer-tools.ts` with a narrow Cartographer compaction bridge. It can either register an LLM-callable tool for explicit phase-end compaction, observe successful Cartographer compact tool results, or combine both. The downstream design should choose the least surprising path, with a preference for explicit parent-owned calls at phase boundaries and a conservative `turn_end` threshold guard.

The bridge should not replace Pi's summary prompt by default. Instead, it should pass Cartographer-focused `customInstructions` to `ctx.compact()` that include bounded `state-resume` context (or the minimal equivalent from `state.json`) and explicit continuation guidance: reload/use the implement skill, trust `.plan/<topic>/plan.md` plus `.cartographer/<topic>/state.json` over stale chat memory, report current phase/next action/files to inspect first, then continue the implementation loop [F012] [F013].

Complexity is moderate. The main risk is timing: `ctx.compact()` is fire-and-forget from extension event handlers, while Pi's direct manual compaction aborts active agent work. The proposal should therefore prefer post-turn/post-phase checkpoints and avoid triggering in the middle of mutable tool batches. The implementation also needs tests that can exercise extension registration and trigger conditions without mutating real `.plan/` artifacts.

## ADR Metadata

- `adr_required`: true
- `adr_reason`: This changes cross-cutting Cartographer workflow/runtime behavior by adding a Pi harness extension bridge for transcript compaction, and it establishes policy for phase-boundary context management.
- `adr_options_status`: missing
- `adr_tool_mode`: generate-after-validation

## Scope Gate

- `requirements_required`: true
- `requirements_reason`: The change affects a core Cartographer implementation workflow and the reliability contract for long-horizon sessions. It needs behavioral requirements for phase-end compaction, threshold compaction, state snapshot ordering, opt-out/configuration, and safe evidence recording.

## Next Artifacts

Recommended path: `proposal -> requirements delta -> design -> plan -> implement -> ADR after validated implementation`.

The requirements artifact should define observable behavior, including:

- phase-end state snapshot must happen before actual Pi compaction;
- real Pi compaction should be triggerable by the Cartographer workflow after phase completion;
- context threshold compaction should default near 60% and be configurable/disableable;
- actual compaction must use `ctx.compact()` rather than direct session JSONL mutation;
- actual compaction should pass `customInstructions` that preserve bounded Cartographer resume state and tell the post-compaction assistant to continue with the implement skill;
- workflow guidance must distinguish state snapshots from transcript compaction;
- tests must avoid mutating the repository's real `.plan/` and use temp/mock projects.

The design artifact should evaluate these options:

1. **Explicit tool bridge:** register a `cartographer_compact_context` or similar extension tool that the parent calls after `cartographer_implement compact`.
2. **Tool-result observer:** have the extension watch successful `cartographer_implement compact` / `cartographer_state compact-generate` results and trigger `ctx.compact()` automatically.
3. **Threshold-only hook:** add a `turn_end` guard that compacts at 60% but does not explicitly bind to phase milestones.
4. **Hybrid:** explicit phase-end bridge plus threshold guard, with loop-prevention and configuration.

Each option should specify the summary-focus payload. The default should be additive `customInstructions`, not a full custom summarizer: include topic, phase, next action, working set, known failures, latest validation receipts, and an instruction to resume through `state-resume`/the implement skill rather than relying on stale transcript memory.

## Risks and Open Questions

- `ctx.compact()` is asynchronous/fire-and-forget in extension contexts, so design must avoid assuming immediate compaction completion before the next LLM call.
- A fully automatic observer could surprise users if any `compact-generate` call triggers Pi compaction; explicit phase-end calls may be safer.
- The bridge needs loop prevention so `session_compact` or post-compaction usage recalculation does not repeatedly trigger compaction.
- The summary-focus payload must stay bounded; prefer `state-resume` output or selected `state.json` fields over dumping large artifacts or raw logs.
- The default threshold should be configurable; 60% matches the user concern, but design should validate whether 60%, 65%, or 70% is less disruptive.

## Design
