# Stop gate: no stop without a checkable handoff (source-only experiment)

[日本語](README.ja.md)

Status: **experimental, source-only**. Outside the npm `files` inventory; no change to the stable core, the twelve public schemas,
the CLI or the package exports. Any Node.js 22.5+ host can run it; it has no dependency on a particular agent vendor.

## The problem it bounds

Coding agents of every vendor end tasks on their own. Two shapes recur:

- **the vague stop**: "I could not finish" or a usage/timeout cut, with nothing machine-readable about what was done, what is not,
  what is unknown, and who acts next;
- **the inflated stop**: "done", with no acceptance criterion traced to anything a reviewer could open or rerun.

Both leave the next person or agent to rediscover the state. ARC already has a declaration for the moment of stopping, the
[handoff](../../schemas/handoff.schema.json), and the public `validateHandoff` check already rejects `complete` with unresolved
items, `blocked` without one, a target outside the route and a self-handoff. The gate adds one **convention over the existing
fields** so the handoff cannot stay silent about the task's acceptance criteria.

## The rule an agent follows

An agent may stop working on a task only by writing a handoff that passes the gate.

| Field | Convention | Rejection |
| --- | --- | --- |
| `completed` / `unresolved` | Every `acceptance_criteria` entry of the task is copied **verbatim** into exactly one of the two arrays. Other items may be added. | `STOP_CRITERION_UNACCOUNTED`, `STOP_CRITERION_CONFLICT` |
| `current_status: complete` | Every criterion in `completed`, `unresolved` empty (core rule), and at least one `evidence` entry naming a `file` or `command`. | `STOP_COMPLETE_WITH_UNMET_CRITERION`, `HANDOFF_COMPLETE_UNRESOLVED`, `STOP_EVIDENCE_UNANCHORED` |
| `current_status: ready_for_review` | Every criterion in `completed`; anchored evidence; executor → reviewer (core rule). | `STOP_REVIEW_WITH_UNMET_CRITERION`, `STOP_EVIDENCE_UNANCHORED`, `HANDOFF_REVIEW_ROUTE` |
| `current_status: in_progress` / `blocked` | At least one `unresolved` item (an unknown outcome is written as an `UNKNOWN ...` item, never dropped). | `STOP_IN_PROGRESS_WITHOUT_UNRESOLVED`, `HANDOFF_BLOCKER_MISSING` |
| `required_next_action` | A concrete action unless the status is `complete`. `none`, `TBD`, `n/a`, `continue`, `なし`, `未定` and punctuation-only strings are placeholders. | `STOP_NEXT_ACTION_PLACEHOLDER` |
| `suggested_next_agent` | A declared participant with a declared delegation or reporting relation (core rules). | `HANDOFF_ROLE_OUTSIDE_ROUTE`, `HANDOFF_RELATION_UNDECLARED`, `HANDOFF_SELF` |

Decisions: `ACCEPT_COMPLETE`, `ACCEPT_HANDOFF` (work continues with a recorded state) or `REJECT`. Core and gate findings are
reported together, each tagged with its `source`, so one rerun shows every reason. A handoff accepted by the gate is still an
ordinary `0.1` handoff for the stable CLI.

## Run it

```sh
node experiments/stop-gate/demo.mjs
node experiments/stop-gate/cli.mjs --bundle examples/team.json --task examples/task.json --handoff .arc/handoff.json --format text
```

The demo accepts a recorded review handoff, rejects a vague unilateral stop and an inflated completion, and accepts the repaired
`blocked` stop; it ends with `Demo complete: ACCEPT -> REJECT (expected) -> REJECT (expected) -> ACCEPT.` and exit 0.

CLI exit codes follow the stable CLI: `0` accepted, `1` rejected, `2` argument or input error (`STOP_GATE_ERROR: <CODE>` on
stderr). Inputs are regular files of at most 1 MiB; a symlink at the final path component is refused. Inside this checkout the gate
uses `src/core.mjs`; copied into another repository it imports `@netsujo/agent-role-contracts/core`, or the module given by
`--core`. The report names the core `version` it used.

## Wire it in so nobody has to remember

1. **Agent instructions** (Codex `AGENTS.md`, Claude `CLAUDE.md`, ChatGPT project or custom instructions, any other harness):
   paste the stopping rule from [AGENTS.md.example](AGENTS.md.example). It tells the agent that stopping without a passing
   handoff is not an allowed end state, and what to write when it cannot finish.
2. **Template**: start each task's handoff from [handoff.template.json](handoff.template.json); the placeholders fail the gate until
   replaced.
3. **Pre-commit**: when `.arc/handoff.json` is staged, run the gate; an agent that commits a vague stop is stopped at the commit.

   ```sh
   if git diff --cached --name-only | grep -qx '.arc/handoff.json'; then
     node experiments/stop-gate/cli.mjs --bundle .arc/bundle.json --task .arc/task.json --handoff .arc/handoff.json --format text || exit 1
   fi
   ```

4. **CI**: add the same command as a step after the existing tests in the consumer's workflow (see the adoption kit's
   [github-actions.yml](../adoption/integrations/github-actions.yml) for the trusted-base checkout pattern). A pull request whose
   handoff says `complete` cannot merge while the gate rejects it; a `blocked` handoff merges only with its unknowns recorded.
5. **Resume**: the next agent, of any vendor, reads the handoff, re-runs `explain` and `handoff` with the current bundle and task,
   and treats every `UNKNOWN ...` item as unresolved. What must be re-checked at that moment is listed in
   [docs/AGENT-SWITCH-REVALIDATION.md](../../docs/AGENT-SWITCH-REVALIDATION.md).

## What the gate does not do

It reads JSON text. It does not run or observe the agent, rerun tests, open the files or commands named as evidence, verify
who wrote the handoff, notify the next agent, or decide whether an operation with an unknown outcome may be retried. Every report
carries `work_verified`, `tests_rerun`, `evidence_opened`, `author_authenticated`, `next_agent_notified`, `execution_authorized`,
`runtime_enforcement`, `identity_verified` and `evidence_verified` as `false`. `ACCEPT` means the stop is **recorded
consistently**, nothing more. Verbatim matching is deliberate: a paraphrased criterion is `unaccounted`, so the agent cannot
quietly narrow what "done" means.

Regression coverage: `tests/stop-gate.test.mjs` (library, CLI, demo, package boundary).
