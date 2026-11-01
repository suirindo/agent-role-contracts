#!/usr/bin/env node
// Consumer I/O surrounds the public JSON-text API; neither layer executes a task.
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';

try {
  const { VERSION, MAX_INPUT_BYTES, validateBundle, explainTask } = await import('@netsujo/agent-role-contracts/core');
  assert.equal(VERSION, '1.0.0', 'Install the locked public 1.0.0 consumer dependency.');
  const args = process.argv.slice(2);
  if (![0, 2].includes(args.length)) throw new Error('Usage: node scripts/api-example.mjs [bundle.json task.json]');
  const [bundlePath, taskPath] = args.length ? args : ['.arc/bundle.json', '.arc/task.json'];
  const read = (path) => {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error('Each input must be a regular file of at most ' + MAX_INPUT_BYTES + ' bytes.');
    return readFileSync(path, 'utf8');
  };
  const bundleText = read(bundlePath), taskText = read(taskPath);
  const bundle = validateBundle(bundleText);
  const task = bundle.valid ? explainTask(bundleText, taskText) : null;
  for (const report of [bundle, task].filter(Boolean)) {
    assert.equal(report.version, '1.0.0');
    assert.equal(report.execution_authorized, false);
    assert.equal(report.runtime_enforcement, false);
  }
  const valid = bundle.valid && task.valid;
  console.log(JSON.stringify({ example: 'api-consumer', version: VERSION, valid, bundle, task }, null, 2));
  process.exitCode = valid ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ example: 'api-consumer', error: 'API_EXAMPLE_ERROR', message: error.message }));
  process.exitCode = 2;
}
