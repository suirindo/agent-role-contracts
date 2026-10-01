# Agent Role Contracts

Agent Role Contracts is an offline CLI and library for checking JSON declarations of agent roles, authority relationships, review separation, task scope and handoffs before an agent starts.

Version `0.1.0` checks declarations only. A `PASS` does **not** grant runtime authority, authenticate identity, execute agents, validate evidence, enforce filesystem access or replace an existing company Agent OS. Use it to catch contradictions in a declared contract; pair it with the runtime controls and review process your environment requires.

## Try it in three minutes

You need Node.js 22.5 or later. The package is tested in CI on Node.js 22.5 and 24. No API key is needed, and the checker makes no network request while it runs.

### From the published package

Start in an empty directory. Pinning `0.1.0` makes this walkthrough match the public release exactly:

```sh
mkdir agent-role-contracts-first-check
cd agent-role-contracts-first-check
npm init --yes
npm install --ignore-scripts @netsujo/agent-role-contracts@0.1.0
```

If npm reports an `EPERM` error about root-owned files in its shared cache, do not use `sudo`. Retry the install with a cache that belongs only to this directory:

```sh
NPM_CONFIG_CACHE="$PWD/.npm-cache" npm install --ignore-scripts @netsujo/agent-role-contracts@0.1.0
```

Run the bundled two-role starter as-is:

```sh
npx --no-install agent-role-contracts validate \
  --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json \
  --format text
npx --no-install agent-role-contracts explain \
  --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json \
  --task node_modules/@netsujo/agent-role-contracts/examples/starter-task.json \
  --format text
```

The first command prints `PASS: bundle`. The second prints `PASS: explain`, with `implementer` as the write-scoped executor and `reviewer` as the separate read-only reviewer. This is a declaration result, not permission to run either role.

Now run the deliberately out-of-authority task:

```sh
npx --no-install agent-role-contracts explain \
  --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json \
  --task node_modules/@netsujo/agent-role-contracts/examples/starter-task-outside-scope.json \
  --format text
```

That command intentionally exits 1 and reports `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`. It demonstrates fail-closed scope checking; it does not inspect or protect a real `secrets/production.txt` path.

To make the example your own, copy the three starter JSON files into your project, change the IDs, scopes and capabilities to match your declared policy, then point the same commands at your copies. Keep a separate reviewer role when you want the checker to verify review separation.

### From this repository

No npm packages, API key or network are needed. With Node.js available, the same starter can run directly from a checkout:

```sh
node bin/agent-role-contracts.mjs validate --bundle examples/starter-bundle.json
node bin/agent-role-contracts.mjs explain --bundle examples/starter-bundle.json --task examples/starter-task.json --format text
```

The second command should print `PASS`, with `implementer` as the write-scoped executor and `reviewer` as the separate read-only reviewer. Then run the intentionally out-of-authority task:

```sh
node bin/agent-role-contracts.mjs explain --bundle examples/starter-bundle.json --task examples/starter-task-outside-scope.json --format text
```

That command must exit 1 with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`. The starter is deliberately prewritten: first-use should demonstrate the contract check before asking a new user to author the full role schema.

## Full three-role example

After the starter, the fuller example adds a coordinator, conditional inputs and a handoff:

```sh
node bin/agent-role-contracts.mjs validate --bundle examples/team.json
node bin/agent-role-contracts.mjs explain --bundle examples/team.json --task examples/task.json --format text
node bin/agent-role-contracts.mjs handoff --bundle examples/team.json --task examples/task.json --handoff examples/handoff.json
```

An intentionally invalid self-review bundle must exit 1:

```sh
node bin/agent-role-contracts.mjs validate --bundle examples/invalid-self-review.json
```

Use `examples/another-team.json` to see different canonical IDs and `examples/code-task.json` for conditional required inputs on a second explicit route.

The hosted CI matrix covers Ubuntu / Node.js 22.5.0, Ubuntu / Node.js 24, macOS / Node.js 22 and Windows / Node.js 22. Every candidate must pass on its own exact HEAD and still requires independent acceptance; a version range or an older candidate's result is not proof for current bytes. Node 22.5.0 is a minimum-compatibility fixture, not a deployment recommendation.

## Boundaries

Checks cover structure, duplicate IDs and aliases, authority contradictions, role references and cycles, explicit routes, declared self-review, required/conditional inputs, registered knowledge references and task-bound handoff consistency. Unknown task types fail rather than silently falling back. Input fields are checked against every routed role; staged production of later inputs is not implemented. For routed `write_scoped` or `operator` executors, `inputs.scope` must be one portable relative scope contained by that executor's declared `allowed_write_scopes`. A `write_scoped` or `operator` role must also actually allow at least one capability that the bundle policy lists in `read_only_forbids`; the Core does not guess write semantics from capability names. This is declaration-level containment only: no filesystem path is opened, no glob is expanded and no runtime access is granted. `human_only` roles must declare both executable `capabilities` and `allowed_write_scopes` as empty; they represent human decision/approval boundaries, not machine mutation authority.

A PASS checks declarations only. The default JSON result states that execution authorization, runtime enforcement, identity verification, evidence verification, source-file checks, sensitive-data scanning and output-schema validation are false; text output states that execution is not authorized. A knowledge URI is not fetched or resolved against the filesystem. `output_schema` is retained metadata, not an executed user schema. No scoring purports to measure model quality.

The runtime-specific declaration check is intentionally finite. It detects a small generic set of runtime configuration keys and selected `.claude` / `.codex` path forms. It is not proof that a declaration is universally runtime-neutral, and it is not a security, secret, malware or prompt-safety scanner.

Role `body` text is inline. The public contract has no prompt-file path field, and the Core does not discover `ROLE.md` or any other role file.

The package imports no company configuration and performs no application I/O at core import time. Node still loads its JavaScript modules. Only the CLI opens explicitly supplied regular files. It never executes evidence `command` strings, invokes agents or writes configuration. A stable last-component symlink is rejected on supported CI platforms. POSIX keeps `O_NOFOLLOW`; Windows additionally uses a pre-open `lstat` check. This is not a general filesystem sandbox, and the Windows pre-check is not claimed to prevent a hostile process from swapping a path between inspection and open. The JSON-text-only API rejects executable objects and never loads JavaScript configuration.

## Install

```sh
npm install @netsujo/agent-role-contracts
```

## API

```js
import { validateBundle, explainTask, validateHandoff } from '@netsujo/agent-role-contracts';
const result = validateBundle(bundleJsonText);
const plan = explainTask(bundleJsonText, taskJsonText);
const handoff = validateHandoff(bundleJsonText, taskJsonText, handoffJsonText);
```

Exit codes: 0 consistent declarations; 1 invalid contracts; 2 CLI/input-file failure. Use `--format text` or the default JSON. Input limits: 1 MiB, 64 nesting levels, 50,000 nodes per document. Duplicate decoded keys, nonfinite numbers, unsafe integers and the reserved member name `__proto__` are rejected; ordinary data members named `prototype` or `constructor` are allowed.

The schema engine is a closed Draft-07-keyword subset for the bundled schemas, not a general validator. Unsupported keywords fail loudly. See `docs/SCHEMA_PROFILE.md`, `docs/COMPATIBILITY.md` and `docs/RELEASE_GATES.md`.

## Develop

```sh
npm run check
```

`schemas/*.json` are canonical. Rebuild their static data module using `npm run schemas:build`. Role-schema duplication inside the bundle is explicitly checked for equality. No dependencies or install scripts are required.

Japanese instructions: `README.ja.md`.
