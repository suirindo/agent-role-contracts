// Stop gate (experiments/stop-gate): a stop is recorded consistently or rejected; nothing is verified or authorized.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../src/core.mjs';
import { evaluateStop, exitCodeFor, renderText, PROFILE } from '../experiments/stop-gate/stop-gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = name => JSON.parse(readFileSync(join(root, 'examples', name + '.json'), 'utf8'));
const bundle = fixture('team'), task = fixture('task'), base = fixture('handoff'), criterion = task.acceptance_criteria[0];
const gate = (handoff, t = task, b = bundle) => evaluateStop({ bundleJson: JSON.stringify(b), taskJson: JSON.stringify(t), handoffJson: typeof handoff === 'string' ? handoff : JSON.stringify(handoff) }, core);
const codes = r => r.errors.map(e => e.code);
const accepted = { ...base, completed: [...base.completed, criterion] };
const blocked = { ...base, current_status: 'blocked', suggested_next_agent: 'coordinator', unresolved: [criterion, 'UNKNOWN whether the earlier edit was saved.'], required_next_action: 'Coordinator confirms the file state and resumes or reassigns.' };
const NEVER = ['work_verified', 'tests_rerun', 'evidence_opened', 'author_authenticated', 'next_agent_notified', 'execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified'];

test('a review handoff that accounts for every criterion is ACCEPT_HANDOFF and still a valid stable 0.1 handoff', () => {
 const r = gate(accepted);
 assert.equal(r.decision, 'ACCEPT_HANDOFF'); assert.equal(r.valid, true); assert.equal(r.profile, PROFILE); assert.equal(exitCodeFor(r), 0);
 assert.deepEqual(r.criteria, [{ index: 0, state: 'completed' }]); assert.equal(r.criteria_completed, 1); assert.equal(r.core.valid, true);
 for (const k of NEVER) assert.equal(r[k], false, k);
 assert.equal(core.validateHandoff(JSON.stringify(bundle), JSON.stringify(task), JSON.stringify(accepted)).valid, true, 'the convention adds no schema field');
});

test('a complete stop needs every criterion completed, no unresolved item and anchored evidence', () => {
 const done = { ...accepted, current_status: 'complete', suggested_next_agent: 'coordinator' };
 const r = gate(done); assert.equal(r.decision, 'ACCEPT_COMPLETE'); assert.equal(exitCodeFor(r), 0);
 const unanchored = gate({ ...done, evidence: [{ result: 'All done.' }] });
 assert.equal(unanchored.decision, 'REJECT'); assert.deepEqual(codes(unanchored), ['STOP_EVIDENCE_UNANCHORED']);
 const withUnmet = gate({ ...done, completed: base.completed, unresolved: [criterion] });
 assert.ok(codes(withUnmet).includes('STOP_COMPLETE_WITH_UNMET_CRITERION')); assert.ok(codes(withUnmet).includes('HANDOFF_COMPLETE_UNRESOLVED'), 'the core rule stays visible next to the gate rule');
 assert.equal(withUnmet.errors.find(e => e.code === 'HANDOFF_COMPLETE_UNRESOLVED').source, 'core');
});

test('vague unilateral stops are rejected with every reason at once', () => {
 const r = gate({ ...base, current_status: 'in_progress', suggested_next_agent: 'coordinator', unresolved: [], required_next_action: 'none' });
 assert.equal(r.decision, 'REJECT'); assert.equal(exitCodeFor(r), 1);
 assert.deepEqual(codes(r).sort(), ['STOP_CRITERION_UNACCOUNTED', 'STOP_IN_PROGRESS_WITHOUT_UNRESOLVED', 'STOP_NEXT_ACTION_PLACEHOLDER']);
 assert.deepEqual(r.criteria, [{ index: 0, state: 'unaccounted' }]);
 for (const placeholder of ['TBD', 'n/a', 'N/A.', '-', '...', 'なし', '未定', 'continue', 'see above', '']) {
  const p = gate({ ...blocked, required_next_action: placeholder || 'x' });
  if (placeholder) assert.ok(codes(p).includes('STOP_NEXT_ACTION_PLACEHOLDER'), JSON.stringify(placeholder));
 }
 assert.ok(!codes(gate({ ...blocked, required_next_action: 'Rerun npm test on the current tree and attach the summary.' })).includes('STOP_NEXT_ACTION_PLACEHOLDER'));
 assert.ok(!codes(gate({ ...accepted, current_status: 'complete', suggested_next_agent: 'coordinator', required_next_action: 'none' })).includes('STOP_NEXT_ACTION_PLACEHOLDER'), 'complete may have no next action');
});

