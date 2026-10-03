import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@netsujo/agent-role-contracts/core';
import * as finance from '@netsujo/agent-role-contracts/profiles/onchain-finance';
import * as legacy from '../src/index.mjs';
import coreSchemas from '../src/schemas.core.generated.mjs';
import financeSchemas from '../src/schemas.finance.generated.mjs';
import allSchemas from '../src/schemas.generated.mjs';
import { scenarios, makeScenario, evaluateScenario } from '../examples/cross-domain/scenarios.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(join(root, 'examples', name + '.json'), 'utf8');
const templates = { bundle: JSON.parse(read('team')), task: JSON.parse(read('task')), handoff: JSON.parse(read('handoff')) };

for (const scenario of scenarios) {
  const data = makeScenario(scenario, templates);
  const rows = evaluateScenario(data);
  for (const row of rows) test(scenario.id + ': ' + row.name, () => {
    const { result, expected } = row;
    assert.equal(result.valid, expected === 'PASS');
    if (expected !== 'PASS') assert.ok(result.errors.some(error => error.code === expected), JSON.stringify(result.errors));
    for (const field of ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified', 'source_files_checked', 'sensitive_data_scanned', 'output_schema_validated']) assert.equal(result[field], false);
  });
}

test('core and optional profile entrypoints preserve existing root function identities', () => {
  assert.deepEqual(Object.keys(core).sort(), ['MAX_INPUT_BYTES','VERSION','explainTask','validateBundle','validateHandoff'].sort());
  assert.deepEqual(Object.keys(finance).sort(), ['describeFinancialIntent','validateFinancialIntent','validateFinancialExecution'].sort());
  assert.deepEqual(Object.keys(legacy).sort(), [...Object.keys(core), ...Object.keys(finance)].sort());
  for (const [key, value] of Object.entries({ ...core, ...finance })) assert.equal(legacy[key], value);
});
test('schema sets are disjoint and the compatibility aggregate loses no schemas', () => {
  assert.deepEqual(Object.keys(coreSchemas).sort(), ['role-contract','bundle','task','handoff'].sort());
  assert.deepEqual(Object.keys(financeSchemas).sort(), ['financial-policy','financial-intent','financial-execution'].sort());
  assert.deepEqual(allSchemas, { ...coreSchemas, ...financeSchemas });
});

test('core, CLI and quickstart work when every finance module is physically absent', t => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-core-only-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'bin')); mkdirSync(join(dir, 'examples'));
  for (const name of readdirSync(join(root, 'src'))) {
    if (!name.endsWith('.mjs') || name.includes('finance') || name === 'schemas.generated.mjs' || name === 'index.mjs') continue;
    cpSync(join(root, 'src', name), join(dir, 'src', name));
  }
  cpSync(join(root, 'bin/agent-role-contracts.mjs'), join(dir, 'bin/agent-role-contracts.mjs'));
  for (const name of ['team.json','task.json','handoff.json','starter-bundle.json','starter-task.json','starter-task-outside-scope.json','quickstart.mjs']) cpSync(join(root,'examples',name),join(dir,'examples',name));
  const runs = [
    ['bin/agent-role-contracts.mjs','--help'],
    ['bin/agent-role-contracts.mjs','validate','--bundle','examples/team.json'],
    ['bin/agent-role-contracts.mjs','explain','--bundle','examples/team.json','--task','examples/task.json'],
    ['bin/agent-role-contracts.mjs','handoff','--bundle','examples/team.json','--task','examples/task.json','--handoff','examples/handoff.json'],
    ['examples/quickstart.mjs'],
  ];
  for (const args of runs) {
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('optional profile failure is explicit when its files are unavailable', t => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-missing-profile-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir,'src')); mkdirSync(join(dir,'bin'));
  for (const name of readdirSync(join(root, 'src'))) {
    if (!name.endsWith('.mjs') || name.includes('finance') || name === 'schemas.generated.mjs' || name === 'index.mjs') continue;
    cpSync(join(root,'src',name),join(dir,'src',name));
  }
  cpSync(join(root,'bin/agent-role-contracts.mjs'),join(dir,'bin/agent-role-contracts.mjs'));
  const result = spawnSync(process.execPath, ['bin/agent-role-contracts.mjs','finance','--bundle','b.json','--task','t.json','--policy','p.json','--intent','i.json'], { cwd: dir, encoding:'utf8', timeout:10000 });
  assert.equal(result.status, 2); assert.equal(JSON.parse(result.stderr).execution_authorized, false);
  assert.equal(result.stdout, '');
});

test('cross-domain demo has 18 checked outcomes and works from an unrelated cwd', () => {
  const result = spawnSync(process.execPath, [join(root,'examples/cross-domain/demo.mjs')], { cwd: tmpdir(), encoding:'utf8', timeout:10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /18 expected outcomes verified/);
  assert.equal((result.stdout.match(/FAIL \(expected\)/g) || []).length, 12);
});

test('existing finance APIs still work from the explicit optional entrypoint', async () => {
  const f = name => readFileSync(join(root,'examples/onchain-finance',name+'.json'),'utf8');
  const args = [f('bundle'),f('task'),f('policy'),f('intent')];
  const result = await finance.validateFinancialIntent(...args,'2030-01-01T00:00:03Z');
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  assert.deepEqual(result, await legacy.validateFinancialIntent(...args,'2030-01-01T00:00:03Z'));
});
