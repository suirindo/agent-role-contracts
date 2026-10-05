# Agent Role Contracts

G0, G1, G2 and G3 are merged and implemented in repository main. Public preview `0.5.0-alpha.1` is published on npm under the `next` dist-tag; stable `latest` remains `0.1.0`. G2 filesystem-write remains an optional explicit `/adapters/filesystem-write` subpath and is not re-exported from root or `/core`. G3 provides generic core lifecycle declarations, not a runtime, state machine or authenticator. Publication does not imply production adoption, runtime permission, deployment, authenticated evidence or execution authority.

Check AI-agent roles, declared authority, task scope, review separation and handoffs with a general-purpose, offline core.

**Public preview: `0.5.0-alpha.1` on npm `next`.** Stable `latest` remains `0.1.0`. The current repository preserves the generic v0.1 role-contract profile and synchronous APIs, with onchain finance available as an optional v0.2 profile.

## Quick Start — three minutes

**Requirements:** Git and **Node.js 22.5 or newer**, with npm. Clone once, then run the demo:

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
npm --prefix agent-role-contracts run demo --silent
```

No `npm install`, API key, agent runtime or account is needed. Only cloning uses the network; the demo runs offline. The commands use Git and npm and do not require Bash, Docker or OS-specific tools.

### Expected output

```text
Agent Role Contracts: check a task before handing it to an agent.

