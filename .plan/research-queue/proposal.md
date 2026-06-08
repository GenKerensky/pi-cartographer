# research-queue Proposal

## Description

Introduce an asynchronous research-and-ingestion workflow for Cartographer proposals. The parent session keeps orchestration authority, launches scoped researcher subagents in the background as knowledge gaps appear, and continues drafting instead of waiting for each research run to finish. Researchers write isolated file-only outputs; archivists convert completed research into queue bundles; a JSONL transaction queue validates and serializes canonical graph updates through one locked commit path.

This keeps the parent responsible for artifact integrity and final validation while using subagents for scoped evidence gathering and compression [F010]. It uses the existing researcher for web/source discovery [F001], background subagent semantics for non-blocking runs [F002], and file-only outputs to avoid flooding parent context [F003].

## Problem Statement

The current proposal workflow can identify research gaps, but canonical fact/map updates are not safe for concurrent child writes. The current JSONL upsert path is read-modify-write with atomic replacement, which protects individual file replacement but does not prevent lost updates when multiple writers modify the same canonical JSONL files [F004]. The exposed `cartographer_jsonl` actions do not include queue or transactional commit actions today [F005].

At the same time, the current archivist role is meant to produce source-backed source/fact/support JSONL suggestions, but it has only `read`, `bash`, and `write` tools and no direct JSONL tool access [F009]. Without an explicit queue contract, parallel researchers can produce useful evidence faster than the parent can safely merge it. Fact ID stability is also constrained because proposal citation validation currently recognizes bracketed numeric fact IDs only, such as `[F001]` [F006].

## Goals

- Let the parent launch multiple scoped researcher subagents asynchronously while continuing proposal work.
- Require researchers to write isolated outputs and compact receipts, preferably using file-only child outputs [F003].
- Convert research outputs into archivist-produced JSONL queue bundles instead of direct canonical graph edits.
- Add JSONL transaction queue actions for init, submit, list, validate, apply, reject, and audit.
- Ensure exactly one locked canonical commit path applies queued updates to canonical JSONL graph files.
- Preserve stable existing fact IDs and provide deterministic/content-derived IDs or an explicit migration path compatible with current numeric citation validation [F006].
- Record receipts for research, bundle creation, queue validation, queue apply/reject decisions, and final validation using the existing receipt model where possible [F007].
- Block final acceptance until strict validation gates prove that no relevant background work or queued transaction remains unresolved.

## Non-Goals

- Replacing parent-session orchestration or final judgment; the parent remains responsible for orchestration and validation [F010].
- Allowing researchers or archivists to write canonical `facts.nodes.jsonl`, `facts.edges.jsonl`, `map.nodes.jsonl`, or `map.edges.jsonl` directly.
- Building a general-purpose distributed job scheduler. The scope is proposal-time research fanout, polling, archival bundling, and serialized JSONL ingestion.
- Automatically accepting research claims without source-backed archivist compression and queue validation.
- Changing `.plan/_private/**` handling or reading private raw artifacts.

## Background

Pi subagent guidance keeps orchestration authority in the parent session and asks the parent to pass concrete role-specific tasks to child agents [F905]. Cartographer proposal guidance likewise keeps the parent responsible for orchestration, artifact integrity, index freshness, and final validation [F010]. The builtin researcher is already the role configured for web research and produces a `research.md` brief [F001]. Pi subagents can run in the background and be inspected later by status actions [F002], and file-only output mode can return concise saved-output references instead of large content [F003].

Cartographer already has validation and receipt concepts for planning artifacts: receipt records require core fields and validation evidence [F007], and the validation runner can append receipts with command, exit code, duration, hash-set digest, changed files, and validation evidence [F008]. The missing piece is a queue-aware ingestion layer: current JSONL tooling has validation/list/upsert actions but no transaction queue actions [F005], and direct concurrent upserts would remain unsafe because they read and rewrite whole JSONL files [F004].

## Viability

