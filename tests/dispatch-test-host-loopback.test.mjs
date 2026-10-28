import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:http';
import { createTestHost, PAYLOAD, TEST_AUTHORITY, APPROVED } from '../experiments/dispatch-test-host/host.mjs';

const POSIX = ['linux', 'darwin'].includes(process.platform);
const opts = { skip: !POSIX && 'POSIX only' };
const markers = async h => (await readdir(join(h.dir, 'store'))).filter(x => x.endsWith('.consumed'));
const codes = r => r.diagnostics.map(d => d.code);
const total = async h => Object.values(await h.effects()).reduce((n, l) => n + l.length, 0);
const FALSE = ['execution_authorized', 'runtime_enforcement', 'native_host_enforcement', 'production_routing_attested', 'actor_authenticated', 'destination_registry_authenticated'];
async function withHost(fn, o) { const h = await createTestHost(o); try { await fn(h); } finally { await h.close(); } }
function flip(input) {
 const receipt = JSON.parse(input.receiptJson), sig = Buffer.from(receipt.signature, 'base64'); sig[0] ^= 1;
 return { ...input, receiptJson: JSON.stringify({ ...receipt, signature: sig.toString('base64') }) };
}
/** A refusal: no receiver effect anywhere, no marker, nothing sent. */
async function refused(h, r, decision) {
 assert.equal(r.adapter_decision, decision, JSON.stringify(r));
 assert.equal(r.send_outcome, 'NOT_INVOKED'); assert.equal(r.consumption_status, 'NOT_CONSUMED');
 assert.equal(await total(h), 0); assert.equal((await markers(h)).length, 0); assert.equal(h.state.sends, 0);
}

