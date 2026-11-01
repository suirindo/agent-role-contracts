#!/usr/bin/env node
// Read-only checks of the installed CLI and supplied declarations. No install,
// file writes, npm scripts, agent launch, or runtime authorization.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageRoot = join(root, 'node_modules/@netsujo/agent-role-contracts');
const cli = join(packageRoot, 'bin/agent-role-contracts.mjs');
const installHint = 'Run npm ci --ignore-scripts in the consumer directory, then retry.';

function regularFile(path, label, hint = '') {
  let stat;
  try { stat = lstatSync(path); } catch { throw new Error(label + ' is missing or unreadable. ' + hint); }
  if (!stat.isFile()) throw new Error(label + ' must be a regular file, not a directory or symlink. ' + hint);
}

function check(task, expectedStatus, expectedCode) {
  let status = 0, stdout = '', stderr = '';
  try {
    stdout = execFileSync(process.execPath, [cli, 'explain',
      '--bundle', '.arc/bundle.json', '--task', task, '--format', 'json'], {
      cwd: root, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    if (error.signal || ![1, 2].includes(error.status)) throw new Error('The installed ARC CLI could not finish.');
    ({ status, stdout, stderr } = error);
  }
  let report;
  try { report = JSON.parse(status === 2 ? stderr : stdout); }
  catch { throw new Error('The installed ARC CLI did not return a JSON diagnostic.'); }
  const codes = report.errors?.map((entry) => entry.code) || [];
  const diagnostics = status === 2 ? report.error
    : report.errors?.slice(0, 5).map((entry) => entry.code + ' at ' + entry.path).join('; ') || 'none';
  const expected = status === expectedStatus && (status === 2
    ? report.error === expectedCode
    : report.version === '1.0.0' && report.valid === (status === 0)
      && (!expectedCode || codes.includes(expectedCode)));
  if (!expected) {
    throw new Error('Setup check expected exit ' + expectedStatus + ' but received exit ' + status
      + '. Diagnostics: ' + diagnostics + '. Repeat setup proof in an unchanged disposable starter; '
      + 'use npm run arc:check to diagnose your own task without overwriting it.');
  }
  const label = expectedStatus === 0 ? 'supplied positive task'
    : expectedStatus === 1 ? 'expected out-of-scope rejection: ' + diagnostics
      : 'expected missing-input error: ' + diagnostics;
  console.log('PASS ' + label + ' (exit ' + status + ')');
}

try {
  if (process.argv.length !== 2) throw new Error('No arguments are supported; run node scripts/verify-setup.mjs from the consumer directory.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) throw new Error('Use Node.js 22.5 or later.');
  regularFile(join(packageRoot, 'package.json'), 'Installed dependency manifest', installHint);
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')); }
  catch { throw new Error('Installed dependency manifest is unreadable or invalid. ' + installHint); }
  if (manifest.name !== '@netsujo/agent-role-contracts' || manifest.version !== '1.0.0') {
    throw new Error('This setup check requires @netsujo/agent-role-contracts@1.0.0. ' + installHint);
  }
  regularFile(cli, 'Installed ARC CLI', installHint);
  for (const name of ['bundle.json', 'task.json', 'task-outside-scope.json']) {
    regularFile(join(root, '.arc', name), '.arc/' + name);
  }
  const missing = '.arc/.setup-missing-' + randomUUID() + '.json';
  if (existsSync(join(root, missing))) throw new Error('Could not select an absent input for the missing-file check. Retry.');
  console.log('ARC setup: @netsujo/agent-role-contracts@1.0.0');
  check('.arc/task.json', 0);
  check('.arc/task-outside-scope.json', 1, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY');
  check(missing, 2, 'CLI_ERROR');
  console.log('Setup proof passed for the supplied declarations. npm run arc:check reads .arc/task.json; use --task with the intended file for other tasks. Test your hook or CI separately.');
  console.log('This does not authorize execution or prove runtime enforcement or practical value.');
} catch (error) {
  console.error('ARC setup check: ' + error.message);
  process.exitCode = 2;
}
