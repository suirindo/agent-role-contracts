# ARC × ACS Guardian T4/T8 — observed ARC declaration column

**Observed — maintainer-run, synthetic, 2026-11-04.** This fixture executes the **published** `@netsujo/agent-role-contracts@1.0.1` CLI for the ARC declaration-time column of the [ACS Guardian and independent-ledger comparison](https://github.com/Noctis-dev1/acs-conformance/blob/53a61a1aea173372a998f1e1038c323e2fa4100b/COMPARISON.md). An ARC PASS **never grants runtime execution authority**, authenticates a Guardian or validates ledger events.

## ARC column: measured

| Upstream row | ARC (declaration time), observed | Case IDs in [observed-result.json](observed-result.json) |
| --- | --- | --- |
| Declared change, in the bundle, task or action | **REJECT** — `G1_SUBJECT_MISMATCH` with the **prior** binding, measured for all three kinds of declaration changes | `t4-declared-bundle`, `t4-declared-task`, `t4-declared-action` |
| Underlying change, the tool or MCP definition changes while the declaration is unchanged | **G1 PASS — EXPECTED_MISS**; bundle/task/action bytes and subject digest unchanged; **`execution_authorized: false`** | `t4-underlying-definition-only` |
| Partial fulfilment (20 of 40 confirmed), then a fill after the key closes | **N/A for runtime reconciliation.** G3 checks lifecycle *declarations* only; a fictional lifecycle passes, actual effects and quantities are not reconciled | `t8-g3-lifecycle-declared`, `t8-runtime-reconciliation` (not run) |

`t4-baseline-binding` verifies the original binding. The three observed G1 rejections are **expected negative results**, not failures of the demonstration. The T4 underlying-change PASS is an **expected blind spot** in what G1 hashes.

## Reproduce from published ARC 1.0.1

Requires Node.js 22.5+, npm and trusted `tar`. Run in the ARC source checkout:

```sh
npm pack @netsujo/agent-role-contracts@1.0.1
node experiments/external-evaluation/acs-conformance/arc-column.mjs \
  --tarball ./netsujo-agent-role-contracts-1.0.1.tgz \
  > arc-column-result.json
```

The separate `npm pack` step uses the public registry. **The runner itself makes no network request**, invokes no real tool/agent, and uses no real financial or external effect. It checks the SHA-512 integrity before executing the package's CLI, extracts the verified tarball into a new private temporary directory, and removes that directory on exit or error.

Pinned npm registry integrity: `sha512-4FSVVjOuNlvT+dBNsEkEZ5ILUfxmhoOdWWMDlCIbYGtZss9mVICT4Yuos5iS2fkJHh1OnAYs1F4PUZpc9NEdCQ==`.

Expected overall verdict: **`EXPECTED_ARC_COLUMN_REPRODUCED`** (wrapper exit 0). Compare the output with committed [observed-result.json](observed-result.json), ignoring only the `volatile: ["environment"]` member. The runner's self-SHA-256, package digest, case IDs and results remain exact. This binds measurements to **published tarball bytes**, not merely source from `main`.

| Wrapper state | Exit and output | Meaning |
| --- | --- | --- |
| `--help` | 0, usage line on stdout | No checks performed |
| All expected results observed | 0, JSON `EXPECTED_ARC_COLUMN_REPRODUCED` | Includes correct negative G1 rejections |
| Any unexpected result | 1, JSON `UNEXPECTED_RESULT` | Locate `match: false` |
| Invalid input, tarball or CLI result | 2, `ACS_ARC_COLUMN_ERROR:` on stderr | No verified outcome; stdout empty |

## Method and individual measured cases

The runner takes fictional bundle/task inputs from the **published package's** shipped examples, defines one fictional action, builds an original binding from G1's actual subject digest, then invokes the package CLI via `action-subject`, `action-bind` and `lifecycle` with `--format json`. It retains the original review/approval *declarations* for every T4 mutation; it does not issue a refreshed approval or authenticate any reviewer.

| Case ID | What changes | Expected | Observed exit / valid / diagnostic | Reading |
| --- | --- | --- | --- | --- |
| `t4-baseline-binding` | None; valid fictional binding | PASS | 0 / true / none | `PRECONDITION` |
| `t4-declared-bundle` | Bundle policy version | REJECT / G1_SUBJECT_MISMATCH | 1 / false / `G1_SUBJECT_MISMATCH` | `DETECTED` |
| `t4-declared-task` | Task objective | REJECT / G1_SUBJECT_MISMATCH | 1 / false / `G1_SUBJECT_MISMATCH` | `DETECTED` |
| `t4-declared-action` | Action target parameter | REJECT / G1_SUBJECT_MISMATCH | 1 / false / `G1_SUBJECT_MISMATCH` | `DETECTED` |
| `t4-underlying-definition-only` | Fictional MCP definition only; declarations unchanged | G1 PASS / EXPECTED_MISS | 0 / true / none; same G1 digest | `EXPECTED_MISS` |
| `t8-g3-lifecycle-declared` | Fictional review, approval and declared-success events | G3 declaration consistency PASS | 0 / true / none; runtime verifier fields false | `IN_SCOPE_CONSISTENT` |
| `t8-runtime-reconciliation` | Partial fill, later effect, actual balance | N/A / NOT_RUN | NOT_RUN / null / none | `NOT_APPLICABLE` |

The published CLI supplies actual `valid`, exit code, diagnostics and subject digest. For `t4-underlying-definition-only`, the **wrapper (not ARC)** computes hashes of the input declaration JSON before/after (identical) and hashes of the fictional external definition before/after (different). The actual prior binding still passes: G1's subject excludes that external definition. No real MCP server is invoked.

For `t8-g3-lifecycle-declared`, the wrapper checks `event_authenticity_verified: false`, `execution_verified: false`, `runtime_acceptance_verified: false`, `state_machine_enforced: false` and `replay_protection_enforced: false`. A fictional `declared_success` is a claim in a declaration, never a real execution receipt or quantity settlement.

## Three independent layers

| Layer | Question answered | Evidence owner | Run here? |
| --- | --- | --- | --- |
| ARC G1/G3 | Do the declarations and their bindings agree? | Published ARC 1.0.1 CLI, measured in this fixture | **Yes** |
| ACS Guardian | Does commitment-boundary enforcement catch drift and late effects? | [Upstream wire tests and verifier](https://github.com/Noctis-dev1/acs-conformance/blob/53a61a1aea173372a998f1e1038c323e2fa4100b/COMPARISON.md) | **NOT_RUN here** |
| Independent ledger | What external effects actually landed? | Upstream append-only ledger and verifier | **NOT_RUN here** |

Guardian T4a/T4b/T8 and ledger quantities are independently measured upstream. This ARC fixture asserts none of those values as its own observations. No layer validates or authorizes another.

| You see | It means | It does not mean |
| --- | --- | --- |
| G1 PASS | Supplied declaration subjects agree | Runtime authorization, unchanged tool definition, authenticated reviewer |
| `G1_SUBJECT_MISMATCH` | Previous binding correctly rejects changed declarations | Runtime call blocked |
| `EXPECTED_MISS` | Tool definition changed outside the subject hash | Change is safe |
| G3 PASS | Lifecycle declarations internally agree | Real events, authenticated approvals, reconciled quantities |
| N/A or NOT_RUN | No ARC runtime reconciliation was performed | No real-world failures |
| Wrapper exit 0 | All **seven expected** outcomes matched | Every individual ARC check passed |

**Limitations:** This is an offline, maintainer-run synthetic experiment. ARC grants no execution authority, authenticates no actor or approval, verifies no real artifact bytes or runtime effects, enforces no external state machine and provides no reconciliation of late or partial fulfilment. Independent reproduction has not yet been established.

## Handoff to upstream maintainer

The ARC column above can replace the “pending ARC fixture” annotations in [the upstream comparison @53a61a1](https://github.com/Noctis-dev1/acs-conformance/blob/53a61a1aea173372a998f1e1038c323e2fa4100b/COMPARISON.md) after linking the exact merged-`main` ARC permalink. A precise T8 wording is: **“G3 validates lifecycle declarations; reconciliation of actual partial fills and late-arriving effects is outside ARC's scope.”** Actual upstream integration, downstream rerun and any OWASP workstream discussion remain separate and require their own evidence.

**Provenance:** `MAINTAINER_RUN`, 2026-11-04. [Runner](arc-column.mjs) and [raw observations](observed-result.json) capture the script SHA-256, pinned release, environment, named cases and limits. Related ARC issues: [#115](https://github.com/suirindo/agent-role-contracts/issues/115), [#47](https://github.com/suirindo/agent-role-contracts/issues/47), [#69](https://github.com/suirindo/agent-role-contracts/issues/69). Only this non-distributed comparison's README, script and evidence are in scope; no core, schema, CLI, version, workflow, Guardian or ledger changes.
