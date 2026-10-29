// Offline coverage for the cross-host TEST trial (#69). The "remote" receiver set runs as a local child on 127.0.0.1 through the
// same script, stdin secret channel and observer that the real receiver host uses over SSH, so CI never needs that host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { localLauncher, sshLauncher, startReceiverSet, observe, REMOTE_OBSERVER_SCRIPT } from '../experiments/dispatch-test-host/cross-host.mjs';
import { CASES, runCase, judge } from '../experiments/dispatch-test-host/cross-host-cases.mjs';

const POSIX = ['linux', 'darwin'].includes(process.platform);
const opts = { skip: !POSIX && 'POSIX only' };
const dirs = [];
const tmp = async p => { const d = await mkdtemp(join(tmpdir(), p)); dirs.push(d); return d; };
test.after(() => Promise.all(dirs.map(d => rm(d, { recursive: true, force: true }))));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

for (const bind of ['stdio', '127.0.0.1'])
test('all cross-host cases reproduce offline (' + bind + '): sender view matches the receiver-side observer, impostor host is refused', opts, async () => {
 const rxDir = await tmp('arc69-xhost-rx-'), impDir = await tmp('arc69-xhost-imp-');
 const ctx = { rxLauncher: localLauncher(rxDir, bind), impostorLauncher: localLauncher(impDir), expected: { hostname: hostname(), uid: process.getuid() },
  nonce: randomBytes(16).toString('hex'), proHead: 'offline-test' };
 const entries = [];
 for (const c of CASES) entries.push(await runCase(c, ctx));
 const rx = (await observe(process.execPath, [REMOTE_OBSERVER_SCRIPT, rxDir])).json;
 const imp = (await observe(process.execPath, [REMOTE_OBSERVER_SCRIPT, impDir])).json;
 assert.deepEqual(rx.anomalies, []);
 const verdicts = CASES.map((c, i) => judge(c, entries[i], { rx: rx.cases[c.name], impostor: imp.cases[c.name] }));
 for (const v of verdicts) assert.ok(v.pass, v.name + ': ' + v.fails.join('; '));
 assert.equal(verdicts.length, 11);
 for (const c of CASES) {
  assert.equal(rx.cases[c.name].manifest.nonce, ctx.nonce); assert.equal(rx.cases[c.name].manifest.pro_head, 'offline-test');
  assert.equal(rx.cases[c.name].manifest.bind_host, bind);
  for (const r of Object.values(rx.cases[c.name].receivers)) assert.deepEqual(r.nonces, [ctx.nonce]);
 }
 // The wrong-host impostor answered the identity probe but could not prove the per-case secret.
 const wrong = entries.find(e => e.name === 'denied_wrong_destination_host');
 assert.equal(wrong.resolutions.length, 1); assert.equal(wrong.resolutions[0].checks.proof, false); assert.equal(wrong.resolutions[0].identity_verified, false);
 const pos = entries.find(e => e.name === 'positive_exact_target');
 assert.equal(pos.resolutions[0].identity_verified, true);
 // Every receiver set exited after its case (stdin EOF), none was left running.
 for (const e of entries) for (const h of Object.values(e.receiver_hosts)) assert.equal(alive(h.pid), false, e.name);
 // Secrets never reach disk: no observed file contains a 64-hex secret field.
 for (const f of rx.files) assert.doesNotMatch(await readFile(join(rxDir, f.path), 'utf8'), /"secret"/);
});

