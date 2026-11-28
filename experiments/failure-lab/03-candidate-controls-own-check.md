# Can the candidate control the check that produces its own PASS?

[日本語の要約](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/03-candidate-controls-own-check.ja.md)

A merge gate runs the same command for every candidate: `node scripts/test.mjs`. The command never changes. But the script it calls lives in the candidate. A candidate that rewrites its own test step can report success without running a single test, and the gate records the same PASS line as before. This entry reproduces that in a throwaway directory, next to a check that the candidate does not control.

This case comes from Iliya Oblakov. On 2026-11-24 he reported it in the DEV discussion of [entry 02](https://dev.to/netsujo/arc-failure-lab-2-a-signed-pass-for-the-wrong-commit-23lg#comment-3m9mf), measured on his own local gate with `make test` and a candidate-owned Makefile. On 2026-11-27 he agreed to its use, and we chose to credit him. His forged ACCEPT write-up, where the thread started, is [here](https://dev.to/iliyaoblakov/i-forged-a-codex-accept-with-four-lines-of-text-and-my-merge-check-passed-it-4odk). The fixture below is our own synthetic adaptation in Node.js, not his Makefile. His results are his reported observations, and we did not re-run them.

This is a host-gate experiment. Agent Role Contracts (ARC) is not run here.

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
node agent-role-contracts/experiments/failure-lab/03-candidate-controls-own-check/run.mjs
```

Requirement: Node.js 22 or newer. Nothing else is installed, and no network is used after the clone. The demo writes only to a temporary directory and removes it when it ends. It runs no agent and no CI system.

Three synthetic candidates implement `add(a, b)`. Each has a test and a test step. Case B is faulty code whose test step was rewritten to print "all tests passed" and exit 0.

| Candidate | Its own test step | Trusted check |
| --- | --- | --- |
| A: good code | PASS | PASS |
| B: faulty, step rewritten | PASS | FAIL (exit 1) |
| C: faulty, honest step | FAIL (exit 1) | FAIL (exit 1) |

In case B the candidate's own step reports PASS while the behavior is wrong. The trusted check lives outside every candidate directory. It loads `src/add.mjs` and calls `add()` itself, so it does not read the candidate's tests or test step.

## What this does and does not show

- The outer command is identical in all three cases. An identical command line is not an identical check.
- The trusted check here is one local process run by the same user. It does not show operational independence of a real runner.
- One trusted oracle with three assertions is not proof that `add()` is correct.
- No real CI system, workflow file, runner ownership, dependency or cache was tested. The cache case is a separate follow-on and is `NOT_RUN`.
- ARC was not run, so this entry says nothing about what ARC reports.

## What ARC checked and did not

ARC was not run in this entry. The verdict comes from a check outside the candidate, not from ARC. ARC `explain` was not run on the changed test-step path, so there is no ARC result to report. Even a path inside the declared scope would leave the PASS self-produced. ARC does not judge test semantics, and it does not make a test suite immutable. The related discussion is [#138](https://github.com/suirindo/agent-role-contracts/issues/138).

## Why the same command is not the same check

A gate that trusts a command trusts a chain. Each link has an owner:

1. The outer command or workflow. In this fixture the gate owns it.
2. The scripts it invokes. The candidate owns `scripts/test.mjs`.
3. The test definitions. The candidate owns `tests/add.test.mjs`.
4. The runner inputs: dependencies, environment and caches. Not exercised here.
5. How the result is collected: an exit code from a runner, or text a script printed. Case B prints text and exits 0.

If any link belongs to the candidate, the PASS can be a statement by the candidate about itself.

## A fresh checkout is not execution identity

A fresh checkout gives a clean starting tree. It does not show that the code that ran is the code in the reviewed commit. Caches, generated files, ignored folders and installed dependencies are inputs too. This entry does not test them. The next candidate is the cache case that Iliya Oblakov also reported on 2026-11-27: an edit in the same modification second with the same file size, and a gitignored cache folder, that let an old result pass. That is `NOT_RUN`, and listing it here is not a publication date.

## Test your own gate

Use a throwaway repository, never your real pipeline.

1. List every file your outer command resolves to.
2. Mark which of them a candidate can change.
3. Check that your verdict comes from a runner and inputs the candidate cannot change, not from text the candidate prints.

## Full output

Run on 2026-11-28 with Node.js v24.11.1 on macOS (arm64), before this entry was merged. The demo exit code was 0. It is not the same as the `FAIL (exit 1)` lines, which are results for single checks.

```text
Entry 03 demo: the same outer command, node scripts/test.mjs, in three synthetic candidates.
Trusted check: oracle.mjs, held outside the candidates, calls src/add.mjs directly.

Case A: good code, honest test step
  Candidate's own test step (node scripts/test.mjs): PASS
  Trusted check (oracle.mjs on src/add.mjs): PASS

Case B: faulty code, test step rewritten to report success
  Candidate's own test step (node scripts/test.mjs): PASS
  Trusted check (oracle.mjs on src/add.mjs): FAIL (exit 1)

Case C: faulty code, honest test step
  Candidate's own test step (node scripts/test.mjs): FAIL (exit 1)
  Trusted check (oracle.mjs on src/add.mjs): FAIL (exit 1)

Result: in case B the candidate-controlled step reports PASS and the trusted check fails.
Demo complete: every observed result matched the expectation (demo exit 0).
Checked: the behavior of add() through one trusted oracle, and the outcome of each candidate step.
Not checked: any real CI system, who owns a real runner, caches, dependencies, or ARC (not run).
```

This was one run on one machine. It was not repeated on Linux or Windows. It is synthetic and written by the Netsujo maintainers, so it is not third-party validation, and it shows no runtime enforcement.

## Add a failure case

[ARC Failure Lab #1](https://github.com/suirindo/agent-role-contracts/issues/134) is open for one synthetic, self-contained example you can describe publicly. Report where ARC or a host gate cannot detect the failure too. Do not post credentials, private logs or confidential files. Report suspected vulnerabilities through [private security reporting](https://github.com/suirindo/agent-role-contracts/security/advisories/new), not in a public comment.
