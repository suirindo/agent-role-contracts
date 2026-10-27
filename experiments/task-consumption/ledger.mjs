/** Source-only local receipt consumption. It never dispatches or accepts an executor. */
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';
import { verifyTaskApprovalReceipt } from '../task-approval/approval.mjs';
import { digest, parse } from '../cross-tool-effects/contract.mjs';

export const VERSION = '0.1-experimental';
const INPUT_KEYS = ['bundleJson', 'taskJson', 'contractJson', 'requestJson', 'provenanceJson', 'bindingJson', 'contextJson', 'registryJson', 'receiptJson'];
const REQUIRED = INPUT_KEYS.slice(0, 5);
const HASH = /^sha256:[0-9a-f]{64}$/;
const receiptSchema = {
 type: 'object', additionalProperties: false, required: ['version', 'profile', 'payload', 'signature'], properties: {
  version: { const: '0.1-experimental' }, profile: { const: 'arc-task-approval-receipt/0.1-experimental' },
  signature: { type: 'string', minLength: 1, maxLength: 128 },
  payload: { type: 'object', additionalProperties: false,
   required: ['receipt_id', 'issuer_id', 'key_id', 'decision', 'subject_digest', 'binding_digest', 'context_digest', 'registry_epoch', 'issued_at_ms', 'expires_at_ms'],
   properties: {
    receipt_id: { type: 'string', minLength: 1, maxLength: 128 }, issuer_id: { type: 'string', minLength: 1, maxLength: 128 },
    key_id: { type: 'string', minLength: 1, maxLength: 128 }, decision: { const: 'approved' },
    subject_digest: { type: 'string', pattern: HASH.source }, binding_digest: { type: 'string', pattern: HASH.source },
    context_digest: { type: 'string', pattern: HASH.source }, registry_epoch: { type: 'integer' },
    issued_at_ms: { type: 'integer' }, expires_at_ms: { type: 'integer' },
   },
  },
 },
};
const limitations = Object.freeze({
 authority_status: 'UNKNOWN', execution_status: 'NOT_PERFORMED', execution_authorized: false,
 runtime_enforcement: false, action_executed: false, actor_authenticated: false,
 reviewer_authenticated: false, global_replay_protection: false,
});
const report = (consumption_status, verification_result, codes = [], extra = {}) => ({
 profile: 'task-receipt-consumption/0.1-experimental-report', consumption_status, verification_result,
 local_store_coverage: consumption_status === 'UNSUPPORTED' ? 'NONE' : 'THIS_PINNED_PRIVATE_STORE_ONLY',
 marker_persisted: consumption_status === 'CONSUMED', diagnostics: [...new Set(codes)].map(code => ({ code })),
 ...limitations, ...extra,
});
function capture(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input)) throw new Error('TRC_INPUT_INVALID');
 const proto = Object.getPrototypeOf(input);
 if (proto !== Object.prototype && proto !== null) throw new Error('TRC_INPUT_INVALID');
 const out = {};
 for (const key of Reflect.ownKeys(input)) {
  if (typeof key !== 'string' || !INPUT_KEYS.includes(key)) throw new Error('TRC_INPUT_INVALID');
  const d = Object.getOwnPropertyDescriptor(input, key);
  if (!d || !('value' in d) || typeof d.value !== 'string') throw new Error('TRC_INPUT_INVALID');
  out[key] = d.value;
 }
 if (REQUIRED.some(key => !Object.hasOwn(out, key))) throw new Error('TRC_INPUT_INVALID');
 return Object.freeze(out);
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
async function inspectRoot(root, pin) {
 let pathStat, handle;
 try {
  pathStat = await lstat(root);
  if (!pathStat.isDirectory() || pathStat.isSymbolicLink() || pathStat.uid !== process.getuid() || (pathStat.mode & 0o077) !== 0) throw new Error('TRC_ROOT_UNSAFE');
  handle = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const fdStat = await handle.stat();
  if (!fdStat.isDirectory() || !same(pathStat, fdStat) || (pin && !same(pin, fdStat))) throw new Error('TRC_ROOT_CHANGED');
  return { handle, stat: fdStat };
 } catch (error) {
  await handle?.close().catch(() => {});
  throw error;
 }
}

