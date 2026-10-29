/**
 * Bounded cross-host TEST trial (#69). Usage: node experiments/dispatch-test-host/run-cross-host.mjs <empty_out_dir> <config.json>
 * config: { sshHost, bind, overlayHost, remoteNode, remoteRoot, expectedHostname, expectedUid, knownHosts, hostKeyAlias, sshPort }
 *  bind = an address on the receiver host (HTTP listener there) or "stdio" (no listener; requests ride the receiver process's own
 *  SSH session stdin/stdout, so no port is opened or forwarded on either host).
 * Sender/resolver here; receiver sets on the separate host over SSH (one session per case, ended after the case); then a separate
 * observer process on the receiver host. One synthetic line; keys and per-case secrets are memory only. Not production authority.
 * Wall clock: trialTimeoutMs bounds the WHOLE process (preflight, cases, observation and cleanup). Work (including preflight) must finish by
 * trialTimeoutMs - cleanupReserveMs; the reserve is what cleanup may use. Every helper is an async, process-group-killed, reaped child whose
 * timeout is min(helperTimeoutMs, remaining budget), so no step can run past its phase deadline; a hard failsafe exits at trialTimeoutMs.
 */
import { spawn } from 'node:child_process';
import { groupAlive, terminateGroup, armFailsafe } from './process-group.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localLauncher, sshLauncher, observe, killTrackedChildren, trackChild, REMOTE_RECEIVER_SCRIPT, REMOTE_OBSERVER_SCRIPT, PAYLOAD, TEST_AUTHORITY } from './cross-host.mjs';
import { CASES, runCase, judge } from './cross-host-cases.mjs';

const [outArg, cfgArg] = process.argv.slice(2);
if (!outArg || !cfgArg) { console.error('usage: run-cross-host.mjs <out_dir> <config.json>'); process.exit(2); }
const out = resolve(outArg), cfg = JSON.parse(await readFile(cfgArg, 'utf8'));
await mkdir(out, { mode: 0o700, recursive: true });
if ((await readdir(out)).length) { console.error('out_dir not empty'); process.exit(2); }
const stdio = cfg.bind === 'stdio';
const startedAt = Date.now();
const helperTimeoutMs = Number(cfg.helperTimeoutMs ?? 30000), trialTimeoutMs = Number(cfg.trialTimeoutMs ?? 300000);
const cleanupReserveMs = Number(cfg.cleanupReserveMs ?? Math.min(60000, Math.floor(trialTimeoutMs / 2)));
if (!Number.isInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 120000 || !Number.isInteger(trialTimeoutMs) || trialTimeoutMs > 900000
 || !Number.isInteger(cleanupReserveMs) || cleanupReserveMs < 100 || trialTimeoutMs < helperTimeoutMs + cleanupReserveMs) throw new Error('invalid timeout configuration');
const workDeadline = startedAt + trialTimeoutMs - cleanupReserveMs, hardDeadline = startedAt + trialTimeoutMs;
// Every child (ssh included) leads its own process group and is registered; "reaped" means the whole group is confirmed gone.
// Reap budget: one bounded TERM+KILL round per group, in parallel, carved out of the cleanup reserve. Cleanup steps end by
// hardDeadline - 2*reap (their own timeout-reap may then take up to reap), and the hard failsafe starts at hardDeadline - reap,
// so the process has exited by hardDeadline. A group whose death cannot be confirmed is reported UNKNOWN, never silently dropped.
const reapMs = Math.min(2000, Math.floor(cleanupReserveMs / 4)), reapOpts = { termMs: Math.floor(reapMs / 4), killMs: reapMs - Math.floor(reapMs / 4) };
const cleanupDeadline = hardDeadline - 2 * reapMs;
const unconfirmed = new Set();
const reapAll = async () => { const r = await Promise.race([killTrackedChildren(reapOpts), new Promise(res => setTimeout(() => res({ confirmed: false, unknown: ['timeout'] }), reapMs + 250))]);
 for (const pgid of r.unknown) unconfirmed.add(pgid); return r; };
