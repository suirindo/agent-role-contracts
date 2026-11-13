// ARC × ShipRules-free four-case comparison (ARC #75): pins the observed detection matrix to the recorded raw output.
// Offline: it re-derives the matrix from the recorded raw stdout, replays the ARC rows through the current source CLI,
// and runs the runner's exit-2 controls. It runs the ShipRules scanner only when pinned checkouts are supplied through
// ARC75_ARC_V1 and ARC75_SHIPRULES_FREE (skipped otherwise, with that reason).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROWS, FIXTURE_FILES, deriveArc, deriveScanner, matches } from '../experiments/external-evaluation/shiprules-free/run-four-case.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = join(root, 'experiments', 'external-evaluation', 'shiprules-free');
const runner = join(dir, 'run-four-case.mjs');
const cli = join(root, 'bin', 'agent-role-contracts.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const recorded = JSON.parse(readFileSync(join(dir, 'results', 'maintainer-darwin-arm64-20261113.json'), 'utf8'));
const controls = JSON.parse(readFileSync(join(dir, 'results', 'negative-controls-darwin-arm64-20261113.json'), 'utf8'));
const byId = new Map(recorded.rows.map(r => [r.id, r]));

// The observed matrix, written out independently of the runner's own expectation table.
// arc: [exit, sorted diagnostic codes]; scanner: [exit, flagged file:line].
const MATRIX = {
  case1_normal: { arc: [0, []], scanner: [0, []] },
  case2a_scope_violation: { arc: [1, ['TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY']], scanner: [0, []] },
  case2b_role_violation: { arc: [1, ['REVIEWER_NOT_READ_ONLY', 'SELF_REVIEW_DECLARED']], scanner: [0, []] },
  case3_in_scope_syntax_violation: { arc: [0, []], scanner: [1, ['cases/syntax-regression/player.gd:3', 'cases/syntax-regression/player.gd:6']] },
  case4_repaired: { arc: [0, []], scanner: [0, []] },
  probe_overlap_outside_scope_godot3: { arc: [1, ['TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY']], scanner: [1, ['outside-scope-godot3/enemy.gd:1', 'outside-scope-godot3/enemy.gd:3']] },
  probe_missing_input: { arc: [0, []], scanner: [0, []] },
  probe_comment_mention: { arc: [0, []], scanner: [1, ['cases/probe-comment/player.gd:6']] },
  probe_space_in_path: { arc: [1, ['TASK_WRITE_SCOPE_INVALID']], scanner: [0, []] }
};

test('recorded run is pinned to the exact sources, runner and fixture bytes in this tree', () => {
  assert.equal(recorded.profile, 'ARC_SHIPRULES_FREE_FOUR_CASE_V2');
  assert.equal(recorded.pinned_sources.arc_v1_commit, '9f6771056c47de971202360952af6d41941f7625');
  assert.equal(recorded.pinned_sources.shiprules_free_commit, '8b8302e9551fb8784d7cbe7fa61eeecf127bf247');
  assert.equal(recorded.pinned_sources.shiprules_scanner_sha256, '58b650402c321d69cdeddc3b71abcb55ad882585a9bdad00929b1f545c61b8d7');
  assert.equal(recorded.kit.runner_sha256, sha256(readFileSync(runner)));
  assert.deepEqual(recorded.kit.fixture_dir_uncommitted_entries_at_run, []);
  assert.deepEqual(Object.keys(recorded.fixture_sha256), [...FIXTURE_FILES]);
  for (const [rel, hash] of Object.entries(recorded.fixture_sha256)) assert.equal(sha256(readFileSync(join(dir, rel))), hash, rel);
});

test('the matrix derived from recorded raw stdout equals the pinned matrix, row for row', () => {
  assert.deepEqual(recorded.rows.map(r => r.id), Object.keys(MATRIX));
  assert.equal(recorded.all_expectations_matched, true);
  for (const row of recorded.rows) {
    for (const side of ['arc', 'scanner']) {
      assert.equal(sha256(row[side].stdout), row[side].stdout_sha256, `${row.id} ${side} stdout`);
      assert.equal(sha256(row[side].stderr), row[side].stderr_sha256, `${row.id} ${side} stderr`);
      assert.equal(row[side].stderr, '', `${row.id} ${side} wrote to stderr`);
    }
    const arc = deriveArc(row.arc);
    const scanner = deriveScanner(row.scanner);
    assert.deepEqual({ arc, scanner }, row.observed, row.id);
    assert.equal(arc.execution_authorized, false, row.id);
    assert.deepEqual([arc.exit_code, [...arc.codes].sort()], MATRIX[row.id].arc, `${row.id} ARC`);
    assert.equal(arc.valid, arc.exit_code === 0, row.id);
    assert.deepEqual([scanner.exit_code, scanner.hits], MATRIX[row.id].scanner, `${row.id} scanner`);
    assert.equal(matches(row.observed, ROWS.find(r => r.id === row.id).expected), true, row.id);
    if (scanner.exit_code === 0) assert.equal(row.scanner.stdout, 'No Godot 3 syntax found.\n', row.id);
  }
});

test('each case is a real, distinct input; the repair is not a copy of the baseline', () => {
  const read = rel => readFileSync(join(dir, rel), 'utf8');
  const regression = read('cases/syntax-regression/player.gd').split('\n');
  const repaired = read('cases/syntax-repaired/player.gd').split('\n');
  assert.notEqual(read('cases/syntax-repaired/player.gd'), read('cases/baseline/player.gd'));
  assert.equal(repaired.length, regression.length);
  assert.deepEqual(regression.map((line, i) => line === repaired[i] ? null : i + 1).filter(Boolean), [3, 6]);
  // Case 2a edits a real file outside the declared write scope; the declared scope names it.
  assert.equal(JSON.parse(read('tasks/outside-scope.json')).inputs.scope, 'experiments/external-evaluation/shiprules-free/outside-scope/game_settings.gd');
  // Case 2b changes one declaration only: the implementer is also named as reviewer.
  const bundle = JSON.parse(read('bundle.json'));
  const role = JSON.parse(read('bundle.role-violation.json'));
  assert.deepEqual(role.routes[0].reviewers, ['fixture-implementer']);
  assert.deepEqual({ ...role, routes: [{ ...role.routes[0], reviewers: bundle.routes[0].reviewers }] }, bundle);
});

test('current source CLI replays the same ARC outcome for every row (source replay, not the pinned v1.0.0 observation)', () => {
  for (const row of ROWS) {
    const r = spawnSync(process.execPath, [cli, 'explain', '--bundle', join(dir, row.bundle), '--task', join(dir, row.task), '--format', 'json'],
      { cwd: root, encoding: 'utf8' });
    assert.ok(r.stdout, `${row.id}: no JSON (exit ${r.status}): ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.execution_authorized, false, row.id);
    assert.deepEqual([r.status, out.errors.map(e => e.code).sort()], MATRIX[row.id].arc, row.id);
  }
});

test('evidence boundary: maintainer-executed synthetic comparison, zero external evaluations added', () => {
  assert.equal(recorded.evidence_class, 'MAINTAINER_EXECUTED_PUBLIC_REPOSITORY_SYNTHETIC_COMPARISON');
  assert.equal(recorded.external_operator_reviewed_or_executed, false);
  assert.equal(recorded.completed_external_hands_on_evaluations_added, 0);
  assert.equal(recorded.paid_shiprules_controls_evaluated, false);
  assert.equal(recorded.human_setup_minutes, 'UNMEASURED');
  assert.equal(recorded.godot_engine_parse_check, 'NOT_RUN');
});

test('recorded negative controls all stopped with exit 2 and no report', () => {
  assert.equal(controls.all_controls_matched, true);
  assert.deepEqual(controls.controls.map(c => c.id),
    ['no_arguments', 'wrong_arc_commit', 'wrong_shiprules_commit', 'missing_fixture_file', 'modified_scanner_checkout']);
  for (const c of controls.controls) {
    assert.equal(c.exit_code, 2, c.id);
    assert.equal(c.stdout, '', c.id);
    assert.ok(c.stderr.includes(c.expected_stderr_fragment), c.id);
  }
});

const runRunner = (file, args) => spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8', timeout: 60_000 });

test('runner refuses missing arguments, a wrong ARC commit and a missing fixture with exit 2 (live)', () => {
  const none = runRunner(runner, []);
  assert.equal(none.status, 2);
  assert.equal(none.stdout, '');
  // This checkout is not the pinned v1.0.0 commit, so the pin check must stop before anything else runs.
  const wrong = runRunner(runner, ['--arc-v1', root, '--shiprules', root]);
  assert.equal(wrong.status, 2);
  assert.equal(wrong.stdout, '');
  assert.match(wrong.stderr, /ARC v1\.0\.0|failed/);

  const tmp = mkdtempSync(join(tmpdir(), 'arc75-fixture-'));
  try {
    const copy = join(tmp, 'shiprules-free');
    cpSync(dir, copy, { recursive: true });
    rmSync(join(copy, 'cases', 'syntax-repaired', 'player.gd'));
    const missing = runRunner(join(copy, 'run-four-case.mjs'), ['--arc-v1', root, '--shiprules', root]);
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Fixture missing/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

const arcV1 = process.env.ARC75_ARC_V1;
const shiprules = process.env.ARC75_SHIPRULES_FREE;
const liveSkip = process.platform === 'win32' ? 'the ShipRules scanner is a Bash script; not run on Windows'
  : !(arcV1 && shiprules) ? 'set ARC75_ARC_V1 and ARC75_SHIPRULES_FREE to pinned clean checkouts to run both tools' : false;
test('live: both pinned tools reproduce the matrix', { skip: liveSkip }, () => {
  const r = runRunner(runner, ['--arc-v1', arcV1, '--shiprules', shiprules]);
  assert.equal(r.status, 0, r.stderr);
  const live = JSON.parse(r.stdout);
  for (const row of live.rows) {
    assert.deepEqual([row.observed.arc.exit_code, [...row.observed.arc.codes].sort()], MATRIX[row.id].arc, row.id);
    assert.deepEqual([row.observed.scanner.exit_code, row.observed.scanner.hits], MATRIX[row.id].scanner, row.id);
  }
});
