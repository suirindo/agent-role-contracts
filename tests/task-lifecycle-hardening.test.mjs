import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeTaskAction, describeTaskLifecycle, validateTaskLifecycle } from '@netsujo/agent-role-contracts/core';

// Issue #18 public boundary only: no fallback, skips, or implementation helpers.
const json = JSON.stringify;
const clone = structuredClone;
const load = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const fields = ['bundle', 'task', 'action', 'lifecycle'];
const claims = ['actor_identity_verified', 'review_verified', 'approval_verified', 'execution_verified',
  'artifact_bytes_verified', 'artifact_locator_resolved', 'runtime_acceptance_verified',
  'replay_protection_enforced', 'execution_authorized', 'runtime_enforcement', 'identity_verified',
  'evidence_verified', 'source_files_checked', 'sensitive_data_scanned', 'output_schema_validated'];
const wrongDigest = 'sha256:' + '0'.repeat(64);
const artifact = () => ({ artifact_id: 'artifact-1', sha256: 'sha256:' + 'a'.repeat(64), locator: 'declared/reference' });
const args = d => fields.map(key => json(d[key]));
const describe = d => describeTaskLifecycle(...args(d));
const validate = d => validateTaskLifecycle(...args(d));
function inert(r) {
  for (const key of claims) assert.equal(r[key], false, key);
  for (const key of ['reviews', 'human_approval', 'binding']) assert.equal(Object.hasOwn(r, key), false, `${key} must not be synthesized`);
}
function pass(r) {
  assert.equal(r.valid, true, json(r.errors));
  assert.deepEqual(r.errors, []);
  inert(r);
  assert.equal(typeof r.lifecycle_matches_subject, 'boolean');
  if (r.kind === 'task-lifecycle-validation') assert.equal(r.lifecycle_matches_subject, true);
  assert.equal(r.artifact_identity_consistent, true);
}
function fail(r) {
  assert.equal(r.valid, false, json(r));
  assert.ok(r.errors.length > 0, 'rejection needs diagnostics');
  assert.equal(r.lifecycle_matches_subject, false);
  inert(r);
}
async function bothFail(d) { fail(await describe(d)); fail(await validate(d)); }
function event(d, phase) { return d.lifecycle.events.find(e => e.phase === phase); }
async function rebind(d) {
  const subject = await describeTaskAction(...args(d).slice(0, 3));
  assert.equal(subject.valid, true, json(subject.errors));
  d.lifecycle.subject_digest = subject.subject_digest;
  for (const e of d.lifecycle.events) e.subject_digest = subject.subject_digest;
  return subject.subject_digest;
}
async function fixture({ approval = true, reviewers = true } = {}) {
  const bundle = load('starter-bundle'), task = load('starter-task');
  for (const [index, id] of [[0, 'alternate-executor'], [1, 'alternate-reviewer']]) {
    const role = clone(bundle.roles[index]); role.contract.id = id; bundle.roles.push(role);
  }
  const route = bundle.routes[0];
  route.require_human_approval = approval;
  if (!reviewers) route.reviewers = [];
  const d = { bundle, task, action: { schema_version: '0.3', id: 'lifecycle-action', kind: 'propose-change',
    parameters: { target: 'src/example.mjs', revision: 1 } }, lifecycle: {
    schema_version: '0.4', run_id: 'run-1', subject_digest: wrongDigest, events: [] } };
  const definitions = [
    ...(reviewers ? [['review', 'reviewer', 'pass']] : []),
    ...(approval ? [['approval', 'implementer', 'approved']] : []),
    ['execution', 'implementer', 'declared_success'], ['evidence', 'implementer', 'present'] ];
  d.lifecycle.events = definitions.map(([phase, actor_role_id, decision], i) => ({
    event_id: `event-${i + 1}`, phase, actor_role_id, decision, subject_digest: wrongDigest, artifacts: [artifact()] }));
  await rebind(d);
  pass(await describe(d)); pass(await validate(d));
  return d;
}

