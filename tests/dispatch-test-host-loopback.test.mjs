import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createTestHost, RECEIVER_PROCESS_IDENTITY, PAYLOAD, TEST_AUTHORITY, APPROVED } from '../experiments/dispatch-test-host/host.mjs';

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

test('trial evidence and README state same-UID process separation only, independence UNPROVEN', opts, async () => {
 assert.equal(RECEIVER_PROCESS_IDENTITY.same_uid_as_test_host, true);
 assert.match(RECEIVER_PROCESS_IDENTITY.receiver_independence, /^UNPROVEN/); assert.match(RECEIVER_PROCESS_IDENTITY.effect_independence, /^UNPROVEN/);
 const readme = await readFile(new URL('../experiments/dispatch-test-host/README.md', import.meta.url), 'utf8');
 assert.match(readme, /same UID as the test host/); assert.match(readme, /process separation only/); assert.match(readme, /UNPROVEN/);
 const run = await readFile(new URL('../experiments/dispatch-test-host/run.mjs', import.meta.url), 'utf8');
 assert.match(run, /receiver_process_identity/); assert.match(run, /receiver_independence/);
});

// ---- lifecycle: construction cleanup, startup deadline, bounded stop ----
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const tmpScripts = [];
async function script(body) {
 const dir = await mkdtemp(join(tmpdir(), 'arc69-fake-recv-')); tmpScripts.push(dir);
 const p = join(dir, 'r.mjs'); await writeFile(p, body); return p;
}
test.after(() => Promise.all(tmpScripts.map(d => rm(d, { recursive: true, force: true }))));
const leftovers = async () => (await readdir(tmpdir())).filter(x => x.startsWith('arc69-test-host-'));
const pidWriter = (file, tail) => script('import { appendFileSync } from "node:fs"; appendFileSync(' + JSON.stringify(file) + ', process.pid + "\\n");\n' + tail);

