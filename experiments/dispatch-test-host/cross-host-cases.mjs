/**
 * Case table for the cross-host TEST trial (#69). Shared by run-cross-host.mjs (real separate receiver host over SSH) and the
 * offline test (local receiver child), so CI exercises the same cases without the receiver host.
 * `expect.effects` / `expect.probes` are per '<set>/<receiver_id>' and are compared to the receiver-side observer, not to the sender.
 */
import { createCrossHostTestHost, APPROVED, OTHER, PAYLOAD } from './cross-host.mjs';

const flip = i => { const r = JSON.parse(i.receiptJson), s = Buffer.from(r.signature, 'base64'); s[0] ^= 1; return { ...i, receiptJson: JSON.stringify({ ...r, signature: s.toString('base64') }) }; };
const RX = [{ id: 'recv-a', target: APPROVED }, { id: 'recv-b', target: OTHER }];
const none = { 'rx/recv-a': 0, 'rx/recv-b': 0 };
const early = { verified: 'DENY', hostCalls: 0 };   // refused before any host callback (no resolver probe, no send)

export const CASES = [
 { name: 'positive_exact_target', expect: { decision: 'PERMIT_SOURCE_ONLY', send: 'RETURNED', sends: 1, effects: { ...none, 'rx/recv-a': 1 }, probes: { 'rx/recv-a': 1, 'rx/recv-b': 0 } } },
 { name: 'replay_after_consume', pre: async (h, a) => { h.first = await h.dispatch(a); },
  expect: { firstDecision: 'PERMIT_SOURCE_ONLY', notDecision: 'PERMIT_SOURCE_ONLY', send: 'NOT_INVOKED', sends: 1, effects: { ...none, 'rx/recv-a': 1 } } },
 { name: 'denied_forged_signature', issue: { tamper: flip }, expect: { decision: 'UNKNOWN_HELD', code: 'ATR_SIGNATURE_INVALID', send: 'NOT_INVOKED', sends: 0, ...early, effects: none, probes: { 'rx/recv-a': 0, 'rx/recv-b': 0 } } },
 { name: 'denied_revoked_key', issue: { mutate: s => { s.registry.keys[0].status = 'revoked'; } }, expect: { decision: 'UNKNOWN_HELD', code: 'ATR_KEY_NOT_ACTIVE', send: 'NOT_INVOKED', sends: 0, ...early, effects: none, probes: { 'rx/recv-a': 0, 'rx/recv-b': 0 } } },
 { name: 'denied_expired', issue: { mutate: s => { s.payload.expires_at_ms = s.context.evaluated_at_ms; } }, expect: { decision: 'UNKNOWN_HELD', code: 'ATR_EXPIRED', send: 'NOT_INVOKED', sends: 0, ...early, effects: none, probes: { 'rx/recv-a': 0, 'rx/recv-b': 0 } } },
 { name: 'denied_context_tampered', issue: { tamper: i => ({ ...i, contextJson: JSON.stringify({ ...JSON.parse(i.contextJson), actor_principal: 'someone-else' }) }) },
  expect: { decision: 'UNKNOWN_HELD', code: 'ATR_CONTEXT_MISMATCH', send: 'NOT_INVOKED', sends: 0, ...early, effects: none, probes: { 'rx/recv-a': 0, 'rx/recv-b': 0 } } },
 { name: 'denied_payload_changed', payload: Buffer.from('different synthetic line\n'), expect: { decision: 'DENY', send: 'NOT_INVOKED', sends: 0, effects: none } },
 { name: 'denied_stale_revision', pre: async h => { h.revisions.set('test-host-req-1', 2); },
  expect: { decision: 'DENY', code: 'DTB_REQUEST_REVISION_STALE', send: 'NOT_INVOKED', sends: 0, effects: none, probes: { 'rx/recv-a': 0, 'rx/recv-b': 0 } } },
 { name: 'denied_target_mismatch', pre: async h => { h.setRoute('rx:recv-b'); },
  expect: { decision: 'DENY', code: 'DTB_TARGET_MISMATCH', send: 'NOT_INVOKED', sends: 0, effects: none, probes: { 'rx/recv-a': 0, 'rx/recv-b': 1 } } },
 { name: 'response_uncertain_no_retry', rx: [...RX, { id: 'recv-slow', target: APPROVED, delayMs: 1500 }], sendTimeoutMs: 300,
  pre: async h => { h.setRoute('rx:recv-slow'); }, retry: true,
  expect: { decision: 'PERMIT_SOURCE_ONLY', send: 'THREW', consumed: true, retrySend: 'NOT_INVOKED', sends: 1, effects: { ...none, 'rx/recv-slow': 1 } } },
 { name: 'denied_wrong_destination_host', impostor: true, pre: async h => { h.setRoute('impostor:recv-a'); },
  expect: { notDecision: 'PERMIT_SOURCE_ONLY', code: 'DTB_FINAL_HOP_UNVERIFIED', send: 'NOT_INVOKED', sends: 0,
   effects: { ...none, 'impostor/recv-a': 0 }, probes: { 'rx/recv-a': 0, 'rx/recv-b': 0, 'impostor/recv-a': 1 } } },
];

