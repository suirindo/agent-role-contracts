import { readFileSync } from 'node:fs';
import { describeTaskAction } from '../../src/action-binding.mjs';
import { makeScenario, scenarios } from '../../examples/cross-domain/scenarios.mjs';

const load = name => JSON.parse(readFileSync(new URL('../../examples/' + name + '.json', import.meta.url), 'utf8'));
export async function fixture(definition = scenarios[0]) {
 const data = makeScenario(definition, { bundle: load('starter-bundle'), task: load('starter-task'), handoff: load('handoff') });
 const action = { schema_version: '0.3', id: 'write-1', kind: 'filesystem-write',
  parameters: { path: definition.scope, content_sha256: 'sha256:' + 'a'.repeat(64) } };
 const subject = await describeTaskAction(...[data.bundle, data.task, action].map(JSON.stringify));
 if (!subject.valid) throw Error(JSON.stringify(subject.errors));
 const time = '2026-10-15T05:00:00.000Z', inventory = 'sha256:' + 'b'.repeat(64);
 const manifest = {
  profile: 'runtime-conformance-spike/0.1', subject_digest: subject.subject_digest,
  runtime_revision: 'fixture-v1', inventory_digest: inventory, captured_at: time,
  tools: [{ tool_id: 'write-file', capability: 'filesystem.write.scoped', operation: 'write_file' }],
  handoffs: [{ from_role_id: 'implementer', to_role_id: 'reviewer' }],
 };
 const event = (event_id, sequence, type, role, principal, details) => ({
  event_id, sequence, type, actor_role_id: role, principal_id: principal, details,
  subject_digest: subject.subject_digest, occurred_at: time, observed_at: time,
 });
 const batch = {
  run_id: 'fixture-run-1', subject_digest: subject.subject_digest,
  runtime_revision: 'fixture-v1', inventory_digest: inventory,
  source_id: 'fixture-collector', source_epoch: 'epoch-1', sequence_start: 1, sequence_end: 3,
  complete: true, dropped_events: 0,
  events: [
   event('write-1', 1, 'write', 'implementer', 'person-a', { tool_id: 'write-file', ...action.parameters }),
   event('handoff-1', 2, 'handoff', 'implementer', 'person-a', { to_role_id: 'reviewer' }),
   event('review-1', 3, 'review', 'reviewer', 'person-b', { executor_event_id: 'write-1' }),
  ],
 };
 const context = { run_id: batch.run_id, runtime_revision: 'fixture-v1', inventory_digest: inventory,
  evaluated_at: '2026-10-15T05:01:00.000Z', max_age_ms: 300000, max_clock_skew_ms: 1000 };
 return { bundle: data.bundle, task: data.task, action, manifest, batch, context };
}
export const args = s => [s.bundle, s.task, s.action, s.manifest, s.batch, s.context].map(JSON.stringify);
