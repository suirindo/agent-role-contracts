# Dispatch-target TEST-host loopback trial (#69)

Test-owned integration of the dispatch-target adapter: ephemeral in-memory Ed25519 issuer keys, a synthetic registry/actor/policy,
one synthetic payload, and two receiver child processes bound to `127.0.0.1` only. No customer data, no external send.

`node experiments/dispatch-test-host/run.mjs <empty_out_dir>` writes `trial.json`.

## What this does not prove

- **Receiver process identity:** receivers run as the **same UID as the test host**. This is process separation only. The host can
  signal them and read or rewrite their logs, so receiver independence and effect independence are **UNPROVEN**
  (`receiver_process_identity` and `limitations.receiver_independence` in `trial.json`).
- Resolution independence is UNPROVEN: the test host resolves and sends.
- Not production or native-host authority. A PERMIT means only that this test host's fixture policy matched; acceptance is UNKNOWN.

## Lifecycle guarantees

- Receiver startup has a deadline; a receiver that fails, exits early, hangs, or sends a bad handshake is killed and reaped.
- `createTestHost` is transactional: any construction failure stops every receiver already started and removes the tempdir.
- `close()` is idempotent; stopping is SIGTERM, bounded wait, SIGKILL, bounded wait.

## Cross-host receiver (separate host and user)

`cross-host.mjs`, `cross-host-cases.mjs`, `remote-receiver.mjs`, `remote-observer.mjs` and `run-cross-host.mjs` run the same
test-owned issuer/registry/actor/policy and adapter with the **receiver set on a separate host under a separate user**, started
over SSH (`BatchMode`, host key pinned by the caller's `known_hosts`). The receiver set binds only the given address, records
every request on the receiver host before any response, and exits when the SSH session's
stdin closes (plus a hard lifetime cap): no persistent service. A separate observer process on the receiver host reads those
logs afterwards; the sender only fetches the observer's output, and parses it only after stdout/stderr reach EOF (a pipe still
open a bounded time after the observer exits is a failure, not a partial result).

`node experiments/dispatch-test-host/run-cross-host.mjs <empty_out_dir> <config.json>` (ssh alias, `bind`, overlay address,
remote node and root, expected hostname/uid, pinned `known_hosts` file and host key alias).

With `bind: "stdio"` the receiver set opens **no network listener**: request/response JSON lines travel on the receiver
process's own stdin/stdout inside the SSH session that started it. Use this when the overlay only admits SSH and the SSH client
policy clears port forwarding: no firewall, overlay policy, SSH policy or system setting is changed. The destination is then
the **receiver process inside an SSH session to the pinned-host-key receiver host**, not a network-addressed endpoint.

Destination binding is **TEST level**: an endpoint counts as the approved logical target only if it answers the adapter's
challenge with an HMAC keyed by a per-case secret delivered only on the SSH channel's stdin (memory only), and claims the expected
hostname/uid and trial nonce. A wrong-host impostor without that secret is refused before any send.

What this still does not prove: the operator who holds the SSH credential for the receiver user can read or rewrite the receiver
logs, so this is separate-host/separate-UID observation, not tamper-proof third-party attestation. Resolution still runs on the
sender host. Native N0, full mediation of every execution route, resolution independence, authenticated issuer/actor inventory
beyond this test and production enforcement remain UNKNOWN. Offline tests run the receiver set as a local child, so CI never needs
the receiver host.

## Recorded source evidence (separate from the UNKNOWNs above)

Source review and CI concern this lab code only; they do not upgrade any assurance listed as UNKNOWN.

- PR #93 (merged `bc59237d`): independent review PASS (one Low: operator-supplied remote root in remote shell text; PR #94 requires a plain absolute path and quotes it); required CI 4/4 on the reviewed head.
- PR #94 (reviewed `a415f4ed`, merged `0bb4311d`, same tree): independent review PASS, Medium+ 0, one Low (observer output parsed
  at process exit, fixed by the follow-up that parses after EOF); required CI 4/4. Its Pro to receiver-host TEST trial passed 11/11
  cases but exited 3 when the last archive SSH session dropped; evidence was kept and only the failed finalizer was re-run for the
  same candidate and nonce (exit 0). No single uninterrupted exit-0 trial is claimed.
