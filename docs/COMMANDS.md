# Choose the check for the question

These commands and public APIs exist in **published 1.0.0**. A successful command covers its supplied inputs and that command's checks; it does not imply that a different command ran or that execution was authorized.

The table uses `agent-role-contracts` as the installed CLI name. In the [consumer starter](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/README.md), use `npx --no-install agent-role-contracts` (`npx.cmd` in PowerShell), or invoke the installed `bin/agent-role-contracts.mjs` with `node` as shown in the [copyable shell guide](SHELL-COMMANDS.md).

| Question | Command | Required JSON inputs | What this result does not establish |
| --- | --- | --- | --- |
| Are roles, authority and routes consistent? | `validate` | `--bundle B` | No particular task or handoff was checked. |
| Does this task fit the routed declarations? | `explain` | `--bundle B --task T` | No handoff was checked, no actual review or human approval was authenticated. |
| Does this handoff agree with the task and route? | `handoff` | `--bundle B --task T --handoff H` | Evidence references are not opened or verified; reported work is not proved to have happened. |
| What is the current task/action subject? | `action-subject` | `--bundle B --task T --action A` | Computing a digest supplies no review or approval. |
| Do supplied review/approval declarations bind the current subject? | `action-bind` | `--bundle B --task T --action A --binding X` | A matching declaration does not authenticate its author or authorize execution. |
| Does the supported filesystem-write mapping match the declarations? | `adapter-filesystem-write` | `--bundle B --task T --action A --mapping M` | No file is written; no output bytes or runtime permissions are verified. |
| What subject does this lifecycle describe? | `lifecycle-describe` | `--bundle B --task T --action A --lifecycle L` | Describing a subject does not establish that the lifecycle events occurred. |
| Are the supplied lifecycle/evidence declarations consistent? | `lifecycle` | `--bundle B --task T --action A --lifecycle L` | Events, evidence bytes, timestamps and replay policy remain external responsibilities. |

`B`, `T`, `H`, `A`, `X`, `M` and `L` are placeholders for files you supply. Use `--format json` for machine output or `--format text` for a readable result. Run `--help` for complete syntax, including the separate optional finance profile.

## Exit codes are part of the result

| Exit | Meaning | Next action |
| --- | --- | --- |
| `0` | The invoked declaration check passed. | Retain the inputs and version; perform the other checks and approvals required by your workflow. |
| `1` | The supplied declarations were rejected. | Read the diagnostic and repair the intended declaration or obtain a properly reviewed policy change. |
| `2` | A CLI argument or file-reading error occurred. | Fix the named path, input or invocation. It is not a policy decision. |

Do not turn an expected negative fixture's exit `1` into an exit `0` in the real command. A demonstration wrapper may itself exit `0` only after it confirms the expected rejection and its repair; that wrapper result is different from the underlying negative check.

## Run the next useful example

- **My own task:** [first task](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/FIRST-TASK.md) / [日本語](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/FIRST-TASK.ja.md).
- **An application or script:** [complete public API example](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/API-EXAMPLE.md).
- **A task was replaced before handoff:** [handoff mismatch and repair](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/HANDOFF.md).
- **Implementation and review share one declared role:** [review separation exercise](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/DECLARED-REVIEW.md).
- **Review is stale after a task/action change:** [existing G1 example](../examples/action-binding/demo.mjs) and [integration sequence](INTEGRATION.md#integration-sequence).

These are declaration examples. For a software defect or a result from your own use, choose the appropriate [contribution route](../CONTRIBUTING.md#choose-a-contribution).
