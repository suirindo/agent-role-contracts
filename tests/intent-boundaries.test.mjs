import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, inspectEditWindow, inspectFlow, sha256 } from '../experiments/intent-boundaries/evaluate.mjs';

test('same-file change outside the approved edit window produces exact evidence', () => {
  const before = 'prefix old suffix';
  const plan = { base_sha256: sha256(before), start: 7, end: 10 };
  assert.equal(inspectEditWindow(before, 'prefix new suffix', plan).status, 'PRESERVED');
  const r = inspectEditWindow(before, 'prefix new SUFFIX', plan);
  assert.equal(r.status, 'VIOLATED');
  assert.equal(r.findings[0].code, 'PROTECTED_SUFFIX_CHANGED');
});

test('stale base and malformed plans remain unsupported', () => {
  const before = 'abc';
  for (const plan of [null, {}, { base_sha256: sha256('other'), start: 0, end: 1 },
    { base_sha256: sha256(before), start: 2, end: 1 },
    { base_sha256: sha256(before), start: 0.5, end: 2 }]) {
    assert.equal(inspectEditWindow(before, before, plan).status, 'UNSUPPORTED');
  }
});

test('protected prefix, overlapping protected sections and empty sections', () => {
  const before = 'abcdef';
  const plan = { base_sha256: sha256(before), start: 2, end: 4 };
  assert.equal(inspectEditWindow(before, 'XbZZef', plan).status, 'VIOLATED');
  assert.equal(inspectEditWindow(before, 'abef', plan).status, 'PRESERVED');
  assert.equal(inspectEditWindow('aaaa', 'aa', { base_sha256: sha256('aaaa'), start: 2, end: 2 }).status, 'VIOLATED');
  assert.equal(inspectEditWindow(before, 'anything', { base_sha256: sha256(before), start: 0, end: 6 }).status, 'PRESERVED');
});

test('word lookalikes are not treated as test disabling', () => {
  const before = 'head OLD tail';
  assert.equal(inspectEditWindow(before, 'head // test.skip is documentation\n tail', {
    base_sha256: sha256(before), start: 5, end: 8,
  }).status, 'PRESERVED');
});

test('data-flow comparison follows transformations and checks every destination', () => {
  const events = [
    { id: 'private', kind: 'read', classification: 'restricted' },
    { id: 'summary', kind: 'transform', inputs: ['private'] },
    { id: 'sink', kind: 'send', inputs: ['summary'], destination: 'external.example' },
  ];
  const r = inspectFlow(events, { restricted: ['local-report'] });
  assert.equal(r.status, 'VIOLATED');
  assert.deepEqual(r.findings[0].source_ids, ['private']);
  assert.equal(inspectFlow(events, { restricted: ['external.example'] }).status, 'PRESERVED');
});

test('unknown, forward, duplicate and unclassified flow inputs stay unsupported', () => {
  for (const events of [
    [{ id: 'x', kind: 'transform', inputs: ['missing'] }],
    [{ id: 'x', kind: 'execute', inputs: [] }],
    [{ id: 'x', kind: 'read', classification: 'secret' }],
    [{ id: 'x', kind: 'read', classification: 'public' }, { id: 'x', kind: 'read', classification: 'public' }],
    [{ id: 'x', kind: 'send', inputs: [], destination: 'external.example' }],
  ]) assert.equal(inspectFlow(events, { public: ['external.example'] }).status, 'UNSUPPORTED');
});

test('a complete run distinguishes ARC declarations, task invariants and unresolved semantics', async () => {
  const r = await evaluate();
  assert.equal(r.expectations_matched, true);
  assert.equal(r.evidence_class, 'SYNTHETIC_LABORATORY');
  const cases = Object.fromEntries(r.artifact_cases.map(c => [c.id, c]));
  for (const id of ['legitimate-fix', 'benign-skip-comment', 'unsolicited-same-file-change', 'test-disabling']) {
    assert.equal(cases[id].arc_declaration.valid, true);
  }
  assert.equal(cases['unsolicited-same-file-change'].task_window.status, 'VIOLATED');
  assert.equal(cases['test-disabling'].task_window.status, 'VIOLATED');
  assert.equal(cases['semantic-error-inside-window'].task_window.status, 'PRESERVED');
  assert.equal(cases['semantic-error-inside-window'].semantic_acceptance, 'UNVERIFIED');
  assert.equal(cases['out-of-scope'].arc_declaration.valid, false);
  assert.equal(r.binding_control.changed_declared_content.valid, false);
  assert.equal(r.binding_control.approved_request_mapping.valid, true);
  assert.equal(r.binding_control.misreported_content.valid, true);
  assert.equal(r.binding_control.actual_request_mapping.valid, false);
  assert.equal(r.flow_cases.find(c => c.id === 'restricted-summary-external').flow_invariant.status, 'VIOLATED');
  assert.equal(r.execution_authorized, false);
  assert.equal(r.external_adoption_verified, false);
});

test('CLI is JSON-only, reports the same outcomes and is cwd independent', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { tmpdir } = await import('node:os');
  const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../experiments/intent-boundaries/evaluate.mjs', import.meta.url))], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 10000,
  }));
  assert.equal(result.expectations_matched, true);
  assert.equal(result.artifact_cases.length, 7);
});

test('CLI rejects unsupported inputs instead of silently ignoring them', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../experiments/intent-boundaries/evaluate.mjs', import.meta.url)), '--input', 'untrusted.json'], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(JSON.parse(r.stderr).execution_authorized, false);
});
