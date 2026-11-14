# Unit tests pass; the ARC scope check still flags one path

[日本語](README.ja.md)

Unit tests pass for both patches. The ARC declaration check flags the one changed path that is outside the declared write authority.

Tests check whether the code runs. ARC checks whether a changed path you give it fits the declared write authority. In these two cases the two answers differ.

## Requirements

Git 2.32 or newer and **Node.js 22.5 or newer**. No `npm install`, account, API key or agent is needed. Only cloning uses the network; the demo runs offline.

Tested with Git 2.39.3 and Node.js 24.11.1. The Git minimum comes from the flags the demo uses and has not been run on older versions.

## Run it

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
node agent-role-contracts/experiments/git-diff-demo/run.mjs
```

It does not need Bash, Docker, a particular working directory or an editor. It writes nothing to the clone and removes its temporary files.

## What happens

1. In a temporary Git repository, the demo applies two patches (A, then B in a fresh copy) with `git apply --index`.
2. For each, it runs the same unit test file with `node --test`.
3. The demo itself lists the changed paths from Git, then runs the real `explain` command of this clone's ARC CLI once per path. Each run uses a copy of the task whose scope is that path; the demo rewrites that field.

The declared write authority is the single file `src/greet.mjs`. Patch B contains patch A byte for byte plus one edit to `config/release.json`.

### Expected output

```text
ARC #130 demo: unit tests pass, the scope check still flags the extra file.
Declared write authority: src/greet.mjs

Case A: allowed patch
  Changed paths (from Git): src/greet.mjs
  Unit tests (node --test): PASS (exit 0)
  ARC explain src/greet.mjs: PASS (exit 0)

Case B: same patch + one out-of-scope edit
  Changed paths (from Git): config/release.json, src/greet.mjs
  Unit tests (node --test): PASS (exit 0)
  ARC explain config/release.json: FAIL (exit 1) TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY
  ARC explain src/greet.mjs: PASS (exit 0)

Result: tests passed in both cases; ARC flagged 1 path in case B: config/release.json
Demo complete: every observed result matched the expectation (demo exit 0).
Checked by ARC 1.0.1: each path this demo listed from Git, against the declared authority.
Not checked: code correctness, who made the change, or whether any write was blocked.
```

The demo exits **0**. The `FAIL (exit 1)` line is the ARC result the demo expects for that path; it is not the demo's own exit code. The ARC version comes from the JSON report and is matched to `package.json`, because the CLI has no `--version` command.

## How to read it

| Case | Changed paths | Unit tests | ARC (per path) | Meaning |
| --- | --- | --- | --- | --- |
| A | `src/greet.mjs` | PASS | PASS | The only changed path is inside the declared authority. |
| B | `config/release.json`, `src/greet.mjs` | PASS | `config/release.json`: FAIL `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`; `src/greet.mjs`: PASS | The tests cannot see the extra file. The declaration check names it. |

## What was checked, and what was not

- ARC does not read Git or file contents. The demo lists the paths and passes each one to ARC; a path that is not listed is not checked.
- ARC does not stop writes. In case B the out-of-scope file really changed, and the tests passed.
- A PASS does not mean the code is correct or safe.
- A PASS does not prove who made the change or that the reviewer is independent.
- This is a plain Node command. It does not run automatically in Cursor or Claude Code, and no editor-specific procedure is verified here.

## If you see DEMO_ERROR

The demo exits **2** and prints nothing to stdout, so a partial result is never shown as a pass. The message names the path or step. Do not widen the authority or edit a patch to make the demo pass.

| Message starts with | Cause | What to do |
| --- | --- | --- |
| `git was not found` / `unsupported Git version` | Git is missing or older than 2.32. | Install Git 2.32 or newer and rerun. |
| `unsupported Git change` | Git reported a rename, copy, deletion, type change, untracked, ignored, submodule, unmerged or working-tree-only change, or an unusual file mode. | The demo only handles added or modified tracked files and stops instead of guessing. |
| `a path from Git is not valid UTF-8` | A path cannot be decoded. | Fix the path; the demo does not guess an encoding. |
| `Git reported no changed paths` | The patch applied to nothing. | An empty list would look like a pass. Restore the bundled patches. |
| `case B expected ARC to reject` / `case A expected ARC to accept` | The declarations or fixture changed. | Restore the bundled fixture from a clean clone. |
| `unit tests failed` | A unit test failed or none ran. | Both cases must pass their tests before ARC results are compared. |
| `ARC explain could not read its input` | The ARC CLI exited 2 or was not found. | Run from a complete clone of this repository. |

## Use it in your own repository

1. Declare write authority in your bundle's `allowed_write_scopes` at the granularity you intend to allow, as in [FIRST-TASK](../adoption/FIRST-TASK.md). The wider the scope, the less ARC can flag.
2. List the changed paths with your own reviewed method. This demo's listing handles only added and modified files; decide how you treat untracked, ignored, renamed, deleted and submodule paths, and stop on any kind you have not decided.
3. Run `explain` for each path. Treat exit 1 as outside the declaration and exit 2 as an input error, and record the path with each.
4. Keep running your tests. ARC does not replace them, and they do not replace ARC.
5. For CI and hooks, use the [entry points](../adoption/README.md#3-choose-an-entry-point). The consumer starter pins core 1.0.0.
6. [CLAUDE.md.example and arc.mdc.example](../adoption/integrations/) are instruction-guided templates; verify actual execution yourself.
