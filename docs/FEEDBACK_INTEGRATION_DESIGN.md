# Integration decisions from external engineering feedback

Status: **PROPOSED INTEGRATION DESIGN — NOT A SHIPPED RUNTIME** (2026-10-27).
This refines [the architecture](ARCHITECTURE.md) and
[the conditional assurance design](ASSURANCE.md), under
[#47](https://github.com/suirindo/agent-role-contracts/issues/47),
[#69](https://github.com/suirindo/agent-role-contracts/issues/69) and
[#71](https://github.com/suirindo/agent-role-contracts/issues/71).
It introduces no stable schema/API, authority service, runtime activation or release.

## 1. Evidence changes the product hypothesis

ARC's candidate additional value is a reusable, inspectable connection between
an operator's approved task, a concrete request and evidence of what happened.
This is a hypothesis to measure against existing controls, not a claim that ARC
has a uniquely effective authorization predicate.

Public feedback and retained observations motivate the following decisions.
A counterpart's report, a maintainer reproduction and native-harness acceptance
are different evidence classes.

| Source | What the source establishes | Design consequence |
| --- | --- | --- |
| [Srinath / Neelagiri65](https://github.com/suirindo/agent-role-contracts/issues/69#issuecomment-6442115226) | The counterpart agrees that the useful next question is where the grant comes from, and offers to examine a native-harness case | Make grant provenance the next integration boundary; an offer to review is not joint acceptance |
| [Maintainer stdio MCP packet](https://github.com/suirindo/agent-role-contracts/issues/71#issuecomment-6433606266) | Six synthetic rows report identical results for a custom task gate and an equally informed host policy; declaration-only checks do not stop sending | Preserve the overlap result; do not market the check itself as an enforcement advantage |
| [newworldba's inventory fixture](https://github.com/suirindo/agent-role-contracts/issues/71#issuecomment-6421421319) | The reporter's supplied host-inventory comparison detects excess capability while ARC declarations pass; native enforcement was not tested | Keep a small preflight comparator outside the stable core; independently establish inventory provenance |
| [newworldba's setup feedback](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6421011396) | One evaluator reports actor/path mapping as the main initial setup friction; timing is self-reported | Reuse the existing actor-mapping quickstart; measure mapping maintenance and second-task reuse |
| [HOS relationship-manifest proposal](https://github.com/thurlow-research/HumanOversightSystem/issues/1453) | Public proposal describes duplicated relationship declarations and a possible canonical manifest | Prefer a deterministic projection of an existing canonical manifest; do not require another hand-maintained roster or imply upstream adoption |
| [AWL settlement/retry refinement](https://github.com/probita-ai/agent-work-layer/issues/45#issuecomment-6431421646) | The author's proposal separates recording an outcome from allowing a retry, with one logical identity across attempts | Separate evidence settlement, current retry authorization and executor start; this source is a design discussion, not ARC execution evidence |
| [trollshell approval race](https://github.com/vibec0re/trollshell/issues/1557#issuecomment-6431287998) | The author distinguishes a UI snapshot check from a remaining server-side request-revision comparison | Bind approval to the pending request instance and consume it at the authoritative server gate; a UI re-read alone is insufficient |

These are bounded design inputs. Private correspondence is not reproduced here.
Unverified claims in discussions are not promoted to verified product behavior.

## 2. One policy source, explicit projections

The consumer's approved manifest/policy remains canonical. Where one exists,
an optional adapter should project its roles, routes and supported resource
scopes into existing ARC declarations. Where none exists, the operator may
author an ARC bundle directly. Both paths keep the current core schemas.

A projection must record its source revision/content digest, adapter version,
mapping rules and unsupported fields. It must be deterministic and reproducible.
It must preserve restrictions, explicit denials and role relationships, and
must not silently infer permissions from prose, tool descriptions or role names.
An unknown or unrepresentable restriction holds the affected native admission;
an unrelated supported task need not be globally blocked.

The operator reviews the mapping and resulting task scope. Source changes
invalidate dependent review/approval subjects and require current admission.
Generated declarations must not become a second editable policy source.
A detached export can support an offline review, but cannot attest that the
runtime still uses that revision. Runtime observation is a separate input.

Declared role IDs are not operating-system, provider or human identities.
Specialists sharing a principal need a trusted invocation/delegation context;
different role names alone cannot establish independent review.

## 3. Grant provenance before a native dispatch

The next bounded experiment should connect **one explicitly selected, opted-in
native harness**, not introduce a general runtime. Read/send remains the first
formal-model scope in ASSURANCE.md. Any other effect requires its own explicit
versioned adapter semantics and acceptance; a shell command is not implicitly
covered.

The following are proposed host responsibilities, not implemented ARC fields:

| Boundary | Required trusted fact | Must not be accepted as authority |
| --- | --- | --- |
| Policy intake | Canonical source revision and verified issuer identity/authority | An agent-edited export or an LLM's interpretation of prose |
| Task approval | Authenticated approver, permitted issuance scope and exact approved task/action subject | A valid G1 digest or declared approval without issuer authentication |
| Pending request | Unique request instance/revision plus actual normalized target and owned input bytes | A reused display ID, unchanged tool description or last-polled UI row |
| Effective permissions | Current harness/session/tenant inventory and explicit effect mapping | A worker's tool list, requested role or caller-supplied trusted flag |
| Grant issuance | Trusted host verifies current approval and narrows it to this request/context/limits | Ambient tool access, a core PASS or a tool response that invents a grant |
| Dispatch | Atomic current-state check, budget reservation and one-use consumption before local start | A previously cached ALLOW or separate check-then-send operations |
| Observation | Bound broker/receiver evidence with source, coverage and verification status | A success sentence, HTTP status alone or absence in an incomplete log |

Reuse the existing complete G1 subject; do not silently change its wire format.
A future native envelope must additionally bind the request instance/revision,
task/run/session/tenant and actor context, policy/approval epoch, adapter/tool
implementation identity, resolved destination, input digest/length and limits.
Its version and authenticated transport/storage contract must be explicit.

At the gate, compare the expected pending revision and subject with authoritative
current state and consume the matching grant in the same serialized decision.
Replacing a request under the same display ID must reject the old decision,
even when its visible text is identical. Re-resolving a target or modifying
bytes after review requires a fresh bound decision. Unobservable target
resolution remains unsupported.

A signed or host-authenticated grant only establishes its authenticated
issuer and bound claims under that protocol. The host must still verify that
the issuer may grant this authority, that it is current, and that the actual
operation matches. No new public trust root is selected by this design.

## 4. Outcome evidence and retry authority are separate

Use distinct identities for the logical operation, each attempted dispatch and
each one-use grant. An optional receiver idempotency key belongs to the logical
operation; changing the attempt number must not evade receiver deduplication.
These are future native-envelope concepts, not additions to G3's current schema.

Keep dispatch start, remote receipt, response, effect completion and evidence
settlement distinct. A lost response, timeout or error HTTP status does not
establish that the remote effect did not occur. An empty receiver log is not
a no-effect proof without verified completeness for the relevant boundary.

Settlement appends an attributed evidence decision and its limits. It cannot
execute an action, refund a consumed grant, recreate budget or approve a retry.
Preserve original uncertainty and the evidence used to resolve it; conflicting
or incomplete observations remain unresolved.

A retry is a new, explicit admission under current authority, policy, payload
and destination, with a fresh one-use grant and attempt identity. It retains
the logical operation identity and any valid receiver deduplication contract.
This refines T4: **at most one local start per grant**, not one start forever
per logical operation. Reusing the consumed grant remains forbidden.

Before admitting a retry, the host needs either independently sufficient
no-effect evidence or a verified receiver reconciliation/idempotency contract
that makes the repeated attempt safe within its stated scope. A manager's
permission alone cannot prove that an earlier effect did not happen. If neither
condition is established, hold the retry and request human resolution without
claiming that resolution mathematically removes duplicate-effect risk.

Receiver deduplication must specify authentication, operation/key scope,
same-key/different-payload rejection, atomicity, retention and restart behavior.
Sending a metadata key alone establishes none of these. Exactly-once remote
delivery and general availability remain outside T4.

## 5. Permission, work completion and human judgment

A supported action can stay inside file/role authority while changing the
wrong behavior, disabling a required test or leaving the requested job unfinished.
G0/G1/G2/G3 consistency must not collapse these questions into one green verdict.

The existing scoped-change evidence experiment may compare actual Git paths,
protected bytes and declared test receipts. It does not establish semantic
completion or test truth. A native integration needs independently observed
test identities, inputs and execution; equal test counts or a cache hit do not
establish that the required tests ran against this candidate.

Keep objective relevance and acceptance as a separate review decision. An LLM
may suggest concerns with exact diff/evidence references, but its interpretation
cannot issue policy, broaden scope or certify the task as correct. If an
intent boundary cannot be expressed or independently verified, expose that
limit for human judgment. Do not promise to detect every in-scope digression.

For short ad-hoc work, aim for a reusable role mapping plus a narrow task and
proposed effect preview. Show what changes, what evidence is missing and why a
decision is required. Avoid asking users to maintain another orchestration
system or treating every ordinary call as a new manual approval. Standing
delegation may support bounded fresh grants only within approved authority.

## 6. Next experiment and acceptance

This is a proposed acceptance contract, **not completed native execution**.
Select a harness and freeze its version/configuration before implementation.
No counterpart private fixture, customer data, public receiver or paid service
is required for the first synthetic native test.

| Gate | Required observation |
| --- | --- |
| N0 provenance | Pin core/profile/adapter/harness/configuration and canonical policy; independently establish the issuer, actor and effective inventory. If these are unavailable, report NOT_TESTED/UNKNOWN |
| N1 legitimate use | An explicitly authorized synthetic read/send reaches a separate healthy receiver with the exact owned bytes; bracket negative rows with positive controls |
| N2 authority denial | Read-only task, forged/unapproved issuer, agent-edited policy export and foreign context produce zero executor starts and zero independently observed effects |
| N3 freshness | Replace the pending request after display, mutate payload/destination or revise/revoke policy before the gate; stale approval never authorizes the replacement |
| N4 state/faults | Concurrent submissions, consumed-grant replay, crash boundaries, received-body/lost-response and error-response cases retain distinct start/receipt/response observations and no automatic replay |
| N5 reconciliation | Settlement alone starts zero executors; unsafe retry is held; an explicitly safe retry gets a fresh grant/current check, same logical operation identity and separate attempt evidence |
| N6 incremental value | Compare with equally informed incumbent controls using the same policy and observations; then evaluate two distinct genuine tasks with human setup/maintenance/review time, useful catches, false refusals and keep/remove judgment |

N4 durable/crash acceptance must exercise the actual persistence/recovery
boundary, not merely a one-process closure or injected log record. A native
host comparison must use the installed harness; an MCP transport test alone
does not meet that gate. Receiver coverage must name unobserved channels.
Tests remain finite evidence, separate from a machine-checked model proof.

For N6, retain incumbent-only and ARC-assisted results, policy-information
parity, ordering/learning effects and operator support costs. Do not count an
injected negative control as a naturally useful catch, a scripted rerun as
voluntary reuse, or a counterpart's review offer as adoption. A result of
redundancy or extra maintenance can justify stopping the integration.

The next implementation decision is N0: one willing harness owner and a
verifiable canonical approval/policy source. If this cannot be established,
continue only bounded offline specification work; do not build a broad broker
or claim native protection. Formal-model work and human-value evaluation stay
separate gates, with no safety claim inferred from a merged design document.
