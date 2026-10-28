#!/usr/bin/env node
/** Source-only fixture worksheet. Never dispatches an action or issues authority. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { validateBundle, explainTask, describeTaskAction, validateTaskActionBinding, validateTaskLifecycle } from '../../src/core.mjs';

const json = JSON.stringify;
const clone = structuredClone;
const root = new URL('../../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const FALSE_FLAGS = Object.freeze({
  execution_authorized: false, runtime_enforcement: false, identity_verified: false,
  evidence_verified: false, action_executed: false, replay_protection_enforced: false,
  host_inventory_authenticated: false, receiver_observed: false,
});
const scope = () => ({ authority: 'UNKNOWN', runtime: 'NOT_RUN', evidence: 'FIXTURE_SUPPLIED', ...FALSE_FLAGS });

function base() {
  const bundle = read('examples/starter-bundle.json'), task = read('examples/starter-task.json');
  bundle.policy.capabilities.push('process.execute');
  bundle.policy.read_only_forbids.push('process.execute');
  bundle.roles.find(r => r.contract.id === 'reviewer').contract.authority.prohibited_capabilities.push('process.execute');
  const action = { schema_version: '0.3', id: 'fictional-action-1', kind: 'support-drafting', parameters: {
    output: 'src/example.mjs', recipient: 'fictional-a@example.invalid', account: 'fictional-account',
    environment: 'disposable-fixture', business_scope_version: 'scope-1', content_sha256: 'sha256:' + 'a'.repeat(64), send: false,
  } };
  return { bundle, task, action };
}
const args = d => [d.bundle, d.task, d.action].map(json);

// Only fictional supplied records are made here. This is not an approval service.
function fictionalDecision(subject) {
  return { schema_version: '0.3', subject_digest: subject,
    reviews: [{ subject_digest: subject, role_id: 'reviewer', decision: 'pass' }],
    human_approval: { subject_digest: subject, role_id: 'implementer', decision: 'approved' },
  };
}

/** Compare supplied inventory strings with a frozen mapping; provenance never authenticates. */
export function compareInventory(bundle, inventory, mapping, context) {
  const declaration = validateBundle(json(bundle));
  const report = { comparison: 'UNKNOWN', excess: [], contributing_paths: [], gaps: [],
    freshness: 'UNKNOWN', provenance: 'UNKNOWN', declaration, ...scope() };
  if (!declaration.valid || !inventory || !Array.isArray(inventory.tools) || !inventory.tools.length ||
      !inventory.provenance || !mapping || !context) return report;
  if (inventory.revision !== context.config_revision || inventory.session !== context.session || inventory.host !== context.host) {
    report.freshness = 'STALE_OR_FOREIGN';
    return report;
  }
  report.freshness = 'SUPPLIED_IDENTITIES_MATCH';
  const role = bundle.roles.find(r => r.contract.id === 'reviewer')?.contract.authority;
  if (!role) return report;
  for (const [index, tool] of inventory.tools.entries()) {
    const capabilities = Object.hasOwn(mapping, tool) ? mapping[tool] : null;
    if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(c => typeof c !== 'string')) {
      report.gaps.push(tool); continue;
    }
    for (const capability of capabilities) {
      if (!role.capabilities.includes(capability) || role.prohibited_capabilities.includes(capability)) {
        report.excess.push(capability);
        report.contributing_paths.push({ capability, path: '/tools/' + index, tool });
      }
    }
  }
  report.excess = [...new Set(report.excess)].sort();
  report.comparison = report.excess.length ? 'MISMATCH' : report.gaps.length ? 'UNKNOWN' : 'MATCH';
  return report;
}

// Same-information modeled native predicate, not an invocation of a real harness.
function nativeStyleBaseline(bundle, inventory, mapping, context) {
  if (!inventory?.tools?.length || !inventory.provenance || !mapping || !context ||
      inventory.revision !== context.config_revision || inventory.session !== context.session || inventory.host !== context.host) return 'UNKNOWN';
  const role = bundle.roles.find(r => r.contract.id === 'reviewer')?.contract.authority;
  if (!role) return 'UNKNOWN';
  const mapped = inventory.tools.map(t => Object.hasOwn(mapping, t) ? mapping[t] : null);
  if (mapped.some(caps => Array.isArray(caps) && caps.some(c => !role.capabilities.includes(c) || role.prohibited_capabilities.includes(c)))) return 'MISMATCH';
  return mapped.some(caps => !Array.isArray(caps) || !caps.length) ? 'UNKNOWN' : 'MATCH';
}

