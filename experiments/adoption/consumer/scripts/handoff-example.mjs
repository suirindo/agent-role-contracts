#!/usr/bin/env node
// Shipped fictional fixtures only. Changes stay in memory; no task is executed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

try {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/handoff-example.mjs');
  const { VERSION, validateHandoff } = await import('@netsujo/agent-role-contracts/core');
  assert.equal(VERSION, '1.0.0', 'Install the locked public 1.0.0 consumer dependency.');
  const entry = import.meta.resolve('@netsujo/agent-role-contracts/core');
  const read = (name) => readFileSync(new URL('../examples/' + name, entry), 'utf8');
  const bundle = read('team.json'), originalTask = read('task.json'), nextTaskText = read('code-task.json');
  const handoffText = read('handoff.json'), original = JSON.parse(originalTask), next = JSON.parse(nextTaskText);
  assert.notEqual(original.id, next.id);
  assert.notEqual(original.objective, next.objective);
  const check = (name, task, handoff, expected) => {
    const report = validateHandoff(bundle, task, handoff);
    assert.equal(report.version, '1.0.0');
    assert.equal(report.valid, expected.length === 0);
    assert.equal(report.execution_authorized, false);
    assert.equal(report.runtime_enforcement, false);
    assert.equal(report.evidence_verified, false);
    assert.deepEqual(report.errors.map(({ code, path }) => ({ code, path })), expected);
    return { name, report };
  };
  const steps = [check('original-task', originalTask, handoffText, [])];
  steps.push(check('different-task', nextTaskText, handoffText, [
    { code: 'HANDOFF_OBJECTIVE_MISMATCH', path: 'handoff/objective' },
    { code: 'HANDOFF_TASK_MISMATCH', path: 'handoff/task_id' },
  ]));
  const repaired = JSON.parse(handoffText);
  repaired.task_id = next.id;
  repaired.objective = next.objective;
  steps.push(check('repaired-binding', nextTaskText, JSON.stringify(repaired), []));
  console.log(JSON.stringify({ example: 'handoff', version: VERSION, fixture_only: true,
    original_task: { id: original.id, objective: original.objective },
    next_task: { id: next.id, objective: next.objective }, steps }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ example: 'handoff', error: 'HANDOFF_EXAMPLE_ERROR', message: error.message }));
  process.exitCode = 2;
}
