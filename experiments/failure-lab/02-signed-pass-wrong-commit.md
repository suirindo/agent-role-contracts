# A signed PASS for the wrong commit

[日本語の要約](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/02-signed-pass-wrong-commit.ja.md)

A reviewer signs a PASS receipt for commit A. The branch then moves to commit B, and the old receipt is still available. A host merge gate that only checks the signature would accept it. This entry reproduces the five decisions a gate has to make about that receipt.

This is a host-gate experiment. Agent Role Contracts (ARC) is not run here. ARC does not implement signed review receipts, and a valid signature is not independent review or permission to merge. The write-up was first published on DEV: [ARC Failure Lab #2: A signed PASS for the wrong commit](https://dev.to/netsujo/arc-failure-lab-2-a-signed-pass-for-the-wrong-commit-23lg).

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
node agent-role-contracts/experiments/failure-lab/02-signed-pass-wrong-commit/review-receipt-fixture.mjs
```

Requirement: Node.js 22 or newer. Nothing else is installed, and no network is used after the clone. The fixture file is byte for byte the code block in the DEV article.

| Case | Decision | Result |
| --- | --- | --- |
| Matching receipt | evidence only | PASS |
| Newer commit | stale candidate | PASS |
| Policy changed | stale policy | PASS |
| Other signer | untrusted signer | PASS |
| No receipt | pending | PASS |

Each row is an assertion that the gate returned the expected decision. The decision names are `EVIDENCE_MATCHED_ONLY`, `DENY_STALE_CANDIDATE`, `DENY_STALE_POLICY`, `DENY_UNTRUSTED_SIGNER` and `PENDING_MISSING_RECEIPT`. The success condition is called evidence only on purpose: a valid receipt is evidence about one subject.

## What this does and does not show

- ARC was not run. This experiment checks nothing about ARC.
- The reviewer and implementer keys are created by one local process. That does not show that two parties are independent.
- Signature verification does not show that a review took place, who held the private key, or that a key was registered or revoked correctly.
- The byte format of the signed fields is fixed only for this fixture. A real protocol needs a specified canonical encoding.
- It does not test concurrent use of one receipt or a lost response after an action. Those need durable identity and reconciliation.

## Full output

```text
PASS: matching reviewer receipt -> EVIDENCE_MATCHED_ONLY
PASS: valid receipt replayed on newer commit -> DENY_STALE_CANDIDATE
PASS: valid receipt after policy change -> DENY_STALE_POLICY
PASS: implementer uses its own signing key -> DENY_UNTRUSTED_SIGNER
PASS: receipt missing -> PENDING_MISSING_RECEIPT
5/5 fixture assertions passed. No merge or runtime execution was authorized.
```

Two runs are recorded. The published run was on 2026-11-17 with Node.js v22.16.0. The repository copy was re-run on 2026-11-28 with Node.js v24.11.1 on macOS (arm64), with the same five lines and exit code 0. The repository file was compared with the code block in the DEV article using `diff`, and the two are identical. Neither run was repeated on Linux or Windows.

## Where a real merge gate goes further

1. Subject: the receipt covers the exact candidate revision.
2. Authority: the reviewer and key were authorized for this task and still are.
3. Coverage: every required review and CI obligation is met. Missing evidence stays missing.
4. Currentness: a new commit or policy triggers re-verification instead of inheriting an old PASS.
5. Acceptance: the protected merge and any production check remain their own gates.

The DEV article also says the important control is not a producer name written inside the receipt. This fixture has no such field. The control is the pinned reviewer public key.

## Related

- Entry 03 asks who controls the check that produces a PASS: [03-candidate-controls-own-check.md](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/03-candidate-controls-own-check.md).
- Iliya Oblakov's [forged ACCEPT write-up](https://dev.to/iliyaoblakov/i-forged-a-codex-accept-with-four-lines-of-text-and-my-merge-check-passed-it-4odk) is where the discussion under this entry started. His two follow-up cases are credited in entry 03.
- The declaration-level counterpart of a stale approval is `npm run demo:binding --silent` in this repository. It executes no action and authenticates no reviewer or approver.

## Add a failure case

[ARC Failure Lab #1](https://github.com/suirindo/agent-role-contracts/issues/134) is open for one synthetic, self-contained example you can describe publicly. Report where ARC or a host gate cannot detect the failure too. Do not post credentials, private logs or confidential files. Report suspected vulnerabilities through [private security reporting](https://github.com/suirindo/agent-role-contracts/security/advisories/new), not in a public comment.
