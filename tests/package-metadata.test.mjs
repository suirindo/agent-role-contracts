import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import * as root from '../src/index.mjs';
import * as core from '../src/core.mjs';
import * as finance from '../src/finance-profile.mjs';
import * as adapter from '../src/filesystem-write-adapter.mjs';
const {validateFilesystemWriteMapping} = adapter;

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = value => JSON.stringify(value);
const fixture = name => read('examples/' + name + '.json');
const financialFixture = name => read('examples/onchain-finance/' + name + '.json');
const commonLimitations = ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified', 'source_files_checked', 'sensitive_data_scanned', 'output_schema_validated'];
const assertReport = (report, {kind, valid}) => {
  assert.equal(report.tool, 'agent-role-contracts');
  assert.equal(report.version, '0.5.0');
  assert.equal(report.kind, kind);
  assert.equal(report.valid, valid);
  for (const field of commonLimitations) assert.equal(report[field], false, field);
  assert.ok(Array.isArray(report.errors));
  for (const error of report.errors) assert.deepEqual(Object.keys(error).sort(), ['code', 'message', 'path']);
};

test('package, lockfile and public constants pin the current 0.5.0 release', () => {
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, '0.5.0');
  assert.equal(pkg.version, core.VERSION);
  assert.equal(lock.version, core.VERSION);
  assert.equal(lock.packages[''].version, core.VERSION);
  assert.equal(root.VERSION, core.VERSION);
  assert.equal(root.MAX_INPUT_BYTES, core.MAX_INPUT_BYTES);
  assert.equal(typeof core.MAX_INPUT_BYTES, 'number');
  assert.equal(core.MAX_INPUT_BYTES, 1_048_576);
});

test('package subpath mappings and exact export sets remain fixed', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.exports, {
    '.': './src/index.mjs',
    './schemas/*': './schemas/*',
    './core': './src/core.mjs',
    './profiles/onchain-finance': './src/finance-profile.mjs',
    './adapters/filesystem-write': './src/filesystem-write-adapter.mjs',
  });
  const coreNames = ['MAX_INPUT_BYTES', 'VERSION', 'describeTaskAction', 'describeTaskLifecycle', 'explainTask', 'validateBundle', 'validateHandoff', 'validateTaskActionBinding', 'validateTaskLifecycle'].sort();
  const financeNames = ['describeFinancialIntent', 'validateFinancialExecution', 'validateFinancialIntent', 'validateSafeProposal'].sort();
  assert.deepEqual(Object.keys(core).sort(), coreNames);
  assert.deepEqual(Object.keys(finance).sort(), financeNames);
  assert.deepEqual(Object.keys(root).sort(), [...coreNames, ...financeNames].sort());
  assert.equal(Object.hasOwn(root, 'validateFilesystemWriteMapping'), false);
  assert.equal(Object.hasOwn(core, 'validateFilesystemWriteMapping'), false);
  assert.deepEqual(Object.keys(adapter), ['validateFilesystemWriteMapping']);
  for (const [name, value] of Object.entries({...core, ...finance})) assert.equal(root[name], value, name);
});

test('all twelve public schema paths and their current versions remain fixed', () => {
  const versions = {
    'role-contract': undefined, bundle: '0.1', task: '0.1', handoff: '0.1',
    'task-action': '0.3', 'task-action-binding': '0.3', 'task-lifecycle': '0.4',
    'filesystem-write-mapping': '0.1', 'financial-policy': '0.2',
    'financial-intent': '0.2', 'financial-execution': '0.2', 'safe-proposal': '0.2',
  };
  assert.deepEqual(readdirSync(new URL('../schemas/', import.meta.url)).filter(name => name.endsWith('.schema.json')).sort(), Object.keys(versions).map(name => name + '.schema.json').sort());
  for (const [name, version] of Object.entries(versions)) {
    const schema = JSON.parse(read('schemas/' + name + '.schema.json'));
    assert.equal(schema.type, 'object', name);
    assert.equal(schema.properties?.schema_version?.const, version, name);
  }
});

test('generic APIs keep synchronous returns and deterministic positive/negative reports', () => {
  const calls = [
    [core.validateBundle, [fixture('team')], 'bundle'],
    [core.explainTask, [fixture('team'), fixture('task')], 'explain'],
    [core.validateHandoff, [fixture('team'), fixture('task'), fixture('handoff')], 'handoff'],
  ];
  for (const [api, args, kind] of calls) {
    const report = api(...args);
    assert.equal(typeof report?.then, 'undefined', kind);
    assertReport(report, {kind, valid: true});
    assert.deepEqual(api(...args), report, kind);
  }
  const invalid = core.validateBundle('{');
  assertReport(invalid, {kind: 'bundle', valid: false});
  assert.deepEqual(invalid.errors.map(({code, path}) => ({code, path})), [{code: 'JSON_INVALID', path: 'bundle'}]);
  assert.equal(typeof invalid.errors[0].message, 'string');
});

