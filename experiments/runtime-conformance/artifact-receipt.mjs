/**
 * Source-only read-only artifact collector and pinned-key receipt verification.
 * Not part of Core, runtime authorization, or proof that an agent wrote a file.
 */
import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign, verify, KeyObject } from 'node:crypto';
import { read } from '../../src/validation.mjs';
import { canonical } from '../../src/schema.mjs';

const MAX_BYTES = 1048576;
const id = { type: 'string', minLength: 1, maxLength: 96, pattern: '^[a-z0-9][a-z0-9._-]*$' };
const digest = { type: 'string', minLength: 71, maxLength: 71, pattern: '^sha256:[0-9a-f]{64}$' };
const time = { type: 'string', minLength: 24, maxLength: 24, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$' };
const object = properties => ({ type: 'object', properties, additionalProperties: false, required: Object.keys(properties) });
const metadata = object({
 source_id: id, run_id: id, subject_digest: digest, nonce: id,
 artifact_id: id, artifact_path: { type: 'string', minLength: 1, maxLength: 4096 },
});
const payload = object({
 profile: { const: 'artifact-observation/0.1' }, ...metadata.properties,
 observed_at: time, byte_length: { type: 'integer', minimum: 0, maximum: MAX_BYTES },
 content_sha256: digest,
});
const envelope = object({
 payload, signature: { type: 'string', minLength: 88, maxLength: 88, pattern: '^[A-Za-z0-9+/]{86}==$' },
});
const context = object({
 ...metadata.properties, content_sha256: digest,
 evaluated_at: time,
 max_age_ms: { type: 'integer', minimum: 0, maximum: 2147483647 },
 max_clock_skew_ms: { type: 'integer', minimum: 0, maximum: 60000 },
});
const fail = code => { throw new Error(code); };
function parse(text, schema, label) {
 const result = read(text, schema, label);
 if (result.errors.length) fail('ARTIFACT_RECEIPT_INPUT_INVALID');
 return result.value;
}
function timestamp(value) {
 const at = Date.parse(value);
 return Number.isFinite(at) && new Date(at).toISOString() === value ? at : null;
}
function signingBytes(value) {
 return Buffer.from('ARC-ARTIFACT-OBSERVATION-0.1\n' + canonical(value), 'utf8');
}
function keyOf(value, privateKey) {
 const key = value instanceof KeyObject ? value : privateKey ? createPrivateKey(value) : createPublicKey(value);
 if (key.asymmetricKeyType !== 'ed25519' || key.type !== (privateKey ? 'private' : 'public'))
  fail('ARTIFACT_RECEIPT_KEY_TYPE');
 return key;
}

/**
 * Explicit file only. No discovery or writes. Signs bytes read from one regular
 * file descriptor; neither the provided logical path nor subject is authority.
 * Signing key must be supplied by the collector host, never by a worker event.
 */
export function collectArtifactReceipt(filePath, metadataJson, collectorPrivateKey) {
 if (typeof filePath !== 'string' || !filePath || filePath.includes('\0'))
  fail('ARTIFACT_RECEIPT_FILE_INVALID');
 const meta = parse(metadataJson, metadata, 'metadata');
 const key = keyOf(collectorPrivateKey, true);
 // Refuse unsupported platforms instead of silently dropping the no-follow claim.
 if (!constants.O_NOFOLLOW) fail('ARTIFACT_RECEIPT_NOFOLLOW_UNSUPPORTED');
 let fd;
 try {
  fd = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const before = fstatSync(fd, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n) fail('ARTIFACT_RECEIPT_FILE_NOT_SINGLE_REGULAR');
  if (before.size > BigInt(MAX_BYTES)) fail('ARTIFACT_RECEIPT_FILE_TOO_LARGE');
  const bytes = Buffer.alloc(MAX_BYTES + 1);
  let length = 0, count;
  do {
   count = readSync(fd, bytes, length, bytes.length - length, null);
   length += count;
  } while (count && length < bytes.length);
  if (length > MAX_BYTES) fail('ARTIFACT_RECEIPT_FILE_TOO_LARGE');
  const after = fstatSync(fd, { bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs || before.ino !== after.ino ||
      before.dev !== after.dev || after.nlink !== 1n || BigInt(length) !== after.size)
   fail('ARTIFACT_RECEIPT_FILE_CHANGED');
  const record = {
   profile: 'artifact-observation/0.1', ...meta, observed_at: new Date().toISOString(),
   byte_length: length,
   content_sha256: 'sha256:' + createHash('sha256').update(bytes.subarray(0, length)).digest('hex'),
  };
  return { payload: record, signature: sign(null, signingBytes(record), key).toString('base64') };
 } finally {
  if (fd !== undefined) closeSync(fd);
 }
}

/**
 * The public key is pinned OUTSIDE the receipt. Signature verification proves
 * origin under that key only. It does not authenticate actor roles or tools.
 */
export function verifyArtifactReceipt(receiptJson, pinnedCollectorPublicKey, contextJson) {
 const result = {
  signature_valid: false, binding_matches: false, freshness: 'unknown', errors: [],
  identity_verified: false, runtime_conformance_verified: false,
  content_bytes_verified: false, execution_authorized: false, runtime_enforcement: false,
  replay_protection_enforced: false,
 };
 const add = code => result.errors.push({ code });
 let receipt, expected, key;
 try {
  receipt = parse(receiptJson, envelope, 'receipt');
  expected = parse(contextJson, context, 'context');
  key = keyOf(pinnedCollectorPublicKey, false);
 } catch {
  add('ARTIFACT_RECEIPT_INPUT_INVALID'); return result;
 }
 const signature = Buffer.from(receipt.signature, 'base64');
 if (signature.toString('base64') !== receipt.signature ||
     !verify(null, signingBytes(receipt.payload), key, signature)) {
  add('ARTIFACT_RECEIPT_SIGNATURE_INVALID'); return result;
 }
 result.signature_valid = true;
 result.binding_matches = [...Object.keys(metadata.properties), 'content_sha256']
  .every(field => receipt.payload[field] === expected[field]);
 if (!result.binding_matches) add('ARTIFACT_RECEIPT_BINDING_MISMATCH');
 const now = timestamp(expected.evaluated_at), observed = timestamp(receipt.payload.observed_at);
 if (now === null || observed === null) add('ARTIFACT_RECEIPT_TIME_INVALID');
 else if (observed > now + expected.max_clock_skew_ms) add('ARTIFACT_RECEIPT_FUTURE');
 else if (now - observed > expected.max_age_ms) {
  result.freshness = 'stale'; add('ARTIFACT_RECEIPT_STALE');
 } else result.freshness = 'fresh';
 return result;
}
