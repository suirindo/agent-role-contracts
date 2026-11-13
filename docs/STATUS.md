# Evaluation status: counters and gates in one place

This is the **single table** for the counters and decision gates that were previously restated at the end of many #47 and #37
comments. Change a row by pull request; an issue comment links here instead of repeating the numbers. Every row carries the
date it was last confirmed and the source it was read from. A value is quoted from its source, never recomputed here.
`tests/status-table.test.mjs` rejects a row without a date or a source link.

Vocabulary: `0` means counted and none found. `UNPROVEN` means claimed or intended but not shown with evidence. `UNMEASURED`
means nobody measured it; it is not zero. `SELF_REPORTED` means the reporter ran it and nobody else reproduced it.

## Counters

| Counter | Value | As of | Source |
| --- | --- | --- | --- |
| External real-workflow reports | 2 report-level: Burs-IA WORKNET (#45) and newworldba's one-file runbook task (#37). Both `SELF_REPORTED`; newworldba's declarations were maintainer-reproduced. Later external input is not counted here: #37 has a synthetic-workflow checklist and a counterpart problem report with no ARC run; #121 is synthetic-task feedback. | 2026-11-12 | [#45](https://github.com/suirindo/agent-role-contracts/issues/45), [#37](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6733208173), [#121](https://github.com/suirindo/agent-role-contracts/issues/121) |
| Independently verified external adoption | 0 (no later #47 or #37 comment records one) | 2026-11-12 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185) |
| External second real task, executed | `UNPROVEN` (reuse intent stated once, no second task shown; the maintainer asked on 2026-11-09 and no reply is recorded) | 2026-11-12 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185), [#37](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6733208173) |
| Natural incremental contradictions caught by ARC beyond existing controls | 0 in the recorded internal comparison (no later comparison recorded) | 2026-11-12 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185) |
| Human time saved | `UNMEASURED` | 2026-11-12 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Problem interviews (private respondents) | 2 (one conditional interest, one skeptical; no later synthesis recorded) | 2026-11-12 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6408133592) |
| Counterpart comparisons in progress | MartinLoop: invited, not run. HumanMirror: ARC side merged (#101), counterpart side 4 × `NOT_RUN` / setup blocked, no further run requested. ShipRules: fixture published, counterpart run pending (#75). ACS Guardian T4/T8: ARC 1.0.1 column published as a maintainer run (PR #116); the counterpart's reference suite was replayed by the maintainer, and the follow-on #117 pilot is `JOINT_NOT_FROZEN`. AAE profile for A2A: the counterpart's official cross-run checker was run once by the maintainer against a locally authored offline receiver report (24 pass); remote interoperability and independent QC not performed (#105). | 2026-11-12 | [#37](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6702979556), [#75](https://github.com/suirindo/agent-role-contracts/issues/75), [#115](https://github.com/suirindo/agent-role-contracts/issues/115), [#117](https://github.com/suirindo/agent-role-contracts/issues/117#issuecomment-6702954299), [#105](https://github.com/suirindo/agent-role-contracts/issues/105#issuecomment-6674923035) |
| Runtime enforcement by ARC | Not claimed. Native acceptance `UNKNOWN`. | 2026-10-29 | [#85](https://github.com/suirindo/agent-role-contracts/issues/85), [#69](https://github.com/suirindo/agent-role-contracts/issues/69) |

## Gates and decisions

| Gate | State | As of | Source |
| --- | --- | --- | --- |
| Stage A: stop feature churn, freeze v1.0.0 | Met (PRs #62, #63, #64 merged) | 2026-10-23 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Readiness targets: 5 interviews, 2 independent hands-on evaluations, 1 real-workflow candidate | Activity targets, not traction. Recorded: 2 interviews, 0 independently reproduced external hands-on evaluations, 1 internal candidate. Unchanged at the readback before the decision date. | 2026-11-12 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Product decision: continue selectively / narrow scope / pause adapter expansion | **Narrow scope.** v1.0.x maintenance-only; expansion stays paused; only T4 (#117) and one human-measured external second task continue. Re-evaluate 2026-12-11, or earlier on a T4 freeze or an external second-task report | 2026-11-13 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6840445357) |
| Feature and adapter expansion | Paused; confirmed by the narrow-scope decision | 2026-11-13 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6840445357) |
| Distributed npm 1.0.0 README lags source | Resolved by `1.0.1`: it is npm `latest` and its packed README was read back; #53 closed as completed. The `1.0.0` tarball is immutable and keeps its README. A README change merged after a release ships with the next release. | 2026-11-12 | [#53](https://github.com/suirindo/agent-role-contracts/issues/53#issuecomment-6681144355) |
| Joint ERP pilot for T4 tool-definition drift (C0–C3) | Not run. Test Contract V0.3.4 (`1c2d5906`) is a final freeze candidate: `NOT_FROZEN`, `LAB_NOT_AUTHORIZED`, `ERP_NOT_RUN`. Rights & Permissions V0.1 is `NON_OPERATIVE`. ARC-side Annex D inputs are kept byte-exact in `experiments/external-evaluation/t4-f1-inputs/` | 2026-11-13 | [#117](https://github.com/suirindo/agent-role-contracts/issues/117) |
| Track C behavioural-fidelity research | No date; gated on an accepted real Controller task | 2026-10-28 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |

## How to update

Change the value, set **As of** to the date you confirmed it, and link the comment or run you read it from. Do not raise a
counter from a synthetic demo, an internal run, a merge, a listing or an intention. Those go in the source issue, not here.
