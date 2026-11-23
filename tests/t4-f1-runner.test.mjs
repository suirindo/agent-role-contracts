// ARC-owned offline G1 runner candidate (ARC #117): exit passthrough, layer separation, refusals and raw-evidence retention.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const srcDir = join(root, 'experiments/external-evaluation/t4-f1-inputs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');

function tarball(entries) {
  const blocks = [];
  for (const [name, data, type = '0'] of entries) {
    const body = Buffer.from(data);
    const h = Buffer.alloc(512);
    h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(body.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136);
    h.write('        ', 148); h.write(type, 156); h.write('ustar\0' + '00', 257);
    h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
const realPackage = () => [['package/package.json', readFileSync(join(root, 'package.json'))],
  ['package/bin/agent-role-contracts.mjs', readFileSync(join(root, 'bin/agent-role-contracts.mjs'))],
  ...readdirSync(join(root, 'src')).map(f => [`package/src/${f}`, readFileSync(join(root, 'src', f))])];
const stub = body => [['package/bin/agent-role-contracts.mjs', body]];
const valid = { kind: 'task-action-binding', valid: true, execution_authorized: false, subject_digest: 'sha256:' + 'a'.repeat(64), binding_matches_subject: true, errors: [], runtime_enforcement: false, identity_verified: false, evidence_verified: false, source_files_checked: false, sensitive_data_scanned: false, output_schema_validated: false, subject_authenticated: false, review_authenticated: false, human_approval_authenticated: false, action_executed: false, replay_protection_enforced: false };
const emit = (obj, code) => stub(`console.log(${JSON.stringify(JSON.stringify(obj))});process.exitCode=${code};`);

// Copy the runner directory so pins/inputs can be altered without touching the committed files.
function setup(entries, mutatePins) {
  const dir = mkdtempSync(join(tmpdir(), 't4-f1-runner-'));
  const run = join(dir, 'runner');
  cpSync(srcDir, run, { recursive: true });
  const tgz = tarball(entries);
  writeFileSync(join(dir, 'pkg.tgz'), tgz);
  const pinsPath = join(run, 'runner-pins.json');
  const p = JSON.parse(readFileSync(pinsPath, 'utf8'));
  p.pins.wrapper_sha256 = sha256(readFileSync(join(run, 'run-g1.mjs')));
  p.pins.package_integrity = sri(tgz);
  p.pins.node_version = process.version;
  mutatePins?.(p);
  writeFileSync(pinsPath, JSON.stringify(p));
  return { dir, run, tgz: join(dir, 'pkg.tgz'), out: join(dir, 'out'), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const exec = (env, caseId, extra = {}, tgz = env.tgz, out = env.out) => spawnSync(process.execPath, [join(env.run, 'run-g1.mjs'), '--case', caseId, '--tarball', tgz, '--out', out], { encoding: 'utf8', env: { ...process.env, ...extra } });
const evidence = out => JSON.parse(readFileSync(join(out, 'g1-run-evidence.json'), 'utf8'));
const exitJson = out => JSON.parse(readFileSync(join(out, 'exit.json'), 'utf8'));

test('committed runner-pins.json names the committed wrapper and is labelled as an ARC proposal', () => {
  const p = JSON.parse(readFileSync(join(srcDir, 'runner-pins.json'), 'utf8'));
  assert.equal(p.pins.wrapper_sha256, sha256(readFileSync(join(srcDir, 'run-g1.mjs'))));
  assert.deepEqual(Object.keys(p.pins), ['wrapper_sha256', 'package_integrity', 'node_version', 'command']);
  assert.equal(p.status, 'ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED');
  assert.match(p.schema, /not guessed/);
  assert.equal(p.pins.node_version, 'v24.22.1');
  assert.equal(p.pins.package_integrity, 'sha512-4FSVVjOuNlvT+dBNsEkEZ5ILUfxmhoOdWWMDlCIbYGtZss9mVICT4Yuos5iS2fkJHh1OnAYs1F4PUZpc9NEdCQ==');
});

for (const [caseId, exit, verdict, action] of [['C0', 0, 'PASS', 'action.json'], ['C1', 1, 'G1_SUBJECT_MISMATCH', 'action.c1.json'], ['C2', 0, 'PASS', 'action.json'], ['C3', 0, 'PASS', 'action.json']]) {
  test(`${caseId}: CLI semantic exit ${exit} is passed through (package built from repo sources)`, () => {
    const env = setup(realPackage());
    try {
      const r = exec(env, caseId);
      assert.equal(r.status, exit, r.stderr);
      const ev = evidence(env.out), x = exitJson(env.out), stdout = readFileSync(join(env.out, 'stdout.bin'));
      assert.equal(ev.runner_status, 'OK');
      assert.equal(ev.g1_verdict, verdict);
      assert.equal(ev.g1_verdict_scope, 'declaration_consistency_only');
      assert.equal(x.cli.exit_code, exit);
      assert.equal(x.wrapper.exit_code, x.cli.exit_code);
      assert.equal(ev.matches_manifest_expectation, true);
      assert.equal(ev.execution_authorized, false);
      assert.deepEqual(ev.prior_binding, { file: 'binding.json', synthetic: true, authenticated: false });
      assert.equal(x.cli.argv_resolved.at(-1), 'json');
      const consumed = x.cli.argv_resolved[x.cli.argv_resolved.indexOf('--action') + 1];
      assert.equal(consumed.split('/').at(-1), action);
      assert.ok(!x.cli.argv_resolved.some(a => a.startsWith(join(realpathSync(env.run), 'inputs'))));
      assert.ok(x.wrapper.argv_resolved.includes(caseId));
      // Flags come from the raw bytes, with the hash of those bytes recorded.
      const parsed = JSON.parse(stdout.toString('utf8'));
      assert.equal(ev.limitation_flags_source_stdout_sha256, sha256(stdout));
      for (const [k, v] of Object.entries(ev.limitation_flags)) assert.equal(v, parsed[k], k);
      assert.equal(Object.hasOwn(ev, 'verdict'), false);
      assert.equal(ev.raw_files['stdout.bin'].sha256, sha256(stdout));
      assert.equal(ev.raw_files['exit.json'].sha256, sha256(readFileSync(join(env.out, 'exit.json'))));
      assert.deepEqual(ev.sequence.map(s => s.step), ['pins_checked', 'inputs_hashed', 'cli_spawned', 'cli_exited']);
      assert.deepEqual(ev.sequence.map(s => s.seq), [1, 2, 3, 4]);
      for (let i = 1; i < 4; i++) assert.ok(BigInt(ev.sequence[i].monotonic_ns) >= BigInt(ev.sequence[i - 1].monotonic_ns));
      assert.ok(ev.not_claimed.some(s => s.includes('no signature')) && ev.not_claimed.some(s => s.includes('no claim about ERP effect or no-effect')));
      assert.deepEqual(Object.keys(ev.pins).filter(k => ['wrapper_sha256', 'package_integrity', 'node_version', 'command'].includes(k)).length, 4);
    } finally { env.done(); }
  });
}

test('an exit code the runner did not pass through is never 0 for a rejection', () => {
  const env = setup(realPackage());
  try { assert.equal(exec(env, 'C1').status, 1); } finally { env.done(); }
});

test('well-formed unexpected outcome is an observation: C1 label over a PASS stub exits 0, OK, matches=false, no grading', () => {
  const env = setup(emit(valid, 0));
  try {
    const r = exec(env, 'C1');
    assert.equal(r.status, 0);
    const ev = evidence(env.out);
    assert.equal(ev.runner_status, 'OK');
    assert.equal(ev.g1_verdict, 'PASS');
    assert.equal(ev.matches_manifest_expectation, false);
    assert.equal(exitJson(env.out).wrapper.exit_code, exitJson(env.out).cli.exit_code);
  } finally { env.done(); }
});

const mismatch = { ...valid, valid: false, binding_matches_subject: false, errors: [{ code: 'G1_SUBJECT_MISMATCH' }] };
test('well-formed unexpected digest stays an observation (matches=false), not a runner error', () => {
  const env = setup(emit({ ...valid, subject_digest: 'sha256:' + 'b'.repeat(64) }, 0));
  try {
    assert.equal(exec(env, 'C0').status, 0);
    const ev = evidence(env.out);
    assert.equal(ev.runner_status, 'OK');
    assert.equal(ev.matches_manifest_expectation, false);
  } finally { env.done(); }
});

test('the CLI consumes snapshots of the verified bytes even if the originals are replaced meanwhile', () => {
  const env = setup([]);
  const original = join(env.run, 'inputs', 'action.json');
  const cli = `import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const a=process.argv;const at=n=>a[a.indexOf(n)+1];
writeFileSync(${JSON.stringify(original)},'{"replaced":true}');
const seen={};for(const n of['--bundle','--task','--action','--binding'])seen[n]=createHash('sha256').update(readFileSync(at(n))).digest('hex');
console.log(JSON.stringify({...${JSON.stringify(valid)},seen}));`;
  try {
    const t = tarball(stub(cli));
    writeFileSync(env.tgz, t);
    const pinsPath = join(env.run, 'runner-pins.json');
    const p = JSON.parse(readFileSync(pinsPath, 'utf8')); p.pins.package_integrity = sri(t); writeFileSync(pinsPath, JSON.stringify(p));
    const manifest = JSON.parse(readFileSync(join(env.run, 'manifest.json'), 'utf8'));
    assert.equal(exec(env, 'C0').status, 0);
    assert.equal(readFileSync(original, 'utf8'), '{"replaced":true}');
    const seen = JSON.parse(readFileSync(join(env.out, 'stdout.bin'), 'utf8')).seen;
    assert.deepEqual(seen, { '--bundle': manifest.inputs['bundle.json'], '--task': manifest.inputs['task.json'], '--action': manifest.inputs['action.json'], '--binding': manifest.inputs['binding.json'] });
    const ev = evidence(env.out);
    assert.equal(ev.inputs['action.json'].sha256, manifest.inputs['action.json']);
    assert.equal(ev.runner_status, 'OK');
  } finally { env.done(); }
});

const errorFixtures = [
  ['subject_digest missing', emit({ ...valid, subject_digest: undefined }, 0), 3, 'SUBJECT_DIGEST_MALFORMED', 0],
  ['subject_digest not sha256:+64 hex', emit({ ...valid, subject_digest: 'sha256:x' }, 0), 3, 'SUBJECT_DIGEST_MALFORMED', 0],
  ['subject_digest non-hex', emit({ ...valid, subject_digest: 'sha256:' + 'g'.repeat(64) }, 0), 3, 'SUBJECT_DIGEST_MALFORMED', 0],
  ['binding_matches_subject missing', emit({ ...valid, binding_matches_subject: undefined }, 0), 3, 'BINDING_MATCHES_SUBJECT_NOT_BOOLEAN', 0],
  ['binding_matches_subject not boolean', emit({ ...valid, binding_matches_subject: 'true' }, 0), 3, 'BINDING_MATCHES_SUBJECT_NOT_BOOLEAN', 0],
  ['PASS with binding false', emit({ ...valid, binding_matches_subject: false }, 0), 3, 'CLI_EXIT_CONTRADICTS_OUTPUT', 0],
  ['G1 mismatch with binding true', emit({ ...mismatch, binding_matches_subject: true }, 1), 3, 'CLI_INVALID_WITHOUT_G1_SUBJECT_MISMATCH', 1],
  ['errors not an array', emit({ ...valid, errors: {} }, 0), 3, 'ERRORS_MALFORMED', 0],
  ['errors entry is null', emit({ ...valid, errors: [null] }, 0), 3, 'ERRORS_MALFORMED', 0],
  ['errors entry without code', emit({ ...mismatch, errors: [{ code: 'G1_SUBJECT_MISMATCH' }, {}] }, 1), 3, 'ERRORS_MALFORMED', 1],
  ['errors entry with empty code', emit({ ...mismatch, errors: [{ code: '' }] }, 1), 3, 'ERRORS_MALFORMED', 1],
  ['errors entry with non-string code', emit({ ...mismatch, errors: [{ code: 7 }] }, 1), 3, 'ERRORS_MALFORMED', 1],
  ['CLI exit 0 but valid:false', emit({ ...valid, valid: false }, 0), 3, 'CLI_EXIT_CONTRADICTS_OUTPUT', 0],
  ['CLI exit 1 but valid:true', emit(valid, 1), 3, 'CLI_EXIT_CONTRADICTS_OUTPUT', 1],
  ['CLI exit 1 with a non-G1 error code', emit({ ...valid, valid: false, errors: [{ code: 'OTHER' }] }, 1), 3, 'CLI_INVALID_WITHOUT_G1_SUBJECT_MISMATCH', 1],
  ['execution_authorized true', emit({ ...valid, execution_authorized: true }, 0), 3, 'EXECUTION_AUTHORIZED_NOT_FALSE', 0],
  ['missing limitation flag', emit({ ...valid, identity_verified: undefined }, 0), 3, 'FLAG_MISSING_identity_verified', 0],
  ['non-JSON stdout', stub('console.log("not json");'), 3, 'CLI_OUTPUT_NOT_JSON', 0],
  ['CLI exit 2', stub('console.error("CLI_ERROR");process.exitCode=2;'), 2, 'CLI_EXIT_2_CLI_OR_FILE_ERROR', 2],
  ['CLI exit 7', stub('process.exitCode=7;'), 3, 'CLI_EXIT_UNEXPECTED', 7],
  ['CLI killed by signal', stub('process.kill(process.pid,"SIGKILL");'), 3, 'CLI_SIGNAL', null]
];
for (const [label, entries, wrapperExit, reason, cliExit] of errorFixtures) {
  test(`RUNNER_ERROR keeps raw bytes and exits outside {0,1}: ${label}`, () => {
    const env = setup(entries);
    try {
      const r = exec(env, 'C0');
      assert.equal(r.status, wrapperExit);
      assert.ok(![0, 1].includes(r.status));
      const ev = evidence(env.out), x = exitJson(env.out);
      assert.equal(ev.runner_status, 'RUNNER_ERROR');
      assert.equal(ev.g1_verdict, 'NOT_OBSERVED');
      assert.equal(ev.runner_error_reason, reason);
      assert.equal(x.cli.exit_code, cliExit);
      assert.equal(x.wrapper.exit_code, wrapperExit);
      assert.ok(existsSync(join(env.out, 'stdout.bin')) && existsSync(join(env.out, 'stderr.bin')));
      assert.equal(ev.raw_files['stdout.bin'].sha256, sha256(readFileSync(join(env.out, 'stdout.bin'))));
    } finally { env.done(); }
  });
}

test('timeout kills the CLI, keeps partial output and is a RUNNER_ERROR', () => {
  const env = setup(stub('console.log("partial");setInterval(()=>{},1000);'));
  try {
    const r = exec(env, 'C0', { ARC_T4_F1_TIMEOUT_MS: '400' });
    assert.equal(r.status, 3);
    const ev = evidence(env.out);
    assert.equal(ev.runner_error_reason, 'CLI_TIMEOUT');
    assert.equal(ev.cli.timeout_ms, 400);
    assert.equal(ev.cli.spawn_error, 'ETIMEDOUT');
    assert.equal(ev.g1_verdict, 'NOT_OBSERVED');
    assert.match(readFileSync(join(env.out, 'stdout.bin'), 'utf8'), /partial/);
  } finally { env.done(); }
});

test('the timeout environment variable can only shorten the limit', () => {
  const env = setup(emit(valid, 0));
  try {
    exec(env, 'C0', { ARC_T4_F1_TIMEOUT_MS: '999999999' });
    assert.equal(evidence(env.out).cli.timeout_ms, 30000);
  } finally { env.done(); }
});

const refusals = [
  ['wrong wrapper_sha256 pin', env => env.pin(p => { p.pins.wrapper_sha256 = '0'.repeat(64); }), 'WRAPPER_SHA256_MISMATCH'],
  ['wrong package_integrity pin', env => env.pin(p => { p.pins.package_integrity = 'sha512-' + 'A'.repeat(86) + '=='; }), 'PACKAGE_INTEGRITY_MISMATCH'],
  ['wrong node_version pin', env => env.pin(p => { p.pins.node_version = 'v0.0.0'; }), 'NODE_VERSION_MISMATCH'],
  ['wrong command pin', env => env.pin(p => { p.pins.command.template = ['node', 'run-g1.mjs', '--case', '{case}']; }), 'COMMAND_PIN_MISMATCH'],
  ['input differs from manifest', env => writeFileSync(join(env.run, 'inputs', 'task.json'), '{}'), 'INPUT_HASH_MISMATCH'],
  ['C1 action bytes differ from manifest', env => writeFileSync(join(env.run, 'inputs', 'action.c1.json'), readFileSync(join(env.run, 'inputs', 'action.json'))), 'INPUT_HASH_MISMATCH', 'C1'],
  ['wrapper edited after pinning', env => writeFileSync(join(env.run, 'run-g1.mjs'), readFileSync(join(env.run, 'run-g1.mjs'), 'utf8') + '\n// edited\n'), 'WRAPPER_SHA256_MISMATCH'],
  ['unknown case', () => {}, 'CASE_UNKNOWN', 'C9'],
  ['tarball is a symlink', env => { symlinkSync(env.tgz, join(env.dir, 'link.tgz')); env.tarball = join(env.dir, 'link.tgz'); }, 'SYMLINK_REFUSED'],
  ['tarball with a traversal entry', env => { const t = tarball([...stub('//'), ['package/../evil', 'x']]); writeFileSync(env.tgz, t); env.pin(p => { p.pins.package_integrity = sri(t); }); }, 'TARBALL_UNSAFE_ENTRY'],
  ['tarball with a symlink entry', env => { const t = tarball([...stub('//'), ['package/src/l', '', '2']]); writeFileSync(env.tgz, t); env.pin(p => { p.pins.package_integrity = sri(t); }); }, 'TARBALL_UNSAFE_ENTRY']
];
for (const [label, mutate, reason, caseId = 'C0'] of refusals) {
  test(`REFUSED before the CLI runs, with evidence and no CLI output: ${label}`, () => {
    const env = setup(emit(valid, 0));
    env.pin = f => { const p = join(env.run, 'runner-pins.json'); const j = JSON.parse(readFileSync(p, 'utf8')); f(j); writeFileSync(p, JSON.stringify(j)); };
    try {
      mutate(env);
      const r = exec(env, caseId, {}, env.tarball ?? env.tgz);
      assert.equal(r.status, 3, r.stderr);
      const ev = evidence(env.out), x = exitJson(env.out);
      assert.equal(ev.runner_status, 'REFUSED');
      assert.equal(ev.refusal_reason, reason);
      assert.equal(ev.g1_verdict, 'NOT_OBSERVED');
      assert.equal(ev.cli.spawned, false);
      assert.equal(ev.observed, null);
      assert.equal(x.cli.exit_code, null);
      assert.equal(x.wrapper.exit_code, 3);
      assert.deepEqual(readdirSync(env.out).sort(), ['exit.json', 'g1-run-evidence.json']);
      assert.equal(ev.sequence.some(s => s.step === 'cli_spawned'), false);
    } finally { env.done(); }
  });
}

test('an existing out dir is refused without writing anything into it', () => {
  const env = setup(emit(valid, 0));
  try {
    spawnSync('mkdir', [env.out]);
    const r = exec(env, 'C0');
    assert.equal(r.status, 3);
    assert.match(r.stderr, /nothing written/);
    assert.deepEqual(readdirSync(env.out), []);
  } finally { env.done(); }
});

test('malformed arguments are refused: missing --out writes nothing, wrong order leaves evidence', () => {
  const env = setup(emit(valid, 0));
  try {
    const a = spawnSync(process.execPath, [join(env.run, 'run-g1.mjs'), '--case', 'C0', '--tarball', env.tgz], { encoding: 'utf8' });
    assert.equal(a.status, 3);
    const b = spawnSync(process.execPath, [join(env.run, 'run-g1.mjs'), '--out', env.out, '--case', 'C0', '--tarball', env.tgz], { encoding: 'utf8' });
    assert.equal(b.status, 3);
    assert.equal(evidence(env.out).refusal_reason, 'ARGS_INVALID');
  } finally { env.done(); }
});

test('the runner leaves no extraction directory behind', () => {
  const before = readdirSync(tmpdir()).filter(n => n.startsWith('arc-t4-f1-'));
  const env = setup(emit(valid, 0));
  try { exec(env, 'C0'); } finally { env.done(); }
  const after = readdirSync(tmpdir()).filter(n => n.startsWith('arc-t4-f1-'));
  assert.deepEqual(after.filter(n => !before.includes(n)), []);
});

// Against the actual published package; skipped (not passed) unless ARC_T4_F1_TARBALL names an existing tarball, e.g. in CI.
const published = process.env.ARC_T4_F1_TARBALL;
const pinned = JSON.parse(readFileSync(join(srcDir, 'runner-pins.json'), 'utf8'));
const canRunPublished = Boolean(published) && existsSync(published) && process.version === pinned.pins.node_version;
for (const [caseId, exit, verdict] of [['C0', 0, 'PASS'], ['C1', 1, 'G1_SUBJECT_MISMATCH'], ['C2', 0, 'PASS'], ['C3', 0, 'PASS']]) {
  test(`published @netsujo/agent-role-contracts@1.0.1 with the committed pins: ${caseId}`, { skip: !canRunPublished && 'published tarball or pinned node v24.22.1 not available' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 't4-f1-pub-'));
    try {
      const out = join(dir, 'out');
      const r = spawnSync(process.execPath, [join(srcDir, 'run-g1.mjs'), '--case', caseId, '--tarball', published, '--out', out], { encoding: 'utf8' });
      assert.equal(r.status, exit, r.stderr);
      const ev = evidence(out);
      assert.equal(ev.runner_status, 'OK');
      assert.equal(ev.g1_verdict, verdict);
      assert.equal(ev.matches_manifest_expectation, true);
      assert.equal(ev.observed_identity.tarball.sha256, pinned.reference_identity_not_a_pin.tarball_sha256);
      assert.equal(ev.observed_identity.cli_sha256, pinned.reference_identity_not_a_pin.extracted_cli_sha256);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
