import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeTaskAction, validateTaskActionBinding } from '@netsujo/agent-role-contracts/core';

// Issue #14: new action/binding declarations are 0.3; existing bundle/task
// declarations retain their own schema version. No implementation helpers used.
const json = JSON.stringify;
const clone = value => structuredClone(value);
const load = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const claims = ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified'];
const bindingClaims = ['subject_authenticated', 'review_authenticated', 'human_approval_authenticated',
  'action_executed', 'replay_protection_enforced'];

function inert(result, binding = false) {
  for (const key of [...claims, ...(binding ? bindingClaims : [])]) {
    assert.equal(result[key], false, `${key}: ${json(result)}`);
  }
}
function pass(result, binding = false) {
  assert.equal(result.valid, true, json(result.errors));
  assert.deepEqual(result.errors, []);
  inert(result, binding);
}
function fail(result, binding = false) {
  assert.equal(result.valid, false, json(result));
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'rejection must have diagnostics');
  inert(result, binding);
}
const describe = d => describeTaskAction(json(d.bundle), json(d.task), json(d.action));
const validate = (d, binding = d.binding) => validateTaskActionBinding(
  json(d.bundle), json(d.task), json(d.action), json(binding));

async function fixture(humanApproval = true) {
  const bundle = load('starter-bundle');
  const task = load('starter-task');
  // A second valid independent reviewer makes route changes distinguishable
  // from invalid role references and supplies a declared-but-unrouted outsider.
  const alternate = clone(bundle.roles[1]);
  alternate.contract.id = 'alternate-reviewer';
  bundle.roles.push(alternate);
  bundle.routes[0].require_human_approval = humanApproval;
  const action = { schema_version: '0.3', id: 'hardening-action', kind: 'propose-change',
    parameters: { target: 'src/example.mjs', revision: 1, dry_run: true, note: null } };
  const d = { bundle, task, action };
  const subject = await describe(d);
  pass(subject);
  assert.equal(subject.binding_profile, 'task-action/0.3');
  assert.match(subject.subject_digest, /^sha256:[0-9a-f]{64}$/);
  d.binding = { schema_version: '0.3', subject_digest: subject.subject_digest,
    reviews: [{ subject_digest: subject.subject_digest, role_id: 'reviewer', decision: 'pass' }] };
  if (humanApproval) d.binding.human_approval = {
    subject_digest: subject.subject_digest, role_id: 'implementer', decision: 'approved' };
  pass(await validate(d), true);
  return d;
}

const changes = [
  ['policy version', d => { d.bundle.policy_version = 'example-v2'; }],
  ['policy capability', d => { d.bundle.policy.capabilities.push('artifact.publish'); }],
  ['role authority', d => { d.bundle.roles[0].contract.authority.allowed_write_scopes.push('tests/**'); }],
  ['route reviewer', d => { d.bundle.routes[0].reviewers = ['alternate-reviewer']; }],
  ['task objective', d => { d.task.objective += ' Include a rationale.'; }],
  ['task inputs', d => { d.task.inputs.scope = 'src/another.mjs'; }],
  ['task acceptance', d => { d.task.acceptance_criteria.push('Explain the proposed change.'); }],
  ['action kind', d => { d.action.kind = 'publish-artifact'; }],
  ['action parameters', d => { d.action.parameters.revision = 2; }],
  ['role body', d => { d.bundle.roles[0].body += '\nAdditional declaration.\n'; }],
  ['knowledge', d => { d.bundle.knowledge.push({ id: 'reference', uri: 'https://example.invalid/reference' }); }],
  ['task id', d => { d.task.id = 'another-task'; }],
  ['action id', d => { d.action.id = 'another-action'; }],
];
for (const [name, change] of changes) test(`stale binding fails after ${name} changes`, async () => {
  const d = await fixture();
  const oldDigest = d.binding.subject_digest;
  change(d);
  const current = await describe(d);
  pass(current);
  assert.notEqual(current.subject_digest, oldDigest, `${name} must be part of the subject`);
  // Refresh review/approval declarations (and changed route), leaving ONLY the
  // top-level digest stale. Rejection cannot be credited to stale evidence.
  for (const review of d.binding.reviews) {
    review.subject_digest = current.subject_digest;
    review.role_id = d.bundle.routes[0].reviewers[0];
  }
  d.binding.human_approval.subject_digest = current.subject_digest;
  fail(await validate(d), true);
  d.binding.subject_digest = current.subject_digest;
  pass(await validate(d), true);
});

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])]));
  return value;
}
for (const name of ['bundle', 'task', 'action', 'all']) test(`JSON key order is invariant: ${name}`, async () => {
  const d = await fixture();
  const original = d.binding.subject_digest;
  for (const key of name === 'all' ? ['bundle', 'task', 'action'] : [name]) d[key] = reverseKeys(d[key]);
  const result = await describe(d);
  pass(result);
  assert.equal(result.subject_digest, original);
  pass(await validate(d, reverseKeys(d.binding)), true);
});

