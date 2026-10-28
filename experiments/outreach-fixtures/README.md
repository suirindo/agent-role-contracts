# Eighteen outreach fixtures: inventory, binding and uncertain outcomes

Source-only worksheet for [#71](https://github.com/suirindo/agent-role-contracts/issues/71)
and the existing [#69 evaluation contract](https://github.com/suirindo/agent-role-contracts/issues/69#issuecomment-6408121908).
The frozen `cases.json` predates the first run. Labels PD/AB/RE are local case IDs,
not additions to the CTE-001..056 runtime inventory.

The user is a host integrator trying to distinguish a consistent declaration,
an observed action and an unresolved result. The pack makes missing evidence
visible in a reproducible calculation. It adds no runtime, approval service,
stable schema, export, dependency, network receiver or enforcement integration.

## Reproduce

Use a checkout containing these candidate files, Node >=22.5, from its root:

```sh
node --test tests/outreach-fixtures.test.mjs
node experiments/outreach-fixtures/runner.mjs > result.json
npm run check
```

No install is needed for the fixture runner. It reads repository fixtures,
hashes its named sources and obtains the checkout HEAD with a read-only Git
command. It opens no evidence locators and sends no message. The sole CLI
operation writes JSON to stdout; redirection chooses where to save it. Exit 0
means the **18 declared fixture expectations** matched, exit 1 means an
expectation differed, and exit 2 means the runner could not finish. It does not
mean 18 runtime actions succeeded. `npm run check` is the separate repository
schema/regression gate.

`results/maintainer-linux-20261027.json` retains resolved original inputs,
expected values, raw G0/G1/G3 outputs, worksheet results, source SHA-256s,
checkout HEAD, environment and machine duration. That run used the then
uncommitted candidate, so its `checkout_head` is the base commit and the
source is identified by HEAD **plus the listed file hashes**. Machine durations
are not human setup/recheck time. Human setup/maintenance fields remain null.
Regeneration changes machine duration, environment and checkout identity;
compare case outcomes and source identities rather than whole-file byte equality.

## Frozen inputs and expected outcomes

All actors, hosts, recipients, sessions, digests, approvals and receipts below
are fictional. `send:false` is an inert declaration, not an enforced safeguard.
The mapping is frozen to `file-reader → filesystem.read`,
`evidence-review → review.perform`, `general-exec → process.execute`.
An unmapped tool stays a coverage gap, regardless of its friendly name.

| Case | Exercised calculation | Expected result |
| --- | --- | --- |
| PD-01 | Supplied matching read/review inventory | MATCH; host provenance UNKNOWN |
| PD-02 | Add prohibited general execution | MISMATCH; process.execute at /tools/2 |
| PD-03 | Omit inventory, provenance, or mapping, separately | UNKNOWN in all three variants |
| PD-04 | Old config or foreign session | UNKNOWN; STALE_OR_FOREIGN |
| PD-05 | Friendly label without a capability mapping | UNKNOWN; exact unmapped tool retained |
| PD-06 | Matching repaired snapshot plus unchanged old snapshot | New supplied identities MATCH; old stays UNKNOWN |
| AB-01 | Fictional decision matches G1 task/action subject | Binding valid; real authority UNKNOWN |
| AB-02 | Payload digest changes with old decision | G1_SUBJECT_MISMATCH |
| AB-03 | Recipient changes with business-scope version fixed | Supplied change rejects old binding; undisclosed resolution stays UNKNOWN |
| AB-04 | Change task or bundle policy, separately | Old binding rejects in both variants |
| AB-05 | Matching declarations without issuer/current-scope proof | Binding valid; authenticity/current authority UNKNOWN |
| AB-06 | Repair subject, first old decision then a distinct new fictional decision | Old rejects; new declaration matches; no real approval created |
| RE-01 | Supplied admission/dispatch/receiver/response records | Separate observations retained; runtime remains NOT_RUN |
| RE-02 | Supplied pre-dispatch failure and zero receiver count | Retry's current authority UNKNOWN |
| RE-03 | Supplied receiver record, missing response | Sender response UNKNOWN; no authorization to resend |
| RE-04 | Supplied cancellation followed by late approval | Late decision supplies no authority; runtime remains NOT_RUN |
| RE-05 | Resume with missing durable consumption/result | UNRESOLVED_MISSING_EVIDENCE |
| RE-06 | Duplicate/conflicting/incomplete supplied records and artifact hashes | Contradictions/gaps retained; G3_ARTIFACT_DIGEST_CONFLICT |

### What each layer actually checks

PD uses existing bundle/task declaration checks plus a small experimental
comparison over supplied strings. Identity equality for host/session/config is
only a comparison; `provenance:"fixture"` or `"trusted=true"` cannot authenticate
a host or prove freshness. Even MATCH always retains provenance UNKNOWN,
host_inventory_authenticated=false and runtime NOT_RUN. The six cases also run
a **modeled, equally informed native-style predicate**. It gives the same
comparison outcomes. No actual native harness was launched, so the original
#71 native-harness/runtime acceptance remains open.

AB calls the existing `describeTaskAction` and `validateTaskActionBinding`
APIs. Generating fictional decisions is fixture construction only. G1 binds
the represented target; it cannot discover a resolved recipient omitted from
its inputs. Every raw API authenticity/execution limitation remains intact.
The raw JSON shows the old decision and the separate repaired decision.

RE calls the existing `validateTaskLifecycle` API and separately inspects a
supplied trace worksheet. G3 has no cancellation, clock, dispatch or durable
consumption semantics. A G3 PASS can therefore coexist with an unresolved or
contradictory worksheet. Array order and receiver counts are supplied data;
there is no authenticated observer. RE-01 is not evidence that an action ran,
and RE-04 is not an executed late-approval prevention test. The worksheet is
post-hoc and supplies no permission or retry mechanism.

### Known worksheet limits

These helpers are fixture calculations, not reusable checkers. Review found
edges that the frozen 18 cases do not exercise:

- `compareInventory` and the modeled baseline compare host/session/revision
  by equality only. A context and inventory that both omit them can reach
  MATCH. The frozen context always supplies all three.
- The modeled baseline shares the comparator's shape, so their agreement is
  weak evidence.
- PD-03/PD-04 assert only `UNKNOWN`, not its reason. The `STALE_OR_FOREIGN`
  value is visible in the raw JSON but not asserted.
- AB-05's absent issuer/current-scope proofs are descriptive. Its API input
  equals AB-01. AB-03's `hidden_resolution` and the `authority` expectations
  are fixed labels, not measured results.
- The trace worksheet reads only the first dispatch and does not read the
  response outcome. Its cancellation label is not gated on a complete trace.

## Verification, value and remaining work

The focused regression includes corrupt expected outcomes, missing/foreign
inventories, arbitrary provenance strings, excess authority alongside an
unmapped route, malformed/replayed trace entries, late dispatch after
cancellation, and an incomplete nominal success trace. A malformed null event
first failed with TypeError, then passed after explicit malformed-evidence
classification. The invalid input is retained as a regression.

Author-side Linux x64 / Node v24.22.1 checks on 2026-10-27: all 18 fixture
expectations matched; focused regression 4/4; `npm run check` completed with
1,306 pass / 2 skip / 0 fail (1,308 tests total), including the schema check.
These are local source-candidate results. The two skips are the existing
platform-specific skips; no skipped test is counted as a pass.

Current value decision: **keep the fixtures; no incremental integration value
has been shown**. The modeled same-information baseline overlaps. Human cost,
real native-harness comparison, useful natural-work mismatch and unchanged
second-task reuse remain unmeasured. Do not expand an adapter/API from this
result alone. Adding a newly named tool requires an explicit mapping update;
new host/session/config data requires a newly supplied inventory. No claim is
made that maintaining those inputs is free.

All 18 rows are executable offline calculations. **Zero of these 18 are actual
host/receiver runtime executions.** Named-file/general-shell enforcement,
real pre-dispatch process kill, pending-cancellation prevention, durable replay,
current grant verification and distributed behavior remain NOT_RUN. Later
runtime work needs its own admitted executor, independent observation and safe
disposable environment. These files do not release any existing HOLD.

The separately reproduced external AWL tests remain distinct: see the
[maintainer reproduction report](https://github.com/suirindo/agent-role-contracts/issues/69#issuecomment-6408121908)
and [public results reply](https://dev.to/suirindo/comment/3j4bn). They ran a real
local fake receiver process, but neither constitutes ARC adoption nor fill this
pack's remaining runtime cases. Independent source/factual QC and source
publication are separate delivery gates; an author-run green result is not QC.