test('existing declaration APIs keep promise returns and fixed PASS limitations', async () => {
  const bundle = fixture('starter-bundle'), task = fixture('starter-task');
  const action = {schema_version: '0.3', id: 'compatibility-action', kind: 'filesystem-write', parameters: {path: JSON.parse(task).inputs.scope, content_sha256: 'sha256:' + 'a'.repeat(64)}};
  const subjectPromise = core.describeTaskAction(bundle, task, json(action));
  assert.equal(typeof subjectPromise.then, 'function');
  const subject = await subjectPromise;
  assertReport(subject, {kind: 'task-action', valid: true});
  assert.equal(subject.binding_profile, 'task-action/0.3');
  assert.match(subject.subject_digest, /^sha256:[0-9a-f]{64}$/);
  const route = JSON.parse(bundle).routes[0];
  const binding = {schema_version: '0.3', subject_digest: subject.subject_digest, reviews: route.reviewers.map(role_id => ({role_id, decision: 'pass', subject_digest: subject.subject_digest})), human_approval: {role_id: route.accountable, decision: 'approved', subject_digest: subject.subject_digest}};
  const bindingPromise = core.validateTaskActionBinding(bundle, task, json(action), json(binding));
  assert.equal(typeof bindingPromise.then, 'function');
  const bound = await bindingPromise;
  assertReport(bound, {kind: 'task-action-binding', valid: true});
  assert.equal(bound.binding_matches_subject, true);
  for (const field of ['subject_authenticated', 'review_authenticated', 'human_approval_authenticated', 'action_executed', 'replay_protection_enforced']) assert.equal(bound[field], false, field);

  const mapping = {schema_version: '0.1', subject_digest: subject.subject_digest, operation: 'write_file', ...action.parameters};
  const mappingPromise = validateFilesystemWriteMapping(bundle, task, json(action), json(mapping));
  assert.equal(typeof mappingPromise.then, 'function');
  const mapped = await mappingPromise;
  assertReport(mapped, {kind: 'filesystem-write-mapping', valid: true});
  assert.equal(mapped.adapter_profile, 'filesystem-write/0.1');
  assert.equal(mapped.mapping_matches_action, true);
  for (const field of ['adapter_authenticated', 'content_bytes_verified', 'filesystem_state_verified', 'path_exists_verified', 'write_permission_enforced', 'action_executed']) assert.equal(mapped[field], false, field);

  const lifecycle = {schema_version: '0.4', run_id: 'compatibility-run', subject_digest: subject.subject_digest, events: [
    {event_id: 'review', phase: 'review', actor_role_id: route.reviewers[0], decision: 'pass', subject_digest: subject.subject_digest},
    {event_id: 'approval', phase: 'approval', actor_role_id: route.accountable, decision: 'approved', subject_digest: subject.subject_digest},
  ]};
  const lifecycleCalls = [core.describeTaskLifecycle, core.validateTaskLifecycle];
  for (const api of lifecycleCalls) {
    const promise = api(bundle, task, json(action), json(lifecycle));
    assert.equal(typeof promise.then, 'function');
    const report = await promise;
    assertReport(report, {kind: api === core.describeTaskLifecycle ? 'task-lifecycle' : 'task-lifecycle-validation', valid: true});
    assert.equal(report.lifecycle_profile, 'task-lifecycle/0.4');
    for (const field of ['actor_identity_verified', 'review_verified', 'approval_verified', 'artifact_bytes_verified', 'state_machine_enforced', 'replay_protection_enforced']) assert.equal(report[field], false, field);
  }
});

