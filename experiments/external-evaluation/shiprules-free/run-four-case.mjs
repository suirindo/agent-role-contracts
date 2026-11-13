#!/usr/bin/env node
// ARC × ShipRules-free four-case comparison, V2 evidence profile (ARC issue #75).
// Every case is a real file on disk and every row actually invokes both tools: the pinned ARC v1.0.0 CLI
// (`explain`) and the pinned ShipRules-free Godot 4 scanner (`check-godot3.sh`). Each invocation's argv, cwd,
// exit code, raw stdout/stderr and duration are recorded. Expectations were written from source reading before
// the first run; an observation that differs is reported (exit 1), never tuned away.
// The V1 runner (run-comparison.mjs) and its recorded Linux result are kept unchanged.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { release, type as osType } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const PROFILE = 'ARC_SHIPRULES_FREE_FOUR_CASE_V2';
export const ARC_V1_SHA = '9f6771056c47de971202360952af6d41941f7625';
export const SHIPRULES_SHA = '8b8302e9551fb8784d7cbe7fa61eeecf127bf247';
export const SCANNER_SHA256 = '58b650402c321d69cdeddc3b71abcb55ad882585a9bdad00929b1f545c61b8d7';
export const SCANNER_PATH = 'godot4/scripts/check-godot3.sh';
const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '..', '..', '..');
const FIXTURE_REL = 'experiments/external-evaluation/shiprules-free';

// Every fixture input this runner reads. A missing or non-regular file stops the run with exit 2.
export const FIXTURE_FILES = Object.freeze([
  'bundle.json',
  'bundle.role-violation.json',
  'tasks/baseline.json',
  'tasks/outside-scope.json',
  'tasks/syntax-regression.json',
  'tasks/syntax-repaired.json',
  'tasks/probe-outside-scope-godot3.json',
  'tasks/probe-missing-input.json',
  'tasks/probe-comment.json',
  'tasks/probe-space-in-path.json',
  'cases/baseline/player.gd',
  'cases/syntax-regression/player.gd',
  'cases/syntax-repaired/player.gd',
  'cases/probe-comment/player.gd',
  'cases/level one/hud.gd',
  'outside-scope/game_settings.gd',
  'outside-scope-godot3/enemy.gd'
]);

// kind: 'case' = one of the four requested cases (case 2 has a scope and a role variant); 'probe' = supplementary.
// scanner_dir is relative to this fixture directory; the scanner is run with this directory as cwd.
export const ROWS = Object.freeze([
  { id: 'case1_normal', kind: 'case', bundle: 'bundle.json', task: 'tasks/baseline.json', scanner_dir: 'cases/baseline',
    expected: { arc: { exit_code: 0, valid: true, codes: [] }, scanner: { exit_code: 0, hits: [] } } },
  { id: 'case2a_scope_violation', kind: 'case', bundle: 'bundle.json', task: 'tasks/outside-scope.json', scanner_dir: 'outside-scope',
    expected: { arc: { exit_code: 1, valid: false, codes: ['TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'] }, scanner: { exit_code: 0, hits: [] } } },
  { id: 'case2b_role_violation', kind: 'case', bundle: 'bundle.role-violation.json', task: 'tasks/baseline.json', scanner_dir: 'cases/baseline',
    expected: { arc: { exit_code: 1, valid: false, codes: ['SELF_REVIEW_DECLARED', 'REVIEWER_NOT_READ_ONLY'] }, scanner: { exit_code: 0, hits: [] } } },
  { id: 'case3_in_scope_syntax_violation', kind: 'case', bundle: 'bundle.json', task: 'tasks/syntax-regression.json', scanner_dir: 'cases/syntax-regression',
    expected: { arc: { exit_code: 0, valid: true, codes: [] },
      scanner: { exit_code: 1, hits: ['cases/syntax-regression/player.gd:3', 'cases/syntax-regression/player.gd:6'] } } },
  { id: 'case4_repaired', kind: 'case', bundle: 'bundle.json', task: 'tasks/syntax-repaired.json', scanner_dir: 'cases/syntax-repaired',
    expected: { arc: { exit_code: 0, valid: true, codes: [] }, scanner: { exit_code: 0, hits: [] } } },
  { id: 'probe_overlap_outside_scope_godot3', kind: 'probe', bundle: 'bundle.json', task: 'tasks/probe-outside-scope-godot3.json', scanner_dir: 'outside-scope-godot3',
    expected: { arc: { exit_code: 1, valid: false, codes: ['TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'] },
      scanner: { exit_code: 1, hits: ['outside-scope-godot3/enemy.gd:1', 'outside-scope-godot3/enemy.gd:3'] } } },
  { id: 'probe_missing_input', kind: 'probe', bundle: 'bundle.json', task: 'tasks/probe-missing-input.json', scanner_dir: 'cases/does-not-exist',
    expected: { arc: { exit_code: 0, valid: true, codes: [] }, scanner: { exit_code: 0, hits: [] } } },
  { id: 'probe_comment_mention', kind: 'probe', bundle: 'bundle.json', task: 'tasks/probe-comment.json', scanner_dir: 'cases/probe-comment',
    expected: { arc: { exit_code: 0, valid: true, codes: [] }, scanner: { exit_code: 1, hits: ['cases/probe-comment/player.gd:6'] } } },
  { id: 'probe_space_in_path', kind: 'probe', bundle: 'bundle.json', task: 'tasks/probe-space-in-path.json', scanner_dir: 'cases/level one',
    expected: { arc: { exit_code: 1, valid: false, codes: ['TASK_WRITE_SCOPE_INVALID'] }, scanner: { exit_code: 0, hits: [] } } }
]);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = p => p.split(sep).join('/');

