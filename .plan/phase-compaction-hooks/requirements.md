# Phase Compaction Hooks Requirements

This requirements delta defines observable behavior for adding real Pi transcript compaction to the Cartographer implementation loop.

## ADDED Requirements

### REQ-PCH-001 — Phase-end Pi compaction bridge

After a Cartographer implementation phase writes its state snapshot and resume context, the workflow must be able to trigger actual Pi context compaction through the Pi harness rather than only updating `.cartographer` state. The trigger must use `ctx.compact()` and must not directly mutate Pi session JSONL [F001] [F004] [F008].

#### Scenarios

- [SCN-PCH-001] When the execution agent completes a phase and calls the Cartographer compaction bridge, Pi receives a compaction request with Cartographer-focused instructions after state snapshot generation succeeds.

### REQ-PCH-002 — Proactive context threshold compaction

During active Cartographer implementation, the extension should detect when context usage crosses a configurable threshold, defaulting near 60%, and request actual Pi compaction outside mutable tool execution. The check should use `ctx.getContextUsage().percent` when available [F005] [F011].

#### Scenarios

- [SCN-PCH-002] When `turn_end` reports usage crossing the configured threshold for an active Cartographer topic, the extension queues one compaction request and avoids repeated triggers until usage changes meaningfully or a cooldown resets.

### REQ-PCH-003 — Additive Cartographer summary focus

The compaction bridge must preserve Pi's default summarizer by default while adding `customInstructions` that tell the summary to retain bounded Cartographer resume context, including topic, current phase, next action, working set, known failures, latest validation receipts, and a directive to continue with the implement skill after compaction [F012] [F013].

#### Scenarios

- [SCN-PCH-003] A phase-end compaction request includes bounded `state-resume` or selected `state.json` information and instructs the next assistant turn to resume through the implement skill rather than stale transcript memory.

### REQ-PCH-004 — Safe configuration and observability

The compaction bridge must be configurable/disableable, avoid compaction loops, and expose compact tool results or receipts that tell the agent whether a compaction request was queued, skipped, or unavailable. It must not store raw transcript summaries in `.plan/` artifacts [F006].

#### Scenarios

- [SCN-PCH-004] When Pi extension context is unavailable, the bridge reports a safe skip rather than fabricating a compaction entry.
- [SCN-PCH-005] When compaction was recently requested, the threshold hook skips duplicate requests and reports the skip reason.
