import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as nodeTest } from 'node:test';
import { skipReason } from './consumer-install.mjs';

const adoption = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consumer = join(adoption, 'consumer');
// Use the consumer's locked installation, never the repository source or an override.
const packageRoot = join(consumer, 'node_modules/@netsujo/agent-role-contracts');
const cli = join(packageRoot, 'bin/agent-role-contracts.mjs');
// One stated skip per test when the consumer dependency is absent, instead of one opaque failure per step (#108).
const test = (name, fn) => nodeTest(name, { skip: skipReason(packageRoot) }, fn);
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: false, timeout: 20_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

function expectStatus(result, status) {
  assert.equal(result.status, status, result.stdout + '\n' + result.stderr);
  return result;
}

function git(directory, ...args) {
  return run('git', ['-c', 'core.hooksPath=' + join(directory, '.git/hooks'),
    '-c', 'commit.gpgSign=false', '-c', 'user.name=ARC test',
    '-c', 'user.email=arc-test@example.invalid', ...args], directory);
}

function fixture(fn) {
  assert.notEqual(process.platform, 'win32', 'This isolated hook test requires a POSIX shell.');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@netsujo/agent-role-contracts');
  assert.equal(manifest.version, '1.0.0', 'Run npm ci --ignore-scripts in the consumer directory.');
  const directory = mkdtempSync(join(tmpdir(), 'arc-operational-'));
  try {
    for (const name of ['package.json', '.arc', 'scripts']) cpSync(join(consumer, name), join(directory, name), { recursive: true });
    mkdirSync(join(directory, 'node_modules/@netsujo'), { recursive: true });
    mkdirSync(join(directory, 'node_modules/.bin'), { recursive: true });
    symlinkSync(packageRoot, join(directory, 'node_modules/@netsujo/agent-role-contracts'), 'dir');
    symlinkSync(cli, join(directory, 'node_modules/.bin/agent-role-contracts'));
    return fn(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function read(directory, name) { return JSON.parse(readFileSync(join(directory, '.arc', name), 'utf8')); }
function write(directory, name, value) { writeFileSync(join(directory, '.arc', name), JSON.stringify(value, null, 2) + '\n'); }
function bundleHash(directory) { return createHash('sha256').update(readFileSync(join(directory, '.arc/bundle.json'))).digest('hex'); }
function explain(directory, status, bundle = '.arc/bundle.json', task = '.arc/task.json') {
  const result = expectStatus(run(process.execPath, [cli, 'explain', '--bundle', bundle,
    '--task', task, '--format', 'json'], directory), status);
  const report = JSON.parse(status === 2 ? result.stderr : result.stdout);
  if (status !== 2) {
    assert.equal(report.version, '1.0.0');
    assert.equal(report.valid, status === 0);
    assert.equal(report.execution_authorized, false);
  }
  return report;
}

test('read-only setup proof verifies the installed 1.0.0 CLI and its 0/1/2 results', () => fixture((directory) => {
  const files = ['bundle.json', 'task.json', 'task-outside-scope.json'];
  const before = files.map((name) => readFileSync(join(directory, '.arc', name), 'utf8'));
  const result = expectStatus(run(process.execPath, ['scripts/verify-setup.mjs'], directory), 0);
  assert.match(result.stdout, /supplied positive task \(exit 0\)/);
  assert.match(result.stdout, /expected out-of-scope rejection: TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY at task\/inputs\/scope \(exit 1\)/);
  assert.match(result.stdout, /CLI_ERROR \(exit 2\)/);
  assert.deepEqual(files.map((name) => readFileSync(join(directory, '.arc', name), 'utf8')), before);
  const ownTask = read(directory, 'task.json');
  ownTask.inputs.scope = 'outside/custom.mjs';
  write(directory, 'task.json', ownTask);
  const rejected = expectStatus(run(process.execPath, ['scripts/verify-setup.mjs'], directory), 2);
  assert.match(rejected.stderr, /TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY at task\/inputs\/scope/);
  assert.match(rejected.stderr, /without overwriting it/);
  assert.deepEqual(read(directory, 'task.json'), ownTask);
  unlinkSync(join(directory, '.arc/task.json'));
  symlinkSync('task-outside-scope.json', join(directory, '.arc/task.json'));
  const invalid = expectStatus(run(process.execPath, ['scripts/verify-setup.mjs'], directory), 2);
  assert.match(invalid.stderr, /task.json must be a regular file/);
}));

test('setup diagnoses missing and wrong dependencies without installing them', () => fixture((directory) => {
  const dependency = join(directory, 'node_modules/@netsujo/agent-role-contracts');
  unlinkSync(dependency);
  const missing = expectStatus(run(process.execPath, ['scripts/verify-setup.mjs'], directory), 2);
  assert.match(missing.stderr, /dependency manifest.*missing or unreadable/);
  mkdirSync(dependency);
  writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: '@netsujo/agent-role-contracts', version: '0.0.0' }));
  const wrong = expectStatus(run(process.execPath, ['scripts/verify-setup.mjs'], directory), 2);
  assert.match(wrong.stderr, /requires @netsujo\/agent-role-contracts@1.0.0/);
}));

