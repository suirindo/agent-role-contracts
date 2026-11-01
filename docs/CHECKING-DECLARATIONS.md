# How these checks fit together

ARC is an optional check for a defined set of role, task-scope, review and handoff declarations. JSON Schema, prompts and CI can remain part of the same workflow; their responsibilities and configured checks determine what each result establishes.

| Mechanism | What it provides | How to use it with ARC |
| --- | --- | --- |
| JSON Schema validation | Tests JSON instances against the assertions in a schema, including types, required properties, values and supported conditional rules. | Keep existing validators for your data. ARC interprets only its bundled, supported Draft-07 subset and adds its role, route, scope and handoff rules; it is not a general-purpose JSON Schema validator. |
| Prompts and project instructions | Describe intended behavior and the procedure an operator or agent should follow. | Instructions may ask for an ARC check. Record whether the command actually ran and which inputs it checked; a prompt or an ARC PASS does not establish that the runtime followed the instructions. |
| CI | Runs configured jobs and reports their results. Existing jobs may already check schemas or the same policy conditions. | Run ARC as an explicit command only when it adds useful checking. Required checks, protected workflows, permissions and handling a failed job remain the integration's responsibility. |
| ARC | Checks supplied declarations against its supported schemas and consistency rules, such as a task's declared scope fitting routed authority or review using a separate declared role. | Treat the result as evidence about the inputs and command that were checked. Authenticate actual actors, enforce permissions, verify artifacts and accept completed work through existing controls. |

JSON Schema supports [conditional validation](https://json-schema.org/understanding-json-schema/reference/conditionals); it is not limited to checking shape. ARC's [supported schema subset](SCHEMA_PROFILE.md) is deliberately narrower than the general standard. Its public API does not execute arbitrary user-supplied schemas or use `output_schema` as an output validator.

## Compare one unchanged input

Take the existing [starter bundle](../examples/starter-bundle.json) and [out-of-scope task](../examples/starter-task-outside-scope.json). The task requests `secrets/production.txt`; the routed executor declares `src/**`.

1. Retain those exact input bytes and run the check your current workflow already uses. Record its configured rules and actual result; do not assume it accepts the task.
2. From an installed consumer, run the [published-package rejection command](SHELL-COMMANDS.md#confirm-a-meaningful-rejection). ARC reports `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` and exits `1` for these fixtures.
3. Compare what each result established. A custom schema, linter or CI rule may already reject the same contradiction. Replacing the negative task with a different input is not a fair comparison.
4. Retain or remove the additional check based on useful detection, false refusals, setup and maintenance cost in your own work. Use the existing [workflow evaluation guide](EVALUATE-WORKFLOW.md); synthetic results alone do not show operational value.

This procedure supplies the ARC side of a reproducible comparison. It does **not** publish an unperformed benchmark against another tool. If the existing check rejects the same contradiction, record the overlap.

## A consistent declaration is still a declaration

A consistent declaration can describe an unperformed task or an unauthenticated review. ARC does not execute a role's body text, authenticate the person behind a role ID, or prove that output files exist. Even when all required declaration checks pass, actual permissions, review, approval and artifact acceptance stay with the integration.

Read [the command selector](COMMANDS.md), [integration responsibilities](INTEGRATION.md#responsibilities-retained-by-the-integration), and [architecture](ARCHITECTURE.md) for the implemented boundaries. The [JSON Schema validation specification](https://json-schema.org/draft/2020-12/json-schema-validation) is the primary reference for the general standard; it is not a claim that ARC implements that dialect.