const wrongDigest = 'sha256:' + '0'.repeat(64);
const badReviews = [
  ['wrong subject', b => { b.reviews[0].subject_digest = wrongDigest; }],
  ['declared outsider', b => { b.reviews[0].role_id = 'alternate-reviewer'; }],
  ['unknown outsider', b => { b.reviews[0].role_id = 'unknown-reviewer'; }],
  ['blocked', b => { b.reviews[0].decision = 'blocked'; }],
  ['missing review', b => { b.reviews = []; }],
  ['extra outsider after valid review', b => { b.reviews.push({ ...b.reviews[0], role_id: 'alternate-reviewer' }); }],
];
for (const [name, mutate] of badReviews) test(`review rejects ${name}`, async () => {
  const d = await fixture();
  mutate(d.binding);
  fail(await validate(d), true);
});
for (const decisions of [['pass', 'blocked'], ['blocked', 'pass'], ['pass', 'pass']]) {
  test(`duplicate reviewer is rejected in order ${decisions.join('/')}`, async () => {
    const d = await fixture();
    d.binding.reviews = decisions.map(decision => ({ ...d.binding.reviews[0], decision }));
    fail(await validate(d), true);
  });
}
for (const blockedRole of ['reviewer', 'alternate-reviewer']) {
  test(`one blocked routed review defeats another PASS: ${blockedRole}`, async () => {
    const d = await fixture();
    d.bundle.routes[0].reviewers.push('alternate-reviewer');
    const subject = await describe(d);
    pass(subject);
    d.binding.subject_digest = subject.subject_digest;
    d.binding.human_approval.subject_digest = subject.subject_digest;
    d.binding.reviews = d.bundle.routes[0].reviewers.map(role_id => ({
      subject_digest: subject.subject_digest, role_id, decision: 'pass' }));
    pass(await validate(d), true);
    d.binding.reviews.find(review => review.role_id === blockedRole).decision = 'blocked';
    fail(await validate(d), true);
  });
}
const badApprovals = [
  ['missing', b => { delete b.human_approval; }],
  ['wrong subject', b => { b.human_approval.subject_digest = wrongDigest; }],
  ['wrong accountable role', b => { b.human_approval.role_id = 'reviewer'; }],
  ['denied', b => { b.human_approval.decision = 'denied'; }],
];
for (const [name, mutate] of badApprovals) test(`required human approval rejects ${name}`, async () => {
  const d = await fixture();
  mutate(d.binding);
  fail(await validate(d), true);
});
test('unexpected human approval fails when route does not require it', async () => {
  const d = await fixture(false);
  d.binding.human_approval = { subject_digest: d.binding.subject_digest,
    role_id: 'implementer', decision: 'approved' };
  fail(await validate(d), true);
});

for (const [name, mutate] of [
  ['extra action field', d => { d.action.execution_authorized = true; }],
  ['nested parameter object', d => { d.action.parameters.target = { path: 'src/example.mjs' }; }],
  ['parameter array', d => { d.action.parameters.target = ['src/example.mjs']; }],
  ['parameters as array', d => { d.action.parameters = []; }],
  ['unsafe positive integer', d => { d.action.parameters.revision = 9007199254740992; }],
  ['unsafe negative integer', d => { d.action.parameters.revision = -9007199254740992; }],
]) test(`action rejects ${name} in both APIs`, async () => {
  const d = await fixture();
  mutate(d);
  fail(await describe(d));
  fail(await validate(d), true);
});
for (const [name, mutate] of [
  ['extra binding field', b => { b.action_executed = true; }],
  ['extra review field', b => { b.reviews[0].identity_verified = true; }],
  ['extra approval field', b => { b.human_approval.authenticated = true; }],
]) test(`binding rejects ${name}`, async () => {
  const d = await fixture();
  mutate(d.binding);
  fail(await validate(d), true);
});

