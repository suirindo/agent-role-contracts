import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const consumer = resolve(dirname(fileURLToPath(import.meta.url)), '../consumer');
const installed = join(consumer, 'node_modules/@netsujo/agent-role-contracts');
const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
assert.equal(manifest.name, '@netsujo/agent-role-contracts');
assert.equal(manifest.version, '1.0.0');
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function run(name, args = [], status = 0, cwd = consumer) {
  const result = spawnSync(process.execPath, [join(consumer, 'scripts', name), ...args], {
    cwd, encoding: 'utf8', shell: false, timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, status, result.stdout + '\n' + result.stderr);
  if (status !== 2) assert.equal(result.stderr, '');
  return JSON.parse(status === 2 ? result.stderr : result.stdout);
}

test('API wrapper checks the supplied task and preserves full reports and caller files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arc-api-example-'));
  try {
    const bundle = join(consumer, '.arc/bundle.json'), path = join(directory, 'my-task.json');
    const task = JSON.parse(readFileSync(join(consumer, '.arc/task.json'), 'utf8'));
    task.id = 'api-consumer-own-task';
    task.objective = 'Describe a scoped consumer change for an independent reviewer.';
    writeFileSync(path, JSON.stringify(task));
    const before = hash(path), bundleBefore = hash(bundle);
    const output = run('api-example.mjs', [bundle, path]);
    assert.equal(output.valid, true);
    assert.equal(output.bundle.kind, 'bundle');
    assert.equal(output.task.task_id, task.id);
    assert.deepEqual(output.task.reviewers, ['reviewer']);
    assert.equal(output.task.execution_authorized, false);
    assert.equal(output.task.source_files_checked, false);
    assert.equal(hash(path), before);
    assert.equal(hash(bundle), bundleBefore);
    task.inputs.scope = 'secrets/private.json';
    writeFileSync(path, JSON.stringify(task));
    const rejected = run('api-example.mjs', [bundle, path], 1);
    assert.equal(rejected.valid, false);
    assert.equal(rejected.task.errors[0].code, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY');
    writeFileSync(path, '{broken');
    assert.equal(run('api-example.mjs', [bundle, path], 1).task.errors[0].code, 'JSON_INVALID');
    assert.equal(run('api-example.mjs', [bundle, join(directory, 'missing.json')], 2).error, 'API_EXAMPLE_ERROR');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('API wrapper stops task evaluation when the supplied bundle is invalid', () => {
  const output = run('api-example.mjs', [join(consumer, '.arc/task.json'), join(consumer, '.arc/task.json')], 1);
  assert.equal(output.bundle.valid, false);
  assert.equal(output.task, null);
});

test('handoff and review exercises use installed fixtures without changing them or the current directory', () => {
  const names = ['team.json', 'task.json', 'code-task.json', 'handoff.json', 'starter-bundle.json', 'starter-task.json'];
  const paths = names.map((name) => join(installed, 'examples', name));
  const before = paths.map(hash);
  const directory = mkdtempSync(join(tmpdir(), 'arc-read-only-examples-'));
  try {
    const handoff = run('handoff-example.mjs', [], 0, directory);
    const review = run('review-example.mjs', [], 0, directory);
    for (const output of [handoff, review]) {
      assert.equal(output.version, '1.0.0');
      assert.equal(output.fixture_only, true);
      assert.deepEqual(output.steps.map(({ report }) => report.valid), [true, false, true]);
      for (const { report } of output.steps) {
        assert.equal(report.execution_authorized, false);
        assert.equal(report.identity_verified, false);
        assert.equal(report.evidence_verified, false);
      }
    }
    assert.notEqual(handoff.original_task.id, handoff.next_task.id);
    assert.equal(handoff.steps[2].report.task_id, handoff.next_task.id);
    assert.deepEqual(review.steps.map((step) => step.declared_reviewers), [['reviewer'], ['implementer'], ['reviewer']]);
    assert.deepEqual(paths.map(hash), before);
    assert.deepEqual(readdirSync(directory), []);
    assert.equal(run('handoff-example.mjs', ['unexpected'], 2, directory).error, 'HANDOFF_EXAMPLE_ERROR');
    assert.equal(run('review-example.mjs', ['unexpected'], 2, directory).error, 'REVIEW_EXAMPLE_ERROR');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
