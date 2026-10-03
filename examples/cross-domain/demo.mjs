import { readFileSync } from 'node:fs';
import { scenarios, makeScenario, evaluateScenario } from './scenarios.mjs';

try {
  const read = name => JSON.parse(readFileSync(new URL('../' + name + '.json', import.meta.url), 'utf8'));
  const templates = { bundle: read('team'), task: read('task'), handoff: read('handoff') };
  console.log('Agent Role Contracts: one core, three non-financial task examples.');
  for (const definition of scenarios) {
    console.log('\n' + definition.title);
    for (const { name, expected, result } of evaluateScenario(makeScenario(definition, templates))) {
      const matches = expected === 'PASS' ? result.valid : !result.valid && result.errors.some(error => error.code === expected);
      if (!matches || result.execution_authorized !== false || result.runtime_enforcement !== false) throw new Error('Unexpected result for ' + definition.id + ': ' + name);
      console.log('  ' + name + ': ' + (result.valid ? 'PASS' : 'FAIL (expected): ' + expected));
    }
  }
  console.log('\n18 expected outcomes verified using the same v0.1 core schemas.');
  console.log('No tasks executed, no messages sent, no source or output files verified.');
} catch (error) {
  console.error('DEMO_ERROR: ' + error.message);
  process.exitCode = 2;
}