const unknownNote = () => unconfirmed.size ? 'UNKNOWN: process groups not confirmed reaped: ' + [...unconfirmed].join(',') + '\n' : '';
// Hard failsafe: whatever is still running at the overall bound is group-terminated (bounded, confirmed) and the process exits.
armFailsafe({ delayMs: trialTimeoutMs - reapMs, reap: reapAll, note: unknownNote });
for (const key of ['sshHost', 'remoteNode', 'remoteRoot', 'knownHosts', 'hostKeyAlias', 'expectedHostKeyFingerprint', 'expectedProxyCommand']) if (typeof cfg[key] !== 'string' || !cfg[key]) throw new Error('missing config ' + key);
// Caller values reach ssh option values, argv and a remote shell (quoted) and pgrep/pkill patterns: allow only plain tokens.
const plainPath = /^\/[A-Za-z0-9_.\/-]+$/, plainToken = /^[A-Za-z0-9_.:\[\]@-]+$/;
if (!plainPath.test(cfg.remoteRoot) || cfg.remoteRoot.split('/').some(x => x === '..' || x === '.') || cfg.remoteRoot === '/') throw new Error('remoteRoot must be a plain absolute path');
if (!plainPath.test(cfg.remoteNode) || !plainPath.test(cfg.knownHosts)) throw new Error('remoteNode and knownHosts must be plain absolute paths');
if (!plainToken.test(cfg.sshHost) || cfg.sshHost.startsWith('-') || !plainToken.test(cfg.hostKeyAlias) || cfg.hostKeyAlias.startsWith('-')) throw new Error('sshHost and hostKeyAlias must be plain tokens');
if (!/^SHA256:[A-Za-z0-9+\/]{43}$/.test(cfg.expectedHostKeyFingerprint)) throw new Error('expectedHostKeyFingerprint must be an ssh SHA256 fingerprint');

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
/**
 * Async, bounded, reaped helper child. Timeout = min(helperTimeoutMs, time left to `deadline`); on expiry (or output overflow) the whole
 * process group is killed and the promise rejects once the child is reaped (or after a short grace if a descendant holds the pipes).
 * Resolves with stdout (Buffer, or string with encoding). A non-zero exit rejects.
 */
const exec = (command, args, { input, encoding, deadline = workDeadline, cwd, maxBuffer = 64 << 20, ignoreExit = false } = {}) => new Promise((resolve, reject) => {
 const budget = Math.min(helperTimeoutMs, deadline - Date.now());
 if (budget <= 0) return reject(new Error('trial deadline exhausted before ' + command));
 const child = trackChild(spawn(command, args, { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] }));
 const out = [], err = []; let size = 0, failure = null, settled = false, grace = null;
 const kill = why => { failure ??= new Error(why); try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } grace ??= setTimeout(() => finish(), 2000); };
 const reap = async () => { if (child.pid && groupAlive(child.pid) && !(await terminateGroup(child.pid, reapOpts))) { unconfirmed.add(child.pid); failure ??= new Error(command + ': UNKNOWN: process group ' + child.pid + ' not confirmed reaped'); } };
 const timer = setTimeout(() => kill(command + ' timed out after ' + budget + 'ms'), budget);
 const finish = async (code, signal) => {
  if (settled) return; settled = true; clearTimeout(timer); clearTimeout(grace);
  await reap();                                                                 // descendants (ProxyCommand) must not outlive the helper
  const stdout = Buffer.concat(out);
  if (failure) return reject(failure);
  if (!ignoreExit && code !== 0) return reject(new Error(command + ' exited ' + (code ?? signal) + ': ' + Buffer.concat(err).toString('utf8').trim().split('\n')[0]));
  resolve(encoding ? stdout.toString(encoding) : stdout);
 };
 child.stdout.on('data', d => { size += d.length; if (size > maxBuffer) kill('output exceeds maxBuffer'); else out.push(d); });
 child.stderr.on('data', d => { if (err.length < 64) err.push(d); });
 child.stdin.on('error', () => {});
 child.once('error', e => { failure ??= e; finish(); });
 child.once('close', finish);
 child.stdin.end(input);
});
const git = async a => (await exec('git', a, { cwd: root, encoding: 'utf8' })).trim();
const head = await git(['rev-parse', 'HEAD']), dirty = (await git(['status', '--porcelain'])).length > 0;
const nonce = randomBytes(16).toString('hex');
const remoteRoot = cfg.remoteRoot + '/' + nonce;
const commands = [];
// Every SSH consumer (scripts upload, hash, receiver sessions, observer, inspection, cleanup, -G) takes exactly these options. ssh uses the
// first value of an option, so they precede -T/host; the effective result is then verified with `ssh -G` before any secret or remote effect.
const PINNED = { batchmode: 'yes', clearallforwardings: 'yes', stricthostkeychecking: 'true', userknownhostsfile: cfg.knownHosts, globalknownhostsfile: '/dev/null',
 hostkeyalias: cfg.hostKeyAlias, hostkeyalgorithms: 'ssh-ed25519', verifyhostkeydns: 'false', updatehostkeys: 'false', checkhostip: 'no',
 forwardagent: 'no', forwardx11: 'no', permitlocalcommand: 'no' };
