/**
 * Stop gate (source-only experiment). An agent may stop working on a task only by producing a handoff that passes this gate.
 *
 * It wraps the public, unchanged `validateHandoff` check with one convention over the existing handoff fields, so that a stop
 * cannot be vague ("could not finish") or inflated ("done") without leaving a checkable record:
 *
 *   - every task acceptance criterion is copied verbatim into `completed` (met) or `unresolved` (not met), never both, never neither;
 *   - `complete` and `ready_for_review` require every criterion in `completed` and at least one evidence entry that names a file
 *     or command; `in_progress` and `blocked` require at least one `unresolved` item;
 *   - a non-complete stop names a real `required_next_action`, not a placeholder.
 *
 * The gate reads supplied JSON text only. It does not run the agent, rerun tests, open the files named as evidence, verify who
 * wrote the handoff, or notify the next agent. ACCEPT means the stop is recorded consistently, not that the work is correct.
 * No public API, schema or package export changes; the handoff stays a valid 0.1 handoff for the stable CLI.
 */
export const PROFILE = 'stop-gate/0.1';
export const PLACEHOLDER_NEXT_ACTION = /^[\s\p{P}]*(none|n\/?a|tbd|todo|unknown|same|continue|later|see above|なし|未定|特になし|続き|後で)?[\s\p{P}]*$/iu;
const NEVER_CLAIMED = Object.freeze({ work_verified: false, tests_rerun: false, evidence_opened: false, author_authenticated: false, next_agent_notified: false, execution_authorized: false, runtime_enforcement: false, identity_verified: false, evidence_verified: false });

const parse = text => { try { return JSON.parse(text); } catch { return null; } };
const strings = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
const finding = (code, path, message) => ({ code, path, message });

/** Evaluate one stop. `core` is the stable ARC core module (validateHandoff); JSON arguments are text, as for the public API. */
export function evaluateStop({ bundleJson, taskJson, handoffJson }, core) {
 if (typeof core?.validateHandoff !== 'function') throw new TypeError('core must expose validateHandoff');
 const base = core.validateHandoff(bundleJson, taskJson, handoffJson);
 const task = parse(taskJson), handoff = parse(handoffJson);
 const findings = [];
 const criteria = strings(task?.acceptance_criteria), completed = strings(handoff?.completed), unresolved = strings(handoff?.unresolved);
 const status = typeof handoff?.current_status === 'string' ? handoff.current_status : null;
 const ledger = criteria.map((criterion, index) => {
  const done = completed.includes(criterion), open = unresolved.includes(criterion);
  const state = done && open ? 'conflict' : done ? 'completed' : open ? 'unresolved' : 'unaccounted';
  if (state === 'conflict') findings.push(finding('STOP_CRITERION_CONFLICT', 'handoff/unresolved', `Acceptance criterion ${index} is listed as both completed and unresolved`));
  if (state === 'unaccounted') findings.push(finding('STOP_CRITERION_UNACCOUNTED', 'handoff/completed', `Acceptance criterion ${index} appears verbatim in neither completed nor unresolved`));
  return { index, state };
 });
 if (task && handoff && status) {
  const unmet = ledger.filter(l => l.state === 'unresolved').length;
  const anchored = Array.isArray(handoff.evidence) && handoff.evidence.some(e => e && (typeof e.file === 'string' || typeof e.command === 'string'));
  if (status === 'complete' || status === 'ready_for_review') {
   if (unmet) findings.push(finding(status === 'complete' ? 'STOP_COMPLETE_WITH_UNMET_CRITERION' : 'STOP_REVIEW_WITH_UNMET_CRITERION', 'handoff/current_status', `${status} is declared while ${unmet} acceptance criteria remain unresolved`));
   if (!anchored) findings.push(finding('STOP_EVIDENCE_UNANCHORED', 'handoff/evidence', `${status} requires at least one evidence entry naming a file or command`));
  }
  if (status === 'in_progress' && unresolved.length === 0) findings.push(finding('STOP_IN_PROGRESS_WITHOUT_UNRESOLVED', 'handoff/unresolved', 'An in_progress stop must record what remains unresolved'));
  if (status !== 'complete' && typeof handoff.required_next_action === 'string' && PLACEHOLDER_NEXT_ACTION.test(handoff.required_next_action)) findings.push(finding('STOP_NEXT_ACTION_PLACEHOLDER', 'handoff/required_next_action', 'A stop that is not complete must name a concrete next action'));
 }
 const errors = [...base.errors.map(e => ({ ...e, source: 'core' })), ...findings.map(f => ({ ...f, source: 'stop-gate' }))]
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
 const decision = errors.length ? 'REJECT' : status === 'complete' ? 'ACCEPT_COMPLETE' : 'ACCEPT_HANDOFF';
 return { profile: PROFILE, decision, valid: errors.length === 0, declared_status: status, task_id: base.task_id ?? task?.id ?? null, from_agent: base.from_agent ?? null,
  next_agent: base.next_agent ?? null, criteria: ledger, criteria_completed: ledger.filter(l => l.state === 'completed').length, criteria_total: criteria.length,
  unresolved_count: unresolved.length, core: { tool: base.tool, version: base.version, valid: base.valid }, ...NEVER_CLAIMED, errors };
}

export function renderText(report) {
 const head = `${report.decision === 'REJECT' ? 'REJECT' : 'ACCEPT'}: stop-gate ${report.decision} status=${report.declared_status ?? '?'} task=${report.task_id ?? '?'} from=${report.from_agent ?? '?'} next=${report.next_agent ?? '?'} criteria=${report.criteria_completed}/${report.criteria_total} unresolved=${report.unresolved_count}`;
 const lines = report.errors.map(e => `${e.source}: ${e.code} ${e.path}: ${e.message}`);
 return [head, ...lines, 'Recorded consistently is not verified; work, tests, evidence, author and execution remain unverified.'].join('\n') + '\n';
}

export const exitCodeFor = report => (report.decision === 'REJECT' ? 1 : 0);
