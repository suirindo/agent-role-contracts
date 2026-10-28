import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import * as approval from '../experiments/task-approval/approval.mjs';
import { describeApprovalSubject, verifyTaskApprovalReceipt, bindingDigest, contextDigest } from '../experiments/task-approval/approval.mjs';
import { scenario, render, NOW } from '../experiments/task-approval/fixtures.mjs';
import { describeEffectRequest } from '../experiments/cross-tool-effects/policy.mjs';
const j = JSON.stringify;
const FLAGS = ['execution_authorized', 'runtime_enforcement', 'action_executed', 'replay_protection_enforced', 'actor_authenticated', 'reviewer_authenticated', 'source_bytes_observed'];
const codes = r => r.diagnostics.map(d => d.code);
function check(r, result, code) {
 assert.equal(r.result, result, j(r));
 if (code) assert.ok(codes(r).includes(code), j(r));
 for (const k of FLAGS) assert.equal(r[k], false, k);
 assert.equal(r.authority_status, 'UNKNOWN');
 assert.equal(r.execution_status, 'NOT_PERFORMED');
 assert.equal(r.receipt_signature_verified, result === 'VERIFIED_RECEIPT');
 return r;
}
/** Mutate the scenario parts, render (signing the payload as it then stands) and verify. */
async function run(mutate = () => {}, post = () => {}, prepare) {
 const s = await scenario(prepare);
 mutate(s);
 const input = render(s);
 post(input, s);
 return verifyTaskApprovalReceipt(input);
}
const edit = (input, key, fn) => { const v = JSON.parse(input[key]); fn(v); input[key] = j(v); };

