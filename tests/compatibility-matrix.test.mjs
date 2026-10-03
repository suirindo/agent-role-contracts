import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guard the deliberately small workflow's literal include rows, without adding
// a YAML dependency to this dependency-free checker.
test('CI retains all four required compatibility jobs and their checks', () => {
  const workflow = readFileSync(new URL('../.github/workflows/core.yml', import.meta.url), 'utf8');
  const rows = [...workflow.matchAll(/^          - os: ([\w-]+)\r?\n            node: '([^']+)'$/gm)]
    .map(([, os, node]) => `${os}/${node}`);
  for (const required of ['ubuntu-latest/22.5.0', 'ubuntu-latest/24', 'macos-latest/22', 'windows-latest/22']) {
    assert.ok(rows.includes(required), `Missing compatibility job: ${required}`);
  }
  assert.match(workflow, /^    runs-on: \$\{\{ matrix\.os \}\}$/m);
  assert.match(workflow, /^          node-version: \$\{\{ matrix\.node \}\}$/m);
  for (const command of ['npm run check', 'node --test .github/release/*.test.mjs', 'npm run pack:smoke']) {
    assert.ok(workflow.includes(`      - run: ${command}`), `Missing matrix check: ${command}`);
  }
});