async function permissionCase(c, spec) {
  const d = base();
  const inventory = { tools: c.tools ?? ['file-reader', 'evidence-review'], provenance: c.provenance ?? 'fixture',
    revision: c.revision ?? 'config-2', session: c.session ?? spec.context.session, host: spec.context.host };
  const variants = c.variants ?? ['main'];
  const observations = [];
  for (const variant of variants) {
    let i = clone(inventory), m = clone(spec.mapping);
    if (variant === 'no-inventory') i = null;
    if (variant === 'no-provenance') delete i.provenance;
    if (variant === 'no-mapping') m = null;
    if (variant === 'old-config') i.revision = 'config-1';
    if (variant === 'foreign-session') i.session = 'fictional-other-session';
    const comparison = compareInventory(d.bundle, i, m, spec.context);
    observations.push({ variant, input: { bundle: d.bundle, task: d.task, inventory: i, mapping: m, context: spec.context },
      task_declaration: explainTask(json(d.bundle), json(d.task)), comparison,
      native_style_baseline: { kind: 'MODELED_SAME_INFORMATION_NOT_ACTUAL_HARNESS', result: nativeStyleBaseline(d.bundle, i, m, spec.context) } });
  }
  if (c.old_revision) {
    const old = { ...inventory, revision: c.old_revision };
    observations.push({ variant: 'old-inventory-not-relabeled', input: { bundle: d.bundle, inventory: old, mapping: spec.mapping, context: spec.context },
      comparison: compareInventory(d.bundle, old, spec.mapping, spec.context),
      native_style_baseline: { kind: 'MODELED_SAME_INFORMATION_NOT_ACTUAL_HARNESS', result: nativeStyleBaseline(d.bundle, old, spec.mapping, spec.context) } });
  }
  const main = observations.filter(x => x.variant !== 'old-inventory-not-relabeled');
  const matches = main.every(o => o.comparison.comparison === c.expected.comparison &&
    o.comparison.comparison === o.native_style_baseline.result &&
    (!c.expected.excess || json(o.comparison.excess) === json(c.expected.excess)) &&
    (!c.expected.gaps || json(o.comparison.gaps) === json(c.expected.gaps))) &&
    observations.filter(o => o.variant === 'old-inventory-not-relabeled').every(o => o.comparison.comparison === 'UNKNOWN');
  return { observations, matches };
}

async function approvalCase(c) {
  const original = base();
  const subject = await describeTaskAction(...args(original));
  if (!subject.valid) throw Error('Original G1 fixture invalid: ' + json(subject.errors));
  const binding = fictionalDecision(subject.subject_digest);
  const observations = [];
  for (const variant of c.variants ?? ['main']) {
    const d = clone(original);
    if (c.mutation === 'payload') d.action.parameters.content_sha256 = 'sha256:' + 'b'.repeat(64);
    if (c.mutation === 'target') d.action.parameters.recipient = c.hidden_target;
    if (c.mutation === 'policy' && variant === 'bundle') d.bundle.policy_version += '-changed';
    if (c.mutation === 'policy' && variant === 'task') d.task.objective += ' Changed acceptance subject.';
    const result = await validateTaskActionBinding(...args(d), json(binding));
    observations.push({ variant, input: { ...d, binding }, result });
  }
  if (c.hidden_target) {
    // The actual target is deliberately absent from the API inputs: G1 cannot discover it.
    observations.push({ variant: 'hidden-resolution', input: { ...original, binding }, hidden_actual_target: c.hidden_target,
      resolution_coverage: 'UNKNOWN', result: await validateTaskActionBinding(...args(original), json(binding)) });
  }
  if (c.fictional_new_decision_supplied) {
    const repaired = observations[0].input;
    const repairedSubject = await describeTaskAction(...args(repaired));
    if (!repairedSubject.valid) throw Error('Repaired G1 fixture invalid');
    const explicitNewFictionalDecision = fictionalDecision(repairedSubject.subject_digest);
    observations.push({ variant: 'separate-new-fictional-decision', input: { bundle: repaired.bundle, task: repaired.task, action: repaired.action, binding: explicitNewFictionalDecision },
      result: await validateTaskActionBinding(...args(repaired), json(explicitNewFictionalDecision)) });
  }
  const primary = observations.filter(o => !['hidden-resolution','separate-new-fictional-decision'].includes(o.variant));
  const matches = primary.every(o => o.result.valid === c.expected.binding_valid &&
      (!c.expected.code || o.result.errors.some(e => e.code === c.expected.code))) &&
    observations.filter(o => o.variant === 'hidden-resolution').every(o => o.result.valid && o.resolution_coverage === 'UNKNOWN') &&
    observations.filter(o => o.variant === 'separate-new-fictional-decision').every(o => o.result.valid === c.expected.new_binding_valid);
  return { observations, matches };
}

