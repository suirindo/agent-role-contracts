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

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
const git = a => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const head = git(['rev-parse', 'HEAD']), dirty = git(['status', '--porcelain']).length > 0;
const nonce = randomBytes(16).toString('hex');
const remoteRoot = cfg.remoteRoot + '/' + nonce;
const commands = [];
const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-T', cfg.sshHost];
const ssh = (remote, input) => { commands.push({ ssh: cfg.sshHost, remote, stdin_bytes: input ? input.length : 0 }); return execFileSync('ssh', [...sshArgs, remote], { input, encoding: 'utf8', maxBuffer: 64 << 20 }); };
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

// A lazily connected overlay peer may be asleep; one TCP touch of the SSH port wakes it (no data sent).
if (cfg.overlayHost) { try { execFileSync('nc', ['-z', '-G', '20', cfg.overlayHost, String(cfg.sshPort)], { stdio: 'ignore' }); } catch { /* ssh reports */ } }
// Receiver host identity evidence: pinned known_hosts fingerprint (what ssh enforces with StrictHostKeyChecking) and a live keyscan.
const pinned = execFileSync('ssh-keygen', ['-F', cfg.hostKeyAlias, '-f', cfg.knownHosts, '-l'], { encoding: 'utf8' }).split('\n').find(l => /ED25519/.test(l))?.trim().split(/\s+/)[2] ?? null;
let live = null;
try { live = execFileSync('ssh-keygen', ['-lf', '-'], { input: execFileSync('ssh-keyscan', ['-T', '10', '-t', 'ed25519', '-p', String(cfg.sshPort), cfg.overlayHost], { encoding: 'utf8' }), encoding: 'utf8' }).trim().split(/\s+/)[1]; } catch { live = null; }
const sshPolicy = execFileSync('ssh', ['-G', cfg.sshHost], { encoding: 'utf8' }).split('\n').filter(l => /^(stricthostkeychecking|clearallforwardings|batchmode|hostkeyalias|userknownhostsfile|user|port) /.test(l));

// Place the two dependency-free scripts on the receiver host and verify their bytes there.
const scripts = { 'remote-receiver.mjs': await readFile(REMOTE_RECEIVER_SCRIPT), 'remote-observer.mjs': await readFile(REMOTE_OBSERVER_SCRIPT) };
ssh('umask 077 && mkdir -p ' + shq(remoteRoot + '/bin'));
for (const [f, bytes] of Object.entries(scripts)) ssh('umask 077 && cat > ' + shq(remoteRoot + '/bin/' + f), bytes);
const remoteHashes = ssh('shasum -a 256 ' + Object.keys(scripts).map(f => shq(remoteRoot + '/bin/' + f)).join(' '));
for (const [f, bytes] of Object.entries(scripts)) if (!remoteHashes.includes(sha(bytes).slice(7))) throw new Error('remote script hash mismatch ' + f);

const impDir = await mkdtemp(join(tmpdir(), 'arc69-xhost-impostor-'));
const ctx = { rxLauncher: sshLauncher({ sshHost: cfg.sshHost, remoteNode: cfg.remoteNode, remoteRoot, bind: cfg.bind }),
 impostorLauncher: localLauncher(impDir), expected: { hostname: cfg.expectedHostname, uid: cfg.expectedUid }, nonce, proHead: head };
commands.push({ ssh: cfg.sshHost, remote: 'per case: exec ' + cfg.remoteNode + ' ' + remoteRoot + '/bin/remote-receiver.mjs ' + remoteRoot + '/<case> ' + cfg.bind + ' <spec>', stdin: 'secret/nonce line, then request lines (stdio mode); EOF ends it' });
const entries = [];
try {
 for (const c of CASES) { entries.push(await runCase(c, ctx)); process.stderr.write('case ' + c.name + ' done\n'); }
 const rxObs = await observe('ssh', [...sshArgs, ['exec', cfg.remoteNode, remoteRoot + '/bin/remote-observer.mjs', remoteRoot].map(shq).join(' ')]);
 commands.push({ ssh: cfg.sshHost, remote: 'exec ' + cfg.remoteNode + ' ' + remoteRoot + '/bin/remote-observer.mjs ' + remoteRoot });
 const leftover = ssh('pgrep -fl ' + shq(remoteRoot + '/bin/remote-receiver.mjs') + ' || echo none');
 const impObs = await observe(process.execPath, [REMOTE_OBSERVER_SCRIPT, impDir]);
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
   ssh_client_policy: sshPolicy, ssh_host_key_pinned: pinned, ssh_host_key_live_keyscan_overlay: live, host_key_alias: cfg.hostKeyAlias,
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
} finally { await rm(impDir, { recursive: true, force: true }); }
