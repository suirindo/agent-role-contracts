# External workflow evaluation evidence

- Evaluator / public repository:
- Date, OS, Node.js version:
- ARC core under evaluation: `@netsujo/agent-role-contracts@1.0.0`, exact commit `9f6771056c47de971202360952af6d41941f7625`
- Evaluation helper revision: exact `arc-kit` commit from `git -C arc-kit rev-parse HEAD`, or `NOT USED` if no helper was used (separate from the ARC core version above):
- Workflow and operational problem:
- Original trusted role/task/authority source:
- How source roles were mapped to ARC (including discrepancies):
- First task ID, representative scope, safe input SHA256:
- Expected PASS result (exact command and exit):
- Injected contradiction, expected diagnostic, observed FAIL (exact command and exit):
- Repaired PASS result (exact command and exit):
- Public immutable commit + CI link, or `UNAVAILABLE`:
- Outcome of current IAM, CI, sandbox and review controls on the **same** contradiction:
- Incremental finding, or evidence of redundancy:
- Measured setup minutes and maintenance minutes:
- False positives and unsupported semantics:
- Second *real* task ID and independently linked operation/CI, or `NOT RUN`:
- Same unchanged bundle reused for second task? `YES_WITH_EVIDENCE / NO / UNKNOWN`:
- Would the operator keep the check? Why:
- Secret/private data scrub verified? `YES / NO`:
- Evidence classification: `SELF_REPORTED / PUBLIC_CI_VERIFIED / INDEPENDENTLY_REPRODUCED`:
- Is this a recap of an earlier report, or a distinct new run? `RECAP / NEW_RUN`:
- Original files attached (not pasted JSON) and their `original_file_sha256` (bundle, task, output):
- Implementer and reviewer were the same person or process? `YES / NO / UNKNOWN` (if YES, independence was not exercised):
- Second task has a distinct objective, output and acceptance from the first? `YES / NO / NOT RUN`:
- Paths the stable grammar could not express, recorded as `UNSUPPORTED_REQUIRED_SCOPE`, or `NONE`:
- Known limits:

**Do not count a synthetic example or the kit's in-memory second declaration as actual external adoption or genuine second-task execution. A declaration PASS also does not prove real runtime authorization, reviewer identity, writes, effects or business outcome.**

## Compact result summary (detailed reports only)

Optional. A first report does not need this block, and the feedback form is unchanged. For a detailed report, add the five lines below so that the result still reads correctly when it is copied without this page. The values, their meanings and a worked example are defined in one place: [Compact result summary for a detailed report](README.md#compact-result-summary-for-a-detailed-report). This block defines nothing itself. Leave no line blank: provenance that is not stated is `UNKNOWN`, and a check nobody performed is `NOT_RUN` (`NOT RUN` in the fields above means the same).

- Implementation provenance, and the source of that classification:
- Execution scope, with the actual execution date and environment; if a recorded report was checked later, both dates:
- Stage and result, one line per stage that applies (declaration check, receiver or workflow execution, report checker, external-effect observation):
- Verification: the evidence classification above, then independent reproduction and independent code review or QC, each as a separate fact with a link:
- Provenance links: tested revision, and the reference or SHA-256 of each original artifact:
