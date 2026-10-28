/** Offline, supplied snapshots only. An ALLOW is a policy calculation, never authority. */
import { describeTaskAction, validateTaskActionBinding } from '../../src/core.mjs';
import { parseInputs } from './contract.mjs';

const limitations = Object.freeze({
 execution_authorized: false, runtime_enforcement: false, identity_verified: false,
 evidence_verified: false, action_executed: false, replay_protection_enforced: false,
 source_bytes_observed: false, receiver_observed: false,
});
const base = () => ({
 profile: 'cross-tool-effects/d1-report/0.1', policy_result: 'UNKNOWN', binding_status: 'UNKNOWN',
 authority_status: 'UNKNOWN', execution_status: 'NOT_PERFORMED', coverage: 'SUPPLIED_SNAPSHOTS_ONLY',
 diagnostics: [], ...limitations,
});
const diagnostic = code => ({ code });
function policy({ contract: c, request: q, provenance: p, digests }) {
 const denied = [], unknown = [];
 const deny = code => denied.push(code), hold = code => unknown.push(code);
 if (c.task_binding.bundle_task_digest !== digests.task_digest) deny('CTE_BINDING_STALE');
 if (['run_id','session_id','tenant'].some(k => q[k] !== p[k])) deny('CTE_REPLAY_OR_CONFLICT');
 if (!['filesystem.read','network.send'].includes(q.effect)) deny('CTE_UNSUPPORTED_EFFECT');
 else if (!c.allowed_effects.includes(q.effect)) deny('CTE_EFFECT_NOT_DECLARED');
 if (p.usage.event_count >= c.limits.max_events) deny('CTE_LIMIT_EXCEEDED');
 const registry = new Map(p.sources.map(s => [s.source_ref, s]));
 if (q.effect === 'filesystem.read') {
  if (q.source_refs.length !== 1 || q.destination_ref !== null) deny('CTE_UNSUPPORTED_EFFECT');
  if (q.source_refs.some(s => !c.read_sources.includes(s))) deny('CTE_SOURCE_NOT_ALLOWED');
  if (q.byte_length > c.limits.max_read_bytes) deny('CTE_LIMIT_EXCEEDED');
  const source = registry.get(q.source_refs[0]);
  if (!source) hold('CTE_PROVENANCE_INCOMPLETE');
  else if (source.content_sha256 !== q.content_sha256) deny('CTE_BINDING_STALE');
 } else if (q.effect === 'network.send') {
  if (!c.destinations.includes(q.destination_ref)) deny('CTE_DESTINATION_NOT_ALLOWED');
  if (q.byte_length > c.limits.max_egress_bytes_per_action ||
      p.usage.egress_bytes + q.byte_length > c.limits.max_egress_bytes_per_run ||
      p.usage.egress_calls + 1 > c.limits.max_egress_calls_per_run) deny('CTE_LIMIT_EXCEEDED');
  const refs = [...new Set([...p.exposure_source_refs, ...q.source_refs])].sort();
  if (!p.complete || refs.length === 0 || refs.some(s => !registry.has(s))) hold('CTE_PROVENANCE_INCOMPLETE');
  // No rule stitching: one rule must cover every source and every label.
  if (refs.length && refs.every(s => registry.has(s)) &&
      !c.flows.some(f => f.destination_ref === q.destination_ref &&
       refs.every(s => f.source_refs.includes(s) && f.allowed_labels.includes(registry.get(s).classification)))) deny('CTE_FLOW_NOT_ALLOWED');
 }
 const codes = [...new Set([...denied, ...unknown])];
 return { policy_result: denied.length ? 'DENY' : unknown.length ? 'UNKNOWN' : 'ALLOW', diagnostics: codes.map(diagnostic) };
}
function prepare(input) {
 try { return { data: parseInputs(input) }; }
 catch { return { error: { ...base(), policy_result: 'REJECT_INPUT', diagnostics: [diagnostic('CTE_INPUT_INVALID')] } }; }
}
/** Describe the exact G1 declaration subject; never creates reviews or approvals. */
export async function describeEffectRequest(input) {
 input = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : input;
 const prepared = prepare(input);
 if (prepared.error) return prepared.error;
 const d = prepared.data;
 const g1 = await describeTaskAction(input.bundleJson, input.taskJson, JSON.stringify(d.action));
 if (!g1.valid) return { ...base(), policy_result: 'DENY', diagnostics: [diagnostic('CTE_DECLARATION_INVALID')] };
 return { ...base(), ...policy(d), ...d.digests, action: d.action, subject_digest: g1.subject_digest };
}
/** All caller inputs are bounded JSON texts. No clock, network, file read or callbacks. */
export async function evaluateEffectRequest(input) {
 input = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : input;
 const prepared = prepare(input);
 if (prepared.error) return prepared.error;
 const d = prepared.data;
 const report = { ...base(), ...policy(d), ...d.digests };
 const described = await describeTaskAction(input.bundleJson, input.taskJson, JSON.stringify(d.action));
 if (!described.valid) return { ...report, policy_result: 'DENY', diagnostics: [...report.diagnostics, diagnostic('CTE_DECLARATION_INVALID')] };
 if (input.bindingJson === undefined) {
  return { ...report, policy_result: report.policy_result === 'DENY' ? 'DENY' : 'UNKNOWN', diagnostics: [...report.diagnostics, diagnostic('CTE_BINDING_REQUIRED')] };
 }
 const g1 = await validateTaskActionBinding(input.bundleJson, input.taskJson, JSON.stringify(d.action), input.bindingJson);
 if (!g1.valid) {
  const code = g1.errors.some(e => e.code === 'G1_SUBJECT_MISMATCH') ? 'CTE_BINDING_STALE' : 'CTE_BINDING_INVALID';
  return { ...report, policy_result: 'DENY', binding_status: 'INCONSISTENT', diagnostics: [...report.diagnostics, diagnostic(code)] };
 }
 return { ...report, binding_status: 'CONSISTENT' };
}
