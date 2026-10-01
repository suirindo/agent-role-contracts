# Change a task, see the contract check

The three-minute demo uses an implementer allowed to write within `src/**` and a separate read-only reviewer. The same checker accepts `src/example.mjs`, rejects `secrets/production.txt`, and accepts the task again after its scope is repaired.

These are fictional declarations. The paths are labels in JSON; the checker does not open those files or enforce filesystem permissions.

## Run the demo

With Git and Node.js 22.5 or newer (including npm):

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
npm --prefix agent-role-contracts run demo --silent
```

If you already have the repository, run `npm run demo --silent` from its root. No dependencies need installing. The runner uses the bundled fixtures relative to its own file, so it also works when invoked by absolute path from a different working directory. It repairs the task in memory and leaves the fixtures unchanged.

## Check your own edit

From the repository root, copy `examples/starter-task.json` to `task.demo.json` using your editor or file manager. Keep the bundle unchanged so the declared write authority remains `src/**`.

Run the task through the CLI:

```sh
node bin/agent-role-contracts.mjs explain --bundle examples/starter-bundle.json --task task.demo.json --format text
```

Then edit `inputs.scope` in your copy and rerun that same command:

| Task scope | Expected result | Exit code |
| --- | --- | --- |
| `src/example.mjs` | PASS; separate implementer and reviewer | 0 |
| `README.md` | FAIL: `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` | 1 |
| `src/another.mjs` | PASS after correcting the task scope | 0 |

The standalone CLI exits 1 for the intentional invalid task. The automated demo exits 0 when that failure is detected as expected. Do not widen the role's authority just to make a mistaken task pass; correct the task to match the intended work.

You do not need to create `src/another.mjs`: checking a declaration does not check that a source file exists. Human approval is still required by the starter route, and a PASS does not authorize execution.

## Understand a result

The starter's [`allowed_write_scopes`](../examples/starter-bundle.json) declares `src/**`. The [task](../examples/starter-task.json) supplies `inputs.scope`. `explainTask` checks containment and the declared role relationships. The [public API](../src/index.mjs) and [schema profile](SCHEMA_PROFILE.md) explain those checks in more detail.

Prompt instructions alone do not provide a diagnostic when a task and its role's declared scope disagree. These JSON declarations let you make that disagreement a deterministic preflight check. The runtime handling the actual task must still enforce the declared boundaries, authenticate identities and obtain required approval.

## If something fails

| Symptom | Next action |
| --- | --- |
| `git` is not found | Install [Git](https://git-scm.com/downloads), then retry the clone. |
| `node` or `npm` is not found | Install [Node.js](https://nodejs.org/en/download) with npm. Run `node --version` and ensure it is 22.5 or newer. |
| Cloning fails | Check network access and whether the destination directory already exists. Use `npm --prefix agent-role-contracts run demo --silent` if it already contains this repository. |
| `DEMO_ERROR: Cannot read examples/...` | Restore the bundled fixture named in the message. Use a copy for your own edits. |
| `DEMO_ERROR` reports an unexpected check result | Restore the starter fixtures, rerun `npm run check`, and report the diagnostic if it still fails. |
| The CLI exits 2 | Check file paths, file encoding and options. Run `node bin/agent-role-contracts.mjs --help`. |

The demo uses only portable Node.js file reads and JSON checks. No Bash, Docker, provider credentials, account login, network calls or installation scripts are required for the demo itself.

## Next

- [Full three-role example](../README.md#full-three-role-example): coordination, conditional inputs and handoffs.
- [Architecture and extraction boundary](COMPATIBILITY.md): which concepts the public package retains.
- [Contributing](../CONTRIBUTING.md): submit a focused contract or diagnostic improvement.
- [Issues](https://github.com/suirindo/agent-role-contracts/issues): report a reproducible problem, including Node.js version and the diagnostic; omit credentials and customer data.
