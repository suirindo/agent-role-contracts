/**
 * Source-only opt-in literal path declarations, profile literal-path/0.2.
 * Not a package export. Separately versioned from literal-path/0.1; reuses the
 * canonical role/task rules and G1/G2 implementations through internal factories.
 * Brackets and parentheses are literal bytes. No execution, no normalization.
 */
import coreSchemas from '../../src/schemas.core.generated.mjs';
import adapterSchemas from '../../src/schemas.adapters.generated.mjs';
import { createValidation } from '../../src/validation-factory.mjs';
import { createActionBinding } from '../../src/action-binding-factory.mjs';
import { createFilesystemWriteMapping } from '../../src/filesystem-write-factory.mjs';
import { buildReport } from '../../src/report.mjs';
import { VERSION } from '../../src/version.mjs';
import { createEvaluator } from '../review-evidence/review-evidence.mjs';

export const PROFILE = 'literal-path/0.2';
export const VERSIONS = Object.freeze({
 bundle: 'literal-path-bundle/0.2', task: 'literal-path-task/0.2',
 mapping: 'literal-path-mapping/0.2', envelope: 'literal-path-envelope/0.2',
 binding: 'task-action-literal-path/0.2', adapter: 'filesystem-write-literal-path/0.2',
 report: 'review-evidence-literal-path/0.2',
});
// One segment definition feeds both the scope matcher and the G2 mapping schema.
// Ordinary identifiers never end in '.', so '.', '..', '...' and 'a.' are rejected.
const ident = '[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?';
const name = '[A-Za-z0-9_][A-Za-z0-9_-]*';
const end = '(?![\\s\\S])';
// Reserved segments, ASCII case-insensitive, at any depth: .git (hooks run code on
// case-insensitive/dot-stripping filesystems) and the runtime-reserved .claude/.codex.
const reserved = '(?!\\.(?:[Gg][Ii][Tt]|[Cc][Ll][Aa][Uu][Dd][Ee]|[Cc][Oo][Dd][Ee][Xx])(?:/|' + end + '))';
const shapes = [
 ident, '\\.' + ident, '\\(' + ident + '\\)',
 '\\[' + name + '\\]', '\\[\\.\\.\\.' + name + '\\]', '\\[\\[\\.\\.\\.' + name + '\\]\\]',
];
const segment = reserved + '(?:' + shapes.join('|') + ')';
const filePattern = '^' + segment + '(?:/' + segment + ')*' + end;
const scopePattern = new RegExp('^' + segment + '(?:/' + segment + ')*(?:/\\*\\*)?' + end, 'u');
export function portableScope(value) {
 return typeof value === 'string' && scopePattern.test(value);
}
// Byte-exact, case-sensitive prefix containment. A '/**' scope includes hidden,
// underscore and bracket descendants, and protected scopes use the same rule.
export function scopeContains(allowed, requested) {
 if (!portableScope(allowed) || !portableScope(requested)) return false;
 const tree = allowed.endsWith('/**'), requestedTree = requested.endsWith('/**');
 const a = tree ? allowed.slice(0, -3) : allowed;
 const b = requestedTree ? requested.slice(0, -3) : requested;
 return tree ? b === a || b.startsWith(a + '/') : !requestedTree && b === a;
}

const asciiLower = s => s.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
const segmentOnly = new RegExp('^' + segment + end, 'u');
/** Informative classification only; acceptance is decided by portableScope. */
export function classifyScope(value) {
 if (typeof value !== 'string' || value.length === 0) return {index: 0, reason: 'malformed'};
 if (portableScope(value)) return null;
 const parts = (value.endsWith('/**') ? value.slice(0, -3) : value).split('/');
 for (const [index, part] of parts.entries()) {
  if (segmentOnly.test(part)) continue;
  const lower = asciiLower(part);
  if (lower === '.git') return {index, reason: 'reserved-git'};
  if (lower === '.claude' || lower === '.codex') return {index, reason: 'runtime-reserved'};
  if (/^(?:[@~-]|\(\.{1,3}\))/.test(part) || /[ \u0080-￿]/.test(part)
   || /^\[{1,2}(?:\.\.\.)?[A-Za-z0-9_-]+\]{1,2}[A-Za-z0-9._-]/.test(part)) return {index, reason: 'unsupported-shape'};
  return {index, reason: 'malformed'};
 }
 return {index: parts.length - 1, reason: 'malformed'};
}
const describeReason = value => {
 const c = classifyScope(value);
 return c ? `not expressible in ${PROFILE}: segment ${c.index + 1}, reason ${c.reason}.` : null;
};