// Inject raw duplicates rather than JSON.stringify, which would erase them.
for (const [caseNumber, [field, injectDuplicate]] of [
  ['bundle', text => text.replace('"policy_version":', '"policy_version":"shadow-policy","policy_version":')],
  ['task', text => text.replace('"objective":', '"objective":"shadow objective","objective":')],
  ['action', text => text.replace('"kind":', '"kind":"shadow-kind","kind":')],
  ['action', text => text.replace('"revision":1', '"revision":2,"revision":1')],
  ['action', text => text.replace('"revision":1', '"revi\\u0073ion":2,"revision":1')],
  ['binding', text => text.replace('"subject_digest":', `"subject_digest":"${wrongDigest}","subject_digest":`)],
  ['binding', text => text.replace('"decision":"pass"', '"decision":"blocked","decision":"pass"')],
  ['binding', text => text.replace('"decision":"approved"', '"decision":"denied","decision":"approved"')],
].entries()) {
  test(`duplicate JSON keys fail closed: ${field} case ${caseNumber}`, async () => {
    const d = await fixture();
    const args = ['bundle', 'task', 'action', 'binding'].map(key => json(d[key]));
    const index = ['bundle', 'task', 'action', 'binding'].indexOf(field);
    const original = args[index];
    args[index] = injectDuplicate(original);
    assert.notEqual(args[index], original, 'duplicate injection must actually alter input');
    if (field !== 'binding') fail(await describeTaskAction(...args.slice(0, 3)));
    fail(await validateTaskActionBinding(...args), true);
  });
}

for (const api of ['describe', 'validate']) {
  for (const field of api === 'describe' ? ['bundle', 'task', 'action'] : ['bundle', 'task', 'action', 'binding']) {
    for (const inputKind of ['plain object', 'accessor object']) {
      test(`${api} rejects non-string ${field} ${inputKind} without executing accessors`, async () => {
        const d = await fixture();
        let touches = 0;
        const hostile = {};
        const tripwire = () => { touches++; throw new Error('input accessor executed'); };
        for (const key of ['schema_version', 'toJSON', 'toString', 'valueOf']) {
          Object.defineProperty(hostile, key, { enumerable: true, get: tripwire });
        }
        Object.defineProperty(hostile, Symbol.toPrimitive, { get: tripwire });
        const fields = api === 'describe' ? ['bundle', 'task', 'action'] : ['bundle', 'task', 'action', 'binding'];
        const args = fields.map(key => key === field ? (inputKind === 'plain object' ? d[key] : hostile) : json(d[key]));
        try {
          const result = await (api === 'describe' ? describeTaskAction : validateTaskActionBinding)(...args);
          fail(result, api === 'validate');
        } finally {
          assert.equal(touches, 0, 'rejection must precede coercion, serialization or property access');
        }
      });
    }
  }
}

test('arbitrary scalar targets/resources bind declarations without granting authority', async () => {
  const d = await fixture();
  d.action.kind = 'arbitrary-external-operation';
  d.action.parameters = { target: '/outside/declared/scope', resource: 'unrecognized:resource',
    capability: 'not-in-policy', endpoint: 'https://example.invalid/external',
    execution_authorized: true, identity_verified: true, count: Number.MAX_SAFE_INTEGER,
    negative: Number.MIN_SAFE_INTEGER, ratio: 0.5, optional: null };
  const result = await describe(d);
  pass(result);
  assert.notEqual(result.subject_digest, d.binding.subject_digest);
  d.binding.subject_digest = result.subject_digest;
  d.binding.reviews[0].subject_digest = result.subject_digest;
  d.binding.human_approval.subject_digest = result.subject_digest;
  pass(await validate(d), true);
});

test('PASS is repeatable integrity binding and does not claim replay protection', async () => {
  const d = await fixture();
  const first = await validate(d);
  const second = await validate(d);
  pass(first, true);
  pass(second, true);
  assert.deepEqual(second, first);
});