1. Normal task
   Scope: src/example.mjs; allowed: src/**
   PASS: declarations are consistent.
   Implementer: implementer (write_scoped)
   Reviewer: reviewer (read_only; separate declared role)

2. Request an out-of-scope change
   Scope: secrets/production.txt; allowed: src/**
   FAIL (expected): TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY

3. Repair the task scope
   Scope: secrets/production.txt -> src/example.mjs
   PASS: declarations are consistent again.

Demo complete: PASS -> FAIL (expected) -> PASS.
Checks declarations only; execution is NOT authorized.
Next: docs/QUICKSTART.md (change the scope and rerun the checker).
```

The demo calls the real contract checker, repairs only the task JSON in memory and exits **0** when all three outcomes match. A missing fixture or unexpected result exits **2** with an actionable diagnostic. It opens no requested task-scope files and starts no agents.

### Try the published package instead (no clone)

To run the published `0.5.0-alpha.1` public preview without cloning the repository, start in an empty directory:

```sh
mkdir agent-role-contracts-first-check
cd agent-role-contracts-first-check
npm init --yes
npm install --ignore-scripts @netsujo/agent-role-contracts@next
npx --no-install agent-role-contracts explain \
  --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json \
  --task node_modules/@netsujo/agent-role-contracts/examples/starter-task.json \
  --format text
```

The last command prints `PASS: explain`. It checks the bundled two-role declaration; it does not authorize either role to run. To see the intended fail-closed result, replace `starter-task.json` with `starter-task-outside-scope.json`: the command reports `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` and exits **1**.

If `npm install` reports `EPERM` about root-owned files in a shared npm cache, do not use `sudo`. Retry with a cache local to this directory:

```sh
NPM_CONFIG_CACHE="$PWD/.npm-cache" npm install --ignore-scripts @netsujo/agent-role-contracts@next
```

The `next` channel currently resolves to `0.5.0-alpha.1`. Use `@netsujo/agent-role-contracts@0.5.0-alpha.1` when you need an immutable preview version. Stable `latest` remains `0.1.0`.

### Why it matters

A prompt can ask an agent to stay in `src/**`, while the next task requests a change elsewhere. This package turns those declarations into a repeatable check with a specific diagnostic. It also checks that the declared implementer and reviewer are different roles. A PASS means the declarations agree; your runtime must still enforce permissions and verify actual reviewer independence.

### Try your own task next

- [Change a task scope and check it yourself](docs/QUICKSTART.md).
- [Explore coordination and handoffs](#full-three-role-example).
- [Read the architecture and extraction boundary](docs/COMPATIBILITY.md).
- [Integrate the checker without treating PASS as execution permission](docs/INTEGRATION.md).
- [Contribute a focused improvement](CONTRIBUTING.md) or [open an issue](https://github.com/suirindo/agent-role-contracts/issues).

## General-purpose core and optional profiles

Agent Role Contracts has a general-purpose core for role, authority, task-scope, review and handoff declarations. Software development, data processing and support drafting use the same core; onchain finance is one optional profile.

Run three non-financial examples using the existing contracts:

```sh
npm --prefix agent-role-contracts run demo:general --silent
```

The published `0.5.0-alpha.1` preview provides `@netsujo/agent-role-contracts/core` and the optional `@netsujo/agent-role-contracts/profiles/onchain-finance` entrypoint. The root import remains backward compatible. `/core` does not load financial modules or schemas; the compatibility root still includes the existing finance exports. These subpaths are not claimed to exist in an older installed npm version.

The examples validate declarations about output files; they do not execute business tasks, send messages or verify artifacts. See the [architecture and evolution design](docs/ARCHITECTURE.md).

## G1 task/action binding

G0 core isolation and G1 task/action binding are **merged and implemented**; source merge does not imply registry release or adoption. The [non-financial binding demo](examples/action-binding/demo.mjs) reuses generic fixtures for software change, data cleaning and support drafting:

```sh
node examples/action-binding/demo.mjs
```

The core exports async `/core` APIs `describeTaskAction(bundleJson, taskJson, actionJson)` and `validateTaskActionBinding(bundleJson, taskJson, actionJson, bindingJson)`. Run `npm run demo:binding`. Action and binding JSON use `schema_version: "0.3"`; the binding profile is `task-action/0.3`. The public preview is published on npm under `next`. Action IDs do not establish task/run replay identity; replay policy remains external.

For each case, the demo obtains a digest, declares a routed reviewer pass and required approval from `route.accountable`, checks PASS, then changes a meaningful task input or action parameter and rejects the unchanged binding with `G1_SUBJECT_MISMATCH`. The complete canonical subject covers the profile, **full bundle (including policy, roles and routes), full task and declared action**. Review and approval declarations must bind that current subject.

The digest provides integrity, not authenticity or authorization. The demo executes no action and authenticates no reviewer or approver. Flat scalar action parameters are declarations only: G2 supplies a narrow filesystem-write adapter described below; parameter names alone do not establish tool behavior or resource permissions. Artifact paths and URLs are not immutable evidence; exact artifact bytes need separate integrity handling by a trusted integration. G1 remains general-purpose, with finance an optional profile.

## G2 filesystem-write adapter

G2 filesystem-write is **merged and implemented in repository main**; npm public-preview publication is complete; production adoption is still not claimed. It is the first concrete adapter because the existing portable relative scope semantics cover software changes, data cleaning and support drafts without industry schemas. G3 lifecycle is also merged and implemented in repository main; publication and adoption remain separate.

The integration API is an optional import:

```js
import { validateFilesystemWriteMapping } from '@netsujo/agent-role-contracts/adapters/filesystem-write';
const result = await validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, mappingJson);
```

Profile `filesystem-write/0.1` uses mapping `schema_version: "0.1"`. The G1 action uses `schema_version: "0.3"`, kind `filesystem-write` and exactly `{path, content_sha256}` parameters. The mapping declares `subject_digest`, operation `write_file`, and the same `path` and `content_sha256`. The adapter supports exactly this one operation, rejects unknown parameters or semantics, and checks declared task scope and eligible executor authority. It does not support arbitrary SaaS, database, API or other resource semantics.

`content_sha256` is a caller-supplied declared integrity identity. No output bytes are read or verified, and no filesystem state or path existence is checked. Mapping PASS means declaration consistency; it grants no permission, performs no execution and implies no review approval. Executor identity and permissions remain unauthenticated and unenforced. G1 review/approval binding remains a separate check against the complete current subject; the adapter does not synthesize it. Finance and Safe remain optional profiles.

The [filesystem demo](examples/filesystem-write-adapter/demo.mjs) reuses the generic scenario builder and fixtures for `src/example.mjs`, `reports/cleaned.csv` and `drafts/reply.md`. Each accepts a matching mapping and requires a specific failure after changing its path or content digest. The digests are fictional and the target files are never opened or written:

```sh
node examples/filesystem-write-adapter/demo.mjs
```

The published `0.5.0-alpha.1` preview includes the optional adapter subpath. See the [example notes](examples/filesystem-write-adapter/README.md).

## G3 lifecycle declarations

G3 lifecycle is **merged, implemented, and included in the published `0.5.0-alpha.1` public preview**; production adoption is still not claimed. The [lifecycle demo and API notes](examples/task-lifecycle/README.md) reuse software change, data cleaning and support drafting, showing three PASS results plus stale-subject and conflicting-artifact failures:

```sh
npm run demo:lifecycle
```

The published `0.5.0-alpha.1` preview provides root and `/core` exports `describeTaskAction`, `describeTaskLifecycle` and `validateTaskLifecycle`. Lifecycle schema version is `0.4`, profile `task-lifecycle/0.4`; subject binding uses the current G1 digest. G2 filesystem-write is included through its optional subpath. Finance and Safe are optional.

Lifecycle PASS means declaration consistency, not event truth, authentication, artifact byte verification or runtime acceptance. External `run_id` is caller-supplied correlation, not replay protection. Event decisions are declarations, not authenticated events. Artifact `sha256` is declared identity; bytes are not read or verified, and locators are inert. Lifecycle consistency, artifact identity consistency, authenticity and runtime acceptance are separate. No action executes, no identity/review/approval is verified, and no timestamps, clock checks or state-machine ordering are provided. Public-preview package publication is complete; runtime adoption and execution remain separate.

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

## Optional onchain finance preview

Check a declared treasury payment or token-allowance proposal against chain, sender, recipient/spender, asset, amount and fee limits. Simulation, independent-role review and human approval bind to a SHA-256 subject covering the complete bundle, task, financial policy and proposal. The optional Safe profile matches the supported fields of a supplied single CALL envelope to an approved intent; it does not verify canonical Safe serialization or a Safe transaction hash.

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
npm --prefix agent-role-contracts run demo:finance --silent
npm --prefix agent-role-contracts run demo:safe --silent
```

The finance demo includes a normal payment, wrong-chain and over-limit proposals, an unlimited allowance, stale review binding, refreshed fictional declarations, a matching execution receipt and a mismatched execution nonce. The Safe demo checks the exact proposal target, native value, calldata, CALL operation, chain, Safe address and nonce. No install, wallet, API key or provider account is needed after cloning. Requirements: Git and Node.js 22.5 or newer with npm.

This is an offline declaration preflight for native transfers, standard ERC-20 transfers and bounded ERC-20 approvals. Amounts use exact uint256 decimal strings. Execution receipts are supplied declarations, not authenticated chain data. A PASS does not verify chain state, prove simulation/approval/receipt authenticity, sign, broadcast, enforce limits or establish financial safety. [Use the financial profile and API](examples/onchain-finance/README.md).

The v0.1 profile checks declared roles, authority, review separation, task scope and handoffs. It does not grant runtime authority, authenticate identity, execute agents or replace an existing company Agent OS.

## Boundaries

Checks cover structure, duplicate IDs and aliases, authority contradictions, role references and cycles, explicit routes, declared self-review, required/conditional inputs, registered knowledge references and task-bound handoff consistency. Unknown task types fail rather than silently falling back. Input fields are checked against every routed role; staged production of later inputs is not implemented. For routed `write_scoped` or `operator` executors, `inputs.scope` must be one portable relative scope contained by that executor's declared `allowed_write_scopes`. A `write_scoped` or `operator` role must also actually allow at least one capability that the bundle policy lists in `read_only_forbids`; the Core does not guess write semantics from capability names. This is declaration-level containment only: no filesystem path is opened, no glob is expanded and no runtime access is granted. `human_only` roles must declare both executable `capabilities` and `allowed_write_scopes` as empty; they represent human decision/approval boundaries, not machine mutation authority.

A PASS checks declarations only. Every result states that execution authorization, runtime enforcement, identity verification, evidence verification, source-file checks, sensitive-data scanning and output-schema validation are false. A knowledge URI is not fetched or resolved against the filesystem. `output_schema` is retained metadata, not an executed user schema. No scoring purports to measure model quality.

The runtime-specific declaration check is intentionally finite. It detects a small generic set of runtime configuration keys and selected `.claude` / `.codex` path forms. It is not proof that a declaration is universally runtime-neutral, and it is not a security, secret, malware or prompt-safety scanner.

Role `body` text is inline. The public contract has no prompt-file path field, and the Core does not discover `ROLE.md` or any other role file.

The package imports no company configuration and performs no application I/O at core import time. Node still loads its JavaScript modules. The core does not open application files. The CLI opens only explicitly supplied regular files; the quickstart runner reads the three bundled starter fixtures named in its source. Neither executes evidence `command` strings, invokes agents or writes configuration. The CLI rejects a stable last-component symlink on supported CI platforms. POSIX keeps `O_NOFOLLOW`; Windows additionally uses a pre-open `lstat` check. This is not a general filesystem sandbox, and the Windows pre-check is not claimed to prevent a hostile process from swapping a path between inspection and open. The JSON-text-only API rejects executable objects and never loads JavaScript configuration.

## Install

For the published preview, check the live dist-tags and use the exact preview version or `next`:

```sh
npm view @netsujo/agent-role-contracts dist-tags --json
npm install @netsujo/agent-role-contracts@0.5.0-alpha.1
# or: npm install @netsujo/agent-role-contracts@next
```

The unversioned package name follows `latest`, which currently remains the stable `0.1.0` release.

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
