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
- Known limits:

**Do not count a synthetic example or the kit's in-memory second declaration as actual external adoption or genuine second-task execution. A declaration PASS also does not prove real runtime authorization, reviewer identity, writes, effects or business outcome.**
