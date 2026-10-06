# Repeatable failure cases

These examples are designed to make Agent Role Contracts easy to evaluate against concrete contradictions instead of broad safety claims.

They are reproducible declaration checks using the repository's existing demos and fixtures. They are not production incident reports, runtime authorization tests, or evidence that an agent was actually constrained at execution time.

## Five failures in one view

| Before | ARC check | Repair |
| --- | --- | --- |
| Task requests `secrets/production.txt` while authority is `src/**` | `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` | Correct the task scope or intentionally revise policy; do not widen authority just to make the task pass |
| Implementation and review route through the same declared role | Invalid self-review fixture is rejected | Route review through a separate declared reviewer role |
| Task/action changes after review or approval | `G1_SUBJECT_MISMATCH` | Bind review and approval to the current subject and review it again |
| Filesystem path or content identity changes after mapping | G2 mapping mismatch is rejected | Rebuild the mapping for the current declared action |
| Lifecycle or artifact declarations become stale or conflict | G3 lifecycle check rejects the inconsistency | Regenerate lifecycle declarations against the current subject and artifact identity |

The useful pattern is **PASS → meaningful contradiction → deterministic FAIL → repair → PASS**. That is the shortest way to decide whether a check belongs in a real workflow.

## 1. Task scope exceeds declared write authority

Start with the three-minute demo:

```sh
npm run demo --silent
```

The demo first accepts a task inside `src/**`, then checks an intentionally out-of-scope task and reports:

```text
TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY
```

It then repairs the task declaration in memory and returns to PASS.

Use this case when evaluating whether a task can drift beyond the executor's declared write scope without being noticed.

## 2. Implementer and reviewer collapse into one declared role

Run:

```sh
node bin/agent-role-contracts.mjs validate \
  --bundle examples/invalid-self-review.json
```

The intentionally invalid fixture must be rejected.

Use this case when a workflow claims review separation but its declarations route implementation and review through the same role.

## 3. Review or approval is stale after the subject changes

Run:

```sh
npm run demo:binding
```

The G1 demo binds review and required approval declarations to the current task/action subject, then mutates meaningful input. The unchanged binding is rejected with `G1_SUBJECT_MISMATCH`.

Use this case when a reviewed task, action, or policy can change after review while an older approval still exists.

## 4. Filesystem-write mapping no longer matches the declared action

Run:

```sh
npm run demo:filesystem-adapter
```

The G2 demo checks the narrow `filesystem-write` mapping and exercises mismatches in declared path or content identity.

Use this case when an integration needs to prove that its declared filesystem action and the mapping presented to a downstream guard still describe the same write.

A mapping PASS remains a declaration-consistency result. The adapter does not write files or grant filesystem permission.

## 5. Lifecycle declarations become stale or conflict on artifact identity

Run:

```sh
npm run demo:lifecycle
```

The G3 demo exercises lifecycle consistency against the bound subject, including stale-subject and conflicting-artifact cases.

Use this case when a workflow records handoff or lifecycle evidence and needs stale declarations to fail closed after the subject or declared artifact identity changes.

Lifecycle PASS does not authenticate events, verify artifact bytes, establish replay protection, or prove runtime acceptance.

## Turn one example into a real-workflow evaluation

For a real evaluation:

1. choose one narrow, recurring workflow;
2. replace only the minimum synthetic declarations needed to represent it;
3. reproduce one expected PASS;
4. introduce one meaningful contradiction and require a deterministic rejection;
5. restore the intended declaration and require PASS again;
6. record separately what your IAM, runtime, CI, sandbox, or API boundary actually enforces.

Do not add production authority just to evaluate this package.

If you test one of these cases in your own workflow, open a workflow-feedback issue and report what helped, what was missing, and whether you would use the check on a second task:

https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml
