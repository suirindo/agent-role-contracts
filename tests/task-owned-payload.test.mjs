import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenario, render } from '../experiments/task-approval/fixtures.mjs';
import { createReceiptConsumptionStore } from '../experiments/task-consumption/ledger.mjs';
import { createOwnedPayloadConsumptionStore, MAX_PAYLOAD_BYTES } from '../experiments/task-consumption/owned-payload.mjs';

const POSIX = ['linux', 'darwin'].includes(process.platform);
const j = JSON.stringify;
const BODY = Uint8Array.from([0x00, 0xff, 0xfe, 0x80, 0x41, 0x00, 0x7f, 0xc3, 0x28, 0x01, 0x02, 0x03]);
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
async function root() { const p = await mkdtemp(join(tmpdir(), 'arc-owned-payload-')); await chmod(p, 0o700); return realpath(p); }
async function withRoot(fn) { const p = await root(); try { await fn(p, await createOwnedPayloadConsumptionStore(p)); } finally { await rm(p, { recursive: true, force: true }); } }
const markers = async p => (await readdir(p)).filter(x => x.endsWith('.consumed'));
/** Scenario whose request, provenance and binding-visible content hashes describe `body`. */
const bound = (body, mutate = () => {}) => scenario(f => {
 f.request.content_sha256 = sha(body); f.request.byte_length = body.length;
 for (const s of f.provenance.sources) s.content_sha256 = sha(body);
 mutate(f);
});
async function valid(body = BODY) { return render(await bound(body)); }
function check(r, status, binding) {
 assert.equal(r.consumption_status, status, j(r));
 if (binding) assert.equal(r.payload_binding, binding, j(r));
 assert.equal(r.authority_status, 'UNKNOWN');
 for (const k of ['execution_authorized', 'runtime_enforcement', 'action_executed', 'actor_authenticated', 'reviewer_authenticated', 'global_replay_protection',
  'payload_sent', 'source_classification_verified', 'destination_resolved', 'later_operation_bound']) assert.equal(r[k], false, k);
 return r;
}
const NOT_OBSERVED = r => { check(r, 'NOT_CONSUMED', 'NOT_OBSERVED'); assert.equal(r.source_bytes_observed, false); assert.equal(r.ledger_called, false); assert.equal(r.observed_content_sha256, null); };

test('matching binary body is observed and consumed once; repeat is held; nothing leaks', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const approvalInput = await valid();
 const first = check(await store.consume({ approvalInput, payloadBytes: BODY }), 'CONSUMED', 'MATCH');
 assert.equal(first.source_bytes_observed, true);
 assert.equal(first.payload_observation, 'OBSERVED');
 assert.equal(first.observed_content_sha256, sha(BODY));
 assert.equal(first.observed_byte_length, BODY.length);
 assert.equal(first.verification_result, 'VERIFIED_RECEIPT');
 assert.equal(first.marker_persisted, true);
 assert.equal((await markers(p)).length, 1);
 const text = j(first), signature = JSON.parse(approvalInput.receiptJson).signature;
 for (const secret of [Buffer.from(BODY).toString('hex'), Buffer.from(BODY).toString('base64'), p, signature, approvalInput.registryJson]) assert.ok(!text.includes(secret));
 for (const key of ['payloadBytes', 'payload', 'bytes']) assert.ok(!(key in first));
 const repeat = check(await store.consume({ approvalInput, payloadBytes: BODY }), 'REPLAY_OR_UNCERTAIN', 'MATCH');
 assert.equal(repeat.marker_persisted, false);
 assert.equal((await markers(p)).length, 1);
 assert.ok(Object.isFrozen(store));
 assert.deepEqual(Object.keys(store), ['consume']);
}));

