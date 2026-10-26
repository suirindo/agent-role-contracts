/**
 * Source-only opt-in literal path declarations. Not a package export.
 * Reuses canonical role/task rules and G1/G2 implementations; no execution.
 */
import coreSchemas from '../../src/schemas.core.generated.mjs';
import adapterSchemas from '../../src/schemas.adapters.generated.mjs';
import { createValidation } from '../../src/validation-factory.mjs';
import { createActionBinding } from '../../src/action-binding-factory.mjs';
import { createFilesystemWriteMapping } from '../../src/filesystem-write-factory.mjs';
import { buildReport } from '../../src/report.mjs';
import { VERSION } from '../../src/version.mjs';
import { createEvaluator } from '../review-evidence/review-evidence.mjs';

export const PROFILE = 'literal-path/0.1';
export const VERSIONS = Object.freeze({
 bundle: 'literal-path-bundle/0.1', task: 'literal-path-task/0.1',
 mapping: 'literal-path-mapping/0.1', envelope: 'literal-path-envelope/0.1',
 binding: 'task-action-literal-path/0.1', adapter: 'filesystem-write-literal-path/0.1',
 report: 'review-evidence-literal-path/0.1',
});
const token = '[A-Za-z0-9][A-Za-z0-9._-]*';
const segment = '(?:' + token + '|\\(' + token + '\\))';
const end = '(?![\\s\\S])';
const filePattern = '^' + segment + '(?:/' + segment + ')*' + end;
const scopePattern = new RegExp('^' + segment + '(?:/' + segment + ')*(?:/\\*\\*)?' + end, 'u');
export function portableScope(value) {
 return typeof value === 'string' && scopePattern.test(value);
}
export function scopeContains(allowed, requested) {
 if (!portableScope(allowed) || !portableScope(requested)) return false;
 const tree = allowed.endsWith('/**'), requestedTree = requested.endsWith('/**');
 const a = tree ? allowed.slice(0, -3) : allowed;
 const b = requestedTree ? requested.slice(0, -3) : requested;
 return tree ? b === a || b.startsWith(a + '/') : !requestedTree && b === a;
}
// Derived schemas retain the canonical contracts. Only version discriminators
// and the concrete G2 path grammar differ; no competing role/task schema.
const schemas = structuredClone(coreSchemas);
schemas.bundle.properties.schema_version.const = VERSIONS.bundle;
schemas.task.properties.schema_version.const = VERSIONS.task;
schemas.bundle.$id = 'urn:arc:experiment:literal-path-bundle:0.1';
schemas.task.$id = 'urn:arc:experiment:literal-path-task:0.1';
const mappingSchema = structuredClone(adapterSchemas['filesystem-write-mapping']);
mappingSchema.$id = 'urn:arc:experiment:literal-path-mapping:0.1';
mappingSchema.properties.schema_version.const = VERSIONS.mapping;
mappingSchema.properties.path.pattern = filePattern;
const validation = createValidation({ schemas, portableScope, scopeContains });
const binding = createActionBinding({ schemas, validation, profile: VERSIONS.binding });
export function validateBundle(text) {
 const b = validation.checkBundle(text);
 return buildReport(VERSION, 'literal-path-bundle', b.errors, { scope_profile: PROFILE });
}
export function explainTask(bundle, task) {
 const b = validation.checkBundle(bundle);
 const t = b.errors.length ? null : validation.checkTask(b, task);
 return buildReport(VERSION, 'literal-path-task', t ? t.errors : b.errors, {
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
