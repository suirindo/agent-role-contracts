/** Source-only owned-byte comparison. Never authenticates a host, consumes a grant or executes. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonical } from '../../src/schema.mjs';
import { parse, requestSchema } from '../cross-tool-effects/contract.mjs';
import { contextDigest, verifyTaskApprovalReceipt } from '../task-approval/approval.mjs';

const APPROVAL_KEYS = ['bundleJson', 'taskJson', 'contractJson', 'requestJson', 'provenanceJson',
  'bindingJson', 'contextJson', 'registryJson', 'receiptJson'];
const REQUIRED = ['bundleJson', 'taskJson', 'contractJson', 'requestJson', 'provenanceJson', 'contextJson'];
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const resizableGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get;
const invalid = () => { throw Error('ORB_INPUT_INVALID'); };
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

function ownData(input, keys, required) {
  if (!input || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input)) invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const captured = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !keys.includes(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) invalid();
    captured[key] = descriptor.value;
  }
  if (required.some(key => !Object.hasOwn(captured, key))) invalid();
  return captured;
}

function copyBytes(bytes) {
  if (types.isProxy(bytes) || !types.isUint8Array(bytes)) invalid();
  // Intrinsic getters avoid invoking caller-defined buffer/length accessors.
  const buffer = bufferGetter.call(bytes);
  if (types.isSharedArrayBuffer(buffer) || resizableGetter.call(buffer)) invalid();
  const offset = offsetGetter.call(bytes), length = lengthGetter.call(bytes);
  if (length > 1048576) invalid();
  // A detached buffer throws here. The ordinary backing store cannot be resized
  // or changed concurrently; no caller reference to this copy is returned.
  return Buffer.from(new Uint8Array(buffer, offset, length));
}

function report(result, codes, extra = {}) {
  return {
    profile: 'owned-task-request/0.1-experimental-report', result,
    operation_match: 'UNKNOWN', context_match: 'UNKNOWN', approval_result: 'NOT_CHECKED',
    bytes_captured: false,
    ...extra,
    diagnostics: [...new Set(codes)].map(code => ({ code })),
    host_provenance_status: 'UNKNOWN_HOST_PROVENANCE', authority_status: 'UNKNOWN',
    execution_authorized: false, action_executed: false, consumption_performed: false,
    runtime_enforcement: false, actor_authenticated: false, native_operation_observed: false,
  };
}

/**
 * approvalInput: existing PR84 JSON-string inputs; contextJson is required here.
 * observedInput: own data properties { requestJson, contextJson, bytes }.
 * The second request/context are supplied host observations, NOT authenticated
 * facts. bytes is a real Uint8Array/Buffer copied synchronously before any await.
 * A match is always held for missing canonical native-host provenance.
 */
export async function verifyOwnedTaskRequest(approvalInput, observedInput) {
  let approval, observed, bytes, approvedRequest, actualRequest, contextMatches;
  try {
    approval = ownData(approvalInput, APPROVAL_KEYS, REQUIRED);
    if (Object.values(approval).some(value => typeof value !== 'string')) invalid();
    observed = ownData(observedInput, ['requestJson', 'contextJson', 'bytes'], ['requestJson', 'contextJson', 'bytes']);
    if (typeof observed.requestJson !== 'string' || typeof observed.contextJson !== 'string') invalid();
    bytes = copyBytes(observed.bytes);
    approvedRequest = parse(approval.requestJson, requestSchema);
    actualRequest = parse(observed.requestJson, requestSchema);
    contextMatches = contextDigest(parse(approval.contextJson)) === contextDigest(parse(observed.contextJson));
  } catch {
    return report('REJECT_INPUT', ['ORB_INPUT_INVALID']);
  }

  const contentHash = sha(bytes), byteLength = bytes.length;
  const codes = [];
  if (actualRequest.content_sha256 !== contentHash || approvedRequest.content_sha256 !== contentHash) codes.push('ORB_CONTENT_MISMATCH');
  if (actualRequest.byte_length !== byteLength || approvedRequest.byte_length !== byteLength) codes.push('ORB_LENGTH_MISMATCH');
  if (canonical(actualRequest) !== canonical(approvedRequest)) codes.push('ORB_REQUEST_MISMATCH');
  if (!contextMatches) codes.push('ORB_CONTEXT_MISMATCH');
  const meta = {
    bytes_captured: true, owned_content_sha256: contentHash, owned_byte_length: byteLength,
    operation_match: codes.some(code => code !== 'ORB_CONTEXT_MISMATCH') ? 'MISMATCH' : 'MATCH',
    context_match: contextMatches ? 'MATCH' : 'MISMATCH',
  };
  if (codes.length) return report('DENY', codes, meta);

  // Reuse strict PR84 validation, including signature, context schema and expiry.
  // Time is evaluated using the captured supplied current context, not a clock
  // or a native-authenticity claim. No receipt or approval is manufactured.
  const verification = await verifyTaskApprovalReceipt({ ...approval, contextJson: observed.contextJson });
  const details = { ...meta, approval_result: verification.result };
  if (verification.result === 'DENY' || verification.result === 'REJECT_INPUT') {
    return report(verification.result, verification.diagnostics.map(item => item.code), details);
  }
  return report('UNKNOWN_HOST_PROVENANCE',
    ['UNKNOWN_HOST_PROVENANCE', ...verification.diagnostics.map(item => item.code)], details);
}
