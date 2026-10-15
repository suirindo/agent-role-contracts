import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, linkSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { canonical } from '../src/schema.mjs';
import { collectArtifactReceipt as collect, verifyArtifactReceipt as verify } from '../experiments/runtime-conformance/artifact-receipt.mjs';
const keys = generateKeyPairSync('ed25519');
const posixTest = (name, fn) => test(name, { skip: !constants.O_NOFOLLOW ? 'Collector requires O_NOFOLLOW; fail-closed case is tested separately' : false }, fn);
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const meta = {
 source_id: 'collector-1', run_id: 'run-1', subject_digest: 'sha256:' + 'a'.repeat(64),
 nonce: 'nonce-1', artifact_id: 'report-1', artifact_path: 'reports/report.json',
};
function setup(t, bytes = Buffer.from('actual report bytes\n')) {
 const root = mkdtempSync(join(tmpdir(), 'arc-receipt-test-'));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 const file = join(root, 'report.json'); writeFileSync(file, bytes, { flag: 'wx' });
 return { root, file, bytes };
}
const context = (r, bytes) => ({ ...meta, content_sha256: hash(bytes), evaluated_at: r.payload.observed_at, max_age_ms: 60000, max_clock_skew_ms: 1000 });
const check = (r, c, key = keys.publicKey) => verify(JSON.stringify(r), key, JSON.stringify(c));
const resign = r => { r.signature = sign(null, Buffer.from('ARC-ARTIFACT-OBSERVATION-0.1\n' + canonical(r.payload)), keys.privateKey).toString('base64'); };
posixTest('measures real file bytes and verifies origin with an externally pinned key', t => {
 const { file, bytes } = setup(t), r = collect(file, JSON.stringify(meta), keys.privateKey);
 assert.equal(r.payload.byte_length, bytes.length); assert.equal(r.payload.content_sha256, hash(bytes));
 const result = check(r, context(r, bytes));
 assert.equal(result.signature_valid, true); assert.equal(result.binding_matches, true);
 assert.deepEqual(result.errors, []);
 for (const name of ['identity_verified', 'runtime_conformance_verified', 'content_bytes_verified',
  'execution_authorized', 'runtime_enforcement', 'replay_protection_enforced']) assert.equal(result[name], false);
});
posixTest('tampering every payload field or signature fails authentication', t => {
 const { file, bytes } = setup(t), r = collect(file, JSON.stringify(meta), keys.privateKey);
 for (const field of Object.keys(r.payload)) {
  const changed = structuredClone(r);
  changed.payload[field] = typeof changed.payload[field] === 'number' ? changed.payload[field] + 1 : changed.payload[field] + 'x';
  assert.equal(check(changed, context(r, bytes)).signature_valid, false, field);
 }
 r.signature = 'A'.repeat(86) + '=='; assert.equal(check(r, context(r, bytes)).signature_valid, false);
});
posixTest('receipt cannot supply or replace its trust root', t => {
 const { file, bytes } = setup(t), r = collect(file, JSON.stringify(meta), keys.privateKey), c = context(r, bytes);
 assert.equal(check(r, c, generateKeyPairSync('ed25519').publicKey).signature_valid, false);
 r.public_key = keys.publicKey.export({ type: 'spki', format: 'pem' });
 assert.equal(check(r, c).signature_valid, false);
});
posixTest('each expected binding is independently enforced', t => {
 const { file, bytes } = setup(t), r = collect(file, JSON.stringify(meta), keys.privateKey);
 for (const field of [...Object.keys(meta), 'content_sha256']) {
  const c = context(r, bytes);
  c[field] = field.endsWith('digest') || field === 'content_sha256' ? 'sha256:' + 'b'.repeat(64) : c[field] + '-other';
  const result = check(r, c);
  assert.equal(result.signature_valid, true); assert.equal(result.binding_matches, false, field);
 }
});
posixTest('freshness and real calendar time checked separately from signature', t => {
 const { file, bytes } = setup(t), r = collect(file, JSON.stringify(meta), keys.privateKey);
 const c = context(r, bytes);
 c.evaluated_at = new Date(Date.parse(r.payload.observed_at) + 60001).toISOString();
 assert.equal(check(r, c).freshness, 'stale');
 c.evaluated_at = new Date(Date.parse(r.payload.observed_at) - 1001).toISOString();
 assert.equal(check(r, c).freshness, 'unknown');
 r.payload.observed_at = '2026-02-30T00:00:00.000Z'; resign(r);
 assert.equal(check(r, context(r, bytes)).freshness, 'unknown');
});
posixTest('bounded bytes: empty and exact limit accepted, oversized rejected', t => {
 const { file } = setup(t, Buffer.alloc(0));
 assert.equal(collect(file, JSON.stringify(meta), keys.privateKey).payload.byte_length, 0);
 writeFileSync(file, Buffer.alloc(1048576, 1));
 assert.equal(collect(file, JSON.stringify(meta), keys.privateKey).payload.byte_length, 1048576);
 writeFileSync(file, Buffer.alloc(1048577, 1));
 assert.throws(() => collect(file, JSON.stringify(meta), keys.privateKey), /TOO_LARGE/);
});
posixTest('directory, final symlink and hardlink are rejected', t => {
 const { root, file } = setup(t);
 assert.throws(() => collect(root, JSON.stringify(meta), keys.privateKey));
 if (process.platform === 'win32') return; // Collector itself fails closed when O_NOFOLLOW is unsupported.
 const sym = join(root, 'link'); symlinkSync(file, sym);
 assert.throws(() => collect(sym, JSON.stringify(meta), keys.privateKey));
 const hard = join(root, 'hard'); linkSync(file, hard);
 assert.throws(() => collect(hard, JSON.stringify(meta), keys.privateKey), /NOT_SINGLE_REGULAR/);
});
posixTest('strict JSON and closed receipt/context reject flags and duplicate decoded keys', t => {
 const { file, bytes } = setup(t), r = collect(file, JSON.stringify(meta), keys.privateKey);
 for (const bad of ['{"x":1,"\\u0078":2}', '{"n":9007199254740993}', '{', ' '.repeat(1048577)]) {
  assert.equal(verify(bad, keys.publicKey, JSON.stringify(context(r, bytes))).signature_valid, false);
  assert.throws(() => collect(file, bad, keys.privateKey));
 }
 const c = context(r, bytes); c.verified = true; assert.equal(check(r, c).signature_valid, false);
});
test('platform without O_NOFOLLOW cannot silently collect', t => {
 if (constants.O_NOFOLLOW) return;
 const { file } = setup(t);
 assert.throws(() => collect(file, JSON.stringify(meta), keys.privateKey), /NOFOLLOW_UNSUPPORTED/);
});