test('positive: exact target gets exactly one effect at the separate loopback receiver, authority stays test-only', opts, () => withHost(async h => {
 assert.equal(TEST_AUTHORITY, 'TEST_HOST_ONLY_NOT_PRODUCTION');
 const r = await h.dispatch(await h.issue());
 assert.equal(r.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(r.send_outcome, 'RETURNED'); assert.equal(r.consumption_status, 'CONSUMED');
 assert.equal(r.authority_status, 'UNKNOWN'); assert.equal(r.acceptance, 'UNKNOWN');
 for (const k of FALSE) assert.equal(r[k], false, k);
 const e = await h.effects();
 assert.equal(e['recv-a'].length, 1); assert.equal(e['recv-b'].length, 0);
 assert.match(e['recv-a'][0].sha256, /^sha256:[0-9a-f]{64}$/); assert.equal(e['recv-a'][0].byte_length, PAYLOAD.length);
 assert.equal(e['recv-a'][0].op_digest, r.operation_digest);
 assert.equal((await markers(h)).length, 1);
}));

test('replay of a consumed grant (sequential and concurrent) never produces a second effect', opts, () => withHost(async h => {
 const a = await h.issue();
 const [x, y, z] = await Promise.all([h.dispatch(a), h.dispatch(a), h.dispatch(a)]);
 assert.equal([x, y, z].filter(r => r.adapter_decision === 'PERMIT_SOURCE_ONLY').length, 1);
 const again = await h.dispatch(a);
 assert.notEqual(again.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(again.send_outcome, 'NOT_INVOKED');
 assert.equal((await h.effects())['recv-a'].length, 1); assert.equal(h.state.sends, 1);
}));

const denied = [
 ['forged signature', { tamper: flip }, 'UNKNOWN_HELD', 'ATR_SIGNATURE_INVALID'],
 ['revoked issuer key', { mutate: s => { s.registry.keys[0].status = 'revoked'; } }, 'UNKNOWN_HELD', 'ATR_KEY_NOT_ACTIVE'],
 ['expired receipt', { mutate: s => { s.payload.expires_at_ms = s.context.evaluated_at_ms; } }, 'UNKNOWN_HELD', 'ATR_EXPIRED'],
 ['tampered context', { tamper: i => ({ ...i, contextJson: JSON.stringify({ ...JSON.parse(i.contextJson), actor_principal: 'someone-else' }) }) }, 'UNKNOWN_HELD', 'ATR_CONTEXT_MISMATCH'],
];
for (const [name, issueOpts, decision, code] of denied) {
 test('denied before any host callback: ' + name, opts, () => withHost(async h => {
  const r = await h.dispatch(await h.issue(issueOpts));
  assert.ok(codes(r).includes(code), JSON.stringify(r)); assert.equal(r.verification_result, 'DENY'); assert.equal(r.ledger_called, false);
  assert.equal(h.state.hostCalls, 0);
  await refused(h, r, decision);
 }));
}

test('denied: payload bytes differ from the approved digest', opts, () => withHost(async h => {
 const a = await h.issue();
 await refused(h, await h.dispatch(a, Buffer.from('different line\n')), 'DENY');
 assert.equal((await h.dispatch(a)).adapter_decision, 'PERMIT_SOURCE_ONLY');   // not burned by the refusal
}));
test('denied: stale request revision', opts, () => withHost(async h => {
 const a = await h.issue(); h.revisions.set('test-host-req-1', 2);
 const r = await h.dispatch(a); assert.ok(codes(r).includes('DTB_REQUEST_REVISION_STALE')); await refused(h, r, 'DENY');
}));
test('denied: actual route reaches a different target; the wrong receiver sees nothing', opts, () => withHost(async h => {
 const a = await h.issue(); h.setRoute('recv-b');
 const r = await h.dispatch(a); assert.ok(codes(r).includes('DTB_TARGET_MISMATCH')); await refused(h, r, 'DENY');
 h.setRoute('recv-a');
 assert.equal((await h.dispatch(a)).adapter_decision, 'PERMIT_SOURCE_ONLY');
}));
test('unreachable route holds with no effect', opts, () => withHost(async h => {
 const a = await h.issue(); h.setRoute('recv-x');
 const r = await h.dispatch(a);
 assert.ok(codes(r).includes('DTB_RESOLUTION_MISSING'), JSON.stringify(r));
 assert.notEqual(r.adapter_decision, 'PERMIT_SOURCE_ONLY'); assert.equal(await total(h), 0);
}));
test('receiver refuses a sender pinned to a different identity and records no effect', opts, () => withHost(async h => {
 const status = await new Promise((res, rej) => { const q = request({ host: '127.0.0.1', port: h.receivers['recv-a'].port, path: '/inbox', method: 'POST',
  headers: { 'x-expected-receiver-id': 'recv-b' } }, s => { s.resume(); res(s.statusCode); }); q.on('error', rej); q.end('x'); });
 assert.equal(status, 421); assert.equal(await total(h), 0);
}));

test('response uncertainty: effect recorded, send reports THREW, grant stays burned and is never retried', opts, () => withHost(async h => {
 await h.add('recv-slow', APPROVED, 1500);
 h.setRoute('recv-slow');
 const a = await h.issue();
 const r = await h.dispatch(a);
 assert.equal(r.send_outcome, 'THREW'); assert.equal(r.consumption_status, 'CONSUMED');
 await new Promise(res => setTimeout(res, 100));
 assert.equal((await h.effects())['recv-slow'].length, 1);          // the effect happened although the sender saw an error
 const sendsBefore = h.state.sends;
 const again = await h.dispatch(a);
 assert.equal(again.send_outcome, 'NOT_INVOKED'); assert.equal(h.state.sends, sendsBefore);
 assert.equal((await h.effects())['recv-slow'].length, 1);
}, { sendTimeoutMs: 300 }));

test('receivers are separate processes bound to loopback only and are gone after close', opts, async () => {
 const h = await createTestHost();
 const pids = Object.values(h.receivers).map(r => r.pid);
 assert.ok(pids.every(p => p !== process.pid));
 const exits = await h.close();
 assert.equal(exits.length, pids.length);
 for (const p of pids) assert.throws(() => process.kill(p, 0), { code: 'ESRCH' });
});
