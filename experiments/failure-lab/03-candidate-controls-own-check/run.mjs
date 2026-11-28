// Failure Lab entry 03: can the candidate control the check that produces its own PASS?
// Synthetic and offline. Everything runs in a temporary directory that is removed at the end.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'arc-lab-03-'));

// The outer command is the same for every candidate: node scripts/test.mjs
const OUTER_COMMAND = ['scripts/test.mjs'];

const goodAdd = 'export const add = (a, b) => a + b;\n';
const badAdd = 'export const add = (a, b) => a - b;\n';

// Candidate-owned test definition and the honest test step that runs it.
const candidateTest = `import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/add.mjs';
test('add', () => { assert.equal(add(2, 3), 5); });
`;
const honestStep = `import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['--test', 'tests/add.test.mjs'], { stdio: 'ignore' });
process.exit(r.status ?? 1);
`;
// The faulty candidate rewrites its own test step so that it reports success without running anything.
const hollowStep = `console.log('all tests passed');
process.exit(0);
`;

// The trusted check is owned by the host, outside every candidate directory.
// It does not read the candidate's tests or test step. It exercises the behavior itself.
const trustedDir = join(root, 'trusted');
mkdirSync(trustedDir);
writeFileSync(join(trustedDir, 'oracle.mjs'), `import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { add } = await import(pathToFileURL(process.argv[2]).href);
assert.equal(add(2, 3), 5);
assert.equal(add(-1, 1), 0);
assert.equal(add(10, 0), 10);
`);

function makeCandidate(name, { add, step }) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'));
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'src', 'add.mjs'), add);
  writeFileSync(join(dir, 'tests', 'add.test.mjs'), candidateTest);
  writeFileSync(join(dir, 'scripts', 'test.mjs'), step);
  return dir;
}
// Drop NODE_TEST_CONTEXT so a nested "node --test" behaves the same when this demo is itself run under node --test.
const { NODE_TEST_CONTEXT, ...cleanEnv } = process.env;
const run = (args, cwd) => spawnSync(process.execPath, args, { cwd, env: cleanEnv, encoding: 'utf8', timeout: 30000 }).status;
const label = status => (status === 0 ? 'PASS' : `FAIL (exit ${status})`);

const cases = [
  ['A', 'good code, honest test step', { add: goodAdd, step: honestStep }, 0, 0],
  ['B', 'faulty code, test step rewritten to report success', { add: badAdd, step: hollowStep }, 0, 1],
  ['C', 'faulty code, honest test step', { add: badAdd, step: honestStep }, 1, 1],
];

try {
  console.log('Entry 03 demo: the same outer command, node scripts/test.mjs, in three synthetic candidates.');
  console.log('Trusted check: oracle.mjs, held outside the candidates, calls src/add.mjs directly.\n');
  for (const [id, description, files, expectedOwn, expectedTrusted] of cases) {
    const dir = makeCandidate(id, files);
    const own = run(OUTER_COMMAND, dir);
    const trusted = run([join(trustedDir, 'oracle.mjs'), join(dir, 'src', 'add.mjs')], root);
    console.log(`Case ${id}: ${description}`);
    console.log(`  Candidate's own test step (node scripts/test.mjs): ${label(own)}`);
    console.log(`  Trusted check (oracle.mjs on src/add.mjs): ${label(trusted)}\n`);
    assert.equal(own === 0 ? 0 : 1, expectedOwn, `case ${id}: candidate's own step`);
    assert.equal(trusted === 0 ? 0 : 1, expectedTrusted, `case ${id}: trusted check`);
  }
  console.log('Result: in case B the candidate-controlled step reports PASS and the trusted check fails.');
  console.log('Demo complete: every observed result matched the expectation (demo exit 0).');
  console.log('Checked: the behavior of add() through one trusted oracle, and the outcome of each candidate step.');
  console.log('Not checked: any real CI system, who owns a real runner, caches, dependencies, or ARC (not run).');
} finally {
  rmSync(root, { recursive: true, force: true });
}
