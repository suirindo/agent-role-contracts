# Use the public API from a consumer

Use the installed `@netsujo/agent-role-contracts@1.0.0` dependency to check declarations from your own Node.js program. The runnable [API example](consumer/scripts/api-example.mjs) imports the public `/core` entry point, reads two JSON files, and prints complete reports. It does not launch an agent, run a task, or write files.

## Run the wrapper

From a repository checkout, prepare the pinned consumer once, then run it:

```sh
cd experiments/adoption/consumer
npm ci --ignore-scripts --include=dev --no-audit --no-fund
node scripts/api-example.mjs
```

The defaults are `.arc/bundle.json` and `.arc/task.json`. Supply two paths to check other declaration files; paths are relative to your current directory:

```sh
node scripts/api-example.mjs .arc/bundle.json .arc/task-outside-scope.json
```

The second command intentionally exits 1 with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` at `task/inputs/scope` inside `task.errors`. The wrapper does not install anything when it runs.

## The API boundary

The essential calls are:

```js
import { validateBundle, explainTask } from '@netsujo/agent-role-contracts/core';

const bundleReport = validateBundle(bundleJsonText);
const taskReport = bundleReport.valid
  ? explainTask(bundleJsonText, taskJsonText)
  : null;
```

Pass JSON **text**, not parsed objects. The runnable wrapper supplies the file reads and checks the installed version. Inputs must be regular files, at most 1 MiB each. The public API returns reports; the consumer decides how to present them and how to return an exit status.

| Wrapper result | Exit | Output |
| --- | --- | --- |
| Both declarations are valid | 0 | JSON on stdout with `valid: true`, full `bundle` and `task` reports |
| A declaration or its JSON is invalid | 1 | JSON on stdout with `valid: false` and diagnostic code, path, and message |
| Missing dependency, wrong version, bad arguments, unreadable or unsupported input file | 2 | JSON on stderr with `API_EXAMPLE_ERROR` and a message |

If the bundle is invalid, `task` is `null`: task checking has not proceeded against an invalid policy. If the task is invalid, its complete report remains available. Keep the diagnostic path alongside the code so a caller can locate the failed declaration.

Every returned report keeps `execution_authorized` and `runtime_enforcement` false. A valid report does not establish that a source file exists, an independent reviewer acted, evidence is true, or approval was granted. Integrate the result into your existing review process without treating it as execution permission.

For structured task transfer, continue with the [handoff exercise](HANDOFF.md). To test declared reviewer separation, use the [declared-review exercise](DECLARED-REVIEW.md).
