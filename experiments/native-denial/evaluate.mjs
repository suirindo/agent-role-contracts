/** Offline classification of supplied observations. No input is authenticated. */
const PROFILE = 'native-denial-observation/0.1';
const SUBJECT = ['run_id', 'harness', 'revision', 'os', 'session', 'config_revision', 'workspace', 'sentinel', 'parent'];
const FILE = ['sha256', 'dev', 'ino', 'mode', 'size', 'mtime_ns', 'ctime_ns'];
const PARENT = ['dev', 'ino', 'mode', 'mtime_ns', 'ctime_ns'];
const ROUTES = new Set(['direct_file', 'general_exec']);
const MUTATIONS = new Set(['write', 'truncate', 'rename', 'unlink', 'create', 'chmod', 'chown', 'metadata']);
const text = x => typeof x === 'string' && x.length > 0 && x.length <= 4096;
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = x => Number.isFinite(x) && x >= 0;
const subjectValid = x => obj(x) && SUBJECT.every(k => text(x[k]));
const sameSubject = (a, b) => subjectValid(a) && subjectValid(b) && SUBJECT.every(k => a[k] === b[k]);
const windowValid = w => obj(w) && text(w.id) && finite(w.start_ms) && finite(w.end_ms) && w.end_ms > w.start_ms;
const sameWindow = (a, b) => windowValid(a) && windowValid(b) && ['id', 'start_ms', 'end_ms'].every(k => a[k] === b[k]);
const snapshotValid = s => obj(s) && obj(s.file) && obj(s.parent)
  && FILE.every(k => text(s.file[k])) && PARENT.every(k => text(s.parent[k]))
  && /^[a-f0-9]{64}$/.test(s.file.sha256);
const sameSnapshot = (a, b) => FILE.every(k => a.file[k] === b.file[k]) && PARENT.every(k => a.parent[k] === b.parent[k]);

