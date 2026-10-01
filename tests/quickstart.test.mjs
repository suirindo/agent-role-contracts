import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runner = join(root, 'examples', 'quickstart.mjs');
const fixtures = ['starter-bundle.json', 'starter-task.json', 'starter-task-outside-scope.json'];
const run = (script, options = {}) => spawnSync(process.execPath, [script], {
  encoding: 'utf8', timeout: 5000, ...options,
});

function isolatedDemo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'role contracts demo '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'examples'));
  cpSync(runner, join(dir, 'examples', 'quickstart.mjs'));
  for (const name of fixtures) cpSync(join(root, 'examples', name), join(dir, 'examples', name));
  return dir;
}

test('quickstart runs from a different cwd and matches the README transcript', t => {
  const dir = isolatedDemo(t);
  const script = join(dir, 'examples', 'quickstart.mjs');
  const before = fixtures.map(name => readFileSync(join(dir, 'examples', name), 'utf8'));
  const result = run(script, { cwd: tmpdir() });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const readme = readFileSync(join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  const expected = readme.match(/### Expected output\s+```text\n([\s\S]*?)\n```/);
  assert.ok(expected, 'README must contain the expected demo transcript');
  assert.equal(result.stdout, expected[1] + '\n');
  assert.deepEqual(fixtures.map(name => readFileSync(join(dir, 'examples', name), 'utf8')), before);
  assert.deepEqual(readdirSync(dir).sort(), ['examples', 'src']);
  assert.deepEqual(readdirSync(join(dir, 'examples')).sort(), ['quickstart.mjs', ...fixtures].sort());
});

test('quickstart does not pretend to reject a scope when authority has widened', t => {
  const dir = isolatedDemo(t);
  const path = join(dir, 'examples', 'starter-bundle.json');
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  bundle.roles[0].contract.authority.allowed_write_scopes.push('secrets/**');
  writeFileSync(path, JSON.stringify(bundle));
  const result = run(join(dir, 'examples', 'quickstart.mjs'));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /out-of-scope task must fail.*: PASS/);
  assert.equal(result.stdout.includes('Demo complete:'), false);
});

test('quickstart fails if the normal task is outside declared authority', t => {
  const dir = isolatedDemo(t);
  const path = join(dir, 'examples', 'starter-task.json');
  const task = JSON.parse(readFileSync(path, 'utf8'));
  task.inputs.scope = 'README.md';
  writeFileSync(path, JSON.stringify(task));
  const result = run(join(dir, 'examples', 'quickstart.mjs'));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /normal task must PASS: TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY/);
  assert.equal(result.stdout.includes('Demo complete:'), false);
});

test('quickstart fails on declared self-review rather than reporting separate roles', t => {
  const dir = isolatedDemo(t);
  const path = join(dir, 'examples', 'starter-bundle.json');
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  bundle.routes[0].reviewers = ['implementer'];
  writeFileSync(path, JSON.stringify(bundle));
  const result = run(join(dir, 'examples', 'quickstart.mjs'));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /SELF_REVIEW_DECLARED/);
  assert.equal(result.stdout.includes('Demo complete:'), false);
});

test('quickstart identifies a missing fixture and gives a recovery action', t => {
  const dir = isolatedDemo(t);
  rmSync(join(dir, 'examples', 'starter-task.json'));
  const result = run(join(dir, 'examples', 'quickstart.mjs'));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Cannot read examples\/starter-task.json \(ENOENT\)/);
  assert.match(result.stderr, /Restore the bundled examples/);
  assert.equal(result.stdout.includes('Demo complete:'), false);
});