// The route may be chosen by a ProxyCommand (overlay host finder), which is route selection only: ssh itself still does the pinned key exchange.
// So the effective ProxyCommand must equal the one the caller declared (or 'none'); jumps and local/remote/known-hosts commands are never allowed.
const ABSENT_OR_NONE = ['proxyjump', 'remotecommand', 'localcommand', 'knownhostscommand'];
const sshOptions = ['BatchMode=yes', 'ClearAllForwardings=yes', 'ConnectTimeout=20', 'StrictHostKeyChecking=yes', 'UserKnownHostsFile=' + cfg.knownHosts,
 'GlobalKnownHostsFile=/dev/null', 'HostKeyAlias=' + cfg.hostKeyAlias, 'HostKeyAlgorithms=ssh-ed25519', 'VerifyHostKeyDNS=no', 'UpdateHostKeys=no', 'CheckHostIP=no',
 'ForwardAgent=no', 'ForwardX11=no', 'PermitLocalCommand=no', 'RemoteCommand=none'].flatMap(o => ['-o', o]);
const sshArgs = [...sshOptions, '-T', cfg.sshHost];
const ssh = (remote, input, options = {}) => { commands.push({ ssh: cfg.sshHost, remote, stdin_bytes: input ? input.length : 0 }); return exec('ssh', [...sshArgs, remote], { input, encoding: 'utf8', ...options }); };
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

