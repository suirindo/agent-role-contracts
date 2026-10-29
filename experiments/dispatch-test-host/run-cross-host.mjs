/**
 * Bounded cross-host TEST trial (#69). Usage: node experiments/dispatch-test-host/run-cross-host.mjs <empty_out_dir> <config.json>
 * config: { sshHost, bind, overlayHost, remoteNode, remoteRoot, expectedHostname, expectedUid, knownHosts, hostKeyAlias, sshPort }
 *  bind = an address on the receiver host (HTTP listener there) or "stdio" (no listener; requests ride the receiver process's own
 *  SSH session stdin/stdout, so no port is opened or forwarded on either host).
 * Sender/resolver here; receiver sets on the separate host over SSH (one session per case, ended after the case); then a separate
 * observer process on the receiver host. One synthetic line; keys and per-case secrets are memory only. Not production authority.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localLauncher, sshLauncher, observe, REMOTE_RECEIVER_SCRIPT, REMOTE_OBSERVER_SCRIPT, PAYLOAD, TEST_AUTHORITY } from './cross-host.mjs';
import { CASES, runCase, judge } from './cross-host-cases.mjs';

const [outArg, cfgArg] = process.argv.slice(2);
if (!outArg || !cfgArg) { console.error('usage: run-cross-host.mjs <out_dir> <config.json>'); process.exit(2); }
const out = resolve(outArg), cfg = JSON.parse(await readFile(cfgArg, 'utf8'));
await mkdir(out, { mode: 0o700, recursive: true });
if ((await readdir(out)).length) { console.error('out_dir not empty'); process.exit(2); }
const stdio = cfg.bind === 'stdio';
const helperTimeoutMs = Number(cfg.helperTimeoutMs ?? 30000), trialTimeoutMs = Number(cfg.trialTimeoutMs ?? 300000);
if (!Number.isInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 120000 || !Number.isInteger(trialTimeoutMs) || trialTimeoutMs < helperTimeoutMs || trialTimeoutMs > 900000) throw new Error('invalid timeout configuration');
for (const key of ['sshHost', 'remoteNode', 'remoteRoot', 'knownHosts', 'hostKeyAlias', 'expectedHostKeyFingerprint', 'expectedProxyCommand']) if (typeof cfg[key] !== 'string' || !cfg[key]) throw new Error('missing config ' + key);
// Caller values reach ssh option values, argv and a remote shell (quoted) and pgrep/pkill patterns: allow only plain tokens.
const plainPath = /^\/[A-Za-z0-9_.\/-]+$/, plainToken = /^[A-Za-z0-9_.:\[\]@-]+$/;
if (!plainPath.test(cfg.remoteRoot) || cfg.remoteRoot.split('/').some(x => x === '..' || x === '.') || cfg.remoteRoot === '/') throw new Error('remoteRoot must be a plain absolute path');
if (!plainPath.test(cfg.remoteNode) || !plainPath.test(cfg.knownHosts)) throw new Error('remoteNode and knownHosts must be plain absolute paths');
if (!plainToken.test(cfg.sshHost) || cfg.sshHost.startsWith('-') || !plainToken.test(cfg.hostKeyAlias) || cfg.hostKeyAlias.startsWith('-')) throw new Error('sshHost and hostKeyAlias must be plain tokens');
if (!/^SHA256:[A-Za-z0-9+\/]{43}$/.test(cfg.expectedHostKeyFingerprint)) throw new Error('expectedHostKeyFingerprint must be an ssh SHA256 fingerprint');

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
const startedAt = Date.now();
const remaining = () => { const n = trialTimeoutMs - (Date.now() - startedAt); if (n <= 0) throw new Error('overall trial timeout'); return n; };
const bounded = (command, args, options = {}) => execFileSync(command, args, { timeout: Math.min(helperTimeoutMs, remaining()), ...options });
const git = a => bounded('git', a, { cwd: root, encoding: 'utf8' }).trim();
const head = git(['rev-parse', 'HEAD']), dirty = git(['status', '--porcelain']).length > 0;
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
const ssh = (remote, input) => { commands.push({ ssh: cfg.sshHost, remote, stdin_bytes: input ? input.length : 0 }); return bounded('ssh', [...sshArgs, remote], { input, encoding: 'utf8', maxBuffer: 64 << 20 }); };
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

// Resolve the effective client policy with the exact arguments every transport will use. Local-only; precedes secrets and remote effects.
const policyText = bounded('ssh', [...sshOptions, '-G', cfg.sshHost], { encoding: 'utf8' });
const effective = new Map(policyText.trim().split('\n').map(l => { const i = l.indexOf(' '); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
for (const [key, want] of Object.entries(PINNED)) {
 const got = effective.get(key);
 if (key === 'stricthostkeychecking' ? got !== 'true' && got !== 'yes' : got !== want) throw new Error('effective SSH policy mismatch: ' + key);
}
for (const key of ABSENT_OR_NONE) if (effective.has(key) && effective.get(key) !== 'none') throw new Error('effective SSH policy mismatch: ' + key);
if ((effective.get('proxycommand') ?? 'none') !== cfg.expectedProxyCommand) throw new Error('effective SSH policy mismatch: proxycommand');
// Case internals already have finite transport/startup bounds. Check the aggregate deadline only after their cleanup has settled.
const withinTrial = async promise => { const result = await promise; remaining(); return result; };

// The pinned key for the alias must be exactly one ED25519 key and equal the fingerprint the caller verified out of band.
const pinnedKeys = bounded('ssh-keygen', ['-F', cfg.hostKeyAlias, '-f', cfg.knownHosts, '-l'], { encoding: 'utf8' }).split('\n').filter(l => l && !l.startsWith('#')).map(l => l.trim().split(/\s+/));
if (pinnedKeys.length !== 1 || !/ED25519/.test(pinnedKeys[0].join(' ')) || pinnedKeys[0][2] !== cfg.expectedHostKeyFingerprint) throw new Error('known_hosts pin for alias is not exactly the expected ED25519 fingerprint');
const pinned = pinnedKeys[0][2];
const sshPolicy = policyText.split('\n').filter(l => /^(stricthostkeychecking|clearallforwardings|batchmode|hostkeyalias|userknownhostsfile|globalknownhostsfile|hostkeyalgorithms|user|port|proxycommand) /.test(l));
// Only after policy and pin verification, one TCP touch may wake a lazily connected overlay peer (no data sent).
if (cfg.overlayHost) { try { bounded('nc', ['-z', '-G', '20', cfg.overlayHost, String(cfg.sshPort)], { stdio: 'ignore' }); } catch { /* ssh reports */ } }

