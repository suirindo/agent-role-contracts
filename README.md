# Agent Role Contracts

**Catch out-of-scope agent tasks, self-review, and stale handoffs before execution.**

Agent workflows become harder to trust when one assistant turns into multiple roles with different authority, task scopes, review duties, and handoffs. Prompt instructions can say “write only inside `src/**`” while the next task points at `secrets/production.txt`, or claim independent review while implementation and review route through the same role.

Agent Role Contracts turns those contradictions into deterministic, offline preflight checks.

| Workflow mistake | What ARC checks |
| --- | --- |
| A task requests a write outside declared authority | Rejects it with a specific scope diagnostic |
| Implementer and reviewer collapse into one declared role | Rejects the invalid role separation |
| A reviewed task or action changes afterward | Rejects the stale subject binding |
| A filesystem mapping drifts from the declared action | Rejects the declaration mismatch |
| Lifecycle or handoff declarations become stale | Fails closed on the inconsistency |

**If an agent is only chatting, you probably do not need ARC yet. If it can act, hand off, or review, prompt-only rules become much harder to trust.**

No API key, agent runtime, or account is required for the starter. A PASS means the supplied declarations are internally consistent under the checks you ran; it does **not** grant runtime permission, authenticate an executor or reviewer, verify evidence, or authorize execution.

**Stable package line: `0.5.0`.** npm stable installs use the `latest` dist-tag. The stable package includes the general core plus G1 task/action binding, the optional G2 `/adapters/filesystem-write` mapping, and G3 lifecycle declarations. Onchain finance remains an optional profile.

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

To run the stable `0.5.0` package without cloning the repository, start in an empty directory:

```sh
mkdir agent-role-contracts-first-check
cd agent-role-contracts-first-check
npm init --yes
npm install --ignore-scripts @netsujo/agent-role-contracts@0.5.0
npx --no-install agent-role-contracts explain \
  --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json \
  --task node_modules/@netsujo/agent-role-contracts/examples/starter-task.json \
  --format text
```

The last command prints `PASS: explain`. It checks the bundled two-role declaration; it does not authorize either role to run. To see the intended fail-closed result, replace `starter-task.json` with `starter-task-outside-scope.json`: the command reports `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` and exits **1**.

If `npm install` reports `EPERM` about root-owned files in a shared npm cache, do not use `sudo`. Retry with a cache local to this directory:

```sh
NPM_CONFIG_CACHE="$PWD/.npm-cache" npm install --ignore-scripts @netsujo/agent-role-contracts@0.5.0
```

npm `latest` is the stable install channel. Use `@netsujo/agent-role-contracts@0.5.0` when you need an immutable version.

### Why it matters

A prompt can ask an agent to stay in `src/**`, while the next task requests a change elsewhere. This package turns those declarations into a repeatable check with a specific diagnostic. It also checks that the declared implementer and reviewer are different roles. A PASS means the declarations agree; your runtime must still enforce permissions and verify actual reviewer independence.

### Project direction

Netsujo is building trustworthy infrastructure for AI agents in the real world. Agent Role Contracts is the public, narrow declaration-checking layer of that direction: make role, authority, scope, review separation and handoffs explicit enough to validate before relying on them.

This project does not turn a declaration PASS into runtime authority. Identity, permissions, side-effect enforcement, evidence authenticity and business acceptance remain separate responsibilities. The project earns broader claims only when those boundaries are integrated and verified in the specific execution environment.

### Try your own task next

