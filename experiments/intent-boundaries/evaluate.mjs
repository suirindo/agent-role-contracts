#!/usr/bin/env node
/** Offline research comparison. No fixture code or tool event is executed. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainTask, describeTaskAction, validateTaskActionBinding } from '../../src/core.mjs';
import { validateFilesystemWriteMapping } from '../../src/filesystem-write-adapter.mjs';
import { VERSION } from '../../src/version.mjs';
import { makeArtifactCases, makeFlowCases } from './fixtures.mjs';

const json = JSON.stringify;
export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const result = (status, findings = []) => ({ status, findings });

/** Preserve all bytes outside one operator-specified edit window. This checks
 * a mechanical invariant, not intent or the correctness of the replacement.
 * Indices are JavaScript UTF-16 offsets; digests cover UTF-8 snapshot bytes. */
export function inspectEditWindow(before, after, plan) {
  if (typeof before !== 'string' || typeof after !== 'string' || !plan ||
      plan.base_sha256 !== sha256(before) || !Number.isInteger(plan.start) ||
      !Number.isInteger(plan.end) || plan.start < 0 || plan.end < plan.start || plan.end > before.length) {
    return result('UNSUPPORTED', [{ code: 'INVALID_OR_STALE_WINDOW' }]);
  }
  const prefix = before.slice(0, plan.start), suffix = before.slice(plan.end);
  const findings = [];
  const protectedBytes = (code, text) => ({ code, protected_utf8_sha256: sha256(text), protected_utf16_length: text.length });
  if (!after.startsWith(prefix)) findings.push(protectedBytes('PROTECTED_PREFIX_CHANGED', prefix));
  if (!after.endsWith(suffix)) findings.push(protectedBytes('PROTECTED_SUFFIX_CHANGED', suffix));
  if (after.length < prefix.length + suffix.length) findings.push({ code: 'PROTECTED_SECTIONS_OVERLAP' });
  return result(findings.length ? 'VIOLATED' : 'PRESERVED', findings);
}

/** Tiny explicit data-flow baseline over supplied synthetic events. It neither
 * captures real tool calls nor trusts a transform to declassify its inputs. */
export function inspectFlow(events, allowedDestinations) {
  if (!Array.isArray(events) || !allowedDestinations || typeof allowedDestinations !== 'object') return result('UNSUPPORTED');
  const values = new Map(), findings = [];
  for (const event of events) {
    if (!event || typeof event.id !== 'string' || !event.id || values.has(event.id)) return result('UNSUPPORTED');
    if (event.kind === 'read') {
      if (!Object.hasOwn(allowedDestinations, event.classification) ||
          !Array.isArray(allowedDestinations[event.classification]) ||
          allowedDestinations[event.classification].some(d => typeof d !== 'string')) return result('UNSUPPORTED');
      values.set(event.id, [{ id: event.id, classification: event.classification }]);
      continue;
    }
    if (!['transform', 'send'].includes(event.kind) || !Array.isArray(event.inputs) ||
        !event.inputs.length || event.inputs.some(id => !values.has(id))) return result('UNSUPPORTED');
    const sources = [...new Map(event.inputs.flatMap(id => values.get(id)).map(s => [s.id, s])).values()];
    values.set(event.id, sources);
    if (event.kind === 'send') {
      if (typeof event.destination !== 'string' || !event.destination) return result('UNSUPPORTED');
      const forbidden = sources.filter(s => !allowedDestinations[s.classification].includes(event.destination));
      if (forbidden.length) findings.push({ code: 'SOURCE_DESTINATION_MISMATCH', event_id: event.id,
        destination: event.destination, source_ids: forbidden.map(s => s.id) });
    }
  }
  return result(findings.length ? 'VIOLATED' : 'PRESERVED', findings);
}

function declarations(scope, objective) {
  const bundle = JSON.parse(readFileSync(new URL('../../examples/starter-bundle.json', import.meta.url), 'utf8'));
  const task = JSON.parse(readFileSync(new URL('../../examples/starter-task.json', import.meta.url), 'utf8'));
  task.inputs.scope = scope;
  task.objective = objective;
  task.acceptance_criteria = ['Change only the approved edit window; preserve the existing tests and other behavior.'];
  return { bundle, task };
}

function observe(report) {
  for (const key of ['execution_authorized', 'runtime_enforcement']) {
    if (report[key] !== false) throw new Error('Unexpected authority claim: ' + key);
  }
  return { valid: report.valid, diagnostic_codes: report.errors.map(e => e.code),
    execution_authorized: report.execution_authorized, runtime_enforcement: report.runtime_enforcement };
}

