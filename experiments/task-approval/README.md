# Task-approval receipt verification — source-only experiment (#69, N0)

Status: **EXPERIMENTAL SOURCE-ONLY PRIMITIVE — NOT A SHIPPED RUNTIME.** Outside the npm `files` inventory; no change
to ARC core, schemas, package exports or the cross-tool-effects (D1) lab. Grounded in
[the integration design](../../docs/FEEDBACK_INTEGRATION_DESIGN.md) (sections 2-3) and
[the conditional assurance design](../../docs/ASSURANCE.md).

This is a **verification primitive**, not an issuer, grant store or dispatch broker. It verifies that a bounded receipt was
signed by a key from a **host-supplied** registry, is scoped to this task/tenant/harness/accountable approver role, and binds the
current complete D1/G1 subject, the supplied G1 binding and the pending request instance/context.

## Reproduce

Node >=22.5, repository root:

    node --test tests/task-approval-receipt.test.mjs
    node experiments/task-approval/demo.mjs

Fixtures create ephemeral in-memory Ed25519 keys and fictional D1/G1 declarations. No key is written or printed; the verifier
module neither signs nor generates keys.

## API (`approval.mjs`)

`verifyTaskApprovalReceipt(input)` and `describeApprovalSubject(input)` (returns the subject/binding/context digests an issuer
would bind; it creates no approval or signature). `input` is a plain object of own **string data properties** only:
`bundleJson taskJson contractJson requestJson provenanceJson` (required), `bindingJson`, and the new `contextJson`, `registryJson`,
`receiptJson`. Accessors, proxies, symbols, unknown keys and non-strings are rejected without being invoked. All strings are
captured before the first `await`, so later caller mutation cannot change the evaluated input. D1 parsing, the G1 subject and
G1 binding validation are reused from `../cross-tool-effects`; G1 canonicalization is unchanged.

All JSON is bounded and strict (1 MiB, depth 64, no duplicate decoded keys, no unsafe/nonfinite numbers, no lone surrogates,
closed schemas). The new `0.1-experimental` schemas are source-only representations, not public ARC schemas.

- **context** (host-supplied): `request_id`, `request_revision`, `actor_principal`, `actor_role`, `task_id`, `run_id`,
  `session_id`, `tenant`, `harness_id`, `harness_revision`, `policy_epoch`, `registry_epoch`, `expected_subject_digest`,
  `evaluated_at_ms`. Every field except `evaluated_at_ms` (verifier time) is in the signed context digest.
  `run_id/session_id/tenant` must equal the D1 request, `task_id` the task, `actor_role` a routed executor.
- **registry** (host-supplied): `epoch` and at most 16 entries of `issuer_id`, `key_id`, Ed25519 SPKI-DER canonical base64
  `public_key`, `approver_role`, `task_id`, `tenant`, `harness_id`, `status` (`enabled|disabled|revoked`), `max_ttl_ms`.
  Duplicate `key_id`s or key material and non-Ed25519 keys reject the whole registry. The scoped `approver_role` must equal the
  task route's `accountable` role.
- **receipt**: `{version, profile, payload, signature}`; payload `receipt_id, issuer_id, key_id, decision:"approved",
  subject_digest, binding_digest, context_digest, registry_epoch, issued_at_ms, expires_at_ms`; `signature` is canonical
  base64 of 64 bytes. A receipt cannot embed a key, algorithm or scope.

Signed message (Ed25519, no caller-selected algorithm): `"arc-task-approval-receipt/0.1\0" + canonical(payload)` using the
existing RFC8785-style `canonical()`. `binding_digest` is the namespaced SHA-256 of the canonical parsed G1 binding;
`context_digest` likewise of the context without `evaluated_at_ms`. Key order and whitespace are irrelevant; any value change
invalidates or mismatches.

## Results

`result` is one of `REJECT_INPUT` (malformed input, `ATR_INPUT_INVALID`), `DENY`, `UNKNOWN`, `VERIFIED_RECEIPT`, alongside the
D1 `d1_policy_result` and `d1_binding_status` and deterministic `diagnostics` codes (`ATR_*`, plus D1 `CTE_*`).

- A known D1 DENY is returned as `DENY` (`ATR_D1_DENY`) and is never overwritten by missing evidence or a valid signature.
- Missing registry/context/receipt, a missing G1 binding or incomplete provenance is `UNKNOWN`; the signature is not evaluated.
- Otherwise: `ATR_CONTEXT_CONFLICT`, `ATR_SUBJECT_STALE`, `ATR_SUBJECT_MISMATCH`, `ATR_BINDING_MISMATCH`,
  `ATR_CONTEXT_MISMATCH`, `ATR_EPOCH_MISMATCH`, `ATR_ISSUER_UNKNOWN`, `ATR_KEY_NOT_ACTIVE`, `ATR_ISSUER_SCOPE`, `ATR_TTL_EXCEEDED`,
  `ATR_TIME_INVALID`, `ATR_NOT_YET_VALID`, `ATR_EXPIRED` (at `expires_at_ms`), and only if none apply `ATR_SIGNATURE_INVALID`.

`VERIFIED_RECEIPT` means **only** that the receipt signature, registry scope and supplied current subject/context match, and
`receipt_signature_verified` is true only then. Always: `execution_authorized`, `runtime_enforcement`, `action_executed`,
`replay_protection_enforced`, `actor_authenticated`, `reviewer_authenticated`, `source_bytes_observed` are `false`;
`authority_status` is `UNKNOWN`; `execution_status` is `NOT_PERFORMED`. Reports never echo payloads, keys or signatures.

## Trust boundary

The registry and context come **only** from the caller's trusted host channel, by assumption. Replacing either defeats the check
(the tests demonstrate that a substituted registry verifies). No native trust root is established. These remain external
obligations: registry provisioning and revocation freshness, host context and current time, the actual actor and reviewer,
actual action bytes and complete mediation, and source/context/capture authenticity.

The same receipt verifies again under unchanged inputs: there is no one-use store, durable T4 consumption, native authority,
human identity or semantic completion, and no formal theorem claim. Key ownership shows origin under the supplied registry, not
a physical approver.

**N0 remains incomplete** without an independently verified native host, issuer and context. This experiment compares nothing
against native enforcement and claims no adoption.