test('stale subjects fail deterministically and finance APIs remain async and offline', async () => {
  const bundle = fixture('starter-bundle'), task = fixture('starter-task');
  const action = {schema_version: '0.3', id: 'compatibility-stale', kind: 'document', parameters: {revision: 1}};
  const subject = await core.describeTaskAction(bundle, task, json(action));
  const route = JSON.parse(bundle).routes[0];
  const binding = {schema_version: '0.3', subject_digest: subject.subject_digest, reviews: [{role_id: route.reviewers[0], decision: 'pass', subject_digest: subject.subject_digest}], human_approval: {role_id: route.accountable, decision: 'approved', subject_digest: subject.subject_digest}};
  action.parameters.revision = 2;
  const stale = await core.validateTaskActionBinding(bundle, task, json(action), json(binding));
  assertReport(stale, {kind: 'task-action-binding', valid: false});
  assert.equal(stale.binding_matches_subject, false);
  assert.ok(stale.errors.some(error => error.code === 'G1_SUBJECT_MISMATCH'));
  assert.deepEqual(await core.validateTaskActionBinding(bundle, task, json(action), json(binding)), stale);

  const fargs = [financialFixture('bundle'), financialFixture('task'), financialFixture('policy')];
  const calls = [
    [finance.describeFinancialIntent, [...fargs, financialFixture('transaction')], 'financial-subject'],
    [finance.validateFinancialIntent, [...fargs, financialFixture('intent'), '2030-01-01T00:00:03Z'], 'financial-intent'],
    [finance.validateFinancialExecution, [...fargs, financialFixture('intent'), financialFixture('execution'), '2030-01-01T00:00:05Z'], 'financial-execution'],
    [finance.validateSafeProposal, [...fargs, financialFixture('intent'), financialFixture('safe-proposal'), '2030-01-01T00:00:05Z'], 'safe-proposal'],
  ];
  for (const [api, args, kind] of calls) {
    const promise = api(...args);
    assert.equal(typeof promise.then, 'function', kind);
    const report = await promise;
    assertReport(report, {kind, valid: true});
    for (const field of ['chain_state_verified', 'simulation_executed', 'transaction_serialization_verified', 'financial_safety_verified', 'replay_protection_enforced']) assert.equal(report[field], false, field);
    assert.deepEqual(await api(...args), report, kind);
  }
});

test('both README files identify the current public version and demos remain wired', () => {
  for (const file of ['README.md', 'README.ja.md']) {
    const text = read(file);
    assert.ok(text.includes(core.VERSION));
    assert.equal(text.includes('0.1.0-' + 'preparation.'), false);
  }
  assert.equal(read('README.md').includes('currently remains the stable `0.1.0` release'), false);
  assert.equal(read('README.ja.md').includes('現在は安定版`0.1.0`を取得します'), false);
  assert.equal(read('README.md').includes('The published `0.5.0` preview'), false);
  assert.equal(read('README.md').includes('For the published preview'), false);
  assert.equal(read('README.md').includes('# or: npm install @netsujo/agent-role-contracts@0.5.0'), false);
  assert.equal(read('README.ja.md').includes('# または: npm install @netsujo/agent-role-contracts@0.5.0'), false);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['demo:binding'], 'node examples/action-binding/demo.mjs');
  assert.equal(scripts['demo:filesystem-adapter'], 'node examples/filesystem-write-adapter/demo.mjs');
});


test('lifecycle description is distinct from full semantic validation', async t => {
  const bundle = fixture('starter-bundle'), task = fixture('starter-task');
  const action = json({schema_version: '0.3', id: 'compatibility-lifecycle-semantics', kind: 'document', parameters: {revision: 1}});
  const {subject_digest} = await core.describeTaskAction(bundle, task, action);
  const route = JSON.parse(bundle).routes[0];
  const review = {event_id: 'review', phase: 'review', actor_role_id: route.reviewers[0], decision: 'pass', subject_digest};
  const approval = {event_id: 'approval', phase: 'approval', actor_role_id: route.accountable, decision: 'approved', subject_digest};
  const cases = [
    {name: 'missing required review', events: [approval], code: 'G3_REVIEW_REQUIRED'},
    {name: 'wrong phase actor', events: [{...review, actor_role_id: route.accountable}, approval], code: 'G3_PHASE_ACTOR'},
    {name: 'wrong phase decision', events: [{...review, decision: 'approved'}, approval], code: 'G3_PHASE_DECISION'},
    {name: 'negative decisions remain consistent declarations', events: [{...review, decision: 'blocked'}, {...approval, decision: 'denied'}], code: null},
  ];
  for (const {name, events, code} of cases) await t.test(name, async () => {
    const lifecycle = json({schema_version: '0.4', run_id: 'compatibility-semantic-review', subject_digest, events});
    const described = await core.describeTaskLifecycle(bundle, task, action, lifecycle);
    const validated = await core.validateTaskLifecycle(bundle, task, action, lifecycle);
    assertReport(described, {kind: 'task-lifecycle', valid: true});
    assert.equal(described.lifecycle_matches_subject, code === null);
    assert.deepEqual(described.errors, []);
    assertReport(validated, {kind: 'task-lifecycle-validation', valid: code === null});
    assert.equal(validated.lifecycle_matches_subject, code === null);
    if (code) assert.ok(validated.errors.some(error => error.code === code), code);
    else assert.deepEqual(validated.errors, []);
  });
});
