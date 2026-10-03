import { validateBundle, explainTask, validateHandoff } from '../../src/core.mjs';

// Fictional artifact-producing tasks, not real code/data/support execution.
export const scenarios = Object.freeze([
  { id: 'software-change', title: 'Software development', scope: 'src/example.mjs', allowed: 'src/**', kind: 'code', objective: 'Propose a reviewed change to one source file.' },
  { id: 'data-cleaning', title: 'Data processing', scope: 'reports/cleaned.csv', allowed: 'reports/**', kind: 'data', objective: 'Prepare a cleaned report without editing the input dataset.' },
  { id: 'support-draft', title: 'Customer support drafting', scope: 'drafts/reply.md', allowed: 'drafts/**', kind: 'text', objective: 'Draft a response for review without sending a customer message.' },
]);

export function makeScenario(definition, templates) {
  const bundle = structuredClone(templates.bundle);
  const task = structuredClone(templates.task);
  const handoff = structuredClone(templates.handoff);
  bundle.routes = [{ ...bundle.routes[0], task_type: definition.id }];
  bundle.roles.find(({ contract }) => contract.id === 'implementer').contract.authority.allowed_write_scopes = [definition.allowed];
  task.id = definition.id + '-001';
  task.type = definition.id;
  task.objective = definition.objective;
  task.inputs = { scope: definition.scope, change_kind: definition.kind, test_plan: 'A separate reviewer checks the declared output.' };
  handoff.task_id = task.id;
  handoff.objective = task.objective;
  handoff.evidence = [{ file: definition.scope, result: 'Fictional declaration; output bytes were not read or verified.' }];
  return { bundle, task, handoff };
}

export function evaluateScenario(data) {
  const json = JSON.stringify;
  const bundle = json(data.bundle), task = json(data.task);
  const outside = structuredClone(data.task);
  outside.inputs.scope = 'private/not-assigned.txt';
  const selfReview = structuredClone(data.bundle);
  selfReview.routes[0].reviewers = ['implementer'];
  const missing = structuredClone(data.task);
  delete missing.inputs.scope;
  const wrongHandoff = structuredClone(data.handoff);
  wrongHandoff.task_id = 'different-task';
  return [
    { name: 'assigned task', expected: 'PASS', result: explainTask(bundle, task) },
    { name: 'outside scope', expected: 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY', result: explainTask(bundle, json(outside)) },
    { name: 'self-review', expected: 'SELF_REVIEW_DECLARED', result: validateBundle(json(selfReview)) },
    { name: 'missing required input', expected: 'TASK_INPUT_REQUIRED', result: explainTask(bundle, json(missing)) },
    { name: 'wrong-task handoff', expected: 'HANDOFF_TASK_MISMATCH', result: validateHandoff(bundle, task, json(wrongHandoff)) },
    { name: 'correct review handoff', expected: 'PASS', result: validateHandoff(bundle, task, json(data.handoff)) },
  ];
}