test('legitimate ephemeral Ed25519 receipt verifies; limits stay false', async () => {
 const r = check(await run(), 'VERIFIED_RECEIPT');
 assert.equal(r.d1_policy_result, 'ALLOW');
 assert.equal(r.d1_binding_status, 'CONSISTENT');
 assert.deepEqual(r.diagnostics, []);
});
test('key order and whitespace do not matter; repeated verification is NOT replay protection', async () => {
 const s = await scenario(), input = render(s);
 const reordered = { ...input, receiptJson: ' ' + j((v => ({ signature: v.signature, payload: Object.fromEntries(Object.entries(v.payload).reverse()), profile: v.profile, version: v.version }))(JSON.parse(input.receiptJson))) };
 const [a, b, c] = [await verifyTaskApprovalReceipt(input), await verifyTaskApprovalReceipt(input), await verifyTaskApprovalReceipt(reordered)];
 for (const r of [a, b, c]) check(r, 'VERIFIED_RECEIPT');
 assert.deepEqual(a, b);
 assert.equal(b.replay_protection_enforced, false);
});
test('describeApprovalSubject returns bindable digests, creates nothing', async () => {
 const s = await scenario(), input = render(s);
 const d = await describeApprovalSubject(input);
 assert.equal(d.result, 'DESCRIBED');
 assert.equal(d.subject_digest, s.payload.subject_digest);
 assert.equal(d.binding_digest, bindingDigest(s.binding));
 assert.equal(d.context_digest, contextDigest(s.context));
 assert.equal(d.accountable_role, 'implementer');
 for (const k of FLAGS) assert.equal(d[k], false);
 assert.equal(Object.hasOwn(d, 'signature'), false);
 assert.equal((await describeApprovalSubject({ ...input, trusted: true })).result, 'REJECT_INPUT');
});
test('mutated receipt value or signature is invalid', async () => {
 const wrongSig = await run(() => {}, i => edit(i, 'receiptJson', v => { v.signature = Buffer.alloc(64, 7).toString('base64'); }));
 check(wrongSig, 'DENY', 'ATR_SIGNATURE_INVALID');
 const other = generateKeyPairSync('ed25519').privateKey;
 check(await run(s => { s.privateKey = other; }), 'DENY', 'ATR_SIGNATURE_INVALID');
 check(await run(() => {}, i => edit(i, 'receiptJson', v => { v.payload.expires_at_ms += 1; })), 'DENY', 'ATR_SIGNATURE_INVALID');
 check(await run(() => {}, i => edit(i, 'receiptJson', v => { v.payload.receipt_id = 'receipt-2'; })), 'DENY', 'ATR_SIGNATURE_INVALID');
});
for (const [name, mutate, code] of [
 ['unknown issuer', s => { s.payload.issuer_id = 'other-issuer'; }, 'ATR_ISSUER_UNKNOWN'],
 ['unknown key', s => { s.payload.key_id = 'key-9'; }, 'ATR_ISSUER_UNKNOWN'],
 ['disabled key', s => { s.registry.keys[0].status = 'disabled'; }, 'ATR_KEY_NOT_ACTIVE'],
 ['revoked key', s => { s.registry.keys[0].status = 'revoked'; }, 'ATR_KEY_NOT_ACTIVE'],
 ['wrong approver role scope', s => { s.registry.keys[0].approver_role = 'reviewer'; }, 'ATR_ISSUER_SCOPE'],
 ['wrong task scope', s => { s.registry.keys[0].task_id = 'other-task'; }, 'ATR_ISSUER_SCOPE'],
 ['wrong tenant scope', s => { s.registry.keys[0].tenant = 'tenant-2'; }, 'ATR_ISSUER_SCOPE'],
 ['wrong harness scope', s => { s.registry.keys[0].harness_id = 'other-harness'; }, 'ATR_ISSUER_SCOPE'],
 ['stale pending request id', s => { s.context.request_id = 'pending-2'; }, 'ATR_CONTEXT_MISMATCH'],
 ['stale pending request revision', s => { s.context.request_revision = 2; }, 'ATR_CONTEXT_MISMATCH'],
 ['foreign actor principal', s => { s.context.actor_principal = 'other-agent'; }, 'ATR_CONTEXT_MISMATCH'],
 ['harness id', s => { s.context.harness_id = 'other-harness'; }, 'ATR_CONTEXT_MISMATCH'],
 ['harness revision', s => { s.context.harness_revision = 2; }, 'ATR_CONTEXT_MISMATCH'],
 ['policy epoch', s => { s.context.policy_epoch = 2; }, 'ATR_CONTEXT_MISMATCH'],
 ['actor role outside route', s => { s.context.actor_role = 'reviewer'; }, 'ATR_CONTEXT_CONFLICT'],
 ['context run', s => { s.context.run_id = 'run-2'; }, 'ATR_CONTEXT_CONFLICT'],
 ['context session', s => { s.context.session_id = 'session-2'; }, 'ATR_CONTEXT_CONFLICT'],
 ['context tenant', s => { s.context.tenant = 'tenant-2'; }, 'ATR_CONTEXT_CONFLICT'],
 ['context task', s => { s.context.task_id = 'other-task'; }, 'ATR_CONTEXT_CONFLICT'],
 ['context expected subject stale', s => { s.context.expected_subject_digest = 'sha256:' + 'c'.repeat(64); }, 'ATR_SUBJECT_STALE'],
 ['registry epoch (registry changed)', s => { s.registry.epoch = 2; }, 'ATR_EPOCH_MISMATCH'],
 ['context registry epoch', s => { s.context.registry_epoch = 2; }, 'ATR_EPOCH_MISMATCH'],
 ['receipt registry epoch', s => { s.payload.registry_epoch = 2; }, 'ATR_EPOCH_MISMATCH'],
 ['receipt subject digest', s => { s.payload.subject_digest = 'sha256:' + 'c'.repeat(64); }, 'ATR_SUBJECT_MISMATCH'],
 ['receipt binding digest', s => { s.payload.binding_digest = 'sha256:' + 'c'.repeat(64); }, 'ATR_BINDING_MISMATCH'],
 ['receipt context digest', s => { s.payload.context_digest = 'sha256:' + 'c'.repeat(64); }, 'ATR_CONTEXT_MISMATCH'],
 ['expired at exactly expiry', s => { s.context.evaluated_at_ms = s.payload.expires_at_ms; }, 'ATR_EXPIRED'],
 ['future issuance', s => { s.payload.issued_at_ms = NOW + 1; }, 'ATR_NOT_YET_VALID'],
 ['reversed interval', s => { [s.payload.issued_at_ms, s.payload.expires_at_ms] = [NOW + 10, NOW - 10]; }, 'ATR_TIME_INVALID'],
 ['empty interval', s => { s.payload.expires_at_ms = s.payload.issued_at_ms; }, 'ATR_TIME_INVALID'],
 ['excess ttl', s => { s.payload.expires_at_ms = s.payload.issued_at_ms + 600001; }, 'ATR_TTL_EXCEEDED'],
]) test('DENY ' + name, async () => check(await run(mutate), 'DENY', code));

