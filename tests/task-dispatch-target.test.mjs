import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenario, render, NOW } from '../experiments/task-approval/fixtures.mjs';
import { createDispatchTargetAdapter, POLICY_WRITER } from '../experiments/task-consumption/dispatch-target.mjs';

const POSIX = ['linux', 'darwin'].includes(process.platform);
const j = JSON.stringify;
const BODY = Uint8Array.from([0x00, 0xff, 0x80, 0x41, 0x7f, 0xc3, 0x28, 0x01]);
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const APPROVED = { scheme: 'https', host: 'receiver-a.lab.test', port: 443, path: '/inbox', tenant: 'tenant-a' };
const OTHER = { ...APPROVED, host: 'receiver-b.lab.test' };

async function approval(body = BODY, revision = 1) {
 return render(await scenario(f => {
  f.request.content_sha256 = sha(body); f.request.byte_length = body.length; f.request.destination_ref = 'lab.receiver';
  f.contract.destinations = ['lab.receiver']; f.contract.flows[0].destination_ref = 'lab.receiver';
  for (const s of f.provenance.sources) s.content_sha256 = sha(body);
 }));
}
/**
 * Fake network. `route(op)` is what the connection layer truly does; `receiver` is written only by deliver() and is the
 * observer independent of the resolver's evidence. `tamper` lets a case make the evidence differ from the route.
 */
function network({ route = () => ({ final: APPROVED, hops: [], verified: true }), tamper = (e) => e, sendThrows = false } = {}) {
 const net = { receiver: [], resolves: 0, sends: 0, revision: 1, now: NOW, last: null };
 net.host = {
  now: () => net.now, currentRevision: async () => net.revision,
  transport: {
   async resolve(op, challenge) {
    net.resolves++; net.last = { op, challenge };
    const r = route(op);
    return tamper({ producer: { component: 'fake-connector' }, operation_digest: r.digest ?? null, challenge, resolved_at_ms: NOW, resolution_status: 'RESOLVED',
     final: r.final, final_hop_verified: r.verified, hops: r.hops }, op, challenge);
   },
   async send(op, bytes) { net.sends++; if (sendThrows) throw new Error('boom'); const r = route(op); net.receiver.push({ target: r.final, sha256: sha(bytes) }); },
  },
 };
 return net;
}
// The fake needs the adapter-computed operation digest; it is not secret, so the connector derives it from the clone it is handed.
import { digest } from '../experiments/cross-tool-effects/contract.mjs';
const withDigest = route => op => ({ ...route(op), digest: digest('arc-dtb-operation/0.1', op) });

async function withAdapter(net, fn, opts = {}) {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'arc-dispatch-target-'))); await chmod(root, 0o700);
 try {
  const adapter = await createDispatchTargetAdapter({ root, destinations: { 'lab.receiver': APPROVED }, host: net.host, ...opts });
  await fn(adapter, root);
 } finally { await rm(root, { recursive: true, force: true }); }
}
const markers = async root => (await readdir(root)).filter(x => x.endsWith('.consumed'));
const FALSE = ['execution_authorized', 'runtime_enforcement', 'native_host_enforcement', 'production_routing_attested', 'effect_attested', 'actor_authenticated',
 'reviewer_authenticated', 'global_replay_protection', 'destination_registry_authenticated', 'later_operation_bound'];
function limits(r) {
 assert.equal(r.authority_status, 'UNKNOWN'); assert.equal(r.acceptance, 'UNKNOWN'); assert.equal(r.resolution_independence, 'UNPROVEN');
 for (const k of FALSE) assert.equal(r[k], false, k);
 return r;
}
const codes = r => r.diagnostics.map(d => d.code);
// Mutate an actual signature byte, avoiding a replacement that can accidentally leave the signature unchanged.
function forgedApproval(input) {
 const receipt = JSON.parse(input.receiptJson);
 const signature = Buffer.from(receipt.signature, 'base64'); signature[0] ^= 1;
 receipt.signature = signature.toString('base64');
 return { ...input, receiptJson: j(receipt) };
}
/** Case must be refused with zero receiver effect, no marker, and leave the grant usable by a clean positive control. */
async function refused(mk, expectDecision, expectCode, { revisionAtStart } = {}) {
 const net = network(mk);
 await withAdapter(net, async (adapter, root) => {
  const input = { approvalInput: await approval(), payloadBytes: BODY };
  const r = limits(await adapter.dispatch(input));
  assert.equal(r.adapter_decision, expectDecision, j(r)); assert.ok(codes(r).includes(expectCode), j(r));
  assert.equal(r.send_outcome, 'NOT_INVOKED'); assert.equal(r.ledger_called, false); assert.equal(r.consumption_status, 'NOT_CONSUMED');
  assert.equal(net.sends, 0); assert.equal(net.receiver.length, 0); assert.equal((await markers(root)).length, 0);
 });
}

