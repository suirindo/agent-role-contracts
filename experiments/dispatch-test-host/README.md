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
