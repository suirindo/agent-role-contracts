import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCrewAIConfigMapping as validate } from '../src/crewai-adapter.mjs';

const read = path => readFileSync(new URL('../examples/crewai-adapter-spike/' + path, import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../examples/team.json', import.meta.url), 'utf8');
const mapping = read('mapping.json');
const freshCrew = () => JSON.parse(read('crew.jsonc'));
const freshAgents = () => Object.fromEntries(
  ['coordinator', 'implementer', 'reviewer'].map(id => [id, JSON.parse(read('agents/' + id + '.jsonc'))]),
);
const run = (crew = freshCrew(), agents = freshAgents(), map = JSON.parse(mapping)) =>
  validate(bundle, JSON.stringify(crew), JSON.stringify(agents), JSON.stringify(map));

test('CrewAI explicit config maps to existing ARC route and PASSes', () => {
  const result = run();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.adapter_profile, 'crewai-config/0.1-spike');
  assert.equal(result.framework, 'CrewAI');
  assert.equal(result.executor_agent, 'implementer');
  assert.equal(result.reviewer_agent, 'reviewer');
  assert.equal(result.accountable_agent, 'coordinator');
  assert.equal(result.output_file, 'docs/example.md');
  assert.equal(result.project_coverage_complete, true);
  assert.equal(result.crewai_runtime_loaded, false);
  assert.equal(result.framework_config_executed, false);
  assert.equal(result.output_file_written, false);
});

test('PASS -> output_file scope drift FAIL -> repair PASS', () => {
  const crew = freshCrew();
  assert.equal(run(crew).valid, true);

  crew.tasks.find(task => task.name === 'implement_change').output_file = 'secrets/production.txt';
  const failed = run(crew);
  assert.equal(failed.valid, false);
  assert.ok(failed.errors.some(error => error.code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'), JSON.stringify(failed.errors));

  crew.tasks.find(task => task.name === 'implement_change').output_file = 'docs/example.md';
  assert.equal(run(crew).valid, true);
});

test('fails closed on collapsed implementation and review roles', () => {
  const crew = freshCrew();
  crew.tasks.find(task => task.name === 'review_change').agent = 'implementer';
  const result = run(crew);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'CREWAI_REVIEW_NOT_INDEPENDENT'));
});

test('fails closed when review context does not bind implementation task', () => {
  const crew = freshCrew();
  crew.tasks.find(task => task.name === 'review_change').context = [];
  const result = run(crew);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'CREWAI_REVIEW_CONTEXT_MISSING'));
});

test('fails closed on review writes, tool semantics, delegation, and directory creation', () => {
  {
    const crew = freshCrew();
    crew.tasks.find(task => task.name === 'review_change').output_file = 'docs/review.md';
    assert.ok(run(crew).errors.some(error => error.code === 'CREWAI_REVIEW_WRITES_OUTPUT'));
  }
  {
    const agents = freshAgents();
    agents.implementer.tools = ['custom:writer'];
    assert.ok(run(freshCrew(), agents).errors.some(error => error.code === 'CREWAI_TOOLS_UNMAPPED'));
  }
  {
    const agents = freshAgents();
    agents.implementer.settings.allow_delegation = true;
    assert.ok(run(freshCrew(), agents).errors.some(error => error.code === 'CREWAI_DELEGATION_UNMAPPED'));
  }
  {
    const crew = freshCrew();
    crew.tasks.find(task => task.name === 'implement_change').create_directory = true;
    assert.ok(run(crew).errors.some(error => error.code === 'CREWAI_DIRECTORY_CREATION_UNMAPPED'));
  }
});

test('fails closed when CrewAI assignment disagrees with ARC route', () => {
  const crew = freshCrew();
  crew.tasks.find(task => task.name === 'implement_change').agent = 'coordinator';
  const result = run(crew);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'CREWAI_EXECUTOR_ROUTE_MISMATCH'), JSON.stringify(result.errors));
});

test('requires complete bounded project coverage', () => {
  const crew = freshCrew();
  crew.tasks.push({
    name: 'extra_task',
    description: 'Extra unmapped task.',
    expected_output: 'Anything.',
    agent: 'coordinator',
  });
  const result = run(crew);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'CREWAI_PROJECT_COVERAGE_INCOMPLETE'));
});

test('strict JSON text rejects duplicate keys and executable objects', () => {
  const agents = JSON.stringify(freshAgents());
  const badCrew = '{"name":"x","name":"y","agents":[],"tasks":[],"process":"sequential"}';
  const duplicate = validate(bundle, badCrew, agents, mapping);
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.errors[0].code, 'JSON_INVALID');

  const objectInput = validate(bundle, freshCrew(), agents, mapping);
  assert.equal(objectInput.valid, false);
  assert.equal(objectInput.errors[0].code, 'INPUT_NOT_JSON_TEXT');
});

test('adapter has no implicit node I/O or CrewAI/runtime import', () => {
  const source = readFileSync(new URL('../src/crewai-adapter.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:|\bfetch\s*\(|\bprocess\s*\.|\bimport\s*\(|from ['"]crewai|from ['"]yaml/i);
});
