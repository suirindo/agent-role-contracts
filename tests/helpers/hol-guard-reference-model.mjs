import { createHash } from 'node:crypto';

export const GUARD_ACTIONS = Object.freeze([
  'allow',
  'warn',
  'review',
  'require-reapproval',
  'sandbox-required',
  'block'
]);

export const ARC_FLOORS = Object.freeze(['NoAdditionalFloor', 'Block']);

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const REVISION_RE = /^(0|[1-9][0-9]*)$/;

const reject = reason => Object.freeze({ outcome: 'reject', reason });
const ok = floor => Object.freeze({ outcome: 'ok', floor });

const parseRevision = value => {
  if (typeof value !== 'string' || !REVISION_RE.test(value)) return null;
  return BigInt(value);
};

const isDigest = value => typeof value === 'string' && DIGEST_RE.test(value);

export function composeGuardAction(existingAction, arcFloor) {
  if (!GUARD_ACTIONS.includes(existingAction)) throw new Error('GUARD_ACTION_INVALID');
  if (!ARC_FLOORS.includes(arcFloor)) throw new Error('ARC_FLOOR_INVALID');
  return arcFloor === 'Block' ? 'block' : existingAction;
}

export function resolveRestrictionContext(input) {
  const {
    mode,
    state,
    absenceAuthenticated = false,
    current = {},
    expected = {},
    restrictionBlock = false,
    guardCanonicalTargetInScope = true
  } = input;

  if (!['required', 'optional'].includes(mode)) return reject('MODE_INVALID');

  if (state === 'absent') {
    if (mode === 'optional' && absenceAuthenticated) return ok('NoAdditionalFloor');
    return reject('CONTEXT_ABSENCE_NOT_AUTHENTICATED');
  }

  if (state === 'missing') return reject('CONTEXT_MISSING');
  if (state === 'malformed') return reject('CONTEXT_MALFORMED');
  if (state === 'stale') return reject('CONTEXT_STALE');
  if (state === 'revoked') return reject('CONTEXT_REVOKED');
  if (state !== 'present') return reject('CONTEXT_STATE_INVALID');

  for (const key of ['issuer', 'subject', 'actor', 'session', 'workspace']) {
    if (expected[key] !== undefined && current[key] !== expected[key]) {
      return reject(`${key.toUpperCase()}_MISMATCH`);
    }
  }

  if (!guardCanonicalTargetInScope) return ok('Block');
  return ok(restrictionBlock ? 'Block' : 'NoAdditionalFloor');
}

export function newAdmissionState() {
  return Object.freeze({
    current: null,
    durableFloorRevision: '0',
    durableFloorDigest: null,
    revokedThroughRevision: '0'
  });
}

function admissionCoherence(state) {
  const floor = parseRevision(state?.durableFloorRevision);
  const revokedThrough = parseRevision(state?.revokedThroughRevision);
  if (floor === null || revokedThrough === null) return reject('ADMISSION_STATE_INVALID');

  if (state.current === null) return reject('CONTEXT_MISSING');
  if (!state.current || typeof state.current !== 'object') return reject('ADMISSION_STATE_INVALID');

  const currentRevision = parseRevision(state.current.revision);
  if (currentRevision === null || !isDigest(state.current.digest)) {
    return reject('ADMISSION_STATE_INVALID');
  }

  if (state.current.revoked === true || currentRevision <= revokedThrough) {
    return reject('CONTEXT_REVOKED');
  }

  if (
    currentRevision !== floor ||
    !isDigest(state.durableFloorDigest) ||
    state.current.digest !== state.durableFloorDigest
  ) {
    return reject('ADMISSION_INCOHERENT');
  }

  return Object.freeze({
    outcome: 'ok',
    revision: state.current.revision,
    digest: state.current.digest,
    restrictionIdentity: `revision:${state.current.revision}:${state.current.digest}`
  });
}

export function installRestriction(state, { revision, digest }) {
  const next = parseRevision(revision);
  const floor = parseRevision(state?.durableFloorRevision);
  const revokedThrough = parseRevision(state?.revokedThroughRevision);
  if (next === null || floor === null || revokedThrough === null) {
    return reject('REVISION_INVALID');
  }
  if (!isDigest(digest)) return reject('DIGEST_INVALID');

  if (next < floor || next <= revokedThrough) return reject('REVISION_ROLLBACK');
  if (
    next === floor &&
    floor > 0n &&
    state.durableFloorDigest !== null &&
    digest !== state.durableFloorDigest
  ) return reject('REVISION_REUSE');

  if (state.current) {
    const currentRevision = parseRevision(state.current.revision);
    if (currentRevision === null || !isDigest(state.current.digest)) {
      return reject('ADMISSION_STATE_INVALID');
    }
    if (next < currentRevision) return reject('REVISION_ROLLBACK');
    if (next === currentRevision) {
      if (digest !== state.current.digest) return reject('REVISION_REUSE');
      if (state.current.revoked === true) return reject('REVISION_ROLLBACK');
      return Object.freeze({ outcome: 'ok', state });
    }
  }

  return Object.freeze({
    outcome: 'ok',
    state: Object.freeze({
      current: Object.freeze({ revision, digest, revoked: false }),
      durableFloorRevision: revision,
      durableFloorDigest: digest,
      revokedThroughRevision: state.revokedThroughRevision
    })
  });
}

