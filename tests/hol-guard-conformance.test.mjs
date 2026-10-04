import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ARC_FLOORS,
  GUARD_ACTIONS,
  boundaryClaim,
  composeGuardAction,
  consumeApproval,
  createApprovalBinding,
  installRestriction,
  newAdmissionState,
  receiptIdentity,
  recoverAdmission,
  resolveRestrictionContext,
  revokeRestriction
} from './helpers/hol-guard-reference-model.mjs';
import { parseJsonRejectDuplicateKeys } from '../src/strict-json.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const vectors = parseJsonRejectDuplicateKeys(read('tests/fixtures/hol-guard-conformance-vectors.v1.json'));
const packageJson = JSON.parse(read('package.json'));

const clone = value => structuredClone(value);

function runVector(vector) {
  const { op, input } = vector;

  if (op === 'compose') {
    return { result: composeGuardAction(input.existingAction, input.arcFloor) };
  }

  if (op === 'compose-invalid-floor') {
    assert.throws(
      () => composeGuardAction(input.existingAction, input.arcFloor),
      error => error?.message === vector.expected.error
    );
    return vector.expected;
  }

  if (op === 'context') {
    return resolveRestrictionContext(input);
  }

  if (op === 'context-invalid-set') {
    return {
      reasons: input.states.map(state =>
        resolveRestrictionContext({ mode: input.mode, state }).reason
      )
    };
  }

  if (op === 'context-mismatch-set') {
    const reasons = input.keys.map(key => {
      const current = clone(input.current);
      current[key] = current[key] + ':mismatch';
      return resolveRestrictionContext({
        mode: input.mode,
        state: input.state,
        current,
        expected: input.expected
      }).reason;
    });
    return { reasons };
  }

  if (op === 'admission-rollback') {
    const first = installRestriction(newAdmissionState(), input.first);
    assert.equal(first.outcome, 'ok');
    const second = installRestriction(first.state, input.second);
    return {
      outcome: second.outcome,
      reason: second.reason,
      currentRevision: first.state.current.revision
    };
  }

  if (op === 'admission-reuse') {
    const first = installRestriction(newAdmissionState(), input.first);
    assert.equal(first.outcome, 'ok');
    const second = installRestriction(first.state, input.second);
    return {
      outcome: second.outcome,
      reason: second.reason,
      currentDigest: first.state.current.digest
    };
  }

  if (op === 'admission-replacement') {
    const first = installRestriction(newAdmissionState(), input.first);
    assert.equal(first.outcome, 'ok');
    const replacement = installRestriction(first.state, input.replacement);
    assert.equal(replacement.outcome, 'ok');
    const oldAgain = installRestriction(replacement.state, input.oldAgain);
    return {
      outcome: oldAgain.outcome,
      reason: oldAgain.reason,
      currentRevision: replacement.state.current.revision
    };
  }

  if (op === 'admission-revoke') {
    const installed = installRestriction(newAdmissionState(), input.install);
    assert.equal(installed.outcome, 'ok');
    const revoked = revokeRestriction(installed.state);
    return {
      revokeOutcome: revoked.outcome,
      currentRevoked: revoked.state.current.revoked
    };
  }

  if (op === 'admission-restart-floor') {
    const installed = installRestriction(newAdmissionState(), input.install);
    assert.equal(installed.outcome, 'ok');
    const recovered = recoverAdmission({
      current: input.restartCurrent,
      durableFloorRevision: installed.state.durableFloorRevision,
      durableFloorDigest: installed.state.durableFloorDigest,
      revokedThroughRevision: installed.state.revokedThroughRevision
    });
    const rollback = installRestriction(recovered.state, input.rollback);
    return {
      recoveryOutcome: recovered.outcome,
      rollbackOutcome: rollback.outcome,
      rollbackReason: rollback.reason
    };
  }

  if (op === 'admission-recovery-mixed') {
    const recovered = recoverAdmission(input.state);
    return { outcome: recovered.outcome, current: recovered.state.current };
  }

  if (op === 'approval') {
    const binding = createApprovalBinding(input.binding);
    return consumeApproval(binding, input.current);
  }

  if (op === 'approval-mismatch-set') {
    const binding = createApprovalBinding(input.binding);
    return {
      reasons: input.keys.map(key => {
        const current = clone(input.current);
        current[key] = current[key] + ':mismatch';
        return consumeApproval(binding, current).reason;
      })
    };
  }

  if (op === 'approval-race') {
    const oldBinding = createApprovalBinding(input.oldBinding);
    const newCurrent = {
      ...input.oldCurrent,
      restrictionIdentity: input.newRestrictionIdentity
    };
    const oldAgainstNew = consumeApproval(oldBinding, newCurrent);
    const newBinding = createApprovalBinding({
      ...input.oldBinding,
      restrictionIdentity: input.newRestrictionIdentity
    });
    const newAgainstNew = consumeApproval(newBinding, newCurrent);
    return {
      oldAgainstNew: oldAgainstNew.outcome,
      newAgainstNew: newAgainstNew.outcome
    };
  }

  if (op === 'receipt') {
    const receipt = receiptIdentity(input.value);
    return {
      restrictionIdentity: receipt.canonical.restrictionIdentity,
      explicitOptionalAbsence: receipt.canonical.explicitOptionalAbsence
    };
  }

  if (op === 'receipt-currentness') {
    const oldReceipt = receiptIdentity(input.old);
    const currentReceipt = receiptIdentity(input.current);
    return {
      identitiesDiffer: oldReceipt.receiptIdentity !== currentReceipt.receiptIdentity,
      ...(vector.expected.oldRemainsHistorical === true ? { oldRemainsHistorical: true } : {})
    };
  }

  if (op === 'receipt-redaction') {
    const receipt = receiptIdentity(input.value);
    const forbidden = ['rawRoleBody', 'credentials', 'fileContents'];
    return {
      leakedCanonicalKeys: forbidden.filter(
        key => Object.hasOwn(receipt.canonical, key)
      )
    };
  }

  if (op === 'receipt-absence') {
    const absent = receiptIdentity(input.absent);
    const present = receiptIdentity(input.present);
    return {
      identitiesDiffer: absent.receiptIdentity !== present.receiptIdentity,
      absenceFlag: absent.canonical.explicitOptionalAbsence
    };
  }

  if (op === 'boundary') {
    return boundaryClaim(vector.id);
  }

  throw new Error(`VECTOR_OP_UNKNOWN:${op}`);
}

test('conformance vector set is exact, test-only and remains production NOT_RUN', () => {
  assert.equal(vectors.schema, 'arc-hol-guard-conformance-vectors.v1');
  assert.equal(vectors.status, 'test-only-reference-model');
  assert.equal(vectors.hol_guard_head, '9260647758487a12381fbec31d53b65dd8106340');
  assert.equal(vectors.arc_main, 'a8ee53e6ac9cdbbf83e79316cdcbbe60fc0aae82');
  assert.equal(vectors.production_acceptance, 'NOT_RUN');
  assert.deepEqual(
    vectors.vectors.map(vector => vector.id),
    Array.from({ length: 37 }, (_, index) => `ARC-HG-${String(index + 1).padStart(2, '0')}`)
  );
  assert.equal(packageJson.files.includes('tests'), false);
});

test('reference composition is monotonic for every current Guard action', () => {
  assert.deepEqual(GUARD_ACTIONS, [
    'allow',
    'warn',
    'review',
    'require-reapproval',
    'sandbox-required',
    'block'
  ]);
  assert.deepEqual(ARC_FLOORS, ['NoAdditionalFloor', 'Block']);
  for (const action of GUARD_ACTIONS) {
    assert.equal(composeGuardAction(action, 'NoAdditionalFloor'), action);
    assert.equal(composeGuardAction(action, 'Block'), 'block');
  }
});

for (const vector of vectors.vectors) {
  test(`${vector.id} reference vector`, () => {
    assert.deepEqual(runVector(vector), vector.expected);
  });
}



test('durable revision floor also pins digest after current-state loss', () => {
  const digestA = 'sha256:' + 'a'.repeat(64);
  const digestB = 'sha256:' + 'b'.repeat(64);
  const installed = installRestriction(newAdmissionState(), {
    revision: '7',
    digest: digestA
  });
  assert.equal(installed.outcome, 'ok');

  const recovered = recoverAdmission({
    current: null,
    durableFloorRevision: installed.state.durableFloorRevision,
    durableFloorDigest: installed.state.durableFloorDigest,
    revokedThroughRevision: installed.state.revokedThroughRevision
  });
  assert.equal(recovered.outcome, 'fail-closed');

  assert.deepEqual(
    installRestriction(recovered.state, { revision: '7', digest: digestB }),
    { outcome: 'reject', reason: 'REVISION_REUSE' }
  );
});

test('receipt identity changes when authenticated issuer changes', () => {
  const base = {
    guardDecisionIdentity: 'guard:decision:A',
    issuerDigest: 'sha256:' + 'c'.repeat(64),
    restrictionIdentity: 'restriction:N',
    subjectDigest: 'sha256:' + 'a'.repeat(64),
    scopeDigest: 'sha256:' + 'b'.repeat(64)
  };
  const other = {
    ...base,
    issuerDigest: 'sha256:' + 'd'.repeat(64)
  };
  assert.notEqual(receiptIdentity(base).receiptIdentity, receiptIdentity(other).receiptIdentity);
});

test('reference model does not claim execution-boundary acceptance', () => {
  for (const id of ['ARC-HG-34', 'ARC-HG-35', 'ARC-HG-36', 'ARC-HG-37']) {
    assert.deepEqual(boundaryClaim(id), {
      outcome: 'not-executable-in-reference-model',
      productionAcceptance: 'NOT_RUN'
    });
  }
});