test('receiver set: wrong trial nonce or wrong pinned receiver is refused and recorded as a refusal, not an effect', opts, async () => {
 const dir = await tmp('arc69-xhost-n-'), nonce = randomBytes(16).toString('hex');
 const set = await startReceiverSet(localLauncher(dir)({ caseName: 'c', spec: { pro_head: 'x', receivers: [{ id: 'recv-a' }] } }), { secret: randomBytes(32).toString('hex'), nonce });
 try {
  const post = headers => new Promise((res, rej) => { const q = request({ host: '127.0.0.1', port: set.receivers['recv-a'].port, path: '/inbox', method: 'POST', headers }, s => { s.resume(); res(s.statusCode); }); q.on('error', rej); q.end('x'); });
  assert.equal(await post({ 'x-expected-receiver-id': 'recv-a', 'x-trial-nonce': 'f'.repeat(32) }), 421);
  assert.equal(await post({ 'x-expected-receiver-id': 'recv-b', 'x-trial-nonce': nonce }), 421);
 } finally { await set.stop(); }
 const o = (await observe(process.execPath, [REMOTE_OBSERVER_SCRIPT, dir])).json;
 assert.equal(o.cases.c.receivers['recv-a'].effects, 0); assert.equal(o.cases.c.receivers['recv-a'].refused_requests, 2);
});

test('receiver set stops on stdin EOF and refuses to start without a valid secret line', opts, async () => {
 const dir = await tmp('arc69-xhost-l-');
 const set = await startReceiverSet(localLauncher(dir)({ caseName: 'c', spec: { receivers: [{ id: 'recv-a' }] } }), { secret: randomBytes(32).toString('hex'), nonce: randomBytes(16).toString('hex') });
 assert.equal(alive(set.pid), true);
 const exit = await set.stop(); assert.equal(exit.code, 0); assert.equal(alive(set.pid), false);
 await assert.rejects(startReceiverSet(localLauncher(dir)({ caseName: 'd', spec: { receivers: [{ id: 'recv-a' }] } }), { secret: 'short', nonce: 'x' }), /exited early/);
});

test('ssh launcher quotes every remote argument, uses BatchMode and never requests port forwarding', () => {
 for (const bind of ['stdio', '100.64.0.9']) {
  const l = sshLauncher({ sshHost: 'rx-host', remoteNode: '/n/node', remoteRoot: "/r/it's", bind })({ caseName: 'c1', spec: { receivers: [{ id: 'recv-a' }] } });
  assert.equal(l.command, 'ssh'); assert.equal(l.bind, bind);
  assert.ok(l.args.includes('BatchMode=yes'));
  assert.ok(!l.args.some(a => /^-[LRD]$/.test(a)));
  assert.match(l.args.at(-1), new RegExp("^'exec' '/n/node' '/r/it'\\\\''s/bin/remote-receiver\\.mjs' '/r/it'\\\\''s/c1' '" + bind.replace(/\./g, '\\.') + "' '"));
 }
});

test('stdio receiver opens no listening socket and answers only inside its own session', opts, async () => {
 const dir = await tmp('arc69-xhost-s-'), nonce = randomBytes(16).toString('hex');
 const set = await startReceiverSet(localLauncher(dir, 'stdio')({ caseName: 'c', spec: { receivers: [{ id: 'recv-a' }] } }), { secret: randomBytes(32).toString('hex'), nonce });
 try {
  assert.equal(set.bind_host, 'stdio'); assert.equal(set.receivers['recv-a'].transport, 'stdio'); assert.equal(set.receivers['recv-a'].port, undefined);
  const r = await set.receivers['recv-a'].call({ receiver_id: 'recv-a', method: 'GET', path: '/__identity', challenge: 'a'.repeat(32) }, 5000);
  assert.equal(r.status, 200); assert.equal(JSON.parse(r.body).nonce, nonce);
  assert.equal((await set.receivers['recv-a'].call({ receiver_id: 'recv-zz', method: 'GET', path: '/__identity', challenge: 'b'.repeat(32) }, 5000)).status, 404);
 } finally { await set.stop(); }
});

test('README states the cross-host binding level and what remains UNKNOWN', async () => {
 const readme = await readFile(new URL('../experiments/dispatch-test-host/README.md', import.meta.url), 'utf8');
 assert.match(readme, /## Cross-host receiver/); assert.match(readme, /SSH/); assert.match(readme, /native N0/i); assert.match(readme, /UNKNOWN/);
});
