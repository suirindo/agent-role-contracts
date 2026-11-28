import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

// Synthetic identifiers; no real PR, credentials, agent or network request.
const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const runId = 'lab-run-001';
const policyV1 = 'review-policy-v1';
const policyV2 = 'review-policy-v2';

const reviewer = generateKeyPairSync('ed25519');
const implementer = generateKeyPairSync('ed25519');

// Deliberately fixed serialization for this small educational fixture.
// A production protocol needs a specified canonical encoding and key lifecycle.
function signedBytes(r) {
  return Buffer.from(JSON.stringify([
    1, r.runId, r.candidateSha, r.policyId, r.verdict
  ]), 'utf8');
}
function issue(receipt, privateKey) {
  return {
    receipt,
    signature: sign(null, signedBytes(receipt), privateKey),
  };
}
function inspect({ signedReceipt, currentSha, currentPolicy, pinnedReviewerKey }) {
  if (!signedReceipt?.receipt || !Buffer.isBuffer(signedReceipt.signature)) {
    return 'PENDING_MISSING_RECEIPT';
  }
  const { receipt, signature } = signedReceipt;
  if (!verify(null, signedBytes(receipt), pinnedReviewerKey, signature)) {
    return 'DENY_UNTRUSTED_SIGNER';
  }
  if (receipt.candidateSha !== currentSha) return 'DENY_STALE_CANDIDATE';
  if (receipt.policyId !== currentPolicy) return 'DENY_STALE_POLICY';
  if (receipt.verdict !== 'PASS') return 'DENY_REVIEW_NOT_PASS';
  return 'EVIDENCE_MATCHED_ONLY';
}
const receipt = {
  runId,
  candidateSha: shaA,
  policyId: policyV1,
  verdict: 'PASS',
};
const signedByReviewer = issue(receipt, reviewer.privateKey);
const signedByImplementer = issue(receipt, implementer.privateKey);
const cases = [
  ['matching reviewer receipt', signedByReviewer, shaA, policyV1, 'EVIDENCE_MATCHED_ONLY'],
  ['valid receipt replayed on newer commit', signedByReviewer, shaB, policyV1, 'DENY_STALE_CANDIDATE'],
  ['valid receipt after policy change', signedByReviewer, shaA, policyV2, 'DENY_STALE_POLICY'],
  ['implementer uses its own signing key', signedByImplementer, shaA, policyV1, 'DENY_UNTRUSTED_SIGNER'],
  ['receipt missing', null, shaA, policyV1, 'PENDING_MISSING_RECEIPT'],
];
for (const [label, input, currentSha, currentPolicy, expected] of cases) {
  const actual = inspect({
    signedReceipt: input,
    currentSha,
    currentPolicy,
    pinnedReviewerKey: reviewer.publicKey,
  });
  assert.equal(actual, expected, label);
  console.log(`PASS: ${label} -> ${actual}`);
}
console.log('5/5 fixture assertions passed. No merge or runtime execution was authorized.');
