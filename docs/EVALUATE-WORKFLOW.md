# Evaluate one real workflow

Agent Role Contracts is easiest to evaluate against one workflow you already run.

The goal is not to replace your IAM, CI, agent runtime, or approval system. The goal is to make the declared role, task scope, review separation, and handoff explicit enough to check before you rely on them.

## Pick a narrow workflow

Start with one recurring development workflow such as:

```text
approved change request
  -> scoped implementation
  -> independent review
  -> acceptance
  -> handoff
```

Use a real workflow, but begin with non-sensitive or synthetic inputs. Do not grant production authority just to run this evaluation.

## 1. Write down the current contract

Capture:

- who may implement;
- who may review;
- which paths or resources may change;
- which inputs are required;
- what the handoff is expected to contain;
- what must remain human-only.

If those answers are currently spread across prompts, README files, CI configuration, and team habits, that fragmentation is part of what you are evaluating.

## 2. Run the declaration checks

Start with the bundled example:

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
npm --prefix agent-role-contracts run demo --silent
```

Then adapt the starter bundle and task to your workflow. The useful result is not simply a PASS. Change one important assumption deliberately and verify that the relevant command rejects the stale or out-of-scope declaration.

From the cloned repository root, make a task copy before running the checks:

```sh
cd agent-role-contracts
cp examples/starter-task.json task.demo.json
```

Use the command that actually covers the assumption you are testing:

```sh
# Scope containment: edit task.demo.json, then rerun explain.
node bin/agent-role-contracts.mjs explain \
  --bundle examples/starter-bundle.json \
  --task task.demo.json \
  --format text

# Declared self-review.
node bin/agent-role-contracts.mjs validate \
  --bundle examples/invalid-self-review.json

# G1 subject binding: the demo mutates meaningful task/action input
# and rejects the stale review/approval binding.
npm run demo:binding

# Handoff consistency.
node bin/agent-role-contracts.mjs handoff \
  --bundle examples/team.json \
  --task examples/task.json \
  --handoff examples/handoff.json
```

See [the task-edit quickstart](QUICKSTART.md#check-your-own-edit) and [the integration sequence](INTEGRATION.md#integration-sequence) before adapting those examples.

Useful mutations include:

- request a path outside the implementer's declared write scope;
- make the implementer and reviewer the same declared role;
- change a meaningful task input after a review or approval binding was created and verify that the stale binding is rejected;
- change a copied handoff's `task_id` or `suggested_next_agent` and verify that the handoff no longer matches the declared task or route.

## 3. Keep declaration checks separate from runtime enforcement

A successful check does **not** prove that the runtime will enforce the declaration.

For your evaluation, record separately:

| Question | Evidence source |
| --- | --- |
| Are the declarations internally consistent? | Agent Role Contracts |
| Who is the authenticated executor? | Your identity/runtime layer |
| Can the executor actually mutate this resource? | Your IAM, sandbox, CI, OS, or API boundary |
| Was the reviewed subject the subject that executed? | Your integration/evidence path |
| Did the intended business result occur? | Your acceptance check |

Do not convert an Agent Role Contracts PASS into execution permission.

## 4. Measure whether the contract helps

For two real tasks, record:

- setup and maintenance time;
- meaningful inconsistencies found;
- false positives or rules you could not express;
- human time spent rechecking role, scope, and review assumptions;
- whether the same contract was useful on the second task;
- anything your existing CI, IAM, or runtime already solved better.

A useful evaluation can end with "our existing controls are enough." That is better evidence than forcing a new layer into the workflow.

## 5. Escalate only when the need repeats

Do not add a runtime adapter because one team can imagine using it.

A stronger signal is the same enforcement or evidence gap appearing in at least two independent workflows or organizations, with a clear integration point that can actually observe or constrain the action.

## What this project currently covers

The public package checks declarations. Some preview APIs also cover task/action binding, a narrow filesystem-write mapping, and lifecycle declarations.

It does not authenticate agents, grant runtime permission, verify output bytes, enforce any runtime, filesystem, SaaS or API permission, or prove that a reviewer was independent in the real execution environment. Check the README for the exact boundary of the version you are using.

## Evaluate with Netsujo

If you want to compare one of your real workflows with this model, use the English contact path:

https://netsujo.jp/en/consult

Bring one workflow, one recent failure or recheck burden, and the controls you already use. The evaluation should start from those facts rather than from a request to replace your existing stack.