test('positive: exact approved target is permitted at fixture level, one independent effect, nothing over-claimed', { skip: !POSIX }, async () => {
 const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
 await withAdapter(net, async (adapter, root) => {
  const approvalInput = await approval();
  const r = limits(await adapter.dispatch({ approvalInput, payloadBytes: BODY }));
  assert.equal(r.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(r.target_binding, 'MATCH'); assert.equal(r.consumption_status, 'CONSUMED');
  assert.equal(r.send_outcome, 'RETURNED'); assert.equal(r.evidence_producer_claimed, 'fake-connector');
  assert.deepEqual(net.receiver, [{ target: APPROVED, sha256: sha(BODY) }]);   // independent observation of the one expected effect
  assert.equal((await markers(root)).length, 1);
  const text = j(r);
  for (const leak of [Buffer.from(BODY).toString('hex'), Buffer.from(BODY).toString('base64'), root, JSON.parse(approvalInput.receiptJson).signature]) assert.ok(!text.includes(leak));
  const again = limits(await adapter.dispatch({ approvalInput, payloadBytes: BODY }));   // replay
  assert.equal(again.consumption_status, 'REPLAY_OR_UNCERTAIN'); assert.equal(again.send_outcome, 'NOT_INVOKED'); assert.equal(again.adapter_decision, 'UNKNOWN_HELD');
  assert.equal(net.receiver.length, 1); assert.equal(net.sends, 1);
  assert.ok(Object.isFrozen(adapter)); assert.ok(/^sha256:[0-9a-f]{64}$/.test(adapter.destination_registry_digest));
 });
});

const cases = [
 ['wrong receiver host', { final: OTHER, hops: [], verified: true }, 'DENY', 'DTB_TARGET_MISMATCH'],
 ['recipient/tenant changed after approval', { final: { ...APPROVED, tenant: 'tenant-b' }, hops: [], verified: true }, 'DENY', 'DTB_TARGET_MISMATCH'],
 ['path changed', { final: { ...APPROVED, path: '/other' }, hops: [], verified: true }, 'DENY', 'DTB_TARGET_MISMATCH'],
 ['port changed', { final: { ...APPROVED, port: 8443 }, hops: [], verified: true }, 'DENY', 'DTB_TARGET_MISMATCH'],
 ['alias retargeted', { final: OTHER, hops: [{ kind: 'alias', target: OTHER }], verified: true }, 'DENY', 'DTB_TARGET_MISMATCH'],
 ['redirect to another target', { final: OTHER, hops: [{ kind: 'redirect', target: OTHER }], verified: true }, 'DENY', 'DTB_REDIRECT_NOT_APPROVED'],
 ['redirect even if the final looks approved', { final: APPROVED, hops: [{ kind: 'redirect', target: APPROVED }], verified: true }, 'DENY', 'DTB_REDIRECT_NOT_APPROVED'],
 ['proxy with verified wrong final', { final: OTHER, hops: [{ kind: 'proxy', target: OTHER }], verified: true }, 'DENY', 'DTB_TARGET_MISMATCH'],
 ['proxy peer only, final unverified', { final: APPROVED, hops: [{ kind: 'proxy', target: APPROVED }], verified: false }, 'UNKNOWN_HELD', 'DTB_PROXY_FINAL_UNVERIFIED'],
 ['direct final unverified', { final: APPROVED, hops: [], verified: false }, 'UNKNOWN_HELD', 'DTB_FINAL_HOP_UNVERIFIED'],
 ['dns final unverified', { final: APPROVED, hops: [{ kind: 'dns', target: APPROVED }], verified: false }, 'UNKNOWN_HELD', 'DTB_FINAL_HOP_UNVERIFIED'],
 ['alias final unverified', { final: APPROVED, hops: [{ kind: 'alias', target: APPROVED }], verified: false }, 'UNKNOWN_HELD', 'DTB_FINAL_HOP_UNVERIFIED'],
];
for (const [name, route, decision, code] of cases) {
 test('negative: ' + name, { skip: !POSIX }, () => refused({ route: withDigest(() => route) }, decision, code));
}

const evidenceCases = [
 ['evidence for another operation (replayed)', (e) => ({ ...e, operation_digest: 'sha256:' + 'c'.repeat(64) }), 'DTB_EVIDENCE_NOT_BOUND'],
 ['evidence with another challenge (replayed)', (e) => ({ ...e, challenge: '0'.repeat(32) }), 'DTB_EVIDENCE_NOT_BOUND'],
 ['stale evidence', (e) => ({ ...e, resolved_at_ms: NOW - 60000 }), 'DTB_EVIDENCE_STALE'],
 ['future-dated evidence', (e) => ({ ...e, resolved_at_ms: NOW + 60000 }), 'DTB_EVIDENCE_STALE'],
 ['ambiguous resolution', (e) => ({ ...e, resolution_status: 'AMBIGUOUS' }), 'DTB_RESOLUTION_AMBIGUOUS'],
 ['self-attested by the policy writer', (e) => ({ ...e, producer: { component: POLICY_WRITER } }), 'DTB_SELF_ATTESTED'],
 ['extra evidence field', (e) => ({ ...e, approved: true }), 'DTB_EVIDENCE_INVALID'],
 ['missing evidence field', ({ hops, ...e }) => e, 'DTB_EVIDENCE_INVALID'],
 ['non-object evidence', () => 'approved', 'DTB_EVIDENCE_INVALID'],
 ['null evidence (supplied-only target)', () => null, 'DTB_EVIDENCE_INVALID'],
 ['uppercase host spelling', (e) => ({ ...e, final: { ...e.final, host: 'RECEIVER-A.lab.test' } }), 'DTB_EVIDENCE_INVALID'],
 ['trailing-dot host spelling', (e) => ({ ...e, final: { ...e.final, host: 'receiver-a.lab.test.' } }), 'DTB_EVIDENCE_INVALID'],
 ['accessor in evidence', (e) => Object.defineProperty({ ...e }, 'challenge', { get: () => e.challenge, enumerable: true }), 'DTB_EVIDENCE_INVALID'],
 ['proxied evidence', (e) => new Proxy(e, {}), 'DTB_EVIDENCE_INVALID'],
 ['too many hops', (e) => ({ ...e, hops: Array.from({ length: 9 }, () => ({ kind: 'dns', target: APPROVED })) }), 'DTB_EVIDENCE_INVALID'],
];
for (const [name, tamper, code] of evidenceCases) {
 test('unknown/held: ' + name, { skip: !POSIX }, () => refused({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })), tamper }, 'UNKNOWN_HELD', code));
}

