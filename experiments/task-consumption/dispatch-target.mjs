/**
 * Source-only dispatch-time target binding over the unchanged owned-payload ledger. The adapter compares the host registry's
 * approved target with resolution evidence it requests itself from the host transport, immediately before consuming the grant.
 * No native host enforces this: a permit is a fixture-level decision, never a production routing attestation.
 */
import { createHash, randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { parse, requestSchema, digest } from '../cross-tool-effects/contract.mjs';
import { createOwnedPayloadConsumptionStore, capture } from './owned-payload.mjs';

export const VERSION = '0.1-experimental';
export const POLICY_WRITER = 'dispatch-target-adapter';
const TARGET_KEYS = ['scheme', 'host', 'port', 'path', 'tenant'];
const HOP_KINDS = ['alias', 'dns', 'proxy', 'redirect'];
const EVIDENCE_KEYS = ['producer', 'operation_digest', 'challenge', 'resolved_at_ms', 'resolution_status', 'final', 'final_hop_verified', 'hops'];
const SHA = 'sha256:';

const limitations = Object.freeze({
 authority_status: 'UNKNOWN', acceptance: 'UNKNOWN', execution_authorized: false, runtime_enforcement: false, native_host_enforcement: false,
 production_routing_attested: false, resolution_independence: 'UNPROVEN', effect_attested: false, actor_authenticated: false,
 reviewer_authenticated: false, global_replay_protection: false, destination_registry_authenticated: false, later_operation_bound: false,
});
const report = (codes, extra = {}) => ({
 profile: 'task-dispatch-target/0.1-experimental-report', adapter_decision: 'UNKNOWN_HELD', target_binding: 'UNKNOWN', ledger_called: false,
 consumption_status: 'NOT_CONSUMED', verification_result: 'NOT_VERIFIED', payload_binding: 'NOT_OBSERVED', operation_digest: null,
 evidence_producer_claimed: null, send_outcome: 'NOT_INVOKED', mismatch_fields: [],
 diagnostics: [...new Set(codes)].map(code => ({ code })), ...extra, ...limitations,
});
const invalid = () => new Error('DTB_INPUT_INVALID');

function record(input, keys) {
 if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input)) throw invalid();
 const proto = Object.getPrototypeOf(input);
 if (proto !== Object.prototype && proto !== null) throw invalid();
 const out = {};
 for (const key of Reflect.ownKeys(input)) {
  const d = typeof key === 'string' && keys.includes(key) ? Object.getOwnPropertyDescriptor(input, key) : null;
  if (!d || !('value' in d)) throw invalid();
  out[key] = d.value;
 }
 if (keys.some(key => !Object.hasOwn(out, key))) throw invalid();
 return out;
}
const text = (v, re, max = 128) => { if (typeof v !== 'string' || !v || v.length > max || !re.test(v)) throw invalid(); return v; };
const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
function target(input) {
 const t = record(input, TARGET_KEYS);
 if (!Number.isInteger(t.port) || t.port < 1 || t.port > 65535) throw invalid();
 return Object.freeze({ scheme: text(t.scheme, /^https$/), host: text(t.host, HOST, 253), port: t.port,
  path: text(t.path, /^\/[A-Za-z0-9._~\/-]*$/, 256), tenant: text(t.tenant, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/) });
}
const differs = (a, b) => TARGET_KEYS.filter(k => a[k] !== b[k]);
const sha = bytes => SHA + createHash('sha256').update(bytes).digest('hex');
const frozen = v => (v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, frozen(x)]))) : v);