export function revokeRestriction(state) {
  const coherence = admissionCoherence(state);
  if (coherence.outcome !== 'ok') return coherence;

  const revision = state.current.revision;
  return Object.freeze({
    outcome: 'ok',
    state: Object.freeze({
      current: Object.freeze({ ...state.current, revoked: true }),
      durableFloorRevision: state.durableFloorRevision,
      durableFloorDigest: state.durableFloorDigest,
      revokedThroughRevision:
        BigInt(revision) > BigInt(state.revokedThroughRevision)
          ? revision
          : state.revokedThroughRevision
    })
  });
}

export function recoverAdmission({
  current,
  durableFloorRevision,
  durableFloorDigest = null,
  revokedThroughRevision
}) {
  const preserved = Object.freeze({
    current: null,
    durableFloorRevision,
    durableFloorDigest,
    revokedThroughRevision
  });

  const coherence = admissionCoherence({
    current,
    durableFloorRevision,
    durableFloorDigest,
    revokedThroughRevision
  });

  if (coherence.outcome !== 'ok') {
    return Object.freeze({
      outcome: 'fail-closed',
      reason: coherence.reason,
      state: preserved
    });
  }

  return Object.freeze({
    outcome: 'ok',
    state: Object.freeze({
      current: Object.freeze({ ...current }),
      durableFloorRevision,
      durableFloorDigest,
      revokedThroughRevision
    })
  });
}

export function evaluateProtectedAction(admissionState, contextInput) {
  const coherence = admissionCoherence(admissionState);
  if (coherence.outcome !== 'ok') return coherence;

  const context = resolveRestrictionContext({
    ...contextInput,
    state: 'present'
  });
  if (context.outcome !== 'ok') return context;

  return Object.freeze({
    outcome: 'ok',
    floor: context.floor,
    restrictionIdentity: coherence.restrictionIdentity
  });
}

const stableIdentity = value => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const APPROVAL_STRING_KEYS = Object.freeze([
  'restrictionIdentity',
  'subject',
  'actor',
  'session',
  'workspace',
  'canonicalTarget',
  'requestIdentity'
]);

const approvalCanonical = value => ({
  issuerDigest: value.issuerDigest,
  restrictionIdentity: value.restrictionIdentity,
  restrictionRevision: value.restrictionRevision,
  restrictionDigest: value.restrictionDigest,
  subject: value.subject,
  actor: value.actor,
  session: value.session,
  workspace: value.workspace,
  canonicalTarget: value.canonicalTarget,
  requestIdentity: value.requestIdentity
});

const approvalShapeValid = value =>
  value &&
  typeof value === 'object' &&
  isDigest(value.issuerDigest) &&
  parseRevision(value.restrictionRevision) !== null &&
  isDigest(value.restrictionDigest) &&
  APPROVAL_STRING_KEYS.every(
    key => typeof value[key] === 'string' && value[key].length > 0
  );

const approvalBindingDigestValid = binding =>
  typeof binding.bindingDigest === 'string' &&
  binding.bindingDigest === stableIdentity(approvalCanonical(binding));

export function createApprovalBinding(input) {
  if (!approvalShapeValid(input)) throw new Error('APPROVAL_BINDING_INVALID');
  const canonical = approvalCanonical(input);
  return Object.freeze({
    ...canonical,
    bindingDigest: stableIdentity(canonical)
  });
}
export function createApprovalBindingForAdmission(admissionState, input) {
  const coherence = admissionCoherence(admissionState);
  if (coherence.outcome !== 'ok') return coherence;
  return Object.freeze({
    outcome: 'ok',
    binding: createApprovalBinding({
      ...input,
      restrictionIdentity: coherence.restrictionIdentity,
      restrictionRevision: coherence.revision,
      restrictionDigest: coherence.digest
    })
  });
}

