/**
 * Source-only observed-payload adapter over the unchanged receipt-consumption ledger. It copies and hashes caller
 * bytes, compares them to the request declaration, and only then asks its own private store to consume. Bytes are
 * inspected, never sent, returned, decoded or executed.
 */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parse, requestSchema } from '../cross-tool-effects/contract.mjs';
import { createReceiptConsumptionStore } from './ledger.mjs';

export const VERSION = '0.1-experimental';
export const MAX_PAYLOAD_BYTES = 1048576;
const APPROVAL_KEYS = ['bundleJson', 'taskJson', 'contractJson', 'requestJson', 'provenanceJson', 'bindingJson', 'contextJson', 'registryJson', 'receiptJson'];
const REQUIRED = APPROVAL_KEYS.slice(0, 5);
const ENVELOPE_KEYS = ['approvalInput', 'payloadBytes'];

// Intrinsics are captured at load so own-property or prototype overrides on caller objects are never consulted.
const U8 = Uint8Array, BufferProto = Buffer.prototype, U8Proto = Uint8Array.prototype;
const TA = Object.getPrototypeOf(Uint8Array).prototype, AB = ArrayBuffer.prototype;
const getter = (proto, name) => Object.getOwnPropertyDescriptor(proto, name)?.get;
const taBuffer = getter(TA, 'buffer'), taOffset = getter(TA, 'byteOffset'), taLength = getter(TA, 'length');
const abLength = getter(AB, 'byteLength'), abResizable = getter(AB, 'resizable'), abDetached = getter(AB, 'detached');

const limitations = Object.freeze({
 authority_status: 'UNKNOWN', execution_status: 'NOT_PERFORMED', execution_authorized: false, runtime_enforcement: false,
 action_executed: false, actor_authenticated: false, reviewer_authenticated: false, global_replay_protection: false,
 payload_sent: false, source_classification_verified: false, destination_resolved: false, later_operation_bound: false,
});
const report = (codes, extra = {}) => ({
 profile: 'task-owned-payload-consumption/0.1-experimental-report', payload_observation: 'NOT_OBSERVED', payload_binding: 'NOT_OBSERVED',
 source_bytes_observed: false, observed_content_sha256: null, observed_byte_length: null, ledger_called: false,
 consumption_status: 'NOT_CONSUMED', verification_result: 'NOT_VERIFIED', local_store_coverage: 'NONE', marker_persisted: false,
 diagnostics: [...new Set(codes)].map(code => ({ code })), ...extra, ...limitations,
});
const invalid = () => new Error('OPC_INPUT_INVALID');

function plainRecord(input, keys) {
 if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input)) throw invalid();
 const proto = Object.getPrototypeOf(input);
 if (proto !== Object.prototype && proto !== null) throw invalid();
 const out = {};
 for (const key of Reflect.ownKeys(input)) {
  if (typeof key !== 'string' || !keys.includes(key)) throw invalid();
  const d = Object.getOwnPropertyDescriptor(input, key);
  if (!d || !('value' in d)) throw invalid();
  out[key] = d.value;
 }
 return out;
}
function captureApproval(input) {
 const out = plainRecord(input, APPROVAL_KEYS);
 for (const key of Object.keys(out)) if (typeof out[key] !== 'string') throw invalid();
 if (REQUIRED.some(key => !Object.hasOwn(out, key))) throw invalid();
 return Object.freeze(out);
}
/** Exact subview copy of a real Buffer/Uint8Array, read through captured intrinsics only. */
function copyBytes(bytes) {
 if (!types.isUint8Array(bytes) || types.isProxy(bytes)) throw invalid();
 const proto = Object.getPrototypeOf(bytes);
 if (proto !== BufferProto && proto !== U8Proto) throw invalid();
 const length = Reflect.apply(taLength, bytes, []);
 if (length > MAX_PAYLOAD_BYTES) throw invalid();
 const backing = Reflect.apply(taBuffer, bytes, []), offset = Reflect.apply(taOffset, bytes, []);
 if (!types.isArrayBuffer(backing)) throw invalid();
 if (abResizable && Reflect.apply(abResizable, backing, [])) throw invalid();
 const size = Reflect.apply(abLength, backing, []);
 // Without a detached getter an empty backing store is ambiguous with a detached one, so fail closed.
 if (abDetached ? Reflect.apply(abDetached, backing, []) : size === 0) throw invalid();
 if (offset + length > size) throw invalid();
 return new U8(new U8(backing, offset, length));
}
function capture(input) {
 const envelope = plainRecord(input, ENVELOPE_KEYS);
 if (ENVELOPE_KEYS.some(key => !Object.hasOwn(envelope, key))) throw invalid();
 return { approval: captureApproval(envelope.approvalInput), bytes: copyBytes(envelope.payloadBytes) };
}

/** Observe and bind synchronously (everything before the first await), then consume with the same captured strings. */
async function consume(store, input) {
 let approval, bytes;
 try { ({ approval, bytes } = capture(input)); } catch { return report(['OPC_INPUT_INVALID'], { verification_result: 'REJECT_INPUT' }); }
 const observed = { payload_observation: 'OBSERVED', source_bytes_observed: true, observed_byte_length: bytes.length,
  observed_content_sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
 let request;
 try { request = parse(approval.requestJson, requestSchema); }
 catch { return report(['OPC_REQUEST_INVALID'], { ...observed, payload_binding: 'UNEVALUATED' }); }
 if (request.effect !== 'network.send') return report(['OPC_EFFECT_UNSUPPORTED'], { ...observed, payload_binding: 'UNEVALUATED' });
 if (request.content_sha256 !== observed.observed_content_sha256 || request.byte_length !== observed.observed_byte_length) {
  return report(['OPC_PAYLOAD_MISMATCH'], { ...observed, payload_binding: 'MISMATCH' });
 }
 const ledger = await store.consume(approval);
 return { ...ledger, profile: 'task-owned-payload-consumption/0.1-experimental-report', ...observed, payload_binding: 'MATCH',
  ledger_called: true, ...limitations };
}

/**
 * Builds and keeps its own pinned private store for `root` (same root rules as createReceiptConsumptionStore).
 * It accepts no store, verifier result or observation flag from callers.
 */
export async function createOwnedPayloadConsumptionStore(root) {
 if (!['linux', 'darwin'].includes(process.platform)) {
  return Object.freeze({ consume: async () => report(['OPC_UNSUPPORTED_HOST'], { consumption_status: 'UNSUPPORTED' }) });
 }
 const store = await createReceiptConsumptionStore(root);
 return Object.freeze({ consume: input => consume(store, input) });
}
