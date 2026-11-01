# HumanMirror public scenario: synthetic offline ARC checks

This source-only fixture translates the **two recipient-declaration cases** in the [public HumanMirror scenario](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6528765761) into existing ARC v1.0.0 inputs. A separate group probes the limits of supplied receipt consistency. It uses fictional data, local files, Git and Node.js; the runner makes no network call, signs nothing and transfers no funds.

This is a **maintainer-operated synthetic evaluation**, not an observed HumanMirror run, external adoption, second real task, commercial integration or incremental-value result. [#47's STOP on additional admission/adapter expansion](https://github.com/suirindo/agent-role-contracts/issues/47) remains in effect. No ARC runtime, API or schema extension is needed.

## Reproduce

Requires Git and Node.js 22.5+. In a disposable directory:

```sh
# Record the source-only kit revision; it is separate from the checker pin.
git clone https://github.com/suirindo/agent-role-contracts.git arc-kit
git -C arc-kit rev-parse HEAD
git clone --depth 1 --branch v1.0.0 https://github.com/suirindo/agent-role-contracts.git arc-v1
node arc-kit/experiments/external-evaluation/humanmirror-synthetic/run-comparison.mjs \
  --arc-v1 arc-v1 > humanmirror-offline-result.json
```

The checker must be clean at `9f6771056c47de971202360952af6d41941f7625`. The helper also checks actual loaded source/schema bytes against that Git tree, rejecting edits hidden by index flags. Run only trusted checkouts on a trusted host: the helper is not a sandbox.

Expected wrapper exit: **0**, `verdict: EXPECTED_OFFLINE_RESULTS_REPRODUCED`. This means all ten command outcomes match expectations: **2 public recipient cases + 1 fictional-intent precondition + 7 separate receipt probes**, including expected rejection cases. It does not mean every CLI check passes. Exit 1 means an unexpected outcome; exit 2 means an input/reference/tool failure. Each bounded command records raw stdout, stderr, exit, parsed diagnostics and machine elapsed milliseconds. Receipts for probes are written to a private temporary directory and removed afterward. The runner never modifies the supplied reference checkout.

See [results/maintainer-offline.json](results/maintainer-offline.json) for the recorded run, input/source/runner SHA-256 hashes and environment. Record your kit commit separately when reporting a reproduction. Machine command time is not measured human setup, maintenance or time savings; those remain unmeasured.

## Exact mapping

[scenario.json](scenario.json) preserves the public four-case specification, including every original `NOT_RUN` observation. It is not ARC input. The [maintainer mapping reply](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6539932573) defines the bounded comparison.

| Public value | ARC declaration |
| --- | --- |
| `chain: eip155:8453` | `chain_id: "8453"` |
| `USDC`, six decimals, `amount_minor: 10000` | `amount_base_units: "10000"` = **0.010000 USDC** |
| Authorized recipient A | `0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
| Proposed recipient B | `0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` |
| Token symbol USDC | Fictional token `0xcccccccccccccccccccccccccccccccccccccccc` |
| Sender | Fictional `0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e` |

The token address is a fictional alias, not a deployed USDC contract. Nothing verifies chain state, balances, fees or address ownership.

[bundle.json](bundle.json), [task.json](task.json) and [policy.json](policy.json) are identical inputs in both cases. The fixed policy allows only A. [transaction-a.json](transaction-a.json) and [transaction-b.json](transaction-b.json) differ **only in `target`**, checked mechanically before execution. Both use the same amount, chain, token, sender and nonce.

| Public case | Expected ARC | Observed ARC CLI | HumanMirror observed |
| --- | --- | --- | --- |
| `valid-declaration` | PASS | exit 0, valid true | NOT_RUN |
| `recipient-mutation` | REJECT | exit 1, `FINANCE_RECIPIENT_NOT_ALLOWED` | NOT_RUN |
| `settled-missing-response` | NOT_APPLICABLE_TO_RECONCILIATION | NOT_RUN; no reconciliation implementation | NOT_RUN |
| `uncertain-settlement` | NOT_APPLICABLE_TO_RECONCILIATION | NOT_RUN; no reconciliation implementation | NOT_RUN |

The first two commands are `finance-subject`, checking proposed transaction declarations against the fixed policy. They neither execute a financial operation nor constitute complete live-payment approval. Cases 3–4 require separately evidenced mock settlement/reconciliation observations, which this fixture does not supply. `CONFIRMED_IN_MOCK` remains a scenario expectation, never an observed state here.

## Separate receipt-boundary probes

[intent-fictional.json](intent-fictional.json) and [receipt-fictional.json](receipt-fictional.json) are explicitly invented declaration data. Their subject digest was computed once with the pinned `finance-subject` command over the fixed bundle, task, policy and transaction A. That digest was copied into the fictional simulation, review, human-approval and receipt fields. These fields do not represent an actual simulator, reviewer, approving person or chain receipt. The helper first checks this intent with `finance` at `2030-01-01T00:00:03Z`; receipt checks use `finance-execution` at `2030-01-01T00:00:05Z`. Fixed future timestamps are test inputs, not observations of real events. The `fictional-intent-precondition` observation is exit 0, valid true.

| Probe | Expected and observed raw CLI outcome | Limited meaning |
| --- | --- | --- |
| `matching-fictional-receipt`: Matching fictional receipt | exit 0, valid true | Supplied declarations are consistent |
| `nonce-mismatch`: Nonce changed from `"7"` to `"8"` | exit 1, `FINANCE_EXECUTION_NONCE_MISMATCH` | Detects supplied nonce mismatch |
| `different-fictional-hash`: Fictional nonzero hash replaced by another | exit 0, valid true | **Does not authenticate the hash/receipt** |
| `same-receipt-revalidated`: Exact original receipt checked again | exit 0, valid true | **No replay ledger/idempotency is established** |
| `null-receipt`: JSON `null` receipt | exit 1, `SCHEMA_TYPE` | Rejects non-object receipt |
| `unknown-tool_response`: Extra `tool_response: "MISSING"` | exit 1, `SCHEMA_ADDITIONALPROPERTIES` | Unknown schema field; not delivery handling |
| `unknown-operation_id`: Extra `operation_id: "synthetic-op-001"` | exit 1, `SCHEMA_ADDITIONALPROPERTIES` | Unknown schema field; not reconciliation |

The runner embeds each probe's exact receipt input and hash in the report. `tool_response` and `operation_id` in the public scenario are metadata that cannot be copied into ARC's strict receipt schema with their semantics intact. Their rejection provides no implementation of missing-response handling or operation identity.

A receipt PASS does not establish authenticity, settlement, delivery, replay prevention, payment state, response loss or the counterparty's execution. A missing response gives no permission for another payment. The receipt probes are **not executions of public cases 3–4**, and no HumanMirror private source, API or runtime was invoked.

## Local helper checks

```sh
node --test arc-kit/experiments/external-evaluation/humanmirror-synthetic/verify.test.mjs
```

These checks cover a wrong reference revision, a hidden reference-source modification and a fixture mutation that changes more than the recipient. They use temporary local copies; they do not contact either project or start CI. All evaluation assets stay outside the published npm API/package file list.
