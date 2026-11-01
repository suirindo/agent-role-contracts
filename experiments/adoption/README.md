# Use ARC in an existing development workflow

This experimental, source-only kit connects the published **Agent Role Contracts 1.0.0** checker to a consumer repository. It is not included in the already-published npm 1.0.0 package. The templates are optional examples, not certified integrations or runtime enforcement.

Choose one entry point after the consumer check works. All eight entry points use the same declaration check; do not install every example.

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

## 2. Bring only the needed files into your repository

These templates expect the consumer package.json, `.arc/`, and `scripts/` at your repository root. Review the consumer's `.arc/` fixtures, then replace the illustrative roles, paths, and task with your approved task. Keep the authority bundle under the repository's existing trusted review process. Add the fixed dev dependency and the `arc:check` script to the existing package.json; do not replace it. Install with `--ignore-scripts`, retain the lockfile, and check the exact task you intend to use.

The checker reads declarations, not your Git diff or task-scope files. A task that omits an actual changed file can still pass. Your integration must construct or independently compare the task scope with the real change. A PR that edits both its policy and its task can also make itself pass; these examples do not establish a trusted policy baseline.

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

Use the existing [workflow evaluation kit](../external-evaluation/README.md) for two genuine tasks. Record preparation, maintenance, and rechecking effort, contradictions found, and overlap with your existing controls. A local template test is not evidence of native agent behavior, hosted CI success, production adoption, or time saved.

Share a redacted result through the existing [workflow feedback form](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml). If you expect to return to the project, the repository's optional Star action remains available.

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

This kit does not claim that a hosted pipeline, editor, or model session has executed these templates. Validate the chosen integration in your own environment before relying on it.
