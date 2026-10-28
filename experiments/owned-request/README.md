# Owned operation bytes — source-only binding experiment

This experiment adds a bounded comparison of actual supplied bytes with an existing
D1 request and PR84 approval receipt. It does not implement native authorization,
an issuer, a host evidence authenticator, a consumption store or an executor.
The stable core, public schemas/API and package inventory are unchanged.

`verifyOwnedTaskRequest(approvalInput, observedInput)` accepts the existing PR84
JSON-string inputs (with `contextJson` required here), plus an own-data object:
`{ requestJson, contextJson, bytes }`. The second request and context represent
the caller's supplied current observations, not authenticated native facts.

Before its first await, it captures the input strings and copies a real Buffer or
Uint8Array (at most 1 MiB). Proxies, accessors, SharedArrayBuffer, resizable or
detached backing buffers, unknown keys and malformed JSON are rejected. It derives
SHA-256 and length from that private copy, compares both requests with the actual
bytes, compares the complete current request, and checks context identity with the
existing PR84 digest. It then reuses `verifyTaskApprovalReceipt`; the supplied
current evaluation time is checked against expiry. No key, signature, approval or
timestamp is generated. Payload bytes, keys and signatures are not returned.

A mismatch is DENY. Malformed input is REJECT_INPUT. A matching verified receipt
still returns **UNKNOWN_HOST_PROVENANCE**. Every result retains unknown native
authority and false execution, consumption, runtime-enforcement and actor-authentication
flags. The copied bytes are observed only at this function boundary: they are not
proof of the host's eventual operation, effective permissions or actual dispatch.

The next host integration must independently establish canonical issuer/actor,
policy and effective inventory provenance, retain custody of the same operation
bytes, and provide current serialized admission/revocation/consumption semantics.
There is no callback, trust flag or synthetic fallback that can promote a result
to native authority. Existing PR84/#86 guarantees and limits remain unchanged.

## Verify

From a source checkout with Node.js >=22.5:

```sh
node --test tests/owned-request-binding.test.mjs
```

Tests reuse PR84's explicitly fictional, ephemeral-key fixtures only. They check
same-length byte substitution, length, destination/tool/adapter and context drift,
mutation after invocation, shared/resizable memory, hostile input accessors/proxies,
missing receipt and expiry. These are author-side offline checks, not native N0
acceptance, independent QC, real-world efficacy, replay protection or a release.
