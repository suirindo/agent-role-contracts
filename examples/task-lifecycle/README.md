# Task lifecycle declaration demo

G0 and G1 are merged. This local stacked candidate includes G2 filesystem-write and G3 lifecycle source candidates; neither G2 nor this stacked result is merged to remote main. G2 PR #17 remains Draft and unmerged. Sequencing, review and hosted acceptance remain pending; no release or adoption is claimed.

G0 and G1 are merged and implemented. G3 lifecycle is an implemented candidate pending independent review, not released or adopted. G2 filesystem-write is included through its optional subpath. Finance and Safe remain optional profiles; this demo uses only the generic core. No package publication is claimed.

Run from this unreleased source checkout:

```sh
npm run demo:lifecycle
```

Requires Node.js 22.5 or newer. No install or network access is needed. It reads only bundled JSON fixtures, never output artifacts.

The demo reuses the cross-domain software-change, data-cleaning and support-drafting builders. Each creates a schema `0.3` generic action, computes the current G1 `task-action/0.3` subject using `describeTaskAction(bundleJson, taskJson, actionJson)`, and supplies a schema `0.4` lifecycle to `validateTaskLifecycle(bundleJson, taskJson, actionJson, lifecycleJson)`. The integrated core also exports `describeTaskLifecycle(bundleJson, taskJson, actionJson, lifecycleJson)`; the lifecycle profile is `task-lifecycle/0.4`. The lifecycle references the G1 subject digest rather than substituting a lifecycle digest for it.

Every case declares an external `run_id`, a routed review `pass`, required `approved` approval from `route.accountable`, optional `declared_success` execution from a routed executor, and `present` evidence with one artifact ID, declared SHA-256 and inert locator. Optional execution is included to illustrate a declaration, not to execute anything.

Expected outcomes:

| Scenario | Initial result | Negative result |
| --- | --- | --- |
| Software change | PASS | Old lifecycle fails after an action parameter changes |
| Data cleaning | PASS | Same artifact ID with a second digest fails identity consistency |
| Support drafting | PASS | Old lifecycle fails after a task input changes |

The script exits 0 only when all six outcomes match; unexpected results or missing integrated exports exit 2. It keeps the old declarations in stale-subject cases and never invents refreshed approval.

`run_id` is caller-supplied correlation, not replay protection, uniqueness enforcement or authenticated run identity. Event decisions are declarations, not authenticated events. The event array does not establish timestamps, clock checks or state-machine ordering.

Artifact `sha256` is declared identity: the example uses fictional digest values and the checker does not read or verify bytes. A locator is inert metadata, never fetched. Lifecycle consistency, artifact identity consistency, authenticity and runtime acceptance are distinct: PASS checks the first two declaration relationships; it does not authenticate identities, reviews, approvals, execution or evidence, and does not authorize or enforce runtime execution. A trusted integration must separately verify actual artifact bytes and decide runtime acceptance.