const brief = x => x && ({ adapter_decision: x.adapter_decision, consumption_status: x.consumption_status, verification_result: x.verification_result,
 send_outcome: x.send_outcome, target_binding: x.target_binding, payload_binding: x.payload_binding, codes: x.diagnostics.map(d => d.code),
 ledger_called: x.ledger_called, operation_digest: x.operation_digest ?? null });

/** Run one case. ctx: { rxLauncher, impostorLauncher, expected, nonce, proHead }. Returns the sender-side view only. */
export async function runCase(c, ctx) {
 const sets = [{ name: 'rx', launcher: ctx.rxLauncher, receivers: c.rx ?? RX, trusted: true }];
 if (c.impostor) sets.push({ name: 'impostor', launcher: ctx.impostorLauncher, receivers: [{ id: 'recv-a', target: APPROVED }], trusted: false });
 const h = await createCrossHostTestHost({ caseName: c.name, sets, expected: ctx.expected, nonce: ctx.nonce, proHead: ctx.proHead,
  ...(c.sendTimeoutMs ? { sendTimeoutMs: c.sendTimeoutMs } : {}) });
 const entry = { name: c.name, started_at_ms: Date.now(), receiver_hosts: h.receiverHosts, endpoints: h.endpoints };
 try {
  const a = await h.issue(c.issue ?? {});
  if (c.pre) await c.pre(h, a);
  const r = await h.dispatch(a, c.payload ?? PAYLOAD);
  let second = null;
  if (c.retry) { await new Promise(x => setTimeout(x, 150)); second = await h.dispatch(a); await new Promise(x => setTimeout(x, 1600)); }
  Object.assign(entry, { first_report: brief(h.first ?? null), report: brief(r), retry_report: brief(second), host_sends: h.state.sends, host_callbacks: h.state.hostCalls,
   resolutions: h.state.resolutions, send_outcomes: h.state.sendOutcomes });
 } finally { entry.receiver_exits = await h.close(); entry.ended_at_ms = Date.now(); }
 return entry;
}

/** Compare one case's sender view and receiver-side observation (cases[<case>] of remote-observer output, per set). */
export function judge(c, entry, observed) {
 const e = c.expect, r = entry.report ?? {}, fails = [];
 const chk = (ok, msg) => { if (!ok) fails.push(msg); };
 if (e.decision) chk(r.adapter_decision === e.decision, 'decision ' + r.adapter_decision);
 if (e.notDecision) chk(r.adapter_decision !== e.notDecision, 'decision must not be ' + e.notDecision);
 if (e.firstDecision) chk(entry.first_report?.adapter_decision === e.firstDecision, 'first decision ' + entry.first_report?.adapter_decision);
 if (e.code) chk((r.codes ?? []).includes(e.code), 'missing code ' + e.code + ' in ' + JSON.stringify(r.codes));
 chk(r.send_outcome === e.send, 'send_outcome ' + r.send_outcome);
 if (e.consumed) chk(r.consumption_status === 'CONSUMED', 'consumption ' + r.consumption_status);
 if (e.retrySend) chk(entry.retry_report?.send_outcome === e.retrySend, 'retry send ' + entry.retry_report?.send_outcome);
 chk(entry.host_sends === e.sends, 'host_sends ' + entry.host_sends);
 if ('hostCalls' in e) chk(entry.host_callbacks === e.hostCalls, 'host_callbacks ' + entry.host_callbacks);
 const counts = {};
 for (const [key, want] of Object.entries(e.effects)) {
  const [set, id] = key.split('/'), rec = observed[set]?.receivers?.[id];
  const got = rec ? rec.effects : 0;
  counts[key] = { effects: got, probes: rec ? rec.identity_probes : 0, refused: rec ? rec.refused_requests : 0 };
  chk(got === want, key + ' effects ' + got + ' != ' + want);
  if (want === 1 && rec) chk(rec.effect_op_digest[0] === (entry.first_report ?? r).operation_digest, key + ' op digest not bound');
 }
 for (const [key, want] of Object.entries(e.probes ?? {})) {
  const [set, id] = key.split('/'), rec = observed[set]?.receivers?.[id];
  chk((rec ? rec.identity_probes : 0) === want, key + ' probes ' + (rec ? rec.identity_probes : 0) + ' != ' + want);
 }
 return { name: c.name, pass: fails.length === 0, fails, receiver_counts: counts };
}
