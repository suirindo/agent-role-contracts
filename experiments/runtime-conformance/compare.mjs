/**
 * Unexported, source-only experiment. Supplied observations are NOT authenticated.
 * Pure bounded comparison: no runtime, I/O, implicit clock, or enforcement.
 */
import { read, checkBundle, checkTask, scopeContains } from '../../src/validation.mjs';
import { describeTaskAction } from '../../src/action-binding.mjs';
import { validateFilesystemWriteMapping } from '../../src/filesystem-write-adapter.mjs';
import { buildReport } from '../../src/report.mjs';
import { VERSION } from '../../src/version.mjs';
import { canonical } from '../../src/schema.mjs';

const id = { type: 'string', minLength: 1, maxLength: 96, pattern: '^[a-z0-9][a-z0-9._-]*$' };
const digest = { type: 'string', minLength: 71, maxLength: 71, pattern: '^sha256:[0-9a-f]{64}$' };
const stamp = { type: 'string', minLength: 24, maxLength: 24, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$' };
const integer = { type: 'integer', minimum: 0, maximum: 2147483647 };
const list = (items, maxItems = 256) => ({ type: 'array', items, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const schemas = {
 manifest: object({
  profile: { const: 'runtime-conformance-spike/0.1' }, subject_digest: digest,
  runtime_revision: id, inventory_digest: digest, captured_at: stamp,
  tools: list(object({ tool_id: id, capability: id, operation: { enum: ['write_file'] } })),
  handoffs: list(object({ from_role_id: id, to_role_id: id })),
 }),
 batch: object({
  run_id: id, subject_digest: digest, runtime_revision: id, inventory_digest: digest,
  source_id: id, source_epoch: id, sequence_start: integer, sequence_end: integer,
  dropped_events: integer, complete: { type: 'boolean' },
  events: list(object({
   event_id: id, sequence: integer, occurred_at: stamp, observed_at: stamp,
   subject_digest: digest, actor_role_id: id, principal_id: id,
   type: { enum: ['write', 'handoff', 'review'] },
   details: { type: 'object' },
  })),
 }),
 context: object({
  run_id: id, runtime_revision: id, inventory_digest: digest, evaluated_at: stamp,
  max_age_ms: integer, max_clock_skew_ms: integer,
 }),
 write: object({ tool_id: id, path: { type: 'string', minLength: 1, maxLength: 4096 }, content_sha256: digest }),
 handoff: object({ to_role_id: id }),
 review: object({ executor_event_id: id }),
};

// Validation roundtrip rejects impossible calendar dates as well as noncanonical time.
function millis(value) {
 const time = Date.parse(value);
 return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

export async function compareRuntimeObservations(bundleJson, taskJson, actionJson, manifestJson, batchJson, contextJson) {
 const state = {
  comparison_profile: 'runtime-conformance-spike/0.1',
  supplied_conformance: 'not_evaluated', observed_conformance: 'unknown',
  freshness: 'unknown', subject_digest: null, findings: [],
  provenance: 'unverified', coverage: 'unverified', operational_acceptance: false,
  static_checks: [], content_bytes_verified: false, replay_protection_enforced: false,
 };
 const finish = errors => buildReport(VERSION, 'runtime-conformance-spike', errors, state);
 const b = checkBundle(bundleJson);
 state.static_checks.push({ operation: 'validateBundle', valid: b.errors.length === 0 });
 if (b.errors.length) return finish(b.errors);
 const t = checkTask(b, taskJson);
 state.static_checks.push({ operation: 'explainTask', valid: t.errors.length === 0 });
 if (t.errors.length) return finish(t.errors);
 const subject = await describeTaskAction(bundleJson, taskJson, actionJson);
 state.static_checks.push({ operation: 'describeTaskAction', valid: subject.valid });
 if (!subject.valid) return finish(subject.errors);
 state.subject_digest = subject.subject_digest;
 // Validate the supported declaration independently of whether a write is supplied.
 const actionMapping = await validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, JSON.stringify({
  schema_version: '0.1', subject_digest: subject.subject_digest, operation: 'write_file',
  path: subject.action.parameters.path, content_sha256: subject.action.parameters.content_sha256,
 }));
 state.static_checks.push({ operation: 'validateFilesystemWriteMapping', valid: actionMapping.valid });
 if (!actionMapping.valid) return finish(actionMapping.errors);
 const parsed = [['manifest', manifestJson], ['batch', batchJson], ['context', contextJson]]
  .map(([label, value]) => read(value, schemas[label], label));
 const inputErrors = parsed.flatMap(p => p.errors);
 if (inputErrors.length) return finish(inputErrors);
 const [manifest, batch, context] = parsed.map(p => p.value);
 // Event payload semantics are closed per event type, not inferred.
 const payloadErrors = batch.events.flatMap((e, i) =>
  read(JSON.stringify(e.details), schemas[e.type], 'batch/events/' + i + '/details').errors);
 if (payloadErrors.length) return finish(payloadErrors);
 const errors = [];
 const add = (code, path, message, category = 'gap') => {
  errors.push({ code, path, message });
  state.findings.push({ code, path, category });
 };
 const match = subject.subject_digest;
 if (manifest.subject_digest !== match || batch.subject_digest !== match)
  add('RUNTIME_SUBJECT_MISMATCH', 'binding', 'Manifest and batch must bind the current G1 subject');
 if (batch.run_id !== context.run_id)
  add('RUN_MISMATCH', 'batch/run_id', 'Batch must belong to the requested run');
 const configurationChanged = [manifest, batch].some(v =>
  v.runtime_revision !== context.runtime_revision || v.inventory_digest !== context.inventory_digest);
 if (configurationChanged)
  add('CONFIG_BASELINE_CHANGED', 'binding', 'Runtime revision or inventory differs from the baseline');

 const times = [
  ['context/evaluated_at', context.evaluated_at], ['manifest/captured_at', manifest.captured_at],
  ...batch.events.flatMap((e, i) => [
   ['batch/events/' + i + '/occurred_at', e.occurred_at],
   ['batch/events/' + i + '/observed_at', e.observed_at],
  ]),
 ];
 const clock = new Map(times.map(([p, v]) => [p, millis(v)]));
 for (const [path, value] of clock) if (value === null)
  add('INVALID_TIMESTAMP', path, 'Expected a real canonical UTC millisecond timestamp');
 const now = clock.get('context/evaluated_at');
 const validTimes = [...clock.values()].every(v => v !== null);
 let stale = false, timeInvalid = !validTimes;
 if (validTimes) {
  for (const [path, time] of clock) {
   if (time > now + context.max_clock_skew_ms) {
    timeInvalid = true; add('FUTURE_TIMESTAMP', path, 'Evidence is beyond the permitted clock skew');
   }
   if (now - time > context.max_age_ms) stale = true;
  }
  for (let i = 0; i < batch.events.length; i++) {
   const occurred = clock.get('batch/events/' + i + '/occurred_at');
   const observed = clock.get('batch/events/' + i + '/observed_at');
   if (occurred > observed + context.max_clock_skew_ms) {
    timeInvalid = true; add('OBSERVATION_ORDER', 'batch/events/' + i, 'Observation precedes occurrence beyond permitted skew');
   }
  }
 }
 if (stale) add('OBSERVATION_STALE', 'freshness', 'At least one required timestamp exceeds max age');
 state.freshness = configurationChanged ? 'invalidated' : timeInvalid ? 'unknown' : stale ? 'stale' : 'fresh';

 const toolMap = new Map();
 for (const [i, tool] of manifest.tools.entries()) {
  if (toolMap.has(tool.tool_id)) add('AMBIGUOUS_TOOL_MAPPING', 'manifest/tools/' + i, 'Tool IDs must be unique');
  toolMap.set(tool.tool_id, tool);
  if (!b.bundle.policy.capabilities.includes(tool.capability) || tool.capability !== 'filesystem.write.scoped')
   add('UNSUPPORTED_OPERATION', 'manifest/tools/' + i, 'Only explicit scoped filesystem writes are supported');
 }
 for (const [i, edge] of manifest.handoffs.entries()) {
  if (!b.roles.has(edge.from_role_id) || !b.roles.has(edge.to_role_id))
   add('UNKNOWN_HANDOFF_ROLE', 'manifest/handoffs/' + i, 'Handoff roles must exist in the bundle');
 }
 const byId = new Map(), bySequence = new Map(), events = [];
 for (const [i, event] of batch.events.entries()) {
  const path = 'batch/events/' + i;
  const previous = byId.get(event.event_id);
  if (previous) {
   if (canonical(previous) !== canonical(event))
    add('EVENT_ID_CONFLICT', path, 'The same event ID contains conflicting content');
   continue;
  }
  byId.set(event.event_id, event);
  if (bySequence.has(event.sequence))
   add('SEQUENCE_CONFLICT', path, 'Different event IDs claim the same source sequence');
  bySequence.set(event.sequence, event);
  events.push([event, path]);
 }
 const sequences = [...bySequence.keys()].sort((a, b) => a - b);
 const contiguous = sequences.length > 0 && sequences[0] === batch.sequence_start &&
  sequences.at(-1) === batch.sequence_end && sequences.every((v, i) => !i || v === sequences[i - 1] + 1);
 if (!batch.complete || batch.dropped_events || !contiguous)
  add('EVIDENCE_GAP', 'batch', 'Incomplete run, dropped events, or noncontiguous sequence window');
 // A caller's complete flag is a claim, never proof of source coverage.
 state.coverage = 'declared_' + (batch.complete && !batch.dropped_events && contiguous ? 'complete' : 'incomplete');
 const bindingInvalid = errors.some(e => ['RUNTIME_SUBJECT_MISMATCH', 'RUN_MISMATCH', 'CONFIG_BASELINE_CHANGED'].includes(e.code));
 if (bindingInvalid) {
  state.supplied_conformance = 'unknown';
  return finish(errors);
 }
 for (const [event, path] of events) {
  if (event.subject_digest !== match) {
   add('RUNTIME_SUBJECT_MISMATCH', path + '/subject_digest', 'Event belongs to a different subject');
   continue;
  }
  const role = b.roles.get(event.actor_role_id);
  if (!role || role.status !== 'active') {
   add('UNKNOWN_ACTOR_ROLE', path + '/actor_role_id', 'Expected an active declared role');
   continue;
  }
  if (event.type === 'write') {
   const tool = toolMap.get(event.details.tool_id);
   if (!tool || tool.capability !== 'filesystem.write.scoped') {
    add('UNSUPPORTED_OPERATION', path + '/details/tool_id', 'No supported explicit tool mapping');
    continue;
   }
   if (!t.route.executors.includes(role.id) ||
       !['operator', 'write_scoped'].includes(role.authority.authority_mode) ||
       !role.authority.capabilities.includes(tool.capability) ||
       role.authority.prohibited_capabilities.includes(tool.capability))
    add('TOOL_CAPABILITY_MISMATCH', path, 'Actor cannot perform this declared capability', 'violation');
   if (!scopeContains(t.task.inputs.scope, event.details.path) ||
       !role.authority.allowed_write_scopes.some(s => scopeContains(s, event.details.path)))
    add('WRITE_SCOPE_VIOLATION', path + '/details/path', 'Observed path leaves the declared scope', 'violation');
   if (subject.action.kind !== 'filesystem-write') {
    add('UNSUPPORTED_OPERATION', 'action/kind', 'Only filesystem-write actions are supported');
   } else {
    const mapping = await validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, JSON.stringify({
     schema_version: '0.1', subject_digest: match, operation: 'write_file',
     path: event.details.path, content_sha256: event.details.content_sha256,
    }));
    for (const error of mapping.errors)
     add(error.code, path + '/' + error.path, error.message, 'violation');
   }
  } else if (event.type === 'handoff') {
   const to = event.details.to_role_id;
   if (!manifest.handoffs.some(edge => edge.from_role_id === role.id && edge.to_role_id === to) ||
       !t.route.executors.includes(role.id) || !t.route.reviewers.includes(to))
    add('HANDOFF_ROUTE_MISMATCH', path, 'Review handoff must be explicit and go from a routed executor to reviewer', 'violation');
   // A review handoff is not delegation of execution authority.
  } else {
   if (!t.route.reviewers.includes(role.id) || !role.authority.capabilities.includes('review.perform'))
    add('REVIEW_ROLE_MISMATCH', path, 'Review must use a routed reviewer capability', 'violation');
   const execution = byId.get(event.details.executor_event_id);
   if (!execution || execution.type !== 'write' || execution.subject_digest !== match) {
    add('REVIEW_EXECUTION_MISSING', path, 'Review requires a write event of the current subject');
   } else if (execution.sequence >= event.sequence) {
    add('REVIEW_ORDER', path, 'Referenced write must precede review in this source sequence', 'violation');
   } else if (execution.principal_id === event.principal_id) {
    add('REVIEW_PRINCIPAL_CONFLICT', path, 'Supplied executor and reviewer principals are identical', 'violation');
   }
  }
 }
 state.supplied_conformance = state.findings.some(f => f.category === 'violation')
  ? 'violation' : errors.length ? 'unknown' : 'matching';
 // No self-attested flag can upgrade this experiment into authenticated observation.
 // Matching declarations may still describe fictional, sampled, or omitted events.
 return finish(errors);
}
