# Requirements

This file contains durable requirements folded from accepted Cartographer topic deltas.

## Purpose

Describe the stable behavioral requirements this project currently satisfies.

## Requirements

Durable requirement blocks use stable `REQ-*` identifiers and may be folded from `.plan/<topic>/requirements.nodes.jsonl`.

### REQ-INT-001 — Research-exhausted interview entry

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: interview-process
- Fold receipts: receipt:interview-process:requirements-fold:2026-06-12T22:18:35Z

The system MUST start the interview/spec-refinement step only after the agent has exhausted relevant codebase inspection, prior planning artifacts, documentation lookup, external references, and best-practice research for the current topic.

#### Scenarios

- **SCN-INT-001**: Research answers a candidate question
- **SCN-INT-002**: User intent is required

### REQ-INT-002 — One-question decision tree interview

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: interview-process
- Fold receipts: receipt:interview-process:requirements-fold:2026-06-12T22:18:35Z

The system MUST conduct the interview one question at a time, walk dependent branches of the decision tree in order, include a recommended answer for each user-facing question, and record how each answer affects later questions.

#### Scenarios

- **SCN-INT-003**: Dependent decision resolved

### REQ-INT-003 — Durable interview records

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: interview-process
- Fold receipts: receipt:interview-process:requirements-fold:2026-06-12T22:18:35Z

The system MUST persist interview outputs as topic-local durable records that downstream requirements and design artifacts can cite.

#### Scenarios

- **SCN-INT-004**: Requirements consume interview decisions

### REQ-INT-004 — Bounded pause, resume, re-entry, and summary behavior

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: interview-process
- Fold receipts: receipt:interview-process:requirements-fold:2026-06-12T22:18:35Z

The system MUST provide explicit start, pause, resume, re-entry, stop, progress summary, and readable approval checkpoint behavior before moving from interview output into requirements/design artifacts.

#### Scenarios

- **SCN-INT-005**: Interview complete
- **SCN-INT-007**: Requirements authoring re-enters interview

### REQ-INT-005 — Optional UI mockup decision aid

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: should
- Source topic: interview-process
- Fold receipts: receipt:interview-process:requirements-fold:2026-06-12T22:18:35Z

For UI-affecting features, the system SHOULD support an optional lightweight mockup/wireframe decision aid without making mockups a required design-editor workflow.

#### Scenarios

- **SCN-INT-006**: UI ambiguity benefits from preview

### REQ-PCH-001 — Phase-end Pi compaction bridge

- Status: accepted
- Change type: ADDED
- Domain: workflow
- Priority: must
- Source topic: phase-compaction-hooks
- Fold receipts: receipt:P2:validation:2026-06-12T21:48:52+00:00, receipt:P2:validation:2026-06-12T21:48:53+00:00

After a Cartographer implementation phase writes its state snapshot and resume context, the workflow must be able to trigger actual Pi context compaction through the Pi harness rather than only updating .cartographer state.

#### Scenarios

- **SCN-PCH-001**: Phase completion queues actual compaction

### REQ-PCH-002 — Proactive context threshold compaction

- Status: accepted
- Change type: ADDED
- Domain: workflow
- Priority: must
- Source topic: phase-compaction-hooks
- Fold receipts: receipt:P2:validation:2026-06-12T21:48:52+00:00, receipt:P2:validation:2026-06-12T21:48:53+00:00

During active Cartographer implementation, the extension should detect context usage crossing a configurable threshold, defaulting near 60 percent, and request actual Pi compaction outside mutable tool execution.

#### Scenarios

- **SCN-PCH-002**: Threshold crossing queues one compaction request

### REQ-PCH-003 — Additive Cartographer summary focus

- Status: accepted
- Change type: ADDED
- Domain: workflow
- Priority: must
- Source topic: phase-compaction-hooks
- Fold receipts: receipt:P2:validation:2026-06-12T21:48:52+00:00, receipt:P2:validation:2026-06-12T21:48:53+00:00

The compaction bridge must preserve Pi's default summarizer by default while adding customInstructions that retain bounded Cartographer resume context and continue-with-implement-skill guidance.

#### Scenarios

- **SCN-PCH-003**: Compaction prompt carries bounded resume state

### REQ-PCH-004 — Safe configuration and observability

- Status: accepted
- Change type: ADDED
- Domain: workflow
- Priority: should
- Source topic: phase-compaction-hooks
- Fold receipts: receipt:P2:validation:2026-06-12T21:48:52+00:00, receipt:P2:validation:2026-06-12T21:48:53+00:00

The compaction bridge must be configurable or disableable, avoid compaction loops, and expose compact outcomes without storing raw transcript summaries in plan artifacts.

#### Scenarios

- **SCN-PCH-004**: Unavailable Pi context is reported as safe skip
- **SCN-PCH-005**: Recent compaction request suppresses duplicate trigger

### REQ-TEST-001 — Design-phase testing strategy

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: testing-strategy

The system MUST require applicable design phases to record a topic-specific testing strategy before planning begins, including languages, application/change type, existing test tools, consulted docs/best practices, unit strategy, integration strategy, E2E strategy, and at least one E2E validation that must run at least once.

#### Scenarios

- **SCN-TEST-001**: TypeScript frontend feature

### REQ-TEST-003 — At least one E2E validation

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: testing-strategy

The system MUST require every feature/change topic to design at least one E2E validation that runs at least once before acceptance, with the strategy deciding whether it is recurring CI, one-time validation, or manual-assisted evidence.

### REQ-TEST-002 — Plan validation names concrete tests

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: testing-strategy

The system MUST require plan validation items for behavior-changing phases to name specific test artifacts, scenarios, or commands that must be created, updated, and pass; generic validation language such as only 'run tests' is insufficient.

#### Scenarios

- **SCN-TEST-002**: Python CLI/system tool feature
- **SCN-TEST-004**: Plan rejects generic validation

### REQ-TEST-004 — Existing-tool preservation and user-approved pivots

- Status: accepted
- Change type: ADDED
- Domain: cartographer-workflow
- Priority: must
- Source topic: testing-strategy

The system MUST build on existing project test tools by default and MUST ask the user before requiring a major testing-tool pivot or upgrade. When a testing strategy would add, remove, replace, or standardize a major testing framework/tool for the project, the workflow MUST trigger ADR evaluation/generation before implementation planning treats that toolchain change as accepted.

#### Scenarios

- **SCN-TEST-003**: Tool pivot recommendation