for (const [name, tail, match] of [
 ['second receiver exits immediately', 'process.exit(3);', /exited early/],
 ['second receiver hangs without handshake (startup deadline)', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);', /startup timeout/],
 ['second receiver prints a malformed handshake then hangs', 'process.stdout.write("garbage\\n"); setInterval(() => {}, 1000);', /./],
 ['second receiver prints an out-of-range port', 'process.stdout.write(JSON.stringify({ port: 0 }) + "\\n"); setInterval(() => {}, 1000);', /bad handshake/],
]) {
 test('construction cleanup: ' + name + ' leaks neither the first child nor the tempdir', opts, async () => {
  const pidsDir = await mkdtemp(join(tmpdir(), 'arc69-pids-')); tmpScripts.push(pidsDir);
  const file = join(pidsDir, 'pids');
  const real = new URL('../experiments/dispatch-test-host/receiver.mjs', import.meta.url).pathname;
  // first receiver: the real one wrapped to record its pid; second: the failing fake.
  const first = await script('import { appendFileSync } from "node:fs"; appendFileSync(' + JSON.stringify(file) + ', process.pid + "\\n"); await import(' + JSON.stringify(real) + ');');
  const second = await pidWriter(file, tail);
  const before = new Set(await leftovers());
  const t0 = Date.now();
  await assert.rejects(createTestHost({ receiverOptions: { startupTimeoutMs: 400, stopTimeoutMs: 200, killTimeoutMs: 1000, byId: { 'recv-a': { script: first }, 'recv-b': { script: second } } } }), match);
  assert.ok(Date.now() - t0 < 5000, 'bounded');
  const pids = (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(Number);
  assert.equal(pids.length, 2);
  for (const p of pids) assert.equal(alive(p), false, 'child ' + p + ' reaped');
  assert.deepEqual((await leftovers()).filter(x => !before.has(x)), [], 'tempdir removed');
 });
}

test('construction cleanup: first receiver startup timeout leaves nothing behind', opts, async () => {
 const pidsDir = await mkdtemp(join(tmpdir(), 'arc69-pids-')); tmpScripts.push(pidsDir);
 const file = join(pidsDir, 'pids');
 const hang = await pidWriter(file, 'setInterval(() => {}, 1000);');
 const before = new Set(await leftovers());
 await assert.rejects(createTestHost({ receiverOptions: { startupTimeoutMs: 300, stopTimeoutMs: 200, killTimeoutMs: 1000, byId: { 'recv-a': { script: hang } } } }), /startup timeout/);
 for (const p of (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(Number)) assert.equal(alive(p), false);
 assert.deepEqual((await leftovers()).filter(x => !before.has(x)), []);
});

test('stop escalates to SIGKILL for a receiver that ignores SIGTERM, within bounds', opts, async () => {
 const pidsDir = await mkdtemp(join(tmpdir(), 'arc69-pids-')); tmpScripts.push(pidsDir);
 const file = join(pidsDir, 'pids');
 const real = new URL('../experiments/dispatch-test-host/receiver.mjs', import.meta.url).pathname;
 const stubborn = await script('import { appendFileSync } from "node:fs"; appendFileSync(' + JSON.stringify(file) + ', process.pid + "\\n"); await import(' + JSON.stringify(real) + '); process.removeAllListeners("SIGTERM"); process.on("SIGTERM", () => {});');
 const h = await createTestHost({ receiverOptions: { stopTimeoutMs: 200, killTimeoutMs: 1000, byId: { 'recv-a': { script: stubborn } } } });
 const pid = Number((await readFile(file, 'utf8')).trim());
 const t0 = Date.now();
 const exits = await h.close();
 assert.ok(Date.now() - t0 < 3000);
 assert.equal(alive(pid), false);
 assert.ok(exits.some(e => e.signal === 'SIGKILL'), JSON.stringify(exits));
 assert.deepEqual(await h.close(), exits);   // idempotent
});

test('positive control: normal construction and close still work with lifecycle options set', opts, async () => {
 const before = new Set(await leftovers());
 const h = await createTestHost({ receiverOptions: { startupTimeoutMs: 5000 } });
 const pids = Object.values(h.receivers).map(r => r.pid);
 assert.equal((await h.dispatch(await h.issue())).adapter_decision, 'PERMIT_SOURCE_ONLY');
 await h.close();
 for (const p of pids) assert.equal(alive(p), false);
 assert.deepEqual((await leftovers()).filter(x => !before.has(x)), []);
});

// ---- lifecycle: add() vs close(), duplicate ids, dispatch vs close ----
const REAL = new URL('../experiments/dispatch-test-host/receiver.mjs', import.meta.url).pathname;
/** A real receiver that records its pid and delays its handshake by `ms`. */
async function slowReceiver(file, ms) {
 return script('import { appendFileSync } from "node:fs"; appendFileSync(' + JSON.stringify(file) + ', process.pid + "\\n"); await new Promise(r => setTimeout(r, ' + ms + ')); await import(' + JSON.stringify(REAL) + ');');
}
const pidList = async file => (await readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(Number);
const pidsFile = async () => { const d = await mkdtemp(join(tmpdir(), 'arc69-pids-')); tmpScripts.push(d); return join(d, 'pids'); };
const fast = { stopTimeoutMs: 200, killTimeoutMs: 1000 };

test('add after close is rejected before any spawn; close stays idempotent', opts, async () => {
 const file = await pidsFile();
 const before = new Set(await leftovers());
 const h = await createTestHost({ receiverOptions: { ...fast, byId: { 'recv-x': { script: await slowReceiver(file, 0) } } } });
 const exits = await h.close();
 await assert.rejects(h.add('recv-x', APPROVED), /closed/);
 assert.deepEqual(await pidList(file), [], 'no child spawned');
 assert.equal(h.receivers['recv-x'], undefined);
 assert.deepEqual(await h.close(), exits);
 await assert.rejects(h.dispatch({}), /closed/);
 assert.deepEqual((await leftovers()).filter(x => !before.has(x)), []);
});

test('close during a delayed add handshake: the child is reaped, add rejects, nothing leaks', opts, async () => {
 const file = await pidsFile();
 const before = new Set(await leftovers());
 const h = await createTestHost({ receiverOptions: { ...fast, startupTimeoutMs: 5000, byId: { 'recv-x': { script: await slowReceiver(file, 600) } } } });
 const base = Object.values(h.receivers).map(r => r.pid);
 const adding = h.add('recv-x', APPROVED);
 const addOutcome = adding.then(() => 'resolved', e => e.message);
 // Wait (bounded, polled) until the child has spawned and recorded its pid; its handshake is then still >=600ms away.
 // A fixed sleep here was load-sensitive: under heavy host load node startup can exceed it.
 for (const deadline = Date.now() + 4000; (await pidList(file)).length === 0 && Date.now() < deadline;) await new Promise(r => setTimeout(r, 20));
 assert.equal((await pidList(file)).length, 1, 'child spawned before close');
 const closing = h.close();
 const late = h.add('recv-y', APPROVED);                // admitted after closure began
 await assert.rejects(late, /closed/);
 await closing;
 assert.match(await addOutcome, /closed during add/);
 for (const p of [...base, ...await pidList(file)]) assert.equal(alive(p), false, 'child ' + p + ' reaped');
 assert.equal(h.receivers['recv-x'], undefined);
 assert.deepEqual((await leftovers()).filter(x => !before.has(x)), []);
});

test('success control: add before close registers a working receiver that close then reaps', opts, async () => {
 const file = await pidsFile();
 const h = await createTestHost({ receiverOptions: { ...fast, byId: { 'recv-x': { script: await slowReceiver(file, 100) } } } });
 const r = await h.add('recv-x', APPROVED);
 assert.equal(h.receivers['recv-x'], r); assert.equal(alive(r.pid), true);
 await h.close();
 assert.equal(alive(r.pid), false);
 assert.deepEqual((await pidList(file)).filter(alive), []);
});

test('duplicate ids (sequential and overlapping) are rejected without spawning or replacing a receiver', opts, async () => {
 const file = await pidsFile();
 const h = await createTestHost({ receiverOptions: { ...fast, byId: { 'recv-x': { script: await slowReceiver(file, 300) } } } });
 try {
  const original = h.receivers['recv-a'];
  await assert.rejects(h.add('recv-a', APPROVED), /duplicate/);
  assert.equal(h.receivers['recv-a'], original); assert.equal(alive(original.pid), true);
  const [a, b] = await Promise.allSettled([h.add('recv-x', APPROVED), h.add('recv-x', APPROVED)]);
  assert.deepEqual([a.status, b.status], ['fulfilled', 'rejected']);
  assert.equal((await pidList(file)).length, 1, 'only one child spawned for the id');
 } finally { await h.close(); }
 assert.deepEqual((await pidList(file)).filter(alive), []);
});

test('dispatch racing close: in-flight dispatch completes, later dispatch is refused, nothing leaks', opts, async () => {
 const before = new Set(await leftovers());
 const h = await createTestHost();
 const pids = Object.values(h.receivers).map(r => r.pid);
 const input = await h.issue();
 const inflight = h.dispatch(input);
 const closing = h.close();
 await assert.rejects(h.dispatch(input), /closed/);
 const r = await inflight; await closing;
 assert.ok(['PERMIT_SOURCE_ONLY', 'UNKNOWN_HELD'].includes(r.adapter_decision), JSON.stringify(r));
 for (const p of pids) assert.equal(alive(p), false);
 assert.deepEqual((await leftovers()).filter(x => !before.has(x)), []);
});