test('real Git commits run the isolated hook and require staging the repair', () => fixture((directory) => {
  expectStatus(git(directory, 'init', '--quiet', '--template='), 0);
  mkdirSync(join(directory, '.git/hooks'), { recursive: true });
  cpSync(join(adoption, 'integrations/pre-commit'), join(directory, '.git/hooks/pre-commit'));
  chmodSync(join(directory, '.git/hooks/pre-commit'), 0o755);
  expectStatus(git(directory, 'add', '--', '.arc/bundle.json', '.arc/task.json'), 0);
  const commit = () => git(directory, 'commit', '--quiet', '-m', 'Isolated ARC declaration check');
  const accepted = expectStatus(commit(), 0);
  assert.match(accepted.stdout + accepted.stderr, /arc:check:staged/);
  const head = expectStatus(git(directory, 'rev-parse', 'HEAD'), 0).stdout;
  const task = read(directory, 'task.json');
  task.id = 'edited-own-task';
  task.inputs.scope = 'secrets/production.txt';
  write(directory, 'task.json', task);
  expectStatus(git(directory, 'add', '--', '.arc/task.json'), 0);
  const index = expectStatus(git(directory, 'ls-files', '--stage'), 0).stdout;
  const rejected = expectStatus(commit(), 1);
  assert.match(rejected.stdout + rejected.stderr, /TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY/);
  task.inputs.scope = 'src/repaired.mjs';
  write(directory, 'task.json', task);
  const unstagedRepair = expectStatus(commit(), 1);
  assert.match(unstagedRepair.stdout + unstagedRepair.stderr, /TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY/);
  assert.equal(expectStatus(git(directory, 'rev-parse', 'HEAD'), 0).stdout, head);
  assert.equal(expectStatus(git(directory, 'ls-files', '--stage'), 0).stdout, index);
  expectStatus(git(directory, 'add', '--', '.arc/task.json'), 0);
  expectStatus(commit(), 0);
  assert.notEqual(expectStatus(git(directory, 'rev-parse', 'HEAD'), 0).stdout, head);
}));

