---
name: "interview"
description: "Run a post-research Cartographer interview to resolve unresolved user-owned decisions one question at a time before or during requirements/design work."
version: 1
created: "2026-06-12"
updated: "2026-06-12"
---

# Pi Cartographer Interview

## When to Use

Use this skill for a Cartographer topic after proposal acceptance and after relevant research is exhausted, when unresolved user-owned decisions remain before requirements/design can be completed.

Do **not** use this skill to ask questions that can be answered by:

- repository inspection;
- existing `.plan/<topic>/` artifacts;
- official documentation;
- prior art or web research;
- established best practices;
- deterministic validation output.

The interview is a clarification gate, not a shortcut around research.

## Inputs

Primary topic artifacts:

- `.plan/<topic>/proposal.md`
- `.plan/<topic>/facts.nodes.jsonl` and `facts.edges.jsonl`
- `.plan/<topic>/map.nodes.jsonl` and `map.edges.jsonl`
- `.plan/<topic>/requirements.md` and requirements JSONL, when present
- `.plan/<topic>/design.md` and design JSONL, when present
- `.plan/<topic>/context-packs.jsonl`
- `.plan/<topic>/receipts.jsonl`
- `.plan/_index/project-graph.sqlite`

Interview artifacts produced or updated by the parent writer:

- `.plan/<topic>/interview.md`
- `.plan/<topic>/interview.nodes.jsonl`
- `.plan/<topic>/interview.edges.jsonl`

## Entry Contract

Before asking the user anything:

1. Confirm the topic is accepted or explicitly approved for interview.
2. Refresh or query the shared index when needed.
3. Inspect proposal goals/non-goals, facts, map references, requirements/design drafts, receipts, and context packs.
4. Exhaust relevant research and local inspection.
5. Write a compact list of unresolved user-owned decisions.
6. Ask only the highest-priority unblocked question.

If no unresolved user-owned decision remains, skip the interview and proceed to requirements/design or plan work.

## One-Question Interview Loop

Ask one question at a time. Each question must include:

- the decision ID or short label;
- why the question cannot be answered from research/code/docs;
- the recommended answer first;
- concise alternatives with tradeoffs;
- downstream impact on requirements/design/plan;
- whether the answer blocks progress or can be deferred.

Use structured choices when possible. For complex choices, include a compact rationale and keep the user response burden low.

After each answer:

1. Record the answer in `interview.md`.
2. Upsert the corresponding `interview.nodes.jsonl` records.
3. Upsert dependency/provenance edges in `interview.edges.jsonl`.
4. Decide the next single question or stop.
5. Do not ask a follow-up until the previous answer has been recorded.

## Pause, Resume, and Re-Entry

The interview may pause when:

- the user asks to stop;
- a deferred choice is explicitly non-blocking;
- enough decisions exist to draft requirements/design;
- a new research task is discovered.

Requirements or design authoring may re-enter interview one question at a time when new unresolved user-owned decisions appear. Re-entry must cite the requirement/design draft section or decision that surfaced the ambiguity.

## Approval Summary

Before requirements/design output is treated as accepted, produce a compact grouped summary:

- accepted decisions;
- deferred choices and why they are non-blocking;
- unresolved blockers, if any;
- requirements/design sections affected;
- validation or research references used.

Ask the user to approve the summary when it changes product behavior or durable workflow semantics.

## Interview Record Shapes

Use JSONL records with stable IDs. Suggested prefixes:

- `INT-Q-*` for candidate questions;
- `INT-R-*` for researched answers;
- `INT-REC-*` for recommendations;
- `INT-A-*` for user answers;
- `INT-D-*` for accepted decisions;
- `INT-DEF-*` for deferred choices;
- `INT-BLK-*` for unresolved blockers.

Example nodes:

```jsonl
{"id":"INT-Q-001","type":"candidate-question","status":"asked","title":"Choose interview trigger","summary":"Clarify whether interview is mandatory for all scoped changes.","source":"interview.md#choose-interview-trigger","fact_refs":["F001"],"requirement_refs":["REQ-INT-001"]}
{"id":"INT-R-001","type":"researched-answer","status":"answered","title":"Research result","summary":"Code/docs do not determine the product preference.","source":"interview.md#choose-interview-trigger","fact_refs":["F001","F002"]}
{"id":"INT-REC-001","type":"recommendation","status":"answered","title":"Recommended trigger","summary":"Run interview only after research exhaustion when unresolved user-owned decisions remain.","source":"interview.md#choose-interview-trigger","depends_on":["INT-R-001"]}
{"id":"INT-A-001","type":"user-answer","status":"answered","title":"User accepted recommendation","summary":"User chose the recommended post-research trigger.","source":"interview.md#choose-interview-trigger"}
{"id":"INT-D-001","type":"accepted-decision","status":"accepted","title":"Post-research interview gate","summary":"Interview starts after research exhaustion and only for unresolved user-owned decisions.","source":"interview.md#choose-interview-trigger","requirement_refs":["REQ-INT-001"],"design_refs":["DES-DEC-001"]}
{"id":"INT-DEF-001","type":"deferred-choice","status":"deferred","title":"Dashboard editor","summary":"Persistent dashboard editing is deferred because preview-first mockups are enough for v1.","source":"interview.md#mockup-mode"}
{"id":"INT-BLK-001","type":"unresolved-blocker","status":"blocked","title":"Missing policy decision","summary":"Implementation cannot proceed until the user chooses an approval policy.","source":"interview.md#approval-policy"}
```

Example edges:

```jsonl
{"from":"INT-Q-001","to":"INT-R-001","type":"answered_by","evidence":"Research result answers what can be known without user input."}
{"from":"INT-R-001","to":"INT-REC-001","type":"recommended_by","evidence":"Recommendation follows from research and proposal constraints."}
{"from":"INT-A-001","to":"INT-D-001","type":"decides","evidence":"User answer accepted the recommendation."}
{"from":"INT-D-001","to":"REQ-INT-001","type":"feeds_requirement","evidence":"Accepted decision becomes a requirement delta."}
{"from":"INT-D-001","to":"DES-DEC-001","type":"feeds_design","evidence":"Accepted decision informs design."}
{"from":"INT-DEF-001","to":"INT-D-001","type":"related_to","evidence":"Deferred choice is a non-blocking alternative."}
```

## Mockup Decision Aids

For UI-affecting decisions, use a mockup only when text options would be ambiguous. Keep v1 lightweight:

- prefer a single-file HTML mockup or static markdown/wireframe;
- optionally use browser/headless screenshot tooling when available;
- store durable mockup references only when they are intentionally cited;
- avoid `.plan/_private/**` for generated mockups;
- do not build a persistent mockup editor as part of the interview.

## Specialist Boundaries

The parent/current agent owns canonical `interview.*` writes. Specialists may consume read-only summaries only:

- `cartographer-drafter` may use interview summaries to draft requirements/design/plan text;
- `cartographer-compass` may use interview summaries for scope/dependency decisions;
- `cartographer-auditor` may use interview summaries to check traceability and approval evidence.

Do not give specialists raw `.plan/_private/**` paths or broad mutation authority for interview JSONL.

## Validation

After updating interview artifacts, run:

```bash
node --experimental-strip-types skills/plan/scripts/manage_jsonl.ts validate-topic --root "$PWD" --topic "<topic>" --json
python skills/plan/scripts/validate_planning_graph.py --root "$PWD" --topic "<topic>" --json
```

Run requirements/design tests when interview decisions are copied or cited into those artifacts.

## Pitfalls

- Do not ask multiple questions at once.
- Do not ask questions answerable by code, docs, prior art, or best practices.
- Do not treat interview artifacts as a substitute for requirements/design deltas.
- Do not leave accepted decisions only in chat; persist them.
- Do not put raw private evidence or transcript content into interview records.
- Do not continue past an unresolved blocker without user direction.

## Verification Checklist

- Research exhaustion was documented before the first question.
- Each user-facing prompt asked one question at a time.
- Recommended answers appeared first with rationale and tradeoffs.
- Answers, recommendations, deferrals, blockers, and accepted decisions were persisted.
- `interview.nodes.jsonl` and `interview.edges.jsonl` pass validation.
- Accepted decisions are copied or cited into requirements/design artifacts.
- Pause/resume or re-entry state is clear.
- Approval summary is recorded before requirements/design acceptance when behavior changes.
