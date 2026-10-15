import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuntimeObservations as compare } from '../experiments/runtime-conformance/compare.mjs';
import { fixture, args } from '../experiments/runtime-conformance/fixtures.mjs';
import { scenarios } from '../examples/cross-domain/scenarios.mjs';

const code = (r, name) => assert.ok(r.errors.some(e => e.code === name), JSON.stringify(r));
const limitations = r => {
 for (const key of ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified',
  'content_bytes_verified', 'replay_protection_enforced', 'operational_acceptance'])
  assert.equal(r[key], false, key);
 assert.equal(r.observed_conformance, 'unknown');
};
for (const scenario of scenarios) test('cross-domain supplied matching and clean-pass drift: ' + scenario.id, async () => {
 const s = await fixture(scenario);
 const r = await compare(...args(s));
 assert.equal(r.valid, true, JSON.stringify(r)); assert.equal(r.supplied_conformance, 'matching');
 assert.equal(r.freshness, 'fresh'); limitations(r);
 s.batch.events[0].details.path = 'private/escape.txt';
 const drift = await compare(...args(s));
 assert.ok(drift.static_checks.every(v => v.valid)); assert.equal(drift.supplied_conformance, 'violation');
 code(drift, 'WRITE_SCOPE_VIOLATION'); limitations(drift);
});
const mutations = [
 ['inventory change', s => { s.context.inventory_digest = 'sha256:' + 'c'.repeat(64); }, 'CONFIG_BASELINE_CHANGED'],
 ['revision change', s => { s.context.runtime_revision = 'fixture-v2'; }, 'CONFIG_BASELINE_CHANGED'],
 ['stale subject', s => { s.task.objective += ' changed'; }, 'RUNTIME_SUBJECT_MISMATCH'],
 ['foreign run', s => { s.context.run_id = 'other-run'; }, 'RUN_MISMATCH'],
 ['foreign event subject', s => { s.batch.events[0].subject_digest = 'sha256:' + 'c'.repeat(64); }, 'RUNTIME_SUBJECT_MISMATCH'],
 ['dropped event', s => { s.batch.dropped_events = 1; }, 'EVIDENCE_GAP'],
 ['missing event', s => { s.batch.events.splice(1, 1); }, 'EVIDENCE_GAP'],
 ['unfinished run', s => { s.batch.complete = false; }, 'EVIDENCE_GAP'],
 ['unsupported tool', s => { s.batch.events[0].details.tool_id = 'shell'; }, 'UNSUPPORTED_OPERATION'],
 ['ambiguous tool', s => { s.manifest.tools.push({ ...s.manifest.tools[0] }); }, 'AMBIGUOUS_TOOL_MAPPING'],
 ['unknown operation semantics', s => { s.manifest.tools[0].capability = 'filesystem.read'; }, 'UNSUPPORTED_OPERATION'],
 ['reviewer writes', s => { s.batch.events[0].actor_role_id = 'reviewer'; }, 'TOOL_CAPABILITY_MISMATCH'],
 ['handoff route', s => { s.manifest.handoffs = []; }, 'HANDOFF_ROUTE_MISMATCH'],
 ['self review principal', s => { s.batch.events[2].principal_id = 'person-a'; }, 'REVIEW_PRINCIPAL_CONFLICT'],
 ['review role', s => { s.batch.events[2].actor_role_id = 'implementer'; }, 'REVIEW_ROLE_MISMATCH'],
 ['review absent write', s => { s.batch.events[2].details.executor_event_id = 'not-present'; }, 'REVIEW_EXECUTION_MISSING'],
 ['stale snapshot', s => { s.manifest.captured_at = '2026-10-14T05:00:00.000Z'; }, 'OBSERVATION_STALE'],
 ['future event', s => { s.batch.events[0].occurred_at = '2026-10-16T05:00:00.000Z'; }, 'FUTURE_TIMESTAMP'],
 ['impossible timestamp', s => { s.context.evaluated_at = '2026-02-30T05:00:00.000Z'; }, 'INVALID_TIMESTAMP'],
 ['observation before occurrence', s => { s.batch.events[0].observed_at = '2026-10-15T04:59:50.000Z'; }, 'OBSERVATION_ORDER'],
 ['artifact mismatch', s => { s.batch.events[0].details.content_sha256 = 'sha256:' + 'c'.repeat(64); }, 'G2_CONTENT_MISMATCH'],
 ['sequence conflict', s => { s.batch.events[1].sequence = 1; }, 'SEQUENCE_CONFLICT'],
 ['event conflict', s => { s.batch.events.push({ ...s.batch.events[0], principal_id: 'other-person' }); }, 'EVENT_ID_CONFLICT'],
];
for (const [name, mutate, diagnostic] of mutations) test(name, async () => {
 const s = await fixture(); mutate(s);
 const r = await compare(...args(s)); assert.equal(r.valid, false); code(r, diagnostic); limitations(r);
});
test('duplicate identical events are idempotent regardless of JSON key order', async () => {
 const s = await fixture(), expected = await compare(...args(s));
 s.batch.events.push(Object.fromEntries(Object.entries(s.batch.events[0]).reverse()));
 assert.deepEqual(await compare(...args(s)), expected);
});
test('violation is retained alongside a gap and stale evidence', async () => {
 const s = await fixture(); s.batch.events[0].details.path = 'private/x'; s.batch.dropped_events = 1;
 s.manifest.captured_at = '2026-10-14T05:00:00.000Z';
 const r = await compare(...args(s));
 assert.equal(r.supplied_conformance, 'violation'); code(r, 'EVIDENCE_GAP'); code(r, 'OBSERVATION_STALE');
});
test('foreign batch is not interpreted as a current violation', async () => {
 const s = await fixture(); s.batch.run_id = 'old-run'; s.batch.events[0].details.path = 'private/x';
 const r = await compare(...args(s)); assert.equal(r.supplied_conformance, 'unknown');
 assert.equal(r.errors.some(e => e.code === 'WRITE_SCOPE_VIOLATION'), false);
});
test('no self-attested provenance upgrade is accepted', async () => {
 const s = await fixture(); s.batch.evidence_verified = true;
 const r = await compare(...args(s)); assert.equal(r.valid, false); limitations(r);
});
test('strict bounded JSON text on all six inputs without calling accessors', async () => {
 const a = args(await fixture()); let touched = 0;
 const evil = { get toJSON() { touched++; throw Error('executed'); } };
 for (let i = 0; i < a.length; i++) {
  for (const bad of [evil, '{"x":1,"\\u0078":2}', '{"x":9007199254740993}', '{"__proto__":{}}', '[', ' '.repeat(1048577)]) {
   const b = [...a]; b[i] = bad;
   const r = await compare(...b); assert.equal(r.valid, false); limitations(r);
  }
 }
 assert.equal(touched, 0);
});
test('closed event payload and bounded batch', async () => {
 const s = await fixture(); s.batch.events[0].details.command = 'never executed';
 assert.equal((await compare(...args(s))).valid, false);
 delete s.batch.events[0].details.command;
 s.batch.events = Array.from({ length: 257 }, () => s.batch.events[0]);
 assert.equal((await compare(...args(s))).valid, false);
});
test('deterministic with explicit evaluation time and event array reordering', async () => {
 const s = await fixture(); const expected = await compare(...args(s));
 assert.deepEqual(await compare(...args(s)), expected);
 s.batch.events.reverse(); assert.deepEqual(await compare(...args(s)), expected);
});
test('freshness thresholds are inclusive and configuration invalidates current evidence', async () => {
 const s = await fixture(); s.context.max_age_ms = 60000;
 assert.equal((await compare(...args(s))).freshness, 'fresh');
 s.context.max_age_ms = 59999; assert.equal((await compare(...args(s))).freshness, 'stale');
 s.context.runtime_revision = 'new'; assert.equal((await compare(...args(s))).freshness, 'invalidated');
});
test('unsupported action cannot pass when no write events are supplied', async () => {
 const s = await fixture(); s.action.kind = 'shell';
 const r = await compare(...args(s));
 code(r, 'G2_ACTION_KIND'); assert.equal(r.supplied_conformance, 'not_evaluated');
});
test('manifest cannot invent a reverse review handoff', async () => {
 const s = await fixture();
 s.manifest.handoffs = [{ from_role_id: 'reviewer', to_role_id: 'implementer' }];
 s.batch.events[1].actor_role_id = 'reviewer'; s.batch.events[1].details.to_role_id = 'implementer';
 code(await compare(...args(s)), 'HANDOFF_ROUTE_MISMATCH');
});
test('network and implicit wall clock are never used', async t => {
 const s = await fixture(), a = args(s);
 const originalFetch = globalThis.fetch, originalNow = Date.now;
 t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });
 globalThis.fetch = () => { throw Error('network'); };
 Date.now = () => { throw Error('implicit clock'); };
 assert.equal((await compare(...a)).supplied_conformance, 'matching');
});