test('published 1.0.0 distinguishes exact files, subtrees, siblings and invalid path syntax', () => fixture((directory) => {
  const bundle = read(directory, 'bundle.json');
  const task = read(directory, 'task.json');
  const cases = [
    ['src/file.mjs', 'src/file.mjs', 0],
    ['src/file.mjs', 'src/other.mjs', 1, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'],
    ['src/**', 'src/file.mjs', 0],
    ['src/**', 'src/nested/file.mjs', 0],
    ['src/**', 'src/**', 0],
    ['src/**', 'src2/file.mjs', 1, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'],
    ['src/**', 'other/file.mjs', 1, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'],
    ['src/**', '.github/workflows/arc.yml', 1, 'TASK_WRITE_SCOPE_INVALID'],
    ['src/**', 'src/.hidden', 1, 'TASK_WRITE_SCOPE_INVALID'],
    ['src/**', '/tmp/file.mjs', 1, 'TASK_WRITE_SCOPE_INVALID'],
    ['src/**', '../src/file.mjs', 1, 'TASK_WRITE_SCOPE_INVALID'],
    ['src/**', 'src/../file.mjs', 1, 'TASK_WRITE_SCOPE_INVALID'],
  ];
  for (const [allowed, requested, status, code] of cases) {
    bundle.roles[0].contract.authority.allowed_write_scopes = [allowed];
    task.inputs.scope = requested;
    write(directory, 'bundle.json', bundle);
    write(directory, 'task.json', task);
    const report = explain(directory, status);
    if (code) assert.ok(report.errors.some((error) => error.code === code && error.path === 'task/inputs/scope'), requested);
  }
}));

test('published 1.0.0 returns the documented code and path for invalid task declarations', () => fixture((directory) => {
  const task = read(directory, 'task.json');
  const missingObjective = { ...task };
  delete missingObjective.objective;
  const cases = [
    [missingObjective, 'SCHEMA_REQUIRED', 'task/objective'],
    [{ ...task, $schema: 'https://example.invalid/task.json' }, 'SCHEMA_ADDITIONALPROPERTIES', 'task/$schema'],
    [{ ...task, type: 'unknown-task-type' }, 'TASK_TYPE_UNROUTED', 'task/type'],
  ];
  for (const [input, code, path] of cases) {
    write(directory, 'task.json', input);
    const report = explain(directory, 1);
    assert.deepEqual(report.errors.map(({ code, path }) => ({ code, path })), [{ code, path }]);
  }
}));

test('the documented first-task JSON passes, fails outside scope, and passes after repair with one bundle hash', () => fixture((directory) => {
  const hash = bundleHash(directory);
  const block = readFileSync(join(adoption, 'FIRST-TASK.md'), 'utf8').match(/^```json[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/m);
  assert.ok(block, 'FIRST-TASK.md must contain its task JSON example.');
  const task = JSON.parse(block[1]);
  const originalScope = task.inputs.scope;
  const check = (status) => {
    const report = explain(directory, status, '.arc/bundle.json', '.arc/task-first.json');
    assert.equal(bundleHash(directory), hash);
    return report;
  };
  writeFileSync(join(directory, '.arc/task-first.json'), block[1]);
  check(0);
  task.inputs.scope = 'secrets/private.json';
  write(directory, 'task-first.json', task);
  assert.equal(check(1).errors[0].code, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY');
  task.inputs.scope = originalScope;
  write(directory, 'task-first.json', task);
  check(0);
}));

test('a candidate can widen its own policy; the unchanged trusted bundle rejects that same task', () => fixture((directory) => {
  const hash = bundleHash(directory);
  const candidate = read(directory, 'bundle.json');
  const task = read(directory, 'task.json');
  candidate.roles[0].contract.authority.allowed_write_scopes = ['src/**', 'secrets/**'];
  task.inputs.scope = 'secrets/production.txt';
  write(directory, 'candidate-bundle.json', candidate);
  write(directory, 'task.json', task);
  explain(directory, 0, '.arc/candidate-bundle.json');
  const trusted = explain(directory, 1);
  assert.ok(trusted.errors.some((error) => error.code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'));
  assert.equal(bundleHash(directory), hash);
}));

test('the shipped Actions guard rejects symlinks in every candidate task path component', () => {
  const workflow = readFileSync(join(adoption, 'integrations/github-actions.yml'), 'utf8');
  const step = workflow.match(/^      - name: Require a regular candidate task\r?\n        shell: bash\r?\n        run: \|\r?\n((?:          [^\n]*\n)+)/m);
  assert.ok(step, 'The published workflow must contain its candidate path guard.');
  assert.ok(workflow.indexOf(step[0]) < workflow.indexOf('      - name: Install only the trusted base dependency'),
    'Reject invalid candidate paths before installing or running the trusted checker.');
  const guard = step[1].split('\n').filter(Boolean).map((line) => line.slice(10)).join('\n');
  const cases = [
    'regular', 'out-of-scope', 'task-directory', 'task-symlink',
    'task-dangling-symlink', 'task-missing', 'parent-symlink',
    'parent-dangling-symlink', 'checkout-symlink',
  ];
  for (const kind of cases) fixture((directory) => {
    const hash = bundleHash(directory);
    const candidate = join(directory, 'arc-candidate');
    const parent = join(candidate, '.arc');
    const taskPath = join(parent, 'task.json');
    mkdirSync(parent, { recursive: true });
    cpSync(join(directory, '.arc/task.json'), taskPath);
    if (kind === 'out-of-scope') {
      const task = JSON.parse(readFileSync(taskPath, 'utf8'));
      task.inputs.scope = 'secrets/production.txt';
      writeFileSync(taskPath, JSON.stringify(task) + '\n');
    } else if (kind.startsWith('task-')) {
      unlinkSync(taskPath);
      if (kind === 'task-directory') mkdirSync(taskPath);
      if (kind === 'task-symlink') symlinkSync(join(directory, '.arc/task.json'), taskPath);
      if (kind === 'task-dangling-symlink') symlinkSync('missing.json', taskPath);
    } else if (kind.startsWith('parent-')) {
      rmSync(parent, { recursive: true });
      symlinkSync(kind === 'parent-symlink' ? join(directory, '.arc') : 'missing', parent, 'dir');
    } else if (kind === 'checkout-symlink') {
      rmSync(candidate, { recursive: true });
      symlinkSync(directory, candidate, 'dir');
    }
    const accepted = kind === 'regular' || kind === 'out-of-scope';
    const before = accepted ? readFileSync(taskPath, 'utf8') : null;
    const result = expectStatus(run('bash', ['-e', '-u', '-o', 'pipefail', '-c', guard], directory), accepted ? 0 : 2);
    if (accepted) {
      const report = explain(directory, kind === 'regular' ? 0 : 1, '.arc/bundle.json', 'arc-candidate/.arc/task.json');
      if (kind === 'out-of-scope') assert.ok(report.errors.some((error) => error.code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'));
      assert.equal(readFileSync(taskPath, 'utf8'), before, kind + ': input task is unchanged');
    } else {
      assert.equal(result.stderr.trim(), 'Candidate .arc/task.json must be a regular file under non-symlink directories.', kind);
    }
    assert.equal(bundleHash(directory), hash, kind + ': trusted bundle is unchanged');
  });
});