export function consumeApproval(
  binding,
  current,
  { guardAuthenticationVerified = false } = {}
) {
  if (guardAuthenticationVerified !== true) {
    return reject('APPROVAL_AUTHENTICATION_REQUIRED');
  }
  if (!approvalShapeValid(binding) || !approvalShapeValid(current)) {
    return reject('APPROVAL_CURRENT_INVALID');
  }
  if (!approvalBindingDigestValid(binding)) {
    return reject('APPROVAL_BINDING_DIGEST_INVALID');
  }
  for (const key of [
    'issuerDigest',
    'restrictionIdentity',
    'restrictionRevision',
    'restrictionDigest',
    'subject',
    'actor',
    'session',
    'workspace',
    'canonicalTarget',
    'requestIdentity'
  ]) {
    if (binding[key] !== current[key]) return reject(`APPROVAL_${key.toUpperCase()}_MISMATCH`);
  }
  return Object.freeze({
    outcome: 'ok',
    finalAction: composeGuardAction(current.existingAction, current.arcFloor)
  });
}

export function consumeApprovalWithAdmission(
  binding,
  admissionState,
  current,
  options = {}
) {
  const coherence = admissionCoherence(admissionState);
  if (coherence.outcome !== 'ok') {
    return reject(
      coherence.reason === 'CONTEXT_REVOKED'
        ? 'APPROVAL_CONTEXT_REVOKED'
        : 'APPROVAL_ADMISSION_INCOHERENT'
    );
  }

  return consumeApproval(binding, {
    ...current,
    restrictionIdentity: coherence.restrictionIdentity,
    restrictionRevision: coherence.revision,
    restrictionDigest: coherence.digest
  }, options);
}
const RECEIPT_CANONICAL_KEYS = Object.freeze([
  'guardDecisionIdentity',
  'issuerDigest',
  'restrictionIdentity',
  'explicitOptionalAbsence',
  'subjectDigest',
  'scopeDigest'
]);

const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));

const receiptCanonicalShapeValid = value =>
  exactKeys(value, RECEIPT_CANONICAL_KEYS) &&
  typeof value.guardDecisionIdentity === 'string' &&
  value.guardDecisionIdentity.length > 0 &&
  isDigest(value.issuerDigest) &&
  isDigest(value.subjectDigest) &&
  isDigest(value.scopeDigest) &&
  typeof value.explicitOptionalAbsence === 'boolean' &&
  (
    value.restrictionIdentity === null ||
    (
      typeof value.restrictionIdentity === 'string' &&
      value.restrictionIdentity.length > 0
    )
  );

export function receiptIdentity(input) {
  const safe = {
    guardDecisionIdentity: input?.guardDecisionIdentity,
    issuerDigest: input?.issuerDigest,
    restrictionIdentity: input?.restrictionIdentity ?? null,
    explicitOptionalAbsence: input?.explicitOptionalAbsence === true,
    subjectDigest: input?.subjectDigest,
    scopeDigest: input?.scopeDigest
  };
  if (!receiptCanonicalShapeValid(safe)) throw new Error('RECEIPT_INPUT_INVALID');
  return Object.freeze({
    receiptIdentity: stableIdentity(safe),
    canonical: Object.freeze(safe)
  });
}

export function verifyReceiptEvidence(
  receipt,
  { guardAuthenticationVerified = false } = {}
) {
  if (guardAuthenticationVerified !== true) {
    return reject('RECEIPT_AUTHENTICATION_REQUIRED');
  }
  if (!receipt || typeof receipt !== 'object' || !receiptCanonicalShapeValid(receipt.canonical)) {
    return reject('RECEIPT_CANONICAL_INVALID');
  }
  const expected = stableIdentity(receipt.canonical);
  if (receipt.receiptIdentity !== expected) return reject('RECEIPT_IDENTITY_INVALID');
  return Object.freeze({ outcome: 'ok', historicalEvidence: true });
}

export function classifyReceiptEvidence(
  receipt,
  currentCanonical,
  options = {}
) {
  const verified = verifyReceiptEvidence(receipt, options);
  if (verified.outcome !== 'ok') return verified;

  const current = receiptIdentity(currentCanonical);
  return Object.freeze({
    outcome: 'ok',
    historicalEvidence: true,
    currentAuthority: false,
    currentIdentityMatches: receipt.receiptIdentity === current.receiptIdentity
  });
}
export function boundaryClaim(id) {
  if (!['ARC-HG-34', 'ARC-HG-35', 'ARC-HG-36', 'ARC-HG-37'].includes(id)) {
    throw new Error('BOUNDARY_ID_INVALID');
  }
  return Object.freeze({
    outcome: 'not-executable-in-reference-model',
    productionAcceptance: 'NOT_RUN'
  });
}
