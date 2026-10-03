#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import * as core from '../../src/core.mjs';
import { scenarios, makeScenario } from '../cross-domain/scenarios.mjs';

const json = JSON.stringify;
const definitions = [
  { kind: 'software-change', parameters: { output: 'src/example.mjs', change: 'Handle empty input' } },
  { kind: 'data-cleaning', parameters: { input: 'data/sample.csv', output: 'reports/cleaned.csv', deduplicate: true } },
  { kind: 'support-drafting', parameters: { output: 'drafts/reply.md', ticket: 'fictional-ticket-001', send: false } },
];

try {
  for (const name of ['describeTaskAction', 'describeTaskLifecycle', 'validateTaskLifecycle']) {
    if (typeof core[name] !== 'function') throw new Error('Integration dependency: /core must export ' + name + '; this base does not include G3 core.');
  }
  const read = name => JSON.parse(readFileSync(new URL('../' + name + '.json', import.meta.url), 'utf8'));
  const templates = { bundle: read('team'), task: read('task'), handoff: read('handoff') };
  console.log('G3 lifecycle: fictional declarations; no actions executed or artifacts verified.');
  for (const [index, scenario] of scenarios.entries()) {
    const data = makeScenario(scenario, templates);
    data.action = { schema_version: '0.3', id: scenario.id + '-action-001', ...definitions[index] };
    const args = current => [json(current.bundle), json(current.task), json(current.action)];
    const subject = await core.describeTaskAction(...args(data));
    if (!subject.valid || !/^sha256:[0-9a-f]{64}$/.test(subject.subject_digest)) throw new Error('Could not describe G1 subject: ' + json(subject.errors));
    const route = data.bundle.routes.find(route => route.task_type === data.task.type);
    if (!route.require_human_approval || !route.reviewers.length || !route.executors.length) throw new Error('Expected routed review, execution and required accountable approval');
    const event = (event_id, phase, actor_role_id, decision) => ({ event_id, phase, subject_digest: subject.subject_digest, actor_role_id, decision });
    const lifecycle = {
      schema_version: '0.4', run_id: 'external-demo-' + scenario.id + '-001', subject_digest: subject.subject_digest,
      events: [
        event('review-001', 'review', route.reviewers[0], 'pass'),
        event('approval-001', 'approval', route.accountable, 'approved'),
        event('execution-001', 'execution', route.executors[0], 'declared_success'),
        { ...event('evidence-001', 'evidence', route.executors[0], 'present'), artifacts: [
          { artifact_id: scenario.id + '-output', sha256: 'sha256:' + 'a'.repeat(64), locator: 'https://example.invalid/artifacts/' + scenario.id },
        ] },
      ],
    };
    const description = await core.describeTaskLifecycle(...args(data), json(lifecycle));
    if (!description.valid || description.lifecycle_profile !== 'task-lifecycle/0.4') throw new Error('Expected lifecycle description: ' + json(description.errors));
    const accepted = await core.validateTaskLifecycle(...args(data), json(lifecycle));
    if (!accepted.valid || accepted.artifact_identity_consistent !== true) throw new Error('Expected lifecycle PASS: ' + json(accepted.errors));
    for (const field of ['execution_authorized', 'runtime_enforcement', 'actor_identity_verified', 'review_verified', 'approval_verified', 'execution_verified', 'artifact_bytes_verified', 'artifact_locator_resolved', 'runtime_acceptance_verified', 'replay_protection_enforced', 'event_authenticity_verified']) {
      if (accepted[field] !== false) throw new Error('Expected false limitation: ' + field);
    }
    let rejected;
    if (index === 1) {
      const conflicting = structuredClone(lifecycle);
      conflicting.events.push({ ...event('evidence-002', 'evidence', route.reviewers[0], 'present'), artifacts: [
        { ...lifecycle.events[3].artifacts[0], sha256: 'sha256:' + 'b'.repeat(64) },
      ] });
      rejected = await core.validateTaskLifecycle(...args(data), json(conflicting));
      if (rejected.valid || !rejected.errors.some(error => error.code === 'G3_ARTIFACT_DIGEST_CONFLICT')) throw new Error('Expected artifact identity conflict: ' + json(rejected.errors));
    } else {
      const changed = structuredClone(data);
      if (index === 0) changed.action.parameters.change = 'Handle malformed input';
      else changed.task.inputs.test_plan = 'Review factual accuracy and tone';
      const changedSubject = await core.describeTaskAction(...args(changed));
      if (!changedSubject.valid || changedSubject.subject_digest === subject.subject_digest) throw new Error('Mutation must remain valid and change G1 subject');
      rejected = await core.validateTaskLifecycle(...args(changed), json(lifecycle));
      if (rejected.valid || !rejected.errors.some(error => error.code === 'G3_SUBJECT_MISMATCH')) throw new Error('Expected stale subject rejection: ' + json(rejected.errors));
    }
    console.log('\n' + scenario.title + '\n  PASS: lifecycle declarations consistent.\n  FAIL (expected): ' + rejected.errors.map(error => error.code).join(', '));
  }
  console.log('\nSix expected outcomes verified. No locator fetch, identity/review/approval verification or replay protection.');
} catch (error) {
  console.error('DEMO_ERROR: ' + error.message);
  process.exitCode = 2;
}