// Resolve the effective client policy with the exact arguments every transport will use. Local-only; precedes secrets and remote effects.
const policyText = await exec('ssh', [...sshOptions, '-G', cfg.sshHost], { encoding: 'utf8' });
const effective = new Map(policyText.trim().split('\n').map(l => { const i = l.indexOf(' '); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
for (const [key, want] of Object.entries(PINNED)) {
 const got = effective.get(key);
 if (key === 'stricthostkeychecking' ? got !== 'true' && got !== 'yes' : got !== want) throw new Error('effective SSH policy mismatch: ' + key);
}
for (const key of ABSENT_OR_NONE) if (effective.has(key) && effective.get(key) !== 'none') throw new Error('effective SSH policy mismatch: ' + key);
if ((effective.get('proxycommand') ?? 'none') !== cfg.expectedProxyCommand) throw new Error('effective SSH policy mismatch: proxycommand');
// The pinned key for the alias must be exactly one ED25519 key and equal the fingerprint the caller verified out of band.
const pinnedKeys = (await exec('ssh-keygen', ['-F', cfg.hostKeyAlias, '-f', cfg.knownHosts, '-l'], { encoding: 'utf8' })).split('\n').filter(l => l && !l.startsWith('#')).map(l => l.trim().split(/\s+/));
if (pinnedKeys.length !== 1 || !/ED25519/.test(pinnedKeys[0].join(' ')) || pinnedKeys[0][2] !== cfg.expectedHostKeyFingerprint) throw new Error('known_hosts pin for alias is not exactly the expected ED25519 fingerprint');
const pinned = pinnedKeys[0][2];
const sshPolicy = policyText.split('\n').filter(l => /^(stricthostkeychecking|clearallforwardings|batchmode|hostkeyalias|userknownhostsfile|globalknownhostsfile|hostkeyalgorithms|user|port|proxycommand) /.test(l));
// Only after policy and pin verification, one TCP touch may wake a lazily connected overlay peer (no data sent).
if (cfg.overlayHost) { try { await exec('nc', ['-z', '-G', '20', cfg.overlayHost, String(cfg.sshPort)]); } catch { /* ssh reports */ } }

// Place the two dependency-free scripts on the receiver host and verify their bytes there.
const scripts = { 'remote-receiver.mjs': await readFile(REMOTE_RECEIVER_SCRIPT), 'remote-observer.mjs': await readFile(REMOTE_OBSERVER_SCRIPT) };

// Exact nonce-root custody, in this order, each step on the cleanup budget (up to the hard deadline):
//  1. stop the receiver processes of this nonce root and PROVE none is alive (remote shell prints dead/alive);
//  2. only then archive the quiescent root (read-only tar, twice; both byte-identical or the root is not stable);
//  3. retain the archive locally and read it back; 4. only then remove the nonce root and verify it is gone.
// If quiescence or retention cannot be proven the remote root is left in place and the cleanup fails. cfg.remoteRoot itself and any sibling
// are never touched. Idempotent; used by the normal path and the deadline path.
// Regex with a bracketed first letter so the pattern does not match the remote shell whose command line carries it.
const receiverPattern = remoteRoot.replace(/\./g, '\\.') + '/bin/[r]emote-receiver\\.mjs';
const stopScript = (() => { const p = shq(receiverPattern);
 return 'pkill -TERM -f ' + p + ' ; n=0; while pgrep -f ' + p + ' >/dev/null && [ $n -lt 20 ]; do sleep 0.25; n=$((n+1)); done; ' +
  'if pgrep -f ' + p + ' >/dev/null; then pkill -KILL -f ' + p + ' ; sleep 0.5; fi; if pgrep -f ' + p + ' >/dev/null; then echo alive; else echo dead; fi'; })();
let finalizing = null;
const finalize = reason => finalizing ??= (async () => {
 const result = { reason, remote_root: remoteRoot, quiescent: false, records_retained: false, records_tar_sha256: null, removed: false, errors: [] };
 const run = async (label, remote, opts = {}) => { try { return await ssh(remote, undefined, { deadline: cleanupDeadline, maxBuffer: 256 << 20, ...opts }); } catch (e) { result.errors.push(label + ': ' + e.message.split('\n')[0]); return null; } };
 const exists = await run('exists', 'test -e ' + shq(remoteRoot) + ' && echo present || echo absent');
 if (exists === null) return result;                                            // cannot even talk to the host: nothing is claimed removed
 if (exists.trim() === 'present') {
  const stopped = await run('stop receivers', stopScript);
  result.quiescent = stopped?.trim() === 'dead';
  if (stopped !== null && !result.quiescent) result.errors.push('stop receivers: a receiver process of this nonce is still alive');
  if (result.quiescent) {
   const tar = [];
   for (let i = 0; i < 2; i++) { tar[i] = await run('archive ' + i, 'tar -C ' + shq(remoteRoot) + ' -cf - --exclude ./bin .', { encoding: undefined }); if (!tar[i]) break; }
   if (tar[0]?.length && tar[1] && Buffer.compare(tar[0], tar[1]) === 0) {
    const file = join(out, 'm3-records.tar');
    try { writeFileSync(file, tar[0], { mode: 0o600 }); if (sha(readFileSync(file)) !== sha(tar[0])) throw new Error('readback mismatch');
     result.records_retained = true; result.records_tar_sha256 = sha(tar[0]); } catch (e) { result.errors.push('retain records: ' + e.message); }
   } else if (tar[0] && tar[1]) result.errors.push('archive: root is empty or not stable between two reads');
  }
  if (result.records_retained) {
   await run('remove nonce root', 'rm -rf -- ' + shq(remoteRoot));
   result.removed = (await run('verify removed', 'test -e ' + shq(remoteRoot) + ' && echo present || echo absent'))?.trim() === 'absent';
  } else result.errors.push('records not retained or receivers not provably stopped: remote nonce root left in place for inspection');
 } else result.removed = true;                                                  // never created
 return result;
})().then(result => { try { writeFileSync(join(out, 'cleanup.json'), JSON.stringify(result, null, 1) + '\n', { mode: 0o600 }); } catch { /* reported via exit code */ } return result; });
// Overall work bound: asynchronous work cannot outlive workDeadline; cleanup then runs on the reserve (hard failsafe above).
let workTimer; const deadlineHit = new Promise((_, reject) => { workTimer = setTimeout(() => reject(new Error('overall trial timeout')), Math.max(0, workDeadline - Date.now())); });
let timedOut = false;
const impDir = await mkdtemp(join(tmpdir(), 'arc69-xhost-impostor-'));
const work = async () => {
await ssh('umask 077 && mkdir -p ' + shq(remoteRoot + '/bin'));
for (const [f, bytes] of Object.entries(scripts)) await ssh('umask 077 && cat > ' + shq(remoteRoot + '/bin/' + f), bytes);
const remoteHashes = await ssh('shasum -a 256 ' + Object.keys(scripts).map(f => shq(remoteRoot + '/bin/' + f)).join(' '));
for (const [f, bytes] of Object.entries(scripts)) if (!remoteHashes.includes(sha(bytes).slice(7))) throw new Error('remote script hash mismatch ' + f);

const ctx = { rxLauncher: sshLauncher({ sshHost: cfg.sshHost, sshOptions, remoteNode: cfg.remoteNode, remoteRoot, bind: cfg.bind }),
 impostorLauncher: localLauncher(impDir, stdio ? 'stdio' : '127.0.0.1'), expected: { hostname: cfg.expectedHostname, uid: cfg.expectedUid }, nonce, proHead: head };
commands.push({ ssh: cfg.sshHost, remote: 'per case: exec ' + cfg.remoteNode + ' ' + remoteRoot + '/bin/remote-receiver.mjs ' + remoteRoot + '/<case> ' + cfg.bind + ' <spec>', stdin: 'secret/nonce line, then request lines (stdio mode); EOF ends it' });
const entries = [];
 for (const c of CASES) { if (timedOut) throw new Error('overall trial timeout'); entries.push(await runCase(c, ctx)); process.stderr.write('case ' + c.name + ' done\n'); }
 const rxObs = await observe('ssh', [...sshArgs, ['exec', cfg.remoteNode, remoteRoot + '/bin/remote-observer.mjs', remoteRoot].map(shq).join(' ')], Math.min(helperTimeoutMs, workDeadline - Date.now()));
 commands.push({ ssh: cfg.sshHost, remote: 'exec ' + cfg.remoteNode + ' ' + remoteRoot + '/bin/remote-observer.mjs ' + remoteRoot });
 const leftover = await ssh('pgrep -fl ' + shq(receiverPattern) + ' || echo none');
 const impObs = await observe(process.execPath, [REMOTE_OBSERVER_SCRIPT, impDir], Math.min(helperTimeoutMs, workDeadline - Date.now()));
 await writeFile(join(out, 'm3-observation.json'), rxObs.raw, { mode: 0o600 });
 await writeFile(join(out, 'pro-impostor-observation.json'), impObs.raw, { mode: 0o600 });
 const verdicts = CASES.map((c, i) => judge(c, entries[i], { rx: rxObs.json.cases[c.name], impostor: impObs.json.cases[c.name] }));
 const bind = CASES.map(c => { const m = rxObs.json.cases[c.name]?.manifest; return { case: c.name, nonce: m?.nonce === nonce, pro_head: m?.pro_head === head,
  hostname: m?.receiver_host?.hostname === cfg.expectedHostname, uid: m?.receiver_host?.uid === cfg.expectedUid, bind: m?.bind_host === cfg.bind }; });
 const allBound = bind.every(b => Object.entries(b).every(([k, v]) => k === 'case' || v === true));
 const evidence = {
  profile: 'arc69-cross-host-trial/0.1', authority: TEST_AUTHORITY, trial_nonce: nonce,
  sender: { node: process.version, platform: process.platform, arch: process.arch, uid: process.getuid(), git_head: head, git_dirty: dirty },
  receiver_host: { ssh_alias: cfg.sshHost, bind: cfg.bind, overlay_host: cfg.overlayHost, expected_hostname: cfg.expectedHostname, expected_uid: cfg.expectedUid,
   transport: stdio ? 'no listener: request/response JSON lines on the receiver process\'s own SSH session stdin/stdout (pinned host key, over the overlay)' : 'HTTP to bind address',
   ssh_client_policy: sshPolicy, ssh_host_key_pinned: pinned, host_key_alias: cfg.hostKeyAlias,
   remote_root: remoteRoot, remote_node: cfg.remoteNode, remote_script_sha256: Object.fromEntries(Object.entries(scripts).map(([f, b]) => [f, sha(b)])),
   remote_shasum_output: remoteHashes.trim(), observer: rxObs.json.observer, observer_output_sha256: sha(rxObs.raw), observer_anomalies: rxObs.json.anomalies,
   receiver_processes_after_trial: leftover.trim() },
  payload: { synthetic: true, byte_length: PAYLOAD.length, sha256: sha(PAYLOAD) },
  key_material: 'issuer keys and per-case identity secrets in memory only; never written to disk on either host',
  network: stdio ? 'sender -> SSH session (pinned host key, NetBird overlay) -> receiver process stdin; no listening port on the receiver host; impostor on sender 127.0.0.1; no external endpoint'
   : 'sender -> receiver host bind address; impostor on sender 127.0.0.1; no external endpoint',
  limitations: { production_authority: false, native_host_enforcement: false, native_n0: 'UNKNOWN',
   receiver_independence: 'separate host and separate UID; NOT tamper-proof: the SSH credential holder for the receiver user can read/rewrite its logs',
   resolution_independence: 'UNPROVEN: the sender host still resolves and sends',
   destination_binding: stdio ? 'TEST level: endpoint = receiver process inside an SSH session to the pinned-host-key receiver host + per-case HMAC identity proof; not a network-addressed destination'
    : 'TEST level: pinned SSH host key + bind address + per-case HMAC identity proof',
   clock: 'fixed synthetic test clock for the adapter; receiver t_ms is receiver wall clock', acceptance: 'UNKNOWN; independent QC separate and mandatory' },
  all_pass: verdicts.every(v => v.pass) && allBound && rxObs.json.anomalies.length === 0,
  binding_checks: bind, verdicts, cases: entries, commands,
 };
 const body = JSON.stringify(evidence, null, 1) + '\n';
 await writeFile(join(out, 'trial.json'), body, { mode: 0o600 });
 await writeFile(join(out, 'trial.json.sha256'), sha(body) + '  trial.json\n', { mode: 0o600 });
 console.log(JSON.stringify({ trial_sha256: sha(body), head, dirty, nonce, all_pass: evidence.all_pass, leftover: leftover.trim(),
  verdicts: verdicts.map(v => [v.name, v.pass, v.receiver_counts, v.fails]) }));
};
let failed = false;
try {
 const running = work(); running.catch(() => {});
 await Promise.race([running, deadlineHit]);
} catch (e) {
 failed = true; timedOut = e.message === 'overall trial timeout';
 process.stderr.write('trial failed: ' + e.message + '\n'); process.exitCode = timedOut ? 124 : 1;
} finally {
 clearTimeout(workTimer); deadlineHit.catch(() => {});
 if (failed) await reapAll();    // abandoned case sessions must not outlive the work phase; cleanup below uses fresh children
 await rm(impDir, { recursive: true, force: true });
 const cleaned = await finalize('end');
 process.stderr.write('remote cleanup: ' + JSON.stringify({ quiescent: cleaned.quiescent, removed: cleaned.removed, records_retained: cleaned.records_retained, errors: cleaned.errors }) + '\n');
 await reapAll();                                                               // final sweep: nothing this trial spawned may outlive it
 if (unconfirmed.size) {
  process.stderr.write(unknownNote()); cleaned.process_groups_unconfirmed = [...unconfirmed];
  try { writeFileSync(join(out, 'cleanup.json'), JSON.stringify(cleaned, null, 1) + '\n', { mode: 0o600 }); } catch { /* reported via exit code */ }
 }
 if (!cleaned.removed || unconfirmed.size) process.exitCode = 3;
 if (failed || unconfirmed.size) process.exit(process.exitCode);
}
