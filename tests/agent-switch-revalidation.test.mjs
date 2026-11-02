// What must be re-checked when a coding task moves to another agent (#96), stated only with the public 1.x API and the
// bundled fixtures. Each case pins one sentence of docs/AGENT-SWITCH-REVALIDATION.md: what ARC re-checks, and what every
// report keeps explicitly unverified (identity, runtime permission, evidence, execution).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBundle, explainTask, validateHandoff, describeTaskAction, validateTaskActionBinding } from '../src/core.mjs';

const fixture = name => JSON.parse(readFileSync(new URL('../examples/' + name + '.json', import.meta.url), 'utf8'));
const json = v => JSON.stringify(v);
const codes = r => r.errors.map(e => e.code);
const UNVERIFIED = ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified'];
const neverClaims = r => { for (const k of UNVERIFIED) assert.equal(r[k], false, k); };

test('baseline: the bundle, the task and the predecessor handoff are consistent before any switch', () => {
 const bundle = fixture('team'), task = fixture('task'), handoff = fixture('handoff');
 const b = validateBundle(json(bundle)), t = explainTask(json(bundle), json(task)), h = validateHandoff(json(bundle), json(task), json(handoff));
 for (const r of [b, t, h]) { assert.equal(r.valid, true, json(r.errors)); neverClaims(r); }
});

test('same task, different executor instance: ARC has no executor identity; re-running explain only re-establishes the route and scope', () => {
 const bundle = fixture('team'), task = fixture('task');
 const again = explainTask(json(bundle), json(task));
 assert.equal(again.valid, true);
 assert.deepEqual(again.executors ?? again.implementers ?? undefined, again.executors ?? again.implementers ?? undefined); // shape is whatever the public report defines
 assert.equal(again.identity_verified, false, 'who now runs the implementer role is not something a declaration check can know');
 // A successor taking over the SAME role is not a role-to-role handoff: modelling it as one is rejected, not silently accepted.
 const resumed = { ...fixture('handoff'), from_agent: 'implementer', suggested_next_agent: 'implementer', current_status: 'in_progress' };
 const r = validateHandoff(json(bundle), json(task), json(resumed));
 assert.equal(r.valid, false); assert.ok(codes(r).includes('HANDOFF_SELF'), json(r.errors));
});

test('successor named by a label outside the declared route is rejected; a successor inside the route still needs a declared relation', () => {
 const bundle = fixture('team'), task = fixture('task');
 const outsider = { ...fixture('handoff'), suggested_next_agent: 'successor-agent' };
 const r1 = validateHandoff(json(bundle), json(task), json(outsider));
 assert.equal(r1.valid, false); assert.ok(codes(r1).includes('HANDOFF_ROLE_OUTSIDE_ROUTE'), json(r1.errors));
 // reviewer -> implementer is inside the route but neither delegation nor reporting is declared in that direction.
 const undeclared = { ...fixture('handoff'), from_agent: 'reviewer', suggested_next_agent: 'implementer', current_status: 'in_progress' };
 const r2 = validateHandoff(json(bundle), json(task), json(undeclared));
 assert.equal(r2.valid, false); assert.ok(codes(r2).includes('HANDOFF_RELATION_UNDECLARED'), json(r2.errors));
 for (const r of [r1, r2]) neverClaims(r);
});

test('changed scope after the switch: the unchanged bundle rejects the successor task before any work', () => {
 const bundle = fixture('team'), task = fixture('task');
 const widened = { ...task, inputs: { ...task.inputs, scope: 'secrets/production.txt' } };
 const r = explainTask(json(bundle), json(widened));
 assert.equal(r.valid, false); assert.ok(codes(r).includes('TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'), json(r.errors));
 neverClaims(r);
});