test('mismatched bytes never reach the ledger; controls bracket them and the grant is not burned', { skip: !POSIX }, async () => {
 const approvalInput = await valid();
 await withRoot(async (p, store) => check(await store.consume({ approvalInput, payloadBytes: BODY }), 'CONSUMED', 'MATCH'));
 await withRoot(async (p, store) => {
  const sameLength = Uint8Array.from(BODY); sameLength[4] ^= 1;
  const cases = [sameLength, BODY.subarray(0, BODY.length - 1), Uint8Array.from([...BODY, 0]), new Uint8Array(0)];
  for (const payloadBytes of cases) {
   const r = check(await store.consume({ approvalInput, payloadBytes }), 'NOT_CONSUMED', 'MISMATCH');
   assert.equal(r.ledger_called, false); assert.equal(r.source_bytes_observed, true); assert.equal(r.observed_content_sha256, sha(payloadBytes));
   assert.equal(r.verification_result, 'NOT_VERIFIED'); assert.equal(r.marker_persisted, false);
   assert.equal((await markers(p)).length, 0);
  }
  check(await store.consume({ approvalInput, payloadBytes: BODY }), 'CONSUMED', 'MATCH');
  assert.equal((await markers(p)).length, 1);
 });
 await withRoot(async (p, store) => check(await store.consume({ approvalInput, payloadBytes: BODY }), 'CONSUMED', 'MATCH'));
});

test('subviews copy exactly their own offset and length; Buffer views behave the same', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const backing = new Uint8Array(40).fill(0xaa); backing.set(BODY, 7);
 const approvalInput = await valid();
 for (const wrong of [backing.subarray(6, 6 + BODY.length), backing.subarray(8, 8 + BODY.length), backing.subarray(7, 6 + BODY.length), backing.subarray(7, 8 + BODY.length), backing]) {
  check(await store.consume({ approvalInput, payloadBytes: wrong }), 'NOT_CONSUMED', 'MISMATCH');
 }
 assert.equal((await markers(p)).length, 0);
 const view = Buffer.from(backing.buffer).subarray(7, 7 + BODY.length);
 const r = check(await store.consume({ approvalInput, payloadBytes: view }), 'CONSUMED', 'MATCH');
 assert.equal(r.observed_byte_length, BODY.length);
}));

test('empty body is valid only when the declaration says empty', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const empty = new Uint8Array(0);
 check(await store.consume({ approvalInput: await valid(), payloadBytes: empty }), 'NOT_CONSUMED', 'MISMATCH');
 const r = check(await store.consume({ approvalInput: await valid(empty), payloadBytes: empty }), 'CONSUMED', 'MATCH');
 assert.equal(r.observed_byte_length, 0); assert.equal(r.observed_content_sha256, sha(empty));
}));

