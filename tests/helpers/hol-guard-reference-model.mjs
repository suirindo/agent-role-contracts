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

const reject = reason => Object.freeze({ outcome: 'reject', reason });
const ok = floor => Object.freeze({ outcome: 'ok', floor });

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

const bigint = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('REVISION_INVALID');
  }
  return BigInt(value);
};

export function newAdmissionState() {
  return Object.freeze({
    current: null,
    durableFloorRevision: '0',
    durableFloorDigest: null,
    revokedThroughRevision: '0'
  });
}

export function installRestriction(state, { revision, digest }) {
  const next = bigint(revision);
  const floor = bigint(state.durableFloorRevision);
  const revokedThrough = bigint(state.revokedThroughRevision);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) return reject('DIGEST_INVALID');
  if (next < floor || next <= revokedThrough) return reject('REVISION_ROLLBACK');
  if (
    next === floor &&
    floor > 0n &&
    state.durableFloorDigest !== null &&
    digest !== state.durableFloorDigest
  ) return reject('REVISION_REUSE');

  if (state.current) {
    const currentRevision = bigint(state.current.revision);
    if (next < currentRevision) return reject('REVISION_ROLLBACK');
    if (next === currentRevision) {
      if (digest !== state.current.digest) return reject('REVISION_REUSE');
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
  if (!state.current) return reject('NO_CURRENT_CONTEXT');
  const revision = state.current.revision;
  return Object.freeze({
    outcome: 'ok',
    state: Object.freeze({
      current: Object.freeze({ ...state.current, revoked: true }),
      durableFloorRevision: state.durableFloorRevision,
      durableFloorDigest: state.durableFloorDigest,
      revokedThroughRevision:
        bigint(revision) > bigint(state.revokedThroughRevision)
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
  const floor = bigint(durableFloorRevision);
  const revokedThrough = bigint(revokedThroughRevision);
  const failClosedState = () => Object.freeze({
    current: null,
    durableFloorRevision,
    durableFloorDigest,
    revokedThroughRevision
  });
  if (!current) {
    return Object.freeze({
      outcome: 'fail-closed',
      state: failClosedState()
    });
  }
  const currentRevision = bigint(current.revision);
  if (
    currentRevision < floor ||
    currentRevision <= revokedThrough ||
    current.revoked === true ||
    (
      currentRevision === floor &&
      durableFloorDigest !== null &&
      current.digest !== durableFloorDigest
    )
  ) {
    return Object.freeze({
      outcome: 'fail-closed',
      state: failClosedState()
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

const stableIdentity = value => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

export function createApprovalBinding(input) {
  const binding = {
    restrictionIdentity: input.restrictionIdentity,
    subject: input.subject,
    actor: input.actor,
    session: input.session,
    workspace: input.workspace,
    canonicalTarget: input.canonicalTarget,
    requestIdentity: input.requestIdentity
  };
  return Object.freeze({ ...binding, bindingDigest: stableIdentity(binding) });
}

export function consumeApproval(binding, current) {
  for (const key of [
    'restrictionIdentity',
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

export function receiptIdentity(input) {
  const safe = {
    guardDecisionIdentity: input.guardDecisionIdentity,
    issuerDigest: input.issuerDigest,
    restrictionIdentity: input.restrictionIdentity ?? null,
    explicitOptionalAbsence: input.explicitOptionalAbsence === true,
    subjectDigest: input.subjectDigest,
    scopeDigest: input.scopeDigest
  };
  return Object.freeze({
    receiptIdentity: stableIdentity(safe),
    canonical: Object.freeze(safe)
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