test('the criteria ledger: verbatim copy, exclusive placement, review needs them all met', () => {
 const conflict = gate({ ...accepted, unresolved: [criterion], current_status: 'in_progress', suggested_next_agent: 'coordinator' });
 assert.ok(codes(conflict).includes('STOP_CRITERION_CONFLICT')); assert.deepEqual(conflict.criteria, [{ index: 0, state: 'conflict' }]);
 const paraphrased = gate({ ...base, completed: ['the change and open questions are stated'] });
 assert.deepEqual(codes(paraphrased), ['STOP_CRITERION_UNACCOUNTED'], 'case and wording must match the task text exactly');
 const review = gate({ ...base, unresolved: [criterion] });
 assert.ok(codes(review).includes('STOP_REVIEW_WITH_UNMET_CRITERION'));
 const multi = { ...task, acceptance_criteria: [criterion, 'Tests pass on the current tree.'] };
 const partial = gate({ ...blocked, unresolved: ['Tests pass on the current tree.', 'UNKNOWN: ...'], completed: [...base.completed, criterion] }, multi);
 assert.equal(partial.decision, 'ACCEPT_HANDOFF'); assert.equal(partial.criteria_completed, 1); assert.equal(partial.criteria_total, 2);
});

test('blocked and in_progress stops are accepted only with recorded unresolved items; the record is not permission to retry', () => {
 const r = gate(blocked); assert.equal(r.decision, 'ACCEPT_HANDOFF'); assert.equal(r.unresolved_count, 2); assert.equal(r.execution_authorized, false);
 const silent = gate({ ...blocked, unresolved: [] });
 assert.ok(codes(silent).includes('HANDOFF_BLOCKER_MISSING')); assert.ok(codes(silent).includes('STOP_CRITERION_UNACCOUNTED'));
 const progressing = gate({ ...blocked, current_status: 'in_progress' }); assert.equal(progressing.decision, 'ACCEPT_HANDOFF');
});

test('core rejections stay visible and the gate never upgrades them: wrong route, self handoff, malformed JSON', () => {
 const outsider = gate({ ...accepted, suggested_next_agent: 'ghost' }); assert.ok(codes(outsider).includes('HANDOFF_ROLE_OUTSIDE_ROUTE')); assert.equal(outsider.decision, 'REJECT');
 const self = gate({ ...accepted, suggested_next_agent: 'implementer' }); assert.ok(codes(self).includes('HANDOFF_SELF'));
 const malformed = gate('{'); assert.equal(malformed.decision, 'REJECT'); assert.ok(malformed.errors.length >= 1); assert.equal(malformed.declared_status, null); assert.deepEqual(malformed.criteria, task.acceptance_criteria.map((c, index) => ({ index, state: 'unaccounted' })));
 const noStatus = gate({ ...accepted, current_status: 7 }); assert.equal(noStatus.decision, 'REJECT'); assert.equal(noStatus.declared_status, null);
});