test('unknown/held: resolver failure, timeout and revision unknown never fall through to a permit', { skip: !POSIX }, async () => {
 for (const [mutate, code, opts] of [
  [net => { net.host.transport.resolve = async () => { throw new Error('down'); }; }, 'DTB_RESOLUTION_MISSING', {}],
  [net => { net.host.transport.resolve = () => new Promise(() => {}); }, 'DTB_RESOLUTION_MISSING', { timeoutMs: 20 }],
  [net => { net.host.currentRevision = async () => { throw new Error('down'); }; }, 'DTB_REVISION_UNKNOWN', {}],
  [net => { net.host.currentRevision = async () => '1'; }, 'DTB_REVISION_UNKNOWN', {}],
 ]) {
  const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
  mutate(net);
  await withAdapter(net, async (adapter, root) => {
   const r = limits(await adapter.dispatch({ approvalInput: await approval(), payloadBytes: BODY }));
   assert.equal(r.adapter_decision, 'UNKNOWN_HELD'); assert.ok(codes(r).includes(code), j(r));
   assert.equal(net.sends, 0); assert.equal(net.receiver.length, 0); assert.equal((await markers(root)).length, 0);
  }, opts);
 }
});

test('negative: changed payload and stale request revision are denied before resolution and burn nothing', { skip: !POSIX }, async () => {
 const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
 await withAdapter(net, async (adapter, root) => {
  const approvalInput = await approval();
  const changed = Uint8Array.from(BODY); changed[3] ^= 1;
  for (const bytes of [changed, BODY.subarray(1), new Uint8Array(0)]) {
   const r = limits(await adapter.dispatch({ approvalInput, payloadBytes: bytes }));
   assert.equal(r.adapter_decision, 'DENY'); assert.ok(codes(r).includes('DTB_PAYLOAD_MISMATCH')); assert.equal(r.payload_binding, 'MISMATCH');
  }
  net.revision = 2;
  const stale = limits(await adapter.dispatch({ approvalInput, payloadBytes: BODY }));
  assert.equal(stale.adapter_decision, 'DENY'); assert.ok(codes(stale).includes('DTB_REQUEST_REVISION_STALE'));
  assert.equal(net.resolves, 0); assert.equal(net.sends, 0); assert.equal(net.receiver.length, 0); assert.equal((await markers(root)).length, 0);
  net.revision = 1;   // positive control after the refusals: the grant was never burned
  assert.equal((await adapter.dispatch({ approvalInput, payloadBytes: BODY })).adapter_decision, 'PERMIT_SOURCE_ONLY');
  assert.equal(net.receiver.length, 1);
 });
});

