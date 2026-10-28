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
