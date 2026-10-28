# One-use persistent LOCAL receipt consumption — source-only experiment

Status: **EXPERIMENTAL, LOCAL, SOURCE-ONLY — NOT NATIVE AUTHORIZATION OR AN EXECUTOR.** This directory is outside the public
package inventory. It adds no schema, export, dependency, workflow, permission, issuer, callback, dispatcher or target action.
It builds narrowly on PR84's unchanged `verifyTaskApprovalReceipt` and the accepted assurance/integration designs.

## What it does

`createReceiptConsumptionStore(root)` accepts only an existing, canonical absolute directory on POSIX Linux/macOS. The caller
must already own it and protect it with mode `0700` or stricter. The constructor never creates, adopts or chmods a directory;
it rejects symlinks, non-directories, foreign UIDs, group/world access and a changed device/inode. Windows returns an
`UNSUPPORTED` store without filesystem I/O.

`store.consume(input)` captures PR84's own string data properties before its first await (proxies, accessors, symbols, unknown
properties and non-strings reject), invokes the unchanged verifier, and proceeds only for `VERIFIED_RECEIPT`. `DENY`, `UNKNOWN`
and `REJECT_INPUT` are preserved and allocate no marker. Registry, context and evaluation time remain host-supplied assumptions.

The stable grant identity is exactly the domain-separated SHA-256 of `{ issuer_id, receipt_id }` parsed from the same captured,
verified receipt. It deliberately excludes signature, key ID, epoch, payload/subject/context/binding digest: re-signing or
renewing that issuer/receipt ID cannot reset consumption. A fresh receipt ID is a distinct grant; this does not deduplicate a
logical operation across newly issued IDs or across stores.

The arbitration point is one `0600` marker opened with `O_CREAT|O_EXCL|O_NOFOLLOW`. Its small nonsecret record contains only a
version, grant hash and exact subject/context/binding hashes. The marker file and directory are fsynced and descriptors closed
before `CONSUMED`. Any preexisting marker—complete, empty, corrupt, symlink or directory—is permanently
`REPLAY_OR_UNCERTAIN`; it is never opened, followed, replaced, unlinked, refunded or recreated. A write/fsync/close/recheck
failure after exclusive creation is `UNKNOWN_HELD`: burned, non-positive, and never automatically retried or deleted.

Reports keep separate `consumption_status` (`CONSUMED`, `REPLAY_OR_UNCERTAIN`, `UNKNOWN_HELD`, `NOT_CONSUMED`, `UNSUPPORTED`),
local-store coverage and marker persistence. Always: authority is `UNKNOWN`; `execution_authorized`, `runtime_enforcement`,
`action_executed`, `actor_authenticated`, `reviewer_authenticated`, and `global_replay_protection` are false. Consumption is not
permission to dispatch, an executor start, exactly-once delivery, or global replay protection. PR84 can still reverify the
receipt; only this pinned store refuses its reuse.

## Reproduce

Node >=22.5, repository root:

    node --test tests/task-receipt-consumption.test.mjs
    node experiments/task-consumption/demo.mjs

The demo uses an owned temporary directory and ephemeral in-memory key, performs no target action, and deletes only its own demo
directory. The tests use real child processes for arbitration and confirmed-consumption restart persistence; the kill occurs
after `CONSUMED`, not during fsync. Empty/corrupt/symlink/directory marker cases are supplied recovery controls, not claims of a
fabricated mid-write crash.

## Trust and durability boundary

The trusted host must retain custody of this exact directory and its history, backups and lifecycle. Deletion, rollback,
restoration of an older backup, or moving/replacing stores can destroy replay history. Local filesystem `O_EXCL` and fsync
semantics, collision resistance, canonical serialization, and protection from hostile same-UID processes, compromised kernel,
mount/filesystem deception and ancestor replacement are explicit assumptions. Device/inode checks narrow accidental root
replacement but do not establish isolation. This is not a power-loss proof or a distributed store.

Untested/unclaimed: a crash during marker write/fsync, power loss and filesystem-specific guarantees, hostile host/same-UID or
kernel compromise, network/distributed arbitration, authenticated reconciliation, aggregate budgets, native N0/T4 mediation,
revocation ordering at a dispatch gate, executor starts, semantic completion, and real workflow adoption. Retention and safe
backup/restore remain external obligations. There is no deletion/refund/retry API.