test('negative: unmapped destination, effect other than send, bad approval and caller-supplied target/evidence are never resolved', { skip: !POSIX }, async () => {
 const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
 await withAdapter(net, async (adapter, root) => {
  const good = await approval();
  const unmapped = await render(await scenario(f => { f.request.content_sha256 = sha(BODY); f.request.byte_length = BODY.length; f.request.destination_ref = 'lab.other';
   f.contract.destinations = ['lab.other']; f.contract.flows[0].destination_ref = 'lab.other'; for (const s of f.provenance.sources) s.content_sha256 = sha(BODY); }));
  const r = limits(await adapter.dispatch({ approvalInput: unmapped, payloadBytes: BODY }));
  assert.ok(codes(r).includes('DTB_DESTINATION_UNMAPPED')); assert.equal(r.adapter_decision, 'UNKNOWN_HELD');
  for (const extra of [{ observedTarget: APPROVED }, { evidence: {} }, { resolved: true }, { approvalInput: good, payloadBytes: BODY, target: APPROVED }]) {
   const x = limits(await adapter.dispatch({ approvalInput: good, payloadBytes: BODY, ...extra }));
   assert.equal(x.verification_result, 'REJECT_INPUT'); assert.ok(codes(x).includes('DTB_INPUT_INVALID'));
  }
  const noContext = { ...good }; delete noContext.contextJson;
  assert.ok(codes(await adapter.dispatch({ approvalInput: noContext, payloadBytes: BODY })).includes('DTB_CONTEXT_MISSING'));
  const forged = forgedApproval(good);
  const f = await adapter.dispatch({ approvalInput: forged, payloadBytes: BODY });
  assert.notEqual(f.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(net.sends, 0);   // verifier denies before any host callback
  assert.equal(net.receiver.length, 0); assert.equal((await markers(root)).length, 0);
 });
});

/** Count actual host callbacks; an invalid approval must never invoke any of them. */
function counted(net) {
 const calls = { revision: 0, resolve: 0, now: 0, send: 0 };
 const { now, currentRevision, transport } = net.host;
 net.host = { now: () => { calls.now++; return now(); }, currentRevision: async id => { calls.revision++; return currentRevision(id); },
  transport: { resolve: async (op, ch) => { calls.resolve++; return transport.resolve(op, ch); }, send: async (op, b) => { calls.send++; return transport.send(op, b); } } };
 return calls;
}
async function signedApproval(mutate) {
 const s = await scenario(f => {
  f.request.content_sha256 = sha(BODY); f.request.byte_length = BODY.length; f.request.destination_ref = 'lab.receiver';
  f.contract.destinations = ['lab.receiver']; f.contract.flows[0].destination_ref = 'lab.receiver';
  for (const x of f.provenance.sources) x.content_sha256 = sha(BODY);
 });
 mutate(s);
 return render(s);
}
const invalidApprovals = [
 ['forged signature', async () => { const a = await approval(); return forgedApproval(a); }, 'ATR_SIGNATURE_INVALID'],
 ['revoked key', () => signedApproval(s => { s.registry.keys[0].status = 'revoked'; }), 'ATR_KEY_NOT_ACTIVE'],
 ['expired receipt', () => signedApproval(s => { s.payload.issued_at_ms = NOW - 2000; s.payload.expires_at_ms = NOW - 1; }), 'ATR_EXPIRED'],
 ['wrong subject', () => signedApproval(s => { s.context.expected_subject_digest = 'sha256:' + 'd'.repeat(64); }), 'ATR_SUBJECT_STALE'],
 ['wrong context', () => signedApproval(s => { s.context.actor_role = 'nobody'; }), 'ATR_CONTEXT_CONFLICT'],
 ['malformed receipt', async () => ({ ...(await approval()), receiptJson: '{}' }), null],
 ['missing registry', async () => { const { registryJson, ...rest } = await approval(); return { ...rest, registryJson: '{}' }; }, null],
];
for (const [name, make, code] of invalidApprovals) {
 test('approval verified before any host callback: ' + name, { skip: !POSIX }, async () => {
  const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
  const calls = counted(net);
  await withAdapter(net, async (adapter, root) => {
   const r = limits(await adapter.dispatch({ approvalInput: await make(), payloadBytes: BODY }));
   assert.notEqual(r.adapter_decision, 'PERMIT_SOURCE_ONLY', j(r)); assert.notEqual(r.verification_result, 'VERIFIED_RECEIPT', j(r));
   if (code) assert.ok(codes(r).includes(code), j(r));
   assert.equal(r.send_outcome, 'NOT_INVOKED'); assert.equal(r.ledger_called, false); assert.equal(r.consumption_status, 'NOT_CONSUMED');
   assert.deepEqual(calls, { revision: 0, resolve: 0, now: 0, send: 0 }, j(calls));
   assert.equal(net.receiver.length, 0); assert.equal((await markers(root)).length, 0);
  });
 });
}
test('approval verified before any host callback: valid control resolves and sends once; refusals before it burned nothing', { skip: !POSIX }, async () => {
 const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
 const calls = counted(net);
 await withAdapter(net, async (adapter, root) => {
  const good = await approval();
  const forged = forgedApproval(good);
  assert.notEqual((await adapter.dispatch({ approvalInput: forged, payloadBytes: BODY })).adapter_decision, 'PERMIT_SOURCE_ONLY');
  assert.equal(calls.revision + calls.resolve + calls.now + calls.send, 0); assert.equal((await markers(root)).length, 0);
  const r = await adapter.dispatch({ approvalInput: good, payloadBytes: BODY });
  assert.equal(r.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(r.consumption_status, 'CONSUMED');
  assert.equal(calls.resolve, 1); assert.equal(calls.send, 1); assert.equal(net.receiver.length, 1); assert.equal((await markers(root)).length, 1);
  const again = await adapter.dispatch({ approvalInput: good, payloadBytes: BODY });
  assert.equal(again.consumption_status, 'REPLAY_OR_UNCERTAIN'); assert.equal(calls.send, 1);
 });
});

test('gate: revision change after resolution holds with the grant burned and no send; send failure is not refunded', { skip: !POSIX }, async () => {
 const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
 const resolve = net.host.transport.resolve;
 net.host.transport.resolve = async (op, ch) => { const e = await resolve(op, ch); net.revision = 2; return e; };
 await withAdapter(net, async (adapter, root) => {
  const r = limits(await adapter.dispatch({ approvalInput: await approval(), payloadBytes: BODY }));
  assert.equal(r.adapter_decision, 'UNKNOWN_HELD'); assert.equal(r.consumption_status, 'CONSUMED'); assert.ok(codes(r).includes('DTB_STALE_AT_GATE'));
  assert.equal(net.sends, 0); assert.equal(net.receiver.length, 0); assert.equal((await markers(root)).length, 1);
 });
 const failing = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })), sendThrows: true });
 await withAdapter(failing, async (adapter, root) => {
  const approvalInput = await approval();
  const r = await adapter.dispatch({ approvalInput, payloadBytes: BODY });
  assert.equal(r.send_outcome, 'THREW'); assert.equal(r.consumption_status, 'CONSUMED'); assert.equal(r.effect_attested, false);
  assert.equal((await adapter.dispatch({ approvalInput, payloadBytes: BODY })).consumption_status, 'REPLAY_OR_UNCERTAIN');
  assert.equal(failing.sends, 1);
 });
});

