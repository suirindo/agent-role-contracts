/** Synthetic same-permission comparison + explicitly selected isolated enforcement. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, lstatSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupPilot } from './write-pilot-fixtures.mjs';
import { supportedHost } from './write-pilot.mjs';
import { submitReferenceWorker, runReferenceWorker } from './write-pilot-channel.mjs';
if (!supportedHost(tmpdir())) throw Error('UNSUPPORTED_HOST: Linux Node24 overlayfs required');
const parent = mkdtempSync(join(tmpdir(), 'arc-write-comparison-'));
function snapshot(path) {
 const s = lstatSync(path);
 return s.isSymbolicLink() ? ['link', readlinkSync(path)] : s.isDirectory() ?
  Object.fromEntries(readdirSync(path).sort().map(v => [v, snapshot(join(path, v))])) :
  ['bytes', readFileSync(path).toString('hex')];
}
const cases = [
 { name: 'legitimate', expected: [true, true] },
 { name: 'different-content', expected: [true, false], mutate(s) { s.request.bytes = Buffer.from('unreviewed bytes'); } },
 { name: 'different-allowed-path', expected: [true, false], mutate(s) { s.request.path = 'src/other.mjs'; } },
 { name: 'native-read-only', expected: [false, false], alter(c) { c.native.write = false; } },
 { name: 'native-path-deny', expected: [false, false], alter(c) { c.native.paths = []; } },
 { name: 'actual-reviewer-with-coarse-native-write', expected: [true, false], alter(c) {
  c.role = 'reviewer'; c.assignments = [{ role: c.role, principal: c.principal, task: c.task.id, run: c.run }];
 } },
 { name: 'revoked-test-approval', expected: [true, false], mutate(s) { s.authority.revoke(s.approval); } },
 { name: 'verifier-stopped', expected: [true, false], mutate(s) { s.authority.setFault('stopped'); } },
 { name: 'unknown-operation', expected: [false, false], mutate(s) { s.request.operation = 'delete_file'; } },
 { name: 'traversal', expected: [false, false], mutate(s) { s.request.path = '../sentinel'; } },
 { name: 'existing-destination', expected: [false, false], mutate(s) { writeFileSync(join(s.workspace.root, s.request.path), 'existing'); } },
 { name: 'symlink-destination', expected: [false, false], mutate(s) { symlinkSync(join(parent, 'sentinel'), join(s.workspace.root, s.request.path)); } },
];
const results = [];
try {
 writeFileSync(join(parent, 'sentinel'), 'untouched');
 // Complete replay/shadow phase first. These are never counted as prevented writes.
 for (const definition of cases) {
  const s = await setupPilot(parent, { mode: 'shadow', alter: definition.alter });
  definition.mutate?.(s);
  const before = snapshot(parent), r = await s.channel.submit(s.request);
  assert.equal(r.outcome === 'shadow_would_allow', definition.expected[1], definition.name + JSON.stringify(r));
  assert.deepEqual(snapshot(parent), before); assert.equal(s.host.stats().executorCalls, 0);
 }
 // Then two distinct fresh host-owned roots per case, same native permissions.
 for (const definition of cases) {
  const pair = [];
  for (const [index, comparison] of ['native-only', 'arc'].entries()) {
   const s = await setupPilot(parent, { comparison, alter: definition.alter });
   definition.mutate?.(s);
   const before = snapshot(parent), r = await s.channel.submit(s.request);
   const allowed = r.outcome === 'committed';
   assert.equal(allowed, definition.expected[index], definition.name + JSON.stringify(r));
   if (!allowed) { assert.deepEqual(snapshot(parent), before); assert.equal(s.host.stats().executorCalls, 0); }
   else assert.deepEqual(readFileSync(join(s.workspace.root, s.request.path)), s.request.bytes);
   pair.push({ allowed, outcome: r.outcome, reason: r.reason, elapsed_ms: r.elapsed_ms,
    executor_calls: s.host.stats().executorCalls, native_permissions: s.context.native });
  }
  assert.deepEqual(pair[0].native_permissions, pair[1].native_permissions);
  results.push({ case: definition.name, native_only: pair[0], native_plus_arc: pair[1],
   additional_component: definition.name === 'different-content' || definition.name === 'different-allowed-path' ? 'G2_real_request_mapping' :
    definition.name === 'actual-reviewer-with-coarse-native-write' ? 'host_actor_eligibility_bridge' :
    ['revoked-test-approval', 'verifier-stopped'].includes(definition.name) ? 'host_test_authority_verifier' : null,
   classification: pair[0].allowed && !pair[1].allowed ? 'pilot_added_rejection' :
    !pair[0].allowed ? 'native_also_rejected' : 'legitimate_accepted' });
 }
 const s = await setupPilot(parent);
 const before = snapshot(parent), probes = runReferenceWorker({ probe: join(parent, 'sentinel') });
 assert.ok(Object.values(probes.denied).every(Boolean)); assert.deepEqual(snapshot(parent), before);
 const receipt = await submitReferenceWorker(s.channel, s.request);
 assert.equal(receipt.outcome, 'committed');
 const after = snapshot(parent);
 assert.equal((await submitReferenceWorker(s.channel, s.request)).outcome, 'rejected_before_execution');
 assert.deepEqual(snapshot(parent), after); assert.equal(s.host.stats().executorCalls, 1);
 const valid = results.find(r => r.case === 'legitimate');
 console.log(JSON.stringify({ profile: 'runtime-write-pilot/0.1', evidence_class: 'SYNTHETIC_LABORATORY',
  environment: { platform: process.platform, arch: process.arch, node: process.version, filesystem: 'overlayfs' },
  shadow: { cases: cases.length, prevented_writes_counted: 0, executor_calls: 0 },
  enforcement: { cases: results.length, native_also_rejected: results.filter(r => r.classification === 'native_also_rejected').length,
   pilot_added_rejection: results.filter(r => r.classification === 'pilot_added_rejection').length,
   legitimate_false_rejections: 0, unknown: 0 },
  transport: { worker_permission_probes: probes, result: receipt, replay_rejected: true, actual_creations: 1 },
  results,
  measurement: { method: 'single sequential host submission wall time; includes validation and sync file I/O; excludes provisioning and worker startup',
   legitimate_native_ms: valid.native_only.elapsed_ms, legitimate_arc_ms: valid.native_plus_arc.elapsed_ms,
   added_latency_ms: valid.native_plus_arc.elapsed_ms - valid.native_only.elapsed_ms,
   repetitions: 1, human_setup_minutes: 'UNMEASURED', human_maintenance_minutes: 'UNMEASURED', human_recheck_minutes: 'UNMEASURED' },
  second_real_task: { executed: false, keep_decision: 'UNMEASURED', reason: 'No second actual operator task; fixtures do not establish adoption' },
  product_decision: 'Keep experimental; synthetic differences versus coarse native permissions do not establish benefit over a full approval broker or justify productization',
  protected_sentinel_unchanged: readFileSync(join(parent, 'sentinel'), 'utf8') === 'untouched',
  independent_effect_observer: false, durable_replay_prevention: false, production_enabled: false,
 }, null, 2));
} finally { rmSync(parent, { recursive: true, force: true }); }
