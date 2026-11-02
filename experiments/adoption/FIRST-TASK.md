# Write the first task for your repository

English | [日本語](FIRST-TASK.ja.md)

For PowerShell commands below, use `npx.cmd` and inspect `$LASTEXITCODE` immediately afterward. POSIX shells use `npx` and `echo $?`. No line-continuation changes are needed.

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
| `inputs.scope` | One accurate, repository-relative path or subtree inside the approved `src/**`; compare it with the actual change yourself. See [how to write the scope value](#write-the-scope-value) |
| `acceptance_criteria` | Observable checks for the outcome and required review; text here does not run those checks |

Keep `schema_version` at `0.1`. You do not need to create the example source file to check this declaration. A PASS cannot establish that the file exists, tests passed, approval happened, or the work was performed.

## Write the scope value

In published 1.0.0, `inputs.scope` is **one string**: either one file path such as `src/greeting.mjs`, or one directory subtree ending in `/**`, such as `src/greeting/**`. Use forward slashes, with no leading `./` or `/`. No other wildcard is supported. A scope for the whole repository (`**`) is not supported.

Each value below fails with exit 1 at `task/inputs/scope` against the unchanged starter bundle (`src/**`). The installed checker gives the same message for every `TASK_WRITE_SCOPE_INVALID` value, so use this table to find the cause:

| Value you might write | Published 1.0.0 result | Write instead |
| --- | --- | --- |
| `./src/greeting.mjs` | `TASK_WRITE_SCOPE_INVALID` | `src/greeting.mjs`, without the leading `./` |
| `src/` | `TASK_WRITE_SCOPE_INVALID` | `src/**` for the subtree, or the exact file you will change |
| `src\greeting.mjs` | `TASK_WRITE_SCOPE_INVALID` | `src/greeting.mjs`, with forward slashes on every OS, including Windows |
| `src/**/*.mjs` | `TASK_WRITE_SCOPE_INVALID` | A directory subtree such as `src/greeting/**`; only a final `/**` is supported |
| `src/greeting.mjs,src/farewell.mjs` | `TASK_WRITE_SCOPE_INVALID` | The smallest subtree containing both files, or one task per file |
| `["src/greeting.mjs", "tests/greeting.test.mjs"]` | `SCHEMA_TYPE` | One string; see [several paths](#when-one-change-touches-several-paths) |
| `**` | `TASK_WRITE_SCOPE_INVALID` | A named subtree inside the authority, such as `src/**` |
| `tests/greeting.test.mjs` | `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` | The syntax is valid, but the starter authority is only `src/**`; see [several paths](#when-one-change-touches-several-paths) |

Paths with a segment that starts with `.`, such as `.github/` or `src/.env`, follow the [installed-versus-source compatibility table](README.md#scope-compatibility-installed-100-and-source-main). Do not rename a scope to hide a path you will actually change.

### When one change touches several paths

- **All paths are under one directory inside the authority.** Use that directory's subtree, such as `src/greeting/**` or, in a monorepo, `packages/app/**`. A subtree declares more than the files you change, so still compare the real diff with the task.
- **Paths are in different top-level directories, such as `src/` and `tests/`.** In 1.0.0, one task cannot declare both, and the starter authorizes only `src/**`. Declare one task per directory, and check each task. A task outside `src/**` passes only after the authority owner approves a bundle change through the existing review, for example adding `tests/**`. If that split does not match how you work, keep your existing review controls and record the limitation instead.

Do not widen authority or choose a scope that covers only part of the change to get a PASS. A PASS for one part of a change says nothing about the rest.

## Check, reject, and repair the declaration

Run from the consumer root, substituting your filename if needed:

```sh
npx --no-install agent-role-contracts explain --bundle .arc/bundle.json --task .arc/task-first.json --format text
```

1. With the accurate scope under `src/`, expect PASS and exit 0. If not, check [the scope value](#write-the-scope-value), then the [diagnostic index](README.md#find-the-failed-input-before-changing-authority).
2. Save your intended scope, then temporarily change only `inputs.scope` to `secrets/private.json`. Rerun: expect exit 1 with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` at `task/inputs/scope`. This deliberate edit is a check of the boundary, not a new work request.
3. Restore the accurate scope and rerun: expect PASS and exit 0. Review your diff and confirm `.arc/bundle.json` did not change. Do not widen authority to repair the intentional failure.

The existing `npm run arc:check`, hook, and CI examples read `.arc/task.json`; creating `.arc/task-first.json` does not switch them to your new task. When adopting an entry point, review its configuration and align it with the intended task file. Preserve existing declarations and check the exact filename in the command or script.

You now have a checked task declaration, not completed work. Obtain the existing required approval, perform and review the task through your normal controls, then record actual results. Reuse on a second genuine task is a separate step in the [workflow evaluation kit](../external-evaluation/README.md); the three checks above are not three tasks or adoption evidence.