// Pure derivations shared with tests/shiprules-four-case.test.mjs so the matrix is computed from raw output only.
export function deriveArc(invocation) {
  let report = null;
  try { report = JSON.parse(invocation.stdout); } catch { report = null; }
  return {
    exit_code: invocation.exit_code,
    valid: report ? report.valid === true : null,
    codes: report && Array.isArray(report.errors) ? report.errors.map(e => e.code) : null,
    execution_authorized: report ? report.execution_authorized : null
  };
}
export function deriveScanner(invocation) {
  const hits = [];
  for (const line of invocation.stdout.split('\n')) {
    const m = line.match(/^(.+\.gd):(\d+):/);
    if (m) hits.push(`${m[1].replace(/^\.\//, '')}:${m[2]}`);
  }
  return { exit_code: invocation.exit_code, hits: [...new Set(hits)].sort() };
}
// Diagnostic codes are compared as a sorted multiset: ARC's report orders its errors itself, and the first dry run
// showed the pre-registered order for case 2b (SELF_REVIEW_DECLARED first) differed from ARC's output order only.
const sortedCodes = codes => Array.isArray(codes) ? [...codes].sort() : codes;
export function matches(observed, expected) {
  return observed.arc.exit_code === expected.arc.exit_code &&
    observed.arc.valid === expected.arc.valid &&
    JSON.stringify(sortedCodes(observed.arc.codes)) === JSON.stringify(sortedCodes(expected.arc.codes)) &&
    observed.scanner.exit_code === expected.scanner.exit_code &&
    JSON.stringify(observed.scanner.hits) === JSON.stringify([...expected.scanner.hits].sort());
}

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}
function parseArgs(argv) {
  if (argv.includes('--help')) {
    console.log('Usage: node run-four-case.mjs --arc-v1 /path/to/arc-v1.0.0 --shiprules /path/to/shiprules-free [--out result.json]');
    process.exit(0);
  }
  const allowed = new Set(['--arc-v1', '--shiprules', '--out']);
  if (argv.length % 2) throw usageError('Every option requires one value');
  const values = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (!allowed.has(k) || values.has(k) || !v || v.startsWith('--')) throw usageError(`Invalid option: ${k}`);
    values.set(k, resolve(v));
  }
  if (!values.has('--arc-v1') || !values.has('--shiprules')) throw usageError('--arc-v1 and --shiprules are required');
  return values;
}

function readRegular(path) {
  let st;
  try { st = lstatSync(path); } catch { throw new Error(`Fixture missing: ${path}`); }
  if (!st.isFile()) throw new Error(`Not a regular file (symlinks refused): ${path}`);
  if (st.size > 1024 * 1024) throw new Error(`File exceeds 1 MiB: ${path}`);
  return readFileSync(path);
}
function fixtureHashes() {
  const out = {};
  for (const rel of FIXTURE_FILES) out[rel] = sha256(readRegular(join(HERE, rel)));
  return out;
}