/** Post-hoc, supplied-trace worksheet. Not a state machine or a retry authorization decision. */
export function inspectSuppliedTrace(packet) {
  const r = { conclusion: 'UNRESOLVED_MISSING_EVIDENCE', gaps: [], contradictions: [], ...scope() };
  const events = packet?.events;
  if (!Array.isArray(events) || !events.length) { r.gaps.push('EVENTS_MISSING'); return r; }
  if (events.some(e => !e || typeof e !== 'object' || Array.isArray(e) || typeof e.type !== 'string')) {
    r.contradictions.push('MALFORMED_EVENT');
    r.conclusion = 'CONTRADICTORY_OR_REPLAYED_EVIDENCE';
    return r;
  }
  const ids = new Set();
  const admitted = events.findIndex(e => e.type === 'admitted');
  const dispatch = events.findIndex(e => e.type === 'dispatch');
  const cancel = events.findIndex(e => e.type === 'cancelled');
  const approved = events.findIndex(e => e.type === 'approved');
  const receiver = events.filter(e => e.type === 'receiver');
  const response = events.findIndex(e => e.type === 'response');
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id)) r.contradictions.push('MISSING_OR_REPLAYED_EVENT_ID');
    ids.add(e?.id);
    if (e.type === 'receiver' && (!Number.isSafeInteger(e.count) || e.count < 0)) r.contradictions.push('INVALID_RECEIVER_COUNT');
  }
  const counts = [...new Set(receiver.map(e => e.count))];
  if (counts.length > 1) r.contradictions.push('CONFLICTING_RECEIVER_COUNTS');
  if (dispatch >= 0 && (admitted < 0 || admitted > dispatch)) r.contradictions.push('DISPATCH_WITHOUT_PRIOR_ADMISSION');
  if (cancel >= 0 && dispatch > cancel) r.contradictions.push('DISPATCH_AFTER_CANCELLATION');
  if (receiver.some(e => e.count > 0) && dispatch < 0) r.contradictions.push('RECEIVER_WITHOUT_DISPATCH_OBSERVATION');
  if (response >= 0 && (dispatch < 0 || response < dispatch)) r.contradictions.push('RESPONSE_WITHOUT_PRIOR_DISPATCH');
  if (packet.complete !== true) r.gaps.push('INCOMPLETE_TRACE');
  if (events.some(e => e.type === 'resume' && (!e.durable_consumption || !e.durable_result))) r.gaps.push('DURABLE_EVIDENCE_MISSING');
  if (r.contradictions.length) r.conclusion = 'CONTRADICTORY_OR_REPLAYED_EVIDENCE';
  else if (cancel >= 0 && approved > cancel && dispatch < 0) r.conclusion = 'CANCELLED_LATE_APPROVAL_NOT_AUTHORITY';
  else if (!r.gaps.length && dispatch < 0 && counts[0] === 0 && events.some(e => e.type === 'failed-before-dispatch') &&
      events.some(e => e.type === 'retry-requested' && !e.current_authority)) r.conclusion = 'NO_DISPATCH_RETRY_AUTHORITY_UNKNOWN';
  else if (!r.gaps.length && admitted >= 0 && dispatch > admitted && counts[0] === 1 && response > dispatch) r.conclusion = 'RECEIVED_AND_RESPONSE_RECORDED';
  else if (!r.gaps.length && admitted >= 0 && dispatch > admitted && counts[0] === 1 && response < 0) r.conclusion = 'RECEIVER_RECORDED_RESPONSE_UNKNOWN';
  return r;
}

