#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { describeTaskAction } from '../../src/core.mjs';
import { scenarios, makeScenario } from '../cross-domain/scenarios.mjs';

const json = JSON.stringify;
const fictionalDigest = character => 'sha256:' + character.repeat(64);

function checkLimitations(result) {
  for (const field of ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified', 'adapter_authenticated', 'subject_authenticated', 'review_authenticated', 'human_approval_authenticated', 'content_bytes_verified', 'filesystem_state_verified', 'path_exists_verified', 'write_permission_enforced', 'action_executed', 'replay_protection_enforced']) {
    if (result[field] !== false) throw new Error('Expected false limitation: ' + field);
  }
  if (result.adapter_profile !== 'filesystem-write/0.1') throw new Error('Unexpected adapter profile');
}

try {
  const { validateFilesystemWriteMapping } = await import('../../src/filesystem-write-adapter.mjs');
  const read = name => JSON.parse(readFileSync(new URL('../' + name + '.json', import.meta.url), 'utf8'));
  const templates = { bundle: read('team'), task: read('task'), handoff: read('handoff') };
  console.log('G2 filesystem-write mapping: three non-financial declaration examples.');
  for (const [index, scenario] of scenarios.entries()) {
    const { bundle, task } = makeScenario(scenario, templates);
    const action = {
      schema_version: '0.3', id: scenario.id + '-write-001', kind: 'filesystem-write',
      parameters: { path: scenario.scope, content_sha256: fictionalDigest(String(index + 1)) },
    };
    const subject = await describeTaskAction(json(bundle), json(task), json(action));
    if (!subject.valid || subject.binding_profile !== 'task-action/0.3' || !/^sha256:[0-9a-f]{64}$/.test(subject.subject_digest)) {
      throw new Error('Could not describe ' + scenario.id + ': ' + json(subject.errors));
    }
    const mapping = {
      schema_version: '0.1', subject_digest: subject.subject_digest, operation: 'write_file',
      path: action.parameters.path, content_sha256: action.parameters.content_sha256,
    };
    const validate = current => validateFilesystemWriteMapping(json(bundle), json(task), json(action), json(current));
    const accepted = await validate(mapping);
    checkLimitations(accepted);
    if (!accepted.valid || accepted.mapping_matches_action !== true) throw new Error('Expected mapping PASS for ' + scenario.id + ': ' + json(accepted.errors));
    const changed = structuredClone(mapping);
    // Keep the task, action and G1 subject unchanged; only corrupt the mapping.
    const expected = index === 1 ? 'G2_CONTENT_MISMATCH' : 'G2_PATH_MISMATCH';
    if (index === 1) changed.content_sha256 = fictionalDigest('f');
    else changed.path = 'private/not-assigned.txt';
    const rejected = await validate(changed);
    checkLimitations(rejected);
    if (rejected.valid || rejected.mapping_matches_action !== false || !rejected.errors.some(error => error.code === expected)) {
      throw new Error('Expected ' + expected + ' for ' + scenario.id + ': ' + json(rejected.errors));
    }
    if (index !== 1 && !rejected.errors.some(error => error.code === 'G2_TASK_SCOPE')) throw new Error('Expected G2_TASK_SCOPE for ' + scenario.id);
    console.log('\n' + scenario.title + '\n  Declared path: ' + mapping.path + '\n  PASS: write_file mapping matches the task/action.\n  FAIL (expected): ' + expected);
  }
  console.log('\nSix expected mapping outcomes verified.');
  console.log('No filesystem write occurred. Content digests are fictional; bytes were not verified.');
  console.log('No filesystem state or path existence was checked. Executor identity was not authenticated; permissions were not enforced.');
  console.log('G1 review/approval binding is separate; mapping PASS grants no permission, execution or review approval.');
} catch (error) {
  console.error('DEMO_ERROR: ' + error.message);
  process.exitCode = 2;
}