test('context digest excludes only verifier time: later evaluated_at inside the interval still verifies', async () => {
 check(await run(s => { s.context.evaluated_at_ms = NOW + 30000; }), 'VERIFIED_RECEIPT');
});
for (const [name, mutate, code] of [
 ['subject: content digest', f => { f.request.content_sha256 = 'sha256:' + 'c'.repeat(64); }, 'CTE_BINDING_STALE'],
 ['destination', f => { f.request.destination_ref = 'lab.other'; }, 'CTE_DESTINATION_NOT_ALLOWED'],
 ['tool digest', f => { f.request.tool_definition_digest = 'sha256:' + 'c'.repeat(64); }, 'CTE_BINDING_STALE'],
 ['adapter digest', f => { f.request.adapter_digest = 'sha256:' + 'c'.repeat(64); }, 'CTE_BINDING_STALE'],
 ['byte length', f => { f.request.byte_length = 13; }, 'CTE_BINDING_STALE'],
 ['task', f => { f.task.objective += ' changed'; }, 'CTE_BINDING_STALE'],
 ['contract revision', f => { f.contract.revision = 2; }, 'CTE_BINDING_STALE'],
 ['known D1 deny: effect not declared', f => { f.contract.allowed_effects = ['filesystem.read']; }, 'CTE_EFFECT_NOT_DECLARED'],
]) test('D1 DENY retained, valid signature never overrides: ' + name, async () => {
 const s = await scenario();
 mutate(s.f);   // the receipt, context and G1 binding still describe the OLD subject
 const r = check(await verifyTaskApprovalReceipt(render(s)), 'DENY', 'ATR_D1_DENY');
 assert.ok(codes(r).includes(code), j(r));
 assert.equal(r.d1_policy_result, 'DENY');
});
test('G1 binding mutation: binding bytes changed after signing', async () => {
 const r = await run(() => {}, i => edit(i, 'bindingJson', b => { b.reviews[0].decision = 'fail'; }));
 check(r, 'DENY', 'ATR_D1_DENY');
});
test('missing registry/context/receipt is UNKNOWN, never verified', async () => {
 for (const key of ['registryJson', 'contextJson', 'receiptJson']) {
  const r = await run(() => {}, i => { delete i[key]; });
  check(r, 'UNKNOWN', 'ATR_' + key.replace('Json', '').toUpperCase() + '_MISSING');
 }
 check(await run(() => {}, i => { delete i.registryJson; delete i.contextJson; delete i.receiptJson; }), 'UNKNOWN');
});
test('missing G1 binding and incomplete provenance are UNKNOWN; known D1 deny is kept', async () => {
 check(await run(() => {}, i => { delete i.bindingJson; }), 'UNKNOWN', 'ATR_D1_NOT_ALLOWED');
 const unknown = await run(() => {}, () => {}, f => { f.provenance.complete = false; });
 check(unknown, 'UNKNOWN', 'CTE_PROVENANCE_INCOMPLETE');
 assert.equal(unknown.d1_policy_result, 'UNKNOWN');
 const denied = await run(() => {}, () => {}, f => { f.provenance.complete = false; f.contract.allowed_effects = []; });
 check(denied, 'DENY', 'ATR_D1_DENY');
 assert.ok(codes(denied).includes('CTE_PROVENANCE_INCOMPLETE'));
 check(await run(s => { s.f.contract.allowed_effects = []; }, i => { delete i.receiptJson; }), 'DENY', 'ATR_D1_DENY');
});
test('registry rejections: non-Ed25519, malformed, duplicate and oversize registries', async () => {
 const rsa = generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
 const ed = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
 const key = (s, patch) => ({ ...s.registry.keys[0], ...patch });
 for (const mutate of [
  s => { s.registry.keys[0].public_key = rsa; },
  s => { s.registry.keys[0].public_key = 'AAAA'; },
  s => { s.registry.keys[0].public_key = s.registry.keys[0].public_key.replace(/=$/, ''); },
  s => { s.registry.keys.push(key(s, { issuer_id: 'second', public_key: ed })); },                       // duplicate key_id
  s => { s.registry.keys.push(key(s, { key_id: 'key-2', issuer_id: 'second' })); },                       // duplicate key material
  s => { s.registry.keys = Array.from({ length: 17 }, (_, n) => key(s, { key_id: 'k' + n })); },
  s => { s.registry.keys[0].max_ttl_ms = 0; },
  s => { s.registry.keys[0].trusted = true; },
  s => { s.registry.extra = 1; },
  s => { s.registry.version = '9'; },
 ]) check(await run(mutate), 'REJECT_INPUT', 'ATR_INPUT_INVALID');
});
test('receipt and context rejections: malformed base64, unknown fields, key embedding, bad decision', async () => {
 for (const patch of [
  v => { v.signature = v.signature.slice(0, -2); },
  v => { v.signature = v.signature.replace(/.==$/, 'B=='); },     // non-canonical trailing bits or length
  v => { v.signature = 'A'.repeat(86) + '=='; v.signature = v.signature.replace(/.==$/, 'B=='); },
  v => { v.signature = '!' + v.signature.slice(1); },
  v => { v.trusted = true; },
  v => { v.payload.public_key = 'x'; },
  v => { v.payload.algorithm = 'rsa'; },
  v => { v.payload.decision = 'rejected'; },
  v => { v.payload.issued_at_ms = 1e30; },
  v => { v.payload.issued_at_ms = -1; },
  v => { v.profile = 'other'; },
 ]) check(await run(() => {}, i => edit(i, 'receiptJson', patch)), 'REJECT_INPUT', 'ATR_INPUT_INVALID');
 for (const patch of [c => { c.verified = true; }, c => { c.evaluated_at_ms = 1.5; }, c => { delete c.request_id; }, c => { c.version = '1'; }]) {
  check(await run(() => {}, i => edit(i, 'contextJson', patch)), 'REJECT_INPUT', 'ATR_INPUT_INVALID');
 }
});
test('API input rejections: trust fields, duplicate keys, unsafe ints, size, depth, accessors, non-strings', async () => {
 const base = render(await scenario());
 const reject = async input => check(await verifyTaskApprovalReceipt(input), 'REJECT_INPUT', 'ATR_INPUT_INVALID');
 await reject({ ...base, trusted: true });
 await reject({ ...base, verified: true });
 await reject({ ...base, receiptJson: base.receiptJson.replace('{', '{"version":"0.1-experimental",') });
 await reject({ ...base, contextJson: base.contextJson.replace('"request_revision":1', '"request_revision":1e30') });
 await reject({ ...base, contextJson: base.contextJson.replace('"request_revision":1', '"request_revision":1e999') });
 await reject({ ...base, registryJson: ' '.repeat(1048577) });
 await reject({ ...base, receiptJson: '['.repeat(65) + '0' + ']'.repeat(65) });
 await reject({ ...base, contextJson: base.contextJson.replace('"pending-1"', '"pending-\\ud800"') });
 await reject({ ...base, contextJson: JSON.parse(base.contextJson) });
 await reject({ ...base, receiptJson: null });
 await reject({ ...base, taskJson: undefined });
 await reject({ ...base, bundleJson: 5 });
 await reject(null); await reject([]); await reject('x');
 const { taskJson, ...noTask } = base;
 await reject(noTask);
 let touched = false;
 const accessor = { ...base };
 Object.defineProperty(accessor, 'receiptJson', { enumerable: true, get() { touched = true; return base.receiptJson; } });
 await reject(accessor);
 assert.equal(touched, false);
 await reject(new Proxy({ ...base }, { get() { touched = true; return base.receiptJson; } }));
 assert.equal(touched, false);
 await reject(Object.assign(Object.create({ receiptJson: base.receiptJson }), { ...base }));
 await reject({ ...base, [Symbol('x')]: 'y' });
});
test('input substitution after capture cannot change the verified subject or trust', async () => {
 const s = await scenario(), input = render(s), other = render(await scenario());
 const pending = verifyTaskApprovalReceipt(input);
 for (const k of Object.keys(input)) input[k] = other[k];
 input.registryJson = '{}'; input.contextJson = '{}'; input.bindingJson = '{}';
 const r = check(await pending, 'VERIFIED_RECEIPT');
 assert.equal(r.subject_digest, s.payload.subject_digest);
 // the bad direction: a verified input must not become verified because a substituted copy would be
 const s2 = await scenario(); s2.registry.keys[0].status = 'revoked';
 const bad = render(s2), good = render(s2); good.registryJson = render(await scenario()).registryJson;
 const pendingBad = verifyTaskApprovalReceipt(bad);
 bad.registryJson = good.registryJson;
 check(await pendingBad, 'DENY', 'ATR_KEY_NOT_ACTIVE');
});
test('deterministic, input unchanged, no payload/key/signature echo', async () => {
 const s = await scenario(), input = render(s), before = j(input);
 const a = await verifyTaskApprovalReceipt(input), b = await verifyTaskApprovalReceipt(input);
 assert.deepEqual(a, b);
 assert.equal(j(input), before);
 const text = j(a);
 const receipt = JSON.parse(input.receiptJson);
 for (const secret of [receipt.signature, s.registry.keys[0].public_key, s.payload.receipt_id, s.context.request_id, s.context.actor_principal]) assert.ok(!text.includes(secret));
 const bad = await run(() => {}, i => edit(i, 'receiptJson', v => { v.payload.receipt_id = 'receipt-2'; }));
 assert.ok(!j(bad).includes('receipt-2'));
 assert.ok(!j(bad).includes('PRIVATE'));
});
test('caller cannot embed trust: registry is the only key source', async () => {
 const rogue = generateKeyPairSync('ed25519');
 const s = await scenario();
 s.privateKey = rogue.privateKey;
 const input = render(s);
 edit(input, 'receiptJson', v => { v.payload.public_key = rogue.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'); });
 check(await verifyTaskApprovalReceipt(input), 'REJECT_INPUT');
 s.registry.keys[0].public_key = rogue.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
 // The check is only as trustworthy as the supplied registry: a replaced registry verifies. Documented trust obligation.
 check(await verifyTaskApprovalReceipt(render(s)), 'VERIFIED_RECEIPT');
});
test('no existing API/package changes: verification module exports no signing or key generation', () => {
 assert.deepEqual(Object.keys(approval).sort(), ['MESSAGE_PREFIX', 'VERSION', 'bindingDigest', 'contextDigest', 'describeApprovalSubject', 'signedMessage', 'verifyTaskApprovalReceipt']);
 const src = readFileSync(new URL('../experiments/task-approval/approval.mjs', import.meta.url), 'utf8');
 for (const banned of ['generateKeyPair', 'createPrivateKey', 'sign(', "from 'node:fs'", 'node:net', 'node:http', 'Date.now', 'new Date', 'import(']) assert.ok(!src.includes(banned), banned);
 const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
 assert.ok(!j(pkg.files ?? []).includes('experiments'));
 assert.ok(!j(pkg.exports ?? {}).includes('task-approval'));
});
test('signed message is domain separated canonical payload', async () => {
 const s = await scenario();
 const m = approval.signedMessage(s.payload).toString('utf8');
 assert.ok(m.startsWith('arc-task-approval-receipt/0.1\0{"binding_digest"'));
 assert.notEqual(m, approval.signedMessage({ ...s.payload, receipt_id: 'receipt-2' }).toString('utf8'));
});
test('D1 subject is reused unchanged', async () => {
 const s = await scenario();
 const d1 = Object.fromEntries(Object.entries(s.f).map(([k, v]) => [k + 'Json', j(v)]));
 assert.equal((await describeEffectRequest(d1)).subject_digest, s.payload.subject_digest);
});
