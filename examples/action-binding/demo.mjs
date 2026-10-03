#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import * as core from '../../src/core.mjs';
import { scenarios, makeScenario } from '../cross-domain/scenarios.mjs';

const json = JSON.stringify;
const definitions = [
  { kind: 'software-change', parameters: { output: 'src/example.mjs', change: 'Handle empty input', test_plan: 'Check empty and populated inputs' }, mutate: data => { data.action.parameters.change = 'Handle malformed input'; } },
  { kind: 'data-cleaning', parameters: { input: 'data/sample.csv', output: 'reports/cleaned.csv', deduplicate: true, missing_value: null }, mutate: data => { data.action.parameters.deduplicate = false; } },
  { kind: 'support-drafting', parameters: { output: 'drafts/reply.md', ticket: 'fictional-ticket-001', tone: 'neutral', send: false }, mutate: data => { data.task.inputs.test_plan = 'Review the draft for factual accuracy and tone'; } },
];

function checkLimitations(result) {
  for (const field of ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified', 'subject_authenticated', 'review_authenticated', 'human_approval_authenticated', 'action_executed', 'replay_protection_enforced']) {
    if (result[field] !== false) throw new Error('Expected false limitation: ' + field);
  }
}

try {
  console.log('G1 task/action binding: three non-financial declaration examples.');
  console.log('This demo executes no action and authenticates no reviewer or approver.');
  const read = name => JSON.parse(readFileSync(new URL('../' + name + '.json', import.meta.url), 'utf8'));
  const templates = { bundle: read('team'), task: read('task'), handoff: read('handoff') };
  for (const [index, scenario] of scenarios.entries()) {
    const definition = definitions[index];
    const data = makeScenario(scenario, templates);
    data.action = { schema_version: '0.3', id: scenario.id + '-action-001', kind: definition.kind, parameters: definition.parameters };
    const describe = current => core.describeTaskAction(json(current.bundle), json(current.task), json(current.action));
    const validate = current => core.validateTaskActionBinding(json(current.bundle), json(current.task), json(current.action), json(binding));
    const subject = await describe(data);
    checkLimitations(subject);
    if (!subject.valid || subject.binding_profile !== 'task-action/0.3' || !/^sha256:[0-9a-f]{64}$/.test(subject.subject_digest)) throw new Error('Could not describe ' + scenario.id + ': ' + json(subject.errors));
    const route = data.bundle.routes.find(route => route.task_type === data.task.type);
    if (!route.require_human_approval || !route.reviewers.length) throw new Error('Fixture must require routed review and accountable approval');
    const binding = {
      schema_version: '0.3', subject_digest: subject.subject_digest,
      reviews: [{ subject_digest: subject.subject_digest, role_id: route.reviewers[0], decision: 'pass' }],
      human_approval: { subject_digest: subject.subject_digest, role_id: route.accountable, decision: 'approved' },
    };
    const accepted = await validate(data);
    checkLimitations(accepted);
    if (!accepted.valid || accepted.binding_matches_subject !== true) throw new Error('Expected PASS for ' + scenario.id + ': ' + json(accepted.errors));
    const changed = structuredClone(data);
    definition.mutate(changed);
    const changedSubject = await describe(changed);
    checkLimitations(changedSubject);
    if (!changedSubject.valid || changedSubject.subject_digest === subject.subject_digest) throw new Error('Mutation must remain valid and change the digest');
    const stale = await validate(changed); // Keep the original binding; never invent refreshed approval.
    checkLimitations(stale);
    if (stale.valid || stale.binding_matches_subject !== false || !stale.errors.some(error => error.code === 'G1_SUBJECT_MISMATCH')) throw new Error('Expected stale subject failure for ' + scenario.id);
    console.log('\n' + scenario.title + '\n  PASS: routed review and accountable approval match the subject.\n  FAIL (expected): G1_SUBJECT_MISMATCH after changing ' + (index === 2 ? 'task input test_plan.' : 'action parameter ' + (index === 0 ? 'change.' : 'deduplicate.')));
  }
  console.log('\nSix expected binding outcomes verified. Parameters are declarations only; artifact paths are not immutable evidence.');
} catch (error) {
  console.error('DEMO_ERROR: ' + error.message);
  process.exitCode = 2;
}