/** The trusted host must pass an existing absolute canonical 0700-or-stricter directory it owns. */
export async function createReceiptConsumptionStore(root) {
 if (!['linux', 'darwin'].includes(process.platform)) return unsupportedStore();
 if (typeof process.getuid !== 'function' || typeof root !== 'string' || !isAbsolute(root) || await realpath(root).catch(() => null) !== root) {
  throw new Error('TRC_ROOT_INVALID');
 }
 const initial = await inspectRoot(root);
 const pin = { dev: initial.stat.dev, ino: initial.stat.ino };
 await initial.handle.close();
 return Object.freeze({ consume: input => consume(root, pin, input) });
}
function unsupportedStore() {
 return Object.freeze({ consume: async () => report('UNSUPPORTED', 'NOT_VERIFIED', ['TRC_UNSUPPORTED_HOST']) });
}
async function consume(root, pin, input) {
 let captured;
 try { captured = capture(input); } catch { return report('NOT_CONSUMED', 'REJECT_INPUT', ['TRC_INPUT_INVALID']); }
 let before;
 try { before = await inspectRoot(root, pin); await before.handle.close(); }
 catch { return report('NOT_CONSUMED', 'NOT_VERIFIED', ['TRC_ROOT_UNAVAILABLE']); }
 const verified = await verifyTaskApprovalReceipt(captured);
 if (verified.result !== 'VERIFIED_RECEIPT') {
  return report('NOT_CONSUMED', verified.result, verified.diagnostics.map(x => x.code));
 }
 let receipt, grantHash, record;
 try {
  receipt = parse(captured.receiptJson, receiptSchema).payload;
  grantHash = digest('arc-task-receipt-consumption-grant/0.1', { issuer_id: receipt.issuer_id, receipt_id: receipt.receipt_id });
  record = JSON.stringify({ version: VERSION, grant_hash: grantHash, subject_digest: receipt.subject_digest,
   context_digest: receipt.context_digest, binding_digest: receipt.binding_digest }) + '\n';
 } catch { return report('NOT_CONSUMED', 'REJECT_INPUT', ['TRC_INPUT_INVALID']); }
 let directory, marker, created = false;
 try {
  directory = await inspectRoot(root, pin);
  const filename = grantHash.slice('sha256:'.length) + '.consumed';
  try {
   marker = await open(root + '/' + filename,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
   created = true;
  } catch (error) {
   if (error?.code === 'EEXIST') return report('REPLAY_OR_UNCERTAIN', 'VERIFIED_RECEIPT', ['TRC_MARKER_EXISTS']);
   return report('NOT_CONSUMED', 'VERIFIED_RECEIPT', ['TRC_CREATE_FAILED']);
  }
  await marker.writeFile(record, 'utf8');
  await marker.sync();
  await marker.close(); marker = undefined;
  await directory.handle.sync();
  const after = await lstat(root);
  const fdAfter = await directory.handle.stat();
  if (!same(pin, after) || !same(pin, fdAfter) || !after.isDirectory() || (after.mode & 0o077) !== 0 || after.uid !== process.getuid()) throw new Error('TRC_ROOT_CHANGED');
  await directory.handle.close(); directory = undefined;
  return report('CONSUMED', 'VERIFIED_RECEIPT', [], { marker_persisted: true, grant_hash: grantHash,
   subject_digest: receipt.subject_digest, context_digest: receipt.context_digest, binding_digest: receipt.binding_digest });
 } catch {
  return report(created ? 'UNKNOWN_HELD' : 'NOT_CONSUMED', 'VERIFIED_RECEIPT', [created ? 'TRC_WRITE_OR_SYNC_FAILED' : 'TRC_ROOT_UNAVAILABLE']);
 } finally {
  await marker?.close().catch(() => {});
  await directory?.handle.close().catch(() => {});
 }
}
