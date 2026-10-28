/**
 * Source-only task-approval receipt verification primitive (#69, N0).
 * Pure: no I/O, clock, callbacks, state or key generation. Positive means only that a receipt
 * signature verifies under a HOST-SUPPLIED registry and binds the supplied current subject/context.
 */
import { createPublicKey, verify } from 'node:crypto';
import { types } from 'node:util';
import { canonical } from '../../src/schema.mjs';
import { digest, parse } from '../cross-tool-effects/contract.mjs';
import { describeEffectRequest, evaluateEffectRequest } from '../cross-tool-effects/policy.mjs';

export const VERSION = '0.1-experimental';
export const MESSAGE_PREFIX = 'arc-task-approval-receipt/0.1\0';
const D1_KEYS = ['bundleJson', 'taskJson', 'contractJson', 'requestJson', 'provenanceJson'];
const D1_ALL = [...D1_KEYS, 'bindingJson'];
const KEYS = [...D1_ALL, 'contextJson', 'registryJson', 'receiptJson'];
const str = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' };
const hash = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' };
const b64 = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9+/]+={0,2}$' };
const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const ms = int(0, 8640000000000000), rev = int(1, 2147483647);
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const contextSchema = obj({
 version: { const: VERSION }, profile: { const: 'arc-task-approval-context/0.1-experimental' },
 request_id: str, request_revision: rev, actor_principal: str, actor_role: str,
 task_id: str, run_id: str, session_id: str, tenant: str, harness_id: str, harness_revision: rev,
 policy_epoch: rev, registry_epoch: rev, expected_subject_digest: hash, evaluated_at_ms: ms,
});
const registrySchema = obj({
 version: { const: VERSION }, profile: { const: 'arc-task-approval-registry/0.1-experimental' }, epoch: rev,
 keys: { type: 'array', maxItems: 16, items: obj({
  issuer_id: str, key_id: str, public_key: b64, approver_role: str, task_id: str, tenant: str, harness_id: str,
  status: { enum: ['enabled', 'disabled', 'revoked'] }, max_ttl_ms: int(1, 31536000000),
 }) },
});
const receiptSchema = obj({
 version: { const: VERSION }, profile: { const: 'arc-task-approval-receipt/0.1-experimental' },
 payload: obj({
  receipt_id: str, issuer_id: str, key_id: str, decision: { const: 'approved' }, subject_digest: hash,
  binding_digest: hash, context_digest: hash, registry_epoch: rev, issued_at_ms: ms, expires_at_ms: ms,
 }),
 signature: b64,
});
const limitations = Object.freeze({
 execution_authorized: false, runtime_enforcement: false, action_executed: false, replay_protection_enforced: false,
 actor_authenticated: false, reviewer_authenticated: false, source_bytes_observed: false,
});
const invalid = () => new Error('ATR_INPUT_INVALID');
const report = (result, codes, extra = {}) => ({
 profile: 'task-approval-receipt/0.1-experimental-report', result, receipt_signature_verified: false,
 d1_policy_result: 'UNKNOWN', d1_binding_status: 'UNKNOWN', authority_status: 'UNKNOWN', execution_status: 'NOT_PERFORMED',
 diagnostics: [...new Set(codes)].map(code => ({ code })), ...limitations, ...extra,
});

/** Own data properties only; accessors, proxies, symbols and non-strings are never invoked or read. */
function capture(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input)) throw invalid();
 const proto = Object.getPrototypeOf(input);
 if (proto !== Object.prototype && proto !== null) throw invalid();
 const out = {};
 for (const key of Reflect.ownKeys(input)) {
  const d = KEYS.includes(key) ? Object.getOwnPropertyDescriptor(input, key) : undefined;
  if (!d || !('value' in d) || typeof d.value !== 'string') throw invalid();
  out[key] = d.value;
 }
 if (D1_KEYS.some(k => !Object.hasOwn(out, k))) throw invalid();
 return out;
}
function strictBase64(text, length) {
 const bytes = Buffer.from(text, 'base64');
 if (bytes.length !== length || bytes.toString('base64') !== text) throw invalid();
 return bytes;
}
function parseRegistry(text) {
 const registry = parse(text, registrySchema), ids = new Set(), keys = new Set();
 for (const entry of registry.keys) {
  const der = strictBase64(entry.public_key, 44);
  try {
   entry.key = createPublicKey({ key: der, format: 'der', type: 'spki' });
   if (entry.key.asymmetricKeyType !== 'ed25519' || !entry.key.export({ type: 'spki', format: 'der' }).equals(der)) throw invalid();
  } catch { throw invalid(); }
  if (ids.has(entry.key_id) || keys.has(entry.public_key)) throw invalid();
  ids.add(entry.key_id); keys.add(entry.public_key);
 }
 return registry;
}
function parseReceipt(text) {
 const receipt = parse(text, receiptSchema);
 receipt.sig = strictBase64(receipt.signature, 64);
 return receipt;
}
/** Evaluation time is verifier input and deliberately outside the signed context digest. */
export const contextDigest = ({ evaluated_at_ms, ...bound }) => digest('arc-task-approval-context/0.1', bound);
export const bindingDigest = binding => digest('arc-task-approval-binding/0.1', binding);
/** Exact bytes an issuer signs. */
export const signedMessage = payload => Buffer.from(MESSAGE_PREFIX + canonical(payload), 'utf8');
const d1Input = c => Object.fromEntries(Object.entries(c).filter(([k]) => D1_ALL.includes(k)));
function parseNew(c) {
 return {
  context: c.contextJson === undefined ? undefined : parse(c.contextJson, contextSchema),
  registry: c.registryJson === undefined ? undefined : parseRegistry(c.registryJson),
  receipt: c.receiptJson === undefined ? undefined : parseReceipt(c.receiptJson),
 };
}
const routeOf = (bundle, task) => (bundle.routes ?? []).find(r => r.task_type === task.type);

