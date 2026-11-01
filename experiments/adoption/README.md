# Use ARC in an existing development workflow

This experimental, source-only kit connects the published **Agent Role Contracts 1.0.0** checker to a consumer repository. It is not included in the already-published npm 1.0.0 package. The templates are optional examples, not certified integrations or runtime enforcement.

Choose one entry point after the consumer check works. All eight entry points use the same declaration check; do not install every example.

### Is this a useful check for your workflow?

| What you need | Appropriate next step |
| --- | --- |
| Compare a task's declared write scope and declared review roles before work starts | Try the standalone consumer below, then write [one task of your own](FIRST-TASK.md) |
| Learn what a rejection means before installing a consumer dependency | Run the existing [source demo](../../docs/QUICKSTART.md#run-the-demo) |
| Check JSON shape, code correctness, or which files actually changed | Use your schema validation, tests, and diff review; ARC does not replace them |
| Enforce live permissions, identities, or approvals | Keep your IAM, sandbox, and approval controls; this kit checks declarations |
| Your existing CI, schemas, IAM, and review already cover the problem | Keep those controls; skip this trial unless you can name a remaining declaration mismatch |

## 1. Try a standalone consumer

Requires Git, Node.js 22.5 or newer, and npm. Run this in a directory where `agent-role-contracts` and `arc-check` do not exist:

```sh
git clone --depth 1 https://github.com/suirindo/agent-role-contracts.git
git -C agent-role-contracts rev-parse HEAD
node -e "require('node:fs').cpSync('agent-role-contracts/experiments/adoption/consumer','arc-check',{recursive:true,force:false,errorOnExist:true})"
cd arc-check
npm install --ignore-scripts
npm run arc:check
```

Record the source commit printed above separately from the fixed core version. The install resolves only the pinned core dependency for this standalone consumer. Review and retain the resulting lockfile. The last command should return 0 and report PASS for the supplied declarations.

Try the negative fixture without replacing the normal task:

```sh
npx --no-install agent-role-contracts explain --bundle .arc/bundle.json --task .arc/task-outside-scope.json --format text
```

This must return 1 with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`. Malformed JSON is rejected with `JSON_INVALID` and exit 1 in the pinned 1.0.0 checker. An input file that cannot be read returns 2. A failed input read is not a successful declaration check.

From the same consumer root, verify the local installation and the expected positive, negative, and unreadable-input results:

```sh
node scripts/verify-setup.mjs
```

This source-only helper does not install dependencies, change files, or contact a service. It returns 0 only when its setup checks all match expectations; missing setup or an unexpected result returns 2. That helper result is separate from the core check's 0/1/2 exits and does not show that your own task or integration ran.

## 2. Bring only the needed files into your repository

These templates expect the consumer package.json, `.arc/`, and `scripts/` at your repository root. Review the consumer's `.arc/` fixtures and choose a task inside the existing declared scope. Keep the authority bundle under the repository's existing trusted review process, including any later changes to roles or allowed paths. Add the fixed dev dependency and the `arc:check` script to the existing package.json; do not replace it. Install with `--ignore-scripts`, retain the lockfile, and check the exact task you intend to use.

The checker reads declarations, not your Git diff or task-scope files. A task that omits an actual changed file can still pass. Your integration must construct or independently compare the task scope with the real change. Checking a task and a widened bundle from the same untrusted change can also make that task pass; the GitHub Actions template below keeps those inputs separate.

Use the [first-task walkthrough](FIRST-TASK.md) to edit the task ID, route type, objective, scope, and acceptance criteria while keeping the supplied authority bundle unchanged.

### Scope compatibility: installed 1.0.0 and source main

The consumer remains pinned to **published 1.0.0** even when you copy this kit from a newer source commit. With the starter's `src/**` authority:

| Task scope | Published 1.0.0 | Source main |
| --- | --- | --- |
| `src/example.mjs`, `src/nested/file.mjs`, or `src/**` | Accepted | Accepted |
| `src2/example.mjs` | Rejected: outside `src/**` | Same |
| `.github/workflows/arc.yml` | Rejected: dot-prefixed segment | Supported syntax only with matching, explicitly approved root `.github` authority; still outside the starter's `src/**` |
| `src/.hidden`, `../src/file.mjs`, or `/tmp/file.mjs` | Rejected: invalid scope syntax | Same |

The root `.github` exception is an [unreleased source change](../../docs/COMPATIBILITY.md#unreleased-source-candidate-explicitly-scoped-root-github-paths), absent from the immutable 1.0.0 package. Do not rename a task's scope to hide an actual `.github` change or widen authority to force a PASS. For a workflow whose paths 1.0.0 cannot express, keep the existing review controls and record the limitation.

## 3. Choose an entry point

| Environment | Template | How to adopt it | When the check runs |
| --- | --- | --- | --- |
| GitHub Actions | [github-actions.yml](integrations/github-actions.yml) | Add a reviewed workflow under `.github/workflows/`; preserve existing workflows | Pull requests |
| GitLab CI | [gitlab-ci.yml](integrations/gitlab-ci.yml) | Merge the job into your existing pipeline and use an approved Node image | Pipeline job |
| Local Git hook | [pre-commit](integrations/pre-commit) | Integrate with your existing hook; do not overwrite it or change global hooksPath | A local commit; checks staged declarations |
| VS Code | [vscode-tasks.json](integrations/vscode-tasks.json), optional [schema settings](integrations/vscode-settings.json) | Merge the task into `.vscode/tasks.json`; see the editing setup below | Manual task invocation; optional input hints while editing |
| Codex | [AGENTS.md.example](integrations/AGENTS.md.example) | Append the reviewed section to the applicable `AGENTS.md` | Instruction-guided; verify actual execution |
| Claude Code | [CLAUDE.md.example](integrations/CLAUDE.md.example) | Append to the project `CLAUDE.md` or `.claude/CLAUDE.md` | Instruction-guided; verify actual execution |
| Cursor | [arc.mdc.example](integrations/arc.mdc.example) | Add as `.cursor/rules/arc.mdc` after reviewing existing rules | Model context with `alwaysApply: true`; verify execution |
| GitHub Copilot | [copilot-instructions.md.example](integrations/copilot-instructions.md.example) | Append to `.github/copilot-instructions.md` | Supported instruction-aware surfaces; verify execution |

The agent instruction files are examples, so their filenames end in `.example` here. They do not apply to this source checkout. Existing project, organization, and platform instructions remain authoritative. Do not change approval or sandbox settings to follow an example.

For the local hook, copy the consumer's `scripts/staged-check.mjs` to the same relative path in your project and add `"arc:check:staged": "node scripts/staged-check.mjs"` to your existing package.json `scripts` object. The hook calls that script. It reads the Git index's bundle/task, rather than silently checking a different worktree copy. Missing or conflicted staged inputs return 2; stage the reviewed declarations or resolve their conflict before retrying. It does not check all staged source files or prevent bypassing the hook. Preserve existing hooks and use your established hook manager if you have one. The GitLab job uses a `test` stage; if your pipeline declares a different stage list, select an existing appropriate stage rather than replacing that list.

When adding a new local hook, make the reviewed hook file executable; Git ignores hooks without the executable bit. Locate the default path with `git rev-parse --git-path hooks/pre-commit`, and check for an existing hook or configured hook manager before making changes. Running the example with `sh` only tests its command; it does not prove Git has installed or invoked the hook.

The CI examples install development dependencies with lifecycle scripts disabled and invoke the local checker. GitHub Actions requests read-only contents permission, retains no checkout credential, uses no secrets, and does not use `pull_request_target`. These are example checks, not a supply-chain security review of the consumer's dependencies or a protected merge policy.

The GitHub Actions template checks the PR head's task against the base commit's bundle, using only the base commit's installed, version-checked 1.0.0 dependency. Merge the reviewed bundle, dependency pin, and lockfile into the base branch before enabling it. The candidate bundle is ignored, so editing it cannot widen this check's authority; a bundle edit is not automatically rejected or approved. The workflow itself and merge rules still need your existing trusted review and branch protection.

Require branches to be up to date before merge: the template uses the base SHA captured when the pull-request event occurred. A later authority change on the base needs a fresh check. This template runs on pull requests; a merge queue needs a separately reviewed `merge_group` workflow.

### VS Code: add input hints alongside the task

The optional [vscode-settings.json](integrations/vscode-settings.json) associates the consumer's bundle and two task files with the schemas shipped in the installed **1.0.0** dependency. When supported and loaded, it provides property/value completion and structural diagnostics; keep the existing VS Code task for ARC's checks across declarations.

1. Install the pinned consumer dependency as described above, then open the consumer directory as the VS Code folder. For the standalone example, open `arc-check`, where `package.json`, `.arc/`, and `node_modules/` are siblings. For an existing project, open that project's root instead.
2. Merge the two entries from the template's `json.schemas` array into that folder's `.vscode/settings.json`. Preserve every existing setting and schema association; do not replace the file or add a second `json.schemas` key. In a multi-root workspace, use the relevant folder's settings. The `./node_modules/...` schema URLs are relative to that folder root, not to `.vscode/` or this source kit's `integrations/` directory.
3. Keep the exact file matches, or change them to your own declaration filenames. The `${workspaceFolder}/` prefix anchors the three matches to the opened consumer folder: `.arc/bundle.json`, `.arc/task.json`, and `.arc/task-outside-scope.json`. Keep that prefix; a leading `/` alone can also match a nested `.arc/` directory. Avoid a broad `task*.json` pattern: action, binding, and lifecycle declarations use different schemas. Check existing associations for overlapping matches.

Do **not** add a `$schema` property to the bundle or task JSON. ARC 1.0.0 rejects that extra property. The workspace association keeps editor metadata outside the declarations and reuses the installed schemas without copying or changing them.

Try the editing path in a disposable copy of the consumer directory, keeping the declaration paths unchanged, or restore any edits before checking the real task:

| Input or action | Expected editor behavior | ARC check / next action |
| --- | --- | --- |
| Open `.arc/task.json` and request completion | Suggestions include task properties and the supported `schema_version` value | Run **ARC: check declared task** from the existing task template, or `npm run arc:check` |
| Remove required `objective`, give it a number, or add an unknown property | A structural diagnostic identifies the problem | Restore or correct the declaration, then rerun the task |
| Open `.arc/task-outside-scope.json` | The file can have no schema diagnostic: its shape is valid | `npm run arc:check:negative` must still return 1 with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` |
| Schema cannot be loaded | Treat the input hints as unavailable | Check the opened folder and installed local schema path; install the pinned dependency if missing |

Use JSON language mode for declaration files. If diagnostics are absent, check whether `json.validate.enable` was disabled in your effective settings. A quiet Problems panel does not prove that a schema loaded or that ARC passed. The editor's schema check cannot compare a task's scope with bundle authority, inspect a Git diff, grant permission, or replace review. Continue using the CLI/task even when the editor reports no errors.

This is an optional settings example, not an extension. The root-anchored matches require a VS Code client that expands `${workspaceFolder}` in `json.schemas.fileMatch`; that support was confirmed in the installed VS Code 1.141.0 client code and the [official client source](https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/client/src/jsonClient.ts). Older-client compatibility is unverified. Client mapping plus language-service probes and CLI checks do not establish that a VS Code GUI session has used the configuration. Setup time, maintenance cost, and time saved still need measurement in real use.

## 4. Read the result and decide whether to keep it

| Exit | Meaning | Next action |
| --- | --- | --- |
| 0 | Supplied declarations passed the checks that ran | Continue only through your existing permissions, review, and acceptance process |
| 1 | Declaration or JSON validation rejected the input | Correct the task or resolve the scope/role decision; keep the diagnostic |
| 2 | A file read or CLI/tool error prevented the check | Repair the input, path, or tool error and rerun |

### Find the failed input before changing authority

| Observed result in the pinned consumer | Repair, then rerun the same command |
| --- | --- |
| `JSON_INVALID` (exit 1) | Repair JSON syntax in the named input; do not treat a parse failure as a scope decision |
| `SCHEMA_REQUIRED` at `task/objective` (exit 1) | Restore a nonempty objective describing the requested outcome |
| `SCHEMA_ADDITIONALPROPERTIES` at `task/$schema` (exit 1) | Remove `$schema` from the task and use the editor's external schema association |
| `TASK_TYPE_UNROUTED` at `task/type` (exit 1) | Use the intended existing route; the starter declares `code-change`. A new route needs a reviewed bundle change |
| `TASK_WRITE_SCOPE_INVALID` at `task/inputs/scope` (exit 1) | Use the accurate portable relative path supported by the installed version; see the compatibility table above |
| `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` at `task/inputs/scope` (exit 1) | Compare the real task with the reviewed authority. Correct a mistaken scope; route genuinely broader work through existing approval |
| `CLI_ERROR` (exit 2) | Read `message`; correct the command/options or the named path, read access, and working directory. The checker did not reach a declaration result |
| `ARC staged declaration check: Stage one resolved regular file for …` (exit 2) | Resolve conflicts and stage the reviewed `.arc/bundle.json` and `.arc/task.json`; changing only the worktree does not change the checked input |

For conceptual role and handoff failures, use the existing [failure cases](../../docs/FAILURE-CASES.md). Keep the exact command, core version, exit, and redacted diagnostic when asking for help.

### Bound the trial, maintenance, and removal

Start with one reviewed task, one entry point, and a time limit for the trial. If setup cannot be completed within that limit, record where it stopped. Note the source commit, fixed core version, lockfile, and each file or block you add; preserve the original scripts, hooks, editor settings, and pipeline. Do not change global Git settings to run this trial.

When keeping it, update the task for each real change and review authority changes through the existing trusted process. Recheck after updating the kit or integration. A core upgrade needs an explicitly reviewed version and lockfile change plus compatible checks; the fixed 1.0.0 setup helper is not a compatibility test for a later release.

To stop, remove only the ARC job, script entries, hook invocation, instruction block, or editor task/schema associations you added. Keep all other entries and hook behavior. Delete an ARC-only file only after checking no other task uses it. Remove the ARC dependency and update the lockfile through your package manager only if no remaining consumer uses it. Keep the reviewed task and result if they are useful records; no repository reset or recursive cleanup is needed.

Use the existing [workflow evaluation kit](../external-evaluation/README.md) for two genuine tasks. Record preparation, maintenance, and rechecking effort, contradictions found, and overlap with your existing controls. A local template test is not evidence of native agent behavior, hosted CI success, production adoption, or time saved.

Report a first attempt, including `NOT_RUN` or `BLOCKED`, through the short [first-attempt form](https://github.com/suirindo/agent-role-contracts/issues/new?template=adoption-start.yml). Share a real workflow through the existing [workflow feedback form](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml). Neither a setup check nor a first-attempt report substitutes for the two genuine tasks above. If you expect to return to the project, the repository's optional Star action remains available.

## Sources and verification boundary

Template formats were checked against the primary documentation on 2026-11-01:

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitLab CI YAML](https://docs.gitlab.com/ci/yaml/)
- [Git hooks](https://git-scm.com/docs/githooks)
- [VS Code Tasks](https://code.visualstudio.com/docs/debugtest/tasks)
- [VS Code JSON schema associations](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)
- [Codex project instructions](https://developers.openai.com/codex/guides/agents-md/)
- [Claude Code project memory](https://code.claude.com/docs/en/memory)
- [Cursor rules](https://cursor.com/docs/rules)
- [GitHub Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)

Automated consumer checks do not establish that your chosen template has run in your pipeline, editor, or model session. Validate that integration in your own environment before relying on it.
