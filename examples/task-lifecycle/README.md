# Task lifecycle declaration demo

G0 and G1 are merged and implemented. G3 lifecycle is an implemented candidate pending integration and independent review, not released or adopted. G2 is design-only on this base; any G2 implementation work must remain separate and must not be assumed merged. Finance and Safe remain optional profiles; this demo uses only the generic core. No package publication is claimed.

Run from a source checkout with integrated G3 core:

```sh
node examples/task-lifecycle/demo.mjs
```

Requires Node.js 22.5 or newer. The base commit lacks lifecycle APIs: until integration, the demo exits 2 with an integration-dependency diagnostic. No install or network access is needed. It reads only bundled JSON fixtures, never output artifacts.

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

Lane validation: syntax and whitespace checks passed. A temporary copy of the examples with a symlink to the adjacent G3 core lane passed all six expected outcomes, without copying source. This is integration smoke evidence for those adjacent working-tree bytes, not acceptance of this base or a released package.