This is viable as an incremental workflow and tooling change. The subagent layer already supports the required non-blocking parent behavior [F002], the researcher role already supports source discovery [F001], and large child results can be kept out of the parent transcript with file-only outputs [F003]. New queue commands can be exposed through Cartographer tooling because Pi extensions can register custom tools [F903], while the existing receipt model and validation runner provide a natural audit trail for queue validation and final gates [F007][F008].

The main implementation risk is ID and write ordering. Canonical writes must be serialized because the current upsert implementation is read-modify-write [F004]. Fact IDs must either stay numeric or introduce numeric aliases until the validator is migrated beyond bracketed numeric `[F###]` citations [F006]. These constraints are manageable if the first implementation makes content-derived transaction IDs mandatory while preserving numeric public fact IDs.

## Design

### 1. Parent asynchronous research loop

The parent maintains a topic-scoped research manifest at `.plan/<topic>/research/runs.jsonl`. Each row records `research_id`, `status`, `task`, `prompt_hash`, `launched_at`, `artifact_path`, `receipt_id`, and optional `supersedes` or `deferred_reason` fields.

Parent behavior:

1. While drafting a proposal, every unresolved evidence gap becomes a concrete researcher task.
2. If active runs are below `max_parallel_researchers`, the parent launches a background researcher immediately and continues working without waiting.
3. The parent polls run status at natural checkpoints: after each major proposal section, before design finalization, and before final validation.
4. Completed researcher outputs are handed to an archivist or marked irrelevant/deferred with a receipt.
5. Final acceptance is blocked unless every relevant run is terminal: `applied`, `rejected`, `deferred`, or `superseded`.

Researchers must be instructed to write only under `.plan/<topic>/research/runs/<research_id>/` and return a compact file reference. This uses file-only output behavior where available [F003].

### 2. Isolated researcher outputs

Each researcher run owns a directory:

```text
.plan/<topic>/research/runs/<research_id>/
  research.md
  sources.jsonl
  receipt.json
```

`research.md` is the human-readable brief. `sources.jsonl` contains candidate source references extracted from the brief. `receipt.json` records the task, prompt hash, output paths, and whether the run completed, failed, or timed out. Researchers do not edit canonical graph files.

### 3. Archivist queue bundle generation

For each completed researcher output that may affect the proposal, the parent asks an archivist to compress it into a queue bundle. The archivist output path is:

```text
.plan/<topic>/queue/inbox/<bundle_id>.jsonl
```

A bundle is append-only JSONL containing proposed `source`, `fact`, `supported_by`, and optional `supersedes` or `alias` records. It must include source references and enough provenance to trace each proposed fact back to a researcher output. The archivist role already matches this evidence-compression purpose, but the implementation should either keep archivists as file-only bundle producers or explicitly grant a narrow queue-submit tool; it should not grant direct canonical graph write access [F009].

### 4. JSONL transaction queue layout and actions

Add a topic-local queue:

```text
.plan/<topic>/queue/
  inbox/        # archivist-written candidate bundles
  pending/      # submitted, schema-valid transactions
  applied/      # transactions applied to canonical JSONL
  rejected/     # invalid, duplicate, or out-of-scope transactions
  receipts.jsonl
  id-map.jsonl
  .commit.lock
```

Add `cartographer_jsonl` or CLI actions:

- `queue-init --topic <topic>`: create queue directories and seed receipts/index files.
- `queue-submit --topic <topic> --bundle <path>`: validate schema, compute content-derived `txn_id`, write to `pending/`, and append a receipt.
- `queue-list --topic <topic> [--status pending|applied|rejected]`: summarize queue state for parent polling.
- `queue-validate --topic <topic> --txn <txn_id>`: validate references, duplicate IDs, supported-by edges, citation compatibility, and source presence without changing canonical files.
- `queue-apply --topic <topic> --txn <txn_id|--all>`: acquire `.commit.lock`, revalidate, apply records to canonical JSONL, append an apply receipt, and move the transaction to `applied/`.
- `queue-reject --topic <topic> --txn <txn_id> --reason <text>`: move a transaction to `rejected/` with an explicit receipt.
- `queue-audit --topic <topic>`: verify every canonical fact/source/support change since queue adoption has a matching applied transaction receipt.