## Observed owned payload bytes (`owned-payload.mjs`)

`createOwnedPayloadConsumptionStore(root)` builds its own pinned private store with the unchanged `createReceiptConsumptionStore`
(same root rules) and returns a frozen `consume({ approvalInput, payloadBytes })`. It accepts no caller store, verifier result or
observation flag. Before the first await it captures the two fields (own data properties only; proxies, accessors, symbols,
unknown keys and foreign prototypes are rejected without invoking getters), requires a real `Buffer`/`Uint8Array` (no strings,
arrays, `DataView`, subclasses or proxies), reads backing buffer/offset/length through intrinsics captured at load, rejects
shared, resizable, detached and over-1 MiB input, and copies exactly that subview. The copy is the observation snapshot; later
caller mutation cannot change it.

The raw copied bytes are hashed with plain sha256 (no decoding, normalization or domain prefix) and compared with the
`content_sha256` and `byte_length` of the strictly parsed `network.send` request. Only on an exact match is the unchanged store
called, with the same captured approval strings. A mismatch, malformed request or other effect never calls the ledger, so no
marker is written and a valid grant is not burned. Reports separate `payload_observation`, `payload_binding`
(`MATCH`, `MISMATCH`, `NOT_OBSERVED`, or `UNEVALUATED` when bytes were observed but the declaration was unusable) and the
ledger's own `consumption_status`/`verification_result` (`ledger_called` says whether it ran). `source_bytes_observed` means only
that this call copied a buffer; digest and length are reported, never the bytes, paths, signatures or keys. Authority stays
`UNKNOWN` and the execution, runtime-enforcement, actor/reviewer, global-replay, `payload_sent`, source-classification,
destination and later-operation flags stay false, even when `CONSUMED`. Bytes are only inspected: nothing is sent, returned or
executed. Windows is explicitly `UNSUPPORTED` with no filesystem access.

Byte equality does not prove source classification, provenance authenticity, destination resolution or actor authority, and says
nothing about a later, separately executed operation. Store provisioning and registry/context/time authenticity remain host
assumptions. This is not a broker or native N0 admission and does not solve current registry/policy provenance, request-revision
CAS, dispatch-time revocation, T4 executor at-most-once, crashes during writes, global budgets or operation mediation.

    node --test tests/task-owned-payload.test.mjs
    node experiments/task-consumption/owned-payload-demo.mjs

## Dispatch-target binding adapter (experimental, SOURCE_ONLY)

`dispatch-target.mjs` is a bounded, opt-in adapter for the "actual dispatch destination" feedback on #69. Before the one-use
ledger is touched it compares the exact approved destination (from a host-supplied registry keyed by the receipt's
`destination_ref`) with the destination the host transport reports it resolved for this very send. It binds actor, action,
payload digest and request revision into one operation digest, issues a fresh challenge per call, and accepts resolution
evidence only if it echoes that challenge and digest, is fresh, is single-valued, and is not produced by the policy writer.
Anything missing, ambiguous, stale, unbound or self-attested is `UNKNOWN_HELD`; a different target, an unapproved redirect
or a changed payload or stale revision is `DENY`. Callers cannot supply a target or evidence. Nothing is sent or burned on
any refusal; after the ledger consumes, a stale gate holds without a refund and without sending.

**What this is not.** There is no native host enforcement and no production routing attestation. `PERMIT_SOURCE_ONLY` means
only that the fixture-level policy matched; `acceptance` stays `UNKNOWN` and `resolution_independence` stays `UNPROVEN` on
every report. #47 gates remain open.

**Trust assumptions (all host-supplied, unauthenticated):** the destination registry, the host clock, `currentRevision`, and
the transport. A transport that lies about where it routes passes this adapter. `KNOWN GAP` in
`tests/task-dispatch-target.test.mjs` demonstrates this: only the independent receiver log exposes it.

**Incremental value versus native controls.** A native host allowlist or egress proxy already sees the true destination and
is the real enforcement point. This adapter adds only the binding of that observation to the approved actor, revision and
payload, plus explicit fail-closed UNKNOWN handling. It is not a substitute and does not widen the scope into a broker.

Limits: https only, single send effect, at most 8 hops, POSIX only (other hosts return `DTB_UNSUPPORTED_HOST` without I/O),
local per-root replay protection only.

Reproduce: `node --test tests/task-dispatch-target.test.mjs`
