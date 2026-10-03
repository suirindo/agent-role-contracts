import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'arc-pack-'));
function run(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, npm_config_cache: join(dir, 'cache') } });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return result.stdout;
}
try {
  // npm supplies its CLI path on every supported OS; avoid shell/npm.cmd rules.
  assert.ok(process.env.npm_execpath, 'Run through npm run pack:smoke');
  const packed = JSON.parse(run([process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', dir], root))[0];
  const consumer = join(dir, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  run([process.env.npm_execpath, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(dir, packed.filename)], consumer);
  run(['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import * as core from '@netsujo/agent-role-contracts/core';
    import * as finance from '@netsujo/agent-role-contracts/profiles/onchain-finance';
    import * as legacy from '@netsujo/agent-role-contracts';
    const base = new URL('./node_modules/@netsujo/agent-role-contracts/', import.meta.url);
    const read = path => readFileSync(new URL(path, base), 'utf8');
    for (const [key, value] of Object.entries({...core, ...finance})) assert.equal(legacy[key], value);
    assert.equal(core.validateBundle(read('examples/team.json')).valid, true);
    const bundle = read('examples/starter-bundle.json'), task = read('examples/starter-task.json');
    const action = {schema_version:'0.3',id:'packed-action',kind:'propose-change',parameters:{revision:1}};
    const subject = await core.describeTaskAction(bundle, task, JSON.stringify(action));
    assert.equal(subject.valid, true);
    const route = JSON.parse(bundle).routes[0];
    const binding = {schema_version:'0.3',subject_digest:subject.subject_digest,reviews:[{role_id:route.reviewers[0],decision:'pass',subject_digest:subject.subject_digest}]};
    if(route.require_human_approval) binding.human_approval = {role_id:route.accountable,decision:'approved',subject_digest:subject.subject_digest};
    const accepted = await core.validateTaskActionBinding(bundle, task, JSON.stringify(action), JSON.stringify(binding));
    assert.equal(accepted.binding_matches_subject, true);
    for (const key of ['execution_authorized','identity_verified','review_authenticated','human_approval_authenticated','action_executed','replay_protection_enforced']) assert.equal(accepted[key],false);
    action.parameters.revision = 2;
    const stale = await core.validateTaskActionBinding(bundle, task, JSON.stringify(action), JSON.stringify(binding));
    assert.equal(stale.valid,false);
    assert.equal(stale.binding_matches_subject,false);
    assert.ok(stale.errors.some(e => e.code === 'G1_SUBJECT_MISMATCH'));
    const f = name => read('examples/onchain-finance/' + name + '.json');
    const result = await finance.validateFinancialExecution(f('bundle'), f('task'), f('policy'), f('intent'), f('execution'), '2030-01-01T00:00:05Z');
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const safe = await finance.validateSafeProposal(f('bundle'), f('task'), f('policy'), f('intent'), f('safe-proposal'), '2030-01-01T00:00:05Z');
    assert.equal(safe.valid, true, JSON.stringify(safe.errors));
    assert.equal(safe.safe_call_envelope_matches_intent, true);
    assert.equal(safe.transaction_serialization_verified, false);
    assert.equal(safe.transaction_hash_verified, false);
    for (const name of ['role-contract', 'bundle', 'task', 'handoff', 'task-action', 'task-action-binding', 'financial-policy', 'financial-intent', 'financial-execution', 'safe-proposal']) {
      const schema = JSON.parse(readFileSync(new URL(import.meta.resolve('@netsujo/agent-role-contracts/schemas/' + name + '.schema.json')), 'utf8'));
      assert.equal(schema.type, 'object');
    }
  `], consumer);
  const installed = join(consumer, 'node_modules', '@netsujo', 'agent-role-contracts');
  run([join(installed, 'bin/agent-role-contracts.mjs'), 'validate', '--bundle', join(installed, 'examples/team.json')], consumer);
  for (const demo of ['action-binding/demo.mjs', 'quickstart.mjs', 'cross-domain/demo.mjs', 'onchain-finance/demo.mjs', 'onchain-finance/safe-demo.mjs']) {
    run([join(installed, 'examples', demo)], consumer);
  }
  console.log('Packed consumer: root/core/finance exports, 10 schema exports, binding PASS/stale failure, CLI and 5 demos PASS');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
