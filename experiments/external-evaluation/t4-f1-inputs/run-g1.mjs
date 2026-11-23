#!/usr/bin/env node
// ARC-owned offline G1 runner candidate for T4 F1 (ARC #117). Declaration evidence only.
// NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN. Not signed, not a run receipt, not interoperable with the partner verifier.
// Usage: node run-g1.mjs --case C0|C1|C2|C3 --tarball <npm .tgz> --out <new directory>
// Exit: 0 = CLI exit 0 (PASS), 1 = CLI exit 1 (G1_SUBJECT_MISMATCH), 2 = CLI exit 2 (CLI/file error),
//       3 = wrapper refusal or runner error. The runner never grades the result against the case expectation.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const MAX_TARBALL = 8 * 1024 * 1024, MAX_UNPACKED = 32 * 1024 * 1024, MAX_INPUT = 1024 * 1024, MAX_OUTPUT = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const STATE = 'NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN';
const CASES = { C0: 'action.json', C1: 'action.c1.json', C2: 'action.json', C3: 'action.json' };
const FLAG_KEYS = ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified', 'source_files_checked', 'sensitive_data_scanned', 'output_schema_validated', 'subject_authenticated', 'review_authenticated', 'human_approval_authenticated', 'action_executed', 'replay_protection_enforced'];
const NOT_CLAIMED = [
  'no signature: the evidence is unsigned',
  'not a run receipt (neither t4-run-open/1 nor t4-run-receipt/2)',
  'G1 PASS is declaration consistency only; it does not authorise ERP forwarding',
  'binding.json is a synthetic, unauthenticated prior declaration',
  'no claim about ERP effect or no-effect',
  'wrapper_sha256 self-check only guards against accidents; identity is established only when someone outside the runner hashes run-g1.mjs and compares it with the pin',
  'pins are ARC_OWNER_PROPOSED, not in RC, not jointly accepted',
  'not the partner --runner-pins format and not the partner check 4 index paths; not interoperable with the partner verifier until that format is known',
  'no joint freeze, partner acceptance, lab or run authorization'
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sri512 = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
const tick = () => process.hrtime.bigint().toString();

class Refusal extends Error { constructor(reason, detail) { super(detail || reason); this.reason = reason; } }

function readRegular(path, max) {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) throw new Refusal('SYMLINK_REFUSED', path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile()) throw new Refusal('NOT_REGULAR_FILE', path);
    if (s.size > max) throw new Refusal('FILE_TOO_LARGE', path);
    const buf = Buffer.alloc(s.size);
    let n = 0;
    while (n < buf.length) { const k = readSync(fd, buf, n, buf.length - n, null); if (!k) break; n += k; }
    if (n !== buf.length) throw new Refusal('FILE_CHANGED_WHILE_READING', path);
    return buf;
  } finally { closeSync(fd); }
}

function parseArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--case', '--tarball', '--out'].includes(argv[i]) || out.has(argv[i]) || argv[i + 1] === undefined) return { error: 'ARGS_INVALID' };
    out.set(argv[i], argv[i + 1]);
  }
  const keys = [...out.keys()].join(' ');
  if (keys !== '--case --tarball --out') return { error: 'ARGS_INVALID', out: out.get('--out') };
  return { caseId: out.get('--case'), tarball: out.get('--tarball'), out: out.get('--out') };
}

// Minimal ustar reader: only regular files and directories under package/, no traversal, no links.
function unpack(tgz, dest) {
  const tar = gunzipSync(tgz, { maxOutputLength: MAX_UNPACKED });
  const wanted = name => name === 'package/package.json' || name.startsWith('package/bin/') || name.startsWith('package/src/');
  const files = [];
  let off = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(345, 500);
    const name = prefix ? `${prefix}/${str(0, 100)}` : str(0, 100);
    if (!Number.isInteger(size) || size < 0) throw new Refusal('TARBALL_MALFORMED', 'bad entry size');
    if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\') || name.includes('\0') || !name.startsWith('package/')) throw new Refusal('TARBALL_UNSAFE_ENTRY', name);
    if (type !== '0' && type !== '5') throw new Refusal('TARBALL_UNSAFE_ENTRY', `${name} type ${type}`);
    const data = tar.subarray(off + 512, off + 512 + size);
    if (type === '0' && wanted(name)) files.push([name, data]);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  const cli = files.find(([n]) => n === 'package/bin/agent-role-contracts.mjs');
  if (!cli) throw new Refusal('TARBALL_MALFORMED', 'package/bin/agent-role-contracts.mjs missing');
  for (const [name, data] of files) {
    const target = join(dest, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data, { flag: 'wx', mode: 0o600 });
  }
  return { cliPath: join(dest, cli[0]), cliSha256: sha256(cli[1]) };
}

