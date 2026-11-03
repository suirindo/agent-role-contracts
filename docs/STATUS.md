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
| External real-workflow reports | 2 report-level: Burs-IA WORKNET (#45) and newworldba's one-file runbook task (#37). Both `SELF_REPORTED`; newworldba's declarations were maintainer-reproduced. | 2026-10-26 | [#45](https://github.com/suirindo/agent-role-contracts/issues/45), [#37](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6421075369) |
| Independently verified external adoption | 0 | 2026-10-27 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185) |
| External second real task, executed | `UNPROVEN` (reuse intent stated once, no second task shown) | 2026-10-27 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185) |
| Natural incremental contradictions caught by ARC beyond existing controls | 0 in the recorded internal comparison | 2026-10-27 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185) |
| Human time saved | `UNMEASURED` | 2026-10-27 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Problem interviews (private respondents) | 2 (one conditional interest, one skeptical) | 2026-10-26 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6408133592) |
| Counterpart comparisons in progress | MartinLoop: invited, not run. HumanMirror: ARC side merged (#101), counterpart side 4 cases not run. ShipRules: fixture published, counterpart run pending (#75). | 2026-11-01 | [#37](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6566996589), [#75](https://github.com/suirindo/agent-role-contracts/issues/75) |
| Runtime enforcement by ARC | Not claimed. Native acceptance `UNKNOWN`. | 2026-10-29 | [#85](https://github.com/suirindo/agent-role-contracts/issues/85), [#69](https://github.com/suirindo/agent-role-contracts/issues/69) |

## Gates and decisions

| Gate | State | As of | Source |
| --- | --- | --- | --- |
| Stage A: stop feature churn, freeze v1.0.0 | Met (PRs #62, #63, #64 merged) | 2026-10-23 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Readiness targets: 5 interviews, 2 independent hands-on evaluations, 1 real-workflow candidate | Activity targets, not traction. Recorded: 2 interviews, 0 independently reproduced external hands-on evaluations, 1 internal candidate. | 2026-11-03 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Product decision: continue selectively / narrow scope / pause adapter expansion | Open; the date does not move for an incomplete sample | 2026-11-13 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Feature and adapter expansion | Paused | 2026-10-28 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |
| Distributed npm 1.0.0 README lags source | Open until the next authorized release and registry readback | 2026-10-21 | [#53](https://github.com/suirindo/agent-role-contracts/issues/53) |
| Track C behavioural-fidelity research | No date; gated on an accepted real Controller task | 2026-10-28 | [#47](https://github.com/suirindo/agent-role-contracts/issues/47) |

## How to update

Change the value, set **As of** to the date you confirmed it, and link the comment or run you read it from. Do not raise a
counter from a synthetic demo, an internal run, a merge, a listing or an intention. Those go in the source issue, not here.