// Derived schemas retain the canonical contracts. Only version discriminators
// and the concrete G2 path grammar differ; no competing role/task schema.
const schemas = structuredClone(coreSchemas);
schemas.bundle.properties.schema_version.const = VERSIONS.bundle;
schemas.task.properties.schema_version.const = VERSIONS.task;
schemas.bundle.$id = 'urn:arc:experiment:literal-path-bundle:0.2';
schemas.task.$id = 'urn:arc:experiment:literal-path-task:0.2';
const mappingSchema = structuredClone(adapterSchemas['filesystem-write-mapping']);
mappingSchema.$id = 'urn:arc:experiment:literal-path-mapping:0.2';
mappingSchema.properties.schema_version.const = VERSIONS.mapping;
mappingSchema.properties.path.pattern = filePattern;
const validation = createValidation({ schemas, portableScope, scopeContains });
const binding = createActionBinding({ schemas, validation, profile: VERSIONS.binding });

// Reasons are added by wrapping only: codes and paths stay those of the stable core.
function annotateBundle(b) {
 const used = new Map();
 return b.errors.map(e => {
  if (e.code !== 'WRITE_SCOPE_SYNTAX' || !b.bundle) return e;
  const m = /^bundle\/roles\/(\d+)$/.exec(e.path);
  const scopes = m && b.bundle.roles[Number(m[1])]?.contract?.authority?.allowed_write_scopes;
  if (!Array.isArray(scopes)) return e;
  const bad = scopes.filter(s => !portableScope(s));
  const n = used.get(e.path) ?? 0;
  used.set(e.path, n + 1);
  const why = bad.length > n && describeReason(bad[n]);
  return why ? {...e, message: 'Write scope is ' + why} : e;
 });
}
function annotateTask(errors, taskText) {
 if (!errors.some(e => e.code === 'TASK_WRITE_SCOPE_INVALID')) return errors;
 let scope;
 try { scope = JSON.parse(taskText)?.inputs?.scope; } catch { return errors; }
 const why = describeReason(scope);
 return why ? errors.map(e => e.code === 'TASK_WRITE_SCOPE_INVALID' ? {...e, message: e.message + '; task scope is ' + why} : e) : errors;
}
export function validateBundle(text) {
 const b = validation.checkBundle(text);
 return buildReport(VERSION, 'literal-path-bundle', annotateBundle(b), { scope_profile: PROFILE });
}
export function explainTask(bundle, task) {
 const b = validation.checkBundle(bundle);
 const t = b.errors.length ? null : validation.checkTask(b, task);
 const errors = t ? annotateTask(t.errors, task) : annotateBundle(b);
 return buildReport(VERSION, 'literal-path-task', errors, {
  scope_profile: PROFILE,
  ...(t?.task && t.route ? {task_id: t.task.id, roles: t.details} : {}),
 });
}
export const describeTaskAction = binding.describeTaskAction;
export const validateTaskActionBinding = binding.validateTaskActionBinding;
export const validateFilesystemWriteMapping = createFilesystemWriteMapping({
 schema: mappingSchema, validation, describeTaskAction,
 profile: VERSIONS.adapter,
 validActionPath: path => portableScope(path) && !path.endsWith('/**'),
});
export const evaluate = createEvaluator({
 explainTask, describeTaskAction, validateTaskActionBinding, scopeContains,
 envelopeVersion: VERSIONS.envelope, reportKind: VERSIONS.report,
});
