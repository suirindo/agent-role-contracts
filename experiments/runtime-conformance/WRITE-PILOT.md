# Bounded runtime write pilot (source-only laboratory)

This explicitly selected pilot serves [value evaluation #47](https://github.com/suirindo/agent-role-contracts/issues/47).
It does not lift the general adapter-expansion pause or Track C's separate
Controller/independent-observer gates. It executes synthetic requests in newly
provisioned host-owned temporary workspaces. No provider, credential, customer
data, production setting, published API, release or Controller change is involved.

## Run and boundary

Supported enforcement environment: **Linux, Node.js 24, overlayfs only**, with
`O_NOFOLLOW`, host UID ownership, private mode-0700 directories and no other
process modifying the workspace. Other conditions refuse construction; existing
cross-platform core support is unchanged. This narrow choice matches the measured
laboratory host, not all Linux filesystems. Tests explicitly skip pilot positives
on unsupported hosts; that is not a cross-platform enforcement PASS.

```sh
node experiments/runtime-conformance/write-pilot-demo.mjs
node --test tests/runtime-write-pilot.test.mjs
```

The demo first completes all shadow/replay judgments with zero executor calls.
Only then does it explicitly construct enforcement hosts in separate fresh private
roots. Each refusal checks a complete workspace/sentinel snapshot and zero executor
calls; accepted requests check exact readback bytes. Owned temporary roots are
removed after the experiment. Reproduction requires the stated host conditions.

`write-pilot.mjs` is a trusted-host library, not a worker SDK. The host provisioner
creates a fresh root; an arbitrary caller-selected existing directory is refused.
The operator creates only required private parent directories. Writes create one
new regular file (maximum 1 MiB); no overwrite, deletion, shell, recovery, publication,
recursive directory creation or arbitrary executor callback is offered.

## Actual request pipeline

1. Host provisions context, native ACL, task/bundle, run, role and principal from
   its own assignment registry; host mints a random session. The fixture registry
   is fictional but lives outside worker input.
2. Host prepares the existing G1 subject/action/binding and obtains a **test-only**
   authority record scoped to that exact subject, operation, path, content hash,
   task, principal, role, workspace, policy revision, run and new session.
3. Host admits that snapshot and gives the worker only an opaque admission-bound
   submit channel. Request accepts exactly `operation`, `path`, `bytes`; all context
   and `trusted=true` fields are rejected.
4. At request receipt, the host claims admission synchronously, copies bytes once
   into an owned Buffer, captures path, hashes that copy and validates existing G1
   binding and G2 mapping against the actual path/hash. No worker reference reaches
   the verifier or executor.
5. Host matches actual assigned actor against G2 `eligible_executors` and native
   ACL. Another eligible writer cannot authorize the current read-only reviewer.
   Native denial always wins.
6. Host checks filesystem state and bounded verifier result; after asynchronous
   checks it rechecks current context and destination. A synchronous authority
   consume revalidates expiry/revocation/exact target and single-use state.
7. The fixed synchronous executor opens with `O_CREAT|O_EXCL|O_NOFOLLOW`, writes
   the same owned bytes, fsyncs, reads back from the same descriptor and records
   the resulting hash. It offers no replacement callback or alternate path.

The result is specific to **writes through this adapter**. G1/G2's existing public
reports retain all their false execution/authentication fields unchanged.

## Authority, faults and audit

`createTestAuthorityStore` is explicitly **TEST ONLY — host fixture authority**.
Its admin `grant/revoke/setFault` methods must never reach a worker. Object identity
is registered privately: a worker-created object or `trusted=true` cannot install a
verifier. Missing verifier refuses enforcement. This pilot intentionally provides
**no production verifier configuration**. Its fixture grant means a host test
operator created the record; it authenticates no real human reviewer or approver.
A future integration needs a separately trusted host identity/approval verifier;
G1 approval/review declarations and digests are never that verifier.

The record is bound to exact operation/context, has a deadline, revocation and one
use. Same-admission parallel submissions claim before any await; separate admissions
sharing one approval still consume it at most once. Expired/foreign/old-policy/
old-session approvals, missing context, unknown operations, timeout, exceptions and
stopped verifiers all refuse before the executor. A fresh host has a new random
session and no old admissions. This is **in-process session replay prevention**,
not a durable ledger. Restart never reactivates old admissions. No automatic retry,
refund of consumed authority or partial-file deletion occurs.

| Outcome | Meaning |
| --- | --- |
| `rejected_before_execution` | No fixed executor call; protected workspace and outside sentinel remain unchanged |
| `shadow_would_allow` | Prediction only; no execution/prevention claim |
| `write_failed` | Authority consumed, executor entered; open/write/fsync failed; partial output may remain |
| `execution_result_unknown` | Authority consumed; readback/close failed; committed effects may exist |
| `committed` | Exact bytes read back from this executor's descriptor |

Audit records update a separate host-memory array; their updates are not protected
file effects or an independent signed observer. A crash can lose audit history.
`committed` is a local syscall/readback observation, not crash-durable directory
persistence, continuous coverage, independent provenance or customer acceptance.
A result unknown remains unknown; a fresh approval does not authorize overwriting
the possibly created destination.

## Filesystem and worker threat model

Absolute paths, traversal/dot segments, backslashes, nonportable aliases, symlinks,
existing destinations (including directories/FIFOs) and nonprivate parents are
rejected. `O_EXCL` additionally prevents existing-target overwrite. Root/parent
checks followed by normal path-based open **do not protect hostile concurrent
parent rename/mount/symlink races**. No such guarantee is claimed. External workspace
mutation, another hostile process under the host UID, host compromise, mount swaps,
malicious filesystem and hostile native extensions are outside this pilot.

The fixed worker transport is connected through stdin/stdout to a host-bound
channel. Host chooses the executable/script and fixes identity; the worker receives
no authority/context/admin API. `--permission` grants only the one worker script's
read access, no filesystem writes or subprocess/worker-thread/addon/inspector
permissions, with empty inherited environment. The worker has no MCP endpoints or
provider credentials. Real direct-write, symlink, Bash and Python probes are denied
and checked against the unchanged external sentinel. These restrictions are
**defense in depth**: Node's permission model is not a sandbox against arbitrary
malicious JS/native code. No arbitrary worker code is loaded here. Embedding this
library in an unrestricted same-process worker cannot close other filesystem paths;
its guarantee is only adapter-mediated writes. This is not a general sandbox,
Claude Code protection, all-MCP gateway or claim about all agent behavior.

## Same-condition comparison and value decision

The baseline is an explicitly selected **synthetic coarse host-native ACL**, not
an evaluation of production IAM, HOL Guard, a full approval broker or every incumbent
control. Both arms use identical native `write`/path settings and the same fixed
filesystem executor, request corpus and host assignment context. Every arm gets its
own fresh workspace. `comparison='native-only'` is a host-admin laboratory option;
it is never a worker request and must never become a production bypass switch.

In the native-only arm the added declaration/actual-actor/approval layers are
omitted together. Attribute differences precisely:

| Cases in the 12-case corpus | Native only | Integrated pilot | Added component |
| --- | --- | --- | --- |
| Legitimate request (1) | Create | Create | No observed false rejection on this one valid case |
| Changed bytes / other native-allowed path (2) | Create | Refuse | Existing G2 connected to actual request bytes/path |
| Actual reviewer with coarse native write (1) | Create | Refuse | Host identity/assignment to G2 eligibility bridge |
| Revoked approval / stopped verifier (2) | Create | Refuse | Host fixture authority layer, **not ARC core authentication** |
| Native read-only/path denial, unsupported operation, traversal, existing file, symlink (6) | Refuse | Refuse | Existing native/request/filesystem controls also suffice |

Initial local execution: 12 shadow cases (zero prevented writes counted), 12 paired
enforcement cases, six overlapping denials, five integrated-pilot added refusals,
zero false refusals among **one** legitimate case and zero unknowns in that corpus.
Fault-injection tests separately establish partial-write failure and unknown
readback, so the corpus's zero unknowns is not a universal safety claim.
The reference-worker roundtrip additionally creates one real 15-byte file, reads it
back and refuses replay; its direct-write/subprocess probes leave the sentinel intact.

Timing is emitted as `measurement` in demo JSON: one sequential host-submission
wall-time sample, including declaration/authority checks and synchronous I/O,
excluding provisioning and worker startup. It is not a benchmark; use reported
Node/OS/filesystem and repetition count. Human setup, maintenance and recheck minutes
remain **UNMEASURED**. No internal business task or external evaluation is counted.
Actual second-task reuse and the operator's keep/remove judgment remain
**UNMEASURED**; another fixture would not establish either.

**Decision: keep experimental and defer productization.** The synthetic integrated
pilot demonstrates interception at its chosen boundary. Incremental benefit over a
full existing approval broker, actual setup cost and voluntary second-task reuse
remain unproven; these are required evidence for #47's product decision.

## Requirement and verification map

| Requirement | Changed surface and evidence | Remaining limit |
| --- | --- | --- |
| R1 | New files in this experiment and tests only; unchanged exports, schemas, G1 digest, CLI and version; existing checks and pack smoke | Hosted OS/Node matrix and formal acceptance separate |
| R2 | `write-pilot.mjs`: owned Buffer/path snapshot; mutation-during-verification and real worker roundtrip tests | Host code/control plane trusted |
| R3 | Actual G2 eligibility plus current principal/task/run assignment and native ACL; read-only/unassigned/native-deny tests | Fixture principal, not production identity |
| R4 | Host-only scoped test authority, expiry/revocation/revision/session/one-use; missing/forged verifier and approval tests | No real approver authentication; production verifier unsupported |
| R5 | Synchronous claim/consume, timeout/fault refusal, restart invalidation, separate failure/unknown outcomes; parallel and I/O tests | Memory/session only; no durable recovery or retries |
| R6 | Linux/Node24/overlayfs, host provisioner, private parents, exclusive no-follow open; symlink/FIFO/existing/root-mode tests | No hostile concurrent mutation guarantee |
| R7 | Fixed restricted child transport and real denied bypass probes | Adapter-only guarantee; Node permissions not hostile-code sandbox |
| R8 | `tests/runtime-write-pilot.test.mjs` actual output/readback, complete refusal snapshots + external sentinel, injected partial/unknown I/O | Laboratory evidence, not production effect observer |
| R9 | `write-pilot-demo.mjs` paired corpus, component attribution, timing and explicit unmeasured operator costs/reuse | Synthetic only; commercial value undecided |

Existing commands remain unchanged and must be run on the candidate:

```sh
npm run check
node --test .github/release/*.test.mjs
npm run pack:smoke
node experiments/runtime-conformance/demo.mjs
node --test tests/runtime-conformance-spike.test.mjs
node experiments/runtime-conformance/artifact-receipt-demo.mjs
node --test tests/artifact-observation-receipt.test.mjs
```

Before merging: exact-candidate independent review and existing required CI/QC /
branch-protection gates still apply. Local tests and this pilot's reviewer are not
a substitute for signed formal cross-runtime QC or all-OS CI. No merge, tag, npm
publication, deployment, production enablement or customer acceptance follows.