async function bindingControl(before, approved, changed) {
  const { bundle, task } = declarations('src/price.mjs', 'Repair the discount computation only.');
  const action = { schema_version: '0.3', id: 'fictional-write', kind: 'filesystem-write',
    parameters: { path: 'src/price.mjs', content_sha256: 'sha256:' + sha256(approved) } };
  const subject = await describeTaskAction(json(bundle), json(task), json(action));
  if (!subject.valid) throw new Error('Invalid binding fixture: ' + json(subject.errors));
  // Explicit fictional approvals for the approved candidate only. Never create
  // new approval declarations for the changed or misreported candidate.
  const binding = { schema_version: '0.3', subject_digest: subject.subject_digest,
    reviews: [{ role_id: 'reviewer', subject_digest: subject.subject_digest, decision: 'pass' }],
    human_approval: { role_id: 'implementer', subject_digest: subject.subject_digest, decision: 'approved' } };
  const check = a => validateTaskActionBinding(json(bundle), json(task), json(a), json(binding));
  const changedAction = structuredClone(action);
  changedAction.parameters.content_sha256 = 'sha256:' + sha256(changed);
  const actualMapping = { schema_version: '0.1', subject_digest: subject.subject_digest,
    operation: 'write_file', path: action.parameters.path, content_sha256: 'sha256:' + sha256(changed) };
  return {
    base_content_sha256: sha256(before), approved_content_sha256: sha256(approved), changed_content_sha256: sha256(changed),
    approved: observe(await check(action)),
    approved_request_mapping: observe(await validateFilesystemWriteMapping(json(bundle), json(task), json(action),
      json({ ...actualMapping, content_sha256: action.parameters.content_sha256 }))),
    changed_declared_content: observe(await check(changedAction)),
    misreported_content: observe(await check(action)),
    actual_request_mapping: observe(await validateFilesystemWriteMapping(json(bundle), json(task), json(action), json(actualMapping))),
    approval_declarations_authenticated: false,
    limitation: 'If a consumer keeps reporting the old digest, G1 cannot see changed bytes. G2 only helps when a trusted consumer supplies the actual request digest.',
  };
}

export async function evaluate() {
  const artifactCases = makeArtifactCases(sha256).map(c => {
    const { bundle, task } = declarations(c.path, c.objective);
    return { id: c.id, path: c.path, expected_intent: c.expected_intent,
      objective: c.objective, approved_edit_window: c.plan, snapshots: { before: c.before, after: c.after },
      before_sha256: sha256(c.before), after_sha256: sha256(c.after),
      declaration_inputs_sha256: sha256(json({ bundle, task })),
      arc_declaration: observe(explainTask(json(bundle), json(task))),
      exact_path_baseline: c.path === 'src/price.mjs' ? 'ACCEPT' : 'REJECT',
      task_window: inspectEditWindow(c.before, c.after, c.plan),
      semantic_acceptance: 'UNVERIFIED', expected: c.expected };
  });
  const flowCases = makeFlowCases().map(c => ({ id: c.id, events: c.events,
    allowed_destinations: c.allowed, flow_invariant: inspectFlow(c.events, c.allowed),
    arc_tool_effect_validation: 'UNSUPPORTED_BY_THIS_DECLARATION_CHECK', expected_status: c.expected }));
  const fixtures = makeArtifactCases(sha256);
  const binding = await bindingControl(fixtures[0].before, fixtures[0].after, fixtures.find(c => c.id === 'unsolicited-same-file-change').after);
  const matches = artifactCases.every(c => c.arc_declaration.valid === c.expected.arc_valid &&
      c.task_window.status === c.expected.window_status) &&
    flowCases.every(c => c.flow_invariant.status === c.expected_status) &&
    binding.approved.valid && binding.approved_request_mapping.valid && !binding.changed_declared_content.valid && binding.misreported_content.valid &&
    !binding.actual_request_mapping.valid && binding.actual_request_mapping.diagnostic_codes.includes('G2_CONTENT_MISMATCH');
  return { profile: 'ARC_INTENT_BOUNDARY_EXPERIMENT_0_1', arc_source_version: VERSION, evidence_class: 'SYNTHETIC_LABORATORY',
    artifact_cases: artifactCases, flow_cases: flowCases, binding_control: binding, expectations_matched: matches,
    core_modified: false, execution_authorized: false, runtime_enforcement: false,
    fixture_code_executed: false, actual_tool_calls_executed: false, ci_result_verified: false,
    external_adoption_verified: false, human_time_saved: null,
    limitation: 'Hand-authored examples and explicit invariants, not a semantic detector, production guard or safety/demand benchmark. A preserved window may contain a semantically wrong change. Trusted snapshots and event collection are external requirements.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv.length > 2 ? Promise.reject(new Error('No CLI arguments are supported.')) : evaluate())
    .then(report => { console.log(json(report, null, 2)); if (!report.expectations_matched) process.exitCode = 1; })
    .catch(error => { console.error(json({ error: error.message, execution_authorized: false })); process.exitCode = 2; });
}
