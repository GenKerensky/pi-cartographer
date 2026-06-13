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
