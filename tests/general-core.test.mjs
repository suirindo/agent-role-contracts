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
import adapterSchemas from '../src/schemas.adapters.generated.mjs';
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
  assert.deepEqual(Object.keys(core).sort(), ['MAX_INPUT_BYTES','VERSION','explainTask','validateBundle','validateHandoff','describeTaskAction','validateTaskActionBinding'].sort());
  assert.deepEqual(Object.keys(finance).sort(), ['describeFinancialIntent','validateFinancialIntent','validateFinancialExecution','validateSafeProposal'].sort());
  assert.deepEqual(Object.keys(legacy).sort(), [...Object.keys(core), ...Object.keys(finance)].sort());
  for (const [key, value] of Object.entries({ ...core, ...finance })) assert.equal(legacy[key], value);
});
test('schema sets are disjoint and the compatibility aggregate loses no schemas', () => {
  assert.deepEqual(Object.keys(coreSchemas).sort(), ['role-contract','bundle','task','handoff','task-action','task-action-binding'].sort());
  assert.deepEqual(Object.keys(financeSchemas).sort(), ['financial-policy','financial-intent','financial-execution','safe-proposal'].sort());
  assert.deepEqual(Object.keys(adapterSchemas), ['filesystem-write-mapping']);
  assert.equal(new Set([...Object.keys(coreSchemas), ...Object.keys(adapterSchemas), ...Object.keys(financeSchemas)]).size, 11);
  assert.deepEqual(allSchemas, { ...coreSchemas, ...adapterSchemas, ...financeSchemas });
});

test('core, CLI and quickstart work when adapter and every finance module is physically absent', t => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-core-only-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'bin')); mkdirSync(join(dir, 'examples'));
  for (const name of readdirSync(join(root, 'src'))) {
    if (!name.endsWith('.mjs') || (name.includes('finance') || name.includes('safe') || name.includes('adapter')) || name === 'schemas.generated.mjs' || name === 'index.mjs') continue;
    cpSync(join(root, 'src', name), join(dir, 'src', name));
  }
  cpSync(join(root, 'bin/agent-role-contracts.mjs'), join(dir, 'bin/agent-role-contracts.mjs'));
  for (const name of ['team.json','task.json','handoff.json','starter-bundle.json','starter-task.json','starter-task-outside-scope.json','quickstart.mjs']) cpSync(join(root,'examples',name),join(dir,'examples',name));
  cpSync(join(root, 'examples/cross-domain'), join(dir, 'examples/cross-domain'), { recursive: true });
  cpSync(join(root, 'examples/action-binding'), join(dir, 'examples/action-binding'), { recursive: true });
  const runs = [
    ['--input-type=module','-e', `import {readFileSync,writeFileSync} from 'node:fs'; import {describeTaskAction} from './src/core.mjs'; const b=readFileSync('examples/starter-bundle.json','utf8'), t=readFileSync('examples/starter-task.json','utf8'); const a={schema_version:'0.3',id:'isolated',kind:'propose-change',parameters:{revision:1}}; const subject=await describeTaskAction(b,t,JSON.stringify(a)); if(!subject.valid)process.exit(1);const route=JSON.parse(b).routes[0];const binding={schema_version:'0.3',subject_digest:subject.subject_digest,reviews:route.reviewers.map(role_id=>({role_id,decision:'pass',subject_digest:subject.subject_digest}))};if(route.require_human_approval)binding.human_approval={role_id:route.accountable,decision:'approved',subject_digest:subject.subject_digest};writeFileSync('action.json',JSON.stringify(a));writeFileSync('binding.json',JSON.stringify(binding));`],
    ['bin/agent-role-contracts.mjs','action-subject','--bundle','examples/starter-bundle.json','--task','examples/starter-task.json','--action','action.json'],
    ['bin/agent-role-contracts.mjs','action-bind','--bundle','examples/starter-bundle.json','--task','examples/starter-task.json','--action','action.json','--binding','binding.json'],
    ['examples/action-binding/demo.mjs'],
    ['--input-type=module', '-e', `import { readFileSync } from 'node:fs'; import { validateBundle } from './src/core.mjs'; if (!validateBundle(readFileSync('examples/team.json','utf8')).valid) process.exit(1);`],
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
    if (!name.endsWith('.mjs') || (name.includes('finance') || name.includes('safe') || name.includes('adapter')) || name === 'schemas.generated.mjs' || name === 'index.mjs') continue;
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

test('Safe API works through the optional profile and compatibility root', async () => {
  const f = name => readFileSync(join(root,'examples/onchain-finance',name+'.json'),'utf8');
  const args = ['bundle','task','policy','intent','safe-proposal'].map(f);
  const result = await finance.validateSafeProposal(...args,'2030-01-01T00:00:03Z');
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  assert.equal(result.safe_call_envelope_matches_intent,true);
  assert.equal(result.transaction_serialization_verified,false);
  assert.equal(result.transaction_hash_verified,false);
  assert.deepEqual(result,await legacy.validateSafeProposal(...args,'2030-01-01T00:00:03Z'));
});
