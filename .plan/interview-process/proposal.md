# interview-process Proposal

## Description

Add an explicit interview process after an accepted proposal and after the agent has exhausted the relevant codebase and external research needed for requirements/design work, with an allowed re-entry point during requirements authoring when unresolved behavior appears. The interview should use a research-aware, code-aware, one-question-at-a-time loop inspired by `grill-me`: walk the decision tree, recommend a default answer, resolve dependencies between decisions, and avoid asking questions that the repository, documentation, external references, or established best practices can answer directly [F001].

The process should produce durable, spec-ready decisions rather than ad-hoc chat context. Its outputs should feed topic-local requirements deltas and design artifacts before planning, preserving the existing Cartographer split where proposals stay lightweight and detailed behavior/design lives downstream [F003].

For UI-affecting features, the process should optionally support lightweight mockups or wireframes as decision aids. The first version should treat mockups as scoped interview aids: simple generated HTML/image artifacts or TUI-rendered previews that help the user answer concrete behavior/layout questions, not a full production design tool.

## Problem Statement

Cartographer now has a clean proposal → requirements delta → design → plan → implement workflow, but the handoff from proposal to requirements can still leave behavioral ambiguity. The agent may either over-ask up front, invent product behavior while drafting requirements, or defer unclear choices until planning/implementation where they are more expensive to unwind.

The user wants a structured agent-user interview step that nails down exact behavioral changes and included features before the spec is finalized. The step should combine the rigor of relentless questioning with the discipline of first exhausting relevant codebase inspection, documentation lookup, prior-art research, and best-practice review, then persist only genuinely user-owned decisions into requirements/design artifacts rather than letting them disappear in conversational history.

## Goals

- Introduce a named interview/spec-refinement phase after proposal acceptance and after the agent has completed relevant research, before requirements/design planning, with an explicit re-entry path during requirements authoring when unresolved behavior is discovered.
- Make the interview research-aware and code-aware: the agent should inspect existing repository artifacts, documentation, prior art, and best practices for answerable questions before asking the user, matching and extending the `grill-me` reference behavior [F001].
- Ask one focused question at a time, include a recommended answer and rationale, and track dependencies so earlier decisions constrain later questions [F001].
- Produce durable outputs that downstream requirements/design artifacts can cite, such as resolved decisions, open questions, deferred choices, scenarios, acceptance checks, and design constraints.
- Support user approval in readable chunks before moving from interview output to requirements/design, following the Superpowers pattern of teasing a spec out of conversation before planning and implementation [F002].
- Include an optional UI-mockup path for UI-affecting features, with simple HTML/image/TUI previews to help the user choose behavior, layout, or interaction details [F004].

## Non-Goals

- Do not move detailed design or requirements back into `proposal.md`; the interview should bridge into requirements/design artifacts and respect ADR-0007 [F003].
- Do not build a general-purpose design editor, Figma replacement, or permanent visual prototyping platform in the first iteration.
- Do not require mockups for every feature; they should be opt-in or triggered only when UI behavior/layout ambiguity materially affects the spec.
- Do not let the interview become an unbounded interrogation. It should have stop conditions, progress summaries, and a clear handoff into requirements/design.
- Do not replace human approval gates for proposal, requirements/design, or plan acceptance.

## Background

The `grill-me` reference skill defines the core interview style: relentlessly interview about a plan/design, walk each branch of the design tree, resolve dependencies one-by-one, recommend an answer for each question, ask questions one at a time, and inspect the codebase instead when code can answer the question [F001].

Superpowers describes a broader methodology where the agent steps back before coding, asks what the user is really trying to do, teases a spec out of the conversation, presents it in digestible chunks, and only then moves to design approval, planning, and implementation [F002]. This aligns with adding a bounded Cartographer interview phase before requirements/design artifacts become authoritative.

Cartographer has already accepted a proposal/design/requirements split: proposals remain lightweight, while core user workflow or comparable-risk changes add topic-local requirements deltas and graph-backed design artifacts before planning [F003]. The interview process should therefore be a clarifying bridge, not a new place to store final detailed requirements.