const changes = [
  ['policy_version', d => { d.bundle.policy_version = 'example-v2'; }],
  ['policy capabilities', d => { d.bundle.policy.capabilities.push('artifact.publish'); }],
  ['role contract', d => { d.bundle.roles[0].contract.mission.objective += ' Explain evidence.'; }],
  ['role body', d => { d.bundle.roles[0].body += '\nAnother declaration.'; }],
  ['knowledge', d => { d.bundle.knowledge.push({ id: 'reference', uri: 'https://example.invalid/reference' }); }],
  ['route accountable', d => { d.bundle.routes[0].accountable = 'alternate-executor'; event(d, 'approval').actor_role_id = 'alternate-executor'; }],
  ['route executors', d => { d.bundle.routes[0].executors = ['alternate-executor']; event(d, 'execution').actor_role_id = 'alternate-executor'; }],
  ['route reviewers', d => { d.bundle.routes[0].reviewers = ['alternate-reviewer']; event(d, 'review').actor_role_id = 'alternate-reviewer'; }],
  ['route approval requirement', d => { d.bundle.routes[0].require_human_approval = false; d.lifecycle.events = d.lifecycle.events.filter(e => e.phase !== 'approval'); }],
  ['task objective', d => { d.task.objective += ' Explain evidence.'; }],
  ['task inputs', d => { d.task.inputs.scope = 'src/another.mjs'; }],
  ['task acceptance', d => { d.task.acceptance_criteria.push('Explain evidence.'); }],
  ['task type', d => { d.task.type = 'another-change'; d.bundle.routes.push({ ...clone(d.bundle.routes[0]), task_type: d.task.type }); }],
  ['task id', d => { d.task.id = 'another-task'; }],
  ['action id', d => { d.action.id = 'another-action'; }],
  ['action kind', d => { d.action.kind = 'publish-artifact'; }],
  ['action parameters', d => { d.action.parameters.revision = 2; }],
];
for (const [name, mutate] of changes) {
  for (const target of ['top', 'review', 'approval', 'execution', 'evidence']) {
    test(`stale ${target} subject after ${name}`, async () => {
      // Approval requirement removal uses the inverse change for stale approval coverage.
      const d = await fixture({ approval: !(name === 'route approval requirement' && target === 'approval') });
      const old = d.lifecycle.subject_digest;
      if (name === 'route approval requirement' && target === 'approval') {
        d.bundle.routes[0].require_human_approval = true;
        d.lifecycle.events.push({ event_id: 'new-approval', phase: 'approval', actor_role_id: 'implementer', decision: 'approved', subject_digest: old });
      } else mutate(d);
      const current = await rebind(d);
      assert.notEqual(current, old, `${name} must affect G1 subject`);
      pass(await validate(d));
      if (target === 'top') d.lifecycle.subject_digest = old;
      else event(d, target).subject_digest = old;
      await bothFail(d);
      await rebind(d); pass(await validate(d));
    });
  }
}

const decisions = { review: ['pass', 'blocked'], approval: ['approved', 'denied'],
  execution: ['declared_success', 'declared_failure'], evidence: ['present', 'missing'] };