/** Strict shape check; any malformed, extra, accessor or proxy field makes the evidence unusable (UNKNOWN), never a mismatch. */
function evidence(input) {
 const e = record(input, EVIDENCE_KEYS);
 const producer = record(e.producer, ['component']);
 text(producer.component, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
 if (!Number.isSafeInteger(e.resolved_at_ms) || e.resolved_at_ms < 0) throw invalid();
 if (!['RESOLVED', 'AMBIGUOUS'].includes(e.resolution_status) || typeof e.final_hop_verified !== 'boolean') throw invalid();
 if (!Array.isArray(e.hops) || types.isProxy(e.hops) || e.hops.length > 8 || Object.getPrototypeOf(e.hops) !== Array.prototype) throw invalid();
 const hops = [];
 for (let i = 0; i < e.hops.length; i++) {
  const d = Object.getOwnPropertyDescriptor(e.hops, i);
  if (!d || !('value' in d)) throw invalid();
  const hop = record(d.value, ['kind', 'target']);
  if (!HOP_KINDS.includes(hop.kind)) throw invalid();
  hops.push(Object.freeze({ kind: hop.kind, target: target(hop.target) }));
 }
 return { producer: producer.component, operation_digest: text(e.operation_digest, /^sha256:[0-9a-f]{64}$/, 71), challenge: text(e.challenge, /^[0-9a-f]{32}$/),
  resolved_at_ms: e.resolved_at_ms, status: e.resolution_status, final: target(e.final), final_verified: e.final_hop_verified, hops };
}

/**
 * Pre-ledger decision. Only host-registry data, the adapter's own challenge and the request's own declarations are used;
 * returns a report (hold/deny) or the data needed to consume. No grant is touched on any non-permit path.
 */
async function bind(config, approval, bytes) {
 let request, context;
 try { request = parse(approval.requestJson, requestSchema); } catch { return report(['DTB_REQUEST_INVALID']); }
 if (request.effect !== 'network.send') return report(['DTB_EFFECT_UNSUPPORTED']);
 const observed = sha(bytes);
 const payload = request.content_sha256 === observed && request.byte_length === bytes.length ? 'MATCH' : 'MISMATCH';
 if (payload === 'MISMATCH') return report(['DTB_PAYLOAD_MISMATCH'], { adapter_decision: 'DENY', payload_binding: 'MISMATCH' });
 try {
  context = JSON.parse(approval.contextJson);
  for (const k of ['request_id', 'actor_principal', 'actor_role', 'task_id', 'expected_subject_digest']) text(context[k], /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 128);
  if (!Number.isSafeInteger(context.request_revision)) throw invalid();
 } catch { return report(['DTB_CONTEXT_MISSING'], { payload_binding: payload }); }
 const approved = config.destinations.get(request.destination_ref);
 if (!approved) return report(['DTB_DESTINATION_UNMAPPED'], { payload_binding: payload });
 let current;
 try { current = await config.host.currentRevision(context.request_id); } catch { current = null; }
 if (!Number.isSafeInteger(current)) return report(['DTB_REVISION_UNKNOWN'], { payload_binding: payload });
 if (current !== context.request_revision) return report(['DTB_REQUEST_REVISION_STALE'], { adapter_decision: 'DENY', payload_binding: payload });

 const operation = frozen({ effect: request.effect, request_id: context.request_id, request_revision: context.request_revision, actor_principal: context.actor_principal,
  actor_role: context.actor_role, task_id: context.task_id, run_id: request.run_id, session_id: request.session_id, tenant: request.tenant,
  destination_ref: request.destination_ref, approved_target: approved, content_sha256: request.content_sha256, byte_length: request.byte_length,
  request_digest: digest('arc-ctei-request/0.1', request), expected_subject_digest: context.expected_subject_digest });
 const operation_digest = digest('arc-dtb-operation/0.1', operation);
 const challenge = randomBytes(16).toString('hex');
 const base = { payload_binding: payload, operation_digest };
 let raw;
 try {
  raw = await Promise.race([config.host.transport.resolve(structuredClone(operation), challenge),
   new Promise((_, reject) => setTimeout(reject, config.timeoutMs, new Error('timeout')).unref())]);
 } catch { return report(['DTB_RESOLUTION_MISSING'], base); }
 let e;
 try { e = evidence(raw); } catch { return report(['DTB_EVIDENCE_INVALID'], base); }
 const claimed = { evidence_producer_claimed: e.producer };
 if (e.producer === POLICY_WRITER) return report(['DTB_SELF_ATTESTED'], { ...base, ...claimed });
 if (e.operation_digest !== operation_digest || e.challenge !== challenge) return report(['DTB_EVIDENCE_NOT_BOUND'], { ...base, ...claimed });
 const age = config.host.now() - e.resolved_at_ms;
 if (!(age >= 0 && age <= config.maxAgeMs)) return report(['DTB_EVIDENCE_STALE'], { ...base, ...claimed });
 if (e.status !== 'RESOLVED') return report(['DTB_RESOLUTION_AMBIGUOUS'], { ...base, ...claimed });
 const wrong = differs(e.final, approved);
 const redirected = e.hops.some(h => h.kind === 'redirect');
 // A socket peer that is only a proxy is not evidence of the final destination, whether or not it looks right.
 if (!e.final_verified) return report([e.hops.some(h => h.kind === 'proxy') ? 'DTB_PROXY_FINAL_UNVERIFIED' : 'DTB_FINAL_HOP_UNVERIFIED'], { ...base, ...claimed });
 if (wrong.length || redirected) {
  return report([wrong.length && 'DTB_TARGET_MISMATCH', redirected && 'DTB_REDIRECT_NOT_APPROVED'].filter(Boolean),
   { ...base, ...claimed, adapter_decision: 'DENY', target_binding: 'MISMATCH', mismatch_fields: wrong });
 }
 return { operation, base: { ...base, ...claimed, target_binding: 'MATCH' }, resolved_at_ms: e.resolved_at_ms, revision: current, requestId: context.request_id };
}

async function dispatch(config, store, input) {
 let approval, bytes;
 try { ({ approval, bytes } = capture(input)); } catch { return report(['DTB_INPUT_INVALID'], { verification_result: 'REJECT_INPUT' }); }
 if (!Object.hasOwn(approval, 'contextJson')) return report(['DTB_CONTEXT_MISSING']);
 const gate = await bind(config, approval, bytes);
 if (!gate.operation) return gate;
 const owned = await store.consume({ approvalInput: approval, payloadBytes: bytes });
 const out = { ...report([]), ...gate.base, ledger_called: owned.ledger_called, consumption_status: owned.consumption_status,
  verification_result: owned.verification_result, payload_binding: owned.payload_binding, diagnostics: owned.diagnostics };
 if (owned.consumption_status !== 'CONSUMED') return { ...out, target_binding: 'UNKNOWN' };
 // The grant is already burned: any doubt from here on holds without a refund.
 let still;
 try { still = await config.host.currentRevision(gate.requestId); } catch { still = null; }
 const age = config.host.now() - gate.resolved_at_ms;
 if (still !== gate.revision || !(age >= 0 && age <= config.maxAgeMs)) return { ...out, diagnostics: [{ code: 'DTB_STALE_AT_GATE' }] };
 let send_outcome = 'RETURNED';
 try { await config.host.transport.send(structuredClone(gate.operation), new Uint8Array(bytes)); } catch { send_outcome = 'THREW'; }
 return { ...out, adapter_decision: 'PERMIT_SOURCE_ONLY', send_outcome, diagnostics: [{ code: 'DTB_TARGET_MATCH_SOURCE_ONLY' }] };
}

/**
 * config: { root, destinations: { [destination_ref]: {scheme, host, port, path, tenant} }, host: { now(), currentRevision(request_id),
 * transport: { resolve(operation, challenge), send(operation, bytes) } }, maxAgeMs?, timeoutMs? }. All host-supplied and unauthenticated here.
 * Dispatch input is exactly { approvalInput, payloadBytes }: no target, evidence or flag is accepted from the caller.
 */
export async function createDispatchTargetAdapter(config) {
 const c = record(config, ['root', 'destinations', 'host', 'maxAgeMs', 'timeoutMs'].filter(k => Object.hasOwn(config ?? {}, k)));
 const h = record(c.host, ['now', 'currentRevision', 'transport']), t = record(h.transport, ['resolve', 'send']);
 for (const fn of [h.now, h.currentRevision, t.resolve, t.send]) if (typeof fn !== 'function') throw invalid();
 const dest = record(c.destinations, Object.keys(c.destinations ?? {}));
 const destinations = new Map(Object.entries(dest).map(([ref, v]) => [text(ref, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/), target(v)]));
 const frozenConfig = Object.freeze({ destinations, host: Object.freeze({ now: h.now, currentRevision: h.currentRevision, transport: Object.freeze({ ...t }) }),
  maxAgeMs: c.maxAgeMs ?? 5000, timeoutMs: c.timeoutMs ?? 1000 });
 if (!['linux', 'darwin'].includes(process.platform)) {
  return Object.freeze({ dispatch: async () => report(['DTB_UNSUPPORTED_HOST'], { consumption_status: 'UNSUPPORTED' }) });
 }
 const store = await createOwnedPayloadConsumptionStore(c.root);
 return Object.freeze({ dispatch: input => dispatch(frozenConfig, store, input),
  destination_registry_digest: digest('arc-dtb-registry/0.1', Object.fromEntries(destinations)) });
}