/** Describe values an issuer would bind. Creates no approval, receipt or signature. */
export async function describeApprovalSubject(input) {
 let c, n;
 try { c = capture(input); n = parseNew(c); } catch { return report('REJECT_INPUT', ['ATR_INPUT_INVALID']); }
 const d = await describeEffectRequest(d1Input(c));
 if (d.policy_result === 'REJECT_INPUT') return report('REJECT_INPUT', ['ATR_INPUT_INVALID']);
 if (!d.subject_digest) return report('DENY', d.diagnostics.map(x => x.code), { d1_policy_result: d.policy_result });
 const route = routeOf(parse(c.bundleJson), parse(c.taskJson));
 return report('DESCRIBED', [], {
  d1_policy_result: d.policy_result, subject_digest: d.subject_digest, accountable_role: route?.accountable ?? null,
  binding_digest: c.bindingJson === undefined ? null : bindingDigest(parse(c.bindingJson)),
  context_digest: n.context ? contextDigest(n.context) : null,
 });
}

/** All semantic inputs are bounded JSON texts, captured before the first await. */
export async function verifyTaskApprovalReceipt(input) {
 let c, n;
 try { c = capture(input); n = parseNew(c); } catch { return report('REJECT_INPUT', ['ATR_INPUT_INVALID']); }
 const d1 = d1Input(c);
 const [evaluated, described] = [await evaluateEffectRequest(d1), await describeEffectRequest(d1)];
 const meta = { d1_policy_result: evaluated.policy_result, d1_binding_status: evaluated.binding_status };
 const d1Codes = evaluated.diagnostics.map(x => x.code);
 if (evaluated.policy_result === 'REJECT_INPUT') return report('REJECT_INPUT', ['ATR_INPUT_INVALID']);
 if (evaluated.policy_result === 'DENY') return report('DENY', ['ATR_D1_DENY', ...d1Codes], meta);
 const missing = ['context', 'registry', 'receipt'].filter(k => n[k] === undefined).map(k => 'ATR_' + k.toUpperCase() + '_MISSING');
 if (missing.length || evaluated.policy_result !== 'ALLOW' || evaluated.binding_status !== 'CONSISTENT') {
  return report('UNKNOWN', [...missing, ...(evaluated.policy_result === 'ALLOW' && evaluated.binding_status === 'CONSISTENT' ? [] : ['ATR_D1_NOT_ALLOWED']), ...d1Codes], meta);
 }
 const { context: x, registry, receipt } = n, p = receipt.payload, deny = [];
 const bundle = parse(c.bundleJson), task = parse(c.taskJson), request = parse(c.requestJson);
 const route = routeOf(bundle, task);
 if (!route || x.task_id !== task.id || !route.executors.includes(x.actor_role) ||
     ['run_id', 'session_id', 'tenant'].some(k => x[k] !== request[k])) deny.push('ATR_CONTEXT_CONFLICT');
 if (x.expected_subject_digest !== described.subject_digest) deny.push('ATR_SUBJECT_STALE');
 if (p.subject_digest !== described.subject_digest) deny.push('ATR_SUBJECT_MISMATCH');
 if (p.binding_digest !== bindingDigest(parse(c.bindingJson))) deny.push('ATR_BINDING_MISMATCH');
 if (p.context_digest !== contextDigest(x)) deny.push('ATR_CONTEXT_MISMATCH');
 if (registry.epoch !== x.registry_epoch || p.registry_epoch !== registry.epoch) deny.push('ATR_EPOCH_MISMATCH');
 const entry = registry.keys.find(k => k.key_id === p.key_id && k.issuer_id === p.issuer_id);
 if (!entry) deny.push('ATR_ISSUER_UNKNOWN');
 else {
  if (entry.status !== 'enabled') deny.push('ATR_KEY_NOT_ACTIVE');
  if (!route || entry.approver_role !== route.accountable || entry.task_id !== task.id ||
      entry.tenant !== x.tenant || entry.harness_id !== x.harness_id) deny.push('ATR_ISSUER_SCOPE');
  if (p.expires_at_ms - p.issued_at_ms > entry.max_ttl_ms) deny.push('ATR_TTL_EXCEEDED');
 }
 if (p.expires_at_ms <= p.issued_at_ms) deny.push('ATR_TIME_INVALID');
 else if (x.evaluated_at_ms < p.issued_at_ms) deny.push('ATR_NOT_YET_VALID');
 else if (x.evaluated_at_ms >= p.expires_at_ms) deny.push('ATR_EXPIRED');
 if (!deny.length && !verify(null, signedMessage(p), entry.key, receipt.sig)) deny.push('ATR_SIGNATURE_INVALID');
 if (deny.length) return report('DENY', deny, meta);
 return report('VERIFIED_RECEIPT', [], { ...meta, receipt_signature_verified: true, subject_digest: described.subject_digest });
}