async function evidenceCase(c) {
  const d = base(), subject = await describeTaskAction(...args(d));
  if (!subject.valid) throw Error('G3 fixture subject invalid');
  const event = (event_id, phase, actor_role_id, decision) => ({ event_id, phase, subject_digest: subject.subject_digest, actor_role_id, decision });
  // G3 sees lifecycle declarations only. Cancellation, chronology and consumption are not G3 semantics.
  const lifecycle = { schema_version: '0.4', run_id: 'fictional-run-1', subject_digest: subject.subject_digest, events: [
    event('review-1', 'review', 'reviewer', 'pass'), event('approval-1', 'approval', 'implementer', 'approved'),
  ] };
  if (c.events.some(e => e.type === 'response' && e.outcome === 'ok')) lifecycle.events.push(event('execution-1', 'execution', 'implementer', 'declared_success'));
  if (c.conflicting_artifact) {
    for (const [i, digest] of ['a','b'].entries()) lifecycle.events.push({ ...event('evidence-' + i, 'evidence', 'implementer', 'present'),
      artifacts: [{ artifact_id: 'fictional-receipt-1', sha256: 'sha256:' + digest.repeat(64), locator: 'https://example.invalid/receipt' }] });
  }
  const result = await validateTaskLifecycle(...args(d), json(lifecycle));
  const packet = { logical_operation: 'fictional-operation-1', attempt: 'fictional-attempt-1',
    observation_source: 'fixture-supplied', ordering_basis: 'array-order-supplied-not-authenticated',
    complete: c.complete, events: c.events };
  const worksheet = inspectSuppliedTrace(packet);
  const matches = worksheet.conclusion === c.expected.trace && result.valid === (c.expected.lifecycle_valid ?? true) &&
    (!c.expected.code || result.errors.some(e => e.code === c.expected.code));
  return { observations: [{ input: { ...d, lifecycle, packet }, result, worksheet }], matches };
}

export async function runCases(spec = read('experiments/outreach-fixtures/cases.json')) {
  const begun = performance.now();
  if (spec.profile !== 'outreach-fixtures/0.1' || !Array.isArray(spec.cases) || spec.cases.length !== 18 ||
      new Set(spec.cases.map(c => c.id)).size !== 18) throw Error('Frozen 18-case specification required');
  const results = [];
  for (const c of spec.cases) {
    const outcome = c.id.startsWith('PD-') ? await permissionCase(c, spec) : c.id.startsWith('AB-') ? await approvalCase(c) : await evidenceCase(c);
    results.push({ id: c.id, description: c.description, expected: c.expected, expectation_matched: outcome.matches, ...scope(), observations: outcome.observations });
  }
  let sourceHead = 'UNKNOWN';
  try { sourceHead = execFileSync('git', ['-C', fileURLToPath(root), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* Explicitly unknown outside a checkout. */ }
  const sourceFiles = ['experiments/outreach-fixtures/cases.json','experiments/outreach-fixtures/runner.mjs',
    'src/core.mjs','src/action-binding.mjs','src/task-lifecycle.mjs','examples/starter-bundle.json','examples/starter-task.json'];
  return { profile: spec.profile, classification: 'OFFLINE_SYNTHETIC_DECLARATIONS', source_base: spec.source_base,
    checkout_head: sourceHead, source_identity_basis: 'CHECKOUT_HEAD_PLUS_LISTED_FILE_HASHES', source_sha256: Object.fromEntries(sourceFiles.map(p => [p, sha(readFileSync(new URL(p, root)))])),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    summary: { cases: results.length, expectations_matched: results.filter(c => c.expectation_matched).length,
      expectations_failed: results.filter(c => !c.expectation_matched).length, runtime_cases_executed: 0,
      actual_native_harness_runs: 0, human_setup_minutes: null, human_maintenance_minutes: null,
      machine_elapsed_ms: Number((performance.now() - begun).toFixed(3)) },
    decision: 'KEEP_FIXTURES_ONLY_NO_INCREMENTAL_INTEGRATION_VALUE_SHOWN', ...scope(), results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runCases();
    console.log(json(report, null, 2));
    if (report.summary.expectations_failed) process.exitCode = 1;
  } catch (error) { console.error('FIXTURE_RUN_FAILED: ' + error.message); process.exitCode = 2; }
}
