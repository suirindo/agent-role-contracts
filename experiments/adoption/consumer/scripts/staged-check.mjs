#!/usr/bin/env node
// Check staged declaration JSON, not the set of files changed by this commit.
// No index/config mutation, package install, agent launch, or runtime authorization.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const declarations = ['.arc/bundle.json', '.arc/task.json'];
const limit = 1024 * 1024;
let temporaryDirectory;
let exitCode = 2;

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: limit + 4096,
    ...options,
  });
}

try {
  if (process.argv.length !== 2) throw new Error('No arguments are supported; run from the consumer repository root.');
  const repositoryRoot = git(['rev-parse', '--show-toplevel']).trim();
  if (resolve(repositoryRoot) !== resolve(process.cwd())) throw new Error('Run from the consumer repository root.');

  // One index read captures object identities. Read those immutable blobs below,
  // so a later worktree/index edit cannot silently change either captured input.
  const entries = git(['ls-files', '--stage', '-z', '--', ...declarations])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t(.+)$/.exec(line);
      if (!match) throw new Error('Could not read a staged declaration entry.');
      return { mode: match[1], object: match[2], stage: match[3], path: match[4] };
    });
  const inputs = declarations.map((path) => {
    const matches = entries.filter((entry) => entry.path === path);
    if (matches.length !== 1 || matches[0].stage !== '0') {
      throw new Error('Stage one resolved regular file for ' + path + ' before checking.');
    }
    const entry = matches[0];
    if (!['100644', '100755'].includes(entry.mode)) throw new Error('Staged declaration must be a regular file: ' + path);
    const bytes = git(['cat-file', 'blob', entry.object], { encoding: 'buffer', maxBuffer: limit + 1 });
    if (bytes.length > limit) throw new Error('Staged declaration exceeds the 1 MiB input limit: ' + path);
    return { path, bytes };
  });

  const packageEntry = fileURLToPath(import.meta.resolve('@netsujo/agent-role-contracts'));
  const packageRoot = resolve(dirname(packageEntry), '..');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.name !== '@netsujo/agent-role-contracts' || manifest.version !== '1.0.0') {
    throw new Error('Install the pinned @netsujo/agent-role-contracts@1.0.0 consumer dependency first.');
  }

  temporaryDirectory = mkdtempSync(join(tmpdir(), 'arc-staged-'));
  const inputPaths = inputs.map(({ path, bytes }, index) => {
    const outputPath = join(temporaryDirectory, index === 0 ? 'bundle.json' : 'task.json');
    writeFileSync(outputPath, bytes, { flag: 'wx', mode: 0o600 });
    return outputPath;
  });
  const child = spawnSync(process.execPath, [
    join(packageRoot, 'bin/agent-role-contracts.mjs'), 'explain',
    '--bundle', inputPaths[0], '--task', inputPaths[1], '--format', 'text',
  ], { cwd: repositoryRoot, stdio: 'inherit' });
  if (child.error || child.signal || ![0, 1, 2].includes(child.status)) throw new Error('The ARC process did not return a supported result.');
  exitCode = child.status;
} catch (error) {
  // Do not print raw Git output, local credentials, or arbitrary input contents.
  const detail = error?.code === 'ERR_MODULE_NOT_FOUND'
    ? 'Install the pinned consumer dependency before running this hook.'
    : error?.status !== undefined
      ? 'Git could not read the staged declaration inputs.'
      : error.message;
  console.error('ARC staged declaration check: ' + detail);
  exitCode = 2;
} finally {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}
process.exitCode = exitCode;
