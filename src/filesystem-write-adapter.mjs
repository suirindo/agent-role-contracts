/** Declaration consistency only. No permission, runtime I/O, or G1 approval binding. */
import schemas from './schemas.adapters.generated.mjs';
import { checkBundle, checkTask, read, scopeContains } from './validation.mjs';
import { describeTaskAction } from './action-binding.mjs';
import { buildReport } from './report.mjs';
import { VERSION } from './version.mjs';

const LIMITATIONS = Object.freeze({
 adapter_authenticated: false,
 content_bytes_verified: false,
 filesystem_state_verified: false,
 path_exists_verified: false,
 write_permission_enforced: false,
 subject_authenticated: false,
 review_authenticated: false,
 human_approval_authenticated: false,
 action_executed: false,
 replay_protection_enforced: false,
});
const issue = (code, path, message) => ({ code, path, message });

export async function validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, mappingJson) {
 const details = { adapter_profile: 'filesystem-write/0.1', task_id: null, action_id: null, subject_digest: null, eligible_executors: [] };
 const finish = errors => buildReport(VERSION, 'filesystem-write-mapping', errors, {
  ...details, mapping_matches_action: errors.length === 0, ...LIMITATIONS,
 });
 const b = checkBundle(bundleJson);
 if (b.errors.length) return finish(b.errors);
 const t = checkTask(b, taskJson);
 if (t.task) details.task_id = t.task.id;
 if (t.errors.length) return finish(t.errors);
 const subject = await describeTaskAction(bundleJson, taskJson, actionJson);
 if (!subject.valid) return finish(subject.errors);
 details.action_id = subject.action_id;
 details.subject_digest = subject.subject_digest;
 const parsed = read(mappingJson, schemas['filesystem-write-mapping'], 'mapping');
 if (parsed.value !== undefined) details.mapping = parsed.value;
 if (parsed.errors.length) return finish(parsed.errors);
 const mapping = parsed.value, action = subject.action, errors = [];
 const add = (code, path, message) => errors.push(issue(code, path, message));
 if (action.kind !== 'filesystem-write') add('G2_ACTION_KIND', 'action/kind', 'Expected filesystem-write');
 const params = action.parameters, keys = Object.keys(params);
 if (keys.length !== 2 || !Object.hasOwn(params, 'path') || !Object.hasOwn(params, 'content_sha256') ||
     typeof params.path !== 'string' || typeof params.content_sha256 !== 'string' ||
     (params.content_sha256.length !== 71 || !/^sha256:[0-9a-f]{64}$/.test(params.content_sha256)) ||
     (/[^A-Za-z0-9/._-]/.test(params.path) || !scopeContains(params.path, params.path)) || params.path.endsWith('/**') || params.path.split('/').some(part => part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
  add('G2_ACTION_PARAMETERS', 'action/parameters', 'Expected exactly a portable file path and canonical content_sha256 strings');
 }
 if (mapping.subject_digest !== subject.subject_digest) add('G2_SUBJECT_MISMATCH', 'mapping/subject_digest', 'Mapping must bind the complete current G1 subject');
 if (mapping.path !== params.path) add('G2_PATH_MISMATCH', 'mapping/path', 'Mapping path must equal action path');
 if (mapping.content_sha256 !== params.content_sha256) add('G2_CONTENT_MISMATCH', 'mapping/content_sha256', 'Mapping content digest must equal action content digest');
 if (!scopeContains(t.task.inputs.scope, mapping.path)) add('G2_TASK_SCOPE', 'mapping/path', 'Mapping path must be contained by the declared task scope');
 details.eligible_executors = [...new Set(t.route.executors.filter(id => {
  const role = b.roles.get(id);
  return role.status === 'active' && ['write_scoped', 'operator'].includes(role.authority.authority_mode) &&
   role.authority.capabilities.includes('filesystem.write.scoped') &&
   role.authority.allowed_write_scopes.some(scope => scopeContains(scope, mapping.path));
 }))].sort();
 if (!details.eligible_executors.length) add('G2_NO_ELIGIBLE_WRITER', 'mapping/path', 'No routed executor declares scoped write capability and a containing write scope');
 return finish(errors);
}
