# Catch a declared executor reviewing its own work

This exercise changes a valid task route in memory so the executor is also its reviewer. The public checker rejects the route, then accepts it again when the original reviewer is restored. It tests declared role separation; it cannot establish who controls the roles or whether a review happened.

## Run the example

After the [consumer dependency is installed](API-EXAMPLE.md#run-the-wrapper), run from `experiments/adoption/consumer`:

```sh
node scripts/review-example.mjs
```

The [script](consumer/scripts/review-example.mjs) reads `starter-bundle.json` and `starter-task.json` from the **installed 1.0.0 package**. It checks a valid route, changes its reviewer to the executor, and restores the original reviewer list. It does not load an existing invalid fixture or edit your bundle.

| Step in the JSON output | Declared reviewer | Expected report |
| --- | --- | --- |
| `separate-declared-reviewer` | `reviewer` | `valid: true` |
| `same-role-reviewer` | `implementer` | `valid: false` |
| `restored-declared-reviewer` | `reviewer` | `valid: true` |

The middle step must contain exactly these two diagnostics at `bundle/routes/0`:

| Code | Why this fixture triggers it |
| --- | --- |
| `SELF_REVIEW_DECLARED` | `implementer` appears as both executor and reviewer |
| `REVIEWER_NOT_READ_ONLY` | The same implementer declares write authority, while a reviewer must be read-only |

The script exits **0 when PASS → expected rejection → PASS all occur**. It exits **2** with `REVIEW_EXAMPLE_ERROR` on a missing prerequisite or an unexpected result. JSON includes the complete report and reviewer list for each step. No agent starts, no task runs, and no file changes.

## Use the result in your workflow

For your own declarations, [call `explainTask`](API-EXAMPLE.md) against the reviewed bundle and current task. If it reports self-review, restore an independently assigned reviewer through your existing role and authority review. Do not merely rename the executor to make a declared route pass.

Distinct role IDs are necessary for this declaration check, but they do not prove distinct people, agents, sessions, credentials, or independent context. `identity_verified`, `execution_authorized`, and `runtime_enforcement` stay false. Record who actually reviewed the work and the evidence they examined through your normal process.

Continue with the [handoff exercise](HANDOFF.md) to check that a transfer refers to the intended task, or return to the [adoption guide](README.md).
