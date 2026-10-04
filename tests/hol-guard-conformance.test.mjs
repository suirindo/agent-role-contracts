import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARC_FLOORS,
  GUARD_ACTIONS,
  boundaryClaim,
  classifyReceiptEvidence,
  composeGuardAction,
  consumeApproval,
  consumeApprovalWithAdmission,
  createApprovalBinding,
  createApprovalBindingForAdmission,
  evaluateProtectedAction,
  installRestriction,
  newAdmissionState,
  receiptIdentity,
  recoverAdmission,
  resolveRestrictionContext,
  revokeRestriction,
  verifyReceiptEvidence
} from './helpers/hol-guard-reference-model.mjs';
import { parseJsonRejectDuplicateKeys } from '../src/strict-json.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const vectors = parseJsonRejectDuplicateKeys(
  read('tests/fixtures/hol-guard-conformance-vectors.v1.json')
);
const guardBaseline = parseJsonRejectDuplicateKeys(
  read('tests/fixtures/hol-guard-audit-baseline.v1.json')
);
const canonicalContract = parseJsonRejectDuplicateKeys(
  read('tests/fixtures/hol-guard-integration-contract.v1.json')
);
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
    assert.equal(revoked.outcome, 'ok');
    const protectedAction = evaluateProtectedAction(revoked.state, input.context);
    return {
      revokeOutcome: revoked.outcome,
      protectedActionOutcome: protectedAction.outcome,
      protectedActionReason: protectedAction.reason
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
    return {
      outcome: recovered.outcome,
      reason: recovered.reason,
      current: recovered.state.current
    };
  }

  if (op === 'approval') {
    const binding = createApprovalBinding(input.binding);
    return consumeApproval(binding, input.current, { guardAuthenticationVerified: true });
  }

  if (op === 'approval-mismatch-set') {
    const binding = createApprovalBinding(input.binding);
    return {
      reasons: input.keys.map(key => {
        const current = clone(input.current);
        current[key] = current[key] + ':mismatch';
        return consumeApproval(binding, current, { guardAuthenticationVerified: true }).reason;
      })
    };
  }

  if (op === 'approval-revoked-admission') {
    const installed = installRestriction(newAdmissionState(), input.install);
    assert.equal(installed.outcome, 'ok');
    const created = createApprovalBindingForAdmission(installed.state, input.request);
    assert.equal(created.outcome, 'ok');
    const revoked = revokeRestriction(installed.state);
    assert.equal(revoked.outcome, 'ok');
    return consumeApprovalWithAdmission(created.binding, revoked.state, input.request, { guardAuthenticationVerified: true });
  }

  if (op === 'approval-fence') {
    const oldState = installRestriction(newAdmissionState(), input.install);
    assert.equal(oldState.outcome, 'ok');
    const oldBinding = createApprovalBindingForAdmission(oldState.state, input.request);
    assert.equal(oldBinding.outcome, 'ok');

    const newState = installRestriction(oldState.state, input.replacement);
    assert.equal(newState.outcome, 'ok');
    const oldAfterMutation = consumeApprovalWithAdmission(
      oldBinding.binding,
      newState.state,
      input.request,
      { guardAuthenticationVerified: true }
    );

    const newBinding = createApprovalBindingForAdmission(newState.state, input.request);
    assert.equal(newBinding.outcome, 'ok');
    const newAfterMutation = consumeApprovalWithAdmission(
      newBinding.binding,
      newState.state,
      input.request,
      { guardAuthenticationVerified: true }
    );

    const mixedState = {
      current: newState.state.current,
      durableFloorRevision: oldState.state.durableFloorRevision,
      durableFloorDigest: oldState.state.durableFloorDigest,
      revokedThroughRevision: oldState.state.revokedThroughRevision
    };
    const mixedAfterMutation = consumeApprovalWithAdmission(
      newBinding.binding,
      mixedState,
      input.request,
      { guardAuthenticationVerified: true }
    );

    return {
      oldAfterMutation: oldAfterMutation.outcome,
      oldReason: oldAfterMutation.reason,
      newAfterMutation: newAfterMutation.outcome,
      mixedAfterMutation: mixedAfterMutation.outcome,
      mixedReason: mixedAfterMutation.reason
    };
  }

  if (op === 'receipt') {
    const receipt = receiptIdentity(input.value);
    return {
      restrictionIdentity: receipt.canonical.restrictionIdentity,
      explicitOptionalAbsence: receipt.canonical.explicitOptionalAbsence
    };
  }

  if (op === 'receipt-classification') {
    const oldReceipt = receiptIdentity(input.old);
    return classifyReceiptEvidence(oldReceipt, input.current, { guardAuthenticationVerified: input.guardAuthenticationVerified === true });
  }

  if (op === 'receipt-currentness') {
    const oldReceipt = receiptIdentity(input.old);
    const currentReceipt = receiptIdentity(input.current);
    return {
      identitiesDiffer: oldReceipt.receiptIdentity !== currentReceipt.receiptIdentity
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

test('conformance vectors mirror the merged acceptance IDs without changing production status', () => {
  assert.equal(vectors.schema, 'arc-hol-guard-conformance-vectors.v1');
  assert.equal(vectors.status, 'test-only-reference-model');
  assert.equal(vectors.hol_guard_head, guardBaseline.hol_guard_head);
  assert.equal(vectors.arc_main, 'a8ee53e6ac9cdbbf83e79316cdcbbe60fc0aae82');
  assert.equal(vectors.production_acceptance, 'NOT_RUN');

  const canonicalIds = canonicalContract.acceptance_cases.map(row => row.id);
  assert.ok(canonicalContract.acceptance_cases.every(row => row.status === 'NOT_RUN'));
  assert.deepEqual(vectors.vectors.map(vector => vector.id), canonicalIds);
  assert.equal(packageJson.files.includes('tests'), false);
});

test('Guard action order is pinned to the exact audited source record', () => {
  assert.deepEqual(guardBaseline, {
    schema: 'hol-guard-audit-baseline.v1',
    hol_guard_head: '9260647758487a12381fbec31d53b65dd8106340',
    source_path: 'rust/crates/guard-runtime/src/policy_enforcement_matrix.rs',
    source_sha256: 'd0733befc410c9f173a50b003346f71d52a65e64ae5a7465e4ae834bc5093a20',
    action_floor_order: [
      'allow',
      'warn',
      'review',
      'require-reapproval',
      'sandbox-required',
      'block'
    ]
  });
  assert.deepEqual(GUARD_ACTIONS, guardBaseline.action_floor_order);
});

test('reference composition is monotonic for every audited Guard action', () => {
  assert.deepEqual(ARC_FLOORS, ['NoAdditionalFloor', 'Block']);
  for (const action of guardBaseline.action_floor_order) {
    assert.equal(composeGuardAction(action, 'NoAdditionalFloor'), action);
    assert.equal(composeGuardAction(action, 'Block'), 'block');
  }
});

for (const vector of vectors.vectors) {
  test(`${vector.id} reference vector`, () => {
    assert.deepEqual(runVector(vector), vector.expected);
  });
}

test('recovery rejects both older and newer current state when durable floor disagrees', () => {
  const digest1 = 'sha256:' + '1'.repeat(64);
  const digest2 = 'sha256:' + '2'.repeat(64);
  const digest3 = 'sha256:' + '3'.repeat(64);

  for (const current of [
    { revision: '1', digest: digest1, revoked: false },
    { revision: '3', digest: digest3, revoked: false }
  ]) {
    const recovered = recoverAdmission({
      current,
      durableFloorRevision: '2',
      durableFloorDigest: digest2,
      revokedThroughRevision: '0'
    });
    assert.equal(recovered.outcome, 'fail-closed');
    assert.equal(recovered.reason, 'ADMISSION_INCOHERENT');
    assert.equal(recovered.state.current, null);
  }
});

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

test('approval binding fails closed when required identity fields are absent', () => {
  assert.throws(
    () => createApprovalBinding({
      issuerDigest: 'sha256:' + 'c'.repeat(64),
      restrictionIdentity: 'restriction:N'
    }),
    error => error?.message === 'APPROVAL_BINDING_INVALID'
  );
});

test('approval consumption requires Guard authentication and an intact binding digest', () => {
  const base = {
    issuerDigest: 'sha256:' + 'c'.repeat(64),
    restrictionIdentity: 'revision:2:sha256:' + '2'.repeat(64),
    restrictionRevision: '2',
    restrictionDigest: 'sha256:' + '2'.repeat(64),
    subject: 'subject:A',
    actor: 'actor:A',
    session: 'session:A',
    workspace: 'workspace:A',
    canonicalTarget: '/workspace/a.txt',
    requestIdentity: 'request:A'
  };
  const binding = createApprovalBinding(base);
  const current = {
    ...base,
    existingAction: 'allow',
    arcFloor: 'NoAdditionalFloor'
  };

  assert.deepEqual(consumeApproval(binding, current), {
    outcome: 'reject',
    reason: 'APPROVAL_AUTHENTICATION_REQUIRED'
  });

  const forged = { ...binding, actor: 'actor:ATTACKER' };
  const forgedCurrent = { ...current, actor: 'actor:ATTACKER' };
  assert.deepEqual(
    consumeApproval(forged, forgedCurrent, { guardAuthenticationVerified: true }),
    { outcome: 'reject', reason: 'APPROVAL_BINDING_DIGEST_INVALID' }
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

test('receipt evidence is self-consistent historical evidence but never authority by itself', () => {
  const canonical = {
    guardDecisionIdentity: 'guard:decision:A',
    issuerDigest: 'sha256:' + 'c'.repeat(64),
    restrictionIdentity: 'restriction:N',
    subjectDigest: 'sha256:' + 'a'.repeat(64),
    scopeDigest: 'sha256:' + 'b'.repeat(64)
  };
  const receipt = receiptIdentity(canonical);
  assert.deepEqual(verifyReceiptEvidence(receipt, { guardAuthenticationVerified: true }), {
    outcome: 'ok',
    historicalEvidence: true
  });
  assert.deepEqual(classifyReceiptEvidence(receipt, canonical, { guardAuthenticationVerified: true }), {
    outcome: 'ok',
    historicalEvidence: true,
    currentAuthority: false,
    currentIdentityMatches: true
  });

  const tampered = {
    ...receipt,
    receiptIdentity: '0'.repeat(64)
  };
  assert.deepEqual(verifyReceiptEvidence(tampered, { guardAuthenticationVerified: true }), {
    outcome: 'reject',
    reason: 'RECEIPT_IDENTITY_INVALID'
  });
});

test('receipt verification requires Guard authentication and a closed privacy-safe shape', () => {
  const canonical = {
    guardDecisionIdentity: 'guard:decision:A',
    issuerDigest: 'sha256:' + 'c'.repeat(64),
    restrictionIdentity: 'restriction:N',
    subjectDigest: 'sha256:' + 'a'.repeat(64),
    scopeDigest: 'sha256:' + 'b'.repeat(64)
  };
  const receipt = receiptIdentity(canonical);
  assert.deepEqual(verifyReceiptEvidence(receipt), {
    outcome: 'reject',
    reason: 'RECEIPT_AUTHENTICATION_REQUIRED'
  });

  const privacyViolating = {
    ...receipt,
    canonical: { ...receipt.canonical, rawRoleBody: 'SECRET' }
  };
  assert.deepEqual(
    verifyReceiptEvidence(privacyViolating, { guardAuthenticationVerified: true }),
    { outcome: 'reject', reason: 'RECEIPT_CANONICAL_INVALID' }
  );
});

test('reference model does not claim execution-boundary acceptance', () => {
  for (const id of ['ARC-HG-34', 'ARC-HG-35', 'ARC-HG-36', 'ARC-HG-37']) {
    assert.deepEqual(boundaryClaim(id), {
      outcome: 'not-executable-in-reference-model',
      productionAcceptance: 'NOT_RUN'
    });
  }
});