function classify(cliExit, signal, stdout, stderr) {
  // Returns { status: 'OK'|'RUNNER_ERROR', verdict, observed, flags, reason }.
  const bad = reason => ({ status: 'RUNNER_ERROR', verdict: 'NOT_OBSERVED', reason, observed: null, flags: null });
  if (signal) return bad('CLI_SIGNAL');
  if (cliExit === 2) return bad('CLI_EXIT_2_CLI_OR_FILE_ERROR');
  if (cliExit !== 0 && cliExit !== 1) return bad('CLI_EXIT_UNEXPECTED');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout)); } catch { return bad('CLI_OUTPUT_NOT_JSON'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('CLI_OUTPUT_NOT_OBJECT');
  if (parsed.kind !== 'task-action-binding' || typeof parsed.valid !== 'boolean') return bad('CLI_OUTPUT_UNRECOGNISED');
  if (parsed.execution_authorized !== false) return bad('EXECUTION_AUTHORIZED_NOT_FALSE');
  const flags = {};
  for (const k of FLAG_KEYS) { if (typeof parsed[k] !== 'boolean') return bad(`FLAG_MISSING_${k}`); flags[k] = parsed[k]; }
  if (typeof parsed.subject_digest !== 'string' || !/^sha256:[0-9a-fA-F]{64}$/.test(parsed.subject_digest)) return bad('SUBJECT_DIGEST_MALFORMED');
  if (typeof parsed.binding_matches_subject !== 'boolean') return bad('BINDING_MATCHES_SUBJECT_NOT_BOOLEAN');
  if (!Array.isArray(parsed.errors) || parsed.errors.some(e => e === null || typeof e !== 'object' || Array.isArray(e) || typeof e.code !== 'string' || e.code === '')) return bad('ERRORS_MALFORMED');
  const codes = parsed.errors.map(e => e.code);
  const observed = { cli_exit_code: cliExit, valid: parsed.valid, codes: [...new Set(codes)], subject_digest: parsed.subject_digest, binding_matches_subject: parsed.binding_matches_subject };
  if (cliExit === 0 && parsed.valid === true && parsed.binding_matches_subject === true && codes.length === 0) return { status: 'OK', verdict: 'PASS', observed, flags };
  if (cliExit === 1 && parsed.valid === false && parsed.binding_matches_subject === false && codes.includes('G1_SUBJECT_MISMATCH')) return { status: 'OK', verdict: 'G1_SUBJECT_MISMATCH', observed, flags };
  return { ...bad(cliExit === 1 && parsed.valid === false ? 'CLI_INVALID_WITHOUT_G1_SUBJECT_MISMATCH' : 'CLI_EXIT_CONTRADICTS_OUTPUT'), observed, flags };
}

function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  if (!parsed.out) { console.error('RUNNER_REFUSED: --out is required and must be given once (no evidence written)'); return 3; }
  const out = resolve(parsed.out);
  try { mkdirSync(out); } catch (e) { console.error(`RUNNER_REFUSED: cannot create new out dir (${e.code || e.message}); nothing written`); return 3; }

  const seq = [];
  const step = name => seq.push({ step: name, seq: seq.length + 1, monotonic_ns: tick() });
  const ev = {
    schema: 'arc-t4-f1-g1-run-evidence/0-candidate', state: STATE, kind: 'ARC_OWNER_CANDIDATE_RUN_EVIDENCE',
    runner_status: 'REFUSED', refusal_reason: null, runner_error_reason: null,
    g1_verdict: 'NOT_OBSERVED', g1_verdict_scope: 'declaration_consistency_only',
    execution_authorized: false, case: parsed.caseId ?? null, case_expectation: null, observed: null, matches_manifest_expectation: null,
    prior_binding: { file: 'binding.json', synthetic: true, authenticated: false },
    limitation_flags: null, limitation_flags_source_stdout_sha256: null,
    pins: null, observed_identity: { wrapper_sha256: null, node_version: process.version, tarball: null, cli_sha256: null },
    inputs: null, wrapper: { argv_resolved: [process.execPath, fileURLToPath(import.meta.url), ...argv], exit_code: null },
    cli: { spawned: false, argv_resolved: null, timeout_ms: null, exit_code: null, signal: null, spawn_error: null },
    sequence: seq, wall_clock_utc_informational: new Date().toISOString(), raw_files: {}, not_claimed: NOT_CLAIMED
  };
  let tmp = null, wrapperExit = 3, reason = null, stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
  try {
    if (parsed.error) throw new Refusal('ARGS_INVALID', 'expected --case X --tarball Y --out Z in that order, once each');
    if (!Object.hasOwn(CASES, parsed.caseId)) throw new Refusal('CASE_UNKNOWN', parsed.caseId);
    const pinsBytes = readRegular(join(here, 'runner-pins.json'), MAX_INPUT);
    const pinsFile = JSON.parse(pinsBytes.toString('utf8'));
    const pins = pinsFile.pins;
    ev.pins = { file: 'runner-pins.json', file_sha256: sha256(pinsBytes), status: pinsFile.status, ...pins };
    ev.observed_identity.wrapper_sha256 = sha256(readRegular(fileURLToPath(import.meta.url), MAX_INPUT));
    if (ev.observed_identity.wrapper_sha256 !== pins.wrapper_sha256) throw new Refusal('WRAPPER_SHA256_MISMATCH');
    if (process.version !== pins.node_version) throw new Refusal('NODE_VERSION_MISMATCH', `${process.version} != ${pins.node_version}`);
    const t = pins.command && pins.command.template;
    const want = ['node', 'run-g1.mjs', '--case', '{case}', '--tarball', '{tarball}', '--out', '{out}'];
    if (!Array.isArray(t) || t.length !== want.length || t.some((x, i) => x !== want[i])) throw new Refusal('COMMAND_PIN_MISMATCH', 'pinned template is not the template this wrapper implements');
    const tgz = readRegular(parsed.tarball, MAX_TARBALL);
    ev.observed_identity.tarball = { sha256: sha256(tgz), bytes: tgz.length, integrity: sri512(tgz) };
    if (ev.observed_identity.tarball.integrity !== pins.package_integrity) throw new Refusal('PACKAGE_INTEGRITY_MISMATCH');
    step('pins_checked');

    const manifestBytes = readRegular(join(here, 'manifest.json'), MAX_INPUT);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    ev.case_expectation = manifest.expected_action_bind[parsed.caseId === 'C1' ? 'C1' : 'C0_C2_C3'];
    const actionName = CASES[parsed.caseId];
    ev.inputs = { 'manifest.json': { sha256: sha256(manifestBytes) } };
    const roles = { bundle: 'bundle.json', task: 'task.json', action: actionName, binding: 'binding.json' };
    const verified = {};
    for (const [role, name] of Object.entries(roles)) {
      const bytes = readRegular(join(here, 'inputs', name), MAX_INPUT);
      const got = sha256(bytes);
      ev.inputs[name] = { role, sha256: got };
      if (got !== manifest.inputs[name]) throw new Refusal('INPUT_HASH_MISMATCH', name);
      verified[role] = [name, bytes];
    }
    step('inputs_hashed');

    tmp = mkdtempSync(join(tmpdir(), 'arc-t4-f1-'));
    const { cliPath, cliSha256 } = unpack(tgz, tmp);
    // The CLI reads private snapshots of the exact verified bytes, never the original input paths.
    const paths = {};
    mkdirSync(join(tmp, 'inputs'));
    for (const [role, [name, bytes]] of Object.entries(verified)) {
      paths[role] = join(tmp, 'inputs', name);
      writeFileSync(paths[role], bytes, { flag: 'wx', mode: 0o600 });
    }
    ev.observed_identity.cli_sha256 = cliSha256;
    const cliArgv = [process.execPath, cliPath, 'action-bind', '--bundle', paths.bundle, '--task', paths.task, '--action', paths.action, '--binding', paths.binding, '--format', 'json'];
    const requested = Number(process.env.ARC_T4_F1_TIMEOUT_MS);
    const timeout = Number.isInteger(requested) && requested > 0 && requested < DEFAULT_TIMEOUT_MS ? requested : DEFAULT_TIMEOUT_MS;
    ev.cli = { ...ev.cli, spawned: true, argv_resolved: cliArgv, timeout_ms: timeout };
    step('cli_spawned');
    const r = spawnSync(cliArgv[0], cliArgv.slice(1), { cwd: tmp, env: { PATH: '' }, timeout, killSignal: 'SIGKILL', maxBuffer: MAX_OUTPUT, stdio: ['ignore', 'pipe', 'pipe'] });
    step('cli_exited');
    stdout = r.stdout || Buffer.alloc(0); stderr = r.stderr || Buffer.alloc(0);
    ev.cli.exit_code = r.status; ev.cli.signal = r.signal;
    if (r.error) ev.cli.spawn_error = r.error.code || String(r.error.message);
    ev.runner_status = 'RUNNER_ERROR';
    const c = r.error ? { status: 'RUNNER_ERROR', verdict: 'NOT_OBSERVED', reason: r.error.code === 'ETIMEDOUT' ? 'CLI_TIMEOUT' : 'CLI_SPAWN_ERROR', observed: null, flags: null } : classify(r.status, r.signal, stdout, stderr);
    ev.observed = c.observed;
    if (c.flags) { ev.limitation_flags = c.flags; ev.limitation_flags_source_stdout_sha256 = sha256(stdout); }
    if (c.status === 'OK') {
      ev.runner_status = 'OK'; ev.g1_verdict = c.verdict; wrapperExit = r.status; reason = 'CLI_EXIT_PASSED_THROUGH';
      const e = ev.case_expectation;
      ev.matches_manifest_expectation = e.exit === r.status && e.valid === c.observed.valid && (e.code === undefined ? c.observed.codes.length === 0 : c.observed.codes.includes(e.code)) && c.observed.subject_digest === manifest.g1_subject[parsed.caseId === 'C1' ? 'C1' : 'C0_C2_C3'];
    } else { ev.runner_error_reason = c.reason; reason = c.reason; wrapperExit = r.status === 2 && !r.signal && !r.error ? 2 : 3; }
  } catch (e) {
    if (!(e instanceof Refusal)) { ev.runner_status = ev.cli.spawned ? 'RUNNER_ERROR' : 'REFUSED'; ev.refusal_reason = ev.cli.spawned ? null : 'RUNNER_INTERNAL_ERROR'; ev.runner_error_reason = ev.cli.spawned ? 'RUNNER_INTERNAL_ERROR' : null; reason = 'RUNNER_INTERNAL_ERROR'; ev.detail = String(e && e.message); }
    else { ev.runner_status = 'REFUSED'; ev.refusal_reason = e.reason; reason = e.reason; if (e.message !== e.reason) ev.detail = e.message; }
    wrapperExit = 3;
  } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }

  ev.wrapper.exit_code = wrapperExit;
  try {
    const raw = {};
    const put = (name, bytes) => { writeFileSync(join(out, name), bytes, { flag: 'wx' }); raw[name] = { sha256: sha256(bytes), bytes: bytes.length }; };
    if (ev.cli.spawned) { put('stdout.bin', stdout); put('stderr.bin', stderr); }
    put('exit.json', JSON.stringify({ cli: { exit_code: ev.cli.exit_code, signal: ev.cli.signal, spawn_error: ev.cli.spawn_error, argv_resolved: ev.cli.argv_resolved }, wrapper: { exit_code: wrapperExit, reason, argv_resolved: ev.wrapper.argv_resolved } }, null, 2) + '\n');
    ev.raw_files = raw;
    writeFileSync(join(out, 'g1-run-evidence.json'), JSON.stringify(ev, null, 2) + '\n', { flag: 'wx' });
  } catch (e) { console.error(`RUNNER_ERROR: evidence write failed (${e.code || e.message})`); return 3; }
  console.error(`${ev.runner_status} g1_verdict=${ev.g1_verdict} wrapper_exit=${wrapperExit}${reason ? ` reason=${reason}` : ''}`);
  return wrapperExit;
}

process.exitCode = main();
