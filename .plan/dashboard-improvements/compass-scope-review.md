Per the no-edit constraint, I did not create/update the requested report file.

## decision summary
Proposal scope makes sense. `requirements_required: true` and `adr_required: true` are appropriate.

Required correction only: update `## Next Artifacts` so ADR handling does not replace the standard scoped requirements fold. Use:

`proposal -> requirements delta -> design -> plan -> implement -> fold accepted deltas into docs/requirements.md`

Keep “ADR after validation” as separate final ADR handling driven by `adr_required: true` / `adr_tool_mode`.

## options considered
- Lightweight `proposal -> plan -> implement`: reject; this changes a core dashboard workflow.
- Scoped requirements/design before plan: correct.
- Current path with ADR as terminal artifact: needs wording correction above.

## recommendation
Accept the proposal scope after correcting only the Next Artifacts path. Do not change `requirements_required` or `adr_required`.

## stop rule
Do not proceed to plan/implementation until requirements and design artifacts are created and validated.

## references reviewed
- `.plan/dashboard-improvements/proposal.md`
- validate-topic summary: 0 errors/warnings
- fact citation summary: 12/12 cited facts supported, no missing/unsupported citations
- context pack `context-pack:dashboard-improvements:proposal`
- receipt `receipt:manual:validation:2026-06-12T21:57:11+00:00`
- facts/map node and edge summaries
- ADR-0005 and ADR-0007 workflow constraints