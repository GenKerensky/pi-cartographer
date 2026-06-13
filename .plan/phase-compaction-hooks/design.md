# Phase Compaction Hooks Design

## Decision One

Accept a hybrid bridge: add an explicit `cartographer_compact_context` extension tool for phase-end compaction and a conservative threshold hook for active Cartographer implementation contexts. The explicit tool gives the parent implementation loop a deterministic phase boundary action, while the threshold hook catches unusually long phases before Pi's default near-limit auto-compaction [REQ-PCH-001] [REQ-PCH-002].

## Decision Two

Use additive `customInstructions` with Pi's default compaction rather than replacing the summarizer. The instructions should be generated from bounded Cartographer context: topic, trigger, phase, state-resume output or selected state fields, latest validation receipts, working set, known failures, and a directive to continue with the implement skill [REQ-PCH-003].

## Decision Three

Gate automatic threshold compaction to active Cartographer implementation state. The hook should run after turns, read usage percentage, derive the active topic from `.cartographer/current.json` when valid, and skip when there is no active state, compaction is disabled, usage is below threshold, or a cooldown/duplicate guard is active [REQ-PCH-002] [REQ-PCH-004].

## Alternative One

Rejected: replace Pi's compaction summarizer through `session_before_compact`. This would be more invasive and would duplicate Pi behavior before proving the simpler `customInstructions` path is insufficient.

## Alternative Two

Rejected as default: trigger actual Pi compaction on every `cartographer_state compact-generate` result. This is surprising because `compact-generate` is also useful as a state snapshot operation, and not every snapshot should necessarily prune the transcript.

## Components

- `extensions/cartographer-tools.ts`: register the explicit compaction tool, helper functions, and optional event hooks.
- `skills/implement/SKILL.md`: update workflow guidance to call the actual compaction bridge after state snapshot compaction and to treat state snapshots and transcript compaction as distinct.
- `tests/cartographer_tools.test.ts`: add deterministic tests using mocked extension context for queued/skipped outcomes and custom instruction content.
- `tests/test_workflow_docs.py`: assert implement skill guidance mentions actual Pi compaction bridge behavior.

## Risks

- `ctx.compact()` is asynchronous/fire-and-forget in extension contexts, so the implementation should report that the request was queued and should not assume compaction completed synchronously.
- Over-eager automatic threshold compaction could interrupt workflow rhythm, so threshold behavior must be configurable and duplicate-guarded.
- Dumping too much state into `customInstructions` would defeat the purpose of compaction; use bounded `state-resume` output or selected fields only.
