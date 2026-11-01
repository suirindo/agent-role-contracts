# Read the starter bundle without changing authority

Use this map beside the actual [starter bundle](../examples/starter-bundle.json) and [starter task](../examples/starter-task.json). The same role, policy and route layout is used by the [consumer starter](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/consumer/.arc/bundle.json). Values below describe those fictional examples; they are not recommended permissions for every project.

## Follow a task through the declarations

For a task with `type: "code-change"`, ARC selects the explicitly declared route with that `task_type`. The route refers to canonical role IDs. Each executor's declared authority must contain the task's `inputs.scope`; the reviewers must satisfy the declared separation and read-only rules. There is no fallback route for an unknown task type.

| Property in the bundle | Value in this starter | What it means for the check |
| --- | --- | --- |
| `schema_version` | `"0.1"` | The bundle schema version. It is separate from the npm package version `1.0.0`. |
| `policy_version` | `"example-v1"` | A supplied policy label; it does not authenticate who approved it or prove freshness. |
| `policy.capabilities` | `filesystem.read`, `filesystem.write.scoped`, `review.perform` | The declared capability vocabulary. Names alone do not give the checker tool semantics. |
| `policy.read_only_forbids` | `filesystem.write.scoped` | Capabilities the policy forbids for a read-only role. |
| `roles[0].contract.id` | `implementer` | The canonical ID referenced by the route. It is not a verified user or runtime identity. |
| `roles[0].contract.authority.authority_mode` | `write_scoped` | Declares a write-capable role with bounded scopes. |
| `roles[0].contract.authority.allowed_write_scopes` | `["src/**"]` | The allowed declaration scope. It does not grant or enforce filesystem access. |
| `roles[0].contract.contract.required_inputs` | `["scope"]` | Inputs a task must supply for this role. The repeated `contract.contract` path is the actual JSON layout. |
| `roles[1].contract.authority.authority_mode` | `read_only` | The review role is declared read-only, with no allowed write scopes. |
| `roles[1].contract.reasoning.requires_independent_context` | `true` | Declares the intended context requirement; ARC does not inspect live agent contexts. |
| `routes[0].executors` / `reviewers` | `["implementer"]` / `["reviewer"]` | Different declared roles do the work and review. They do not prove that different actual actors performed it. |
| `routes[0].accountable` | `implementer` | The route's declared accountable role. |
| `routes[0].require_human_approval` | `true` | Approval is required by the route. `explain` does not obtain or authenticate that approval. |
| `roles[*].body` | Fictional role text | Data supplied with the role. ARC does not execute the text or discover prompt files. |

## Change the proposed task first

If a task requests `secrets/production.txt` while the bundle permits `src/**`, inspect whether the proposed task is wrong. The [first-task exercise](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/FIRST-TASK.md) repairs the task while keeping the bundle unchanged. Do not widen the bundle just to obtain PASS.

If the intended policy genuinely needs to change, have its responsible owner review that change through your existing process. Keep the trusted bundle separate from candidate-supplied task declarations. Changing a role's label or read-only setting cannot make a write-capable actual reviewer independent.

Use [the command selector](COMMANDS.md) to distinguish bundle validation, task checking and handoff checking. The [review exercise](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/DECLARED-REVIEW.md) shows a declared-role conflict; [integration responsibilities](INTEGRATION.md#responsibilities-retained-by-the-integration) explain the actual identity, permission and approval checks that remain outside ARC.
