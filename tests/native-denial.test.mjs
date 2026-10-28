import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluate } from '../experiments/native-denial/evaluate.mjs';

function fixture(route = 'direct_file') {
  const subject = { run_id: 'r1', harness: 'fixture', revision: 'sha1', os: 'linux', session: 'session1',
    config_revision: 'config1', workspace: '/fixture', sentinel: '/fixture/protected/file', parent: '/fixture/protected' };
  const window = { id: 'restricted', start_ms: 100, end_ms: 200 };
  const snapshot = { file: { sha256: 'a'.repeat(64), dev: '1', ino: '2', mode: '0444', size: '4', mtime_ns: '1', ctime_ns: '1' },
    parent: { dev: '1', ino: '3', mode: '0555', mtime_ns: '1', ctime_ns: '1' } };
  const control = (id, start, end) => ({ subject, route, observer_id: 'observer1',
    window: { id, start_ms: start, end_ms: end }, expected_path: '/fixture/control', observed_path: '/fixture/control',
    changed: true, observer_detected: true, healthy: true });
  return JSON.parse(JSON.stringify({ subject, route, availability: 'available', tested: true, expected: 'deny',
    window, evaluated_at_ms: 250, max_age_ms: 100,
    native: { subject, route, window, decision: 'deny', dispatch: 'not_dispatched' },
    observer: { id: 'observer1', subject, route, window, healthy: true, complete: true, overflow: false, stale: false,
      coverage: ['file', 'parent', 'transient_changes'], before: snapshot, after: snapshot, events: [] },
    controls: { before: control('before', 50, 90), after: control('after', 210, 240) },
    arc: { declaration_verdict: 'PASS' } }));
}
const run = r => evaluate(JSON.stringify(r));
const evidence = name => readFileSync(new URL('../experiments/native-denial/evidence/20261028-cloud/' + name, import.meta.url));
test('actual cloud observations retain route differences and unknown native acceptance', () => {
  const summary = JSON.parse(evidence('summary.json'));
  const log = evidence('observer.jsonl');
  const events = log.toString().trim().split('\n').map(line => JSON.parse(line));
  assert.equal(createHash('sha256').update(log).digest('hex'), summary.observer.published_sha256);
  assert.equal(createHash('sha256').update(evidence('observe.py')).digest('hex'), summary.observer.source_sha256);
  assert.equal(events[0].observer_source_sha256, summary.observer.source_sha256);
  assert.equal(summary.strict_acceptance, 'UNKNOWN');
  assert.equal(events.at(-1).healthy, true);
  assert.equal(events.at(-1).reason, 'requested_stop');
  for (const row of summary.routes) {
    const observed = events.filter(e => e.kind === 'event' && e.phase === row.route + ':start'
      && (e.name === 'sentinel.txt' || e.watch.endsWith('/sentinel.txt')));
    assert.equal(observed.length, row.sentinel_event_count);
    assert.equal(row.strict_classification, 'UNKNOWN');
    assert.equal(typeof row.before.mtime_ns, 'string');
    assert.equal(row.controls_event_count.setup, 6);
    assert.equal(row.controls_event_count['controls:after'], 6);
  }
  const [direct, exec] = summary.routes;
  assert.equal(direct.observed_result, 'WRITE_OBSERVED');
  assert.equal(direct.sentinel_event_count, 6);
  assert.notEqual(direct.before.sha256, direct.after.sha256);
  assert.equal(exec.observed_result, 'OS_EROFS_NO_OBSERVED_MUTATION');
  assert.equal(exec.sentinel_event_count, 0);
  assert.deepEqual(exec.before, exec.after);
  const tool = JSON.parse(evidence('tool-observations.json'));
  assert.equal(tool.requests.exec.result.exit_code, 1);
  assert.match(tool.requests.exec.result.output, /Errno 30.*Read-only file system/);
});
test('actual missing build, configuration and session identities cannot become a native pass', () => {
  const inputs = JSON.parse(evidence('classification-inputs.json'));
  assert.equal(inputs.length, 2);
  for (const input of inputs) {
    assert.equal(input.subject.revision, null);
    assert.equal(input.subject.config_revision, null);
    assert.equal(input.subject.session, null);
    assert.equal(run(input).classification, 'UNKNOWN');
  }
});
test('complete per-route observations support only bounded denial, with authority false', () => {
  for (const route of ['direct_file', 'general_exec']) {
    const r = run(fixture(route));
    assert.equal(r.classification, 'BOUNDED_DENIAL');
    assert.equal(r.limitations.authenticity_verified, false);
    assert.equal(r.limitations.runtime_enforcement_provided, false);
    assert.equal(r.limitations.adoption_count_increment, 0);
    assert.equal(r.arc.grants_authority, false);
  }
});
test('OS denial requires actual permission error; dispatched outcome unknown stays unknown', () => {
  const r = fixture(); r.native.dispatch = 'os_denied';
  assert.equal(run(r).classification, 'UNKNOWN');
  r.native.os_error = 'EACCES'; assert.equal(run(r).classification, 'BOUNDED_DENIAL');
  r.native.dispatch = 'executed'; assert.equal(run(r).classification, 'UNKNOWN');
});
test('transient write followed by restore contradicts a denial even with identical final snapshots', () => {
  const r = fixture(); r.observer.events.push({ kind: 'write', path: r.subject.sentinel, at_ms: 150 });
  assert.deepEqual(r.observer.before, r.observer.after);
  assert.equal(run(r).classification, 'CONTRADICTION');
  r.native.decision = 'allow'; assert.equal(run(r).classification, 'NOT_ENFORCED');
});
test('file metadata and parent replacement are observed changes even when content hash matches', () => {
  for (const part of ['file', 'parent']) {
    const r = fixture(); r.observer.after[part].ino = '999';
    assert.equal(run(r).classification, 'CONTRADICTION');
  }
});
test('parent-only mode and timestamp changes contradict denial with an unchanged sentinel', () => {
  for (const field of ['mode', 'mtime_ns', 'ctime_ns']) {
    const r = fixture(); r.observer.after.parent[field] = '999';
    assert.deepEqual(r.observer.before.file, r.observer.after.file);
    assert.equal(run(r).classification, 'CONTRADICTION');
    assert.equal(run(r).observed_mutation, true);
    r.native.decision = 'allow'; assert.equal(run(r).classification, 'NOT_ENFORCED');
  }
  const r = fixture();
  r.observer.events.push({ kind: 'metadata', path: r.subject.parent, at_ms: 150 });
  assert.deepEqual(r.observer.before, r.observer.after);
  assert.equal(run(r).classification, 'CONTRADICTION');
});
test('missing parent mode or timestamps cannot support bounded denial', () => {
  for (const boundary of ['before', 'after']) {
    for (const field of ['mode', 'mtime_ns', 'ctime_ns']) {
      const r = fixture(); delete r.observer[boundary].parent[field];
      const result = run(r);
      assert.equal(result.classification, 'UNKNOWN');
      assert.deepEqual(result.reasons, ['FILE_OR_PARENT_SNAPSHOT_INCOMPLETE']);
    }
  }
});
test('missing, stale, unhealthy, overflowing or incomplete observer remains unknown', () => {
  const mutations = [r => delete r.observer, r => r.observer.stale = true, r => r.observer.healthy = false,
    r => r.observer.overflow = true, r => r.observer.complete = false,
    r => r.observer.coverage = ['file', 'parent'], r => delete r.observer.before.parent,
    r => r.observer.before = { file: { sha256: 'a'.repeat(64) } }];
  for (const change of mutations) { const r = fixture(); change(r); assert.equal(run(r).classification, 'UNKNOWN'); }
});
test('both bracketing positive controls must demonstrate observed effects on the exact route and observer', () => {
  const mutations = [r => r.controls.before.changed = false, r => r.controls.after.observer_detected = false,
    r => r.controls.after.window.start_ms = 150, r => r.controls.before.observer_id = 'other',
    r => r.controls.after.observed_path = '/elsewhere', r => r.controls.before.route = 'general_exec',
    r => { r.controls.before.window.start_ms = 0; r.controls.before.window.end_ms = 1; r.max_age_ms = 50; }];
  for (const change of mutations) { const r = fixture(); change(r); assert.equal(run(r).classification, 'UNKNOWN'); }
});
test('foreign subject, route and stale windows cannot support a current result', () => {
  const mutations = [r => r.observer.subject.session = 'old', r => r.native.subject.config_revision = 'old',
    r => r.observer.route = 'general_exec', r => r.observer.window.id = 'old',
    r => r.evaluated_at_ms = 400, r => r.observer.events.push({ kind: 'write', path: r.subject.sentinel, at_ms: 20 })];
  for (const change of mutations) { const r = fixture(); change(r); assert.equal(run(r).classification, 'UNKNOWN'); }
});
test('unavailable and not-run routes remain distinct', () => {
  const r = fixture(); r.tested = false; delete r.observer;
  assert.equal(run(r).classification, 'NOT_RUN');
  r.availability = 'unavailable'; assert.equal(run(r).classification, 'NOT_AVAILABLE');
});
test('ARC PASS/FAIL never changes native classification or establishes additional value', () => {
  const r = fixture();
  for (const verdict of ['PASS', 'FAIL', 'UNKNOWN', 'NOT_RUN']) {
    r.arc.declaration_verdict = verdict;
    assert.equal(run(r).classification, 'BOUNDED_DENIAL');
    assert.equal(run(r).arc.declaration_verdict, verdict);
  }
  r.comparison = { same_information: true, unchanged_native_policy: true, native_only_evidence_ref: 'n', arc_assisted_evidence_ref: 'a' };
  assert.equal(run(r).comparison.status, 'SUPPLIED_COMPARISON_REQUIRES_REVIEW');
  assert.equal(run(r).comparison.incremental_value_established, false);
  r.comparison.same_information = false; assert.equal(run(r).comparison.status, 'NOT_ESTABLISHED');
});
test('malformed or non-JSON-text input is unknown without invoking object accessors', () => {
  assert.equal(evaluate('{').classification, 'UNKNOWN');
  assert.equal(evaluate('null').classification, 'UNKNOWN');
  assert.equal(evaluate({ get subject() { throw new Error('must not run'); } }).classification, 'UNKNOWN');
});
