# interview-process Design

## Decision One — Post-research interview gate

Accept a post-research interview gate. The agent should complete proposal research, project-context retrieval, prior-art/best-practice lookup, and local artifact inspection before asking interview questions. The interview is therefore not the first discovery mechanism; it is the escalation path for decisions that remain user-owned after research. Satisfies [REQ-INT-001] and [REQ-INT-002].

## Decision Two — Hybrid interview artifact model

Use a hybrid artifact model: create human-readable `interview.md` plus machine-readable `interview.nodes.jsonl` and `interview.edges.jsonl` for the interview record, then copy or cite accepted interview decisions into `requirements.nodes.jsonl` and `design.nodes.jsonl`. This preserves the decision trail while keeping requirements/design artifacts authoritative for planning. A separate-only interview artifact would preserve history but force later tooling to chase non-authoritative decisions; direct-only requirements/design nodes would be simpler but lose the interview trail. Satisfies [REQ-INT-003] and [REQ-INT-004].

## Decision Three — Bounded approval checkpoint

End the interview with a compact decision summary grouped by accepted decisions, researched answers not asked, deferred/out-of-scope choices, and unresolved blockers. The user approves this summary before requirements/design generation proceeds. Satisfies [REQ-INT-004].

## Decision Four — Optional preview-first mockup aid

For UI-affecting interview questions, start with lightweight preview artifacts rather than a persistent editor. The preferred v1 path is generated single-file HTML when visual structure matters, with optional headless screenshot capture for TUI display when supported. Browser-opened HTML is useful when the user can interact locally; headless screenshots are useful for static comparison in the TUI; direct TUI image preview is useful only in terminals that support inline images; dashboard integration should be deferred until repeated use justifies a larger UI surface. Plain structured options remain acceptable when a visual aid adds little value. Satisfies [REQ-INT-005].

## Alternative One — Ask immediately after proposal

Rejected. Starting the interview immediately after proposal, before research exhaustion, risks asking the user questions that code, documentation, prior art, or best practices could answer.

## Alternative Two — Store only separate interview artifacts

Rejected. Keeping only `interview.md` plus interview JSONL would preserve history, but it would make requirements/design less authoritative and force planning to inspect another artifact family for accepted behavior.

## Alternative Three — Store only requirements/design nodes

Rejected. Writing only requirements/design nodes is simpler, but it loses the interview trail, including recommendations, researched-but-not-asked questions, dependencies, and deferred decisions.

## Alternative Four — Build a persistent mockup editor first

Rejected for v1. A full editor would expand scope beyond the goal of using mockups as decision aids for requirements clarification.
