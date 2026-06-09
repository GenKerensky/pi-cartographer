# Auditor Report — sunset-pathfinder (ACI / canonical-state revision)

> **AI disclosure:** Pi Coding Agent (cartographer-auditor): Claude Opus 4.8 (AWS Bedrock US)

- **Topic:** sunset-pathfinder
- **Repo root:** /home/jobyrd/code/pi-cartographer
- **Phase:** proposal (re-validation after the second material design change — agent-state format + hybrid ACI)
- **Review type:** read-only semantic audit on top of an already-PASSED deterministic gate
- **Date:** 2026-06-09

## VERDICT: FAIL

Sole blocker is **one trivial, revision-introduced editorial defect** (a subjectless/misattributed "It" in the Background section). All five substantive audit dimensions PASS. Remediation is a one-line copyedit; re-running deterministic validation (prose-only change) and a re-audit should flip this to PASS.

I am rendering FAIL rather than PASS because the defect produces a referentially **wrong** reading (the sentence grammatically attaches to the SWE-agent ACI instead of Cartographer) in a narrative section that will seed an ADR. It is required-to-fix, but low-severity and isolated.

---

## Required corrections (must fix before acceptance)

### RC-1 — Orphaned/misattributed pronoun in Background (`proposal.md:47`)

The Background infrastructure paragraph begins:

> "` It persists workflow state in \`receipts.jsonl\`/\`context-packs.jsonl\`, enforces a Clean Context Contract …`"

- It has a **stray leading space** and **no grammatical subject**. The immediately preceding sentence (`proposal.md:9`, the new state-format/ACI paragraph) ends "…a purpose-built Agent-Computer Interface materially improves agents' ability to navigate, edit, and test [F085]." A literal parse therefore attaches "It" to **the SWE-agent ACI**, asserting that the ACI "persists workflow state in receipts.jsonl / enforces the Clean Context Contract / ships validation_runner.py" — which is false. The intended subject is **Cartographer**.
- This is an artifact of this revision: inserting the new ACI paragraph (`proposal.md:9`) between Cartographer's introduction and this sentence orphaned the antecedent.
- **Fix:** restore an explicit subject and remove the leading space, e.g. "Cartographer already has substantial infrastructure to build on. It persists workflow state in `receipts.jsonl`/`context-packs.jsonl`, enforces a Clean Context Contract …". (Citations `[F064][F065][F062]` in the paragraph are correct and need no change.)
- Impact: editorial/internal-consistency only — no fact, citation, graph, goal, or ADR-metadata change. Deterministic validation will remain PASS after the edit.

No other required corrections.

---

## Confirmation of the five audit criteria