These actions fill the current queue-action gap in `cartographer_jsonl` [F005].

### 5. Single locked canonical commit path

Only `queue-apply` may write canonical topic JSONL files. It must acquire `.plan/<topic>/queue/.commit.lock` using an atomic lock primitive before reading canonical files. While holding the lock, it performs all reads, merges, writes, validation snapshots, and receipt appends, then releases the lock. Researchers, archivists, and parent ad hoc edits must not bypass this path.

This lock is required because current upsert behavior reads the full JSONL file, mutates in memory, and rewrites it [F004]. Atomic file replacement remains useful inside the locked section, but the lock is what prevents interleaved read-modify-write transactions.

### 6. Deterministic IDs and migration guidance

Use content-derived IDs for queue internals immediately:

- `research_id = research:<topic>:<prompt_sha12>` plus a collision suffix if needed.
- `bundle_id = bundle:<sha256(normalized bundle)>`.
- `txn_id = txn:<sha256(normalized transaction)>`.
- source/support edge IDs may be content-derived from normalized source reference, fact claim hash, and relationship type.

For canonical fact IDs, preserve existing `F###` IDs and allocate new numeric fact IDs through `.plan/<topic>/queue/id-map.jsonl` until the validator is migrated. Each row maps `claim_hash` and `source_hashes` to the assigned numeric `F###`, making retries deterministic. A later migration may switch canonical fact IDs to content-derived IDs only after citation validation accepts non-numeric IDs and proposal guidance has been updated; current citation validation recognizes numeric `[F###]` citations only [F006].

### 7. Receipts and validation

Every state transition writes a receipt row to `.plan/<topic>/queue/receipts.jsonl` or the topic `receipts.jsonl` if unified later. Receipts should fit the existing validation receipt model: `id`, `type`, `status`, command or validation evidence, target paths, transaction ID, and relevant output hashes [F007]. Commands run by automation should use the existing validation runner where practical so receipts include command, exit code, duration, hash-set digest, changed files, and validation evidence [F008].

Required receipt types:

- `research-receipt`: background run launched/completed/failed/deferred.
- `bundle-receipt`: archivist bundle generated and schema checked.
- `queue-submit-receipt`: transaction accepted into `pending/` or rejected at submit time.
- `queue-apply-receipt`: locked canonical commit applied or failed.
- `queue-audit-receipt`: audit of queue/canonical consistency.
- `final-validation-receipt`: strict gate result before proposal acceptance.

### 8. Parent polling and continuation behavior

The parent never waits synchronously after launching a researcher unless final gates require it. Instead it:

- keeps a bounded number of active background researchers;
- records launch receipts and continues with sections that can be drafted from existing facts;
- polls background status at checkpoints and converts completed outputs into archivist tasks;
- submits archivist bundles to the queue as soon as they are available;
- applies validated queue transactions in batches through the single locked path; and
- marks stale or superseded runs explicitly so final gates can distinguish unresolved work from intentionally deferred work.

This preserves parent orchestration while enabling continuous research fanout [F905][F010].

### 9. Strict final validation gates

A proposal or derived plan cannot be marked ready until all gates pass:

1. No relevant researcher run is still `running` or `unknown`.
2. No queue transaction remains in `inbox/` or `pending/` unless explicitly deferred with a receipt and parent rationale.
3. `queue-audit` passes and every canonical queue-era graph mutation has an applied transaction receipt.
4. Topic graph validation passes for canonical JSONL files.
5. Proposal fact citations validate against the current numeric citation rules or the implemented migration validator [F006].
6. Final validation receipts exist and pass using the existing receipt/validation evidence model [F007][F008].
7. The parent confirms that no researcher or archivist output contains unresolved source-backed claims that would materially alter the proposal.

Only after these gates pass may the parent request final review or proceed to accepted workflow artifacts, consistent with parent-owned final validation [F010].