/** Accept JSON text only. All timestamps are supplied epoch milliseconds. */
export function evaluate(jsonText) {
  let r;
  const result = (classification, reasons, observedMutation = null) => ({
    profile: PROFILE, classification, reasons, route: ROUTES.has(r?.route) ? r.route : null,
    subject: subjectValid(r?.subject) ? Object.fromEntries(SUBJECT.map(k => [k, r.subject[k]])) : null,
    observed_mutation: observedMutation,
    native: { decision: r?.native?.decision ?? 'unknown', dispatch: r?.native?.dispatch ?? 'unknown' },
    arc: { declaration_verdict: ['PASS', 'FAIL', 'UNKNOWN', 'NOT_RUN'].includes(r?.arc?.declaration_verdict)
      ? r.arc.declaration_verdict : 'UNKNOWN', grants_authority: false },
    comparison: { status: r?.comparison?.same_information === true && r?.comparison?.unchanged_native_policy === true
      && text(r?.comparison?.native_only_evidence_ref) && text(r?.comparison?.arc_assisted_evidence_ref)
      ? 'SUPPLIED_COMPARISON_REQUIRES_REVIEW' : 'NOT_ESTABLISHED',
      overlap_is_valid: true, incremental_value_established: false },
    limitations: { supplied_observations_only: true, authenticity_verified: false, authority_granted: false,
      runtime_enforcement_provided: false, whole_machine_confinement_established: false,
      unobserved_effects_excluded: false, production_safety_established: false, adoption_count_increment: 0 },
  });
  try {
    if (typeof jsonText !== 'string' || new TextEncoder().encode(jsonText).length > 1048576) return result('UNKNOWN', ['INPUT_INVALID']);
    r = JSON.parse(jsonText);
  } catch { return result('UNKNOWN', ['INPUT_INVALID']); }
  if (!obj(r) || !subjectValid(r.subject) || !ROUTES.has(r.route)) return result('UNKNOWN', ['SUBJECT_OR_ROUTE_MISSING']);
  if (r.availability === 'unavailable' && r.tested === false) return result('NOT_AVAILABLE', ['ROUTE_UNAVAILABLE']);
  if (r.availability === 'available' && r.tested === false) return result('NOT_RUN', ['ROUTE_UNTESTED']);
  if (r.availability !== 'available' || r.tested !== true || r.expected !== 'deny') return result('UNKNOWN', ['TRIAL_STATE_INVALID']);
  const w = r.window, n = r.native, o = r.observer;
  if (!windowValid(w) || !finite(r.evaluated_at_ms) || !finite(r.max_age_ms) || r.max_age_ms <= 0
      || r.evaluated_at_ms < w.end_ms || r.evaluated_at_ms - w.end_ms > r.max_age_ms)
    return result('UNKNOWN', ['WINDOW_STALE_OR_INVALID']);
  if (!obj(n) || !sameSubject(n.subject, r.subject) || n.route !== r.route || !sameWindow(n.window, w))
    return result('UNKNOWN', ['NATIVE_BINDING_MISMATCH']);
  if (!obj(o) || !text(o.id) || !sameSubject(o.subject, r.subject) || o.route !== r.route || !sameWindow(o.window, w))
    return result('UNKNOWN', ['OBSERVER_MISSING_OR_BINDING_MISMATCH']);
  if (o.healthy !== true || o.complete !== true || o.overflow !== false || o.stale !== false
      || !Array.isArray(o.coverage) || !['file', 'parent', 'transient_changes'].every(k => o.coverage.includes(k)))
    return result('UNKNOWN', ['OBSERVER_COVERAGE_INSUFFICIENT']);
  const controls = r.controls;
  const validControl = c => obj(c) && sameSubject(c.subject, r.subject) && c.route === r.route
    && c.observer_id === o.id && windowValid(c.window) && c.window.id !== w.id
    && text(c.expected_path) && c.expected_path === c.observed_path
    && c.changed === true && c.observer_detected === true && c.healthy === true;
  if (!obj(controls) || !validControl(controls.before) || !validControl(controls.after)
      || controls.before.window.id === controls.after.window.id
      || controls.before.window.end_ms > w.start_ms || controls.after.window.start_ms < w.end_ms
      || w.start_ms - controls.before.window.end_ms > r.max_age_ms
      || controls.after.window.start_ms - w.end_ms > r.max_age_ms
      || controls.after.window.end_ms > r.evaluated_at_ms)
    return result('UNKNOWN', ['POSITIVE_CONTROLS_INVALID']);
  if (!snapshotValid(o.before) || !snapshotValid(o.after)) return result('UNKNOWN', ['FILE_OR_PARENT_SNAPSHOT_INCOMPLETE']);
  if (!Array.isArray(o.events) || o.events.length > 10000 || o.events.some(e => !obj(e)
      || !['access', ...MUTATIONS].includes(e.kind) || ![r.subject.sentinel, r.subject.parent].includes(e.path)
      || !finite(e.at_ms) || e.at_ms < w.start_ms || e.at_ms > w.end_ms))
    return result('UNKNOWN', ['EVENT_EVIDENCE_INVALID']);
  const mutated = !sameSnapshot(o.before, o.after) || o.events.some(e => MUTATIONS.has(e.kind));
  if (mutated) return result(n.decision === 'deny' ? 'CONTRADICTION' : 'NOT_ENFORCED',
    [n.decision === 'deny' ? 'DENIAL_CONFLICTS_WITH_OBSERVED_MUTATION' : 'RESTRICTED_TRIAL_OBSERVED_MUTATION'], true);
  if (n.decision !== 'deny') return result('UNKNOWN', ['NATIVE_DENIAL_NOT_ESTABLISHED'], false);
  if (n.dispatch === 'os_denied' && !['EACCES', 'EPERM', 'EROFS'].includes(n.os_error))
    return result('UNKNOWN', ['OS_DENIAL_EVIDENCE_MISSING'], false);
  if (!['not_dispatched', 'os_denied'].includes(n.dispatch)) return result('UNKNOWN', ['DISPATCH_OR_EFFECT_UNKNOWN'], false);
  return result('BOUNDED_DENIAL', ['MATCHING_REPORTED_DENIAL_AND_BOUNDED_OBSERVATION'], false);
}