// Place the two dependency-free scripts on the receiver host and verify their bytes there.
const scripts = { 'remote-receiver.mjs': await readFile(REMOTE_RECEIVER_SCRIPT), 'remote-observer.mjs': await readFile(REMOTE_OBSERVER_SCRIPT) };

// Exact nonce-root custody. Records are fetched into out_dir first (read-only tar); only if that is retained is the remote nonce root
// stopped and removed. cfg.remoteRoot itself and any sibling are never touched. Idempotent; used by the normal path and the watchdog.
// Regex with a bracketed first letter so the pattern does not match the remote shell whose command line carries it.
const receiverPattern = remoteRoot.replace(/\./g, '\\.') + '/bin/[r]emote-receiver\\.mjs';
let finalized = null;
const finalize = reason => {
 if (finalized) return finalized;
 const result = { reason, remote_root: remoteRoot, records_retained: false, records_tar_sha256: null, removed: false, errors: [] };
 const run = (label, remote, opts = {}) => { commands.push({ ssh: cfg.sshHost, remote, stdin_bytes: 0 });
  try { return execFileSync('ssh', [...sshArgs, remote], { timeout: helperTimeoutMs, maxBuffer: 256 << 20, ...opts }); } catch (e) { result.errors.push(label + ': ' + e.message.split('\n')[0]); return null; } };
 const exists = run('exists', 'test -e ' + shq(remoteRoot) + ' && echo present || echo absent', { encoding: 'utf8' });
 if (exists === null) { finalized = result; return result; }                  // cannot even talk to the host: nothing is claimed removed
 if (exists.trim() === 'present') {
  const tar = run('fetch records', 'tar -C ' + shq(remoteRoot) + ' -cf - --exclude ./bin .');
  if (tar && tar.length) { writeFileSync(join(out, 'm3-records.tar'), tar, { mode: 0o600 }); result.records_retained = true; result.records_tar_sha256 = sha(tar); }
  if (result.records_retained) {
   run('stop receivers', 'pkill -f ' + shq(receiverPattern) + ' ; true');
   run('remove nonce root', 'rm -rf -- ' + shq(remoteRoot));
   result.removed = run('verify removed', 'test -e ' + shq(remoteRoot) + ' && echo present || echo absent', { encoding: 'utf8' })?.trim() === 'absent';
  } else result.errors.push('records not retained: remote nonce root left in place for inspection');
 } else result.removed = true;                                                  // never created
 writeFileSync(join(out, 'cleanup.json'), JSON.stringify(result, null, 1) + '\n', { mode: 0o600 });
 finalized = result; return result;
};
// Overall trial bound: asynchronous cases cannot outlive it. On expiry retain+clean the nonce root, then exit non-zero.
const watchdog = setTimeout(() => { process.stderr.write('overall trial timeout\n'); try { finalize('watchdog'); } finally { process.exit(124); } }, trialTimeoutMs);
const impDir = await mkdtemp(join(tmpdir(), 'arc69-xhost-impostor-'));
try {
ssh('umask 077 && mkdir -p ' + shq(remoteRoot + '/bin'));
for (const [f, bytes] of Object.entries(scripts)) ssh('umask 077 && cat > ' + shq(remoteRoot + '/bin/' + f), bytes);
const remoteHashes = ssh('shasum -a 256 ' + Object.keys(scripts).map(f => shq(remoteRoot + '/bin/' + f)).join(' '));
for (const [f, bytes] of Object.entries(scripts)) if (!remoteHashes.includes(sha(bytes).slice(7))) throw new Error('remote script hash mismatch ' + f);

const ctx = { rxLauncher: sshLauncher({ sshHost: cfg.sshHost, sshOptions, remoteNode: cfg.remoteNode, remoteRoot, bind: cfg.bind }),
 impostorLauncher: localLauncher(impDir, stdio ? 'stdio' : '127.0.0.1'), expected: { hostname: cfg.expectedHostname, uid: cfg.expectedUid }, nonce, proHead: head };
commands.push({ ssh: cfg.sshHost, remote: 'per case: exec ' + cfg.remoteNode + ' ' + remoteRoot + '/bin/remote-receiver.mjs ' + remoteRoot + '/<case> ' + cfg.bind + ' <spec>', stdin: 'secret/nonce line, then request lines (stdio mode); EOF ends it' });
const entries = [];
 for (const c of CASES) { entries.push(await withinTrial(runCase(c, ctx))); process.stderr.write('case ' + c.name + ' done\n'); }
 const rxObs = await withinTrial(observe('ssh', [...sshArgs, ['exec', cfg.remoteNode, remoteRoot + '/bin/remote-observer.mjs', remoteRoot].map(shq).join(' ')], Math.min(helperTimeoutMs, remaining())));
 commands.push({ ssh: cfg.sshHost, remote: 'exec ' + cfg.remoteNode + ' ' + remoteRoot + '/bin/remote-observer.mjs ' + remoteRoot });
 const leftover = ssh('pgrep -fl ' + shq(receiverPattern) + ' || echo none');
 const impObs = await withinTrial(observe(process.execPath, [REMOTE_OBSERVER_SCRIPT, impDir], Math.min(helperTimeoutMs, remaining())));
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
} finally {
 clearTimeout(watchdog);
 await rm(impDir, { recursive: true, force: true });
 const cleaned = finalize('end');
 process.stderr.write('remote cleanup: ' + JSON.stringify({ removed: cleaned.removed, records_retained: cleaned.records_retained, errors: cleaned.errors }) + '\n');
 if (!cleaned.removed) process.exitCode = 3;
}