function run(file, args, cwd) {
  const started = process.hrtime.bigint();
  const r = spawnSync(file, args, { cwd, encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  if (r.error) throw new Error(`Tool failure running ${file}: ${r.error.message}`);
  if (r.signal || r.status === null) throw new Error(`Tool ${file} ended by signal ${r.signal}`);
  return { exit_code: r.status, stdout: r.stdout, stderr: r.stderr, elapsed_ms: Number(elapsed.toFixed(3)) };
}
function git(repo, ...args) {
  const r = run('git', ['-C', repo, ...args], process.cwd());
  if (r.exit_code !== 0) throw new Error(`git ${args[0]} in ${repo} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}
function gitBlob(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function verifyPinned(repo, pin, label, paths) {
  const head = git(repo, 'rev-parse', 'HEAD');
  if (head !== pin) throw new Error(`${label} commit ${head} differs from pinned ${pin}`);
  if (git(repo, 'status', '--porcelain', '--untracked-files=all')) throw new Error(`${label} checkout is not clean`);
  // Compare the bytes actually on disk with the pinned tree, so index flags cannot hide an edit.
  let count = 0;
  for (const entry of git(repo, 'ls-tree', '-r', pin, '--', ...paths).split('\n').filter(Boolean)) {
    const m = entry.match(/^100(?:644|755) blob ([0-9a-f]{40})\t(.+)$/);
    if (!m) throw new Error(`${label}: unexpected tree entry ${entry}`);
    if (gitBlob(readRegular(join(repo, m[2]))) !== m[1]) throw new Error(`${label}: modified bytes in ${m[2]}`);
    count += 1;
  }
  if (count === 0) throw new Error(`${label}: no pinned files found under ${paths.join(', ')}`);
  return { commit: head, verified_blob_count: count };
}

function display(text, map) {
  let out = text;
  for (const [from, to] of map) out = out.split(from).join(to);
  return out;
}

function toolVersions() {
  const first = r => (r.stdout || r.stderr).split('\n')[0].trim();
  const grep = run('bash', ['-c', 'command -v grep; grep --version 2>&1 | head -n 1'], HERE);
  const [grepPath, grepVersion] = grep.stdout.split('\n');
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    os_type: osType(),
    os_release: release(),
    git: first(run('git', ['--version'], HERE)),
    bash: first(run('bash', ['--version'], HERE)),
    grep_resolved_by_bash: { path: (grepPath || '').trim(), version: (grepVersion || '').trim() },
    grep_note: 'The scanner calls whatever grep its bash resolves; the recorded 2026-10-26 run was Linux x64, this profile records the actual grep used.'
  };
}

function main() {
  const started = process.hrtime.bigint();
  const args = parseArgs(process.argv.slice(2));
  const arcV1 = args.get('--arc-v1');
  const shiprules = args.get('--shiprules');
  const fixturesBefore = fixtureHashes();
  const runnerBytes = readRegular(fileURLToPath(import.meta.url));

  const arcPin = verifyPinned(arcV1, ARC_V1_SHA, 'ARC v1.0.0', ['src', 'bin', 'schemas', 'package.json']);
  const shipPin = verifyPinned(shiprules, SHIPRULES_SHA, 'ShipRules-free', [SCANNER_PATH]);
  const scanner = join(shiprules, ...SCANNER_PATH.split('/'));
  const scannerHash = sha256(readRegular(scanner));
  if (scannerHash !== SCANNER_SHA256) throw new Error(`ShipRules scanner hash ${scannerHash} differs from ${SCANNER_SHA256}`);
  const arcPackage = JSON.parse(readRegular(join(arcV1, 'package.json')).toString('utf8'));
  if (arcPackage.version !== '1.0.0') throw new Error(`ARC package version ${arcPackage.version} is not 1.0.0`);
  const arcCli = join(arcV1, 'bin', 'agent-role-contracts.mjs');

  let kitCommit = null;
  let kitFixtureStatus = null;
  try {
    kitCommit = git(KIT, 'rev-parse', 'HEAD');
    kitFixtureStatus = git(KIT, 'status', '--porcelain', '--untracked-files=all', '--', FIXTURE_REL);
  } catch (error) {
    kitCommit = `UNAVAILABLE: ${error.message}`;
  }

  const map = [[arcV1, '<ARC_V1>'], [shiprules, '<SHIPRULES_FREE>'], [KIT, '<KIT>'], [process.execPath, 'node']]
    .sort((a, b) => b[0].length - a[0].length);
  const record = (file, argv, cwd, result) => ({
    argv: [file, ...argv].map(a => display(posix(a), map.map(([f, t]) => [posix(f), t]))),
    cwd: display(posix(cwd), map.map(([f, t]) => [posix(f), t])),
    exit_code: result.exit_code,
    stdout: result.stdout,
    stderr: result.stderr,
    stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr),
    elapsed_ms: result.elapsed_ms
  });

  const rows = [];
  for (const row of ROWS) {
    const arcArgs = [arcCli, 'explain', '--bundle', `${FIXTURE_REL}/${row.bundle}`, '--task', `${FIXTURE_REL}/${row.task}`, '--format', 'json'];
    const arcResult = run(process.execPath, arcArgs, KIT);
    const scanArgs = [scanner, row.scanner_dir];
    const scanResult = run('bash', scanArgs, HERE);
    const arcRecord = record(process.execPath, arcArgs, KIT, arcResult);
    const scanRecord = record('bash', scanArgs, HERE, scanResult);
    const observed = { arc: deriveArc(arcResult), scanner: deriveScanner(scanResult) };
    if (observed.arc.execution_authorized !== false) throw new Error(`${row.id}: ARC reported execution authority; stop`);
    rows.push({ id: row.id, kind: row.kind, inputs: { bundle: row.bundle, task: row.task, scanner_dir: row.scanner_dir },
      arc: arcRecord, scanner: scanRecord, observed, expected: row.expected, matches_expectation: matches(observed, row.expected) });
  }

  // Post-run re-verification: nothing either tool read was changed by the run.
  const fixturesAfter = fixtureHashes();
  if (JSON.stringify(fixturesAfter) !== JSON.stringify(fixturesBefore)) throw new Error('Fixture bytes changed during the run');
  verifyPinned(arcV1, ARC_V1_SHA, 'ARC v1.0.0 (post-run)', ['src', 'bin', 'schemas', 'package.json']);
  verifyPinned(shiprules, SHIPRULES_SHA, 'ShipRules-free (post-run)', [SCANNER_PATH]);

  const allMatch = rows.every(r => r.matches_expectation);
  const report = {
    profile: PROFILE,
    evidence_class: 'MAINTAINER_EXECUTED_PUBLIC_REPOSITORY_SYNTHETIC_COMPARISON',
    observed_at_utc: new Date().toISOString(),
    environment: toolVersions(),
    pinned_sources: {
      arc_v1_commit: arcPin.commit,
      arc_v1_verified_blob_count: arcPin.verified_blob_count,
      arc_v1_package_version: arcPackage.version,
      shiprules_free_commit: shipPin.commit,
      shiprules_scanner_path: SCANNER_PATH,
      shiprules_scanner_sha256: scannerHash
    },
    kit: {
      commit_at_run: kitCommit,
      fixture_dir_uncommitted_entries_at_run: kitFixtureStatus === null ? null : kitFixtureStatus.split('\n').filter(Boolean),
      runner: `${FIXTURE_REL}/run-four-case.mjs`,
      runner_sha256: sha256(runnerBytes)
    },
    fixture_sha256: fixturesBefore,
    display_substitutions: { '<ARC_V1>': 'pinned ARC v1.0.0 checkout', '<SHIPRULES_FREE>': 'pinned ShipRules-free checkout',
      '<KIT>': 'agent-role-contracts checkout holding this runner', node: 'process.execPath' },
    rows,
    all_expectations_matched: allMatch,
    automated_wall_ms: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3)),
    human_setup_minutes: 'UNMEASURED',
    godot_engine_parse_check: 'NOT_RUN',
    external_operator_reviewed_or_executed: false,
    completed_external_hands_on_evaluations_added: 0,
    paid_shiprules_controls_evaluated: false
  };
  const text = JSON.stringify(report, null, 2) + '\n';
  if (args.has('--out')) writeFileSync(args.get('--out'), text);
  process.stdout.write(text);
  if (!allMatch) process.exitCode = 1;
}

// Compare real paths: on macOS the temp directory is reached through a symlink (/var -> /private/var), and a plain
// path comparison made the runner exit 0 with no output there (caught by the missing_fixture_file negative control).
const invokedDirectly = () => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
};
if (invokedDirectly()) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ profile: PROFILE, verdict: 'COMPARISON_ERROR', error: String(error?.message || error),
      external_operator_reviewed_or_executed: false }, null, 2));
    process.exitCode = 2;
  }
}