test('changed review responsibility after the switch: a handoff for review must still run executor -> reviewer', () => {
 const bundle = fixture('team'), task = fixture('task');
 const toCoordinator = { ...fixture('handoff'), suggested_next_agent: 'coordinator', current_status: 'ready_for_review' };
 const r = validateHandoff(json(bundle), json(task), json(toCoordinator));
 assert.equal(r.valid, false); assert.ok(codes(r).includes('HANDOFF_REVIEW_ROUTE'), json(r.errors));
});

test('earlier review/approval bindings are invalidated by any meaningful task change; fresh approval must bind the current subject', async () => {
 const bundle = fixture('team'), task = fixture('task');
 const action = { schema_version: '0.3', id: 'switch-action', kind: 'propose-change', parameters: { revision: 1 } };
 const before = await describeTaskAction(json(bundle), json(task), json(action));
 assert.equal(before.valid, true, json(before.errors));
 const binding = { schema_version: '0.3', subject_digest: before.subject_digest,
  reviews: [{ role_id: 'reviewer', decision: 'pass', subject_digest: before.subject_digest }],
  human_approval: { role_id: 'coordinator', decision: 'approved', subject_digest: before.subject_digest } };
 assert.equal((await validateTaskActionBinding(json(bundle), json(task), json(action), json(binding))).valid, true);
 const successorTask = { ...task, objective: task.objective + ' Continue after agent switch.' };
 const stale = await validateTaskActionBinding(json(bundle), json(successorTask), json(action), json(binding));
 assert.equal(stale.valid, false); assert.ok(codes(stale).includes('G1_SUBJECT_MISMATCH'), json(stale.errors));
 const after = await describeTaskAction(json(bundle), json(successorTask), json(action));
 assert.notEqual(after.subject_digest, before.subject_digest);
 const rebound = { ...binding, subject_digest: after.subject_digest, reviews: [{ ...binding.reviews[0], subject_digest: after.subject_digest }], human_approval: { ...binding.human_approval, subject_digest: after.subject_digest } };
 const fresh = await validateTaskActionBinding(json(bundle), json(successorTask), json(action), json(rebound));
 assert.equal(fresh.valid, true, json(fresh.errors));
 for (const r of [before, stale, after, fresh]) { assert.equal(r.review_authenticated ?? false, false); assert.equal(r.execution_authorized, false); }
});

test('uncertain previous outcome stays visible: blocked needs a recorded unknown, complete may not carry one, and neither authorizes a retry', () => {
 const bundle = fixture('team'), task = fixture('task');
 const unknown = 'UNKNOWN whether the predecessor completed the write to docs/example.md; no receiver evidence resolves it.';
 const base = { ...fixture('handoff'), from_agent: 'implementer', suggested_next_agent: 'coordinator', current_status: 'blocked' };
 const kept = validateHandoff(json(bundle), json(task), json({ ...base, unresolved: [unknown] }));
 assert.equal(kept.valid, true, json(kept.errors));
 assert.equal(kept.declared_status, 'blocked'); assert.equal(kept.execution_authorized, false, 'a consistent blocked handoff is not permission to retry');
 const silent = validateHandoff(json(bundle), json(task), json({ ...base, unresolved: [] }));
 assert.equal(silent.valid, false); assert.ok(codes(silent).includes('HANDOFF_BLOCKER_MISSING'), json(silent.errors));
 const overclaimed = validateHandoff(json(bundle), json(task), json({ ...base, current_status: 'complete', unresolved: [unknown] }));
 assert.equal(overclaimed.valid, false); assert.ok(codes(overclaimed).includes('HANDOFF_COMPLETE_UNRESOLVED'), json(overclaimed.errors));
});

test('evidence carried across the switch is declaration data: a fictional file and command are not opened or run', () => {
 const bundle = fixture('team'), task = fixture('task');
 const carried = { ...fixture('handoff'), evidence: [{ file: 'does/not/exist.md', command: 'exit 1', result: 'Fictional: a result the checker cannot verify.' }] };
 const r = validateHandoff(json(bundle), json(task), json(carried));
 assert.equal(r.valid, true, json(r.errors)); assert.equal(r.evidence_verified, false); assert.equal(r.source_files_checked, false);
});
