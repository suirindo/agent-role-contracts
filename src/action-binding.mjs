/** Integrity checks on JSON declarations; no identity or execution authority. */
import schemas from './schemas.core.generated.mjs';
import { canonical } from './schema.mjs';
import { checkBundle, checkTask, read } from './validation.mjs';
import { buildReport } from './report.mjs';
import { VERSION } from './version.mjs';

const PROFILE = 'task-action/0.3';
const LIMITATIONS = Object.freeze({
 subject_authenticated: false,
 review_authenticated: false,
 human_approval_authenticated: false,
 action_executed: false,
 replay_protection_enforced: false,
});
const issue = (code, path, message) => ({ code, path, message });
const report = (kind, errors, details = {}) => buildReport(VERSION, kind, errors, { ...details, ...LIMITATIONS });

async function subject(bundleJson, taskJson, actionJson) {
 const b = checkBundle(bundleJson);
 if (b.errors.length) return { errors: b.errors };
 const t = checkTask(b, taskJson);
 if (t.errors.length) return { errors: t.errors };
 const a = read(actionJson, schemas['task-action'], 'action');
 if (a.errors.length) return { errors: a.errors };
 try {
  const bytes = new TextEncoder().encode(canonical({ profile: PROFILE, bundle: b.bundle, task: t.task, action: a.value }));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const digest = 'sha256:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  return { errors: [], route: t.route, details: { subject_digest: digest, binding_profile: PROFILE, task_id: t.task.id, action_id: a.value.id, action: a.value } };
 } catch {
  return { errors: [issue('G1_DIGEST_UNAVAILABLE', 'subject_digest', 'Web Crypto SHA-256 is unavailable')] };
 }
}

export async function describeTaskAction(bundleJson, taskJson, actionJson) {
 const s = await subject(bundleJson, taskJson, actionJson);
 return report('task-action', s.errors, s.details);
}

export async function validateTaskActionBinding(bundleJson, taskJson, actionJson, bindingJson) {
 const s = await subject(bundleJson, taskJson, actionJson);
 let declarations = {};
 const finish = errors => report('task-action-binding', errors, { ...s.details, ...declarations, binding_matches_subject: errors.length === 0 });
 if (s.errors.length) return finish(s.errors);
 const parsed = read(bindingJson, schemas['task-action-binding'], 'binding');
 if (parsed.errors.length) return finish(parsed.errors);
 declarations = { reviews: parsed.value.reviews, ...(parsed.value.human_approval ? { human_approval: parsed.value.human_approval } : {}) };
 const v = parsed.value, errors = [], seen = new Set();
 const add = (code, path, message) => errors.push(issue(code, path, message));
 const match = (value, path) => {
  if (value !== s.details.subject_digest) add('G1_SUBJECT_MISMATCH', path, 'Declaration must bind the complete current bundle, task and action');
 };
 match(v.subject_digest, 'binding/subject_digest');
 if (!s.route.reviewers.length) add('G1_REVIEW_REQUIRED', 'bundle/routes', 'At least one routed reviewer is required');
 for (const [i, review] of v.reviews.entries()) {
  const path = `binding/reviews/${i}`;
  match(review.subject_digest, path + '/subject_digest');
  if (!s.route.reviewers.includes(review.role_id)) add('G1_REVIEWER_OUTSIDE_ROUTE', path + '/role_id', 'Review must name a current routed reviewer');
  if (seen.has(review.role_id)) add('G1_REVIEW_DUPLICATE', path + '/role_id', 'Only one review per role is allowed');
  seen.add(review.role_id);
  if (review.decision !== 'pass') add('G1_REVIEW_BLOCKED', path + '/decision', 'Every review must declare pass');
 }
 if (v.human_approval) match(v.human_approval.subject_digest, 'binding/human_approval/subject_digest');
 if (s.route.require_human_approval) {
  if (!v.human_approval) add('G1_APPROVAL_REQUIRED', 'binding/human_approval', 'The current route requires a human approval declaration');
  else {
   if (v.human_approval.role_id !== s.route.accountable) add('G1_APPROVER_MISMATCH', 'binding/human_approval/role_id', 'Approval must name the current accountable role');
   if (v.human_approval.decision !== 'approved') add('G1_APPROVAL_DENIED', 'binding/human_approval/decision', 'Approval must declare approved');
  }
 } else if (v.human_approval) add('G1_APPROVAL_UNEXPECTED', 'binding/human_approval', 'The current route does not require a human approval declaration');
 return finish(errors);
}
