/** Bounded lifecycle declarations only; no event authenticity or execution authority. */
import schemas from './schemas.core.generated.mjs';
import { describeTaskAction } from './action-binding.mjs';
import { read, checkBundle, checkTask } from './validation.mjs';
import { validateSchema } from './schema.mjs';
import { buildReport } from './report.mjs';
import { VERSION } from './version.mjs';
const LIMITATIONS = Object.freeze({
 actor_identity_verified: false, review_verified: false, approval_verified: false,
 execution_verified: false, artifact_bytes_verified: false, artifact_locator_resolved: false,
 runtime_acceptance_verified: false, replay_protection_enforced: false,
 event_authenticity_verified: false, state_machine_enforced: false, run_id_is_correlation_only: true,
});
const issue = (code, path, message) => ({ code, path, message });
const decisions = { review: ['pass','blocked'], approval: ['approved','denied'], execution: ['declared_success','declared_failure'], evidence: ['present','missing'] };
async function inspect(bundleJson, taskJson, actionJson, lifecycleJson, full) {
 const subject = await describeTaskAction(bundleJson, taskJson, actionJson);
 const parsed = read(lifecycleJson, schemas['task-lifecycle'], 'lifecycle');
 const errors = [...subject.errors, ...parsed.errors];
 const v = parsed.value;
 const details = { lifecycle_profile: 'task-lifecycle/0.4', artifact_identity_consistent: false };
 if (subject.valid) Object.assign(details, { task_id: subject.task_id, action_id: subject.action_id, current_subject_digest: subject.subject_digest });
 if (v && typeof v === 'object' && !Array.isArray(v)) {
  if (typeof v.run_id === 'string') details.run_id = v.run_id;
  if (typeof v.subject_digest === 'string') details.declared_subject_digest = v.subject_digest;
 }
 const events = Array.isArray(v?.events) ? v.events : [];
 details.event_count = events.length;
 details.declared_phases = [...new Set(events.map(e => e?.phase).filter(p => typeof p === 'string'))].sort();
 details.artifact_count = 0;
 const identities = new Map(), artifactErrors = [];
 let structural = Array.isArray(v?.events);
 for (const [i,e] of events.entries()) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) { structural = false; continue; }
  if (!Object.hasOwn(e, 'artifacts')) continue;
  const schema = schemas['task-lifecycle'].properties.events.items.properties.artifacts;
  if (validateSchema(e.artifacts, schema).errors.length) { structural = false; continue; }
  details.artifact_count += e.artifacts.length;
  const local = new Set();
  for (const [j,a] of e.artifacts.entries()) {
   const path = `lifecycle/events/${i}/artifacts/${j}`;
   if (local.has(a.artifact_id)) { structural = false; artifactErrors.push(issue('G3_ARTIFACT_DUPLICATE', path + '/artifact_id', 'Artifact IDs must be unique within an event')); }
   local.add(a.artifact_id);
   if (identities.has(a.artifact_id) && identities.get(a.artifact_id) !== a.sha256) artifactErrors.push(issue('G3_ARTIFACT_DIGEST_CONFLICT', path + '/sha256', 'Recurring artifact IDs must declare the same digest'));
   else identities.set(a.artifact_id,a.sha256);
  }
 }
 details.artifact_identity_consistent = structural && artifactErrors.length === 0;
 if (subject.valid && v && typeof v === 'object') {
  const match = (digest,path) => { if (digest !== subject.subject_digest) errors.push(issue('G3_SUBJECT_MISMATCH',path,'Declaration must bind the complete current bundle, task and action')); };
  match(v.subject_digest,'lifecycle/subject_digest');
  for (const [i,e] of events.entries()) match(e?.subject_digest,`lifecycle/events/${i}/subject_digest`);
 }
 errors.push(...artifactErrors);
 if (!parsed.errors.length) {
  const ids = new Set();
  for (const [i,e] of events.entries()) {
   if (ids.has(e.event_id)) errors.push(issue('G3_EVENT_DUPLICATE',`lifecycle/events/${i}/event_id`,'Event IDs must be unique'));
   ids.add(e.event_id);
  }
 }
 const semanticErrors = [];
 if (subject.valid && !parsed.errors.length) {
  const b = checkBundle(bundleJson), t = checkTask(b,taskJson), route = t.route;
  const participants = new Set([route.accountable,...route.executors,...route.reviewers]);
  const actors = new Set();
  for (const [i,e] of events.entries()) {
   const path = `lifecycle/events/${i}`;
   const add = (code,field,message) => semanticErrors.push(issue(code,path+'/'+field,message));
   const pair = e.actor_role_id + ':' + e.phase;
   if (actors.has(pair)) add('G3_ACTOR_PHASE_DUPLICATE','actor_role_id','Only one event per actor and phase is allowed');
   actors.add(pair);
   if (!decisions[e.phase].includes(e.decision)) add('G3_PHASE_DECISION','decision','Decision is not allowed for this phase');
   const allowed = e.phase === 'review' ? route.reviewers.includes(e.actor_role_id) : e.phase === 'execution' ? route.executors.includes(e.actor_role_id) : e.phase === 'approval' ? e.actor_role_id === route.accountable : participants.has(e.actor_role_id);
   if (!allowed) add('G3_PHASE_ACTOR','actor_role_id','Actor must be a current participant for this phase');
  }
  if (route.reviewers.length && !events.some(e=>e.phase==='review')) semanticErrors.push(issue('G3_REVIEW_REQUIRED','lifecycle/events','The current route requires at least one review event'));
  const approvals = events.filter(e=>e.phase==='approval').length;
  if (route.require_human_approval && approvals !== 1) semanticErrors.push(issue('G3_APPROVAL_REQUIRED','lifecycle/events','The current route requires exactly one approval event'));
  if (!route.require_human_approval && approvals) semanticErrors.push(issue('G3_APPROVAL_UNEXPECTED','lifecycle/events','The current route does not allow approval events'));
 }
 details.lifecycle_matches_subject = errors.length === 0 && semanticErrors.length === 0;
 if (full) errors.push(...semanticErrors);
 return buildReport(VERSION, full ? 'task-lifecycle-validation' : 'task-lifecycle', errors, { ...details, ...LIMITATIONS });
}
export async function describeTaskLifecycle(bundleJson,taskJson,actionJson,lifecycleJson) {
 return inspect(bundleJson,taskJson,actionJson,lifecycleJson,false);
}
export async function validateTaskLifecycle(bundleJson,taskJson,actionJson,lifecycleJson) {
 return inspect(bundleJson,taskJson,actionJson,lifecycleJson,true);
}