test('text rendering names the decision, the ledger and the unverified boundary; evaluateStop needs a core', () => {
 const text = renderText(gate(blocked));
 assert.match(text, /^ACCEPT: stop-gate ACCEPT_HANDOFF status=blocked task=example-task-001 from=implementer next=coordinator criteria=0\/1 unresolved=2\n/);
 assert.match(text, /remain unverified\.\n$/);
 const rejected = renderText(gate({ ...blocked, unresolved: [] }));
 assert.match(rejected, /^REJECT: stop-gate REJECT /); assert.match(rejected, /\ncore: HANDOFF_BLOCKER_MISSING handoff\/unresolved: /); assert.match(rejected, /\nstop-gate: STOP_CRITERION_UNACCOUNTED handoff\/completed: /);
 assert.ok(rejected.indexOf('handoff/completed') < rejected.indexOf('handoff/unresolved'), 'findings are ordered by path, then code, regardless of source');
 assert.throws(() => evaluateStop({ bundleJson: '{}', taskJson: '{}', handoffJson: '{}' }, {}), /validateHandoff/);
});

const cli = join(root, 'experiments/stop-gate/cli.mjs');
const run = (args, opts = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 20000, ...opts });
const examples = ['--bundle', join(root, 'examples/team.json'), '--task', join(root, 'examples/task.json')];

test('CLI: exit 0 for an accepted stop, 1 for a rejected one, 2 for usage and input errors; symlinks and oversize inputs refused', t => {
 const dir = mkdtempSync(join(tmpdir(), 'arc-stop-gate-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
 const ok = join(dir, 'ok.json'); writeFileSync(ok, JSON.stringify(blocked));
 const bad = join(dir, 'bad.json'); writeFileSync(bad, JSON.stringify({ ...blocked, unresolved: [] }));
 let r = run([...examples, '--handoff', ok, '--format', 'text']); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^ACCEPT: stop-gate ACCEPT_HANDOFF/);
 r = run([...examples, '--handoff', ok]); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).decision, 'ACCEPT_HANDOFF');
 r = run([...examples, '--handoff', bad]); assert.equal(r.status, 1); assert.equal(JSON.parse(r.stdout).decision, 'REJECT');
 r = run([...examples]); assert.equal(r.status, 2); assert.match(r.stderr, /^STOP_GATE_ERROR: USAGE/);
 r = run([...examples, '--handoff', ok, '--format', 'yaml']); assert.equal(r.status, 2);
 r = run([...examples, '--handoff', join(dir, 'missing.json')]); assert.equal(r.status, 2); assert.match(r.stderr, /^STOP_GATE_ERROR: INPUT_UNREADABLE/);
 const link = join(dir, 'link.json'); try { symlinkSync(ok, link); } catch { return; }
 r = run([...examples, '--handoff', link]); assert.equal(r.status, 2); assert.match(r.stderr, /INPUT_SYMLINK_REFUSED/);
 const big = join(dir, 'big.json'); writeFileSync(big, '{' + '"x":"' + 'a'.repeat(1024 * 1024) + '"}');
 r = run([...examples, '--handoff', big]); assert.equal(r.status, 2); assert.match(r.stderr, /INPUT_TOO_LARGE/);
 r = run([...examples, '--handoff', ok, '--core', 'no-such-module-' + Date.now()]); assert.equal(r.status, 2); assert.match(r.stderr, /CORE_UNAVAILABLE/);
});

test('demo runs offline and ends with the expected sequence; the experiment leaves the public package untouched', () => {
 const r = spawnSync(process.execPath, [join(root, 'experiments/stop-gate/demo.mjs')], { encoding: 'utf8', timeout: 20000 });
 assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /Demo complete: ACCEPT -> REJECT \(expected\) -> REJECT \(expected\) -> ACCEPT\.\n$/);
 const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
 assert.ok(!pkg.files.includes('experiments')); assert.deepEqual(Object.keys(pkg.exports), ['.', './schemas/*', './core', './profiles/onchain-finance', './adapters/filesystem-write']);
 assert.ok(!Object.keys(pkg.scripts).some(s => /stop/.test(s)), 'no package script is added for the experiment');
});
