import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBundle, explainTask, validateHandoff } from '../src/index.mjs';
import { runtimeNeutralFindings } from '../src/contract-checks.mjs';
import { buildReport } from '../src/report.mjs';

const load = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const json = JSON.stringify;

test('runtime path detector does not treat a tilde-prefixed filename as a home-directory runtime path', () => {
  assert.deepEqual(runtimeNeutralFindings('~.claude'), []);
  assert.deepEqual(runtimeNeutralFindings('~.codex'), []);
  assert.ok(runtimeNeutralFindings('~/.claude/agents/example.md').some(message => message.includes('runtime固有のパス')));
  assert.ok(runtimeNeutralFindings('nested/.codex/config.json').some(message => message.includes('runtime固有のパス')));
});

test('public reports keep fail-closed claims fixed across entrypoints', () => {
  const bundle = json(load('team'));
  const task = json(load('task'));
  const handoff = json(load('handoff'));
  for (const report of [validateBundle(bundle), explainTask(bundle, task), validateHandoff(bundle, task, handoff)]) {
    assert.equal(report.execution_authorized, false);
    assert.equal(report.runtime_enforcement, false);
    assert.equal(report.identity_verified, false);
    assert.equal(report.evidence_verified, false);
    assert.equal(report.source_files_checked, false);
    assert.equal(report.sensitive_data_scanned, false);
    assert.equal(report.output_schema_validated, false);
  }
});

test('report details cannot override fail-closed claims or canonical metadata', () => {
  const report = buildReport('test-version', 'bundle', [], {
    tool: 'spoofed-tool',
    version: 'spoofed-version',
    kind: 'spoofed-kind',
    valid: false,
    execution_authorized: true,
    runtime_enforcement: true,
    identity_verified: true,
    evidence_verified: true,
    source_files_checked: true,
    sensitive_data_scanned: true,
    output_schema_validated: true,
    errors: [{code:'SPOOF',path:'x',message:'spoof'}],
  });
  assert.equal(report.tool, 'agent-role-contracts');
  assert.equal(report.version, 'test-version');
  assert.equal(report.kind, 'bundle');
  assert.equal(report.valid, true);
  for (const key of [
    'execution_authorized',
    'runtime_enforcement',
    'identity_verified',
    'evidence_verified',
    'source_files_checked',
    'sensitive_data_scanned',
    'output_schema_validated',
  ]) assert.equal(report[key], false, key);
  assert.deepEqual(report.errors, []);
});

test('inert schema property names constructor and prototype are accepted', () => {
  const bundle = load('team');
  bundle.roles[1].contract.contract.output_schema = {
    type: 'object',
    properties: {
      constructor: { type: 'string' },
      prototype: { type: 'string' }
    }
  };
  const report = validateBundle(json(bundle));
  assert.equal(report.valid, true, json(report.errors));
});

test('__proto__ remains rejected at the public JSON boundary', () => {
  assert.equal(validateBundle('{"__proto__":{}}').errors[0].code, 'RESERVED_JSON_KEY');
});