test('matching bytes cannot consume expired, revoked, disabled, foreign, forged, missing, D1-denied or context-conflicting approvals', { skip: !POSIX }, async () => {
 const mutations = {
  expired: s => { s.context.evaluated_at_ms += 120000; },
  revoked: s => { s.registry.keys[0].status = 'revoked'; },
  disabled: s => { s.registry.keys[0].status = 'disabled'; },
  foreign: s => { s.registry.keys[0].public_key = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64'); },
  foreignContext: s => { s.context.tenant = 'tenant-foreign'; },
 };
 // expected verification_result and the exact diagnostic codes (or, for multi-code cases, codes that must be present)
 const expected = {
  expired: ['DENY', ['ATR_EXPIRED']], revoked: ['DENY', ['ATR_KEY_NOT_ACTIVE']], disabled: ['DENY', ['ATR_KEY_NOT_ACTIVE']],
  foreign: ['DENY', ['ATR_SIGNATURE_INVALID']], forged: ['DENY', ['ATR_SIGNATURE_INVALID']], missing: ['UNKNOWN', ['ATR_RECEIPT_MISSING']],
  d1: ['DENY', ['ATR_D1_DENY'], true], foreignContext: ['DENY', ['ATR_CONTEXT_CONFLICT'], true],
 };
 await withRoot(async (p, store) => check(await store.consume({ approvalInput: await valid(), payloadBytes: BODY }), 'CONSUMED', 'MATCH'));
 await withRoot(async (p, store) => {
  const inputs = {};
  for (const [name, mutate] of Object.entries(mutations)) { const s = await bound(BODY); mutate(s); inputs[name] = render(s); }
  inputs.missing = { ...await valid() }; delete inputs.missing.receiptJson;
  const denied = await valid(); inputs.d1 = { ...denied, requestJson: j({ ...JSON.parse(denied.requestJson), destination_ref: 'evil.receiver' }) };
  // same valid body, request, hashes and length; only one signature bit differs, re-encoded as canonical base64
  const intact = await valid(), receipt = JSON.parse(intact.receiptJson), sig = Buffer.from(receipt.signature, 'base64');
  assert.equal(sig.length, 64); sig[0] ^= 1; receipt.signature = sig.toString('base64');
  assert.equal(Buffer.from(receipt.signature, 'base64').toString('base64'), receipt.signature);
  inputs.forged = { ...intact, receiptJson: j(receipt) };
  assert.deepEqual(Object.keys(inputs).sort(), Object.keys(expected).sort());
  for (const [name, approvalInput] of Object.entries(inputs)) {
   const r = check(await store.consume({ approvalInput, payloadBytes: BODY }), 'NOT_CONSUMED', 'MATCH');
   const [result, codes, subset] = expected[name], got = r.diagnostics.map(x => x.code);
   assert.equal(r.source_bytes_observed, true, name); assert.equal(r.ledger_called, true, name);
   assert.equal(r.verification_result, result, name);
   if (subset) for (const c of codes) assert.ok(got.includes(c), name + ' ' + c); else assert.deepEqual(got, codes, name);
   assert.notEqual(r.verification_result, 'VERIFIED_RECEIPT', name);
   assert.equal(r.marker_persisted, false, name); assert.equal((await markers(p)).length, 0, name);
  }
  check(await store.consume({ approvalInput: await valid(), payloadBytes: BODY }), 'CONSUMED', 'MATCH');
  assert.equal((await markers(p)).length, 1);
 });
});

test('mutating caller buffer, envelope and approval input after invoking consume cannot change the snapshot', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const approvalInput = await valid(), original = { ...approvalInput };
 const buffer = Uint8Array.from(BODY), envelope = { approvalInput, payloadBytes: buffer };
 const pending = store.consume(envelope);
 buffer.fill(0xee); approvalInput.receiptJson = 'tampered'; approvalInput.requestJson = '{}'; delete approvalInput.bundleJson;
 envelope.payloadBytes = new Uint8Array(1); envelope.approvalInput = {};
 const r = check(await pending, 'CONSUMED', 'MATCH');
 assert.equal(r.observed_content_sha256, sha(BODY));
 assert.equal(r.subject_digest, JSON.parse(original.receiptJson).payload.subject_digest);
 assert.equal(r.grant_hash.startsWith('sha256:'), true);
 // The mutated caller state is itself a fresh, different observation.
 check(await store.consume({ approvalInput: original, payloadBytes: buffer }), 'NOT_CONSUMED', 'MISMATCH');
 assert.equal((await markers(p)).length, 1);
}));

