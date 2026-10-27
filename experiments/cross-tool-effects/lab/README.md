# D2 minimal loopback laboratory (#69)

This is a small D2 investigation after accepted D1. It is not the complete
56-case D2 broker, a production runtime, or an actual MCP server. Stable ARC
core/API/schema/npm and host runtime configuration are untouched.

## Explicit execution scope

The CLI creates one owned temporary file containing the compiled-in fictional
FIXTURE, reads and hashes its actual bytes, and starts one temporary HTTP receiver
on **127.0.0.1**, with an OS-assigned port. Only fixed POST /report is sent with
the known fixture bytes. No credentials, real data, arbitrary URL/path/header,
proxy, redirect following, remote endpoint, model or counterpart service is used.
The receiver is a separate child process; its private IPC reports socket and
received-body counts/digests, not agent assertions. Owned files/child/server are
closed on normal completion. Transport/startup/IPC timers are bounded.

Trusted setup supplies fictional G1 review/approval declarations explicitly for
each synthetic alternative. The host never synthesizes them. These are not
authenticated approvals or production permission. Worker-facing methods accept
only fixed read and opaque-handle submission; callers cannot set URL/body/actor,
source labels, completeness, classification or destination. Trusted setup is
test authority, not a worker interface.

Explicit opt-in (Node >=22.5):

    node experiments/cross-tool-effects/lab/run.mjs --loopback

Exit0 means declared observations matched,1 means mismatch,2 means setup/input/
tool error. Errors are sanitized; stdout contains only synthetic hashes/counts.
Default unit tests perform no socket operation. The optional actual-network test
requires ARC_CTEI_LOOPBACK_LAB=1 and separately authorized loopback execution.
An offline sandbox refusal is a real execution boundary; do not disable or bypass
its network policy to make this lab run there.

## Paired observations and controls

All alternatives use the same request digest, tools, actual fixture bytes,
adapter and receiver. Each has fresh fictional review declarations as needed;
they are isolated alternative fixtures, not a claim about reusable real grants
or aggregate cross-run budgets.

| Alternative | Required local execution observation |
| --- | --- |
| Authorized send before | One executor start, one socket, one exact body receipt |
| Read-only contract | DENY, zero executor starts, zero new sockets/receipts |
| Incomplete provenance | UNKNOWN, zero executor starts, zero new sockets/receipts |
| Authorized send after | One executor start, one socket, one exact body receipt |
| Replay after either authorized send | DENY, zero additional sockets/receipts |

Positive controls bracket denials so a dead receiver does not look like a
successful rejection. Independent receiver checkpoints bracket each call.
One-use consumption and a synchronous busy guard precede the in-process fixed
transport; transport failure retains consumption and REMOTE_EFFECT_UNKNOWN,
with no retry. They do not provide distributed/durable nonce enforcement.

## Evidence boundaries

Report classification: MAINTAINER_SYNTHETIC_LOOPBACK. Data/approvals are fictional.
Actual fixture read, local POST, receiver bytes and limited function-level
no-dispatch observations are distinguishable from the offline D1 calculation.

No global network capture, hostile same-UID/kernel protection, authenticated
actor/native permission broker, arbitrary path containment, live MCP interception,
tool/adapter approval registry, TLS/DNS verification, crash recovery, persistent
counters, full session/agent taint tracking or business outcome is established.
The observer is a distinct process but shares the OS account; it is not a
tamper-proof independent audit. Coverage is FIXED_LAB_FUNCTION_AND_RECEIVER_ONLY.
Same-process mutable-code adversaries and unmediated shell/browser/model channels
are outside this lab.

Source hashes and Git commit must accompany an execution receipt. General D2
56-case acceptance remains open, as do race/fault/adversarial isolation coverage,
partner reproduction and #47's human time/second-task value. No actual mcpgawk,
Counterseal or incumbent product was run. The paired task-conditioned result can
also be implemented by an equally informed egress rule; no superiority claimed.


## Additional bounded fault observations

Explicit opt-in for the same compiled fictional fixture and local receivers:

    node experiments/cross-tool-effects/lab/faults.mjs --loopback

1. **Response lost after receipt:** the trusted receiver records the complete
   body and then deliberately closes the socket before sending HTTP headers.
   The sender must retain REMOTE_EFFECT_UNKNOWN even though this observer sees
   one exact receipt. A replay must be rejected with zero extra sockets/receipts.
2. **Parallel submissions:** submit the same handle/binding twice to one host
   closure. One may dispatch, the other must be denied, and the receiver must
   observe exactly one body. Later replay adds no socket/receipt.

The receiver's drop-response flag is a trusted test setup option, never a worker
argument. Normal laboratory behavior stays unchanged. The shared observer
starter itself requires explicit loopback opt-in; imports/default tests open
no sockets. Test-only declaration construction remains explicitly synthetic.

These examine limited laboratory slices of CTE-037 and CTE-029. They do not
complete either broad acceptance case or the full56-case suite. In particular,
they provide no atomicity across processes, durable nonce recovery, authenticated
receipt reconciliation, distributed budgets or actual broker integration.
Response-loss policy ALLOW describes admission; execution uncertainty and
observer-confirmed receipt remain separate. The absence of a sender response
must not become an assumption that nothing happened.

A separately admitted host execution receipt and exact source hashes are
required for actual fault observations. Ordinary CI/offline checks continue
to skip explicit network tests; an offline refusal must remain respected.

## HTTP 404 after a recorded effect (fictional, unverified-feedback slice)

Explicit opt-in, same compiled 50-byte fictional fixture and loopback receiver:

    node experiments/cross-tool-effects/lab/faults.mjs --loopback-http404

Inspired by unverified public DEV feedback; this lab neither confirms that
report nor claims ARC adoption. Three isolated cases run in order:

1. **healthy-204-control:** one start, one socket, one exact receipt, sender sees
   HTTP 204; replay is DENY with zero extra sockets/receipts.
2. **http-404-after-effect:** the trusted receiver records the complete 50-byte
   body and then returns HTTP 404. The sender observes RESPONSE_OBSERVED with
   status 404 and must **not** treat it as a successful remote effect, while the
   separate observer shows one exact receipt. Replay is DENY with zero additional
   sockets or receipts, so a 404 does not invite a blind retry.
3. **no-send-control:** read-only contract against a 404 receiver: DENY, zero
   starts, zero sockets/receipts, so a dead or merely 404ing receiver cannot pass
   as a successful rejection.

The 404 flag is receiver setup, not a worker argument. Existing response-loss and
concurrent cases are unchanged. No remote exactly-once, atomicity, durable
recovery or receipt reconciliation is established; replay denial is in-process only.
