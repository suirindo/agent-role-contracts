# Write the first task for your repository

Start after the [standalone consumer check](README.md#1-try-a-standalone-consumer) works. Choose a real code change under `src/` that fits your current authority and needs an independent reviewer. If your work needs different paths or roles, use the repository's existing authority review; this exercise keeps `.arc/bundle.json` unchanged.

## Describe the work before running it

In the consumer root, create a new `.arc/task-first.json` with your editor; choose another filename if it already exists. Use this worked example as a starting point, replacing its ID, objective, path, and criteria with your actual task:

```json
{
  "schema_version": "0.1",
  "id": "greeting-fallback-1",
  "type": "code-change",
  "objective": "Update the fallback greeting in src/greeting.mjs.",
  "inputs": { "scope": "src/greeting.mjs" },
  "acceptance_criteria": [
    "The greeting handles an unnamed user without throwing.",
    "The existing greeting tests pass.",
    "An independent reviewer checks the change."
  ]
}
```

| Field | What to supply |
| --- | --- |
| `id` | A distinct identifier you can relate to this task and its review |
| `type` | Keep `code-change`: it selects the route already declared in the unchanged bundle |
| `objective` | The requested outcome in your own words |
| `inputs.scope` | One accurate, repository-relative path or subtree inside the approved `src/**`; compare it with the actual change yourself |
| `acceptance_criteria` | Observable checks for the outcome and required review; text here does not run those checks |

Keep `schema_version` at `0.1`. You do not need to create the example source file to check this declaration. A PASS cannot establish that the file exists, tests passed, approval happened, or the work was performed.

## Check, reject, and repair the declaration

Run from the consumer root, substituting your filename if needed:

```sh
npx --no-install agent-role-contracts explain --bundle .arc/bundle.json --task .arc/task-first.json --format text
```

1. With the accurate scope under `src/`, expect PASS and exit 0. If not, use the [diagnostic index](README.md#find-the-failed-input-before-changing-authority).
2. Save your intended scope, then temporarily change only `inputs.scope` to `secrets/private.json`. Rerun: expect exit 1 with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` at `task/inputs/scope`. This deliberate edit is a check of the boundary, not a new work request.
3. Restore the accurate scope and rerun: expect PASS and exit 0. Review your diff and confirm `.arc/bundle.json` did not change. Do not widen authority to repair the intentional failure.

The existing `npm run arc:check`, hook, and CI examples read `.arc/task.json`; creating `.arc/task-first.json` does not switch them to your new task. When adopting an entry point, review its configuration and align it with the intended task file. Preserve existing declarations and check the exact filename in the command or script.

You now have a checked task declaration, not completed work. Obtain the existing required approval, perform and review the task through your normal controls, then record actual results. Reuse on a second genuine task is a separate step in the [workflow evaluation kit](../external-evaluation/README.md); the three checks above are not three tasks or adoption evidence.