for (const phase of Object.keys(decisions)) {
  for (const decision of [...Object.values(decisions).flat().filter(x => !decisions[phase].includes(x)), 'unknown']) {
    test(`${phase} rejects decision ${decision}`, async () => {
      const d = await fixture(); event(d, phase).decision = decision;
      if (decision === 'unknown') fail(await describe(d));
      else { pass(await describe(d)); assert.equal((await describe(d)).lifecycle_matches_subject, false); }
      fail(await validate(d));
    });
  }
  for (const actor of ['alternate-executor', 'alternate-reviewer', 'unknown-role']) {
    test(`${phase} rejects actor outside phase route: ${actor}`, async () => {
      const d = await fixture(); event(d, phase).actor_role_id = actor;
      pass(await describe(d)); fail(await validate(d));
    });
  }
}
for (const [phase, actor] of [['review', 'implementer'], ['approval', 'reviewer'], ['execution', 'reviewer']]) {
  test(`${phase} rejects a participant routed for a different phase`, async () => {
    const d = await fixture(); event(d, phase).actor_role_id = actor;
    pass(await describe(d)); fail(await validate(d));
  });
}
test('event order carries no clock or state-machine requirement', async () => {
  const d = await fixture(); d.lifecycle.events.reverse(); pass(await describe(d)); pass(await validate(d));
});
test('a route with several reviewers requires at least one declaration', async () => {
  const d = await fixture(); d.bundle.routes[0].reviewers.push('alternate-reviewer');
  await rebind(d); pass(await validate(d));
  d.lifecycle.events = d.lifecycle.events.filter(e => e.phase !== 'review'); fail(await validate(d));
});
for (const phase of Object.keys(decisions)) test(`${phase} accepts each phase-specific declaration structurally`, async () => {
  const d = await fixture();
  for (const decision of decisions[phase]) { event(d, phase).decision = decision; pass(await describe(d)); }
});
for (const phase of ['review', 'approval']) test(`route requires ${phase} declaration`, async () => {
  const d = await fixture(); d.lifecycle.events = d.lifecycle.events.filter(e => e.phase !== phase);
  pass(await describe(d)); fail(await validate(d));
});
test('empty reviewer route fails closed without synthesized G1 approval', async () => {
  const d = await fixture({ approval: false });
  d.bundle.routes[0].reviewers = [];
  await bothFail(d);
  assert.ok((await validate(d)).errors.some(e => e.code === 'SCHEMA_MINITEMS'));
});
test('unrequired approval is rejected even with accountable actor', async () => {
  const d = await fixture({ approval: false });
  d.lifecycle.events.push({ event_id: 'unexpected-approval', phase: 'approval', actor_role_id: 'implementer', decision: 'approved', subject_digest: d.lifecycle.subject_digest });
  pass(await describe(d)); fail(await validate(d));
});
test('required approval must be exactly one even with different actors and IDs', async () => {
  const d = await fixture(); d.lifecycle.events.push({ ...event(d, 'approval'), event_id: 'second-approval', actor_role_id: 'alternate-executor' });
  fail(await validate(d));
});
test('execution is optional', async () => {
  const d = await fixture(); d.lifecycle.events = d.lifecycle.events.filter(e => e.phase !== 'execution');
  pass(await describe(d)); pass(await validate(d));
});
test('declared_failure is valid and never verified execution', async () => {
  const d = await fixture(); event(d, 'execution').decision = 'declared_failure';
  pass(await describe(d)); pass(await validate(d));
});
for (const actor of ['implementer', 'reviewer']) test(`evidence accepts routed participant ${actor}`, async () => {
  const d = await fixture(); event(d, 'evidence').actor_role_id = actor; pass(await validate(d));
});
for (const phase of Object.keys(decisions)) test(`duplicate actor+${phase} with distinct IDs fails`, async () => {
  const d = await fixture(); d.lifecycle.events.push({ ...clone(event(d, phase)), event_id: 'different-event' }); fail(await validate(d));
});
test('event IDs are globally unique across distinct actor/phase pairs', async () => {
  const d = await fixture(); event(d, 'evidence').event_id = event(d, 'review').event_id; await bothFail(d);
});

for (const [name, mutate] of [
  ['duplicate artifact within event', d => { event(d, 'review').artifacts.push(artifact()); }],
  ['conflicting artifact across events', d => { event(d, 'evidence').artifacts[0].sha256 = wrongDigest; }],
  ['uppercase digest', d => { event(d, 'review').artifacts[0].sha256 = 'sha256:' + 'A'.repeat(64); }],
  ['short digest', d => { event(d, 'review').artifacts[0].sha256 = 'sha256:abcd'; }],
  ['unprefixed digest', d => { event(d, 'review').artifacts[0].sha256 = 'a'.repeat(64); }],
  ['nonhex digest', d => { event(d, 'review').artifacts[0].sha256 = 'sha256:' + 'g'.repeat(64); }],
  ['artifact extra field', d => { event(d, 'review').artifacts[0].verified = true; }],
  ['event extra field', d => { event(d, 'review').authenticated = true; }],
  ['lifecycle extra field', d => { d.lifecycle.execution_authorized = true; }],
  ['empty events', d => { d.lifecycle.events = []; }],
  ['invalid phase', d => { event(d, 'review').phase = 'handoff'; }],
]) test(`describe and validate reject ${name}`, async () => {
  const d = await fixture(); mutate(d); await bothFail(d);
  if (name.includes('artifact') || name.includes('digest')) assert.equal((await describe(d)).artifact_identity_consistent, false);
});
test('same artifact ID and digest across events is allowed, independently of locator', async () => {
  const d = await fixture(); event(d, 'evidence').artifacts[0].locator = 'another/reference';
  pass(await describe(d)); pass(await validate(d));
});
test('artifact references and locators are optional', async () => {
  const d = await fixture(); delete event(d, 'review').artifacts;
  delete event(d, 'evidence').artifacts[0].locator; pass(await validate(d));
});
for (const field of ['run_id', 'event_id', 'artifact_id']) {
  for (const value of ['', 'has space', '../escape', 'bad\nidentifier', 42, null]) test(`invalid ${field}: ${json(value)}`, async () => {
    const d = await fixture();
    const target = field === 'run_id' ? d.lifecycle : field === 'event_id' ? event(d, 'review') : event(d, 'review').artifacts[0];
    target[field] = value; await bothFail(d);
  });
}

