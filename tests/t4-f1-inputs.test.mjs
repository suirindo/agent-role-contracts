// T4 F1 candidate inputs (ARC #117, Test Contract V0.3.4 Annex D) are kept byte-exact and replayed through the source CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = fileURLToPath(new URL('../experiments/external-evaluation/t4-f1-inputs/', import.meta.url));
const cli = fileURLToPath(new URL('../bin/agent-role-contracts.mjs', import.meta.url));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const input = name => join(dir, 'inputs', name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (...args) => {
  const r = spawnSync(process.execPath, [cli, ...args, '--format', 'json'], { encoding: 'utf8' });
  assert.ok(r.stdout, `CLI printed no JSON (exit ${r.status}): ${r.stderr}`);
  return { status: r.status, out: JSON.parse(r.stdout) };
};
const base = action => ['--bundle', input('bundle.json'), '--task', input('task.json'), '--action', action];

test('every raw input file matches its pinned Annex D hash', () => {
  for (const [name, hash] of Object.entries(manifest.inputs)) assert.equal(sha256(readFileSync(input(name))), hash, name);
  assert.deepEqual(readFileSync(input('bundle.json')), readFileSync(fileURLToPath(new URL('../examples/team.json', import.meta.url))));
});

test('C1 changes only parameters.quantity 40 -> 41', () => {
  const a = JSON.parse(readFileSync(input('action.json'), 'utf8'));
  const c1 = JSON.parse(readFileSync(input('action.c1.json'), 'utf8'));
  assert.equal(a.parameters.quantity, 40);
  assert.equal(c1.parameters.quantity, 41);
  assert.deepEqual({ ...c1, parameters: { ...c1.parameters, quantity: 40 } }, a);
});

test('action-subject gives the pinned G1 subjects and never authorises execution', () => {
  for (const [action, key] of [['action.json', 'C0_C2_C3'], ['action.c1.json', 'C1']]) {
    const { status, out } = run('action-subject', ...base(input(action)));
    assert.equal(status, 0, action);
    assert.equal(out.subject_digest, manifest.g1_subject[key], action);
    assert.equal(out.execution_authorized, false, action);
  }
});

test('action-bind: C0/C2/C3 pass with the prior binding, C1 is rejected with G1_SUBJECT_MISMATCH', () => {
  const pass = run('action-bind', ...base(input('action.json')), '--binding', input('binding.json'));
  assert.equal(pass.status, 0);
  assert.equal(pass.out.valid, true);
  assert.equal(pass.out.execution_authorized, false);

  const c1 = run('action-bind', ...base(input('action.c1.json')), '--binding', input('binding.json'));
  assert.equal(c1.status, 1);
  assert.equal(c1.out.valid, false);
  assert.equal(c1.out.execution_authorized, false);
  assert.ok(c1.out.errors.length > 0);
  assert.ok(c1.out.errors.every(e => e.code === 'G1_SUBJECT_MISMATCH'), JSON.stringify(c1.out.errors));
});

test('raw file hash and G1 subject are different identities: re-serialising keeps the subject, changes the raw hash', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'arc-t4-f1-'));
  try {
    const pretty = join(tmp, 'action.json');
    writeFileSync(pretty, JSON.stringify(JSON.parse(readFileSync(input('action.json'), 'utf8')), null, 2) + '\n');
    assert.notEqual(sha256(readFileSync(pretty)), manifest.inputs['action.json']);
    const { status, out } = run('action-subject', ...base(pretty));
    assert.equal(status, 0);
    assert.equal(out.subject_digest, manifest.g1_subject.C0_C2_C3);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