test('hostile envelopes and approval inputs are rejected without invoking getters or proxy traps', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const approvalInput = await valid();
 let touched = 0;
 const trap = new Proxy({}, new Proxy({}, { get() { touched++; return undefined; } }));
 const getterEnvelope = { approvalInput }; Object.defineProperty(getterEnvelope, 'payloadBytes', { enumerable: true, get() { touched++; return BODY; } });
 const getterApproval = { ...approvalInput }; Object.defineProperty(getterApproval, 'receiptJson', { enumerable: true, get() { touched++; return approvalInput.receiptJson; } });
 class Evil { constructor() { Object.assign(this, approvalInput); } }
 const cases = [
  getterEnvelope, trap, new Proxy({ approvalInput, payloadBytes: BODY }, {}), { approvalInput: trap, payloadBytes: BODY },
  { approvalInput: new Proxy({ ...approvalInput }, {}), payloadBytes: BODY }, { approvalInput: getterApproval, payloadBytes: BODY },
  { approvalInput: new Evil(), payloadBytes: BODY }, { approvalInput: Object.create({ bundleJson: 'x' }), payloadBytes: BODY },
  { approvalInput: { ...approvalInput, [Symbol('s')]: 'x' }, payloadBytes: BODY }, { approvalInput: { ...approvalInput, extra: 'x' }, payloadBytes: BODY },
  { approvalInput: { ...approvalInput, receiptJson: 5 }, payloadBytes: BODY }, { approvalInput: { ...approvalInput, bundleJson: undefined }, payloadBytes: BODY },
  { approvalInput, payloadBytes: BODY, extra: 1 }, { approvalInput }, { payloadBytes: BODY }, Object.create({ approvalInput, payloadBytes: BODY }),
  null, 'x', [], { approvalInput: [], payloadBytes: BODY },
 ];
 const hostileKeys = { ...approvalInput }; delete hostileKeys.bundleJson; cases.push({ approvalInput: hostileKeys, payloadBytes: BODY });
 for (const input of cases) { const r = await store.consume(input); NOT_OBSERVED(r); assert.equal(r.verification_result, 'REJECT_INPUT'); }
 assert.equal(touched, 0);
 assert.equal((await markers(p)).length, 0);
 check(await store.consume({ approvalInput, payloadBytes: BODY }), 'CONSUMED', 'MATCH');
}));

test('typed-array own getter overrides are ignored via intrinsics, and non-byte or exotic payloads fail closed', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const approvalInput = await valid();
 let touched = 0;
 const lies = Uint8Array.from(BODY);
 for (const key of ['buffer', 'byteLength', 'byteOffset', 'length', 'slice', 'subarray', 'constructor', Symbol.iterator]) {
  Object.defineProperty(lies, key, { get() { touched++; return key === 'buffer' ? new ArrayBuffer(1) : 1; } });
 }
 class Sub extends Uint8Array {}
 class SubBuffer extends Buffer {}
 const view = new DataView(BODY.buffer.slice(0), 0, BODY.length);
 const bad = [
  Buffer.from(BODY).toString('latin1'), [...BODY], new Sub(BODY), new Proxy(Uint8Array.from(BODY), {}), view, BODY.buffer.slice(0),
  new Uint8ClampedArray(BODY), new Int8Array(BODY), new Float32Array(3), new BigUint64Array(2), null, undefined, 5, {},
  Object.setPrototypeOf(Uint8Array.from(BODY), Object.create(Uint8Array.prototype)), Object.setPrototypeOf(Buffer.from(BODY), SubBuffer.prototype),
 ];
 for (const payloadBytes of bad) NOT_OBSERVED(await store.consume({ approvalInput, payloadBytes }));
 assert.equal((await markers(p)).length, 0);
 const r = check(await store.consume({ approvalInput, payloadBytes: lies }), 'CONSUMED', 'MATCH');
 assert.equal(r.observed_content_sha256, sha(BODY));
 assert.equal(touched, 0);
}));