### (1) Internal consistency of the canonical-files + ACI design — PASS
- **Description / G3 / Background / Viability / Step 1 table / Steps 2–7 / both Mermaid diagrams** consistently describe the same model: canonical schema-validated `.cartographer/` files (JSON current-truth, JSONL append-only, TOML config), Markdown demoted to a generated non-authoritative `status.md`, and a hybrid ACI where the agent **reads files directly** but **mutates only via semantic state-transition commands** with a re-validate escape hatch.
- **Flowchart** (`proposal.md` Design): encodes read path (`Loop -. reads files directly .-> FILES`) vs. write path (`Loop -. mutates only via .-> ACI`; `ACI --> FILES`), Orient reads `state.json`/`plan.json`/JSONL, Narrow/Validate/Record/Compact all routed "via ACI", auditor/compass retained read-only, pathfinder retired. Coherent.
- **Sequence diagram**: `compact.generate` reads receipts + JSONL + `state.json`, folds history into `state.json`, refreshes `handoff.json` + `status.md`, validates schema + invariants, returns PASS/reload or FAIL/corrections. Coherent with Step 5.
- **Map graph**: all 12 new `.cartographer/` artifact nodes present (`state.json`, `plan.json`, `working-set.json`, `validation.jsonl`, `decisions.jsonl`, `events.jsonl`, `handoff.json`, `config.toml`, `schemas`, `status.md`) plus `config:cartographer-state-aci` and `config:cartographer-compact`. 30 nodes / 41 edges. **Zero dangling edge endpoints** (all `from`/`to` resolve to existing nodes). `status.md --references--> state.json`, `compact part_of state-aci`, ACI `constrained_by config.toml`, `state.json depends_on receipts.jsonl` — all coherent.
- **No leftover graph-state references**: grep for `state.nodes` / `state.edges` / "JSON graph (state…)" returns **zero hits** in `proposal.md`, `map.*.jsonl`, and `facts.*.jsonl`. (The only surviving "graph" usages are legitimate: `plan.json` "Task graph"/`plan.nodes/edges` mirror, and constraint C004's historical claim text — see Residual R-a.)

### (2) New sources and facts supported by them with resolving edges — PASS
- **S008** (`agent-state-data-shape.md`), **S009** (`agent-state-data-management.md`), **S017** (SWE-agent ACI, arXiv 2405.15793) are all real `source` nodes (source count = 17).
- Support edges resolve cleanly and are semantically apt:
  - Format facts **F070–F082 → supported_by S008** (data-shape conversation).
  - ACI/mutation facts **F083, F084, F086–F091 → supported_by S009** (data-management conversation).
  - **F085 → S009 + S017** and **C005 → S009 + S017** (the SWE-agent ACI corroborates the "purpose-built ACI materially improves reliability" claim and the hybrid-interface constraint).
  - **R007 → S009**.
- All support-edge targets exist as nodes (no dangling). New constraint **C005** is typed `constraint`; new risk **R007** is typed `risk`.

### (3) All proposal fact citations resolve with supporting edges — PASS
- `fact-citation-summary`: **missing = [], unsupported = []**; 200 proposal citations, 76 unique, 99 supported facts. Independently consistent with the new-fact support edges in (2).
- (Note F082 "JSON Patch as update primitive" is supported by S008 but not cited in the proposal — acceptable; an uncited-but-supported fact is not an error.)

### (4) Goals / Non-goals / ADR metadata alignment — PASS
- All six `goal:*` IDs cited in the proposal exist as nodes. **G3** is correctly retitled "Persisted session state (canonical files + controlled writes)" and now cites `[F070][F079][F083][C004][C005]`; `supports_goal` edges into `goal:persisted-state` include the new F083 and C005. C005 also `supports_goal goal:reuse-infrastructure` (ACI as a sibling of existing `cartographer_*` tools) — consistent with the Viability text.
- Non-goals unchanged in scope and not contradicted by the ACI (the ACI is "implementable in Cartographer skills … and helper scripts [C003]", honoring the "no pi-subagents runtime change" non-goal).
- ADR metadata: `adr_required: true`; `adr_reason` cites `[F060][F061][F062][R005]` (all present) and explicitly names "a new on-disk state-artifact contract"; options A/B/C documented; `adr_tool_mode: finalize-after-validation`. Internally aligned and supported. (See deferred D-c for an optional strengthening.)

### (5) Every step declares dependencies + risks; DAG coherent after renumbering — PASS
- Exactly **7 steps**; each has a `**Dependencies.**` and a `**Risks.**` line (verified at lines 118/120, 130/132, 142/144, 154/156, 180/182, 192/194, 204/206).
- Renumbering after inserting the new Step 2 (ACI) is **internally consistent**: in-text cross-refs resolve correctly — Step 3 "Compacts … (Step 5)" → compaction is Step 5; Step 3 "auditor gate (Step 6)" → gate is Step 6; Step 4 risk "handled in Step 7" → ADR reconciliation is Step 7. No reference points at a stale step number.
- The **computational** dependency DAG (map `depends_on` edges via artifact/config/file nodes) is **acyclic**: `implement SKILL → state-aci`, `implement SKILL → auditor`, `state-aci → schemas`, `compact → schemas`, `state.json → receipts.jsonl`. (See residual R-b for a prose-level soft cross-reference.)

---

## Residual risks / deferred (non-blocking) observations

- **R-a (deferred): C004 retains "graph structures (typed nodes + edges)" framing.** Constraint `C004` (an *existing* node capturing the verbatim S007 user directive) still claims state must be "JSON/JSONL graph structures (typed nodes + edges)", whereas the adopted design (F071/F079) defines `state.json` as a canonical *snapshot* "rather than a … loose graph". Every C004 citation in the revised proposal leverages only its still-valid core (structured JSON/JSONL, **not** Markdown), so no live contradiction exists, and grep confirms no `state.nodes/edges` text survives. *Optional:* add a one-line note to C004's relevance recording that F070–F082 refine the "nodes+edges" framing into the snapshot + append-only-JSONL + task-graph model, to prevent future confusion.
- **R-b (deferred): Step 3 ↔ Step 6 prose cross-reference reads as a soft cycle.** Step 3 lists "Step 6 (auditor gate retained)" under Dependencies while Step 6 depends on "Steps 1–5" (which includes Step 3). This is a documentation cross-reference (the retained gate is part of the loop), not a build-order cycle, and the map DAG is acyclic. *Optional:* reframe Step 3's reference as "see Step 6" rather than a dependency to remove the apparent loop.
- **R-c (deferred): `adr_reason` could name the ACI write-contract explicitly.** It names "a new on-disk state-artifact contract"; the hybrid state-mutation ACI (Step 2 / F083–F091 / C005 / R007) is the enforcement half of that contract and is subsumed but not spelled out. *Optional:* extend `adr_reason`/Option B to explicitly cite the state-transition ACI so the future ADR's scope is unambiguous.
- **R-d (trivial): node type/namespace mismatch.** `data-artifact:.cartographer/config.toml` carries `type:"config"` while its sibling `.cartographer/` files use `type:"data-artifact"`. Deterministic validation accepts it; semantically defensible (it is a config file grouped with the state artifacts). No action required.
- **Standing risks already modeled** (R001 lossy compaction, R002 write-quality, R003 instructions-not-gates, R004 throughput, R005 ADR drift, R006 file proliferation, R007 ACI single-point-of-failure) are carried in the fact graph; R007 has `mitigated_by` F086 + F090 (observable files + re-validate escape hatch), matching the Step 2 / Viability narrative.

---

## Validation receipts reviewed
- `receipt:sunset-pathfinder:validate-topic-aci-state-revision:2026-06-09T14:05:00Z` — validation-receipt, **passed** (ok=true, 0 errors / 0 warnings; 30 map nodes, 41 map edges, 122 fact nodes, 135 fact edges).
- Prior passing receipts for context: `validate-topic-json-state-revision:2026-06-09T13:10:00Z`, `validate-topic:2026-06-09T12:30:00Z`; prior auditor passes `auditor-pass-revision:2026-06-09T13:25:00Z`, `auditor-pass:2026-06-09T12:45:00Z`.

## Helper summaries reviewed
- `validate-topic-summary` (sunset-pathfinder): 30/41/122/135, error_count 0, warning_count 0.
- `fact-citation-summary`: facts 84, sources 17, supported_facts 99, proposal_citations 200, unique 76, **missing=[]**, **unsupported=[]**.
- `receipt-summary`: 5 receipts, all passed (3 validation, 2 auditor).
- `context-pack-summary`: `context:sunset-pathfinder:proposal:2026-06-09` (references proposal/facts/map + in-repo evidence).
- Targeted reads: `proposal.md` (full), `map.nodes.jsonl`/`map.edges.jsonl`, `facts.nodes.jsonl`/`facts.edges.jsonl` (node IDs, edge endpoints, support/goal/risk/applies_to edges, C004/C005 + F070–F091 text).

## Deterministic receipt path for parent recording
- The parent should record this auditor decision (FAIL → required correction RC-1) as an `auditor-receipt` in:
  `.plan/sunset-pathfinder/receipts.jsonl`
- After RC-1 is applied: re-run `cartographer_jsonl validate-topic --topic sunset-pathfinder` (expected PASS — prose-only change) and re-audit; the verdict should then flip to PASS with only the deferred items remaining.

## Scope note
Read-only review only. No files were edited, no canonical receipts/ADRs/JSONL artifacts were mutated, and no new design content was created. This report is the sole artifact written, to the path requested by the parent.
