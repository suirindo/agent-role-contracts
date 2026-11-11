# Recovery-safety synthetic simulator (experimental)

**Fully synthetic.** This simulator makes no claim about any real system or about ARC's runtime behavior. It adds no core, public API, schema or runtime adapter, sends nothing, and reads no clock (time is passed in). The feature-expansion hold (Issue47) stays in force. It is not a production test of readback or backlog control; ARC has no generic readback/backlog control.

## Rules encoded
- **Readback timeout stays UNKNOWN.** A `TIMEOUT` never becomes `NOT_FOUND`. While `UNKNOWN_HELD`, a same-operation retry and any dependent write are denied.
- **Stale or unmatched `NOT_FOUND` resolves nothing.** Absence counts (`CONFIRMED_ABSENT`) only if trusted, fresh and matching on operation id, target and attempt.
- **Resolution never grants replay.** Replay is a separate `decide` call that needs: matching operation id, absence still fresh, `VALID` metric, a separately verified authorization (injected `grantVerifier`) bound to the operation id, target, current attempt and its canonical identity digest, an unconsumed grant, and a new unused `nextAttempt`. A consumed grant stays burned. A new grant alone is not proof of non-execution.
- **Replay consumes the absence.** Before dispatch the outcome returns to `UNKNOWN_HELD`, the absence evidence is cleared and the operation is bound to `nextAttempt`. Another replay needs a new `NOT_FOUND` for that attempt observed strictly after the replay was sent; old-attempt evidence, pre-send evidence and `TIMEOUT` cannot permit it.
- **`begin` never overwrites.** A duplicate operation id is denied (`OP_DUPLICATE`) and the original identity, outcome and evidence are kept.
- **Backlog feed fails closed.** A stale, untrusted or unknown-validity metric (retention, latency or backlog) stops the feed, even with zero backlog. A refreshed metric does not auto-resume; `resume` is explicit. The sent metric timestamp is a high-water mark: a metric whose `ts` is equal (`METRIC_ALREADY_SENT`) or lower (`METRIC_OUT_OF_ORDER`) is never sent, so A→B→A does not resend A, including after stop/resume. Only sends move the mark; a zero-backlog no-op does not.

TTL is 60 minutes. Age `< TTL` is fresh; age `>= TTL` is expired; future-dated is unknown.

## Run
```sh
node --test tests/recovery-safety.test.mjs
```
Expected: 19 tests pass. Most denial tests assert the decision, the reason code and `dispatcher.count`; some assert outcome or feed state instead, and the validity table asserts only the classified state. Several tests include a positive control that corrects the denied fact(s); not every positive control differs by exactly one fact.

## Limits
Hand-written model of the rules, not ARC code. Passing shows the rules are internally consistent, not that any deployment implements them. `trusted` and `grantVerifier` stand in for trust roots a real system must supply. The identity digest is a canonical string, not a cryptographic hash. The exposed `ops`/`burned` Map/Set and the feed fields are for a trusted test harness only; the model does not defend against a caller mutating them.
