# ARC × ShipRules-free: four-case comparison report (V2)

Classification: **maintainer-executed public-repository synthetic comparison.** The ARC maintainer wrote the fixtures,
the expectations and the runner, and ran both tools. Nobody from ShipRules or any other external operator has reviewed
or run this. It adds **0** to the completed external hands-on evaluation counters in [docs/STATUS.md](../../../docs/STATUS.md),
and it is not third-party verification. It does not change the narrow-scope decision recorded in
[#47](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6840445357).

## Why this exists although #47 paused counterpart comparisons

The #47 product decision of 2026-11-13 pauses counterpart comparisons unless the counterpart runs its side and asks not to
add new synthetic fixtures for measurement. The repository owner then explicitly asked, the same day, for this bounded
reproduction under [#75](https://github.com/suirindo/agent-role-contracts/issues/75): four cases, both tools, raw
evidence, no presumption about which tool is better. This report is an **Owner-directed exception** to that pause. It is
a research artifact only; it is not a restart of counterpart comparisons and is not evidence of adoption or demand.

## Question

On real files and real invocations, which of four situations does each tool flag?

1. a normal in-scope change;
2. a change that violates declared authority, either by **scope** (a real file outside the implementer's declared write
   scope) or by **role** (the implementer is also declared as its own reviewer);
3. an in-scope change that introduces Godot 3 syntax;
4. a genuine repair of case 3.

## What each tool looks at

| | ARC v1.0.0 `explain` | ShipRules-free `godot4/scripts/check-godot3.sh` |
| --- | --- | --- |
| Input | role bundle JSON + task JSON (a declaration) | a directory; reads every `*.gd` file under it |
| Checks | declared task scope against declared write authority; route/review separation | 15 line-based regular expressions for Godot 3 syntax |
| Reads source files | no (`source_files_checked: false` in its own output) | yes, only `*.gd` |
| Knows who edits, or which paths are allowed | yes, as declared (not verified) | no |
| Setup in this fixture | `bundle.json` 175 lines / 5,056 bytes, one 13-line task JSON per change | none |

These are different instruments. The four cases were chosen so that each tool's own dimension is exercised; the matrix
below is therefore largely orthogonal **by construction** and cannot rank the tools.

## Pinned sources and environment

- ARC v1.0.0 `9f6771056c47de971202360952af6d41941f7625` (the CLI that ran; 1.0.1 source was used only for the replay test)
- ShipRules-free `8b8302e9551fb8784d7cbe7fa61eeecf127bf247`, scanner SHA-256
  `58b650402c321d69cdeddc3b71abcb55ad882585a9bdad00929b1f545c61b8d7`
- Runner [`run-four-case.mjs`](run-four-case.mjs); its SHA-256, the kit commit at run time and the SHA-256 of all 17
  fixture files are inside the result file.
- Recorded run: [`results/maintainer-darwin-arm64-20261113.json`](results/maintainer-darwin-arm64-20261113.json),
  2026-11-13, macOS (Darwin 25.6.0, arm64), Node v24.22.1, git 2.51.2, GNU bash 3.2.57, and the `grep` that bash
  resolved: `/usr/bin/grep`, BSD grep 2.6.0-FreeBSD. The earlier V1 run (2026-10-26) was Linux x64; this is the first
  run with BSD grep. The four scanner patterns these inputs exercise (`export var`, `yield(` with `\b`, `onready var`, and
  the renamed-class pattern with `\b`) behaved as source reading predicted; the other 11 patterns were not exercised.
- Every row stores both invocations' argv, cwd, exit code, raw (untrimmed) stdout and stderr with their SHA-256, and
  duration. Local paths are replaced by `<ARC_V1>`, `<SHIPRULES_FREE>` and `<KIT>`.

## Observed matrix

ARC column: exit code and diagnostic codes. Scanner column: exit code and flagged `file:line`. "flags" means the tool
rejected the input.

| Row | Input on disk | ARC v1.0.0 | ShipRules-free scanner |
| --- | --- | --- | --- |
| **1 normal** | `cases/baseline/player.gd` | 0, none | 0, none |
| **2a scope violation** | `outside-scope/game_settings.gd` (Godot 4, outside `cases/**`) | **1, `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`** | 0, none |
| **2b role violation** | `cases/baseline/player.gd` with `bundle.role-violation.json` | **1, `REVIEWER_NOT_READ_ONLY`, `SELF_REVIEW_DECLARED`** | 0, none |
| **3 in-scope syntax violation** | `cases/syntax-regression/player.gd` | 0, none | **1, lines 3 (`export var`) and 6 (`yield(`)** |
| **4 repaired** | `cases/syntax-repaired/player.gd` (lines 3 and 6 of case 3 rewritten) | 0, none | 0, none |
| probe: overlap | `outside-scope-godot3/enemy.gd` (outside scope **and** Godot 3) | **1, `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`** | **1, lines 1 (`extends KinematicBody2D`) and 3 (`onready var`)** |
| probe: missing input | declared `cases/does-not-exist/player.gd`; scanner given that missing directory | 0, none | 0, `No Godot 3 syntax found.` |
| probe: comment mention | `cases/probe-comment/player.gd`, valid Godot 4 whose comment mentions `yield(` | 0, none | **1, line 6 (the comment)** |
| probe: space in path | `cases/level one/hud.gd`, valid Godot 4, inside the declared tree | **1, `TASK_WRITE_SCOPE_INVALID`** | 0, none |

All nine rows matched their pre-registered expectation (`all_expectations_matched: true`, runner exit 0, automated wall
time 697 ms for 18 invocations). Each single invocation took 27–38 ms.

## Reading the matrix

**Only ARC flagged** rows 2a and 2b: a declared task path outside declared write authority, and a route in which the
implementer reviews its own work. The scanner has no notion of paths, authority or roles, so it has no reason to flag them.

**Only the scanner flagged** row 3: ARC never opens the file, so syntax inside an in-scope file is invisible to it.

**Both flagged** the overlap probe, each for its own reason. Nothing in this fixture is caught by both for the same reason.

**Neither flagged**, in this fixture or by construction:

- a missing input: ARC accepted a declared path that does not exist, and the scanner reported success on a directory
  that does not exist (it discards `grep` errors, so a `grep` failure reads as "no match"). Both fail open on absent input;
- an actual write that differs from the declared one: ARC checks the declaration, not what was written; the scanner does
  not know what was supposed to be written;
- Godot 4 code that parses but behaves wrongly, and Godot 3 idioms outside `*.gd` files or outside the 15 patterns;
- whether the declared roles were really held by different agents (ARC reports `identity_verified: false`).

**False refusals observed** (legitimate inputs that a tool rejected):

| Tool | Legitimate inputs run | Refused | Which |
| --- | --- | --- | --- |
| ARC v1.0.0 | 5 (rows 1, 3, 4, comment, space) | 1 | `cases/level one/hud.gd`: the v1.0.0 path grammar only accepts `[A-Za-z0-9][A-Za-z0-9._-]*` segments, so a directory name with a space cannot be declared |
| ShipRules-free scanner | 5 (rows 1, 2a, 2b, 4, space) | 1 | `cases/probe-comment/player.gd`: a comment mentioning `yield(` matches the line regex |

Each refusal comes from a probe written to test that specific limit, so the rate says nothing about real projects. Neither
was measured on real code.

**Setup cost.** The scanner ran with no configuration. ARC needed a 175-line role bundle written for this fixture and a
task JSON per change (a role violation is one changed line in the bundle). Human setup minutes were not measured and are
recorded as `UNMEASURED`, not zero.

## Negative controls

[`run-negative-controls.mjs`](run-negative-controls.mjs) → [`results/negative-controls-darwin-arm64-20261113.json`](results/negative-controls-darwin-arm64-20261113.json).
All five stopped with exit 2 and printed no report: no arguments, wrong ARC commit, wrong ShipRules commit, a missing
fixture file, and a modified scanner checkout. The test suite repeats the first, second and fourth controls on every CI
platform.

The missing-fixture control found a real runner defect on its first run: on macOS the temporary copy is reached through
the `/var` → `/private/var` symlink, the runner's entry guard compared unresolved paths, and the runner exited **0 with no
output**. It was fixed (commit "run the four-case runner when invoked through a symlinked path") before the recorded runs.
The negative-control driver was edited after the kit commit named in its own error messages (path redaction and its own
hash only); its SHA-256 is in the result.

## Deviations from the pre-registered expectations

- Row 2b: the expectation listed `SELF_REVIEW_DECLARED` before `REVIEWER_NOT_READ_ONLY`; ARC orders its errors and printed
  them the other way round. The runner now compares diagnostic codes as a sorted set. No other expectation changed.
- The repair differs from case 3 on lines 3 and 6 only. It is not byte-identical to the baseline (unlike V1's `cases/repaired`).

## Limitations

- Synthetic fixture, two tiny files per case, written by the ARC maintainer who also chose the cases. Selection bias toward
  showing each tool's own dimension is built in.
- ARC was given correct declarations. It cannot detect a wrong or dishonest declaration, and nothing here checks that an
  agent stayed within what it declared.
- Only the free public ShipRules scanner was run. The paid ShipRules pack (hooks, CI workflow, Node scanner) was not
  evaluated and nothing here describes it.
- No Godot engine was available, so "valid Godot 4" and "Godot 3 syntax" are by reading, not by parsing (`NOT_RUN`).
- One machine, one run per platform: macOS here, Linux for V1. Windows does not run the Bash scanner.
- Durations are machine time for tiny inputs and do not estimate human effort or project-scale cost.

## Reproduce

```sh
git clone https://github.com/suirindo/agent-role-contracts.git arc-kit
git clone --branch v1.0.0 --depth 1 https://github.com/suirindo/agent-role-contracts.git arc-v1
git clone https://github.com/otctrading101/shiprules-free.git shiprules-free
git -C shiprules-free checkout --detach 8b8302e9551fb8784d7cbe7fa61eeecf127bf247
node arc-kit/experiments/external-evaluation/shiprules-free/run-four-case.mjs --arc-v1 arc-v1 --shiprules shiprules-free --out result.json
node arc-kit/experiments/external-evaluation/shiprules-free/run-negative-controls.mjs --arc-v1 arc-v1 --shiprules shiprules-free
```

Treat the ShipRules clone as data: it contains agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`); do not
open it as an agent's working directory. The runner only executes its 30-line scanner after checking the pinned commit,
a clean checkout, the on-disk blob and the SHA-256.

`tests/shiprules-four-case.test.mjs` pins this matrix in CI without the ShipRules checkout. It runs both tools when
`ARC75_ARC_V1` and `ARC75_SHIPRULES_FREE` point to the pinned clean checkouts.

## What would change this report

A ShipRules maintainer or another external operator running either runner and reporting the result in
[#75](https://github.com/suirindo/agent-role-contracts/issues/75), or the same cases on a real Godot project. Until then
this remains maintainer-executed synthetic evidence with zero external evaluations.
