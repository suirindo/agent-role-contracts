# Cross-tool effects — D1 offline experiment (#69)

Owner-approved scope: D1 pure evaluator and regression/independent review only.
This source-only experiment does not change ARC core, public schemas/API, package
exports, npm version, runtime configuration or production. D2 network lab remains
outside this scope. No request is sent, no file is read by the evaluator, and no
review/approval is automatically created.

## Question and execution

Can an explicitly supplied task/effect contract distinguish the same declared
send under different task authorizations, while preserving missing provenance?

From the repository root with Node >=22.5:

    node --test tests/cross-tool-effects.test.mjs

These are synthetic policy/declaration tests. They do not measure product
efficacy, field false-positive rates, saved human time, adoption or receiver
delivery. They do not implement or re-execute mcpgawk or Counterseal.

Import describeEffectRequest / evaluateEffectRequest from policy.mjs. The sole
argument contains bundleJson, taskJson, contractJson, requestJson,
provenanceJson and optional bindingJson. Each value is JSON text, at most 1 MiB.
Unknown top-level API keys, duplicate decoded JSON keys, excessive depth/nodes,
nonfinite/unsafe integer values, lone surrogates, unknown profile fields and
ambiguous source/flow identities are rejected.

The exact source-only input schemas are exported from contract.mjs. They are a
bounded D1 snapshot representation, not public ARC schemas. The contract shape
follows #69. The request contains effect, run/session/tenant IDs, source_refs,
destination_ref (null for read), content_sha256, byte_length, adapter_digest
and tool_definition_digest. Provenance contains matching run/session/tenant,
complete, sources (source_ref/classification/content_sha256), exposure_source_refs
and usage (egress_bytes/egress_calls/event_count). Lists are limited to 64 and
the event/egress limits are bounded by the source schemas.

## Policy and binding

- No declared effect: DENY / CTE_EFFECT_NOT_DECLARED.
- A send uses the union of session exposure and explicit input sources. One
  complete flow rule must cover every source and label; rules cannot be stitched.
- Complete explicit internal flows can pass; data is not universally forced public.
- Incomplete/empty/unregistered send lineage: UNKNOWN, retaining any known DENY.
- Receiver, source, cumulative supplied usage and event/byte bounds are checked.
- Read source identity/hash/size is checked against supplied snapshots. Read can
  remain available when send provenance is incomplete.
- A namespaced SHA256 of RFC8785-compatible canonical bounded JSON binds the full
  bundle/task, contract, request and provenance. G1's existing canonicalization,
  fixed vectors and schemas are unchanged. Key ordering, JSON number/string
  serialization and Unicode validity follow the admitted JSON profile.
- describeEffectRequest computes the existing G1 cte-request declaration subject;
  it issues no approval. evaluateEffectRequest requires supplied routed G1
  review/approval declarations for ALLOW. Missing binding is UNKNOWN; changed
  subjects and invalid declarations are rejected.

Reports separate policy_result, binding_status, authority_status (always UNKNOWN),
execution_status (always NOT_PERFORMED) and coverage (SUPPLIED_SNAPSHOTS_ONLY).
ALLOW describes only a calculation over the supplied JSON. Authentication,
authority, runtime enforcement, byte observation, evidence verification, replay
protection and receiver observation remain false. Fixed diagnostic codes avoid
echoing payloads or private identifiers.

## Boundaries and unfinished #69 requirements

All classification, completeness, bytes/digests, actor/context, tool/adapter
digests and usage are caller-supplied. Matching digests bind these declarations;
they do not prove that a host observed them, pinned a trusted registry or checked
the actual request. An attacker able to replace the snapshots and fabricate
matching review declarations can obtain a consistent calculation.

There is no live provenance ledger, actual tool adapter, authenticated source or
destination registry, policy epoch/current-state read, nonce/grant consumption,
race serialization, durable budget, DNS/peer/TLS control, sandbox, transport,
audit persistence or receiver. Repeated evaluation does not consume a budget.
No claim covers CTE-019, 025–029, 031, 033–049, 056 or other host/runtime cases.
D1 tests of context conflicts and usage are calculations, not anti-replay or
atomic-counter enforcement. The full 56-case D2 acceptance set remains open.

Initial context must be declared with complete lineage and exposure. No events
or sources are discovered here. Transformations retain constraints only insofar
as the supplied session exposure is complete; omission cannot be detected.
Read snapshots are not authenticated or opened, and content_sha256 for a send
is not a measurement of transmitted bytes.

Compare this calculation with an equally informed task-conditioned egress rule.
The ordinary rule can make the same decision; no unique detection or superiority
is established. Potential value is reusable contract/binding/evidence structure,
subject to #47's real-work cost and second-task evaluation. The unmodified #69
D2/D3/D4 and independent review/delivery gates remain separate.