test('operation handed to the transport is a private clone; registry and caller bytes cannot change after creation', { skip: !POSIX }, async () => {
 const destinations = { 'lab.receiver': { ...APPROVED } };
 const net = network({ route: withDigest(() => ({ final: APPROVED, hops: [], verified: true })) });
 const resolve = net.host.transport.resolve;
 net.host.transport.resolve = async (op, ch) => { const e = await resolve(op, ch); try { op.approved_target.host = 'attacker.test'; } catch {} return e; };
 const root = await realpath(await mkdtemp(join(tmpdir(), 'arc-dispatch-target-'))); await chmod(root, 0o700);
 try {
  const adapter = await createDispatchTargetAdapter({ root, destinations, host: net.host });
  destinations['lab.receiver'].host = 'attacker.test';   // post-construction registry mutation is ignored
  const bytes = Uint8Array.from(BODY);
  const pending = adapter.dispatch({ approvalInput: await approval(), payloadBytes: bytes });
  bytes[0] ^= 1;   // caller mutation after the call started
  const r = await pending;
  assert.equal(r.adapter_decision, "PERMIT_SOURCE_ONLY", j(r)); assert.equal(net.receiver[0].sha256, sha(BODY));
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('KNOWN GAP: forged resolver evidence is accepted by the adapter; only the independent receiver observation exposes it, and acceptance stays UNKNOWN', { skip: !POSIX }, async () => {
 // The connector claims the approved target but actually routes elsewhere. No in-process adapter can distinguish this: producer
 // identity and independence are unproven without native host proof. The receiver log is the separate evidence.
 const real = { final: OTHER, hops: [], verified: true };
 const net = network({ route: withDigest(() => real), tamper: e => ({ ...e, final: APPROVED }) });
 await withAdapter(net, async adapter => {
  const r = limits(await adapter.dispatch({ approvalInput: await approval(), payloadBytes: BODY }));
  assert.equal(r.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(r.acceptance, 'UNKNOWN'); assert.equal(r.production_routing_attested, false);
  assert.equal(net.receiver.length, 1); assert.deepEqual(net.receiver[0].target, OTHER); assert.notDeepEqual(net.receiver[0].target, APPROVED);
 });
});

test('configuration rejects missing host functions, unsafe registry entries and unknown keys; Windows is unsupported without I/O', async () => {
 const net = network();
 const root = '/nonexistent';
 const bad = [
  { root, destinations: { a: APPROVED }, host: { ...net.host, now: 1 } },
  { root, destinations: { a: { ...APPROVED, scheme: 'http' } }, host: net.host },
  { root, destinations: { a: { ...APPROVED, host: 'Upper.test' } }, host: net.host },
  { root, destinations: { a: { ...APPROVED, extra: 1 } }, host: net.host },
  { root, destinations: { a: APPROVED }, host: net.host, allowAll: true },
  { root, destinations: { a: APPROVED }, host: { ...net.host, transport: { resolve() {} } } },
 ];
 for (const config of bad) await assert.rejects(createDispatchTargetAdapter(config), /DTB_INPUT_INVALID/);
});
