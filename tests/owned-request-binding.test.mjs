import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyOwnedTaskRequest } from '../experiments/owned-request/binding.mjs';
import { scenario, render } from '../experiments/task-approval/fixtures.mjs';

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const bytes = Buffer.from('synthetic payload\n');
  // Existing PR84 fixture uses ephemeral fictional keys. Never native authority.
  const s = await scenario(f => {
    f.request.content_sha256 = hash(bytes); f.request.byte_length = bytes.length;
  });
  const approval = render(s);
  return { approval, observed: { requestJson: approval.requestJson, contextJson: approval.contextJson, bytes } };
}
const codes = result => result.diagnostics.map(item => item.code);
function staysNonAuthorizing(result) {
  assert.equal(result.host_provenance_status, 'UNKNOWN_HOST_PROVENANCE');
  assert.equal(result.authority_status, 'UNKNOWN');
  for (const key of ['execution_authorized', 'action_executed', 'consumption_performed', 'runtime_enforcement', 'actor_authenticated', 'native_operation_observed']) assert.equal(result[key], false, key);
}

test('matching actual bytes and fictional valid receipt remain held for native provenance', async () => {
  const f = await fixture(), r = await verifyOwnedTaskRequest(f.approval, f.observed);
  assert.equal(r.result, 'UNKNOWN_HOST_PROVENANCE');
  assert.equal(r.operation_match, 'MATCH'); assert.equal(r.context_match, 'MATCH');
  assert.equal(r.approval_result, 'VERIFIED_RECEIPT'); assert.equal(r.owned_content_sha256, hash(f.observed.bytes));
  staysNonAuthorizing(r);
});
test('same-length payload substitution is denied', async () => {
  const f = await fixture(); f.observed.bytes[0] ^= 1;
  const r = await verifyOwnedTaskRequest(f.approval, f.observed);
  assert.equal(r.result, 'DENY'); assert.ok(codes(r).includes('ORB_CONTENT_MISMATCH')); staysNonAuthorizing(r);
});
test('payload length mismatch is denied', async () => {
  const f = await fixture(); f.observed.bytes = Buffer.concat([f.observed.bytes, Buffer.from('x')]);
  const r = await verifyOwnedTaskRequest(f.approval, f.observed);
  assert.ok(codes(r).includes('ORB_LENGTH_MISMATCH')); assert.equal(r.result, 'DENY');
});
for (const [field, value] of [['destination_ref', 'other.receiver'], ['tool_definition_digest', 'sha256:' + 'c'.repeat(64)], ['adapter_digest', 'sha256:' + 'd'.repeat(64)]]) {
  test('actual ' + field + ' substitution is denied', async () => {
    const f = await fixture(), request = JSON.parse(f.observed.requestJson); request[field] = value;
    f.observed.requestJson = JSON.stringify(request);
    const r = await verifyOwnedTaskRequest(f.approval, f.observed);
    assert.equal(r.result, 'DENY'); assert.ok(codes(r).includes('ORB_REQUEST_MISMATCH'));
  });
}
for (const [field, value] of [['request_revision', 2], ['actor_principal', 'other-agent']]) {
  test('current ' + field + ' substitution is denied', async () => {
    const f = await fixture(), context = JSON.parse(f.observed.contextJson); context[field] = value;
    f.observed.contextJson = JSON.stringify(context);
    const r = await verifyOwnedTaskRequest(f.approval, f.observed);
    assert.equal(r.result, 'DENY'); assert.ok(codes(r).includes('ORB_CONTEXT_MISMATCH'));
  });
}
test('mutation after call cannot alter copied bytes or captured JSON', async () => {
  const f = await fixture(), originalHash = hash(f.observed.bytes);
  const pending = verifyOwnedTaskRequest(f.approval, f.observed);
  f.observed.bytes.fill(0); f.observed.requestJson = '{}'; f.observed.contextJson = '{}'; f.approval.receiptJson = '{}';
  const r = await pending;
  assert.equal(r.owned_content_sha256, originalHash); assert.equal(r.approval_result, 'VERIFIED_RECEIPT');
  assert.equal(r.result, 'UNKNOWN_HOST_PROVENANCE');
});
test('SharedArrayBuffer and resizable ArrayBuffer reject before verification', async () => {
  for (const bytes of [new Uint8Array(new SharedArrayBuffer(10)), new Uint8Array(new ArrayBuffer(10, { maxByteLength: 20 }))]) {
    const f = await fixture(); f.observed.bytes = bytes;
    const r = await verifyOwnedTaskRequest(f.approval, f.observed);
    assert.equal(r.result, 'REJECT_INPUT'); assert.equal(r.approval_result, 'NOT_CHECKED'); staysNonAuthorizing(r);
  }
});
test('accessor and proxy inputs reject without invoking user code', async () => {
  const f = await fixture(); let invoked = 0;
  const observed = { requestJson: f.observed.requestJson, contextJson: f.observed.contextJson };
  Object.defineProperty(observed, 'bytes', { get() { invoked++; return f.observed.bytes; }, enumerable: true });
  assert.equal((await verifyOwnedTaskRequest(f.approval, observed)).result, 'REJECT_INPUT');
  const proxy = new Proxy(f.approval, { ownKeys() { invoked++; return []; } });
  assert.equal((await verifyOwnedTaskRequest(proxy, f.observed)).result, 'REJECT_INPUT');
  assert.equal(invoked, 0);
});
test('missing receipt cannot be replaced by a match or caller trust flag', async () => {
  const f = await fixture(); delete f.approval.receiptJson;
  const r = await verifyOwnedTaskRequest(f.approval, f.observed);
  assert.equal(r.result, 'UNKNOWN_HOST_PROVENANCE'); assert.equal(r.approval_result, 'UNKNOWN'); staysNonAuthorizing(r);
  f.observed.trusted = true;
  assert.equal((await verifyOwnedTaskRequest(f.approval, f.observed)).result, 'REJECT_INPUT');
});
test('current supplied time is reverified against receipt expiry', async () => {
  const f = await fixture(), context = JSON.parse(f.observed.contextJson);
  context.evaluated_at_ms = JSON.parse(f.approval.receiptJson).payload.expires_at_ms;
  f.observed.contextJson = JSON.stringify(context);
  const r = await verifyOwnedTaskRequest(f.approval, f.observed);
  assert.equal(r.context_match, 'MATCH'); assert.equal(r.result, 'DENY'); assert.ok(codes(r).includes('ATR_EXPIRED'));
});