Pi can support interactive TUI components and image rendering in capable terminals, which makes in-TUI interview flows and screenshot/mockup previews technically plausible [F004]. This repository also already carries Playwright/browser validation dependencies, so a later implementation could render simple single-file HTML mockups or capture screenshots without introducing a wholly new browser automation stack [F005].

## Viability

This feature is viable as a Cartographer workflow addition rather than a large platform rewrite. The first implementation can be mostly procedural: update workflow skills/docs, add graph records/receipts for interview decisions, and gate requirements/design generation on resolved interview outputs. Existing Pi skills are self-contained Markdown capability packages, Pi extensions can register deterministic custom tools, and pi-subagents guidance supports concrete role-specific tasks with parent-owned workflow authority [F902] [F903] [F905].

The most important implementation choice is artifact shape. A practical first version should add topic-local interview artifacts, for example `interview.md`, `interview.nodes.jsonl`, and `interview.edges.jsonl`, or fold interview decision nodes directly into `requirements.nodes.jsonl` when requirements authoring starts. A separate interview graph is more auditable and can preserve unresolved/deferred decisions; direct requirements insertion is simpler but risks losing the conversation trail.

The mockup path is feasible but should be phased. Minimal viable behavior is to let the interview create temporary or topic-local single-file HTML/wireframe artifacts and either show them via Pi TUI image support or export a screenshot produced by a headless browser run [F004] [F005]. The proposal should avoid committing to a dashboard-scale UI until requirements establish whether TUI-only previews, browser-opened HTML, or dashboard integration best fits user needs.

## Risks and Mitigations

- **Risk:** The interview asks questions that research could answer. **Mitigation:** require a research-exhaustion preflight: inspect code, docs, prior decisions, external references, and best practices before asking the user; ask only for product intent, tradeoff preference, or domain judgment that cannot be reasonably inferred.
- **Risk:** The interview becomes too long or repetitive. **Mitigation:** require one-question-at-a-time prompts, code/research-first checks, recommended defaults, dependency tracking, and explicit stop/summary rules [F001].
- **Risk:** The agent invents requirements while summarizing interview results. **Mitigation:** store decisions and unanswered questions as graph-backed artifacts with citations to user answers or source facts before requirements/design generation.
- **Risk:** Mockup tooling expands scope. **Mitigation:** treat UI previews as optional decision aids in v1, with a narrow single-file HTML/screenshot path and no persistent editor.
- **Risk:** The new phase conflicts with the proposal/design split. **Mitigation:** keep proposal lightweight and route resolved behavior into topic-local requirements/design artifacts as required by ADR-0007 [F003].

## ADR Metadata
- `adr_required`: true
- `adr_reason`: This changes the durable Cartographer workflow lifecycle by adding a new phase/artifact contract between proposal and requirements/design, and may introduce UI/mockup tooling decisions.
- `adr_options_status`: missing
- `adr_tool_mode`: evaluate-now
## Scope Gate

- `requirements_required`: true
- `requirements_reason`: This changes a core Cartographer user workflow and durable product behavior. It needs topic-local requirements and design artifacts before planning so the interview loop, artifacts, stop conditions, and optional UI mockup behavior are specified precisely.

## Next Artifacts

Use the scoped path: `proposal -> interview requirements delta -> interview design -> plan -> implement -> fold accepted deltas into docs/requirements.md`.

The next requirements artifact should define:

- When the interview starts, pauses, resumes, and stops, including the required post-research entry condition.
- What counts as a code-answerable, research-answerable, best-practice-answerable, or genuinely user-answerable question.
- The minimum durable record for each question, recommendation, answer, decision dependency, unresolved question, and deferred choice.
- How interview results become requirements/scenarios/acceptance checks.
- Whether UI mockups are optional, when they are triggered, and which v1 preview mode is acceptable.

The design artifact should compare at least these options:

1. Separate `interview.md` plus `interview.nodes.jsonl`/`interview.edges.jsonl` before requirements generation.
2. Directly appending interview-derived nodes into `requirements.nodes.jsonl` and `design.nodes.jsonl`.
3. A hybrid where `interview.md` is the human-readable transcript/summary while accepted decisions are copied into requirements/design graphs.

It should also compare mockup delivery modes: TUI image preview, browser-opened single-file HTML, headless screenshot attached/rendered in TUI, and deferring visual previews to a later dashboard-integrated feature.
