import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeTaskAction } from '../src/core.mjs';
import { validateFilesystemWriteMapping } from '../src/filesystem-write-adapter.mjs';

// Issue #16 integration contract: four JSON-text arguments (bundle, task,
// action, mapping), with the G1 0.3 subject and a strict single-write mapping.
// Deliberately no missing-module skip, fallback validator, or implementation helper.
const json = JSON.stringify;
const fields = ['bundle', 'task', 'action', 'mapping'];
const load = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const digest = 'sha256:' + 'a'.repeat(64); // A declaration, never a claim about actual bytes.
const falseClaims = [
  'adapter_authenticated', 'content_bytes_verified', 'filesystem_state_verified',
  'path_exists_verified', 'write_permission_enforced', 'action_executed',
  'replay_protection_enforced', 'execution_authorized', 'runtime_enforcement',
  'identity_verified', 'evidence_verified', 'subject_authenticated',
  'review_authenticated', 'human_approval_authenticated', 'source_files_checked',
  'sensitive_data_scanned', 'output_schema_validated',
];
function inert(result) {
  for (const key of falseClaims) assert.equal(result[key], false, `${key}: ${json(result)}`);
}
function pass(result) {
  assert.equal(result.valid, true, json(result.errors));
  assert.deepEqual(result.errors, []);
  inert(result);
}
function fail(result) {
  assert.equal(result.valid, false, json(result));
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'fail closed with diagnostics');
  inert(result);
}
const describe = d => describeTaskAction(...fields.slice(0, 3).map(key => json(d[key])));
const validate = d => validateFilesystemWriteMapping(...fields.map(key => json(d[key])));
async function refresh(d) {
  const result = await describe(d);
  assert.equal(result.valid, true, json(result.errors));
  assert.match(result.subject_digest, /^sha256:[0-9a-f]{64}$/);
  d.mapping.subject_digest = result.subject_digest;
  return result;
}
async function fixture(scope = 'src/example.mjs', path = 'src/example.mjs') {
  const d = { bundle: load('starter-bundle'), task: load('starter-task'),
    action: { schema_version: '0.3', id: 'filesystem-hardening', kind: 'filesystem-write',
      parameters: { path, content_sha256: digest } },
    mapping: { schema_version: '0.1', subject_digest: '', operation: 'write_file',
      path, content_sha256: digest } };
  d.task.inputs.scope = scope;
  await refresh(d);
  pass(await validate(d)); // Every adversarial case starts from a proven positive control.
  return d;
}

test('exact mapping PASS is consistency only, repeatable without filesystem permission or G1 approval', async () => {
  const d = await fixture(); // Starter route requires independent review AND human approval.
  assert.equal(d.bundle.routes[0].require_human_approval, true);
  const first = await validate(d);
  pass(first);
  assert.deepEqual(await validate(d), first);
  for (const key of ['binding', 'reviews', 'human_approval']) {
    assert.equal(Object.hasOwn(first, key), false, `must not synthesize ${key}`);
  }
});

