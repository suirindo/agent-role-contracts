# Task-authority assurance design

Status: **PROPOSED DESIGN — NOT FORMALIZED OR IMPLEMENTED** (2026-10-27).
This is the optional assurance extension of [ARC architecture](ARCHITECTURE.md),
aligned with [#69](https://github.com/suirindo/agent-role-contracts/issues/69)
and [#47](https://github.com/suirindo/agent-role-contracts/issues/47).
It adds no public API/schema, runtime, permission, approval, dependency or release.

## 1. User problem and fixed property

An operator should be able to delegate a supported task to an AI without that
task acquiring extra authority through tool composition, delegation or retries.
The first bounded use case is the existing read-file / send-report experiment:
read-only work cannot dispatch a send; explicitly authorized work can send only
the bound bytes to the bound destination within its grant and limits.

The proposed primary property is **task-authority preservation**:

> For every reachable trace of the specified mediated machine, each local
> effect dispatch has a valid task-specific admission at its dispatch gate.
> Composing supported steps cannot create an admission with greater authority.

This is a conditional safety statement about a specified machine and boundary.
It does not assert that current ARC proves this property, that any arbitrary
agent/runtime is mediated, or that all information leakage is impossible.
Correct human policy, authenticated inputs and faithful execution matter.

## 2. Preserve the existing layers

| Existing layer | Reused responsibility | Additional assurance obligation |
| --- | --- | --- |
| G0 core | Roles, declared authority, task routes and scope consistency | Model the accepted declarations without treating them as authenticated identity |
| G1 | Complete canonical bundle/task/action subject and supplied review binding | Bind the actual normalized operation and trusted admission context to that subject; invalidate changed subjects |
| G2 filesystem adapter | Concrete path/content declaration mapping | Check an actual request under an explicit adapter semantics; add other effects only through versioned mappings |
| G3 | Lifecycle/evidence declaration consistency | Carry subjects and references while preserving unknown authenticity and execution |
| #69 D1 evaluator | Explicit effect/flow policy over supplied snapshots, separate UNKNOWN | Specify its policy function and prove properties only over those admitted inputs |
| #69 D2 host/adapters | Bounded execution and observed bytes/receipts | Supply trusted facts, complete mediation for the declared boundary, current authority and atomic durable consumption |
| #47 evaluation | Real-work cost, usefulness, false refusals and repeat use | Determine whether the assurance is useful enough to keep |

The core remains an offline declaration checker. An optional small decision/state
kernel may later be verified independently; consumer runtimes own actual execution.
No runtime provider, broker, network client or proof checker is implicitly loaded
by the stable core. No duplicate role/task schema or general policy language is
introduced. Existing public schemas, G1 fixed vectors and package exports remain
the compatibility baseline.

The logical model below is a design vocabulary, **not a new JSON schema**.
Current D1 inputs reject unknown fields; none of the proposed grant/epoch fields
may be silently inserted into its current version. Future wire formats require
an explicit profile/version decision and fresh bound subjects.

## 3. Model and dispatch boundary

Let state S contain the current trusted task/run/session/tenant identity, policy
and revocation epoch, approved tool/adapter identities, observed source exposure,
one-use grant ledger, reserved cumulative limits and required audit state.
Let q be a normalized supported operation over an adapter-owned immutable input.

Define Admit(S,q) to require all of the following:

1. The native host permits the authenticated actor to perform this operation.
2. The role/task route and scope declarations are consistent, and the explicit
   adapter mapping connects this operation to their authority. An unknown
   effect-to-capability mapping is unsupported, not inferred from a tool name.
3. The task/effect contract permits the operation, source set, destination and
   complete flow; one complete flow must cover the send, as in D1. Separate
   insufficient rules/grants cannot be stitched into permission.
4. Review/approval bindings match the full current subject. Authentication of
   approvers and integrity of the policy supply are external trusted facts;
   a syntactically consistent supplied binding cannot establish them.
5. A verified grant is for that same subject, actor and context, is current at
   the gate, is unused, and fits the remaining shared limits.
6. The host owns the exact operation bytes/parameters, checks required lineage
   and registry identities, and can durably record the admission and consumption.

The **dispatch gate** is a linearization point at which current authority,
epoch, one-use consumption and budget reservation are checked/committed in one
serialized admission decision before the local executor starts. Audit failure,
unknown provenance/authority, unknown adapter semantics or stale binding cannot
produce a dispatch. Existing report UNKNOWN/DENY distinctions remain intact.

Revocation and admission are ordered in the same authority domain: a revocation
ordered before this gate rejects the grant. This does not promise cancellation
of a dispatch already admitted or remote effects already in flight. Distributed
revocation propagation and the authority store's ordering are explicit trust/
implementation obligations, not an assumption of instantaneous wall-clock change.

For a proposed transition relation Step and initial-state predicate Init:

```text
Init(S0) and Reachable(S0, trace)
and Dispatch(q, admission) in trace
  implies Admit(S_before_gate, q)
          and Subject(admission) = Subject(q, S_before_gate)
```

The actual executor must use the input owned and reserved at that gate. A worker
must not be able to replace the destination, body, actor or registry after the
check. The proof must state the allowed transitions and adversary; saying that
all traces are safe is vacuous if unsafe execution paths are merely omitted.

## 4. Primary theorem and supporting targets

All rows are **proposed / not proved**. The first model supports bounded read
and send only; delegation enters a later model and must not be advertised as
covered by the initial read/send theorem.

| Target | Precise intended statement | Main #69 acceptance links |
| --- | --- | --- |
| T1 task-authority preservation | Every supported dispatch in a reachable mediated read/send trace satisfies Admit at its gate; no denied/unknown case dispatches | CTE-001–018, 025–027, 039–040 |
| T2 delegation non-amplification | Every child grant is an attenuation of one valid parent in the same bound context; nested delegation preserves the relation and shared ancestor limits | CTE-030, 043, 048; delegation currently unsupported by MVP |
| T3 subject fidelity and freshness | The dispatched owned operation matches the approved task/content/destination/tool/adapter/policy subject; changed subjects need new approval | CTE-020–024, 030 |
| T4 one-use local dispatch | For one grant in its authority domain, local executor starts are at most one across concurrency and recovery; post-dispatch uncertainty never refunds the grant | CTE-028–029, 037–038, 041–043 |

T2's attenuation relation must cover effects, resources, destinations, source/
classification constraints, context, expiry, approval conditions and budgets.
Independent child counters cannot each recreate the parent's aggregate budget.
No widening is derived from native ambient permission, role aliases or a child
request. Revocation/revision invalidates descendants according to the defined
authority ordering. These requirements are not implemented by the current core.

T3 may use digest equality only under an explicit collision-resistance and
canonical-serialization assumption, plus trusted observation of the bytes.
A digest binds an identity claim; it does not authenticate its origin. Tool
definition integrity and tool implementation identity are separate checks.

T4 is **at most one local start**, not exactly-once remote delivery. A crash
after durable consumption can result in no start; a response loss can coexist
with a completed remote effect. Recovery must retain consumed/uncertain state
and must not automatically replay that grant. Remote deduplication, authenticated
reconciliation and liveness need separate contracts; they do not follow from T4.

Non-vacuity is also an acceptance obligation: a supported, fully authorized
positive control with fresh grant and sufficient limits must admit, and an actual
bounded receiver control must observe its expected bytes. Blanket refusal cannot
satisfy the product goal. This is not a general availability/delivery theorem.

## 5. Trusted boundary and exclusions

| Trusted obligation | Failure if absent |
| --- | --- |
| Correct operator-approved policy and honest task intent | A sound checker can enforce the wrong intended permission |
| Authenticated actor, approver, policy/grant supply and current authority state | Consistent forged declarations can appear valid |
| Complete mediation and protected broker state for the stated deployment | Shell/browser/model/other-agent channels can bypass the modeled gate |
| Faithful adapter semantics, observed lineage, owned immutable bytes and destination identity | A safe model can dispatch different real data or to a different recipient |
| Serialized durable authority/consumption/budget/audit storage and defined recovery | Races, reboot or host changes can recreate authority |
| Trusted proof kernel/toolchain and an audited implementation-to-model connection | A checked model theorem alone says nothing about a different deployed executor |

The proof statement must enumerate permitted toolchain axioms/assumptions and
reject unfinished proof placeholders. A proof checker PASS, finite conformance
suite PASS and real deployment acceptance are different evidence classes.
Each has an exact source/tool/profile/adapter identity.

Excluded from the initial claim: arbitrary MCP/runtime support, hostile same-UID
or kernel compromise, unrestricted model-memory taint, side channels or full
noninterference, human policy correctness, semantic task completion, availability,
exactly-once external delivery, all 56 D2 cases and real-user value.
Cloud model prompts, remote MCP parameters, logs/telemetry and delegated egress
remain unsupported unless explicitly mediated and admitted. Missing coverage
must be reported as unsupported/unknown rather than global non-leakage.

## 6. Fit to current evidence and delivery stages

| Evidence/stage | Current meaning | Next acceptance |
| --- | --- | --- |
| D0 | #69 design and this integration | Reviewed definitions, threat model, counterexamples and compatibility mapping |
| D1 | Merged pure evaluator and tests over supplied snapshots | Formal policy/state specification with traceable semantics; machine-checked T1 model proof |
| Bounded D2 lab | Fixed synthetic 50-byte read/send, separate receiver, one-process replay/concurrency/response-loss observations | Actual authenticated admission, durable state, registry/byte binding and deployment mediation; keep full D2 open |
| Model-to-implementation connection | Not established by this design | Prove refinement for the chosen kernel or explicitly retain the executable adapter correspondence as a trust assumption; test exact trace conformance without calling finite tests a proof |
| D3 | Opt-in consumer deployment remains separate | One admitted host, positive/negative/fault controls, then two real tasks and human measurements |
| D4 | Public API/adapter/release decision remains separate | Demonstrated value and support cost, compatibility/QC/required CI and separate release authority |

The existing local laboratory uses fictional G1 declarations and synthetic
authority. Its busy/consumed closure and observed receiver are useful tests,
not a durable grant implementation, authenticated approval system or checked
formal proof. No laboratory rerun is required merely to accept this document.

The pending report-explanation prototype in PR #79 displays D1 outputs; an
explanation is not an admission or proof. Its separate QC/STOP history and writer
are preserved. The accepted outreach fixtures in PR #81 are finite offline
declaration comparisons; they do not discharge the theorems above.

First implementation slice: specify the existing D1 read/send decision and a
minimal admission state machine; include denial/unknown and legitimate-send
controls, stale-content/policy, replay, concurrent consume and response-loss
counterexamples. Prove T1 for that explicitly defined model before expanding
delegation. Then connect one supported executor under its stated assumptions.
No new Lean dependency, runtime activation or product-wide rewrite is authorized
or performed by merging this design.

For each claim, retain: exact subject/profile/proof/toolchain identities, theorem
statement and assumptions, proof-check output, adapter coverage and conformance,
native observations, unresolved cases, and #47 human cost/usefulness/second-task
judgment. Only accepted evidence may upgrade the associated claim.

## 7. Design precedent and research boundary

Nyxis illustrates a useful pattern: select a fixed safety property, restrict
effectful programs so it can hold, and publish the trusted boundary. Its handlers
use an authorization action layer instead of arbitrary IO; the authorization
theorem and connection assumptions are documented separately. ARC applies this
pattern to task-specific authority and compositional execution while retaining
its offline core.

Sources inspected at Nyxis commit `785c11a6285fe92901e871e1fc0f7064eda93941`:
- [README](https://github.com/NyxFoundation/nyxis/blob/785c11a6285fe92901e871e1fc0f7064eda93941/README.md)
- [Authoritative assumptions (Japanese)](https://github.com/NyxFoundation/nyxis/blob/785c11a6285fe92901e871e1fc0f7064eda93941/ASSUMPTIONS.ja.md)
- [Theorem catalog](https://github.com/NyxFoundation/nyxis/blob/785c11a6285fe92901e871e1fc0f7064eda93941/docs/proofs.md)

Nyxis explicitly excludes unconditional noninterference and trusts parts of
the execution connection/environment. No Nyxis build/proof check, original
security audit, endorsement or equivalence of its theorem to ARC is claimed here.
Formal authorization/information-flow guarantees have prior research, including
[seL4 information-flow enforcement](https://sel4.systems/Research/pdfs/sel4-from-general-purpose-to-proof-information-flow-enforcement.pdf).
No world-first, novel-theorem, universal safety or competitive-superiority claim
is established. Novelty and usefulness require their own literature/comparison
and operator evidence.
