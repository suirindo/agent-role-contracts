#!/usr/bin/env node
// Negative controls for run-four-case.mjs (ARC issue #75): each must stop with exit 2 before any comparison is reported.
// Usage: node run-negative-controls.mjs --arc-v1 /path/to/arc-v1.0.0 --shiprules /path/to/shiprules-free [--out file.json]
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, appendFileSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '..', '..', '..');
const RUNNER = join(HERE, 'run-four-case.mjs');
const sha256 = text => createHash('sha256').update(text).digest('hex');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null; };
const arcV1 = opt('--arc-v1');
const shiprules = opt('--shiprules');
const out = opt('--out');
if (!arcV1 || !shiprules) {
  console.error('Usage: node run-negative-controls.mjs --arc-v1 PATH --shiprules PATH [--out FILE]');
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), 'arc75-negative-'));
const map = [[realpathSync(tmp), '<TMP>'], [tmp, '<TMP>'],[arcV1, '<ARC_V1>'], [shiprules, '<SHIPRULES_FREE>'], [KIT, '<KIT>'], [process.execPath, 'node']]
  .sort((a, b) => b[0].length - a[0].length).map(([f, t]) => [f.split(sep).join('/'), t]);
const show = s => map.reduce((acc, [f, t]) => acc.split(f).join(t), s.split(sep).join('/'));

function invoke(id, runner, args, expectedStderr) {
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [runner, ...args], { cwd: KIT, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  const elapsed = Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3));
  if (r.error) throw r.error;
  return {
    id,
    argv: ['node', runner, ...args].map(show),
    cwd: show(KIT),
    exit_code: r.status,
    stdout: r.stdout,
    stderr: show(r.stderr),
    stdout_sha256: sha256(r.stdout),
    elapsed_ms: elapsed,
    expected_exit_code: 2,
    expected_stderr_fragment: expectedStderr,
    matches_expectation: r.status === 2 && r.stdout === '' && r.stderr.includes(expectedStderr)
  };
}

const results = [];
try {
  results.push(invoke('no_arguments', RUNNER, [], '--arc-v1 and --shiprules are required'));
  results.push(invoke('wrong_arc_commit', RUNNER, ['--arc-v1', KIT, '--shiprules', shiprules], 'ARC v1.0.0 commit'));
  results.push(invoke('wrong_shiprules_commit', RUNNER, ['--arc-v1', arcV1, '--shiprules', KIT], 'ShipRules-free commit'));

  const copy = join(tmp, 'fixture-copy');
  cpSync(HERE, copy, { recursive: true });
  rmSync(join(copy, 'cases', 'syntax-repaired', 'player.gd'));
  results.push(invoke('missing_fixture_file', join(copy, 'run-four-case.mjs'), ['--arc-v1', arcV1, '--shiprules', shiprules], 'Fixture missing'));

  const clone = join(tmp, 'shiprules-modified');
  const c = spawnSync('git', ['clone', '-q', '--no-checkout', shiprules, clone], { encoding: 'utf8' });
  if (c.status !== 0) throw new Error(`local clone failed: ${c.stderr}`);
  const k = spawnSync('git', ['-C', clone, 'checkout', '-q', '--detach', '8b8302e9551fb8784d7cbe7fa61eeecf127bf247'], { encoding: 'utf8' });
  if (k.status !== 0) throw new Error(`local checkout failed: ${k.stderr}`);
  appendFileSync(join(clone, 'godot4', 'scripts', 'check-godot3.sh'), '\n# modified\n');
  results.push(invoke('modified_scanner_checkout', RUNNER, ['--arc-v1', arcV1, '--shiprules', clone], 'ShipRules-free checkout is not clean'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const report = {
  profile: 'ARC_SHIPRULES_FREE_FOUR_CASE_V2_NEGATIVE_CONTROLS',
  observed_at_utc: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  runner_sha256: sha256(readFileSync(RUNNER)),
  driver_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  controls: results,
  all_controls_matched: results.every(r => r.matches_expectation)
};
const text = JSON.stringify(report, null, 2) + '\n';
if (out) writeFileSync(out, text);
process.stdout.write(text);
if (!report.all_controls_matched) process.exitCode = 1;
