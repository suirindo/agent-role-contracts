#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateCrewAIConfigMapping } from '../../src/crewai-adapter.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const crewText = read('./crew.jsonc');
const mappingText = read('./mapping.json');
const bundleText = read('../team.json');
const agents = Object.fromEntries(
  ['coordinator', 'implementer', 'reviewer'].map(id => [id, JSON.parse(read('./agents/' + id + '.jsonc'))]),
);
const agentsText = JSON.stringify(agents);
const run = crew => validateCrewAIConfigMapping(bundleText, JSON.stringify(crew), agentsText, mappingText);
const original = JSON.parse(crewText);

console.log('CrewAI adapter spike: existing ARC authority remains canonical.');
console.log('The adapter reads only explicit CrewAI config fields and executes no CrewAI runtime.');

const first = run(original);
if (!first.valid) throw new Error('Initial PASS failed: ' + JSON.stringify(first.errors));
console.log('\n1. Explicit CrewAI task pair matches ARC');
console.log('   output_file: ' + first.output_file);
console.log('   executor: ' + first.executor_agent + '; reviewer: ' + first.reviewer_agent);
console.log('   PASS: CrewAI config and ARC declarations agree.');

const changed = structuredClone(original);
changed.tasks.find(task => task.name === 'implement_change').output_file = 'secrets/production.txt';
const second = run(changed);
if (second.valid || !second.errors.some(error => error.code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY')) {
  throw new Error('Expected scope failure: ' + JSON.stringify(second.errors));
}
console.log('\n2. Change only CrewAI output_file');
console.log('   docs/example.md -> secrets/production.txt');
console.log('   FAIL (expected): TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY');

const repaired = structuredClone(changed);
repaired.tasks.find(task => task.name === 'implement_change').output_file = 'docs/example.md';
const third = run(repaired);
if (!third.valid) throw new Error('Repair PASS failed: ' + JSON.stringify(third.errors));
console.log('\n3. Repair the CrewAI config');
console.log('   secrets/production.txt -> docs/example.md');
console.log('   PASS: declarations are consistent again.');

console.log('\nDemo complete: PASS -> FAIL (expected) -> PASS.');
console.log('No CrewAI agent was started, no tool was invoked, and no output file was written.');
console.log('Reviewer identity and runtime enforcement remain outside this declaration check.');
