# Compaction Failure Findings

## Scope

Analyzed the authorized Pi session log `behave-specs-session.jsonl` for process failures, repeated tool-call failures, subagent failures, and context-window behavior. Raw session content remains private; this evidence summarizes counts, line references, and conclusions only.

Related sanitized artifacts:

- `.plan/compaction-failure-analysis/evidence/behave-specs-session-analysis.md`
- `.plan/compaction-failure-analysis/evidence/behave-specs-session-summary.json`
- `.plan/compaction-failure-analysis/evidence/manifest.jsonl`

## Executive findings

1. **Cartographer phase compaction is not Pi context compaction.** The implementation loop called `cartographer_state compact-generate` 12 times, but the Pi session only contains 3 real `type: "compaction"` entries. `compact-generate` only writes `.cartographer/<topic>/state.json` and optional journal records; it does not prune/reload chat context.
2. **Actual Pi compaction happened only at very high context usage.** The three real compactions occurred at `tokensBefore` 265,951, 271,510, and 257,429. With Pi defaults, auto-compaction triggers at `contextWindow - reserveTokens`, and the default reserve is 16,384 tokens. That means auto-compaction is intentionally a near-limit safety trigger, not a 60% proactive trigger.
3. **The “compact after each implementation phase” policy is only partially working.** State compaction records were generated at phase boundaries, but no harness `/compact` or equivalent context-pruning action happened at those boundaries. The transcript kept accumulating tool results, validation output, subagent output, and repeated repair loops.
4. **There is no observed 60% context threshold enforcement.** The implement skill mentions a configurable context-usage threshold, but the current state helper has no access to Pi context percentage and no way to invoke Pi compaction. No session evidence shows a proactive 60% check or compaction.
5. **Large outputs and long same-turn loops drove context growth.** The largest outputs included 102k-char bash results, 50k-char web/doc outputs, a 44k-char skill read, an 84k-char validation result, and a 63k-char subagent result. These were retained until Pi’s near-limit compaction.
6. **Process adherence degraded around failures.** The session shows repeated validation failures, exact-edit failures, rebase/conflict churn, missing wrapper arguments, repeated phase status updates, and finalization checks failing because required validation evidence was missing.

## Context compaction timeline

| Real Pi compaction line | Timestamp | `tokensBefore` | `fromHook` | Interpretation |
|---:|---|---:|---|---|
| 370 | 2026-06-11T13:17:06.672Z | 265,951 | false | Near-limit compaction after substantial proposal/early implementation work. |
| 858 | 2026-06-11T18:19:29.953Z | 271,510 | false | Near-limit compaction after many implementation phases, rebase/conflict work, validation output, and finalization attempts. |
| 1479 | 2026-06-12T04:27:55.706Z | 257,429 | false | End-of-session compaction after initial-requirements follow-up implementation. |

Pi documentation says auto-compaction triggers when:

```text
contextTokens > contextWindow - reserveTokens
```

Default `reserveTokens` is 16,384 and `keepRecentTokens` is 20,000. No project/user compaction settings overriding these defaults were found in the inspected settings. This explains why the session was allowed to approach ~90%+ context: that is the default Pi auto-compaction behavior.

## Cartographer compaction versus Pi compaction

Observed Cartographer state compaction calls:

- `cartographer_state compact-generate`: 12 calls
- `cartographer_implement compact`: 0 calls
- Real Pi `type: "compaction"` entries: 3

Representative Cartographer compact triggers observed:

- `phase-end:P0`
- `phase-end P1`
- `phase-end P2`
- `phase-end P3`
- `phase-end P4`
- `phase-end P5`
- `final-implementation`
- `phase-end-P0` through `phase-end-P2` for the follow-up topic
- final implementation compact for the follow-up topic

The implementation of `compactGenerate()` in `skills/plan/scripts/cartographer_state.ts` updates state fields and optional journal records, then validates state. It does **not** call Pi `/compact`, emit a Pi compaction entry, trim the transcript, or reload the session context.

Therefore: phase-end compaction is useful as a **resume artifact**, but it is not currently effective as **context-window management**.

## Why compact was not called sooner

Primary causes:

1. **No available in-agent Pi compaction tool was used.** The session has no tool call equivalent to `/compact`. Pi compaction appears to have been left to its automatic threshold.
2. **The implement skill conflates two meanings of compact.** It instructs agents to run `compact-generate`, which creates compact state, but not actual chat compaction.
3. **No context usage telemetry was consumed by the agent.** The model usage records include token counts after each assistant response, but the workflow does not inspect those counts or trigger a threshold decision.
4. **The threshold text is aspirational.** The skill says compaction triggers include a configurable context-usage threshold, but there is no Cartographer state/wrapper mechanism that enforces it.
5. **Long implementation turns continued after phase checkpoints.** Phase commits were treated as checkpoints, but the assistant continued in the same transcript instead of forcing Pi compaction/reload from `.cartographer` state.

## Tool and process failures

### Tool failures by `isError=true`

