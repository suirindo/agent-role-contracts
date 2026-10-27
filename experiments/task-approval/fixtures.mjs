/** Synthetic fixtures only. Ephemeral Ed25519 keys are created in memory and never written or printed. */
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { digest } from '../cross-tool-effects/contract.mjs';
import { describeEffectRequest } from '../cross-tool-effects/policy.mjs';
import { VERSION, bindingDigest, contextDigest, signedMessage } from './approval.mjs';

const H = 'sha256:' + 'a'.repeat(64), I = 'sha256:' + 'b'.repeat(64);
const j = JSON.stringify;
const example = name => JSON.parse(readFileSync(new URL('../../examples/' + name + '.json', import.meta.url), 'utf8'));
export function d1Fixture() {
 const bundle = example('starter-bundle'), task = example('starter-task');
 const contract = {
  schema_version: '0.1-draft', profile: 'cross-tool-effects/0.1-draft', id: 'fictional-export', revision: 1,
  task_binding: { canonicalization: 'JCS/RFC8785', bundle_task_digest: digest('arc-ctei-task/0.1', { bundle, task }) },
  allowed_effects: ['filesystem.read', 'network.send'], read_sources: ['fixture-public', 'fixture-internal'], destinations: ['lab.receiver'],
  flows: [{ id: 'public', effect: 'network.send', destination_ref: 'lab.receiver', source_refs: ['trusted-input', 'fixture-public'], allowed_labels: ['public'] }],
  provenance: { mode: 'session-union', on_missing: 'deny', allow_declassification: false },
  limits: { max_read_bytes: 1048576, max_egress_bytes_per_action: 65536, max_egress_bytes_per_run: 65536, max_egress_calls_per_run: 1, max_events: 256 },
 };
 const request = { effect: 'network.send', run_id: 'run-1', session_id: 'session-1', tenant: 'tenant-1', source_refs: ['fixture-public'],
  destination_ref: 'lab.receiver', content_sha256: H, byte_length: 12, adapter_digest: H, tool_definition_digest: H };
 const provenance = { run_id: 'run-1', session_id: 'session-1', tenant: 'tenant-1', complete: true,
  sources: [{ source_ref: 'trusted-input', classification: 'public', content_sha256: H }, { source_ref: 'fixture-public', classification: 'public', content_sha256: H },
   { source_ref: 'fixture-internal', classification: 'internal', content_sha256: I }],
  exposure_source_refs: ['trusted-input', 'fixture-public'], usage: { egress_bytes: 0, egress_calls: 0, event_count: 1 } };
 return { bundle, task, contract, request, provenance };
}
/** Fictional G1 declarations for the current subject; this is not a real review or approval. */
export function g1Binding(f, subject) {
 const route = f.bundle.routes.find(r => r.task_type === f.task.type);
 return { schema_version: '0.3', subject_digest: subject,
  reviews: [{ subject_digest: subject, role_id: route.reviewers[0], decision: 'pass' }],
  ...(route.require_human_approval ? { human_approval: { subject_digest: subject, role_id: route.accountable, decision: 'approved' } } : {}) };
}
export const NOW = 1_800_000_000_000;
/**
 * Mutable parts of one synthetic scenario. Mutate parts, then call render(). The payload is signed as
 * currently set, so a stale payload/context stays validly signed but mismatched.
 */
export async function scenario(prepare = () => {}) {
 const f = d1Fixture();
 prepare(f);   // changes made here are part of the signed subject
 const d1 = Object.fromEntries(Object.entries(f).map(([k, v]) => [k + 'Json', j(v)]));
 const subject = (await describeEffectRequest(d1)).subject_digest;
 const binding = g1Binding(f, subject);
 const context = { version: VERSION, profile: 'arc-task-approval-context/0.1-experimental', request_id: 'pending-1', request_revision: 1,
  actor_principal: 'fictional-agent', actor_role: 'implementer', task_id: f.task.id, run_id: 'run-1', session_id: 'session-1', tenant: 'tenant-1',
  harness_id: 'fictional-harness', harness_revision: 1, policy_epoch: 1, registry_epoch: 1, expected_subject_digest: subject, evaluated_at_ms: NOW };
 const { publicKey, privateKey } = generateKeyPairSync('ed25519');
 const registry = { version: VERSION, profile: 'arc-task-approval-registry/0.1-experimental', epoch: 1, keys: [{
  issuer_id: 'fictional-issuer', key_id: 'key-1', public_key: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  approver_role: 'implementer', task_id: f.task.id, tenant: 'tenant-1', harness_id: 'fictional-harness', status: 'enabled', max_ttl_ms: 600000 }] };
 const payload = { receipt_id: 'receipt-1', issuer_id: 'fictional-issuer', key_id: 'key-1', decision: 'approved', subject_digest: subject,
  binding_digest: bindingDigest(binding), context_digest: contextDigest(context), registry_epoch: 1, issued_at_ms: NOW - 1000, expires_at_ms: NOW + 60000 };
 return { f, binding, context, registry, payload, privateKey };
}
export function render(s) {
 const d1 = Object.fromEntries(Object.entries(s.f).map(([k, v]) => [k + 'Json', j(v)]));
 const receipt = { version: VERSION, profile: 'arc-task-approval-receipt/0.1-experimental', payload: s.payload,
  signature: sign(null, signedMessage(s.payload), s.privateKey).toString('base64') };
 return { ...d1, bindingJson: j(s.binding), contextJson: j(s.context), registryJson: j(s.registry), receiptJson: j(receipt) };
}
