# Bind a handoff to the intended task

A handoff for one task can look plausible when attached to another. This exercise uses the public `validateHandoff` API to catch a different task ID and objective, then repairs those two bindings in memory.

## Run the example

After the [consumer dependency is installed](API-EXAMPLE.md#run-the-wrapper), run from `experiments/adoption/consumer`:

```sh
node scripts/handoff-example.mjs
```

The [script](consumer/scripts/handoff-example.mjs) reads `team.json`, `task.json`, `code-task.json`, and `handoff.json` from the **installed 1.0.0 package's bundled examples**. It does not read source-main fixtures, alter your `.arc` declarations, write files, or perform the fictional work.

| Step in the JSON output | Bound task | Expected report |
| --- | --- | --- |
| `original-task` | Documentation task `example-task-001` | `valid: true` |
| `different-task` | Code task `example-task-002`, with the original handoff unchanged | `valid: false` with both binding errors below |
| `repaired-binding` | Code task `example-task-002`, with handoff ID and objective aligned in memory | `valid: true` |

The middle step must report exactly:

| Code | Path | Meaning |
| --- | --- | --- |
| `HANDOFF_TASK_MISMATCH` | `handoff/task_id` | The handoff names the other task |
| `HANDOFF_OBJECTIVE_MISMATCH` | `handoff/objective` | The handoff's objective differs from the bound task |

The overall script exits **0 when all three expected outcomes occur**. The deliberate middle rejection does not make this tutorial fail. It exits **2** with `HANDOFF_EXAMPLE_ERROR` on missing prerequisites or an unexpected result. Full API reports are included under `steps[].report`.

## Apply the check to a real handoff

Use the authoritative task and its reviewed bundle when calling:

```js
import { validateHandoff } from '@netsujo/agent-role-contracts/core';

const report = validateHandoff(bundleJsonText, taskJsonText, handoffJsonText);
```

On a mismatch, first determine which task the work and evidence actually belong to. Correct a mistaken association through the existing review process; changing two strings does not prove that work was completed for the new task.

The exercise's evidence remains explicitly fictional, including after repair. The checker does not read the files named by that evidence, rerun tests, establish reviewer identity, or verify completion. `evidence_verified`, `identity_verified`, `execution_authorized`, and `runtime_enforcement` remain false. Use actual evidence and an actual independent review before acting on a real handoff.

Return to the [adoption guide](README.md), or try the [declared-review exercise](DECLARED-REVIEW.md).
