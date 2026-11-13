# Evaluate one real workflow

Agent Role Contracts is easiest to evaluate against one workflow you already run.

The goal is not to replace your IAM, CI, agent runtime, or approval system. The goal is to make the declared role, task scope, review separation, and handoff explicit enough to check before you rely on them.

For a reproducible starting point, use the [pinned v1.0.0 external evaluation kit](../experiments/external-evaluation/README.md) and its [evidence checklist](../experiments/external-evaluation/EVIDENCE_TEMPLATE.md). The helper checks PASS → deliberate contradiction FAIL → repaired PASS and optionally a distinct **second declaration**. Actual second-task use by an outside operator requires separate real-workflow/commit/CI evidence; a synthetic check cannot establish adoption or runtime enforcement.

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

Each block below is one command to paste, followed by its expected result. The exit codes of the checks mean:

- `0`: the invoked check passed;
- `1`: a declaration was rejected (expected in step 2, and in step 1 after a deliberate out-of-scope edit);
- `2`: a file or option problem.

To print the exit code of the command you just ran, use `echo $?` in a POSIX shell. PowerShell forms (`npm.cmd`, `$LASTEXITCODE`) are in the [copyable shell commands](SHELL-COMMANDS.md).

Start with the bundled example. Clone the repository:

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
```

Expected: a new `agent-role-contracts` directory; exit code 0.

Run the demo from the directory where you ran `git clone`:

```sh
npm --prefix agent-role-contracts run demo --silent
```

Expected: first line `Agent Role Contracts: check a task before handing it to an agent.`; exit code 0.

Then adapt the starter bundle and task to your workflow. The useful result is not simply a PASS. Change one important assumption deliberately and verify that the relevant command rejects the stale or out-of-scope declaration.

Enter the repository:

```sh
cd agent-role-contracts
```

Expected: no output; exit code 0.

Make a task copy before running the checks:

```sh
cp examples/starter-task.json task.demo.json
```

Expected: no output; exit code 0. `task.demo.json` is a scratch file: `git status` lists it as untracked, and you can delete it when you are done. `No such file or directory` means the shell is not in the repository yet: run the `cd` line first.

Use the step that actually covers the assumption you are testing.

**Step 1: scope containment.** Run the line, then edit `inputs.scope` in `task.demo.json` (for example to `README.md`) and run the same line again.

```sh
node bin/agent-role-contracts.mjs explain --bundle examples/starter-bundle.json --task task.demo.json --format text
```

Expected: first line `PASS: explain (declarations only; execution NOT authorized)`; exit code 0. With a scope outside `src/**`, the first line becomes `FAIL: explain (declarations only; execution NOT authorized)`, a later `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` line appears and the exit code is 1: fix the task, not the role. Exit code 2 means a path or option is wrong: run `node bin/agent-role-contracts.mjs --help`.

**Step 2: declared self-review. Expected failure.** The bundled fixture routes implementation and review through one role.

```sh
node bin/agent-role-contracts.mjs validate --bundle examples/invalid-self-review.json --format text
```

Expected: first line `FAIL: bundle (declarations only; execution NOT authorized)`; exit code 1. This rejection is the intended result, so continue. If the exit code is 0, the fixture has been edited: run `git restore examples`.

**Step 3: G1 subject binding.** The demo changes a meaningful task or action input and rejects the stale review/approval binding.

```sh
npm run demo:binding --silent
```

Expected: first line `G1 task/action binding: three non-financial declaration examples.`; last line starts with `Six expected binding outcomes verified.`; exit code 0. The `FAIL (expected)` lines in between are part of the success. On `DEMO_ERROR` or any other exit code, run `git restore examples`, rerun the line, and report the diagnostic if it still fails.

**Step 4: handoff consistency.**

```sh
node bin/agent-role-contracts.mjs handoff --bundle examples/team.json --task examples/task.json --handoff examples/handoff.json --format text
```

Expected: first line `PASS: handoff (declarations only; execution NOT authorized)`; exit code 0. Exit code 2 means one of the three paths is wrong.

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

On two real tasks of your own, run the [evaluation kit's helper](../experiments/external-evaluation/README.md#adapt-to-a-real-workflow) and record by hand whether the check added anything and whether you would keep it; "our existing controls are enough" is a valid result, and better evidence than forcing a new layer into the workflow.

Rules: time with a clock while you work. Do not rebuild minutes from logs. Write `UNMEASURED`, not 0, for any value you did not time or count (field 2's 0 means you did not edit the bundle), and `none` only if you looked and found nothing.

1. Before task 1, copy the record into a text file. Start a clock when you copy the starter files into your own project (the helper also needs the pinned clone described in the kit README).
2. On each task, run the helper on your own bundle and that task's file, saving the reports as `evaluation-1.json` and `evaluation-2.json`. Use the same bundle file for task 2, editing it only if the task requires it, and time any edit. Copy `source_files.bundle_sha256` from each report into field 8.
3. After task 2, fill fields 7–9. REMOVE and "our existing controls are enough" are valid results. Do not subtract minutes or report time saved.

```text
ARC two-task record
Time with a clock while you work. Do not rebuild
minutes from logs afterwards. Write UNMEASURED for
any value you did not time or count. Write none only
if you looked and found nothing.

Task 1 (link or short name):
Task 2 (link or short name):

1. Setup minutes: from copying the starter files to
   the first helper report on your own files
   (exit 0 or 1). Minutes or UNMEASURED.
   task 1:

2. Edit minutes to reuse the bundle on task 2.
   0 if not edited. Minutes or UNMEASURED.
   task 2:

3. Minutes spent rechecking role, scope and review
   by hand while the check was in use.
   Minutes or UNMEASURED.
   task 1:
   task 2:

4. Correct refusals: diagnostic code for each.
   Codes, none, or UNMEASURED.
   task 1:
   task 2:

5. False refusals: legitimate work the check refused.
   Input and code for each, none, or UNMEASURED.
   task 1:
   task 2:

6. Rules you could not express: exact rule or path.
   List, none, or UNMEASURED.
   task 1:
   task 2:

7. A contradiction the check reported that your
   existing controls did not report on this task
   (link), or the existing control that already
   covered it, or none, or UNMEASURED.
   task 1:
   task 2:

8. bundle_sha256 from each helper report. Equal
   values mean the same bundle file was checked.
   task 1:
   task 2:

9. Your decision after task 2: KEEP, REMOVE or DEFER
   reason:
```

The kit explains [what counts as a correct refusal and as a false refusal](../experiments/external-evaluation/README.md#how-to-read-a-result). Use the filled record to answer the matching lines of the kit's [evidence checklist](../experiments/external-evaluation/EVIDENCE_TEMPLATE.md); the record does not replace the checklist.

## 5. Escalate only when the need repeats

Do not add a runtime adapter because one team can imagine using it.

A stronger signal is the same enforcement or evidence gap appearing in at least two independent workflows or organizations, with a clear integration point that can actually observe or constrain the action.

## What this project currently covers

The public package checks declarations. The published stable `1.0.1` release, its predecessor `1.0.0` and the archived `0.5.0` compatibility baseline cover task/action binding, a narrow filesystem-write mapping, and lifecycle declarations.

It does not authenticate agents, grant runtime permission, verify output bytes, enforce any runtime, filesystem, SaaS or API permission, or prove that a reviewer was independent in the real execution environment. Check the README for the exact boundary of the version you are using.

## Evaluate with Netsujo

If you want to compare one of your real workflows with this model, use the English contact path:

https://netsujo.jp/en/consult

Bring one workflow, one recent failure or recheck burden, and the controls you already use. The evaluation should start from those facts rather than from a request to replace your existing stack.
