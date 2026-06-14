# Implement Execution Loop Reference

Read when the active phase requires detailed implementation sequencing beyond the kernel.

## Phase orientation

1. Read `.plan/<topic>/plan.md` and identify the first dependency-unblocked phase.
2. Read supporting artifacts only as needed: requirements/design graphs, facts, map, receipts, and context packs.
3. Treat `.cartographer/current.json` as a local hint only; validate topic state before trusting it.
4. Use `cartographer_implement start` at implementation start and `cartographer_implement step` before phase edits.
5. Mark the selected phase `in-progress` with `cartographer_plan_status`.
6. Set a singular next action and narrow working set with `cartographer_state`.

## Single-writer loop

For each task:

- Orient from current files and state.
- Select one next action.
- Narrow the working set.
- Inspect current file contents from disk.
- Apply one scoped parent-owned patch.
- Validate with the narrowest meaningful check.
- Record receipts and state refs.
- Compact at phase/milestone boundaries.
- Continue from artifacts, not stale chat memory.

## Checklist/status discipline

- Check off task IDs only when their expected output exists.
- Check off validation IDs only when command/auditor/manual evidence proves success.
- Use `cartographer_plan_status`, not manual Markdown edits, for plan status/checklist sync.
- Use `cartographer_implement record` for validation refs and phase evidence.

## Commit discipline

At each completed phase:

1. Ensure only intended files are changed.
2. Run required validations and capture receipts.
3. Capture auditor PASS.
4. Mark phase complete.
5. Commit with Conventional Commits based on staged files.
6. Re-orient and continue unless blocked by a human gate, unresolved risk, or user instruction.
