# HOL Guard integration boundary

Status: design record for Issue #7. This document does not add runtime enforcement, execution authority, authentication, replay protection or production adoption to Agent Role Contracts.

Audit baseline:
- Agent Role Contracts: `c42000412f2663f893ba7382d12a3e027de061a1`
- HOL Guard: `9260647758487a12381fbec31d53b65dd8106340` (3.18.1 line)
- prior local Phase-2 prototype record: `b6803eba0757cafb5a7a7be611bdd1f4daa1ee73`

The prior prototype result is historical evidence only. Its source object was not recovered in the current workspace and its 70/70 Rust result has not been rerun against the HOL Guard baseline above.

## 1. Integration invariant

Agent Role Contracts declarations are not authority. A runtime integration may use a validated ARC subject only to impose an additional restriction on authority that HOL Guard already owns.

The intended composition is:

```text
final_guard_action = join(existing_guard_action, arc_floor)
arc_floor ∈ {NoAdditionalFloor, Block}
```

ARC must never:
- create `allow`;
- reduce `block`, `sandbox-required`, `require-reapproval` or `review`;
- authenticate an actor, session or workspace merely because an ARC declaration names one;
- turn an invalid, stale or missing Required context into Optional absence;
- treat a declaration PASS as proof that a filesystem effect occurred.

## 2. Why command_extensions is not the ARC carrier

Current HOL Guard has a mature native command-control path:
- `PolicySnapshotV3.command_extensions`;
- `NativeCommandControlBindingV1`;
- `NativeCommandControlAuthorityV1`;
- durable command-control floor and recovery linkage;
- a command-control mutation lease;
- approval freshness/replay fencing;
- command-control receipt binding.

These mechanisms are relevant implementation precedent, but the semantic namespace is wrong for ARC.

`NativeCommandControlBindingV1` describes command program/catalog/trust identities and extension/permission activation. Its controls are limited to `command.*` extension or permission targets with `enabled|disabled` states.

The same command-control subsystem also contains bounded affirmative-authority paths. Authenticated explicit command permissions, and some custom MCP-tool policy, can settle a generic review to `allow`. Therefore ARC restrictions must not be encoded as command extensions or permissions. Doing so would conflate restriction evidence with operator consent.

## 3. Guard mechanisms that can be reused

The production integration should reuse or generalize these patterns rather than duplicate them:

1. **Authenticated bounded state** — canonical snapshot bytes, MAC verification, runtime identity, generation and expiry.
2. **Current-state admission** — request generation/digest/runtime/scope must match the resident current state.
3. **Independent durable floor** — a restriction domain needs its own monotonic revision/epoch and anti-rollback state.
4. **Mutation fencing** — a decision must not race a restriction replacement or revocation.
5. **Approval freshness** — challenge creation and approval consumption must both bind and recheck current restriction identity.
6. **Replay resistance** — old approval material must not become valid after context replacement or revocation.
7. **Canonical receipt identity** — a verifier must be able to determine which restriction identity governed the decision.
8. **Monotonic composition** — external restriction input may strengthen a Guard result only.

Reuse means adopting the security properties and, if maintainers choose, generalizing the underlying primitives. It does not mean reusing the command-control semantic fields or revision domain.

## 4. Contract surface required before production wiring

A production ARC restriction needs a distinct, closed, bounded Guard-owned contract. The exact storage location is intentionally not selected here.

The contract needs first-class bindings for:
- ARC subject identity and declaration digest;
- issuer/authentication provenance;
- authenticated actor/session identity;
- workspace/scope identity and its relation to Guard's local scope;
- restriction-set digest;
- Required or Optional presence mode;
- monotonic restriction revision/epoch;
- issue/expiry state;
- durable revocation identity;
- receipt-safe identity material.

Schema or parser design must make grant-bearing states unrepresentable. Unknown fields and unsupported semantics fail closed.

### Required semantics

**Required**
- no current valid restriction context -> reject the protected operation;
- malformed, stale, mismatched or revoked context -> reject;
- absence is not a compatibility fallback.

**Optional**
- only an authenticated explicit absence state may mean no additional ARC floor;
- malformed, stale, mismatched or revoked context is still an error;
- legacy omission must not silently become authenticated Optional absence.

## 5. Approval and receipt binding

An approval produced while restriction context N is current must not be consumable after:
- replacement by N+1;
- revocation of N;
- actor/session/workspace mismatch;
- expiry;
- runtime/policy identity change that already invalidates Guard approval.

The restriction identity therefore has to participate in challenge creation, replay binding and final approval consumption under the same current-state fence.

For receipts, ARC identity belongs in the canonical decision identity if ARC governed that decision. It must not be appended only as untrusted metadata. Privacy-safe digests should identify issuer/subject/scope/restriction state without persisting raw role bodies, prompts, filesystem contents or credentials.

Historical receipt validity and current authorization are separate questions. A self-consistent old receipt may remain valid evidence that a past decision occurred while being unusable as current authority.

## 6. Direct filesystem-write Phase 1

The first production proof should remain narrow:
- one authenticated Guard actor/session;
- one workspace;
- one ARC subject;
- one direct filesystem-write action;
- one Guard-reconstructed canonical target;
- one restriction decision: no additional floor or block.

ARC-supplied path text is not sufficient enforcement evidence. Guard must compare the actual canonical execution target against the admitted restriction scope.

The current native hook boundary is cooperative interception, not an OS/filesystem reference monitor. If the intended guarantee includes arbitrary writes by child processes, libraries or uninstrumented tools, production acceptance additionally requires a mandatory execution/filesystem mediation layer and effect/completion evidence. Decision-time fencing alone cannot establish that stronger guarantee.

## 7. Safe work before the upstream contract decision

The following may be developed without claiming production enforcement:
- conformance vectors for ARC -> Guard restriction mapping;
- negative cases for stale/mismatched/revoked contexts;
- a non-enforcing shadow record with issuer/subject/scope/restriction digests, expiry and monotonic revision;
- decision-composition truth tables proving ARC never lowers a Guard action;
- approval and receipt test vectors describing the identity that a future Guard contract must carry.

A shadow record must not be read by production decision, approval, receipt or execution paths. It is interoperability evidence only.

## 8. Explicitly out of scope until maintainers choose the seam

Do not:
- add speculative ARC fields to HOL Guard production schemas;
- overload `command.*` extension/permission identifiers;
- share the command-control revision counter as the ARC restriction revision;
- wire ARC into `edge.rs`, policy enforcement, approval consumption, native receipts or filesystem execution;
- describe the old Phase-2 prototype as validated against current HOL Guard;
- claim a declaration PASS proves event truth, authentication, artifact bytes, replay safety, runtime acceptance or execution authority.

## 9. Maintainer decisions required

The production implementation is gated on two upstream decisions:

1. **State ownership:** should the ARC restriction be a sibling Guard-owned typed binding inside the authenticated policy snapshot, reusing/generalizing command-control authority/floor/lease primitives, or a separately admitted restriction store atomically fenced against the current policy snapshot?
2. **Enforcement boundary:** is cooperative hook/tool enforcement sufficient, or must the guarantee extend through actual downstream filesystem mutation?

Until these are answered, Issue #7 remains a design/integration lane rather than a production implementation claim.
