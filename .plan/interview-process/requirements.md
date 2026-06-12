# interview-process Requirements

## ADDED Requirements

### REQ-INT-001 — Research-exhausted interview entry

The system MUST start the interview/spec-refinement step only after the agent has exhausted relevant codebase inspection, prior planning artifacts, documentation lookup, external references, and best-practice research for the current topic. The interview MUST ask only questions that require user product intent, tradeoff preference, domain knowledge, or approval rather than questions that can be reasonably answered through research [F001] [F002].

#### Scenario SCN-INT-001 — Research answers a candidate question

Given the agent has a candidate interview question, when repository context, documentation, prior art, or best practices answer it with sufficient confidence, then the agent records the researched answer and does not ask the user.

#### Scenario SCN-INT-002 — User intent is required

Given the agent has exhausted relevant research and still cannot determine a product behavior or tradeoff, when the answer requires user intent or preference, then the agent asks one focused question with a recommended answer and rationale.

### REQ-INT-002 — One-question decision tree interview

The system MUST conduct the interview one question at a time, walk dependent branches of the decision tree in order, include a recommended answer for each user-facing question, and record how each answer affects later questions [F001].

#### Scenario SCN-INT-003 — Dependent decision resolved

Given a user answers a question that constrains later behavior, when the next interview step runs, then it presents only follow-up questions that remain relevant under that answer.

### REQ-INT-003 — Durable interview records

The system MUST persist interview outputs as topic-local durable records that downstream requirements and design artifacts can cite. Each record SHOULD distinguish researched answers, user answers, recommendations, accepted decisions, deferred choices, unresolved questions, and dependency relationships [F003].

#### Scenario SCN-INT-004 — Requirements consume interview decisions

Given the interview has accepted decisions, when requirements/design artifacts are generated, then relevant decisions are represented or cited by requirement, scenario, acceptance-check, or design-decision nodes.

### REQ-INT-004 — Bounded pause, resume, re-entry, and summary behavior

The system MUST provide explicit start, pause, resume, re-entry, stop, progress summary, and readable approval checkpoint behavior before moving from interview output into requirements/design artifacts [F002]. Requirements authoring MUST be able to re-enter the interview when it discovers unresolved user-owned behavior after the initial interview.

#### Scenario SCN-INT-005 — Interview complete

Given all required behavior questions are answered, deferred, or rejected as out of scope, when the interview summarizes results, then the user can approve the summarized decisions before requirements/design generation continues.

#### Scenario SCN-INT-007 — Requirements authoring re-enters interview

Given requirements authoring discovers an unresolved user-owned behavior decision, when research cannot answer it, then the workflow pauses requirements authoring, asks the interview question, records the answer, and resumes requirements authoring with the new decision cited.

### REQ-INT-005 — Optional UI mockup decision aid

For UI-affecting features, the system SHOULD support an optional lightweight mockup/wireframe decision aid. The mockup path MUST remain scoped to answering behavior/layout questions and MUST NOT become a required design-editor workflow [F004] [F005].

#### Scenario SCN-INT-006 — UI ambiguity benefits from preview

Given a UI-related interview question depends on layout, interaction, or visual hierarchy, when a simple mockup can clarify the decision, then the agent may present a lightweight preview and ask the user to choose or refine the behavior.