- [Change a task scope and check it yourself](docs/QUICKSTART.md).
- [Evaluate one real workflow](docs/EVALUATE-WORKFLOW.md) without treating a declaration PASS as runtime authority.
- [Reproduce five concrete failure cases](docs/FAILURE-CASES.md), including scope drift, declared self-review and stale subject binding.
- [Share real-workflow feedback](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml), including cases where your existing controls are already enough.
- [Explore coordination and handoffs](#full-three-role-example).
- [Read the architecture and extraction boundary](docs/COMPATIBILITY.md).
- [Integrate the checker without treating PASS as execution permission](docs/INTEGRATION.md).
- [Contribute a focused improvement](CONTRIBUTING.md) or [open an issue](https://github.com/suirindo/agent-role-contracts/issues).

If the checker catches something you would want to catch again, [star the repository](https://github.com/suirindo/agent-role-contracts) to keep it handy, and share the workflow result so the next change is driven by evidence rather than feature speculation.

## General-purpose core and optional profiles

Agent Role Contracts has a general-purpose core for role, authority, task-scope, review and handoff declarations. Software development, data processing and support drafting use the same core; onchain finance is one optional profile.

Run three non-financial examples using the existing contracts:

```sh
npm --prefix agent-role-contracts run demo:general --silent
```

The stable `0.5.0` release provides `@netsujo/agent-role-contracts/core` and the optional `@netsujo/agent-role-contracts/profiles/onchain-finance` entrypoint. The root import remains backward compatible. `/core` does not load financial modules or schemas; the compatibility root still includes the existing finance exports. These subpaths are not claimed to exist in an older installed npm version.

The examples validate declarations about output files; they do not execute business tasks, send messages or verify artifacts. See the [architecture and evolution design](docs/ARCHITECTURE.md).

## G1 task/action binding

G0 core isolation and G1 task/action binding are **merged and implemented**; source merge does not imply registry release or adoption. The [non-financial binding demo](examples/action-binding/demo.mjs) reuses generic fixtures for software change, data cleaning and support drafting:

```sh
node examples/action-binding/demo.mjs
```

The core exports async `/core` APIs `describeTaskAction(bundleJson, taskJson, actionJson)` and `validateTaskActionBinding(bundleJson, taskJson, actionJson, bindingJson)`. Run `npm run demo:binding`. Action and binding JSON use `schema_version: "0.3"`; the binding profile is `task-action/0.3`. The stable release is part of the `0.5.0` stable package. Action IDs do not establish task/run replay identity; replay policy remains external.

For each case, the demo obtains a digest, declares a routed reviewer pass and required approval from `route.accountable`, checks PASS, then changes a meaningful task input or action parameter and rejects the unchanged binding with `G1_SUBJECT_MISMATCH`. The complete canonical subject covers the profile, **full bundle (including policy, roles and routes), full task and declared action**. Review and approval declarations must bind that current subject.

The digest provides integrity, not authenticity or authorization. The demo executes no action and authenticates no reviewer or approver. Flat scalar action parameters are declarations only: G2 supplies a narrow filesystem-write adapter described below; parameter names alone do not establish tool behavior or resource permissions. Artifact paths and URLs are not immutable evidence; exact artifact bytes need separate integrity handling by a trusted integration. G1 remains general-purpose, with finance an optional profile.

## G2 filesystem-write adapter

G2 filesystem-write is **merged and implemented in repository main**; G2 is included in the `0.5.0` stable package; production adoption is still not claimed. It is the first concrete adapter because the existing portable relative scope semantics cover software changes, data cleaning and support drafts without industry schemas. G3 lifecycle is also merged and implemented in repository main and included in the `0.5.0` stable release; production adoption remains separate.

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

The stable `0.5.0` release includes the optional adapter subpath. See the [example notes](examples/filesystem-write-adapter/README.md).

## G3 lifecycle declarations

G3 lifecycle is **merged, implemented, and included in the `0.5.0` stable release**; production adoption is still not claimed. The [lifecycle demo and API notes](examples/task-lifecycle/README.md) reuse software change, data cleaning and support drafting, showing three PASS results plus stale-subject and conflicting-artifact failures:

```sh
npm run demo:lifecycle
```

The stable `0.5.0` release provides root and `/core` exports `describeTaskAction`, `describeTaskLifecycle` and `validateTaskLifecycle`. Lifecycle schema version is `0.4`, profile `task-lifecycle/0.4`; subject binding uses the current G1 digest. G2 filesystem-write is included through its optional subpath. Finance and Safe are optional.

Lifecycle PASS means declaration consistency, not event truth, authentication, artifact byte verification or runtime acceptance. External `run_id` is caller-supplied correlation, not replay protection. Event decisions are declarations, not authenticated events. Artifact `sha256` is declared identity; bytes are not read or verified, and locators are inert. Lifecycle consistency, artifact identity consistency, authenticity and runtime acceptance are separate. No action executes, no identity/review/approval is verified, and no timestamps, clock checks or state-machine ordering are provided. Stable package publication is complete; runtime adoption and execution remain separate.

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

For the published stable release, use either the exact version or the `latest` channel:

```sh
npm view @netsujo/agent-role-contracts dist-tags --json
npm install @netsujo/agent-role-contracts@0.5.0
# or: npm install @netsujo/agent-role-contracts
```

The unversioned package name follows `latest`, which currently resolves to the stable `0.5.0` release.

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