| Tool | Count | Examples |
|---|---:|---|
| `bash` | 10 | rebase conflicts, typecheck failures, format failures, missing final validation receipt |
| `cartographer_validation` | 4 | four consecutive calls missing required `receiptFile` |
| `edit` | 3 | exact replacement not found or non-unique oldText |
| `read` | 1 | offset beyond EOF |

### Validation failures observed

12 validation runs reported failed results, including:

- topic validation failure early in proposal validation;
- format/prettier check failures;
- TypeScript/Python test/check failures;
- repeated `npm run check` failures;
- grep/verification command failures;
- final implementation gate failure due to missing implementation full validation receipt.

### Repeated workflow/process problems

- `cartographer_implement` wrapper was never called, despite the implement skill requiring `start`, `step`, `record`, `compact`, and `finalize` wrapper use when available.
- The workflow used `cartographer_state compact-generate` directly, which generated durable state summaries but did not enforce the implement wrapper lifecycle.
- The first topic (`proposal-design-split`) shows phase status calls marking later phases in-progress, but the analyzed assistant tool calls do not show corresponding `cartographer_plan_status` complete calls for those phases in the same way the follow-up topic does.
- The follow-up topic (`initial-requirements`) marked P0 complete, then shortly after marked P0 in-progress again and repeated the checklist/status completion sequence. That indicates resume/process confusion.
- Several large raw outputs were read or returned after validation runners had already saved full output to files, increasing context unnecessarily.
- Git rebase/conflict operations occurred during the long implementation session and created additional process complexity and large outputs.

## Subagent failures and friction

Session summary:

- Subagent calls: 78
- Subagent agents: 5
- Subagent timeouts: 0 observed
- Longest subagent duration: 143,759 ms
- `cartographer-auditor`: 50 calls, 5 errors, longest 143,759 ms
- `cartographer-drafter`: 4 calls, 1 error, longest 87,619 ms
- `scout`: 3 calls, longest 132,923 ms

Observed subagent failure modes:

1. **Provider/config failure:** an early subagent call was rejected because no OpenRouter API key was available.
2. **Acceptance parsing failure:** a subagent result was rejected because the acceptance-report block was not valid.
3. **Read-only auditor mismatch:** at least one auditor PASS stated it did not write an expected report because the auditor role was read-only; parent then needed to capture/report it.
4. **Long-running review calls:** no timeouts were recorded, but many auditor/scout calls ran 75–144 seconds, adding latency and increasing retry/friction risk.

## Largest context contributors

Largest tool/text outputs from the sanitized session analysis:

| Line | Tool | Size |
|---:|---|---:|
| 26 | bash | 102,324 chars |
| 186 | bash | 102,315 chars |
| 742 | cartographer_validation | 84,444 chars |
| 1037 | subagent | 63,304 chars |
| 24 | bash | 50,902 chars |
| 143 | bash | 46,973 chars |
| 6 | read | 44,199 chars |
| 840 | bash | 41,675 chars |
| 846 | bash | 40,950 chars |
| 706 | bash | 35,672 chars |

These outputs explain much of the context growth. Even if Pi truncates tool results during summarization, they remain in active context until a real Pi compaction occurs.

## Assessment of “compact after each implementation phase”

**Answer: it is not working as actual context compaction.** It is working only as Cartographer state/resume summarization.

What worked:

- Phase-end `compact-generate` calls were made.
- `.cartographer/<topic>/state.json` was updated.
- Resume context could be reconstructed from state/journal artifacts.

What did not work:

- No Pi compaction entry was created at phase boundaries.
- No chat history was pruned at phase boundaries.
- No context-percentage threshold was enforced.
- The agent kept carrying large prior tool results and subagent outputs until Pi’s automatic near-limit compaction.

## Assessment of a 60% context compaction policy

A 60% policy would likely have prevented the near-90% context condition, but it requires harness-level support or an extension. Cartographer state tools alone cannot know or reduce Pi context usage.

Recommended design direction for a later proposal:

1. Add a Pi extension or harness hook that listens to `session_before_compact`/usage telemetry or assistant-turn completion and triggers proactive compaction around 60–70% context.
2. Tie implementation phase-end to a real Pi compaction request when running in interactive Pi, after writing `.cartographer` state and context packs.
3. Rename Cartographer `compact-generate` language to avoid implying transcript compaction; e.g. “state snapshot” or “resume snapshot.”
4. Add a workflow guard: if `inputTokens/contextWindow` exceeds threshold, stop editing, write state snapshot, request/perform Pi compaction, then resume from `state-resume`.
5. Continue using validation runner full-output files and `maxOutputChars` aggressively; do not read full saved validation logs unless necessary.

## Bottom line

The context exceeded 90% because the only actual Pi compaction mechanism in effect was the default near-limit auto-compaction. Cartographer’s phase compaction produced useful durable state, but it did not invoke Pi context compaction. The implementation workflow needs an explicit bridge between phase/resume snapshots and real Pi transcript compaction, plus a proactive threshold such as 60% if that is the desired safety margin.
