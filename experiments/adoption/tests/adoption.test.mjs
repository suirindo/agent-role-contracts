import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const adoptionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(adoptionRoot, 'consumer');
const packageRoot = resolve(process.env.ARC_PACKAGE_ROOT || join(template, 'node_modules/@netsujo/agent-role-contracts'));
const hook = join(adoptionRoot, 'integrations/pre-commit');

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env });
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fixture(fn) {
  assert.notEqual(process.platform, 'win32', 'This local hook harness requires a POSIX shell; Windows UI/runtime coverage is separate.');
  assert.ok(existsSync(join(packageRoot, 'package.json')), 'Install the pinned 1.0.0 consumer dependency, or set ARC_PACKAGE_ROOT to its installed package directory.');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@netsujo/agent-role-contracts');
  assert.equal(manifest.version, '1.0.0');
  const directory = mkdtempSync(join(tmpdir(), 'arc-adoption-test-'));
  try {
    for (const path of ['package.json', '.arc', 'scripts']) {
      cpSync(join(template, path), join(directory, path), { recursive: true });
    }
    mkdirSync(join(directory, 'node_modules/@netsujo'), { recursive: true });
    mkdirSync(join(directory, 'node_modules/.bin'), { recursive: true });
    symlinkSync(packageRoot, join(directory, 'node_modules/@netsujo/agent-role-contracts'), 'dir');
    symlinkSync(join(packageRoot, 'bin/agent-role-contracts.mjs'), join(directory, 'node_modules/.bin/agent-role-contracts'));
    git(directory, 'init', '--quiet');
    git(directory, 'add', '--', '.arc/bundle.json', '.arc/task.json');
    return fn(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectStatus(result, status) {
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, status, [result.stdout, result.stderr].join('\n'));
}

test('consumer commands exercise the pinned CLI: valid 0, rejected declarations/JSON 1, unreadable input 2', () => fixture((directory) => {
  expectStatus(run('npm', ['run', '--silent', 'arc:check'], directory), 0);
  expectStatus(run('npm', ['run', '--silent', 'arc:check:negative'], directory), 1);
  writeFileSync(join(directory, '.arc/task.json'), '{broken');
  const malformed = run('npm', ['run', '--silent', 'arc:check'], directory);
  expectStatus(malformed, 1);
  assert.match(malformed.stdout, /JSON_INVALID/);
  unlinkSync(join(directory, '.arc/task.json'));
  const missing = run('npm', ['run', '--silent', 'arc:check'], directory);
  expectStatus(missing, 2);
}));

test('actual hook accepts staged valid JSON despite invalid worktree JSON and preserves both', () => fixture((directory) => {
  const taskPath = join(directory, '.arc/task.json');
  cpSync(join(directory, '.arc/task-outside-scope.json'), taskPath);
  const indexBefore = git(directory, 'ls-files', '--stage');
  const worktreeBefore = readFileSync(taskPath, 'utf8');
  expectStatus(run('sh', [hook], directory), 0);
  assert.equal(git(directory, 'ls-files', '--stage'), indexBefore);
  assert.equal(readFileSync(taskPath, 'utf8'), worktreeBefore);
}));

test('actual hook rejects staged invalid JSON despite a valid worktree repair', () => fixture((directory) => {
  const taskPath = join(directory, '.arc/task.json');
  cpSync(join(directory, '.arc/task-outside-scope.json'), taskPath);
  git(directory, 'add', '--', '.arc/task.json');
  cpSync(join(template, '.arc/task.json'), taskPath);
  const indexBefore = git(directory, 'ls-files', '--stage');
  const result = run('sh', [hook], directory);
  expectStatus(result, 1);
  assert.match(result.stdout, /TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY/);
  assert.equal(git(directory, 'ls-files', '--stage'), indexBefore);
}));

test('missing staged declaration and staged symlink are input errors, never PASS', () => {
  fixture((directory) => {
    git(directory, 'rm', '--cached', '--quiet', '--', '.arc/task.json');
    const result = run(process.execPath, ['scripts/staged-check.mjs'], directory);
    expectStatus(result, 2);
    assert.match(result.stderr, /Stage one resolved regular file/);
  });
  fixture((directory) => {
    const taskPath = join(directory, '.arc/task.json');
    unlinkSync(taskPath);
    symlinkSync('task-outside-scope.json', taskPath);
    git(directory, 'add', '--', '.arc/task.json');
    const result = run(process.execPath, ['scripts/staged-check.mjs'], directory);
    expectStatus(result, 2);
    assert.match(result.stderr, /must be a regular file/);
  });
});

test('wrong package version and unresolved index entries are input errors', () => {
  fixture((directory) => {
    unlinkSync(join(directory, 'node_modules/@netsujo/agent-role-contracts'));
    const fakePackage = join(directory, 'node_modules/@netsujo/agent-role-contracts');
    mkdirSync(join(fakePackage, 'src'), { recursive: true });
    writeFileSync(join(fakePackage, 'src/index.mjs'), 'export {};\n');
    writeFileSync(join(fakePackage, 'package.json'), JSON.stringify({
      name: '@netsujo/agent-role-contracts', version: '0.0.0', type: 'module', exports: './src/index.mjs',
    }));
    const result = run(process.execPath, ['scripts/staged-check.mjs'], directory);
    expectStatus(result, 2);
    assert.match(result.stderr, /pinned/);
  });
  fixture((directory) => {
    const object = git(directory, 'rev-parse', ':.arc/task.json').trim();
    git(directory, 'update-index', '--force-remove', '--', '.arc/task.json');
    const update = spawnSync('git', ['update-index', '--index-info'], {
      cwd: directory, encoding: 'utf8',
      input: '100644 ' + object + ' 1\t.arc/task.json\n100644 ' + object + ' 2\t.arc/task.json\n',
    });
    expectStatus(update, 0);
    const result = run(process.execPath, ['scripts/staged-check.mjs'], directory);
    expectStatus(result, 2);
    assert.match(result.stderr, /Stage one resolved regular file/);
  });
});
