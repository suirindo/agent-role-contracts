# Task lifecycle declaration demo

G0, G1, G2 and G3 are merged and implemented in repository main. G2 PR #17 merged as `2b20851bdd9b7fd6823f5bd606f3d2f6345459ff`; G3 PR #19 merged as `d18f867d91ec8abb4038af85f17c7b3d4954b869`. Repository source matches the `0.5.0` stable package line; npm stable installs use `latest`. G2 filesystem-write remains an optional explicit `/adapters/filesystem-write` subpath and is not re-exported from root or `/core`. G3 provides generic core lifecycle declarations, not a runtime, state machine or authenticator. Publication does not imply production adoption, runtime permission, deployment, authenticated evidence or execution authority.

G3 lifecycle provides generic core declarations in the `0.5.0` stable package, not a runtime, state machine or authenticator. G2 filesystem-write is included through its optional subpath. Finance and Safe remain optional profiles; this demo uses only the generic core. Production adoption is not claimed.

Run the bundled demo from this source checkout:

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
