---
title: "An AI agent can be approved and still leave you with an unknown result"
description: "A maintainer-side reproduction of AWL's crash-boundary tests, and what eighteen offline fixtures can and cannot establish."
tags: ai, agents, testing, opensource
---

An approval answers whether an agent may attempt an action. It does not tell
you whether a remote service completed it.

That distinction became concrete in a public discussion with Murthy G, the
developer of [Agent Work Layer](https://github.com/probita-ai/agent-work-layer).
AWL stages selected tool calls until a manager approves the work. I asked what
happens when a service receives a call, but the gateway dies before it records
the answer.

The useful outcome was a change we could inspect and rerun.

## The uncertain interval

Consider one approved operation:

1. The gateway records that it is starting the operation.
2. The receiver performs the effect.
3. The receiver returns a result.
4. The gateway records that result.

A missing result after step 2 does not establish that nothing happened. Sending
again may duplicate an effect. Refusing to send again may leave an operation
unfinished if the gateway actually stopped before step 2.

Murthy [clarified the intended at-most-once behavior](https://dev.to/murthyg/comment/3j4aj)
and changed unanswered or interrupted effects to `unknown` in
[PR #43](https://github.com/probita-ai/agent-work-layer/pull/43), associated with
`agent-work-layer-mcp` 0.8.1. The gateway retains that uncertainty and avoids
automatically sending the operation again. Calls also carry `awl/ref` and
`awl/order` metadata. A real receiver still needs its own verified handling of
those identifiers; metadata alone does not establish deduplication.

## What the reproduction actually showed

On October 27, 2026, the maintainer-side reproduction checked out PR #43's exact
head, `493157aee3391ec89fe1ffd301a402ae6e61861c`, on Linux x86_64 with Node
v24.22.1. These commands ran from the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build -w agent-work-layer
node --test packages/mcp/test/cli.test.ts packages/mcp/test/gateway.test.ts
```

The focused suite finished with **42 passing tests, zero failures and zero
skips**, exit 0, in about 21.95 seconds. This tested a source checkout, rather
than the published npm artifact. The [public results reply](https://dev.to/suirindo/comment/3j4bn)
records the environment and limits.

The [CLI tests](https://github.com/probita-ai/agent-work-layer/blob/493157aee3391ec89fe1ffd301a402ae6e61861c/packages/mcp/test/cli.test.ts)
use a separate local MCP receiver over stdio. It writes its own delivery file,
separate from the gateway log. The passing assertions cover:

| Situation | Bounded observation |
| --- | --- |
| Gateway killed after the receiver records the call, before its answer | After manual stale-lock removal, recovery retains `unknown`; further commit does not add a delivery |
| Receiver records the call and exits without answering | Outcome remains `unknown` across repeated commits; delivery count stays one |
| Successful result recorded, then commit repeats | Earlier `ok` result is retained; delivery count stays one |

Two limitations deserve equal billing with the green result.

First, recovery from the killed process includes manual lock removal.
[Issue #44](https://github.com/probita-ai/agent-work-layer/issues/44) tracked that
stale-lock problem. AWL 0.9.0 ([PR #48](https://github.com/probita-ai/agent-work-layer/pull/48)),
merged after this reproduction, reports that a later run on the same machine
takes over a lock whose process is gone. I have not rerun that release, so this
run does not establish automatic crash recovery.

Second, the [gateway test](https://github.com/probita-ai/agent-work-layer/blob/493157aee3391ec89fe1ffd301a402ae6e61861c/packages/mcp/test/gateway.test.ts)
representing the before/after-send ambiguity injects a `running` log entry.
It does not kill a real gateway immediately before dispatch. The separate
receiver is a fake local service; no Gmail delivery, production idempotency or
power-loss durability was tested.

## Settling an outcome and permitting another attempt

[Issue #45](https://github.com/probita-ai/agent-work-layer/issues/45) proposed
letting someone settle an unknown effect after checking the receiver.

That introduces two decisions worth recording separately:

- What does the available evidence establish about the earlier operation?
- Under the current authority, may another attempt occur?

Murthy has since [refined that proposal](https://github.com/probita-ai/agent-work-layer/issues/45#issuecomment-6431421646):
settlement records evidence, while a separate retry step rechecks authority and
keeps the operation identity across attempts. Who may settle and who may retry
remained open questions in that comment.

The same PR #48 then shipped an implementation. According to its description,
a worker settles an `unknown` effect as `ok` or `not_run` with a required note,
and settling never runs anything. Only a manager allows a retry. `--retry`
rechecks the approval and the staged call, then sends the same `awl/ref` with
`awl/try: 2`. I have read that description only; the reproduction above does
not verify the settlement or retry implementation.

An absent receiver record can be incomplete evidence. An earlier approval can
also describe a different recipient, payload or request instance from the one
now pending. A retry needs a deliberate policy for current authority and
logical operation identity. These remain acceptance questions for the new
release, not features established by the rerun.

A separate [trollshell discussion](https://github.com/vibec0re/trollshell/issues/1557#issuecomment-6431287998)
made the request-instance boundary particularly clear: comparing an approval
click with the last-polled UI snapshot leaves a later server-side race. The
author distinguishes that existing UI protection from a proposed server-side
compare-and-set. Our [source-based response](https://github.com/vibec0re/trollshell/issues/1557#issuecomment-6431391150)
keeps the upstream work's dormant scope intact. No GTK or hive runtime test
was run in that review.

## Eighteen executable calculations, with runtime gaps visible

I maintain [Agent Role Contracts](https://github.com/suirindo/agent-role-contracts),
an offline declaration checker. The discussion informed a bounded fixture pack
tracked in [#71](https://github.com/suirindo/agent-role-contracts/issues/71) and
[#69](https://github.com/suirindo/agent-role-contracts/issues/69#issuecomment-6408121908).
The [fixtures, runner and raw results](https://github.com/suirindo/agent-role-contracts/tree/main/experiments/outreach-fixtures)
are public, with reproduction commands in the README.

The pack groups eighteen offline cases into:

- **Six permission comparisons:** mapped excess authority, missing inventory,
  stale or foreign identity, unmapped tools and a repaired supplied snapshot.
- **Six approval-binding cases:** changed payload, target or policy; missing
  authentic issuer/current-scope evidence; old versus explicitly supplied new
  fictional decisions.
- **Six evidence worksheets:** distinct dispatch/receiver/response records,
  pre-dispatch failure, lost response, cancellation, missing durable evidence
  and conflicting or replayed records.

The runner uses existing G0/G1/G3 APIs and retains resolved inputs and raw
results. All eighteen expected calculations matched in the local run. The
output also records **zero runtime cases executed**, with authority `UNKNOWN`
and runtime `NOT_RUN`. A lifecycle declaration can be consistent while the
separate supplied trace remains unresolved. A hidden recipient resolution
cannot be discovered by hashing the unchanged declaration.

The permission comparator agrees with an equally informed, modeled native-style
predicate. That overlap matters: the fixture pack provides a repeatable
worksheet, while incremental value over a real host's complete controls and
human maintenance cost remain unmeasured. The six evidence worksheets are
synthetic inputs, separate from AWL's executed receiver tests.

## The evidence to keep

For an uncertain operation, a useful record keeps the exact reviewed subject,
logical operation identity, individual attempt, current authorization decision,
dispatch observation, receiver observation and response separate. It also
names who supplied each record, what was actually verified and what remains
unobserved.

That separation lets an operator preserve uncertainty without turning a green
declaration check into a claim of delivery. In this exchange, a concrete test
proposal led to inspectable external changes and a bounded reproduction. The
remaining recovery and reconciliation questions stay visible alongside it.
