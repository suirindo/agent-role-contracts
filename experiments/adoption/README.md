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
| VS Code | [vscode-tasks.json](integrations/vscode-tasks.json) | Merge the task into your existing `.vscode/tasks.json` | Manual task invocation |
| Codex | [AGENTS.md.example](integrations/AGENTS.md.example) | Append the reviewed section to the applicable `AGENTS.md` | Instruction-guided; verify actual execution |
| Claude Code | [CLAUDE.md.example](integrations/CLAUDE.md.example) | Append to the project `CLAUDE.md` or `.claude/CLAUDE.md` | Instruction-guided; verify actual execution |
| Cursor | [arc.mdc.example](integrations/arc.mdc.example) | Add as `.cursor/rules/arc.mdc` after reviewing existing rules | Model context with `alwaysApply: true`; verify execution |
| GitHub Copilot | [copilot-instructions.md.example](integrations/copilot-instructions.md.example) | Append to `.github/copilot-instructions.md` | Supported instruction-aware surfaces; verify execution |

The agent instruction files are examples, so their filenames end in `.example` here. They do not apply to this source checkout. Existing project, organization, and platform instructions remain authoritative. Do not change approval or sandbox settings to follow an example.

For the local hook, copy the consumer's `scripts/staged-check.mjs` to the same relative path in your project and add `"arc:check:staged": "node scripts/staged-check.mjs"` to your existing package.json `scripts` object. The hook calls that script. It reads the Git index's bundle/task, rather than silently checking a different worktree copy. Missing or conflicted staged inputs return 2; stage the reviewed declarations or resolve their conflict before retrying. It does not check all staged source files or prevent bypassing the hook. Preserve existing hooks and use your established hook manager if you have one. The GitLab job uses a `test` stage; if your pipeline declares a different stage list, select an existing appropriate stage rather than replacing that list.

When adding a new local hook, make the reviewed hook file executable; Git ignores hooks without the executable bit. Locate the default path with `git rev-parse --git-path hooks/pre-commit`, and check for an existing hook or configured hook manager before making changes. Running the example with `sh` only tests its command; it does not prove Git has installed or invoked the hook.

The CI examples install development dependencies with lifecycle scripts disabled and invoke the local checker. GitHub Actions requests read-only contents permission, retains no checkout credential, uses no secrets, and does not use `pull_request_target`. These are example checks, not a supply-chain security review of the consumer's dependencies or a protected merge policy.

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
- [Codex project instructions](https://developers.openai.com/codex/guides/agents-md/)
- [Claude Code project memory](https://code.claude.com/docs/en/memory)
- [Cursor rules](https://cursor.com/docs/rules)
- [GitHub Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)

This kit does not claim that a hosted pipeline, editor, or model session has executed these templates. Validate the chosen integration in your own environment before relying on it.