test('shared, resizable, detached and oversize backings fail closed (native features skipped when absent)', { skip: !POSIX }, async t => withRoot(async (p, store) => {
 const approvalInput = await valid();
 NOT_OBSERVED(await store.consume({ approvalInput, payloadBytes: new Uint8Array(new SharedArrayBuffer(BODY.length)) }));
 NOT_OBSERVED(await store.consume({ approvalInput, payloadBytes: new Uint8Array(MAX_PAYLOAD_BYTES + 1) }));
 const over = await store.consume({ approvalInput, payloadBytes: new Uint8Array(MAX_PAYLOAD_BYTES) });
 check(over, 'NOT_CONSUMED', 'MISMATCH'); assert.equal(over.observed_byte_length, MAX_PAYLOAD_BYTES);
 if ('resizable' in ArrayBuffer.prototype) {
  const growable = new ArrayBuffer(BODY.length, { maxByteLength: BODY.length * 2 });
  const view = new Uint8Array(growable); view.set(BODY);
  NOT_OBSERVED(await store.consume({ approvalInput, payloadBytes: view }));
  NOT_OBSERVED(await store.consume({ approvalInput, payloadBytes: new Uint8Array(growable, 0, BODY.length) }));
 } else t.diagnostic('SKIPPED resizable ArrayBuffer: unavailable on this runtime');
 if ('detached' in ArrayBuffer.prototype) {
  for (const size of [BODY.length, 0]) {
   const ab = new ArrayBuffer(size), view = new Uint8Array(ab); structuredClone(ab, { transfer: [ab] });
   assert.equal(ab.detached, true);
   NOT_OBSERVED(await store.consume({ approvalInput, payloadBytes: view }));
  }
 } else t.diagnostic('SKIPPED detached ArrayBuffer: unavailable on this runtime');
 assert.equal((await markers(p)).length, 0);
}));

test('malformed or unsupported request declarations observe bytes but never reach the ledger', { skip: !POSIX }, async () => withRoot(async (p, store) => {
 const approvalInput = await valid(), request = JSON.parse(approvalInput.requestJson);
 for (const requestJson of ['{', j({ ...request, extra: 1 }), j({ ...request, effect: 'filesystem.read', destination_ref: null, source_refs: ['fixture-public'] }), j({ ...request, effect: 'other.send' })]) {
  const r = check(await store.consume({ approvalInput: { ...approvalInput, requestJson }, payloadBytes: BODY }), 'NOT_CONSUMED', 'UNEVALUATED');
  assert.equal(r.source_bytes_observed, true); assert.equal(r.ledger_called, false);
 }
 assert.equal((await markers(p)).length, 0);
}));

test('adapter owns its store: root rules are unchanged and no caller store or flag is accepted', { skip: !POSIX }, async () => {
 await assert.rejects(createOwnedPayloadConsumptionStore('relative/root'), /TRC_ROOT_INVALID/);
 await assert.rejects(createOwnedPayloadConsumptionStore({ consume: async () => ({ consumption_status: 'CONSUMED' }) }), /TRC_ROOT_INVALID/);
 await withRoot(async (p, store) => {
  const approvalInput = await valid();
  const forged = { approvalInput, payloadBytes: BODY, source_bytes_observed: true, payload_binding: 'MATCH', store: { consume: async () => ({}) } };
  NOT_OBSERVED(await store.consume(forged));
  // The unchanged ledger still ignores bytes entirely; a marker it wrote holds the adapter too.
  const old = await createReceiptConsumptionStore(p);
  const oldReport = await old.consume(approvalInput);
  assert.equal(oldReport.consumption_status, 'CONSUMED'); assert.ok(!('payload_binding' in oldReport)); assert.ok(!('source_bytes_observed' in oldReport));
  check(await store.consume({ approvalInput, payloadBytes: BODY }), 'REPLAY_OR_UNCERTAIN', 'MATCH');
  assert.equal((await markers(p)).length, 1);
 });
});

test('unsupported hosts report UNSUPPORTED without any filesystem access', async () => {
 const original = Object.getOwnPropertyDescriptor(process, 'platform');
 Object.defineProperty(process, 'platform', { value: 'win32' });
 try {
  const store = await createOwnedPayloadConsumptionStore('/definitely/not/a/real/root');
  const r = await store.consume({ approvalInput: await valid(), payloadBytes: BODY });
  check(r, 'UNSUPPORTED'); assert.equal(r.source_bytes_observed, false); assert.equal(r.ledger_called, false);
  assert.equal(r.diagnostics[0].code, 'OPC_UNSUPPORTED_HOST');
 } finally { Object.defineProperty(process, 'platform', original); }
});
