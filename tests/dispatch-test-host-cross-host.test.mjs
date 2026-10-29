// Offline coverage for the cross-host TEST trial (#69). The "remote" receiver set runs as a local child on 127.0.0.1 through the
// same script, stdin secret channel and observer that the real receiver host uses over SSH, so CI never needs that host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localLauncher, sshLauncher, startReceiverSet, observe, REMOTE_OBSERVER_SCRIPT } from '../experiments/dispatch-test-host/cross-host.mjs';
import { CASES, runCase, judge } from '../experiments/dispatch-test-host/cross-host-cases.mjs';

const POSIX = ['linux', 'darwin'].includes(process.platform);
const opts = { skip: !POSIX && 'POSIX only' };
const dirs = [];
const tmp = async p => { const d = await mkdtemp(join(tmpdir(), p)); dirs.push(d); return d; };
test.after(() => Promise.all(dirs.map(d => rm(d, { recursive: true, force: true }))));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const exec = promisify(execFile);

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

const PIN_OPTIONS = ['BatchMode=yes', 'ClearAllForwardings=yes', 'StrictHostKeyChecking=yes', 'UserKnownHostsFile=/k', 'HostKeyAlias=a'].flatMap(o => ['-o', o]);

test('ssh launcher fails closed when any pin option is missing or weakened', () => {
 const base = { sshHost: 'rx-host', remoteNode: '/n/node', remoteRoot: '/r', bind: 'stdio' };
 assert.throws(() => sshLauncher(base), /./);
 for (const drop of ['BatchMode=yes', 'ClearAllForwardings=yes', 'StrictHostKeyChecking=yes', 'UserKnownHostsFile=/k', 'HostKeyAlias=a'])
  assert.throws(() => sshLauncher({ ...base, sshOptions: PIN_OPTIONS.filter((x, i) => x !== drop && PIN_OPTIONS[i + 1] !== drop) }), /./, drop);
 assert.throws(() => sshLauncher({ ...base, sshOptions: ['-o', 'StrictHostKeyChecking=no', ...PIN_OPTIONS.slice(0, 2), ...PIN_OPTIONS.slice(4)] }), /./);
});

