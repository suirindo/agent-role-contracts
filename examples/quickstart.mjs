import { readFileSync } from 'node:fs';
import { validateBundle, explainTask } from '../src/index.mjs';

// Use the shipped fixtures and the real checker. Only the repaired task's JSON
// changes in memory; no task scope is opened and no agent is started.
function readExample(name) {
  try {
    return readFileSync(new URL(name, import.meta.url), 'utf8');
  } catch (error) {
    throw new Error(`Cannot read examples/${name} (${error.code}). Restore the bundled examples and rerun the demo.`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function checkBoundary(result) {
  expect(result.execution_authorized === false && result.runtime_enforcement === false,
    'A declaration check must not authorize execution or claim runtime enforcement.');
}

function diagnostics(result) {
  return result.errors.map(error => error.code).join(', ') || 'PASS';
}

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  expect(major > 22 || (major === 22 && minor >= 5),
    `Node.js 22.5 or newer is required (found ${process.versions.node}). Upgrade Node.js and rerun npm run demo.`);

  const bundle = readExample('starter-bundle.json');
  const bundleResult = validateBundle(bundle);
  checkBoundary(bundleResult);
  expect(bundleResult.valid, `The starter bundle must be valid: ${diagnostics(bundleResult)}.`);

  const normalText = readExample('starter-task.json');
  const normal = explainTask(bundle, normalText);
  checkBoundary(normal);
  expect(normal.valid, `The normal task must PASS: ${diagnostics(normal)}.`);
  expect(normal.executors.length === 1 && normal.reviewers.length === 1 &&
    normal.executors[0] !== normal.reviewers[0], 'The starter must declare separate implementer and reviewer roles.');
  const implementer = normal.roles.find(role => role.id === normal.executors[0]);
  const reviewer = normal.roles.find(role => role.id === normal.reviewers[0]);
  expect(implementer.authority_mode === 'write_scoped' && reviewer.authority_mode === 'read_only',
    'The starter needs a write-scoped implementer and read-only reviewer.');

  const outsideText = readExample('starter-task-outside-scope.json');
  const outside = explainTask(bundle, outsideText);
  checkBoundary(outside);
  expect(!outside.valid && outside.errors.length === 1 &&
    outside.errors[0].code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY',
    `The out-of-scope task must fail with TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY: ${diagnostics(outside)}.`);

  const normalTask = JSON.parse(normalText);
  const repairedTask = JSON.parse(outsideText);
  const outsideScope = repairedTask.inputs.scope;
  repairedTask.inputs.scope = normalTask.inputs.scope;
  const repaired = explainTask(bundle, JSON.stringify(repairedTask));
  checkBoundary(repaired);
  expect(repaired.valid, `Restoring the task scope must PASS: ${diagnostics(repaired)}.`);

  console.log(`Agent Role Contracts: check a task before handing it to an agent.

1. Normal task
   Scope: ${normalTask.inputs.scope}; allowed: ${implementer.allowed_write_scopes.join(', ')}
   PASS: declarations are consistent.
   Implementer: ${implementer.id} (${implementer.authority_mode})
   Reviewer: ${reviewer.id} (${reviewer.authority_mode}; separate declared role)

2. Request an out-of-scope change
   Scope: ${outsideScope}; allowed: ${implementer.allowed_write_scopes.join(', ')}
   FAIL (expected): ${outside.errors[0].code}

3. Repair the task scope
   Scope: ${outsideScope} -> ${repairedTask.inputs.scope}
   PASS: declarations are consistent again.

Demo complete: PASS -> FAIL (expected) -> PASS.
Checks declarations only; execution is NOT authorized.
Next: docs/QUICKSTART.md (change the scope and rerun the checker).`);
} catch (error) {
  console.error(`DEMO_ERROR: ${error.message}`);
  process.exitCode = 2;
}
