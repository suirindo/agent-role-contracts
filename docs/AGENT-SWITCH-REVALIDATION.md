# What to re-check when a coding task switches agents

A coding task moves to another agent because of a usage limit, a timeout, a crash or a deliberate handoff. This page answers
[discussion #96](https://github.com/suirindo/agent-role-contracts/issues/96) with the **stable 1.x public API only**: which
declaration checks to run again at that moment, which diagnostic each produces, and what no declaration check can establish.
Every claim below is pinned by `tests/agent-switch-revalidation.test.mjs` against the bundled fictional fixtures.

ARC's boundary does not move for a switch. A declaration PASS does not authenticate the successor, transfer runtime permission,
prove that a review occurred, or authorize execution or a retry. Every report keeps `identity_verified`, `runtime_enforcement`,
`evidence_verified` and `execution_authorized` at `false`.

## The five triggers

| Trigger | Re-run | Diagnostic when the switch broke something | Stays UNKNOWN (host responsibility) |
| --- | --- | --- | --- |
| **Same task, different executor instance** (another runtime resumes the same declared role) | `explain --bundle B --task T` | None: the route and scope are re-established, nothing else. A switch inside one role is **not** a handoff; modelling it as one is rejected with `HANDOFF_SELF`. | Who now holds the role, with which current permissions. ARC has no executor identity. |
| **Another declared role takes over** | `handoff --bundle B --task T --handoff H` | `HANDOFF_ROLE_OUTSIDE_ROUTE` (label not in the route), `HANDOFF_RELATION_UNDECLARED` (no delegation/reporting edge in that direction), `HANDOFF_REVIEW_ROUTE` (review not executor → reviewer) | Whether the successor is independent of the predecessor in the execution environment. |
| **Scope changed by or for the successor** | `explain` with the current task against the **unchanged** bundle | `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`, `TASK_WRITE_SCOPE_INVALID` | Whether the runtime actually restricts writes to the declared scope. |
| **Review or approval existed before the change** | `action-subject` then `action-bind` (and `lifecycle` where used) | `G1_SUBJECT_MISMATCH`, `G3_SUBJECT_MISMATCH`: any meaningful change to bundle, task or action invalidates the earlier binding; fresh review/approval must bind the new digest | Whether the fresh review and approval were really performed by the declared roles. |
| **Previous outcome uncertain** ("unknown whether the action completed") | `handoff` with `current_status: blocked` and an `unresolved` item that states the unknown | Accepted as consistent; `complete` with that item is `HANDOFF_COMPLETE_UNRESOLVED`; `blocked` without it is `HANDOFF_BLOCKER_MISSING` | Whether the action completed, and whether a retry is safe. A consistent `blocked` handoff is a record, not permission to retry. |

Evidence carried across the switch is declaration data: `evidence_verified` and `source_files_checked` stay `false`, and the
checker opens no file and runs no command named in `handoff.evidence`.

## Minimal sequence at the switch

```sh
# 1. The predecessor (or the operator on its behalf) records the stop; this is also the stop gate's input.
node bin/agent-role-contracts.mjs handoff --bundle .arc/bundle.json --task .arc/task.json --handoff .arc/handoff.json --format text
# 2. The successor re-establishes route and scope for the task it is about to touch.
node bin/agent-role-contracts.mjs explain --bundle .arc/bundle.json --task .arc/task.json --format text
# 3. If anything in bundle/task/action changed, old review/approval bindings are stale by construction; recompute and re-bind.
node bin/agent-role-contracts.mjs action-subject --bundle .arc/bundle.json --task .arc/task.json --action action.json
node bin/agent-role-contracts.mjs action-bind --bundle .arc/bundle.json --task .arc/task.json --action action.json --binding binding.json
```

What the host records separately, in its own words and systems: the successor's authenticated identity and current effective
permissions; the predecessor's last confirmed effect; whether an operation with unknown outcome may be retried, and on what
evidence. ARC does not fill those cells.

## One redacted example in the #96 format

`Trigger | what was preserved | what was rechecked | what remained unknown`

`Usage limit during implementation | task.json unchanged, handoff.json with status blocked and one UNKNOWN item (whether the last file write was saved) | explain PASS on the same task; handoff PASS (implementer → coordinator); old G1 binding rejected after the objective was amended, re-bound after fresh approval | whether the write landed; the successor runtime's actual permissions; who the successor is`

## Make the record unavoidable

The weak point is the moment of stopping: an agent that ends with "could not finish" leaves nothing to re-check. The
[stop gate](../experiments/stop-gate/README.md) (source-only experiment) makes a passing handoff the only allowed end state, with
every acceptance criterion accounted for and every unknown written down, so the sequence above always has an input.