test('ssh launcher quotes every remote argument, uses BatchMode and never requests port forwarding', () => {
 for (const bind of ['stdio', '100.64.0.9']) {
  const l = sshLauncher({ sshHost: 'rx-host', remoteNode: '/n/node', remoteRoot: "/r/it's", bind, sshOptions: PIN_OPTIONS })({ caseName: 'c1', spec: { receivers: [{ id: 'recv-a' }] } });
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

async function fakeSshTrial(policy = 'strict', extra = {}, env = {}) {
 const dir = await tmp('arc69-fake-ssh-'), bin = join(dir, 'bin'), remote = join(dir, 'remote'), out = join(dir, 'out');
 await import('node:fs/promises').then(({ mkdir }) => Promise.all([mkdir(bin), mkdir(out)]));
 const fake = new URL('./fixtures/fake-ssh.mjs', import.meta.url).pathname;
 await chmod(fake, 0o755);
 await import('node:fs/promises').then(({ symlink }) => symlink(fake, join(bin, 'ssh')));
 const key = join(dir, 'host-key');
 await exec('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
 const pub = (await readFile(key + '.pub', 'utf8')).trim().split(/\s+/);
 const fingerprint = (await exec('ssh-keygen', ['-l', '-f', key + '.pub'])).stdout.split(/\s+/)[1];
 const knownHosts = join(dir, 'known_hosts'); await writeFile(knownHosts, 'rx-alias ' + pub[0] + ' ' + pub[1] + '\n');
 const config = join(dir, 'config.json');
 await writeFile(config, JSON.stringify({ sshHost: 'fake-rx', bind: 'stdio', remoteNode: process.execPath, remoteRoot: remote,
  expectedHostname: hostname(), expectedUid: process.getuid(), knownHosts, hostKeyAlias: 'rx-alias', expectedHostKeyFingerprint: fingerprint, expectedProxyCommand: 'none', helperTimeoutMs: 10000,
  trialTimeoutMs: 120000, ...extra }));
 const log = join(dir, 'ssh.log');
 const result = await exec(process.execPath, [new URL('../experiments/dispatch-test-host/run-cross-host.mjs', import.meta.url).pathname, out, config],
  { env: { ...process.env, PATH: bin + ':' + process.env.PATH, FAKE_SSH_LOG: log, FAKE_SSH_POLICY: policy, FAKE_SSH_HANG_ON: extra.hangOn ?? '', ...env }, timeout: 130000 }).then(
   x => ({ ok: true, ...x }), e => ({ ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? '', error: e }));
 const calls = await readFile(log, 'utf8').then(s => s.trim().split('\n').filter(Boolean).map(JSON.parse), () => []);
 return { result, calls, remote, out };
}

test('offline fake SSH: every receiver launcher, observer, upload, hash, inspection and cleanup transport carries the pin policy', opts, async () => {
 const { result, calls } = await fakeSshTrial();
 assert.equal(result.ok, true, result.stderr);
 assert.ok(calls.length > 10);
 for (const { options } of calls) assert.deepEqual({ batch: options.batchmode, forwarding: options.clearallforwardings, strict: options.stricthostkeychecking,
  alias: options.hostkeyalias, known: Boolean(options.userknownhostsfile) }, { batch: 'yes', forwarding: 'yes', strict: 'yes', alias: 'rx-alias', known: true });
 for (const token of ['remote-receiver.mjs', 'remote-observer.mjs', 'cat >', 'shasum', 'pgrep', 'rm -rf']) assert.ok(calls.some(c => c.args.at(-1).includes(token)), token);
});

for (const policy of ['permissive', 'mismatch', 'global-known-hosts', 'proxyjump', 'localcommand', 'knownhostscommand']) test('offline fake SSH: effective ' + policy + ' policy is rejected before remote effects', opts, async () => {
 const { result, calls, remote } = await fakeSshTrial(policy);
 assert.equal(result.ok, false); assert.match(result.stderr, /effective SSH policy/);
 assert.equal(calls.length, 1); await assert.rejects(readFile(remote), /ENOENT/);
});

test('offline fake SSH: synchronous helper timeout is finite and exact nonce-root cleanup is attempted', opts, async () => {
 const started = Date.now();
 const { result, calls, out } = await fakeSshTrial('strict', { helperTimeoutMs: 200, trialTimeoutMs: 1000, hangOn: 'mkdir -p' });
 assert.equal(result.ok, false); assert.ok(Date.now() - started < 10000);
 assert.ok(calls.some(c => c.args.at(-1).startsWith("test -e '")), 'nonce-root existence probe missing');
 const cleanup = JSON.parse(await readFile(join(out, 'cleanup.json'), 'utf8'));
 assert.equal(cleanup.removed, true); assert.equal(cleanup.records_retained, false);
 assert.ok(!calls.some(c => /rm -rf/.test(c.args.at(-1)) && !c.args.at(-1).includes(cleanup.remote_root)), 'cleanup touched something other than the nonce root');
 assert.ok(calls.every(c => c.options.stricthostkeychecking === 'yes'));
});

test('offline fake SSH: an effective ProxyCommand must equal the declared one and is recorded', opts, async () => {
 const wrong = await fakeSshTrial('strict', {}, { FAKE_SSH_PROXY: '/tmp/evil-proxy' });
 assert.equal(wrong.result.ok, false); assert.match(wrong.result.stderr, /proxycommand/); assert.equal(wrong.calls.length, 1);
 const ok = await fakeSshTrial('strict', { expectedProxyCommand: '/bin/proxy a b' }, { FAKE_SSH_PROXY: '/bin/proxy a b' });
 assert.equal(ok.result.ok, true, ok.result.stderr);
});

test('offline fake SSH: wrong pin, malformed config and injection-shaped values are rejected before any ssh call', opts, async () => {
 const wrongPin = 'SHA256:' + 'A'.repeat(43);
 const cases = [{ expectedHostKeyFingerprint: wrongPin }, { expectedHostKeyFingerprint: 'nope' }, { hostKeyAlias: 'missing-alias' }, { hostKeyAlias: '-oProxyCommand=x' },
  { sshHost: '-oProxyCommand=touch' }, { sshHost: 'h;rm' }, { remoteRoot: '/tmp/../etc' }, { remoteRoot: '/' }, { remoteRoot: "/tmp/a'b" }, { helperTimeoutMs: 5 },
  { trialTimeoutMs: 50, helperTimeoutMs: 100 }, { cleanupReserveMs: 50 }, { trialTimeoutMs: 1000, helperTimeoutMs: 900, cleanupReserveMs: 500 }, { expectedProxyCommand: undefined }];
 for (const extra of cases) {
  const { result, calls, remote } = await fakeSshTrial('strict', extra);
  assert.equal(result.ok, false, JSON.stringify(extra));
  assert.ok(calls.every(c => c.args.includes('-G')), 'no remote effect: ' + JSON.stringify(extra));
  await assert.rejects(readFile(remote), /ENOENT/);
 }
});

test('offline fake SSH: success retains records before removing only the nonce root, leaving the configured root and siblings', opts, async () => {
 const dir = await tmp('arc69-fake-keep-');
 const { result, remote, out } = await fakeSshTrial('strict');
 assert.equal(result.ok, true, result.stderr);
 const cleanup = JSON.parse(await readFile(join(out, 'cleanup.json'), 'utf8'));
 assert.equal(cleanup.removed, true); assert.equal(cleanup.records_retained, true); assert.match(cleanup.records_tar_sha256, /^sha256:[0-9a-f]{64}$/);
 assert.ok(cleanup.remote_root.startsWith(remote + '/')); await readFile(join(out, 'm3-records.tar'));
 await assert.rejects(readFile(cleanup.remote_root), /ENOENT|EISDIR/); assert.ok(dir);
});

test('offline fake SSH: when records cannot be fetched the nonce root is kept as evidence and the run fails', opts, async () => {
 const { result, calls, out } = await fakeSshTrial('strict', { helperTimeoutMs: 3000, hangOn: 'tar -C' });
 assert.equal(result.ok, false);
 const cleanup = JSON.parse(await readFile(join(out, 'cleanup.json'), 'utf8'));
 assert.equal(cleanup.records_retained, false); assert.equal(cleanup.removed, false);
 assert.ok(!calls.some(c => /rm -rf/.test(c.args.at(-1)) && c.args.at(-1).includes(cleanup.remote_root)), 'removed before retaining evidence');
});

// --- Wall-clock bound over preflight, cases and cleanup, and cleanup order (stop and prove dead, then archive, then delete) ---
const remotes = calls => calls.map(c => c.args.at(-1));
const idx = (calls, re) => remotes(calls).map((r, i) => re.test(r) ? i : -1).filter(i => i >= 0);
const cleanupOf = out => readFile(join(out, 'cleanup.json'), 'utf8').then(JSON.parse);
const timed = async run => { const t = Date.now(); const r = await run(); return { ...r, elapsed: Date.now() - t }; };
const SLACK = 6000;   // node start, ssh-keygen and reaping on a loaded machine

test('offline fake SSH: cleanup stops and proves the nonce receivers dead, then archives twice, then removes only the nonce root', opts, async () => {
 const { result, calls, out } = await fakeSshTrial();
 assert.equal(result.ok, true, result.stderr);
 const stop = idx(calls, /pkill -TERM -f .*emote-receiver/), tar = idx(calls, /^tar -C/), rm = idx(calls, /rm -rf/), exists = idx(calls, /^test -e .* && echo present/);
 assert.equal(stop.length, 1); assert.equal(tar.length, 2); assert.equal(rm.length, 1);
 assert.ok(exists[0] < stop[0] && stop[0] < tar[0] && tar[1] < rm[0], 'order: exists, stop, archive, archive, remove');
 assert.ok(remotes(calls)[stop[0]].includes('pkill -KILL'), 'stop escalates and verifies');
 const cleanup = await cleanupOf(out);
 assert.equal(cleanup.quiescent, true); assert.equal(cleanup.removed, true); assert.equal(cleanup.records_retained, true);
});

test('offline fake SSH: if a nonce receiver cannot be proven dead nothing is archived or deleted and cleanup fails', opts, async () => {
 const { result, calls, out } = await fakeSshTrial('strict', {}, { FAKE_SSH_STOP_ALIVE: '1' });
 assert.equal(result.ok, false); assert.equal(result.error.code, 3);
 assert.deepEqual(idx(calls, /^tar -C/), []); assert.deepEqual(idx(calls, /rm -rf/), []);
 const cleanup = await cleanupOf(out);
 assert.equal(cleanup.quiescent, false); assert.equal(cleanup.records_retained, false); assert.equal(cleanup.removed, false);
 assert.ok((await readdir(cleanup.remote_root)).length > 0, 'remote nonce root must remain as evidence');
 await assert.rejects(readFile(join(out, 'm3-records.tar')), /ENOENT/);
});

test('offline fake SSH: an archive that changes between two reads is not retained and the root is not deleted', opts, async () => {
 const { result, calls, out } = await fakeSshTrial('strict', {}, { FAKE_SSH_TAR_UNSTABLE: '1' });
 assert.equal(result.ok, false); assert.equal(result.error.code, 3);
 assert.deepEqual(idx(calls, /rm -rf/), []);
 const cleanup = await cleanupOf(out);
 assert.equal(cleanup.quiescent, true); assert.equal(cleanup.records_retained, false); assert.equal(cleanup.removed, false);
 assert.match(cleanup.errors.join(' '), /not stable/); await readdir(cleanup.remote_root);
});

test('offline fake SSH: a hung stop step is bounded, and prevents archive and delete', opts, async () => {
 const { result, calls, out, elapsed } = await timed(() => fakeSshTrial('strict', { helperTimeoutMs: 1000, trialTimeoutMs: 40000, cleanupReserveMs: 8000 }, { FAKE_SSH_HANG_ON: 'pkill' }));
 assert.equal(result.ok, false); assert.ok(elapsed < 40000 + SLACK, 'elapsed ' + elapsed);
 assert.deepEqual(idx(calls, /^tar -C/), []); assert.deepEqual(idx(calls, /rm -rf/), []);
 assert.equal((await cleanupOf(out)).removed, false);
});

test('offline fake SSH: a hung remove step is bounded by the helper timeout and reported as not removed', opts, async () => {
 const { result, out, elapsed } = await timed(() => fakeSshTrial('strict', { helperTimeoutMs: 1000, trialTimeoutMs: 40000, cleanupReserveMs: 8000 }, { FAKE_SSH_HANG_ON: 'rm -rf' }));
 assert.equal(result.ok, false); assert.equal(result.error.code, 3); assert.ok(elapsed < 40000 + SLACK, 'elapsed ' + elapsed);
 const cleanup = await cleanupOf(out); assert.equal(cleanup.records_retained, true); assert.equal(cleanup.removed, false);
});

test('offline fake SSH: slow preflight is bounded by the helper timeout and precedes every remote effect', opts, async () => {
 const { result, calls, remote, elapsed } = await timed(() => fakeSshTrial('strict', { helperTimeoutMs: 500, trialTimeoutMs: 3000, cleanupReserveMs: 1000 }, { FAKE_SSH_G_DELAY_MS: '20000' }));
 assert.equal(result.ok, false); assert.ok(elapsed < 3000 + SLACK, 'elapsed ' + elapsed);
 assert.ok(calls.every(c => c.args.includes('-G'))); await assert.rejects(readFile(remote), /ENOENT/);
});

test('offline fake SSH: the deadline counts from process start, so a slow preflight shortens the trial and cleanup still runs inside the total bound', opts, async () => {
 const trial = 8000;
 const { result, out, elapsed } = await timed(() => fakeSshTrial('strict', { helperTimeoutMs: 2000, trialTimeoutMs: trial, cleanupReserveMs: 3000 }, { FAKE_SSH_G_DELAY_MS: '1500' }));
 assert.equal(result.ok, false); assert.equal(result.error.code, 124); assert.match(result.stderr, /overall trial timeout/);
 assert.ok(elapsed < trial + SLACK, 'elapsed ' + elapsed);
 const cleanup = await cleanupOf(out); assert.equal(cleanup.removed, true, JSON.stringify(cleanup));
});

test('offline fake SSH: a hung case session is abandoned at the work deadline, reaped, and the nonce root is still cleaned', opts, async () => {
 const trial = 12000;
 const { result, out, elapsed } = await timed(() => fakeSshTrial('strict', { helperTimeoutMs: 2000, trialTimeoutMs: trial, cleanupReserveMs: 4000 }, { FAKE_SSH_HANG_ON: "'exec'" }));
 assert.equal(result.ok, false); assert.equal(result.error.code, 124);
 assert.ok(elapsed < trial + SLACK, 'elapsed ' + elapsed);
 const cleanup = await cleanupOf(out); assert.equal(cleanup.removed, true, JSON.stringify(cleanup)); assert.equal(cleanup.quiescent, true);
});
