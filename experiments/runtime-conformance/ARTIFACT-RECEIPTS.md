# Read-only artifact observations with pinned-key receipts

Follow-up experiment to PR #60, separate from its fixed comparison candidate.
The collector reads bytes from one explicitly selected regular file and signs a
bounded receipt with Ed25519. Verification uses a public key pinned outside the
receipt and checks the expected run, subject, source, nonce, logical artifact
identity, digest and freshness. It never accepts a key supplied inside a receipt.

Run a real isolated report task on supported POSIX hosts:

```sh
node experiments/runtime-conformance/artifact-receipt-demo.mjs
node --test tests/artifact-observation-receipt.test.mjs
```

The demo executes ARC bundle validation, writes its actual JSON report into a fresh
temporary directory, measures the saved bytes, signs the observation and checks it
against an independently held pin and expected digest. It requires altered payloads
and foreign signing keys to fail. A new ephemeral key exists only in memory during
this exercise; it is not a deployed production collector identity. No credential
is loaded, displayed, exported or changed. Temporary data is removed at completion.

## API and claims

- `collectArtifactReceipt(explicitFilePath, metadataJson, collectorPrivateKey)`
  performs read-only collection; it has no directory discovery or application writes.
- `verifyArtifactReceipt(receiptJson, pinnedCollectorPublicKey, contextJson)`
  verifies a domain-separated canonical payload under an Ed25519 key.
- Private/public keys are trusted host arguments, never worker event fields.
  The receipt format is closed, and input text uses the existing strict bounded parser.
- `signature_valid` proves that the payload was signed under the pinned key.
  `binding_matches` and `freshness` are independent. Inspect errors as well.
  Valid signature alone does not make a stale, foreign-run or mismatched receipt acceptable.
- The signed content digest describes bytes read by this collector at observation
  time. The verifier does not reread the artifact; `content_bytes_verified=false`
  remains explicit. Byte measurement by a trusted collector and verifier-side byte
  checking are different operations.
- The collector does not observe a write syscall or prove that a tool/agent produced
  the file. It does not generate a fake `write` event for the #60 comparator.
  Logical `artifact_path`, source, run and subject are caller bindings, not discovered
  authorization or provenance. Private-key possession does not prove human/agent
  identity, workflow completeness, reviewer independence or runtime conformance.
- Signature verification does not change #60's `observed_conformance=unknown`.
  No production adoption, runtime permission, execution approval or replay prevention
  is claimed. Nonces are compared but not consumed in a durable store.

## File boundary

Collection requires `O_NOFOLLOW` and reads a maximum of 1 MiB plus one overflow
byte. Final-component symlinks, nonregular files and multiply linked files are
rejected. The same descriptor's size, inode/device, link count and nanosecond
change/modify metadata are checked before and after reading. Concurrent mutation
detected by those checks rejects collection. This is not a general filesystem
sandbox or an adversarial immutable snapshot: parent symlinks are not rejected,
the caller explicitly chooses a path, and a compromised host/key holder can lie.
Unsupported platforms fail closed rather than weakening the file-open policy.
The positive collector tests require O_NOFOLLOW; Windows fail-closed behavior is
tested separately. The existing ARC APIs retain their platform contract.

## Remaining real-runtime acceptance

Deploy a collector under an existing admitted runtime, provision/pin its key through
the host's normal identity mechanism, and map actual operation/handoff/review evidence
from a collection point outside worker control. Establish observed coverage and
failure behavior; measure additional cost. No production key creation/rotation,
host activation or user/customer data collection is performed by this experiment.
Those outcomes are not established by this local report task or signature unit tests.