for (const [name, mutate] of [
  ['policy version', d => { d.bundle.policy_version += '-changed'; }],
  ['policy capability', d => { d.bundle.policy.capabilities.push('artifact.publish'); }],
  ['knowledge', d => { d.bundle.knowledge.push({ id: 'reference', uri: 'https://example.invalid/reference' }); }],
  ['role mission', d => { d.bundle.roles[0].contract.mission.objective += ' Changed.'; }],
  ['role body', d => { d.bundle.roles[0].body += '\nChanged declaration.'; }],
  ['role authority', d => { d.bundle.roles[0].contract.authority.allowed_write_scopes.push('tests/**'); }],
  ['route approval', d => { d.bundle.routes[0].require_human_approval = false; }],
  ['task id', d => { d.task.id += '-changed'; }],
  ['task objective', d => { d.task.objective += ' Changed.'; }],
  ['task input', d => { d.task.inputs.scope = 'src/**'; }],
  ['task acceptance', d => { d.task.acceptance_criteria.push('Explain the change.'); }],
  ['action id', d => { d.action.id += '-changed'; }],
  ['action digest', d => { d.action.parameters.content_sha256 = 'sha256:' + 'b'.repeat(64); d.mapping.content_sha256 = 'sha256:' + 'b'.repeat(64); }],
]) test(`stale mapping subject fails after ${name}; current subject restores PASS`, async () => {
  const d = await fixture(), old = d.mapping.subject_digest;
  mutate(d);
  const current = await describe(d);
  assert.equal(current.valid, true, json(current.errors));
  assert.notEqual(current.subject_digest, old);
  fail(await validate(d));
  d.mapping.subject_digest = current.subject_digest;
  pass(await validate(d));
});
test('changing both action and mapping path still requires a fresh subject', async () => {
  const d = await fixture('src/**');
  d.action.parameters.path = d.mapping.path = 'src/another.mjs';
  fail(await validate(d));
  await refresh(d);
  pass(await validate(d));
});
for (const kind of ['propose-change', 'delete', 'move', 'symlink']) test(`fresh G1 subject cannot authorize action kind ${kind}`, async () => {
  const d = await fixture(), old = d.mapping.subject_digest; d.action.kind = kind;
  fail(await validate(d));
  await refresh(d);
  assert.notEqual(d.mapping.subject_digest, old);
  fail(await validate(d));
});
for (const subject of ['sha256:' + '0'.repeat(64), '', 'sha256:' + 'A'.repeat(64), digest, null]) {
  test(`mapping requires exact canonical current subject: ${json(subject)}`, async () => {
    const d = await fixture(); d.mapping.subject_digest = subject; fail(await validate(d));
  });
}
for (const key of ['path', 'content_sha256']) test(`mapping ${key} must exactly match action`, async () => {
  const d = await fixture('src/**');
  d.mapping[key] = key === 'path' ? 'src/another.mjs' : 'sha256:' + 'b'.repeat(64);
  fail(await validate(d));
});
for (const key of ['shell', 'command', 'url', 'mode', 'delete', 'chmod', 'symlink', 'overwrite', 'provider']) {
  test(`fresh subject rejects extra action parameter ${key}`, async () => {
    const d = await fixture(); d.action.parameters[key] = 'declared-value';
    await refresh(d); fail(await validate(d));
  });
}
for (const key of ['path', 'content_sha256']) test(`missing action parameter ${key} fails`, async () => {
  const d = await fixture(); delete d.action.parameters[key];
  await refresh(d); fail(await validate(d));
});
for (const operation of ['unknown', 'batch', 'delete', 'delete_file', 'move', 'move_file', 'symlink', 'writeFile', 'WRITE_FILE']) {
  test(`mapping rejects operation ${operation}`, async () => {
    const d = await fixture(); d.mapping.operation = operation; fail(await validate(d));
  });
}
for (const [key, value] of Object.entries({ extra: true, shell: 'sh', command: 'echo', url: 'https://example.invalid',
  mode: '0777', delete: true, chmod: true, symlink: 'src/target', overwrite: true, provider: 'local',
  operations: [], paths: ['src/example.mjs'], destination: 'src/other', content: 'bytes',
  execution_authorized: true, binding: {}, reviews: [], human_approval: {} })) {
  test(`mapping rejects extra field ${key}`, async () => {
    const d = await fixture(); d.mapping[key] = value; fail(await validate(d));
  });
}
for (const key of ['schema_version', 'subject_digest', 'operation', 'path', 'content_sha256']) {
  test(`mapping requires ${key}`, async () => {
    const d = await fixture(); delete d.mapping[key]; fail(await validate(d));
  });
}
for (const path of ['../escape', 'src/../escape', '/src/example.mjs', './src/example.mjs', 'src/./example.mjs',
  'src//example.mjs', 'src/example.mjs/', 'src\\example.mjs', 'src/..\\escape', 'C:/src/example.mjs',
  'C:example.mjs', '\\\\server\\share', 'src/CON', 'src/NUL.txt', 'src/file:stream',
  'src/trailing.', 'src/trailing ', 'src/a\u0000b', 'src/a\nb', '', '.', '..']) {
  test(`nonportable path rejects even when action and mapping agree: ${json(path)}`, async () => {
    const d = await fixture('src/**');
    d.action.parameters.path = d.mapping.path = path;
    await refresh(d); fail(await validate(d));
  });
}
for (const [scope, path] of [['src/example.mjs', 'src/another.mjs'], ['src/example.mjs', 'src/example.mjs/child'],
  ['src/lib/**', 'src/library/file.mjs'], ['src/lib/**', 'src/lib-other/file.mjs'], ['src/lib/**', 'tests/file.mjs']]) {
  test(`task scope ${scope} rejects ${path} despite matching action/mapping`, async () => {
    const inside = scope === 'src/example.mjs' ? scope : 'src/lib/file.mjs';
    const d = await fixture(scope, inside);
    d.action.parameters.path = d.mapping.path = path;
    await refresh(d); fail(await validate(d));
  });
}
test('subtree scope accepts nested portable path', async () => {
  pass(await validate(await fixture('src/lib/**', 'src/lib/nested/file.mjs')));
});
for (const [name, mutate] of [
  ['read only executor', d => { const a = d.bundle.roles[0].contract.authority; a.authority_mode = 'read_only'; a.capabilities = ['filesystem.read']; a.allowed_write_scopes = []; }],
  ['missing scoped capability', d => { d.bundle.roles[0].contract.authority.capabilities = []; }],
  ['role scope mismatch', d => { d.bundle.roles[0].contract.authority.allowed_write_scopes = ['tests/**']; }],
  ['inactive executor', d => { d.bundle.roles[0].contract.status = 'dormant'; }],
  ['no executors', d => { d.bundle.routes[0].executors = []; }],
  ['only routed reader', d => { d.bundle.routes[0].executors = ['reviewer']; d.bundle.routes[0].reviewers = []; }],
]) test(`executor denial survives matching fields: ${name}`, async () => {
  const d = await fixture(); mutate(d);
  // G1 may itself reject the declaration. If valid, remove stale-digest rejection
  // as a confounder; the adapter must still reject the current executor authority.
  const current = await describe(d);
  if (current.valid) d.mapping.subject_digest = current.subject_digest;
  fail(await validate(d));
});
for (const value of ['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64),
  'sha256:' + digest, digest + '\n', 42, null]) {
  test(`malformed content digest rejects: ${json(value)}`, async () => {
    const d = await fixture();
    d.action.parameters.content_sha256 = d.mapping.content_sha256 = value;
    await refresh(d); fail(await validate(d));
  });
}
for (const key of ['path', 'content_sha256']) for (const value of [9007199254740992, -9007199254740992, {}, []]) {
  test(`G1 rejects ${key} unsafe/nested value ${json(value)}`, async () => {
    const d = await fixture(); d.action.parameters[key] = value;
    const subject = await describe(d);
    assert.equal(subject.valid, false, json(subject));
    assert.ok(subject.errors.length > 0);
    fail(await validate(d));
  });
}

