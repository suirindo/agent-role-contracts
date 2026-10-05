import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonRejectDuplicateKeys } from '../src/strict-json.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('strict parser default diagnostic is runtime-neutral', () => {
  assert.throws(
    () => parseJsonRejectDuplicateKeys('{'),
    error => error?.message === 'JSON_INVALID'
  );
});

test('public candidate surface has no known internal QC diagnostic prefix', () => {
  const files = [];
  const walk = path => {
    for (const name of readdirSync(path)) {
      const file = join(path, name);
      if (statSync(file).isDirectory()) walk(file);
      else files.push(file);
    }
  };

  for (const directory of ['src', 'bin', 'docs', 'examples', 'schemas']) walk(join(root, directory));
  files.push(join(root, 'README.md'), join(root, 'README.ja.md'));

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.equal(text.includes('CLAUDE_'+'QC_'), false, file);
    for (const marker of ['agent-os'+'-core','0.1.0-'+'preparation.','example.invalid/'+'agent-os-core']) assert.equal(text.includes(marker), false, file);
  }
});

test('G3 public candidate exports and schema totals remain additive', async () => {
  const core = await import('../src/core.mjs');
  const root = await import('../src/index.mjs');
  const { default: schemas } = await import('../src/schemas.generated.mjs');
  for (const name of ['describeTaskLifecycle', 'validateTaskLifecycle']) {
    assert.equal(typeof core[name], 'function');
    assert.equal(root[name], core[name]);
  }
  assert.equal(core.VERSION, '0.5.0');
  assert.equal(Object.keys(schemas).length, 12);
  assert.equal(schemas['task-lifecycle'].properties.schema_version.const, '0.4');
});
