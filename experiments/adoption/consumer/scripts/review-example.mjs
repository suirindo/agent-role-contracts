#!/usr/bin/env node
// A declared-role exercise, not proof that two independent people or agents reviewed work.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

try {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/review-example.mjs');
  const { VERSION, explainTask } = await import('@netsujo/agent-role-contracts/core');
  assert.equal(VERSION, '1.0.0', 'Install the locked public 1.0.0 consumer dependency.');
  const entry = import.meta.resolve('@netsujo/agent-role-contracts/core');
  const read = (name) => readFileSync(new URL('../examples/' + name, entry), 'utf8');
  const originalBundle = read('starter-bundle.json'), task = read('starter-task.json');
  const bundle = JSON.parse(originalBundle), route = bundle.routes[0];
  const originalReviewers = [...route.reviewers];
  const check = (name, expected) => {
    const report = explainTask(JSON.stringify(bundle), task);
    assert.equal(report.version, '1.0.0');
    assert.equal(report.valid, expected.length === 0);
    assert.equal(report.execution_authorized, false);
    assert.equal(report.runtime_enforcement, false);
    assert.equal(report.identity_verified, false);
    assert.deepEqual(report.errors.map(({ code, path }) => ({ code, path })), expected);
    return { name, declared_reviewers: [...route.reviewers], report };
  };
  const steps = [check('separate-declared-reviewer', [])];
  route.reviewers = [route.executors[0]];
  steps.push(check('same-role-reviewer', [
    { code: 'REVIEWER_NOT_READ_ONLY', path: 'bundle/routes/0' },
    { code: 'SELF_REVIEW_DECLARED', path: 'bundle/routes/0' },
  ]));
  route.reviewers = originalReviewers;
  steps.push(check('restored-declared-reviewer', []));
  assert.deepEqual(bundle, JSON.parse(originalBundle));
  console.log(JSON.stringify({ example: 'declared-review', version: VERSION, fixture_only: true, steps }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ example: 'declared-review', error: 'REVIEW_EXAMPLE_ERROR', message: error.message }));
  process.exitCode = 2;
}