const duplicates = [
  ['bundle', '"policy_version":', '"policy_version":"shadow","policy_version":'],
  ['task', '"objective":', '"objective":"shadow","objective":'],
  ['action', '"kind":', '"kind":"shadow","kind":'],
  ['action', '"revision":1', '"revi\\u0073ion":2,"revision":1'],
  ['lifecycle', '"run_id":', '"run_id":"shadow","run_id":'],
  ['lifecycle', '"event_id":', '"event_id":"shadow","event_id":'],
  ['lifecycle', '"artifact_id":', '"artifact_id":"shadow","artifact_id":'],
  ['lifecycle', '"sha256":', `"sha256":"${wrongDigest}","sha256":`],
];
for (const [i, [field, needle, replacement]] of duplicates.entries()) test(`duplicate JSON keys: ${field}/${i}`, async () => {
  const d = await fixture(), input = args(d), index = fields.indexOf(field);
  input[index] = input[index].replace(needle, replacement);
  assert.notEqual(input[index], args(d)[index], 'injection must change raw JSON');
  fail(await describeTaskLifecycle(...input)); fail(await validateTaskLifecycle(...input));
});
for (const field of fields) for (const value of [9007199254740992, -9007199254740992]) test(`unsafe integer ${field}/${value}`, async () => {
  const d = await fixture();
  if (field === 'bundle') d.bundle.roles[0].contract.version = value;
  if (field === 'task') d.task.inputs.count = value;
  if (field === 'action') d.action.parameters.revision = value;
  if (field === 'lifecycle') d.lifecycle.run_id = value;
  await bothFail(d);
});
for (const api of [describeTaskLifecycle, validateTaskLifecycle]) for (const field of fields) {
  for (const kind of ['object', 'accessor']) test(`${api.name} rejects ${field} ${kind} without touching getters`, async () => {
    const d = await fixture(); let touches = 0;
    const hostile = {};
    const trap = () => { touches++; throw new Error('getter touched'); };
    for (const key of ['schema_version', 'toJSON', 'toString', 'valueOf', Symbol.toPrimitive]) Object.defineProperty(hostile, key, { get: trap, enumerable: true });
    const input = args(d); input[fields.indexOf(field)] = kind === 'object' ? d[field] : hostile;
    try { fail(await api(...input)); } finally { assert.equal(touches, 0); }
  });
}
function reverse(value) {
  if (Array.isArray(value)) return value.map(reverse);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(k => [k, reverse(value[k])])) : value;
}
for (const field of [...fields, 'all']) test(`key-order invariance: ${field}`, async () => {
  const d = await fixture(), before = await validate(d), beforeDescription = await describe(d);
  for (const key of field === 'all' ? fields : [field]) d[key] = reverse(d[key]);
  assert.deepEqual(await validate(d), before); assert.deepEqual(await describe(d), beforeDescription);
});
test('run correlation is downstream of G1 and never enforces replay', async () => {
  const d = await fixture(), subject = d.lifecycle.subject_digest;
  for (const run_id of ['run-2', 'external-run-3', 'run-1']) {
    d.lifecycle.run_id = run_id;
    assert.equal((await describeTaskAction(...args(d).slice(0, 3))).subject_digest, subject);
    pass(await describe(d)); pass(await validate(d));
    assert.equal(d.lifecycle.subject_digest, subject);
  }
});

test('lifecycle pure module contains no clock, process, filesystem, network or dynamic import', () => {
  const source = readFileSync(new URL('../src/task-lifecycle.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:Date|fetch|process|XMLHttpRequest|WebSocket)\b|\bimport\s*\(|(?:node:)?(?:fs|child_process|http|https|net|dns)(?:\/promises)?['"]|\b(?:readFile|writeFile|execSync|spawn)\s*\(/);
});
test('paths, URLs and command-like locators remain inert with global I/O tripwires', async () => {
  const d = await fixture();
  const locators = ['/private/tmp/g3-must-not-open', 'file:///etc/passwd', 'https://example.invalid/must-not-fetch',
    '$(touch /private/tmp/g3-must-not-execute)', 'node -e "throw Error()"'];
  event(d, 'evidence').artifacts = locators.map((locator, i) => ({ ...artifact(), artifact_id: `inert-${i}`, locator }));
  // Serialize before installing traps, preserve crypto for the required SHA-256.
  const input = args(d), saved = new Map(); let touches = 0;
  for (const key of ['Date', 'fetch', 'process', 'XMLHttpRequest', 'WebSocket']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, get() { touches++; throw new Error(`${key} used`); } });
  }
  let description, validation;
  try { description = await describeTaskLifecycle(...input); validation = await validateTaskLifecycle(...input); }
  finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
  assert.equal(touches, 0); pass(description); pass(validation);
});