for (const [field, key] of [['bundle', 'policy_version'], ['task', 'objective'], ['action', 'kind'],
  ['action', 'path'], ['mapping', 'operation'], ['mapping', 'path'], ['mapping', 'subject_digest']]) {
  for (const escaped of [false, true]) test(`duplicate ${field}.${key} fails closed (escaped=${escaped})`, async () => {
    const d = await fixture(), args = fields.map(f => json(d[f])), index = fields.indexOf(field);
    const spelling = escaped ? `\\u${key.charCodeAt(0).toString(16).padStart(4, '0')}${key.slice(1)}` : key;
    const original = args[index];
    args[index] = original.replace(`"${key}":`, `"${spelling}":"shadow","${key}":`);
    assert.notEqual(args[index], original);
    fail(await validateFilesystemWriteMapping(...args));
    if (field !== 'mapping') assert.equal((await describeTaskAction(...args.slice(0, 3))).valid, false);
  });
}
for (const field of fields) for (const kind of ['object', 'accessors', 'array', 'null', 'number']) {
  test(`non-string ${field} ${kind} rejected before touching executable properties`, async () => {
    const d = await fixture(), args = fields.map(f => json(d[f]));
    let touches = 0;
    const hostile = {};
    const tripwire = () => { touches++; throw Error('getter executed'); };
    for (const key of ['schema_version', 'path', 'toJSON', 'toString', 'valueOf']) {
      Object.defineProperty(hostile, key, { enumerable: true, get: tripwire });
    }
    Object.defineProperty(hostile, Symbol.toPrimitive, { get: tripwire });
    args[fields.indexOf(field)] = { object: d[field], accessors: hostile, array: [], null: null, number: 1 }[kind];
    try { fail(await validateFilesystemWriteMapping(...args)); }
    finally { assert.equal(touches, 0); }
  });
}
function reverse(value) {
  if (Array.isArray(value)) return value.map(reverse);
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reverse(v)])) : value;
}
test('reordered JSON keys preserve complete G1 subject and adapter result', async () => {
  const d = await fixture(), reordered = reverse(d);
  assert.equal((await describe(d)).subject_digest, (await describe(reordered)).subject_digest);
  const first = await validate(d), second = await validate(reordered);
  pass(first); pass(second); assert.deepEqual(second, first);
});
test('arbitrary declared bytes/path do not inspect filesystem, clock, network or process', async t => {
  const d = await fixture('src/**', 'src/never-created-g2-hardening/file.mjs');
  d.action.parameters.content_sha256 = d.mapping.content_sha256 = 'sha256:' + '0'.repeat(64);
  await refresh(d);
  // Read source BEFORE traps. Conservative pure-module guard also rejects static
  // Node I/O imports, dynamic imports and indirect process access in this module.
  const source = readFileSync(new URL('../src/filesystem-write-adapter.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:|\bimport\s*\(|\brequire\s*\(|\bprocess\b|\bDate\b|\bfetch\s*\(/);
  const names = ['Date', 'fetch', 'process', 'XMLHttpRequest', 'WebSocket'];
  const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  let touches = 0;
  const restore = () => { for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  } };
  t.after(restore);
  let result;
  try {
    for (const name of names) Object.defineProperty(globalThis, name, {
      configurable: true, get() { touches++; throw Error(`implicit ${name}`); },
    });
    result = await validate(d);
  } finally { restore(); }
  assert.equal(touches, 0);
  pass(result); // Nonexistent path and unverified digest can match declarations.
});
